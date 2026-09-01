/**
 * 滚动续纲：启动包（前 startupChapterCount 章细纲）用尽后，按批次为后续章节
 * 补写章级蓝图（CBN/CPNs/CEN/mustCover），让 51 章之后的续写仍有章级合同。
 *
 * 与开书补全（outline-completer）的关键差异：
 * - 上下文基底不是原始大纲 rawText，而是「已写状态」：最近章节的收束状态、
 *   活跃伏笔、卷纲锚点——新批次承接的是真实发生过的事实，而非开书时的猜测
 * - 轻量门禁：只查章级字段可用性（标题/CBN/CEN/CPNs/mustCover），不查
 *   启动包的整本门槛（开场钩、角色数等对新批次无意义）
 * - 只落最长连续有效前缀：位置兜底匹配（第 N 个 chapter 节点 = 第 N 章）
 *   要求节点序列无空洞，中间缺章时在缺口处截断，缺口留给下一轮
 */

import type { Chapter, PlotNode, Project } from '@/types/project';
import type { ChapterBlueprint } from '../types/executable-outline';
import {
  CHAPTER_BLUEPRINT_BATCH_SIZE,
  extractRequestedChapterBlocks,
  sanitizeBlueprintLengths,
} from '../generators/outline-completer';
import { sanitizeHookText } from '../parser/expanded-outline-parser';
import { OUTLINE_COMPLETENESS_POLICY } from '../validation/outlineCompleteness';
import {
  isCrossChapterGoal,
  isHollowChapterHook,
  isReaderMetaText,
  normalizeChapterBlueprint,
} from '@/services/story-runtime/chapterBlueprintNormalize';
import { collectCharacterFates } from '@/services/writing/extract-plot-memory';
import { normalizedSimilarityKeepingNumbers } from '@/utils/text-similarity';
import { readPositiveIntEnv } from '@/utils/env';

/** 细纲跑道低于该值时触发滚动补充；MOLIU_OUTLINE_ROLL_THRESHOLD 覆盖 */
export const OUTLINE_ROLL_RUNWAY_THRESHOLD = readPositiveIntEnv('MOLIU_OUTLINE_ROLL_THRESHOLD') ?? 10;

/** 每轮滚动补充的目标章数；MOLIU_OUTLINE_ROLL_BATCH 覆盖 */
export const OUTLINE_ROLL_BATCH_CHAPTERS = readPositiveIntEnv('MOLIU_OUTLINE_ROLL_BATCH') ?? 50;

/** 状态基底里回看最近多少章的收束状态 */
const STATE_WINDOW_CHAPTERS = 8;

const PLACEHOLDER_TITLE_RE = /^第[一二三四五六七八九十百千零\d]+章(?:\s*[（(]?未命名[)）]?)?$/u;

export interface OutlineRunwayState {
  /** chapter 型 plot 节点数 = 细纲槽位数 */
  chapterNodeCount: number;
  /** 已存在的章节数（含空章） */
  existingChapters: number;
  /** 已写出正文的章节数 */
  writtenThrough: number;
  /**
   * 细纲跑道：还有多少章「有细纲、尚未写」。
   * 注意分母是 writtenThrough 而不是 existingChapters——大纲应用时全部空章就已建好，
   * 若用章节总数，批量开跑首章后就跑道归零提前触发滚动，状态基底只剩 1 章 digest，
   * 51+ 蓝图等于对着开书状态规划（滚动相对一次性规划的核心优势落空）。
   */
  runway: number;
}

export function computeOutlineRunway(chapters: Chapter[], plotOutline: PlotNode[]): OutlineRunwayState {
  const chapterNodeCount = plotOutline.filter(node => node?.type === 'chapter').length;
  const existingChapters = chapters.length;
  const writtenThrough = chapters.filter(
    chapter => chapter.content && chapter.content.trim().length > 0,
  ).length;
  return {
    chapterNodeCount,
    existingChapters,
    writtenThrough,
    runway: chapterNodeCount - writtenThrough,
  };
}

/** 单批生成章数上限：与开书补全共用（批越大越容易踩网关输出上限） */
export { CHAPTER_BLUEPRINT_BATCH_SIZE };

// ============================================
// 上下文基底（prompt 的「已写状态」部分）
// ============================================

interface WrittenChapterDigest {
  chapterNumber: number;
  title: string;
  endingState: string;
}

function chapterNodesSorted(plotOutline: PlotNode[]): PlotNode[] {
  return plotOutline
    .filter(node => node?.type === 'chapter')
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
}

/** 最近 N 章的收束状态：优先 plot 节点 CEN，退正文尾部，再退 plotSummary */
export function buildWrittenChapterDigests(
  chapters: Chapter[],
  plotOutline: PlotNode[],
  windowSize: number = STATE_WINDOW_CHAPTERS,
): WrittenChapterDigest[] {
  const nodes = chapterNodesSorted(plotOutline);
  const recent = chapters
    .map((chapter, index) => ({ chapter, index }))
    .filter(({ chapter }) => chapter.content && chapter.content.trim().length > 0)
    .slice(-windowSize);
  return recent.map(({ chapter, index }) => {
    const node = nodes[index];
    const tail = chapter.content.length > 120 ? `${chapter.content.slice(-120)}…` : chapter.content;
    return {
      chapterNumber: index + 1,
      title: chapter.title,
      endingState: node?.CEN?.trim() || chapter.plotSummary?.trim() || tail.replace(/\s+/g, ' '),
    };
  });
}

export interface RollContextBase {
  positioning: string;
  volumeAnchor: string;
  writtenState: string;
  /** 已写章节数（正文非空的章）——冒烟/开书即滚场景为 0 */
  writtenThrough: number;
  /** 紧邻滚动起点的既有蓝图收束（最近数章规划 CEN），承接链桥 */
  plannedTail: string[];
  activeForeshadows: string;
  characterRoster: string;
  /** 命运锁：已死亡/下狱/去职/定罪角色的既定命运清单（滚纲 reconcile） */
  fateLocks: string[];
}

/**
 * 卷级锚点：本批章号落在哪一卷、该卷的目标/冲突/回收伏笔。
 * 卷纲声明了章节区间时按真实区间定位；缺失（旧项目/旧大纲）按
 * estimatedChaptersPerVolume 估算（卷纲不带章区间的旧行为）。
 */
export function buildVolumeAnchor(project: Project, fromChapterNumber: number): string {
  const volumePlans = project.metadata?.volumePlans ?? [];
  if (volumePlans.length === 0) return '（本项目无结构化卷纲）';
  const ranges = volumePlans.filter(
    plan => plan.chapterRange && plan.chapterRange.start >= 1 && plan.chapterRange.end >= plan.chapterRange.start,
  );
  let currentIndex: number;
  if (ranges.length === volumePlans.length && ranges.length >= 2) {
    const hit = volumePlans.findIndex(
      plan =>
        fromChapterNumber >= (plan.chapterRange?.start ?? 1)
        && fromChapterNumber <= (plan.chapterRange?.end ?? Number.MAX_SAFE_INTEGER),
    );
    // 越过末卷区间（滚动续写超出规划规模）钳到最后一卷
    currentIndex = hit >= 0 ? hit : volumePlans.length - 1;
  } else {
    const perVolume = project.metadata?.storyScale?.estimatedChaptersPerVolume;
    const estimated = perVolume && perVolume > 0 ? perVolume : 40;
    currentIndex = Math.min(
      Math.floor((fromChapterNumber - 1) / estimated),
      volumePlans.length - 1,
    );
  }
  const render = (index: number, mark: boolean): string => {
    const plan = volumePlans[index];
    const payoffs = plan.payoffForeshadows?.length ? `回收伏笔：${plan.payoffForeshadows.join('、')}` : '';
    return [
      `${mark ? '【当前卷】' : ''}第${plan.volumeIndex || index + 1}卷《${plan.title}》`,
      plan.chapterRange && `章节区间：第${plan.chapterRange.start}-${plan.chapterRange.end}章`,
      plan.objective && `目标：${plan.objective}`,
      plan.coreConflict && `冲突：${plan.coreConflict}`,
      plan.climax && `卷高潮：${plan.climax}`,
      payoffs,
    ].filter(Boolean).join('；');
  };
  const neighbors = [
    currentIndex - 1 >= 0 ? render(currentIndex - 1, false) : '',
    render(currentIndex, true),
    volumePlans[currentIndex + 1] ? render(currentIndex + 1, false) : '',
  ].filter(Boolean);
  return neighbors.join('\n');
}

/** 滚动续纲 prompt 的状态基底：全部来自项目已落盘的事实 */
export function buildRollContextBase(project: Project, fromChapterNumber: number): RollContextBase {
  const genre = (project.genre ?? []).map(g => g.name).filter(Boolean).join('、');
  const chapters = project.chapters ?? [];
  const digests = buildWrittenChapterDigests(chapters, project.plotOutline ?? []);

  const writtenState = digests.length > 0
    ? digests.map(d => `第${d.chapterNumber}章《${d.title}》收束：${d.endingState}`).join('\n')
    : '（暂无已写章节）';

  // 既有蓝图的收尾：滚动起点前最近几章的规划 CEN。真实环境的触发点（跑道<10）
  // 与起点之间隔着若干「已规划未写」章，正文 digest 覆盖不到这段——
  // 没有这座桥，第 N 章无法承接第 N-1 章的规划收束。
  const plannedTail = chapterNodesSorted(project.plotOutline ?? [])
    .filter(node =>
      (node.orderIndex ?? 0) + 1 < fromChapterNumber
      && Boolean(node.CEN?.trim()))
    .slice(-5)
    .map(node => `第${(node.orderIndex ?? 0) + 1}章《${node.title}》规划收束：${node.CEN!.trim()}`);

  const active = (project.foreshadows ?? [])
    .filter(f => f && f.status !== 'resolved' && f.hint)
    .map(f => {
      const window = `埋设${f.setupChapter ?? '?'}章→回收${f.payoffChapter ?? f.suggestedResolutionChapter ?? '?'}章`;
      const carrier = f.carrierCharacter ? `（载体：${f.carrierCharacter}）` : '';
      return `「${f.hint}」${window}${carrier}`;
    });

  const roster = (project.characters ?? [])
    .filter(c => c?.name)
    .map(c => c.role ? `${c.name}(${c.role})` : c.name);

  // 命运锁（2026-09-01「全部修复」）：滚纲不复核命运表会成批重插已下狱/已去职/
  // 已死亡角色——终验书严嵩林/赵敬实锤，判定器正确拒稿反成空洞。把命运表显式
  // 注入滚纲上下文与硬约束，让滚动续纲在源头不再产出状态冲突需求。
  const fateLocks = collectCharacterFates(project.chapterMemories ?? [])
    .map(f => `${f.characterName}（第${f.chapterIndex + 1}章${f.state}）`);

  return {
    positioning: [
      project.name && `书名：《${project.name}》`,
      genre && `题材：${genre}`,
      project.description && `一句话：${project.description.slice(0, 120)}`,
    ].filter(Boolean).join('\n'),
    volumeAnchor: buildVolumeAnchor(project, fromChapterNumber),
    writtenState,
    writtenThrough: chapters.filter(c => c.content && c.content.trim().length > 0).length,
    plannedTail,
    activeForeshadows: active.length > 0 ? active.join('\n') : '（无待回收伏笔）',
    characterRoster: roster.length > 0 ? roster.join('、') : '（未登记角色）',
    fateLocks,
  };
}

// ============================================
// prompt 构建
// ============================================

const {
  titleMinChars,
  titleMaxChars,
  hookMinChars,
  hookMaxChars,
  minimumCpns,
  maximumCpns,
} = OUTLINE_COMPLETENESS_POLICY;

/**
 * 滚动批次 prompt。字段格式与开书拆章（buildChapterCompletionPrompt）完全一致，
 * 差异只在锚点：startupPack 区块约束换成卷级锚点 + 已写状态 + 回收射程。
 */
export function buildRollBlueprintPrompt(params: {
  base: RollContextBase;
  chapterNumbers: number[];
  /** 邻接上一批已生成蓝图的收束状态（承接链） */
  recentBlueprintEndings: string[];
  issues?: string[];
}): { system: string; user: string } {
  const { base, chapterNumbers, recentBlueprintEndings, issues = [] } = params;
  const first = chapterNumbers[0];
  // 进度措辞必须与 writtenState 一致：冒烟/开书即滚时正文未动，
  // 谎称「正文已写到第N章」会让模型臆造不存在的剧情收束。
  const progressLine = base.writtenThrough >= first - 1
    ? `正文已写到第${first - 1}章`
    : base.writtenThrough > 0
      ? `正文已写到第${base.writtenThrough}章，第${base.writtenThrough + 1}-${first - 1}章已有章级蓝图待写`
      : `正文尚未开写，第1-${first - 1}章已有章级蓝图`;
  const issueSection = issues.length > 0
    ? `\n\n【本次必须修掉的格式违规】\n${issues.map(issue => `- ${issue}`).join('\n')}\n改写时优先压缩到区间内，宁可删修饰语也不得超字数。`
    : '';
  const endingSection = recentBlueprintEndings.length > 0
    ? `\n\n【上一批蓝图收束】\n${recentBlueprintEndings.join('\n')}`
    : '';
  const plannedTailSection = base.plannedTail.length > 0
    ? `\n\n【紧邻既有蓝图收束】\n${base.plannedTail.join('\n')}`
    : '';
  const fateLockSection = base.fateLocks.length > 0
    ? `\n\n【命运锁（已定命运，不可违反）】\n${base.fateLocks.join('；')}`
    : '';
  return {
    system: `你是中文长篇网文大纲拆章器，正在为连载中的书做滚动续纲：${progressLine}，你只补写指定章号的单章蓝图，不复述已有章节，不输出解释。
每章必须严格使用以下结构：
### 第N章
- 标题：${titleMinChars}-${titleMaxChars}字的网文口语标题，要有画面/情绪/钩子，抓住本章最刺激的一点（打脸/翻车/反转/期限/秘密/意外）；禁止只写“第N章”。【超 ${titleMaxChars} 字即为格式错误：先砍修饰语和副词，再砍次要信息，宁可短不可超】
- 概要：40-80字，用一段话交代本章从哪儿起、中间怎么推、落到什么后果，写给作者看的章纲；必须比 CBN 多出信息量，禁止照抄 CBN/标题
- CBN：${hookMinChars}-${hookMaxChars}字的章首动作钩子，写开篇 10 秒抓人的瞬间画面或冲突，禁止整章剧情概括
- CPNs：${minimumCpns}-${maximumCpns}个本章必须兑现的推进节点，每条独立可写成一个场面，用中文分号分隔
- CEN：${hookMinChars}-${hookMaxChars}字章尾悬念，要让读者必须点下一章
- mustCover：1-3个本章能完成的具体事件，用中文分号分隔，禁止整卷或全书级目标；每个节点必须以【单章】或【跨章】开头——【单章】=本章内可完整兑现的具象事件；【跨章】=本卷主线级目标、本章只能实质推进（如限期+威胁后果类）。标注是硬约定：跨章节点按「实质推进」验收，单章节点的推进不折算
- 禁区：1-3条本章不得提前泄露的事项；若某条与本章 mustCover 必然冲突（履约所需的当众揭示/关键帮助），在该条开头加【让路】标记，审核会对该条按履约让路处理
- 章尾钩子文案：给读者看的一句钩子话术，区别于 CEN 的事件描述
- 爽点类型：打脸/碾压/反转/装逼/解谜/逆袭/立威/收服等
硬约束：
1. 标题、CBN、CEN 的字数必须落在区间内，超出即为格式错误；
2. 一章只能承载一个核心转折，禁止把两个独立高潮压进同一章；
3. 第 N 章必须承接第 N-1 章的 CEN/收束状态并推动到新状态，不得无视上章终态；
   【承接≠复述】CBN 是本章开头 10 秒的新事件画面，禁止把上一章 CEN/收束状态的原文
   改写、扩写或换措辞重述一遍来充当 CBN——读者在上一章末尾刚读过这段内容，
   本章再演一遍就是剧情空转。承接收束状态只能作为暗前提（一句话内体现「接上了」），
   镜头必须立刻进入上一章没有出现过的新动作；
4. 「已写进度与收束状态」和「上一批蓝图收束」是不可改写的既有事实：新章不得重置期限、重复已完成事件（破案/入狱/升职等），不得让已倒台或被羁押的角色无解释恢复原位；
5. 本批章节必须落在当前卷的目标与冲突射程内推进，不得提前兑现后续卷的高潮或反转；
6. 回收章节落在本批次区间内的伏笔，必须在对应章节的 mustCover 中兑现；
7. 出场角色只能使用「角色名单」中已登记的姓名（可按卷纲引入名单内角色的后续登场），不得另造同名同功能新角色，也不得与名单内已有角色重名；
   【禁止标签称谓】凡需要行动/对白的功能性角色（僚属、官员、差役、侍卫等），必须起真实中文姓名（姓+名，如「方正平」）或复用名单内角色；禁止用「XX派年轻官员」「老总管」「年轻御史」这类阵营标签+身份泛称当角色名写进节点与出场名单——它们不是姓名，会被正文照抄成占位符；
8. 所有字段都不得留空，禁止使用括号补充说明；
9. 【命运锁】「命运锁」清单里的角色已有既定命运（死亡/下狱/去职/定罪），新章蓝图禁止安排其以自由身出场、行动、对话或履行原职；剧情确需其后续作用时，只能作为他人回忆/口头提及，或在本章 mustCover 中显式写出解除事件（越狱/劫狱/平反/保释/官复原职/复爵）并在该节点开头加【解除】标记；
10. 【禁区相容】mustCover 与禁区不得互斥：若某节点要求本章发生某状态变更（下旨/定谳/圈禁/结案/复职等），对应禁区不得禁止该变更发生；确需保留防泄露约束时，只保护更早阶段的揭示，并在该条禁区开头加【让路】标记——禁止产出让写作端两头违约的合同。`,
    user: `【故事定位】\n${base.positioning}\n\n【卷纲锚点】\n${base.volumeAnchor}\n\n【已写进度与收束状态】\n${base.writtenState}${plannedTailSection}${endingSection}${fateLockSection}\n\n【活跃伏笔（埋设→回收）】\n${base.activeForeshadows}\n\n【角色名单】\n${base.characterRoster}\n\n【只需补写的章号】\n${chapterNumbers.join('、')}${issueSection}\n\n直接从“### 第${chapterNumbers[0]}章”开始输出。`,
  };
}

// ============================================
// 响应解析与轻量门禁
// ============================================

const BLUEPRINT_FIELD_RE = /^-\s*(标题|概要|CBN|CPNs|CEN|mustCover|禁区|章尾钩子文案|爽点类型)\s*[：:]\s*(.*)$/u;

function splitList(raw: string): string[] {
  if (typeof raw !== 'string') return [];
  return raw
    .split(/[；;]/u)
    .map(item => item.trim())
    .filter(Boolean);
}

/** 解析模型响应中指定章号的单章蓝图（字段口径与开书拆章一致） */
export function parseBlueprintBlocks(raw: string, requested: number[]): Map<number, ChapterBlueprint> {
  const blocks = extractRequestedChapterBlocks(raw, requested);
  const result = new Map<number, ChapterBlueprint>();
  for (const [chapterNumber, block] of blocks) {
    const fields = new Map<string, string>();
    for (const line of block.split(/\r?\n/u)) {
      const match = BLUEPRINT_FIELD_RE.exec(line.trim());
      if (match) fields.set(match[1], match[2].trim());
    }
    const title = fields.get('标题') ?? '';
    const CBN = fields.get('CBN') ?? '';
    const CEN = fields.get('CEN') ?? '';
    if (!title || !CBN || !CEN) continue;
    result.set(chapterNumber, {
      orderIndex: chapterNumber,
      title,
      summary: fields.get('概要') ?? '',
      CBN,
      CPNs: splitList(fields.get('CPNs') ?? ''),
      CEN,
      mustCover: splitList(fields.get('mustCover') ?? ''),
      forbiddenZones: splitList(fields.get('禁区') ?? ''),
      hookText: sanitizeHookText(fields.get('章尾钩子文案')),
      coolPointType: fields.get('爽点类型') || undefined,
      hookType: '',
    });
  }
  return result;
}

/** 轻量门禁：章级字段可用性（不含开书门槛的整本检查） */
export function isUsableRolledBlueprint(blueprint: ChapterBlueprint | undefined): blueprint is ChapterBlueprint {
  return Boolean(
    blueprint &&
    blueprint.title.trim() &&
    !PLACEHOLDER_TITLE_RE.test(blueprint.title.trim()) &&
    blueprint.CBN.trim() &&
    blueprint.CEN.trim() &&
    blueprint.CPNs.length >= OUTLINE_COMPLETENESS_POLICY.minimumCpns &&
    blueprint.mustCover.length > 0,
  );
}

/**
 * 章级蓝图内容质检（滚动批次专用，对齐生成侧 outline-reviewer 的章级规则子集）。
 * 滚动续纲此前只查字段可用性——字段齐全但内容有病的蓝图照样落库，
 * 下游由履约审核硬扛（跨章目标→履约死循环；CBN 复述上章结尾→章界重演）。
 * 这里在落库前拦三类高频病：
 * - over-scoped：mustCover 含整卷/全书级跨章目标（单章无法兑现）
 * - template-cbn / 模板 CEN：承接话术、流程话术泄漏进情节字段
 * - reader-meta：企划口吻（读者期待等）混进节点
 */
export interface RolledBlueprintIssue {
  chapterNumber: number;
  kind:
    | 'over-scoped-mustcover'
    | 'template-cbn'
    | 'hollow-cen'
    | 'reader-meta'
    | 'locked-foreshadow';
  detail: string;
}

export function inspectRolledBlueprintQuality(bp: ChapterBlueprint): RolledBlueprintIssue[] {
  const issues: RolledBlueprintIssue[] = [];
  const overScoped = bp.mustCover.find(node => isCrossChapterGoal(node));
  if (overScoped) {
    issues.push({
      chapterNumber: bp.orderIndex,
      kind: 'over-scoped-mustcover',
      detail: `mustCover「${overScoped.slice(0, 30)}」是整卷/全书级跨章目标，改为本章可兑现的具体事件`,
    });
  }
  if (/^(?:开场承接|承接上[章段](?:结尾)?)[：:]/u.test(bp.CBN.trim())) {
    issues.push({
      chapterNumber: bp.orderIndex,
      kind: 'template-cbn',
      detail: `CBN「${bp.CBN.slice(0, 30)}」是承接模板话术而非本章新事件`,
    });
  }
  // CEN 空壳（推进至/元指令/模板钩子/复读 CPN）
  if (isHollowChapterHook(bp.CEN, bp.CPNs)) {
    issues.push({
      chapterNumber: bp.orderIndex,
      kind: 'hollow-cen',
      detail: `CEN「${bp.CEN.slice(0, 30)}」是零信息量空壳钩子`,
    });
  }
  for (const node of [...bp.CPNs, ...bp.mustCover]) {
    if (isReaderMetaText(node)) {
      issues.push({
        chapterNumber: bp.orderIndex,
        kind: 'reader-meta',
        detail: `节点「${node.slice(0, 30)}」是企划口吻（读者期待类），不是可执行情节`,
      });
      break;
    }
  }
  return issues;
}

/** 章节间蓝图质量检查：相邻两章 CBN 过于接近 = 本章开局复读上章（章界重演信号）。
 * 仅差一个序号/人名的模板句是合法相邻推进，归一化编辑距离 ≥3 才判复述 */
export function findBlueprintRepetition(
  blueprints: ChapterBlueprint[],
  threshold = 0.85,
): RolledBlueprintIssue[] {
  const issues: RolledBlueprintIssue[] = [];
  for (let i = 1; i < blueprints.length; i += 1) {
    const prev = (blueprints[i - 1].CBN ?? '').trim();
    const curr = (blueprints[i].CBN ?? '').trim();
    if (!prev || !curr) continue;
    if (curr.includes(prev) || prev.includes(curr)) {
      // 子串包含即复述（本章开头直接吞了上章 CBN 全文）
    } else if (
      normalizedSimilarityKeepingNumbers(prev, curr) >= threshold &&
      normalizedEditDistanceKeepingNumbers(prev, curr) >= 3
    ) {
      // 高相似且差异足够多：不是「换个序号」的模板推进，是真复述
    } else {
      continue;
    }
    issues.push({
      chapterNumber: blueprints[i].orderIndex,
      kind: 'template-cbn',
      detail: `第${blueprints[i].orderIndex}章 CBN 与第${blueprints[i - 1].orderIndex}章高度相似或为其子串，疑为跨章复述；改写为本章独立的新开篇事件`,
    });
  }
  return issues;
}

/** 归一化编辑距离（保留数字）：与 outlineCompleteness.blueprintEditDistance 同口径 */
function normalizedEditDistanceKeepingNumbers(a: string, b: string): number {
  const normalize = (text: string): string =>
    (text ?? '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
  const na = normalize(a);
  const nb = normalize(b);
  const matrix: number[][] = [];
  for (let i = 0; i <= nb.length; i += 1) matrix[i] = [i];
  for (let j = 0; j <= na.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= nb.length; i += 1) {
    for (let j = 1; j <= na.length; j += 1) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j - 1] + (nb.charAt(i - 1) === na.charAt(j - 1) ? 0 : 1),
        matrix[i][j - 1] + 1,
        matrix[i - 1][j] + 1,
      );
    }
  }
  return matrix[nb.length][na.length];
}

/** 锁定伏笔的计时信息（Pipeline 侧 futureReveals 同源：createdChapter = 大纲预埋章号） */
export interface ForeshadowTimingHint {
  hint: string;
  createdChapter?: number;
  setupChapter?: number;
}

/** 从提示语中提取 CJK 连续段（≥2 字），供词面命中统计 */
function foreshadowCoreTokens(hint: string): string[] {
  return (hint ?? '')
    .replace(/[^\u4e00-\u9fff]+/gu, ' ')
    .split(/\s+/u)
    .map(token => token.trim())
    .filter(token => token.length >= 2);
}

/**
 * 锁定伏笔词面校验：蓝图 CPN/CEN/mustCover 若把「第 X 章才埋设的伏笔」的触发词
 * 直接写进本章节点，写作时模型履约即提前揭示，评审必拒——同一章 3 拒即管线中止
 * （2026-08-28 百章终验 ch40 死锁实证：CPN「调阅兵部战马清册发现异常台阶数据」
 * vs 伏笔 notBeforeChapter=42）。
 * 命中规则：提示语 CJK 连续段的 2-gram 在蓝词条文中命中 ≥max(2, 34%) 个——
 * 单独出现「清册」或「战马」的无关章节不误伤，完整词组共存即拦。
 */
export function findLockedForeshadowViolations(
  blueprints: ChapterBlueprint[],
  foreshadows: ForeshadowTimingHint[],
): RolledBlueprintIssue[] {
  const issues: RolledBlueprintIssue[] = [];
  const locked = foreshadows
    .map(f => ({ hint: (f.hint ?? '').trim(), setupAt: f.setupChapter ?? f.createdChapter ?? 0 }))
    .filter(f => f.setupAt > 0 && f.hint.length >= 4);
  if (locked.length === 0) return issues;
  for (const bp of blueprints) {
    const text = [bp.CBN, bp.CEN, bp.summary, ...bp.CPNs, ...bp.mustCover]
      .filter(Boolean)
      .join('\n');
    if (!text) continue;
    for (const f of locked) {
      if (bp.orderIndex >= f.setupAt) continue;
      const tokens = foreshadowCoreTokens(f.hint);
      const grams = new Set<string>();
      for (const token of tokens) {
        for (let i = 0; i + 2 <= token.length; i += 1) grams.add(token.slice(i, i + 2));
      }
      if (grams.size === 0) continue;
      let hits = 0;
      for (const gram of grams) if (text.includes(gram)) hits += 1;
      if (hits < Math.max(2, Math.ceil(grams.size * 0.34))) continue;
      issues.push({
        chapterNumber: bp.orderIndex,
        kind: 'locked-foreshadow',
        detail:
          `第${bp.orderIndex}章蓝图词面命中第${f.setupAt}章才埋设的伏笔「${f.hint.slice(0, 24)}」` +
          `（命中 ${hits}/${grams.size} 个二字组）。把该节点改写为不含伏笔触发词的中性事件，` +
          `相关物件与异常结论留到第${f.setupAt}章再出现`,
      });
      break;
    }
  }
  return issues;
}

/** 单章质检缺陷总数（含锁定伏笔），供修复轮「越修越坏」对比 */
function blueprintDefectCount(
  bp: ChapterBlueprint,
  foreshadows: ForeshadowTimingHint[],
): number {
  return (
    inspectRolledBlueprintQuality(bp).length +
    findLockedForeshadowViolations([bp], foreshadows).length
  );
}

/** 就地应用本地 sanitize（标题/CBN/CEN 超长收缩）；不可本地修复的返回原值 */
function applyLocalSanitize(blueprint: ChapterBlueprint): ChapterBlueprint {  const sanitized = sanitizeBlueprintLengths(blueprint, {
    titleMinChars: OUTLINE_COMPLETENESS_POLICY.titleMinChars,
    titleMaxChars: OUTLINE_COMPLETENESS_POLICY.titleMaxChars,
    hookMinChars: OUTLINE_COMPLETENESS_POLICY.hookMinChars,
    hookMaxChars: OUTLINE_COMPLETENESS_POLICY.hookMaxChars,
  });
  return sanitized ?? blueprint;
}

/**
 * 蓝图 → 可落库的章节型 PlotNode。
 *
 * orderIndex 策略（位置兜底「第 N 个 chapter 节点 = 第 N 章」要求序号空间干净）：
 * - 干净空间（既有 chapter 节点 orderIndex 严格 = 位置序号）：用章号-1，排序即章序
 * - 污染空间（旧项目 act/subplot 节点混用同一 orderIndex 计数，chapter 节点
 *   orderIndex 与位置错位）：若仍用章号-1，滚动节点会穿插进污染节点的排序区间，
 *   位置兜底从「第 N 个」错配到错误章节——此时改用「chapter 节点最大 orderIndex+1
 *   递增追加 + chapterId 显式绑定」，绑定优先于位置兜底，错位风险消除。
 */
export function blueprintToPlotNode(
  blueprint: ChapterBlueprint,
  projectId: string,
  options?: {
    /** 既有 chapter 型节点（已按 orderIndex 升序）；缺省时视为干净空间 */
    existingChapterNodes?: PlotNode[];
    /** 本轮滚动起点章号（污染空间的追加序号 = 既有最大 orderIndex + 章号偏移）；默认 51 */
    rollFromChapter?: number;
    /** 目标章节实体（用于污染空间的 chapterId 绑定） */
    chapter?: { id: string };
  },
): PlotNode {
  const nodes = options?.existingChapterNodes ?? [];
  const polluted = nodes.some((node, index) => (node.orderIndex ?? 0) !== index);
  const appendedBase = nodes.length > 0 ? Math.max(...nodes.map(node => node.orderIndex ?? 0)) : -1;
  const rollFrom = options?.rollFromChapter ?? 51;
  const normalized = normalizeChapterBlueprint(
    {
      title: blueprint.title,
      goal: blueprint.summary || blueprint.title,
      CBN: blueprint.CBN,
      CPNs: blueprint.CPNs,
      CEN: blueprint.CEN,
      mustCover: blueprint.mustCover,
      keyEvents: blueprint.mustCover,
      description: blueprint.summary,
    },
    blueprint.orderIndex,
  );
  // 污染空间：追加在既有最大 orderIndex 之后按批次内偏移递增；干净空间：章号-1。
  // chapterId 绑定让 extractChapterContext 走显式匹配，不依赖被污染的位置兜底。
  const orderIndex = polluted
    ? appendedBase + 1 + (blueprint.orderIndex - rollFrom)
    : blueprint.orderIndex - 1;
  return {
    id: `plot-roll-${projectId}-${blueprint.orderIndex}-${Date.now()}`,
    title: blueprint.title,
    description: blueprint.summary || normalized.goal,
    type: 'chapter',
    orderIndex,
    ...(polluted && options?.chapter ? { chapterId: options.chapter.id } : {}),
    keyEvents: normalized.mustCover,
    CBN: normalized.CBN,
    CPNs: normalized.CPNs,
    CEN: normalized.CEN,
    mustCover: normalized.mustCover,
    forbiddenZones: blueprint.forbiddenZones,
    purpose: `CBN: ${normalized.CBN}\nCEN: ${normalized.CEN}`,
  };
}

// ============================================
// 主流程
// ============================================

export type RollCaller = (system: string, user: string, temperature: number) => Promise<string>;

export interface RollOutlineResult {
  /** 本轮成功落库的章节数 */
  appendedCount: number;
  /** 落库区间（1-based，含端点）；appendedCount=0 时无意义 */
  fromChapter: number;
  toChapter: number;
  warnings: string[];
  /** 触发但无事可做（已到计划章数上限等） */
  skippedReason?: string;
}

export interface RollOutlineParams {
  project: Project;
  callStructuredText: RollCaller;
  /** 落库回调：批量追加节点并更新 plannedChapterCount */
  persist: (nodes: PlotNode[], plannedChapterCount: number) => Promise<void> | void;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  /**
   * 本轮射程上限（补到的最大总章数）。默认按 OUTLINE_ROLL_BATCH_CHAPTERS 滚一批；
   * 真实环境触发点靠跑道阈值自然限制，冒烟/长跑需要显式圈定目标章数时传入。
   */
  maxChapters?: number;
}

/** 带空响应/瞬态退避的单次调用；用户取消原样上抛 */
async function callWithRetry(
  caller: RollCaller,
  system: string,
  user: string,
  temperature: number,
  batchLabel: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  const MAX_ATTEMPTS = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const generated = await caller(system, user, temperature);
      if (generated.trim()) return generated;
      lastError = new Error('空响应');
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, Math.min(2000 * 2 ** (attempt - 1), 10_000)));
    }
  }
  throw lastError instanceof Error
    ? new Error(`滚动续纲批次 ${batchLabel} 重试耗尽：${lastError.message.slice(0, 120)}`)
    : new Error(`滚动续纲批次 ${batchLabel} 重试耗尽`);
}

/**
 * 滚动补写下一批章级蓝图并落库。
 * 失败（含部分失败截断）不抛异常——批量写作循环不该被续纲失败卡死，
 * 结果以 warnings 透出，写不出的章走诚实降级路径。
 */
export async function rollOutlineForward(params: RollOutlineParams): Promise<RollOutlineResult> {
  const { project, callStructuredText, persist, signal, onProgress } = params;
  const warnings: string[] = [];

  const runwayState = computeOutlineRunway(project.chapters ?? [], project.plotOutline ?? []);
  // 起点 = max(细纲槽, 已写章数)+1：预建的空章（mid 模式冒烟/用户手动建章）不推高起点，
  // 只有「已写出正文」的章才代表真实进度；bare-written 旧书（写超细纲）也能正确续接。
  const fromChapter = Math.max(runwayState.chapterNodeCount, runwayState.writtenThrough) + 1;
  const plannedCap = project.metadata?.plannedChapterCount
    ?? project.metadata?.storyScale?.estimatedChapterCount
    ?? Number.POSITIVE_INFINITY;
  const toChapter = Math.min(
    fromChapter + OUTLINE_ROLL_BATCH_CHAPTERS - 1,
    plannedCap,
    params.maxChapters ?? Number.POSITIVE_INFINITY,
  );
  if (fromChapter > toChapter) {
    return {
      appendedCount: 0,
      fromChapter,
      toChapter: fromChapter - 1,
      warnings,
      skippedReason: `已达计划章数上限（${plannedCap}章），不再滚动续纲`,
    };
  }

  onProgress?.(`正在滚动补充第 ${fromChapter}-${toChapter} 章细纲...`);
  const base = buildRollContextBase(project, fromChapter);
  const blueprints = new Map<number, ChapterBlueprint>();

  const chapterNumbers: number[] = [];
  for (let n = fromChapter; n <= toChapter; n += 1) chapterNumbers.push(n);

  for (let index = 0; index < chapterNumbers.length; index += CHAPTER_BLUEPRINT_BATCH_SIZE) {
    if (signal?.aborted) {
      warnings.push('滚动续纲被取消');
      break;
    }
    const batch = chapterNumbers.slice(index, index + CHAPTER_BLUEPRINT_BATCH_SIZE);
    const recentEndings = [...blueprints.values()]
      .slice(-3)
      .map(bp => `第${bp.orderIndex}章《${bp.title}》收束：${bp.CEN}`);
    const prompt = buildRollBlueprintPrompt({
      base,
      chapterNumbers: batch,
      recentBlueprintEndings: recentEndings,
    });
    onProgress?.(`滚动续纲 ${batch[0]}-${batch[batch.length - 1]} 章（${Math.floor(index / CHAPTER_BLUEPRINT_BATCH_SIZE) + 1}/${Math.ceil(chapterNumbers.length / CHAPTER_BLUEPRINT_BATCH_SIZE)}）...`);
    try {
      const generated = await callWithRetry(
        callStructuredText,
        prompt.system,
        prompt.user,
        0.35,
        `${batch[0]}-${batch[batch.length - 1]}`,
        signal,
      );
      for (const [n, bp] of parseBlueprintBlocks(generated, batch)) {
        blueprints.set(n, applyLocalSanitize(bp));
      }
    } catch (error) {
      if (signal?.aborted) {
        warnings.push('滚动续纲被取消');
        break;
      }
      warnings.push(`批次 ${batch[0]}-${batch[batch.length - 1]} 失败：${error instanceof Error ? error.message.slice(0, 120) : String(error).slice(0, 120)}`);
    }
  }

  // 内容质检（章级）：字段可用但内容有病的蓝图不该落库硬扛履约。
  // 单章病（跨章 mustCover / 模板 CBN / 空壳 CEN）+ 批内相邻章 CBN 复述（章界重演信号）
  // + 锁定伏笔词面冲突（提前揭示必被评审 3 拒中止，2026-08-28 终验实证）
  // 合并进下一轮定点修复，修复轮提示词已支持「本次必须修掉的问题」注入。
  const rollForeshadows: ForeshadowTimingHint[] = (project.foreshadows ?? []).map(f => ({
    hint: f.hint,
    createdChapter: f.createdChapter,
    setupChapter: (f as unknown as { setupChapter?: number }).setupChapter,
  }));
  const qualityIssues = [
    ...[...blueprints.values()].flatMap(inspectRolledBlueprintQuality),
    ...findBlueprintRepetition([...blueprints.values()]),
    ...findLockedForeshadowViolations([...blueprints.values()], rollForeshadows),
  ];
  const problematicChapters = [
    ...new Set(qualityIssues.map(issue => issue.chapterNumber)),
  ].sort((a, b) => a - b);

  // 定点修复一轮：解出但不可用 / 完全缺失 / 质检不合格的章号合并补一次
  const missingOrInvalid = chapterNumbers.filter(n => !isUsableRolledBlueprint(blueprints.get(n)));
  const repairTargets = [
    ...new Set([...missingOrInvalid, ...problematicChapters]),
  ].filter(n => n >= fromChapter && n <= toChapter);
  if (repairTargets.length > 0 && repairTargets.length <= chapterNumbers.length && !signal?.aborted) {
    onProgress?.(`滚动续纲定点修复 ${repairTargets.length} 章（第 ${repairTargets.join('、')} 章）...`);
    const issues = repairTargets.flatMap(n => {
      const bp = blueprints.get(n);
      if (!bp) return [`第${n}章缺失，未在响应中解出`];
      const list: string[] = [];
      if (!bp.CPNs.length) list.push(`第${n}章 CPNs 为空`);
      if (!bp.mustCover.length) list.push(`第${n}章 mustCover 为空`);
      list.push(
        ...qualityIssues
          .filter(issue => issue.chapterNumber === n)
          .map(issue => `第${n}章 ${issue.detail}`),
      );
      return list;
    });
    try {
      const prompt = buildRollBlueprintPrompt({
        base,
        chapterNumbers: repairTargets,
        recentBlueprintEndings: [...blueprints.values()].slice(-3).map(bp => `第${bp.orderIndex}章《${bp.title}》收束：${bp.CEN}`),
        issues,
      });
      const generated = await callWithRetry(
        callStructuredText,
        prompt.system,
        prompt.user,
        0.2,
        `修复${repairTargets[0]}-${repairTargets.at(-1)}`,
        signal,
      );
      const repaired = parseBlueprintBlocks(generated, repairTargets);
      for (const n of repairTargets) {
        const incoming = repaired.get(n);
        if (!incoming) continue;
        const next = applyLocalSanitize(incoming);
        // 复检：修复稿质检缺陷不得多于原稿（含锁定伏笔词面冲突）。「越修越坏」
        // 的稿子换进去会让 validTo 前缀断得更早；不达标则保留原稿（带病但完整）。
        const beforeCount = blueprintDefectCount(blueprints.get(n)!, rollForeshadows);
        const afterCount = blueprintDefectCount(next, rollForeshadows);
        if (beforeCount > 0 && afterCount > beforeCount) {
          warnings.push(
            `第${n}章定点修复稿质检退化（${beforeCount}→${afterCount} 处），保留原稿`,
          );
          continue;
        }
        blueprints.set(n, next);
      }
    } catch (error) {
      if (signal?.aborted) {
        warnings.push('滚动续纲被取消');
      } else {
        warnings.push(`定点修复失败：${error instanceof Error ? error.message.slice(0, 120) : String(error).slice(0, 120)}`);
      }
    }
  }

  // 只落最长连续有效前缀（位置兜底要求节点序列无空洞）
  let validTo = fromChapter - 1;
  for (const n of chapterNumbers) {
    if (isUsableRolledBlueprint(blueprints.get(n))) validTo = n;
    else break;
  }

  if (validTo < fromChapter) {
    warnings.push(`滚动续纲未产出可用蓝图（第 ${fromChapter} 章起），本批章节将走无细纲降级路径`);
    return { appendedCount: 0, fromChapter, toChapter: fromChapter - 1, warnings };
  }

  const truncated = validTo < toChapter;
  if (truncated) {
    warnings.push(`第 ${validTo + 1}-${toChapter} 章蓝图缺失或不可用，本轮只补到第 ${validTo} 章`);
  }

  // 落库节点：污染序号空间探测 + chapterId 绑定（旧项目 act/subplot 混用 orderIndex 时，
  // 章号-1 会穿插错位；此时追加到既有最大 orderIndex 之后并显式绑定章节）
  const existingChapterNodes = chapterNodesSorted(project.plotOutline ?? []);
  const sortedChapters = [...(project.chapters ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const nodes = chapterNumbers
    .filter(n => n <= validTo)
    .map(n =>
      blueprintToPlotNode(blueprints.get(n)!, project.id, {
        existingChapterNodes,
        rollFromChapter: fromChapter,
        chapter: sortedChapters[n - 1],
      }),
    );
  const nextPlannedCount = Math.max(project.metadata?.plannedChapterCount ?? 0, validTo);
  await persist(nodes, nextPlannedCount);
  onProgress?.(`滚动续纲完成：新增第 ${fromChapter}-${validTo} 章细纲（${nodes.length} 章）`);

  return {
    appendedCount: nodes.length,
    fromChapter,
    toChapter: validTo,
    warnings,
  };
}

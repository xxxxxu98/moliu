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
  normalizeVocabularyTier,
  renderBlueprintVocabularyRule,
  type VocabularyTier,
} from '@/services/story-runtime/proseRules';
import {
  dropForeshadowConflictingItems,
  findLockedForeshadowViolations,
  hasFinaleClosureSignal,
  isTruncatedClause,
  type ForeshadowTimingHint,
  type RolledBlueprintIssue,
} from './foreshadowTiming';
// 词面时序校验抽到 foreshadowTiming.ts 后由此 re-export 保持外部导入兼容
// （chapter-blueprint-regenerator / repair-empty 等仍从本模块取符号）
export {
  dropForeshadowConflictingItems,
  findLockedForeshadowViolations,
} from './foreshadowTiming';
export type { ForeshadowTimingHint, RolledBlueprintIssue } from './foreshadowTiming';
import {
  CHAPTER_BLUEPRINT_BATCH_SIZE,
  extractRequestedChapterBlocks,
  sanitizeBlueprintLengths,
} from '../generators/outline-completer';
import { sanitizeHookText } from '../parser/expanded-outline-parser';
import {
  describeRevealTimingViolation,
  findRevealTimingViolations,
} from '../validation/revealTiming';
import {
  findSuspenseDanglingIssues,
  findCoolPointPacingIssues,
  SUSPENSE_CARRY_WINDOW,
} from '../validation/pacingLedger';
import { OUTLINE_COMPLETENESS_POLICY } from '../validation/outlineCompleteness';
import {
  isCrossChapterGoal,
  isHollowChapterHook,
  isReaderMetaText,
  normalizeChapterBlueprint,
} from '@/services/story-runtime/chapterBlueprintNormalize';
import { collectCharacterFates, collectFakedDeathCharacters, FATE_STATES } from '@/services/writing/extract-plot-memory';
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
  /** 词汇档位（全书唯一）：滚纲节点语言按档（proseRules 归一化） */
  vocabularyTier: VocabularyTier;
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
  /** 假死在册角色（活着隐匿中，不进命运锁）：滚纲按活着规划暗线与揭破节点 */
  fakedDeaths: string[];
  /** 结构化命运锁（含历史计数）：解除核查与橡皮筋禁令的数据源 */
  fateLockEntries: Array<{
    name: string;
    state: string;
    chapter: number;
    /** 终态自身的重复次数 */
    sameStateCount: number;
    /** 该角色所有命运方向中的最大重复次数（橡皮筋信号——终态可能只是最新方向） */
    maxSameStateCount: number;
    /** 按次数降序的完整历史（下狱×3、越狱×1…） */
    history: Array<{ state: string; count: number }>;
  }>;
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
  // 必须按章序排列：digest 的章号由数组下标推导，与节点绑定口径（sortedChapters）一致
  const chapters = [...(project.chapters ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
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

  // 角色登场锁标注（2026-09-20 g38f r8 实证：赵宣 revealTiming=第155章，滚纲
  // 角色名单不带此信息 → ch82 蓝图点名其出场 → 写作层 futureReveals 拦 → 五连拒
  // 成洞）：revealTiming 晚于滚动起点的角色在名单中显式标注禁登场窗口。
  const debutChapterOf = (timing?: string): number | null => {
    if (!timing) return null;
    const match = /第\s*(\d+)\s*章/u.exec(timing);
    return match ? Number(match[1]) : null;
  };
  const roster = (project.characters ?? [])
    .filter(c => c?.name)
    .map(c => {
      const debut = debutChapterOf((c as { profile?: { revealTiming?: string } }).profile?.revealTiming);
      const locked = debut !== null && debut > fromChapterNumber;
      const tag = c.role ? `(${c.role})` : '';
      return locked ? `${c.name}${tag}【${debut}章前禁登场/禁揭示】` : `${c.name}${tag}`;
    });

  // 命运锁（2026-09-01「全部修复」）：滚纲不复核命运表会成批重插已下狱/已去职/
  // 已死亡角色——终验书严嵩林/赵敬实锤，判定器正确拒稿反成空洞。把命运表显式
  // 注入滚纲上下文与硬约束，让滚动续纲在源头不再产出状态冲突需求。
  // 2026-09-06 r3：同向计数（台账聚合，防橡皮筋——赵烈下狱×7/越狱×3 实证）；
  // 死亡族单列（无解除通道）。
  const fateCounts = new Map<string, Map<string, number>>();
  for (const memory of project.chapterMemories ?? []) {
    for (const change of memory?.characterStateChanges ?? []) {
      const name = String(change?.characterName ?? '').trim();
      if (!name || !FATE_STATES.has(change.state)) continue;
      const byState = fateCounts.get(name) ?? new Map<string, number>();
      byState.set(change.state, (byState.get(change.state) ?? 0) + 1);
      fateCounts.set(name, byState);
    }
  }
  const fateLockEntries = collectCharacterFates(project.chapterMemories ?? []).map(f => {
    const history = [...(fateCounts.get(f.characterName) ?? new Map<string, number>())]
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count);
    return {
      name: f.characterName,
      state: f.state,
      chapter: f.chapterIndex,
      sameStateCount: history.find(item => item.state === f.state)?.count ?? 1,
      maxSameStateCount: history[0]?.count ?? 1,
      history,
    };
  });
  const fateLocks = fateLockEntries.map(f => {
    const hist =
      f.history.length > 1 || f.maxSameStateCount > 1
        ? `；历史：${f.history.map(item => `${item.state}×${item.count}`).join('、')}`
        : '';
    return `${f.name}（第${f.chapter}章${f.state}${hist}）`;
  });
  // 假死在册（2026-09-20 g38f r8 实证：主角假死被登「死亡」，死亡锁随即锁死
  // 滚纲——ch169 蓝图写出「依陆九霄生前密信」，其后 48 章主角无法活体登场）：
  // 假死=活着隐匿中，滚纲应按活着规划暗线与揭破节点，不进命运锁。
  const fakedDeaths = collectFakedDeathCharacters(project.chapterMemories ?? []).map(
    f => `${f.name}（第${f.chapterIndex}章起假死在册，未揭晓）`
  );

  return {
    positioning: [
      project.name && `书名：《${project.name}》`,
      genre && `题材：${genre}`,
      project.description && `一句话：${project.description.slice(0, 120)}`,
    ].filter(Boolean).join('\n'),
    // 词汇档位（全书唯一）：滚纲与蓝图再生共用 buildRollContextBase，同一口径
    vocabularyTier: normalizeVocabularyTier(project.metadata?.outlinePositioning ?? {}),
    volumeAnchor: buildVolumeAnchor(project, fromChapterNumber),
    writtenState,
    writtenThrough: chapters.filter(c => c.content && c.content.trim().length > 0).length,
    plannedTail,
    activeForeshadows: active.length > 0 ? active.join('\n') : '（无待回收伏笔）',
    characterRoster: roster.length > 0 ? roster.join('、') : '（未登记角色）',
    fateLocks,
    fakedDeaths,
    fateLockEntries,
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
  /** 终卷批次（触顶全书计划章数）：注入收束硬约束，防「写到一半被切断」 */
  finalBatch?: { totalChapters: number; lastChapter: number };
}): { system: string; user: string } {
  const { base, chapterNumbers, recentBlueprintEndings, issues = [], finalBatch } = params;
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
  const finalBatchSection = finalBatch
    ? `\n\n【终卷收束硬约束】本批是全书最后一批蓝图（全书共${finalBatch.totalChapters}章，本批到第${finalBatch.lastChapter}章完结）：
- 主线核心冲突必须在本批内收束：最终对决/真相全揭/胜负分明，禁止把主矛盾悬置到「全书完」之后；
- 反派势力必须清算：主要反派的结局（伏诛/下狱/流放/身败）必须落到具体章节的 mustCover，禁止只写「将受到清算」式预告；
- 主角弧必须闭环：开篇立下的核心目标（身份/使命/阶层跃迁）在本批内兑现或明确抵达终点；
- 活跃伏笔全部出清：【活跃伏笔】清单中每一条要么在对应章节兑现，要么在 mustCover 显式安排余韵交代（一句话点明用途后收档），禁止带着未回收伏笔完结；
- 禁止引入新对手、新悬念、新势力：终卷不开新盘；约束 5「不得提前兑现后续卷高潮」在本批不适用——这就是最后的高潮；
- 末章（第${finalBatch.lastChapter}章）CEN 必须是全书收束句：给出「故事讲完」的终局画面或交代（尘埃落定/新秩序确立/主角归处），禁止写成下一章钩子；
- 【收束弧两章分工】收束工作量必须分摊到末两章，禁止全部压进末章单章（2026-10-08 r19 终章三轮实证：单章装不下「对决+清算+立制+回响」，必然大纲式速通被读者弃读）：
  · 倒数第二章（第${finalBatch.lastChapter - 1}章）= 清算与立制章：反派清算/册封封赏/新秩序确立（立制/改制/面圣）/主要配角结局交代，全部写成 mustCover 的具体场面节点；
  · 末章（第${finalBatch.lastChapter}章）= 终局与收束章：只承载终极对决高潮+主角目标达成+终局回响+全书收束句，禁止再塞清算/立制/配角交代类节点。`
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
  const fakedDeathSection = base.fakedDeaths.length > 0
    ? `\n\n【假死在册（活着，隐匿中——不是死亡，不适用死亡锁）】\n${base.fakedDeaths.join('；')}\n这些角色实际活着，只是外界认为已死：本批蓝图可以安排其暗线活动（密室养伤/乔装/借他人之手布局），并应在合适的章安排「假死揭破」节点（mustCover 显式标注【假死揭破】：何人何地目睹其存活、世人如何知晓）；揭破前不得安排其以原身份公开现身，揭破后正常活动。禁止按死人处理（「生前」布局/遗策/衣冠道具代替本人等表述一律违规）。`
    : '';
  // P2.2 节奏周期相位(2026-10-03 爽点-悬念联动编排,与 completer 同口径):
  // 5 章一周期蓄势→推进→爆发→余韵,相位按章号确定性轮转。措辞为「建议」,
  // 与硬约束 5(卷射程)互补:卷约束管事件归属,相位管张力起伏。
  const phaseSection = `\n\n【节奏周期相位建议】(5 章一周期:蓄势→推进→爆发→余韵,相位按章号轮转)\n${chapterNumbers.map(n => {
    const pos = ((n - 1) % 5) + 1;
    const phase = pos <= 2
      ? '蓄势(埋钩/升压/拉对立;本章允许开新悬念)'
      : pos === 3
        ? '推进(本章必须产出一个中型进展——揭示一层真相/拿下局部筹码/除掉一个爪牙,让读者看到主线在动;新悬念须克制)'
        : pos === 4
          ? '爆发(当章兑现大爽点,回收本周期蓄势的张力;禁止再蓄不兑)'
          : '余韵+新钩(爆发后果必须落到具体的人/位/账变化——谁倒台/谁上位/账怎么清,禁止松散收场;抛出的下一周期悬念必须比本周期钩更强)';
    return `- 第${n}章:${phase}`;
  }).join('\n')}`;
  // 时序锚（2026-10-05 都市文书审实证：35 章蓝图仅 1 章带时间标记、正文零
  // 日期锚——死代码 buildTimelineConstraintPrompt 的意图在此接线落地）：
  // 每章蓝图至少一处时间推进锚 + 跨章时间单调，正文 storyClock 同源消费。
  const timeAnchorSection = `\n\n【时序锚】本批每章蓝图的 CBN 或 CPNs 中至少一处携带明确时间推进锚（当日午后/当夜/次日清晨/三日后/开赛日当天等），连续章的时间必须单调推进不得回退；跨多天推进（如「三日后」）必须与上一章锚点衔接（上章承诺三日后开赛，开赛章的锚不得早于第三天——旧书实证：三次承诺三天后开赛、次日凌晨就开打零拦截）。`;
  return {
    system: `你是中文长篇网文大纲拆章器，正在为连载中的书做滚动续纲：${progressLine}，你只补写指定章号的单章蓝图，不复述已有章节，不输出解释。
每章必须严格使用以下结构：
### 第N章
- 标题：${titleMinChars}-${titleMaxChars}字的网文口语标题，要有画面/情绪/钩子，抓住本章最刺激的一点（打脸/翻车/反转/期限/秘密/意外）；禁止只写“第N章”。【超 ${titleMaxChars} 字即为格式错误：先砍修饰语和副词，再砍次要信息，宁可短不可超】
- 概要：40-80字，用一段话交代本章从哪儿起、中间怎么推、落到什么后果，写给作者看的章纲；必须比 CBN 多出信息量，禁止照抄 CBN/标题
- CBN：${hookMinChars}-${hookMaxChars}字的章首动作钩子，写开篇 10 秒抓人的瞬间画面或冲突，禁止整章剧情概括
- CPNs：${minimumCpns}-${maximumCpns}个本章必须兑现的推进节点，每条独立可写成一个场面，用中文分号分隔
- CEN：${hookMinChars}-${hookMaxChars}字章尾悬念，要让读者必须点下一章
- mustCover：1-3个本章能完成的具体事件，用中文分号分隔，禁止整卷或全书级目标；每个节点必须以【单章】或【跨章】开头——【单章】=本章内可完整兑现的具象事件；【跨章】=本卷主线级目标、本章只能实质推进（如限期+威胁后果类）。标注是硬约定：跨章节点按「实质推进」验收，单章节点的推进不折算。节点用白描事件句描述，禁止写成公文/告示/官令腔的成文短句（如「限各街坊商铺午时开门纳客」）——正文要转述改写，节点给出这种近乎成文的短句等于逼正文逐字照抄。【证据链措辞】节点只约定「场景内可证实的证据链与结论」（如「以X凭据与Y抄本坐实Z被人为改动、指向W经手」），禁止把「亲口承认/亲手所为/当众认罪」级归责断言写成履约条件——归责断言只有在本章同步安排了对应的认罪/对质/供状场面节点时才可写（2026-09-28 r14 ch39 实证：归责节点把履约口径抬到亲手所为，写手只能产出证据链，未履约判定与节点照抄守卫对挤五连拒成洞）
- 禁区：1-3条本章不得提前泄露的事项；若某条与本章 mustCover 必然冲突（履约所需的当众揭示/关键帮助），在该条开头加【让路】标记，审核会对该条按履约让路处理
- 章尾钩子文案：给读者看的一句钩子话术，区别于 CEN 的事件描述
- 爽点类型：打脸/碾压/反转/装逼/解谜/逆袭/立威/收服等；【当章兑现】每章必须安排至少一个本章内完成兑现的微爽点（当场反杀/局部胜利/真相落定/对手失态/旁人震惊），蓄势与铺陈不能替代兑现——连续两章只加悬念不给兑现是结构缺陷，读者会弃书（2026-09-28 r14 读者裁判四窗口一致批评：发现异常—登记留痕—证物被收走—留新线索的模板逐章复跑、悬念累积不闭合、开篇窗口仅 54.9）
硬约束：
1. 标题、CBN、CEN 的字数必须落在区间内，超出即为格式错误；
2. 一章只能承载一个核心转折，禁止把两个独立高潮压进同一章；
3. 第 N 章必须承接第 N-1 章的 CEN/收束状态并推动到新状态，不得无视上章终态；
   【承接≠复述】CBN 是本章开头 10 秒的新事件画面，禁止把上一章 CEN/收束状态的原文
   改写、扩写或换措辞重述一遍来充当 CBN——读者在上一章末尾刚读过这段内容，
   本章再演一遍就是剧情空转。承接收束状态只能作为暗前提（一句话内体现「接上了」），
   镜头必须立刻进入上一章没有出现过的新动作；
   【承接≠跳过】上章 CEN 遗留的紧急事件（当夜决战/限时行动/正在发生的危局）必须在
   本章 mustCover 中先交代结果或直接兑现，禁止时间跳跃绕过其后果另起新事件线——
   2026-09-05 g38f 200 章实测：ch183 尾备战的当夜兵变被 ch184 直接跳到次日清晨挤兑，
   决战结果全章只字未提；
   【承接≠回退】上章已经推进到的时空/进度状态（已入城/已开战/已抵达）不得回退重演
   ——同实测 ch129 尾已入城兵临殿门、ch130 却退回城外重新率军围控，属时空倒流；
4. 「已写进度与收束状态」和「上一批蓝图收束」是不可改写的既有事实：新章不得重置期限、重复已完成事件（破案/入狱/升职等），不得让已倒台或被羁押的角色无解释恢复原位；
5. 本批章节必须落在当前卷的目标与冲突射程内推进，不得提前兑现后续卷的高潮或反转；
6. 回收章节落在本批次区间内的伏笔，必须在对应章节的 mustCover 中兑现；
7. 出场角色只能使用「角色名单」中已登记的姓名（可按卷纲引入名单内角色的后续登场），不得另造同名同功能新角色，也不得与名单内已有角色重名；
   【禁止标签称谓】凡需要行动/对白的功能性角色（僚属、官员、差役、侍卫等），必须起真实中文姓名（姓+名，如「方正平」）或复用名单内角色；禁止用「XX派年轻官员」「老总管」「年轻御史」这类阵营标签+身份泛称当角色名写进节点与出场名单——它们不是姓名，会被正文照抄成占位符；
   【架空人名纪律】本书朝代为虚构架空时，新起人名必须完全虚构，禁止借用真实历史人物（严嵩/和珅/张居正等）或其谐音变体（严嵩年），禁止拼贴真实帝号年号（嘉靖/景泰）——架空礼制与真实历史锚点互相穿帮；
8. 所有字段都不得留空，禁止使用括号补充说明；
9. 【命运锁】「命运锁」清单里的角色已有既定命运（死亡/下狱/去职/定罪），新章蓝图禁止安排其以自由身出场、行动、对话或履行原职；剧情确需其后续作用时，只能作为他人回忆/口头提及，或在本章 mustCover 中显式写出解除事件（越狱/劫狱/平反/保释/官复原职/复爵）并在该节点开头加【解除】标记；
   【死亡锁无解除】状态为死亡/驾崩的角色没有任何解除事件：禁止规划其苏醒、病危急救、遇袭待救、「传位后复出发难」等任何存活情节或存活传闻被证实为真（2026-09-06 g38f-200chr2 实证：滚纲节点写「赵乾苏醒后」施杀局，正文无法履约整章死）；其遗诏、遗物、身后议谥只能作为向后引用；若全书设定确有假死局，必须在 mustCover 显式标注【假死设定】并写明揭破时点；
       【命运橡皮筋禁令】清单「历史」中某命运方向累计 ≥2 次（如下狱×2、削籍×2）即重复节拍——不得再规划该方向事件（同一终态事件如废黜/削籍/登基/册封在蓝图里只能发生一次，后续章只能写其后果与新进展，不得重演同一仪式），改用新的对抗手段或转移矛盾对象（2026-09-06 g38f-200chr2 实证：直王下狱×7/越狱×3；2026-09-20 r8 实证：赵恒削籍×3、赵宣登基蓝图+正文重演）；
       【驾崩场面锁】在位皇帝驾崩必须在当章 mustCover 有可感知的叙述场面（病榻托孤/遗诏宣读/讣告震动任一），禁止跨批直接从「皇帝在世」跳到「新帝已立/大行皇帝」——驾崩是全书级事件，off-screen 跳过即结构断裂（2026-09-20 r8 实证：ch181 仍在传口谕、ch182 直接讣告，托孤遗诏凭空出现）；
10. 【禁区相容】mustCover 与禁区不得互斥：若某节点要求本章发生某状态变更（下旨/定谳/圈禁/结案/复职等），对应禁区不得禁止该变更发生；确需保留防泄露约束时，只保护更早阶段的揭示，并在该条禁区开头加【让路】标记——禁止产出让写作端两头违约的合同；
11. 【伏笔时序锁】「活跃伏笔」清单中埋设时点（「埋设N章」的 N）晚于本批任意章号的伏笔，其核心信息（hint 词面及同义表述）禁止出现在本批任何章的 mustCover/CPN/CEN 中——蓝图要求本章揭示而伏笔规定后章才许揭示时，写作端会被迫两头违约（2026-09-10 glm 200 章实证：第 20 章蓝图要求「笔迹比对定性补账出自行家手笔」，伏笔却锁 22 章揭示，正文三连拒成空洞）。确需铺垫时只可用不触及核心词面的暗痕（物件出现/旁人欲言又止），不得给出定性结论。
   【角色登场锁】「角色名单」中标注【N章前禁登场/禁揭示】的角色，在 N 章之前的批次蓝图禁止安排其出场、行动、被点名揭示身份或成为事件主语——写作端有对应的登场禁令防线，蓝图点名即两头违约成空洞（2026-09-20 g38f r8 实证：ch82 蓝图开篇点名 revealTiming=155 章的角色，正文五连拒成洞）。确需其在位的势力影响时，用其代理人/名义/传闻侧写。
${renderBlueprintVocabularyRule(base.vocabularyTier)}`,
    user: `【故事定位】\n${base.positioning}\n\n【卷纲锚点】\n${base.volumeAnchor}\n\n【已写进度与收束状态】\n${base.writtenState}${plannedTailSection}${endingSection}${fateLockSection}${fakedDeathSection}${phaseSection}${timeAnchorSection}\n\n【活跃伏笔（埋设→回收）】\n${base.activeForeshadows}\n\n【角色名单】\n${base.characterRoster}${finalBatchSection}\n\n【只需补写的章号】\n${chapterNumbers.join('、')}${issueSection}\n\n直接从“### 第${chapterNumbers[0]}章”开始输出。`,
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
export function inspectRolledBlueprintQuality(
  bp: ChapterBlueprint,
  opts?: { isFinale?: boolean; isPenultimateFinale?: boolean },
): RolledBlueprintIssue[] {
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
  // 生成截断残句：句末悬垂在名词化修饰尾（「…沈淮安手中。」），长度合法但半截话
  for (const [label, text] of [['CBN', bp.CBN], ['CEN', bp.CEN]] as const) {
    if (isTruncatedClause(text)) {
      issues.push({
        chapterNumber: bp.orderIndex,
        kind: 'truncated-hook-clause',
        detail: `第${bp.orderIndex}章 ${label}「${text.slice(-16)}」句末悬垂，疑似生成截断残句，补完为完整事件句`,
      });
    }
  }
  // 终章收束声明：末章 CEN/mustCover/hookText 至少一处收束信号（纯 prompt 约束
  // 无守卫的补丁——g38f r3 主轮 ch200 以「崔相饮鸩」新钩子收尾无人拦）
  if (opts?.isFinale) {
    const finaleText = [bp.CEN, ...bp.mustCover, bp.hookText ?? ''].join('\n');
    if (!hasFinaleClosureSignal(finaleText)) {
      issues.push({
        chapterNumber: bp.orderIndex,
        kind: 'finale-not-closing',
        detail: `第${bp.orderIndex}章是全书末章，CEN/mustCover 缺少收束声明（尘埃落定/终局/归处/新秩序等），禁止以新危机钩子收尾`,
      });
    }
  }
  // 收束弧分工（2026-10-08 r19 终章三轮实证：单章装不下「对决+清算+立制+回响」
  // 必然速通弃读）：终批倒数第二章应承载清算/立制/交代类场面节点——候选网
  // 词面检查，问题进修复轮（agent 按语境改写，不硬拒）
  if (opts?.isPenultimateFinale) {
    const penultimateText = [bp.CBN, ...bp.CPNs, bp.CEN, ...bp.mustCover].join('\n');
    if (!/清算|伏法|伏诛|下狱|定谳|册封|封赏|革职|抄家|立制|改制|面圣|颁诏|新秩序|整肃|善后|归宿|结局交代|各得其所|尘埃落定/u.test(penultimateText)) {
      issues.push({
        chapterNumber: bp.orderIndex,
        kind: 'finale-arc-division',
        detail: `第${bp.orderIndex}章是全书倒数第二章（收束弧前哨），蓝图缺少清算/立制/交代类场面节点（反派伏法/册封立制/配角结局任一）——按收束弧两章分工，本章应承载这些收束场面，末章只留终极对决+收束句；单章塞满全部收束会被读者判速通弃读`,
      });
    }
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

/** 单章质检缺陷总数（含锁定伏笔），供修复轮「越修越坏」对比 */
function blueprintDefectCount(
  bp: ChapterBlueprint,
  foreshadows: ForeshadowTimingHint[]
): number {
  return (
    inspectRolledBlueprintQuality(bp).length +
    findLockedForeshadowViolations([bp], foreshadows).length
  );
}

/**
 * 命运锁角色解除核查（名称命中=格式级检测，语义归修复轮 AI）：
 * 批内蓝图提及命运锁角色但整批没有带【解除】标记的节点时，把命中章送进定点
 * 修复轮，由修复模型裁决双分支——真自由身则补显式解除事件（越狱/平反/保释
 * 并加「【解除】角色名」标记），在押/回忆场景则保持现状。
 * 2026-09-06 g38f-r2fix-100ch 实证：主角获释被压成一句回述、台账下狱态滞后
 * 10 章，判官连续拒稿靠绕过通过——解除事件必须在大纲层显式成节点。
 * 注意：不计入 blueprintDefectCount（避免在押场景的正常提及污染「越修越坏」守卫）。
 */
export function findFateReleaseCheck(
  blueprints: ChapterBlueprint[],
  fateLocks: Array<{ name: string; state?: string }>
): RolledBlueprintIssue[] {
  const issues: RolledBlueprintIssue[] = [];
  const locks = fateLocks
    .map(lock => ({ name: (lock.name ?? '').trim(), state: lock.state }))
    .filter(lock => lock.name.length >= 2 && lock.name.length <= 8);
  if (locks.length === 0 || blueprints.length === 0) return issues;
  const textOf = (bp: ChapterBlueprint) =>
    [bp.CBN, bp.CEN, bp.summary, ...bp.CPNs, ...bp.mustCover].filter(Boolean).join('\n');
  for (const lock of locks) {
    const hitChapters = blueprints
      .filter(bp => textOf(bp).includes(lock.name))
      .map(bp => bp.orderIndex);
    if (hitChapters.length === 0) continue;
    const releaseMarked = blueprints.some(bp =>
      bp.mustCover.some(item => item.includes('【解除】') && item.includes(lock.name))
    );
    if (releaseMarked) continue;
    issues.push({
      chapterNumber: hitChapters[0],
      kind: 'fate-release-check',
      detail:
        `命运锁角色「${lock.name}」（${lock.state ?? '终态'}）在本批第${hitChapters.join('、')}章的节点中被提及，` +
        `但整批没有带【解除】标记的显式解除事件。核查每个提及处：若为其自由身活动，` +
        `必须在本批安排一次显式解除场景（越狱/劫狱/平反/保释/官复原职）并把对应 mustCover ` +
        `节点改写为以「【解除】${lock.name}」开头；若为在押/押解/回忆/提及场景，保持现状不改`,
    });
  }
  return issues;
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

/**
 * 可取消的退避等待：signal 触发后立即返回（由调用方检查 signal 决定后续），
 * 避免用户取消后还要白等满退避时间。
 */
function delayUnlessAborted(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise(resolve => setTimeout(resolve, ms));
  if (signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
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
    if (signal?.aborted) throw new Error(`滚动续纲批次 ${batchLabel} 已取消`);
    try {
      const generated = await caller(system, user, temperature);
      if (generated.trim()) return generated;
      lastError = new Error('空响应');
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
    if (attempt < MAX_ATTEMPTS) {
      await delayUnlessAborted(Math.min(2000 * 2 ** (attempt - 1), 10_000), signal);
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
  // 终章判定基准（finalBatch/isFinale 共用）：大纲规划章数可能大于本轮写作终点
  // （如 plannedCap=214 vs MOLIU_CHAPTER_COUNT=200），取两者较小者——写作终点章
  // 就是读者看到的末章，必须按终章收束，不能当 214 章书的中段章
  const effectiveCap = Number.isFinite(plannedCap)
    ? Math.min(plannedCap, params.maxChapters ?? Number.POSITIVE_INFINITY)
    : (params.maxChapters ?? Number.POSITIVE_INFINITY);
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
      // 终卷批次：本批触顶全书 plannedChapterCount 时注入收束硬约束——滚纲此前
      // 与中段批次用同一份提示词（约束 5 还在把高潮推离尾部），200 章书收在
      // 「面圣亮牌前一秒」的半空（2026-09-10 glm r2 实证：结尾不收束 S1）。
      // 终章判定取 min(plannedCap, 本轮写作终点 maxChapters)：大纲规划章数（如 214）
      // 可能大于实际写作章数（MOLIU_CHAPTER_COUNT=200），只认 plannedCap 会让写作
      // 终点章被当中段章、收束约束静默跳过（2026-09-15 g38f r4 ch200 实证：
      // plannedCap=214 未触发，末章按拜相+清丈分田新钩收尾）
      finalBatch: effectiveCap !== Number.POSITIVE_INFINITY && toChapter >= effectiveCap
        ? { totalChapters: effectiveCap, lastChapter: toChapter }
        : undefined,
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
  // + 伏笔兑现方向（埋设后回收前的高覆盖=提前兑现，2026-09-06 ch36 实证）
  // 合并进下一轮定点修复，修复轮提示词已支持「本次必须修掉的问题」注入。
  const rollForeshadows: ForeshadowTimingHint[] = (project.foreshadows ?? []).map(f => ({
    hint: f.hint,
    createdChapter: f.createdChapter,
    setupChapter: (f as unknown as { setupChapter?: number }).setupChapter,
    payoffChapter: f.payoffChapter ?? f.suggestedResolutionChapter,
  }));
  const qualityIssues = [
    ...[...blueprints.values()].flatMap(bp =>
      inspectRolledBlueprintQuality(bp, {
        // 终批末章带收束声明检查：终卷收束硬约束此前是纯 prompt 约束
        isFinale:
          effectiveCap !== Number.POSITIVE_INFINITY &&
          bp.orderIndex >= toChapter &&
          toChapter >= effectiveCap,
        // 收束弧两章分工（2026-10-08）：终批倒数第二章检查（终批≥2 章才有）
        isPenultimateFinale:
          effectiveCap !== Number.POSITIVE_INFINITY &&
          toChapter >= effectiveCap &&
          bp.orderIndex === toChapter - 1 &&
          bp.orderIndex >= fromChapter,
      }),
    ),
    ...findBlueprintRepetition([...blueprints.values()]),
    ...findLockedForeshadowViolations([...blueprints.values()], rollForeshadows),
    // 登场锁确定性扫描（2026-09-29 r15fix-reg20 ch18 实证：revealTiming=第35章的
    // 老皇帝被排进 ch18——prompt 锁是概率性的，词面扫描兜成确定性）
    ...findRevealTimingViolations(
      [...blueprints.values()],
      (project.characters ?? []).map(character => ({
        name: character.name,
        role: character.role,
        revealTiming: (character as { profile?: { revealTiming?: string } }).profile
          ?.revealTiming,
      })),
    ).map(violation => ({
      chapterNumber: violation.chapterNumber,
      kind: 'reveal-timing' as const,
      detail: describeRevealTimingViolation(violation),
    })),
    // 爽点节奏(2026-10-01 P1.1 跨章节奏账本):streak(连续同类型=同质化,修法
    // 明确)纯计数零误报,并入定点修复轮;missing(标注缺失)只记 warning——
    // 「字段没填」≠「正文没爽点」,旧格式蓝图会全量命中,推入修复轮是过度反应。
    // 批内检测——跨批 streak(前批末+本批首)由 completer 全量扫描兜底
    ...findCoolPointPacingIssues([...blueprints.values()])
      .filter(issue => issue.kind === 'coolpoint-streak')
      .map(issue => ({
        chapterNumber: issue.chapterNumber,
        kind: 'coolpoint-pacing' as const,
        detail: issue.detail,
      })),
  ];
  // 悬念悬空(2026-10-01 P1.1):词面是承接的下限证据——换措辞承接会漏报、
  // 氛围型钩子会误报,只进 warnings 观察项供 triage/书审聚合,不进修复轮
  // (fail-closed 误报比漏报致命)。检测集 = 前序规划尾窗(承接方在本批)
  // + 本批蓝图;批末窗口不完整章由检测器内部豁免,下一轮滚纲自然覆盖。
  // coolpoint-missing 同级进 warnings(见上)。
  const priorPlannedTail = chapterNodesSorted(project.plotOutline ?? [])
    .filter(node =>
      (node.orderIndex ?? 0) + 1 < fromChapter &&
      Boolean(node.CEN?.trim()))
    .slice(-SUSPENSE_CARRY_WINDOW)
    .map(node => ({
      orderIndex: (node.orderIndex ?? 0) + 1,
      CEN: node.CEN ?? '',
    }));
  for (const issue of [
    ...findSuspenseDanglingIssues([
      ...priorPlannedTail,
      ...[...blueprints.values()],
    ]),
    ...findCoolPointPacingIssues([...blueprints.values()])
      .filter(i => i.kind === 'coolpoint-missing'),
  ]) {
    warnings.push(`节奏账本·${issue.kind === 'suspense-dangling' ? '悬念' : '爽点'}:第${issue.chapterNumber}章 ${issue.detail}`);
  }
  // 命运锁解除核查（修复提示级，不计缺陷守卫）：命中章并入定点修复，
  // 由修复模型裁决「补解除节点 / 在押回忆保持」双分支（语义不本地判）。
  const fateReleaseIssues = findFateReleaseCheck(
    [...blueprints.values()],
    base.fateLockEntries.map(entry => ({ name: entry.name, state: entry.state })),
  );
  const problematicChapters = [
    ...new Set([
      ...qualityIssues.map(issue => issue.chapterNumber),
      ...fateReleaseIssues.map(issue => issue.chapterNumber),
    ]),
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
        ...fateReleaseIssues
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
        // repairTargets 含「整块缺失」的章（AI 首轮未返回该章蓝图），此时无原稿
        // 可比：缺失章拿到修复稿是纯增益，按 +∞ 计数永不回退（2026-09-10 glm
        // 200 章实测 6 次定点修复崩于此：blueprintDefectCount(undefined) 读
        // mustCover 抛错，整批修复稿被丢弃）。
        const existing = blueprints.get(n);
        const beforeCount = existing
          ? blueprintDefectCount(existing, rollForeshadows)
          : Number.MAX_SAFE_INTEGER;
        const afterCount = blueprintDefectCount(next, rollForeshadows);
        // 注意：原稿无缺陷（beforeCount=0）时同样不得劣化，否则干净的原稿会被带病修复稿替换
        if (afterCount > beforeCount) {
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

/**
 * 大纲内容质检（确定性规则，零 AI 请求）。
 *
 * `inspectOutlineQuality` 产出占位事件 / 模板话术 / 禁区全块复制 / 卷卖点未覆盖 /
 * 区间断档 / 括号未配对 / 开篇钩子超长 / 金手指晚兑现 / mustCover 跨章等 issue 清单。
 * 清单是 OutlineToolkit.run_checks 的 qualityIssues 来源：由大纲 agent 按条修复，
 * 本文件不再发起「审查+修正」整份重写请求（P3 起该路径已由 agent 回合取代）。
 */
import {
  isCrossChapterGoal,
  splitPlotClauses,
} from '@/services/story-runtime/chapterBlueprintNormalize';
import type { ExecutableOutline } from '../types/executable-outline';
import { inspectOutlineCompleteness, OUTLINE_COMPLETENESS_POLICY } from '../validation/outlineCompleteness';
import {
  findLockedForeshadowViolations,
  type ForeshadowTimingHint,
} from '../rolling/outline-roller';

const STARTUP_PACK_HEADING = `前${OUTLINE_COMPLETENESS_POLICY.startupChapterCount}章启动包`;

export type OutlineQualityIssueKind =
  | 'placeholder-events'
  | 'template-cbn'
  | 'duplicated-forbidden'
  | 'missing-selling-point'
  | 'broken-range'
  | 'unbalanced-paren'
  | 'opening-hook'
  | 'goldenfinger-late-reveal'
  | 'over-scoped-mustcover'
  | 'invalid-blueprint-format'
  | 'foreshadow-timing-violation'
  | 'repeated-beat'
  | 'inconsistent-story-scale'
  | 'chapter-reference-out-of-range'
  | 'unknown-character-reference'
  | 'protagonist-name-mismatch';

export interface OutlineQualityIssue {
  kind: OutlineQualityIssueKind;
  blockIndex?: number;
  /** 单章蓝图（chapterBlueprints）中的章号（1-based），与 blockIndex 区分 */
  chapterOrder?: number;
  detail: string;
}

/**
 * 开篇钩子长度上限（P1-1 统一阈值）。
 * prompt 目标 30 字，这里给 5 字浮动空间作为"触发修正"阈值，
 * 与 topicDiscovery real harness 的 soft issue 阈值一致。
 */
export const OPENING_HOOK_LIMIT = 35;

/** 占位型必出事件：对模型零信息量，拆章后 CBN/CPNs/mustCover 全被占位 */
const PLACEHOLDER_EVENT_RE =
  /^(推进|推动|展开|继续|完成).{0,6}(主线|剧情|情节|冲突|目标|当前|本区间)?$/u;
const PLACEHOLDER_EVENT_LITERALS = new Set([
  '推进主线',
  '推进本区间主线',
  '推进当前情节',
  '推进主要冲突',
  '主线推进',
  '待定',
  '略',
  '后续展开',
]);

/** 拆章后会被当成履约硬约束的模板话术（与 chapterBlueprintNormalize 的检测口径一致） */
const TEMPLATE_CBN_RE = /^(承接上章结尾|承接前段|承接前章结尾继续|开场承接|承接上章危机后继续推进)[：:]/u;

/** 解析 "1-5章" 区间的起止章号 */
export function parseChapterRange(range: string): { start: number; end: number } | null {
  const match = (range ?? '').match(/(\d+)\s*[-~～至到]\s*(\d+)/u);
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]) };
}

/**
 * 大纲内容质检：产出违反项清单（供修正 prompt 使用 + 初稿/修正稿优劣对比）。
 */
export function inspectOutlineQuality(outline: ExecutableOutline): OutlineQualityIssue[] {
  const issues: OutlineQualityIssue[] = [];
  if (!outline) return issues;

  // 0. 开篇钩子：为空或超过 35 字。
  //    阈值梯度（P1-1 统一）：prompt 目标 30 字 → reviewer 35 字触发修正 → harness 35 字记 soft issue。
  //    35 字给模型 5 字浮动空间，避免 30 字过严导致 reviewer 频繁触发二次请求拖慢生成。
  //    此处先 trim 再判空/判长（比 harness 更严：纯空白串与首尾空格按更严格口径处理）
  const openingHook = (outline.startupPack30?.openingHook ?? '').trim();
  if (!openingHook) {
    issues.push({ kind: 'opening-hook', detail: '开篇钩子为空' });
  } else if (openingHook.length > OPENING_HOOK_LIMIT) {
    issues.push({
      kind: 'opening-hook',
      detail: `开篇钩子过长（${openingHook.length} 字 > ${OPENING_HOOK_LIMIT}）：${openingHook.slice(0, 30)}…`,
    });
  }

  const blocks = outline.startupPack30?.chapterBlocks ?? [];

  // 1. 占位 / 超长 / 括号未配对 必出事件
  blocks.forEach((block, index) => {
    const events = (block.mustEvents ?? [])
      .map(event => (event ?? '').trim())
      .filter(Boolean);

    // 1a. 占位 / 超长（逐条判定）
    events.forEach(text => {
      if (PLACEHOLDER_EVENT_LITERALS.has(text) || PLACEHOLDER_EVENT_RE.test(text)) {
        issues.push({
          kind: 'placeholder-events',
          blockIndex: index,
          detail: `第 ${index + 1} 块必出事件「${text}」是占位话术，拆章后 CBN 无信息量`,
        });
      } else if (text.length > 40) {
        issues.push({
          kind: 'placeholder-events',
          blockIndex: index,
          detail: `第 ${index + 1} 块必出事件「${text.slice(0, 30)}…」超过 40 字，非单章可兑现事件`,
        });
      }
    });

    // 1b. 括号配对（block 级综合判定）。
    // 先逐条统计开/闭括号定位未配对条目，再看整个 block 合并后是否配对，
    // 区分两种高频错误（修正 prompt 据此给出针对性指令）：
    //   - 跨事件拆分：单条未闭合，但 block 合并后配对（括号内容被切到下一条事件）
    //   - 真漏括号：单条未闭合，block 合并后仍不配对
    // 之前逐条单独报"开X/闭Y"，无法表达"跨事件拆分"这层语义，修正稿反复修不好。
    const perEvent = events.map(text => ({
      opens: (text.match(/（/gu) ?? []).length,
      closes: (text.match(/）/gu) ?? []).length,
      text,
    }));
    const unbalanced = perEvent.filter(s => s.opens !== s.closes);
    if (unbalanced.length > 0) {
      const totalOpens = perEvent.reduce((sum, s) => sum + s.opens, 0);
      const totalCloses = perEvent.reduce((sum, s) => sum + s.closes, 0);
      const isCrossEvent = totalOpens === totalCloses && totalOpens > 0;
      const hint = isCrossEvent
        ? `括号跨事件拆分（block 合并后 开${totalOpens}/闭${totalCloses} 配平，但单条未闭合，须把括号内容并入同一条或删除括号）`
        : `括号未配对（block 合并后 开${totalOpens}/闭${totalCloses} 仍不匹配）`;
      for (const s of unbalanced) {
        issues.push({
          kind: 'unbalanced-paren',
          blockIndex: index,
          detail: `第 ${index + 1} 块必出事件「${s.text.slice(0, 30)}…」${hint}（本条 开${s.opens}/闭${s.closes}）`,
        });
      }
    }
  });

  // 2. 模板话术（承接上章结尾 / 推进至 等）泄漏进块级字段
  blocks.forEach((block, index) => {
    const samples = [block.objective, block.hookRequirement, block.readerExpectation].filter(
      (item): item is string => typeof item === 'string' && !!item.trim()
    );
    for (const sample of samples) {
      if (TEMPLATE_CBN_RE.test(sample.trim())) {
        issues.push({
          kind: 'template-cbn',
          blockIndex: index,
          detail: `第 ${index + 1} 块含模板话术「${sample.trim().slice(0, 40)}」，会被当成履约硬约束`,
        });
        break;
      }
    }
  });

  // 3. 禁区连续 3 块及以上完全相同（全章复制的强信号；相邻 2 块相同是常态，
  //    禁区跨区间持续生效本就合理，避免对好初稿触发无谓的修正请求）
  for (let i = 2; i < blocks.length; i += 1) {
    const a = (blocks[i - 2]?.forbiddenZones ?? []).join('|');
    const b = (blocks[i - 1]?.forbiddenZones ?? []).join('|');
    const c = (blocks[i]?.forbiddenZones ?? []).join('|');
    if (a && b && c && a === b && b === c) {
      issues.push({
        kind: 'duplicated-forbidden',
        blockIndex: i,
        detail: `第 ${i - 1} 至第 ${i + 1} 块禁区完全相同「${c.slice(0, 40)}」，疑为全章复制`,
      });
      break;
    }
  }

  // 4. 卷卖点未在启动包形成回响（开篇承诺与卷高潮脱节）。
  //    只查卷 climax 的"场景型卖点"；objective 整体跳过（弧线/范围陈述，见下）。
  //    匹配用「实体回响」而非逐字 includes：climax 是卷末高潮场景（约 46-60 章兑现），
  //    开篇本就不该逐字复刻它，逐字检查模型无法合法满足——2026-08-16 双模型矩阵实测
  //    3 轮 review 全由该检查触发，且 luna 的修正稿为凑逐字命中把卷末高潮硬塞进
  //    46-50 章必出事件并全文复读同一句，结构退化 0→3 被拒，每轮白烧 1-3 个请求。
  //    回响判定：从 climax 从句抽取人名等实体关键词（≥2 字中文词），要求启动包
  //    文本覆盖过半（≥50%）；从句数多时只看单条覆盖率，不要求全部从句都命中。
  const volume = outline.volumePlan?.[0];
  if (volume) {
    const packText = [
      outline.startupPack30?.openingHook,
      outline.startupPack30?.firstMajorCoolPoint,
      ...blocks.flatMap(block => [
        ...(block.coolPoints ?? []),
        block.readerExpectation,
        block.objective,
      ]),
    ]
      .filter((item): item is string => typeof item === 'string' && !!item.trim())
      .join(' ');
    const sellingClauses = splitPlotClauses(stripMeta(volume.climax));
    // 权威实体列表：主角名 + 登记角色名（回响检查的唯一判定依据）
    const knownNames = [
      outline.storyEngine?.protagonistName,
      ...(outline.keyCharacters ?? []).map(character => character?.name),
    ].filter((name): name is string => typeof name === 'string' && !!name.trim());
    for (const clause of sellingClauses) {
      if (clause.length < 8) continue;
      if (/^(完成|建立|让|使|实现|达成|推动)/u.test(clause)) continue;
      const { mentioned } = collectCharacterEcho(clause, knownNames);
      // 从句不含任何角色名 → 无从判定回响（纯场景描述），跳过
      if (mentioned.length === 0) continue;
      const hit = mentioned.filter(name => packText.includes(name));
      if (hit.length === 0) {
        issues.push({
          kind: 'missing-selling-point',
          detail: `卷级卖点「${clause.slice(0, 40)}」的关键角色（${mentioned.join('、')}）均未在${STARTUP_PACK_HEADING}登场，开篇承诺与卷高潮脱节`,
        });
        break;
      }
    }
  }

  // 5. 区间断档 / 重叠
  for (let i = 1; i < blocks.length; i += 1) {
    const prev = parseChapterRange(blocks[i - 1]?.range ?? '');
    const curr = parseChapterRange(blocks[i]?.range ?? '');
    if (prev && curr && curr.start > prev.end + 1) {
      issues.push({
        kind: 'broken-range',
        blockIndex: i,
        detail: `第 ${i} 块区间 ${blocks[i - 1]?.range} 与第 ${i + 1} 块区间 ${blocks[i]?.range} 断档（${prev.end + 1}–${curr.start - 1} 章缺失）`,
      });
      break;
    }
  }

  // 6. 金手指首次兑现过晚（P2-2：黄金三章纪律）。
  //    金手指首次兑现应落在 1-3 章（绑定开篇爽点），超过 5 章视为错过黄金窗口。
  //    reviewer 触发后会提示模型把兑现前移；缺省（无 goldenfingerPlan）不报，避免误伤非玄幻品类。
  const gf = outline.goldenfingerPlan;
  if (gf?.type && gf.firstRevealChapter !== null && gf.firstRevealChapter !== undefined) {
    if (gf.firstRevealChapter > 5) {
      issues.push({
        kind: 'goldenfinger-late-reveal',
        detail: `金手指首次兑现章节为第${gf.firstRevealChapter}章（>5），错过黄金三章窗口，建议前移到 1-3 章绑定开篇爽点`,
      });
    }
  }

  // 7. 单章蓝图 mustCover 含整卷/全书级跨章目标（防御纵深）。
  //    真实回归：smoke:storyflow:real 实测——AI 把卷级 objective 写进单章 mustCover，
  //    下游 chapter-judge 持续判未履约 → 持久错误重试耗尽 → 死循环。
  //    解析期已有一道剔除（expanded-outline-parser.sanitizeChapterBlueprintMustCover），
  //    这里是第二层：触发后会让 reviewer 发起二次请求重写蓝图，从 AI 产出层面纠正。
  //    判定复用 story-runtime 的 isCrossChapterGoal（已覆盖时限/威胁/流程式/弧线终态式跨章目标）。
  //    每章最多报 1 条（避免单章多条刷屏），整批最多报 3 条（避免修正 prompt 过长）。
  const blueprints = outline.chapterBlueprints ?? [];
  let overScopedReported = 0;
  for (const blueprint of blueprints) {
    if (overScopedReported >= 3) break;
    const overScoped = (blueprint.mustCover ?? []).find(node => isCrossChapterGoal(node));
    if (overScoped) {
      issues.push({
        kind: 'over-scoped-mustcover',
        chapterOrder: blueprint.orderIndex,
        detail: `第${blueprint.orderIndex}章 mustCover 含整卷/全书级跨章目标「${overScoped.slice(0, 30)}」，单章无法兑现会触发续写履约死循环，必须改为单章可兑现的具体事件（如把「完成…逆转」改为「主角首次用X手段解决Y具体问题」）`,
      });
      overScopedReported += 1;
    }
  }


  // 8. 逐章蓝图格式契约。提示词要求必须由代码二次验证，不能把模型“尽量遵守”
  // 当作可应用保证。每章合并为一条 issue，避免修正提示词膨胀。
  for (const blueprint of blueprints) {
    const defects: string[] = [];
    const titleLength = blueprint.title.trim().length;
    const cbnLength = blueprint.CBN.trim().length;
    const cenLength = blueprint.CEN.trim().length;
    if (titleLength < 6 || titleLength > 16) defects.push(`标题 ${titleLength} 字，应为 6～16 字`);
    if (cbnLength < 8 || cbnLength > 25) defects.push(`CBN ${cbnLength} 字，应为 8～25 字`);
    if (cenLength < 8 || cenLength > 25) defects.push(`CEN ${cenLength} 字，应为 8～25 字`);
    if (blueprint.CPNs.length < 1 || blueprint.CPNs.length > 3) {
      defects.push(`CPN ${blueprint.CPNs.length} 个，应为 1～3 个`);
    }
    if (defects.length > 0) {
      issues.push({
        kind: 'invalid-blueprint-format',
        chapterOrder: blueprint.orderIndex,
        detail: `第${blueprint.orderIndex}章格式不合格：${defects.join('；')}`,
      });
    }
  }

  // 9. 跨模块语义一致性。大纲各节是同一份合同的不同投影：角色、章数、字数
  // 任一处不一致都不能靠下游“猜”。复用最终可应用门禁，保证审查与落库口径一致。
  const semanticKinds = new Set([
    'inconsistent-story-scale',
    'chapter-reference-out-of-range',
    'unknown-character-reference',
    'protagonist-name-mismatch',
  ]);
  for (const blocker of inspectOutlineCompleteness(outline).blockers) {
    if (!semanticKinds.has(blocker.kind)) continue;
    issues.push({
      kind: blocker.kind as OutlineQualityIssueKind,
      chapterOrder: blocker.chapterNumber,
      detail: blocker.message,
    });
  }

  // 10. 伏笔时点×章蓝图交叉（初版批次此前不过检）。滚纲修复轮的
  // findLockedForeshadowViolations 只挂在 roll 路径，初版 expand 产物自带
  // foreshadowPlan 却从不与 chapterBlueprints 对账——2026-09-06 g38f-200chr2
  // ch36 实证：初版节点第 36 章「当众颁布三级网格考成法」vs 伏笔第 45 章才
  // 揭示，5 次拒稿整章死；reg20 同族（伏笔标 18 章反杀下狱、蓝图 3 章执行）。
  const timingHints: ForeshadowTimingHint[] = (outline.foreshadowPlan ?? [])
    .filter(f => f && (f.hint ?? '').trim().length >= 4)
    .map(f => ({
      hint: f.hint,
      setupChapter: f.setupChapter ?? undefined,
      payoffChapter: f.payoffChapter ?? undefined,
    }));
  const chapterBlueprints = outline.chapterBlueprints ?? [];
  if (timingHints.length > 0 && chapterBlueprints.length > 0) {
    for (const violation of findLockedForeshadowViolations(chapterBlueprints, timingHints)) {
      issues.push({
        kind: 'foreshadow-timing-violation',
        chapterOrder: violation.chapterNumber,
        detail: violation.detail,
      });
    }
  }

  // 11. 重复节拍（初版批次内）：两个相隔 ≥3 章的蓝图若共享 ≥6 字连续段且
  // 同涉一名主要角色，视为同一事件/擢升/道具的重复兑现。reg20 实证：第 8 章
  // 与第 47 章「特旨擢升顾明章为正五品通政司右参议」逐字重复、第 3 章与第 42
  // 章同一张项目甘特图两次击倒同一反派——读者审标记为大高潮情绪回报被稀释。
  // 文档频率过滤（reg70 实测补丁）：出现在 ≥4 章的 6-gram 是场景地标/套话
  // （「在户部衙门与」×15 章），不构成重复节拍——真重复是只出现 2~3 次的
  // 稀有短语。统计判据，不涉语义正则。
  // 是否真重复由大纲 agent 修复回合裁决改写。
  const keyNames = (outline.keyCharacters ?? [])
    .map(c => (c?.name ?? '').trim())
    .filter(name => name.length >= 2);
  if (chapterBlueprints.length > 1 && keyNames.length > 0) {
    const beatItems = chapterBlueprints.map(bp => {
      const text = [bp.title, bp.summary, bp.CBN, bp.CEN, ...bp.CPNs, ...bp.mustCover]
        .filter(Boolean)
        .join('\n');
      const cjk = text.replace(/[^\u4e00-\u9fff]+/gu, '');
      const grams = new Set<string>();
      for (let i = 0; i + 6 <= cjk.length; i += 1) grams.add(cjk.slice(i, i + 6));
      return {
        order: bp.orderIndex,
        grams,
        names: keyNames.filter(name => text.includes(name)),
      };
    }).filter(item => item.grams.size > 0 && item.names.length > 0);
    // 文档频率：gram 出现在几个蓝图里
    const gramDf = new Map<string, number>();
    for (const item of beatItems) {
      for (const gram of item.grams) gramDf.set(gram, (gramDf.get(gram) ?? 0) + 1);
    }
    const isRare = (gram: string) => (gramDf.get(gram) ?? 0) <= 3;
    for (let a = 0; a < beatItems.length; a += 1) {
      for (let b = a + 1; b < beatItems.length; b += 1) {
        const left = beatItems[a];
        const right = beatItems[b];
        if (Math.abs(left.order - right.order) < 3) continue;
        if (!left.names.some(name => right.names.includes(name))) continue;
        let shared: string | null = null;
        for (const gram of left.grams) {
          if (!isRare(gram)) continue;
          if (right.grams.has(gram)) {
            shared = gram;
            break;
          }
        }
        if (!shared) continue;
        issues.push({
          kind: 'repeated-beat',
          chapterOrder: right.order,
          detail:
            `第${left.order}章与第${right.order}章存在近重复节拍（共享「${shared}」且同涉角色` +
            `${left.names.find(name => right.names.includes(name))}）。同一事件/擢升/道具/对手` +
            `不应重复兑现：把第${right.order}章改写为该线索的新进展或换用新对抗手段`,
        });
      }
    }
  }

  return issues;
}

function stripMeta(text: string): string {
  return (text ?? '')
    .replace(/[；;].*读者期待.*$/u, '')
    .replace(/读者期待[：:][^；;]*/gu, '')
    .trim();
}

/** 从句里出现过的角色名（回响判定的唯一依据） */
function collectCharacterEcho(
  clause: string,
  knownCharacterNames: string[],
): { mentioned: string[]; } {
  const mentioned: string[] = [];
  for (const name of knownCharacterNames) {
    const trimmed = (name ?? '').trim();
    if (trimmed.length >= 2 && clause.includes(trimmed)) {
      mentioned.push(trimmed);
    }
  }
  return { mentioned };
}

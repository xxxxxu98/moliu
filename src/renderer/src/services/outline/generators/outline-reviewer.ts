/**
 * 大纲审查与修正（方案 A）
 *
 * 在 expandDirection 生成初稿后、返回前，发起一次“审查+修正”二次 AI 请求：
 * - 先按规则检查初稿内容质量（占位事件 / 模板话术 / 禁区全章复制 / 卷卖点未覆盖 / 区间断档 / 括号未配对）；
 * - 有问题的初稿才发起修正请求（低温稳定重出，要求保持原模板结构、只改问题点）；
 * - 修正稿解析失败或质量未提升时回退初稿（绝不阻塞主流程）。
 *
 * 质检规则与修正提示词共用同一份 issue 清单：规则先产出问题，prompt 要求按问题逐条修。
 */
import {
  isCrossChapterGoal,
  splitPlotClauses,
} from '@/services/story-runtime/chapterBlueprintNormalize';
import type { GenerateOptions } from './unified-generator';
import type { OutlineDirection } from '../types/direction';
import type { ExecutableOutline } from '../types/executable-outline';
import { parseExpandedOutline } from '../parser/expanded-outline-parser';
import { inspectOutlineCompleteness } from '../validation/outlineCompleteness';

export type OutlineQualityIssueKind =
  | 'placeholder-events'
  | 'template-cbn'
  | 'duplicated-forbidden'
  | 'missing-selling-point'
  | 'broken-range'
  | 'unbalanced-paren'
  | 'opening-hook'
  | 'goldenfinger-late-reveal'
  | 'over-scoped-mustcover';

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

  // 4. 卷卖点未在启动包覆盖（开篇承诺与卷高潮脱节）。
  //    只要求"场景型卖点"（卷高潮/具体画面）出现在启动包；
  //    "完成/建立/让…"开头的卷目标是方向陈述，不要求逐字出现在开篇承诺。
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
    const sellingClauses = [
      ...splitPlotClauses(stripMeta(volume.climax)),
      ...splitPlotClauses(stripMeta(volume.objective)),
    ];
    for (const clause of sellingClauses) {
      if (clause.length < 8) continue;
      if (/^(完成|建立|让|使|实现|达成|推动)/u.test(clause)) continue;
      if (!packText.includes(clause)) {
        issues.push({
          kind: 'missing-selling-point',
          detail: `卷级卖点「${clause.slice(0, 40)}」未出现在前 30 章启动包（openingHook/coolPoints/readerExpectation）`,
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

  return issues;
}

function stripMeta(text: string): string {
  return (text ?? '')
    .replace(/[；;].*读者期待.*$/u, '')
    .replace(/读者期待[：:][^；;]*/gu, '')
    .trim();
}

function formatIssues(issues: OutlineQualityIssue[]): string {
  if (issues.length === 0) return '（无）';
  return issues
    .map((issue, index) => {
      const loc =
        issue.chapterOrder !== undefined
          ? ` 第${issue.chapterOrder}章`
          : issue.blockIndex !== undefined
            ? ` 第${issue.blockIndex + 1}块`
            : '';
      return `${index + 1}. [${issue.kind}]${loc} ${issue.detail}`;
    })
    .join('\n');
}

export interface OutlineReviewPrompt {
  system: string;
  user: string;
}

/**
 * 构建审查修正 prompt：要求模型基于问题清单输出修正后的完整主方案（保持模板结构）。
 */
export function buildOutlineReviewPrompt(params: {
  initialRawText: string;
  direction: OutlineDirection;
  issues: OutlineQualityIssue[];
}): OutlineReviewPrompt {
  const { initialRawText, direction, issues } = params;
  const system = `你是一名擅长中文长篇网文策划的资深故事架构师，同时担任大纲质检员。
用户会给你一份「主方案」初稿和一份质检问题清单。你的任务：
1. 逐条修复问题清单中列出的缺陷；
2. 修复时保持原模板的固定结构（## 故事定位 / ## 核心驱动 / ## 故事规模规划 / ## 四幕结构 / ## 卖点承载规划 / ## 卷纲 / ## 前30章启动包 / ## 核心角色 / ## 伏笔规划 等小节及字段名一律不变），只修改具体内容；
3. 不要重写整份方案、不要更换主角与核心卖点、不要增加新章节块；
4. 【必出事件硬约束】每个区间的「必出事件」必须是单章可兑现的独立事件：同一场景链合并为一条；每条事件 8～30 字一句话写完，禁止换行；
   【括号硬约束】禁止使用任何括号（中文（）或英文()），补充说明一律用逗号并入句中。若问题清单报"括号跨事件拆分"，说明初稿把一个括号拆到了两条事件里，修正时必须删除括号、把括号内容用逗号并入对应事件正文，确保修正后每条事件的开括号与闭括号各自配平；
5. 【开篇钩子硬约束】开篇钩子 30 字以内的单场景动作钩子；
6. 【单章 mustCover 硬约束】单章蓝图「## 单章蓝图」中每章的 mustCover 必须是单章可兑现的具体事件（一个场景、一次对决、一次破局），禁止写整卷或全书级目标（如「完成…逆转」「实现…复兴」「达成…统一」「打败…集团」「通过…考绩」等）。若问题清单报 over-scoped-mustcover，必须把目标拆成本章能完成的一个具体动作；
7. 若问题清单为（无）或已全部修复，原样输出主方案即可。
直接输出修正后的完整主方案 Markdown，不要任何前后解释文字。`;

  const user = `【方向卡】
${JSON.stringify(direction, null, 2)}

【质检问题清单】
${formatIssues(issues)}

【初稿主方案（请基于它修复，保持结构与字段名）】
${initialRawText}

请输出修正后的完整主方案。`;

  return { system, user };
}

export interface OutlineReviewResult {
  /** 采用后的最终文本（修正稿或回退的初稿） */
  rawText: string;
  /** 是否采用了修正稿 */
  applied: boolean;
  warnings: string[];
}

/**
 * 审查+修正执行：初稿无问题直接返回；有问题则发起二次请求，修正稿解析失败或质量未提升时回退初稿。
 * abort 异常向上抛（与生成器竞态语义一致）。
 */
export async function reviewAndFixOutline(params: {
  initialRawText: string;
  direction: OutlineDirection;
  options?: GenerateOptions;
  callStructuredTextMode: (
    system: string,
    user: string,
    options: GenerateOptions
  ) => Promise<string>;
}): Promise<OutlineReviewResult> {
  const { initialRawText, direction, callStructuredTextMode } = params;

  const initialOutline = parseExpandedOutline(initialRawText);
  if (!initialOutline) {
    return { rawText: initialRawText, applied: false, warnings: ['初稿无法解析，跳过审查修正'] };
  }
  const initialIssues = inspectOutlineQuality(initialOutline);
  if (initialIssues.length === 0) {
    return { rawText: initialRawText, applied: false, warnings: [] };
  }

  try {
    const { system, user } = buildOutlineReviewPrompt({
      initialRawText,
      direction,
      issues: initialIssues,
    });
    // 修正请求用低温（0.3）求稳定输出；signal 透传保持可取消
    const fixedRawText = await callStructuredTextMode(system, user, {
      ...(params.options ?? {}),
      temperature: 0.3,
    });
    const fixedOutline = parseExpandedOutline(fixedRawText);
    if (!fixedOutline) {
      return {
        rawText: initialRawText,
        applied: false,
        warnings: ['修正稿无法解析，回退初稿'],
      };
    }
    const initialCompleteness = inspectOutlineCompleteness(initialOutline);
    const fixedCompleteness = inspectOutlineCompleteness(fixedOutline);
    if (
      (initialCompleteness.canApply && !fixedCompleteness.canApply) ||
      fixedCompleteness.blockers.length > initialCompleteness.blockers.length
    ) {
      return {
        rawText: initialRawText,
        applied: false,
        warnings: [
          `修正稿结构完整性退化（阻断项 ${initialCompleteness.blockers.length}→${fixedCompleteness.blockers.length}），回退初稿`,
        ],
      };
    }
    const fixedIssues = inspectOutlineQuality(fixedOutline);
    if (fixedIssues.length >= initialIssues.length) {
      return {
        rawText: initialRawText,
        applied: false,
        warnings: [`修正稿质量未提升（${initialIssues.length}→${fixedIssues.length} 处问题），回退初稿`],
      };
    }
    return {
      rawText: fixedRawText,
      applied: true,
      warnings: [`大纲审查修正完成：修复 ${initialIssues.length - fixedIssues.length} 处问题`],
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (error instanceof Error && error.name === 'AbortError') throw error;
    const message = error instanceof Error ? error.message : String(error);
    return { rawText: initialRawText, applied: false, warnings: [`大纲审查修正失败，回退初稿：${message.slice(0, 120)}`] };
  }
}

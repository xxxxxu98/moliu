/**
 * 大纲读者判官闭环（2026-10-12 ⑥ 判官反向闭环第一期）。
 *
 * 把正文层验证过的「AI 判官 + 结构化 findings + 重写解锁」模式复制到大纲层：
 * 确定性门禁（completeness/quality）只测结构合规，测不出「读者不想看」——
 * 大纲分四连破线（r7 83.5→r6reg 84.3 红签）的根因正是这一层没有语义判价。
 *
 * 闭环：判官首评 → blocking 或 wouldStartReading=false → 带判官 findings 跑
 * 修复 agent（同 OutlineToolkit，判官问题进 kickoff 且优先级最高）→ 复评。
 * 预算：判官最多 2 次调用、修复 1 轮（best-effort：判官分是质量目标不是硬阻断，
 * fail-closed 仍由确定性 canApply 把关；判官不可用只降级为 warning）。
 */
import type {
  ExecutableOutline,
  OutlineReaderEvaluationSummary,
  OutlineReaderJudgePort,
} from '../types/executable-outline';

/**
 * 大纲读者分采纳门禁默认值（r23 实证缺口修复：判官首评「通过」≠ 大纲分达线——
 * g38f20reg2 首评通过但 reeval 83.8<85）。与 docs/quality-ledger/thresholds.json
 * 的 readerJudge.outline 同源，数值改动须两端同步（src 不直接读 docs 文件）。
 */
export const OUTLINE_SCORE_GATE_DEFAULT = 85;

export interface ReaderJudgeLoopRepairResult {
  rawText: string;
  outline: ExecutableOutline;
  canApply: boolean;
  blockers: string[];
  warnings: string[];
}

export interface ReaderJudgeLoopInput {
  rawText: string;
  outline: ExecutableOutline;
  judge: OutlineReaderJudgePort;
  context: { title?: string; genre?: string; targetReader?: string; positioning?: string };
  /**
   * 修复回执：拿到判官 findings 驱动 OutlineToolkit 修复（重写解锁）
   */
  repair: (input: {
    rawText: string;
    outline: ExecutableOutline;
    readerFeedback: {
      score: number;
      wouldStartReading: boolean;
      summary?: string;
      issues: Array<{ id: string; severity: string; description: string; blocking: boolean; suggestion?: string }>;
    };
  }) => Promise<ReaderJudgeLoopRepairResult>;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  /**
   * 大纲分采纳门禁（r23 实证缺口修复：判官首评「无 blocking+愿意开读」≠ 大纲分达线
   * ——g38f20reg2 生成期首评通过，事后 reeval 大纲 83.8<85。默认 85，与
   * docs/quality-ledger/thresholds.json 的 readerJudge.outline 同源，改动须两端同步。
   * 分数未达线同样触发修复轮；修复后仍未达线不阻断（fail-closed 仍由确定性门禁
   * 把关），落黄签 warning 供上层决策。
   */
  outlineScoreGate?: number;
}

export interface ReaderJudgeLoopResult {
  rawText: string;
  outline: ExecutableOutline;
  summary?: OutlineReaderEvaluationSummary;
  warnings: string[];
  /** 修复把结构改坏（canApply=false）时置 true，交回 fail-closed 主链 */
  severelyTruncated: boolean;
  /** 修复后的 blockers（未修复时为 undefined，沿用主链现状） */
  blockers?: string[];
}

function toSummary(
  judgement: Awaited<ReturnType<OutlineReaderJudgePort['evaluateOutline']>>,
  judgeRounds: number,
  repaired: boolean
): OutlineReaderEvaluationSummary {
  return {
    version: judgement.version,
    score: judgement.score,
    wouldStartReading: judgement.wouldStartReading,
    confidence: judgement.confidence,
    blockingIssues: judgement.issues.filter(issue => issue.blocking).length,
    totalIssues: judgement.issues.length,
    judgeRounds,
    repaired,
  };
}

function isAborted(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

/**
 * 跑判官闭环（导出供单测）。纯编排：判官/修复都由调用方注入。
 * 判官抛错：非取消类只降级 warning（判官不可用不挡大纲生成），取消原样上抛。
 */
export async function runOutlineReaderJudgeLoop(
  input: ReaderJudgeLoopInput
): Promise<ReaderJudgeLoopResult> {
  const evaluate = (outlineText: string) =>
    input.judge.evaluateOutline({
      context: input.context,
      outline: outlineText,
    });

  let first;
  try {
    first = await evaluate(input.rawText);
  } catch (error) {
    if (input.signal?.aborted || isAborted(error)) throw error;
    return {
      rawText: input.rawText,
      outline: input.outline,
      warnings: [
        `读者判官不可用，本轮跳过大纲语义闭环：${error instanceof Error ? error.message.slice(0, 120) : String(error)}`,
      ],
      severelyTruncated: false,
    };
  }

  const gate = input.outlineScoreGate ?? OUTLINE_SCORE_GATE_DEFAULT;
  const blocking = first.issues.filter(issue => issue.blocking);
  const gateMiss = first.score < gate;
  const pass = blocking.length === 0 && first.wouldStartReading !== false && !gateMiss;
  if (pass) {
    input.onProgress?.(`读者判官首评通过：score=${first.score}≥${gate}，无 blocking 问题`);
    return {
      rawText: input.rawText,
      outline: input.outline,
      summary: toSummary(first, 1, false),
      warnings: [],
      severelyTruncated: false,
    };
  }

  input.onProgress?.(
    `读者判官首评：score=${first.score}${gateMiss ? `（<${gate} 门禁未达线）` : ''}，blocking×${blocking.length}${first.wouldStartReading === false ? '，wouldStartReading=false' : ''}——驱动大纲修复回合`
  );
  const repaired = await input.repair({
    rawText: input.rawText,
    outline: input.outline,
    readerFeedback: {
      score: first.score,
      wouldStartReading: first.wouldStartReading,
      summary: first.summary,
      issues: first.issues,
    },
  });
  const warnings = [...repaired.warnings];
  if (!repaired.canApply) {
    // 修复把结构改坏：交回 fail-closed 主链（比带病通过更安全）
    return {
      rawText: repaired.rawText,
      outline: repaired.outline,
      warnings,
      severelyTruncated: true,
      blockers: repaired.blockers,
    };
  }

  let second;
  try {
    second = await evaluate(repaired.rawText);
  } catch (error) {
    if (input.signal?.aborted || isAborted(error)) throw error;
    warnings.push(`修复后复评失败（保留修复稿）：${error instanceof Error ? error.message.slice(0, 120) : String(error)}`);
    return {
      rawText: repaired.rawText,
      outline: repaired.outline,
      warnings,
      severelyTruncated: false,
      blockers: repaired.blockers.length > 0 ? repaired.blockers : undefined,
    };
  }
  const secondBlocking = second.issues.filter(issue => issue.blocking);
  if (secondBlocking.length < blocking.length || second.score > first.score) {
    warnings.push(
      `读者判官闭环：修复后 score ${first.score}→${second.score}，blocking ${blocking.length}→${secondBlocking.length}`
    );
  } else {
    warnings.push(
      `读者判官闭环：修复后未见改善（score ${first.score}→${second.score}，blocking ${blocking.length}→${secondBlocking.length}）——best-effort 保留修复稿，下一轮开题换方向而非再修`
    );
  }
  if (second.score < gate) {
    warnings.push(
      `大纲读者分 ${second.score} < ${gate} 门禁未达线（best-effort 不阻断生成；上线判定按 thresholds 口径计阻断，需换方向重开题而非继续修）`
    );
  }
  return {
    rawText: repaired.rawText,
    outline: repaired.outline,
    summary: toSummary(second, 2, true),
    warnings,
    severelyTruncated: false,
    blockers: repaired.blockers.length > 0 ? repaired.blockers : undefined,
  };
}

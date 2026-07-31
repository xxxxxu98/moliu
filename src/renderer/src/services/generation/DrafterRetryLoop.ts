/**
 * L4 生成层 - 起草重试循环
 *
 * 流程：
 *   1. 注入 CHANGES 协议（位置感知）→ 调 drafter
 *   2. 提取散文 + CHANGES
 *   3. （可选）调 L5 门禁审查
 *   4. 通过 → 返回；失败 → 构建反馈 prompt → 重试（最多 maxAttempts）
 *   5. 全失败 → 返回失败，并保留分数最高的尝试供诊断（不得提交）
 *
 * 这是"概率生成"和"确定性门禁"的衔接点。
 */

import { ChangesPromptInjector } from './ChangesPromptInjector';
import { ModelRouter } from './ModelRouter';
import { extractChanges } from '../state/ChangesProtocol';
import { normalizeWebnovelParagraphs } from '../writing/typesetting';
import type { ChangesPayload } from '../state/types';
import type { GatePipelineResult } from '../gates/types';

export type { PromptInjectionResult } from './ChangesPromptInjector';
export { ChangesPromptInjector } from './ChangesPromptInjector';
export type {
  ModelRole,
  ModelParameters,
  ModelRoutingConfig,
} from './ModelRouter';
export {
  ModelRouter,
  DEFAULT_ROUTING_CONFIG,
  DEFAULT_MODEL_PARAMS,
} from './ModelRouter';

// ============================================================
// 起草客户端接口（注入式，解耦具体 AI 服务）
// ============================================================

export interface DrafterClient {
  /** 执行一次起草。params.signal 用于真正中断底层 HTTP。 */
  draft(
    prompt: string,
    params: { temperature: number; maxTokens: number; signal?: AbortSignal },
  ): Promise<string>;
}

export interface RetryLoopOptions {
  /** 最大重试次数（含首次，默认 3） */
  maxAttempts?: number;
  /** 每次重试的时间限制（ms，默认 5 分钟） */
  timeLimitMs?: number;
  /** 是否在重试时附带门禁反馈 */
  includeGateFeedback?: boolean;
  /** 用户停止时 abort，中断在飞起草请求 */
  signal?: AbortSignal;
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  return false;
}

export interface DraftAttempt {
  /** 尝试序号（1-based） */
  attempt: number;
  /** 生成的原始输出 */
  rawOutput: string;
  /** 提取的散文 */
  prose: string;
  /** 提取的 CHANGES */
  changes: ChangesPayload | null;
  /** 该次的门禁结果（若执行了门禁） */
  gateResult?: GatePipelineResult;
  /** 耗时 ms */
  durationMs: number;
}

export interface RetryLoopResult {
  /** 是否成功（仅门禁通过时为 true） */
  success: boolean;
  /** 所有尝试记录 */
  attempts: DraftAttempt[];
  /** 通过的尝试，或失败时仅供诊断的最佳尝试 */
  bestAttempt: DraftAttempt | null;
  /** 总耗时 ms */
  totalDurationMs: number;
  /** 终止原因 */
  stopReason: 'passed' | 'max_attempts' | 'time_limit' | 'error';
}

// ============================================================
// 重试循环
// ============================================================

export class DrafterRetryLoop {
  constructor(
    private readonly drafter: DrafterClient,
    private readonly router: ModelRouter,
  ) {}

  /**
   * 执行重试循环。
   * @param basePrompt 基础起草 prompt（不含 CHANGES 协议）
   * @param gateRunner 门禁执行函数（可空，表示不做门禁只生成）
   * @param options 选项
   */
  async run(
    basePrompt: string,
    gateRunner: ((prose: string, changes: ChangesPayload | null) => Promise<GatePipelineResult>) | null,
    options: RetryLoopOptions = {},
  ): Promise<RetryLoopResult> {
    const {
      maxAttempts = 3,
      timeLimitMs = 5 * 60 * 1000,
      includeGateFeedback = true,
    } = options;

    const startTime = Date.now();
    const injector = new ChangesPromptInjector();
    const attempts: DraftAttempt[] = [];
    let currentPrompt = basePrompt;
    let bestAttempt: DraftAttempt | null = null;
    let bestScore = -1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (options.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      if (Date.now() - startTime > timeLimitMs) {
        return this.finalize(attempts, bestAttempt, startTime, 'time_limit');
      }

      // 注入 CHANGES 协议（首次含示例，重试时精简省 token）
      const injected = injector.inject(currentPrompt, { includeExamples: attempt === 1 });

      // 起草
      const draftStart = Date.now();
      const drafterParams = this.router.getParams('drafter');
      let rawOutput: string;
      try {
        rawOutput = await this.drafter.draft(injected.prompt, {
          ...drafterParams,
          signal: options.signal,
        });
      } catch (err) {
        if (isAbortError(err) || options.signal?.aborted) {
          throw err instanceof DOMException
            ? err
            : new DOMException('Aborted', 'AbortError');
        }
        const failedAttempt: DraftAttempt = {
          attempt,
          rawOutput: '',
          prose: '',
          changes: null,
          durationMs: Date.now() - draftStart,
        };
        attempts.push(failedAttempt);
        return this.finalize(attempts, bestAttempt ?? failedAttempt, startTime, 'error');
      }

      // 提取散文 + CHANGES，并做手机排版确定性拆段（零成本兜底）
      const extracted = extractChanges(rawOutput);
      const draftAttempt: DraftAttempt = {
        attempt,
        rawOutput,
        prose: normalizeWebnovelParagraphs(extracted.prose),
        changes: extracted.changes,
        durationMs: Date.now() - draftStart,
      };

      // 无门禁 → 直接返回首次
      if (!gateRunner) {
        attempts.push(draftAttempt);
        return this.finalize(attempts, draftAttempt, startTime, 'passed');
      }

      // 执行门禁
      try {
        const gateResult = await gateRunner(draftAttempt.prose, draftAttempt.changes);
        draftAttempt.gateResult = gateResult;
        attempts.push(draftAttempt);

        if (gateResult.passed) {
          return this.finalize(attempts, draftAttempt, startTime, 'passed');
        }

        // 记录最佳
        const score = this.scoreAttempt(gateResult);
        if (score > bestScore) {
          bestScore = score;
          bestAttempt = draftAttempt;
        }

        if (includeGateFeedback && attempt < maxAttempts) {
          currentPrompt = this.buildFeedbackPrompt(basePrompt, gateResult, attempt);
        }
      } catch {
        attempts.push(draftAttempt);
        if (!bestAttempt) bestAttempt = draftAttempt;
        if (attempt < maxAttempts) {
          currentPrompt = basePrompt + `\n\n（注意：上次门禁审查异常，请重新生成确保质量）`;
        }
      }
    }

    return this.finalize(attempts, bestAttempt, startTime, 'max_attempts');
  }

  // ============================================================
  // 评分与反馈
  // ============================================================

  private scoreAttempt(gateResult: GatePipelineResult): number {
    if (gateResult.passed) return 100;
    let score = 100;
    score -= gateResult.blockingCount * 25;
    score -= gateResult.highCount * 10;
    score -= (gateResult.totalIssues - gateResult.blockingCount - gateResult.highCount) * 2;
    return Math.max(0, score);
  }

  private buildFeedbackPrompt(
    basePrompt: string,
    gateResult: GatePipelineResult,
    attempt: number,
  ): string {
    const issues = gateResult.allIssues
      .filter(i => i.severity === 'critical' || i.severity === 'high')
      .slice(0, 5);

    if (issues.length === 0) return basePrompt;

    const feedbackLines = issues.map((i, idx) => {
      const sev = i.severity === 'critical' ? '【严重】' : '【高】';
      return `${idx + 1}. ${sev}${i.description}${i.suggestion ? `\n   建议：${i.suggestion}` : ''}`;
    }).join('\n');

    return `${basePrompt}

## ⚠️ 第 ${attempt} 次审查反馈（请避免以下问题）
${feedbackLines}

请重新生成，确保：
1. 不再出现上述问题
2. CHANGES 协议载荷与正文严格对应
3. 所有 evidence 字段必须直接引用正文原文
4. 段落疏密适中：每段约 3～5 句、180～280 字；优先合并过碎短段；对话换人换行`;
  }

  private finalize(
    attempts: DraftAttempt[],
    bestAttempt: DraftAttempt | null,
    startTime: number,
    stopReason: RetryLoopResult['stopReason'],
  ): RetryLoopResult {
    return {
      success: stopReason === 'passed',
      attempts,
      bestAttempt,
      totalDurationMs: Date.now() - startTime,
      stopReason,
    };
  }
}

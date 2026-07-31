/**
 * L5 门禁层 - 一致性门禁流水线
 *
 * 串联 G1-G8，按"短路"策略执行：
 *   - G1 协议解析失败 → 直接终止，不浪费后续门禁计算
 *   - G1-G6 / G8 确定性门禁全部跑完
 *   - G7 LLM 门禁（可选，需注入客户端）
 *
 * 智能决策：根据问题类型和严重度决定 accept / auto_fix / rewrite / reject
 */

import {
  Gate1Protocol,
  Gate2Reference,
  Gate3Consistency,
  Gate4Description,
  Gate5Blueprint,
  Gate6Entity,
} from './deterministic-gates';
import { Gate7Semantic } from './Gate7Semantic';
import { Gate8Typesetting } from './Gate8Typesetting';
import { ensureChapterJudgeResult } from './chapterJudgeBridge';
import type {
  Gate,
  GateConfig,
  GateContext,
  GateDecision,
  GateIssue,
  GatePipelineResult,
  GateResult,
  GateSeverity,
} from './types';
import { DEFAULT_GATE_CONFIG } from './types';

// ============================================================
// 流水线
// ============================================================

export class ConsistencyGatePipeline {
  private readonly gates: Gate[];
  private config: GateConfig;

  constructor(config: Partial<GateConfig> = {}) {
    this.config = { ...DEFAULT_GATE_CONFIG, ...config };
    this.gates = [
      new Gate1Protocol(),
      new Gate2Reference(),
      new Gate3Consistency(),
      new Gate4Description(),
      new Gate5Blueprint(),
      new Gate6Entity(),
      new Gate8Typesetting(),
      new Gate7Semantic(),
    ];
  }

  /** 更新配置。 */
  updateConfig(updates: Partial<GateConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /** 获取当前配置。 */
  getConfig(): GateConfig {
    return { ...this.config };
  }

  /**
   * 执行完整门禁流水线。
   *
   * 短路策略：
   * - G1 失败（协议解析问题）→ 终止后续，返回（后续门禁依赖有效的 CHANGES）
   * - 否则全部执行
   */
  async run(ctx: GateContext): Promise<GatePipelineResult> {
    const start = Date.now();
    const results: GateResult[] = [];

    // 统一语义审查：G5/G7 共用，至多 1 次 AI
    try {
      const judgeResult = await ensureChapterJudgeResult(
        ctx,
        this.config.chapterJudge,
        this.config.enableSemanticGate
      );
      if (judgeResult) {
        ctx.chapterJudgeResult = judgeResult;
      }
    } catch (err) {
      console.warn('[GatePipeline] ChapterJudge 预跑失败，回退关键词/旧 G7:', err);
    }

    for (const gate of this.gates) {
      // G1 短路：协议门禁失败（有任何 critical/high 问题）时，CHANGES 不可信，
      // 后续门禁都依赖有效的 CHANGES，跳过它们避免基于坏数据产生误导结论。
      if (results.length === 1 && !results[0].passed) {
        const g1 = results[0];
        const hasSerious = g1.issues.some(i => i.severity === 'critical' || i.severity === 'high');
        if (hasSerious) {
          for (const remainingGate of this.gates.slice(1)) {
            results.push({
              gateId: remainingGate.id,
              gateName: remainingGate.name,
              passed: true,
              issues: [],
              durationMs: 0,
              stats: { skipped: 'g1_failed' },
            });
          }
          break;
        }
      }

      try {
        const result = await gate.run(ctx, this.config);
        results.push(result);
      } catch (err) {
        // 单个门禁崩溃不影响其他门禁
        results.push({
          gateId: gate.id,
          gateName: gate.name,
          passed: true,
          issues: [],
          durationMs: 0,
          error: String(err),
          stats: { skipped: 'gate_crash' },
        });
      }
    }

    return this.assembleResult(results, Date.now() - start);
  }

  /**
   * 只执行确定性门禁（G1-G6 / G8），跳过 G7。
   * 用于：快速预检、LLM 不可用时的降级。
   */
  async runDeterministicOnly(ctx: GateContext): Promise<GatePipelineResult> {
    const start = Date.now();
    const results: GateResult[] = [];

    for (const gate of this.gates) {
      if (gate.requiresLLM) continue;
      try {
        results.push(await gate.run(ctx, this.config));
      } catch (err) {
        results.push({
          gateId: gate.id, gateName: gate.name, passed: true,
          issues: [], durationMs: 0, error: String(err),
        });
      }
    }

    return this.assembleResult(results, Date.now() - start);
  }

  // ============================================================
  // 结果组装
  // ============================================================

  private assembleResult(results: GateResult[], totalMs: number): GatePipelineResult {
    const allIssues: GateIssue[] = results.flatMap(r => r.issues);
    const blockingCount = allIssues.filter(i => i.severity === 'critical').length;
    const highCount = allIssues.filter(i => i.severity === 'high').length;
    const hasBlocking = blockingCount > 0;
    const passed = !hasBlocking && results.every(r => r.passed);

    const decision = this.makeDecision(allIssues, blockingCount, highCount);

    return {
      passed,
      hasBlocking,
      blockingCount,
      highCount,
      totalIssues: allIssues.length,
      gates: results,
      allIssues,
      decision,
      totalDurationMs: totalMs,
    };
  }

  /**
   * 智能决策：根据问题类型和严重度决定下一步。
   *
   * 策略：
   * - 有 critical 一致性问题（G3/G2）→ rewrite（重写）
   * - 有 critical 协议/蓝图问题 → rewrite
   * - 只有可自动修复问题（AI 味、段落）→ auto_fix
   * - 只有 low/info → accept
   * - 有 high 但无 critical → manual_review / rewrite（排版 high → rewrite）
   */
  private makeDecision(
    issues: GateIssue[],
    blockingCount: number,
    highCount: number,
  ): GateDecision {
    // 无问题
    if (issues.length === 0) {
      return {
        shouldBlock: false,
        reason: '所有门禁通过',
        canAutoFix: false,
        nextAction: 'accept',
      };
    }

    // critical 问题分类
    const criticalIssues = issues.filter(i => i.severity === 'critical');
    const hardCritical = criticalIssues.filter(i =>
      i.category === 'consistency' ||
      i.category === 'reference' ||
      i.category === 'protocol' ||
      i.category === 'blueprint' ||
      i.category === 'entity'
    );

    // 有硬约束 critical → 必须重写
    if (hardCritical.length > 0) {
      return {
        shouldBlock: true,
        reason: `${hardCritical.length} 个硬约束 critical 问题：${hardCritical.slice(0, 2).map(i => i.description).join('；')}`,
        canAutoFix: false,
        nextAction: 'rewrite',
      };
    }

    // 排版密度 high → 重写（确定性拆段后仍过密）
    const typesettingHigh = issues.filter(
      i => i.category === 'typesetting' && i.severity === 'high'
    );
    if (typesettingHigh.length > 0) {
      return {
        shouldBlock: true,
        reason: `段落过密：${typesettingHigh[0].description}`,
        canAutoFix: false,
        nextAction: 'rewrite',
      };
    }

    // 检查是否全是可自动修复的
    const autoFixable = issues.filter(i => i.autoFixable);
    const allAutoFixable = autoFixable.length === issues.length && issues.length > 0;

    if (allAutoFixable && this.config.allowAIFlavorDegradedPass) {
      return {
        shouldBlock: false,
        reason: `${issues.length} 个问题均可自动修复（润色阶段处理）`,
        canAutoFix: true,
        nextAction: 'auto_fix',
      };
    }

    // 有 high 但无 critical → 人工复核
    if (highCount > 0 && blockingCount === 0) {
      return {
        shouldBlock: false,
        reason: `${highCount} 个 high 问题，建议人工复核`,
        canAutoFix: autoFixable.length > 0,
        nextAction: 'manual_review',
      };
    }

    // 只有 low/info
    const onlyLow = issues.every(i => i.severity === 'low' || i.severity === 'info');
    if (onlyLow) {
      return {
        shouldBlock: false,
        reason: `仅 ${issues.length} 个低优先级问题，可接受`,
        canAutoFix: autoFixable.length > 0,
        nextAction: 'accept',
      };
    }

    // 默认：人工复核
    return {
      shouldBlock: true,
      reason: `${blockingCount} critical + ${highCount} high 问题`,
      canAutoFix: autoFixable.length > 0,
      nextAction: 'manual_review',
    };
  }
}

// ============================================================
// 严重度排序工具
// ============================================================

const SEVERITY_ORDER: Record<GateSeverity, number> = {
  critical: 0, high: 1, medium: 2, low: 3, info: 4,
};

/** 按严重度排序问题（critical 在前）。 */
export function sortIssuesBySeverity(issues: GateIssue[]): GateIssue[] {
  return [...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

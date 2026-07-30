/**
 * G8 排版门禁 - 段落密度（手机网文观感）
 *
 * 确定性、零成本。后处理不再主动拆段；若模型仍输出极端大段墙，
 * 由本门禁给出 high 问题并触发重写反馈。
 */

import type { Gate, GateConfig, GateContext, GateResult } from './types';
import { buildTypesettingIssues } from '../writing/typesetting';

export class Gate8Typesetting implements Gate {
  id = 'G8' as const;
  name = '排版密度';
  requiresLLM = false;

  async run(ctx: GateContext, _config: GateConfig): Promise<GateResult> {
    const start = Date.now();
    const densityIssues = buildTypesettingIssues(ctx.prose);

    const issues = densityIssues.map(issue => ({
      category: 'typesetting' as const,
      severity: issue.severity,
      location: '全文',
      description: issue.description,
      evidence: issue.evidence,
      suggestion: issue.suggestion,
      // medium 可自动拆段；high 表示拆段后仍过密，需重写
      autoFixable: issue.severity !== 'high',
    }));

    const hasSerious = issues.some(i => i.severity === 'critical' || i.severity === 'high');

    return {
      gateId: this.id,
      gateName: this.name,
      passed: !hasSerious,
      issues,
      durationMs: Date.now() - start,
      stats: {
        issueCount: issues.length,
      },
    };
  }
}

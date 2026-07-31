/**
 * L5 门禁层 - G7 LLM 语义审查门禁
 *
 * G1-G6 是确定性规则，能拦截 80% 明显幻觉。
 * G7 处理深层语义矛盾，需要 LLM 判断：
 *   - 隐含逻辑矛盾（"一边说没去过京城，一边回忆京城街景"）
 *   - 人设 OOC（性格前后不一）
 *   - 时间线隐含错误
 *   - 战力/能力不合理
 *
 * 设计：LLM-as-judge，prompt 只让它"找茬"不让它创作。
 * 失败/超时降级为 warning（不阻断流程）。
 */

import type {
  Gate,
  GateContext,
  GateResult,
  GateIssue,
  GateConfig,
} from './types';
import { formatChangesPayload } from '../state/ChangesProtocol';
import { mapChapterJudgeIssuesToGateIssues } from './chapterJudgeBridge';

// ============================================================
// LLM 客户端接口（注入式，解耦具体 AI 服务）
// ============================================================

export interface Gate7LLMClient {
  /**
   * 执行语义审查。
   * @param prompt 审查 prompt
   * @returns LLM 原始输出（期望 JSON）
   */
  review(prompt: string): Promise<string>;
}

/** 全局注入的 LLM 客户端。 */
let _llmClient: Gate7LLMClient | null = null;

/** 注入 G7 用的 LLM 客户端。由上层在启动时调用。 */
export function setGate7LLMClient(client: Gate7LLMClient | null): void {
  _llmClient = client;
}

// ============================================================
// G7 门禁
// ============================================================

export class Gate7Semantic implements Gate {
  id = 'G7' as const;
  name = 'LLM 语义审查';
  requiresLLM = true;

  async run(ctx: GateContext, config: GateConfig): Promise<GateResult> {
    const start = Date.now();

    // 未启用 → 跳过
    if (!config.enableSemanticGate) {
      return {
        gateId: this.id,
        gateName: this.name,
        passed: true,
        issues: [],
        durationMs: Date.now() - start,
        stats: { skipped: 'disabled' },
      };
    }

    // 流水线已预跑 ChapterJudge：复用结果，不再二次请求
    if (ctx.chapterJudgeResult) {
      const issues = mapChapterJudgeIssuesToGateIssues(ctx.chapterJudgeResult);
      return {
        gateId: this.id,
        gateName: this.name,
        passed: !issues.some(i => i.severity === 'critical' || i.severity === 'high'),
        issues,
        durationMs: Date.now() - start,
        stats: { issueCount: issues.length, source: 'chapter-judge' },
      };
    }

    // 兼容旧路径：独立 Gate7LLMClient
    if (!_llmClient) {
      return {
        gateId: this.id,
        gateName: this.name,
        passed: true,
        issues: [makeIssue('semantic', 'low', 'G7',
          '未注入 LLM 客户端且无 ChapterJudge 结果，G7 语义审查跳过')],
        durationMs: Date.now() - start,
        stats: { skipped: 'no_client' },
      };
    }

    try {
      const prompt = this.buildPrompt(ctx);
      const rawOutput = await _llmClient.review(prompt);
      const issues = this.parseOutput(rawOutput);

      return {
        gateId: this.id,
        gateName: this.name,
        passed: !issues.some(i => i.severity === 'critical' || i.severity === 'high'),
        issues,
        durationMs: Date.now() - start,
        stats: { issueCount: issues.length, source: 'legacy-g7' },
      };
    } catch (err) {
      // G7 失败降级为 warning，不阻断流程
      return {
        gateId: this.id,
        gateName: this.name,
        passed: true,
        issues: [makeIssue('semantic', 'low', 'G7',
          `G7 审查执行失败（降级跳过）：${err instanceof Error ? err.message : String(err)}`)],
        durationMs: Date.now() - start,
        error: String(err),
        stats: { skipped: 'error' },
      };
    }
  }

  // ============================================================
  // Prompt 构建
  // ============================================================

  private buildPrompt(ctx: GateContext): string {
    const snap = ctx.snapshot;
    const changesText = formatChangesPayload(ctx.changes);

    // 快照关键事实摘要（控制 token）
    const charSummary = Object.values(snap.characters)
      .slice(0, 10)
      .map(c => `- ${c.name}：${c.role}，境界=${c.powerLevel || '未知'}，状态=${c.alive ? '存活' : '已故'}${c.mentalState ? '，' + c.mentalState : ''}`)
      .join('\n');

    const foreshadowSummary = Object.values(snap.foreshadows)
      .filter(f => f.status !== 'resolved' && f.status !== 'abandoned')
      .slice(0, 10)
      .map(f => `- #${f.id}：${f.hint}（${f.status}）`)
      .join('\n');

    const worldRules = snap.worldRules
      .filter(r => r.absolute)
      .slice(0, 8)
      .map(r => `- ${r.name}：${r.rule}`)
      .join('\n');

    return `你是连贯性审查员。你的唯一任务是**找出矛盾**，不要改写、不要创作、不要建议修改方案。

## 权威事实快照（第 ${snap.chapter} 章后的状态）
### 角色状态
${charSummary || '（无）'}

### 活跃伏笔
${foreshadowSummary || '（无）'}

### 世界观硬约束（不可违反）
${worldRules || '（无）'}

## 待审章节
**章节号**：第 ${ctx.chapter} 章
**标题**：${ctx.title || '（无）'}

### 章节正文
${ctx.prose}

### 本章声明的状态变更
${changesText}

## 审查任务
仔细对比"正文"与"权威事实快照"，找出以下类型的矛盾：

1. **事实矛盾**：正文描写与快照不符（境界、能力、位置、关系、存活状态）
2. **逻辑矛盾**：隐含的逻辑漏洞（"一边说没去过，一边回忆当地街景"）
3. **人设 OOC**：角色行为/说话与其性格标签严重不符
4. **时间线错误**：时间顺序、时间跨度不合理
5. **战力不合理**：越级战斗无合理解释、能力忽高忽低
6. **伏笔错乱**：回收了未埋设的伏笔、或破坏了已埋设伏笔的铺垫

## 输出格式（严格 JSON，不要 markdown 代码块）
{
  "issues": [
    {
      "type": "fact_conflict | logic_gap | ooc | timeline | power | foreshadow",
      "severity": "critical | high | medium | low",
      "location": "矛盾在正文的位置（如『第3段开头』）",
      "description": "具体矛盾描述",
      "evidence": "正文原文摘录",
      "fact_reference": "与之冲突的快照事实"
    }
  ]
}

如果没有发现任何问题，输出：{"issues":[]}

注意：
- 只报告**真实存在的矛盾**，不要鸡蛋里挑骨头
- severity=critical 留给"明显的事实错误"（如死人说话、境界跳变）
- 对风格/文笔问题不要报告（那不是你的职责）`;
  }

  // ============================================================
  // 输出解析
  // ============================================================

  private parseOutput(rawOutput: string): GateIssue[] {
    const issues: GateIssue[] = [];

    // 提取 JSON
    const jsonText = extractJson(rawOutput);
    if (!jsonText) {
      // LLM 没输出有效 JSON，视为审查失败但不报问题
      return issues;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return issues;
    }

    if (!parsed || !Array.isArray(parsed.issues)) return issues;

    const severityMap: Record<string, GateIssue['severity']> = {
      critical: 'critical',
      high: 'high',
      medium: 'medium',
      low: 'low',
    };

    const typeToCategory: Record<string, GateIssue['category']> = {
      fact_conflict: 'consistency',
      logic_gap: 'semantic',
      ooc: 'semantic',
      timeline: 'consistency',
      power: 'consistency',
      foreshadow: 'consistency',
    };

    for (const raw of parsed.issues) {
      if (!raw || typeof raw !== 'object') continue;
      const severity = severityMap[raw.severity] || 'medium';
      const category = typeToCategory[raw.type] || 'semantic';
      issues.push({
        category,
        severity,
        location: String(raw.location || '未知位置'),
        description: String(raw.description || '无描述'),
        evidence: raw.evidence ? String(raw.evidence) : undefined,
        suggestion: raw.fact_reference ? `快照依据：${raw.fact_reference}` : undefined,
        autoFixable: false,
      });
    }

    return issues;
  }
}

// ============================================================
// 辅助
// ============================================================

function makeIssue(
  category: GateIssue['category'],
  severity: GateIssue['severity'],
  location: string,
  description: string,
  opts: { evidence?: string; suggestion?: string; autoFixable?: boolean } = {},
): GateIssue {
  return {
    category, severity, location, description,
    evidence: opts.evidence,
    suggestion: opts.suggestion,
    autoFixable: opts.autoFixable ?? false,
  };
}

function extractJson(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

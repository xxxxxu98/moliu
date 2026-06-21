/**
 * L5 门禁层 - 类型定义
 *
 * 门禁是防幻觉的"确定性"防线（区别于生成的"概率性"）。
 * 七道闸门按成本从低到高排列：
 *   G1-G6 是代码可判定的确定性规则（毫秒级，0 成本）
 *   G7 是 LLM-as-judge 语义审查（1 次模型调用）
 */

// ============================================================
// 门禁严重度
// ============================================================

export type GateSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * 问题类别。决定门禁失败后的处理策略。
 * - hard：硬约束违反，必须重写或拒绝
 * - soft：软问题，可自动修复或告警
 */
export type GateCategory =
  | 'protocol'        // G1 协议格式
  | 'reference'       // G2 实体引用
  | 'consistency'     // G3 结构一致性（核心）
  | 'description'     // G4 描写一致性
  | 'blueprint'       // G5 蓝图出场
  | 'entity'          // G6 未知实体
  | 'semantic'        // G7 语义逻辑
  | 'auto_fixable';   // 可自动修复（AI 味等）

// ============================================================
// 门禁发现的问题
// ============================================================

export interface GateIssue {
  /** 问题类别 */
  category: GateCategory;
  /** 严重度 */
  severity: GateSeverity;
  /** 在正文中的位置描述（如"开头300字"、"第5段"） */
  location: string;
  /** 问题描述（人可读） */
  description: string;
  /** 问题原文片段（若适用） */
  evidence?: string;
  /** 修复建议 */
  suggestion?: string;
  /** 是否可自动修复 */
  autoFixable: boolean;
}

// ============================================================
// 单道门禁的结果
// ============================================================

export type GateId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7';

export interface GateResult {
  /** 门禁 ID */
  gateId: GateId;
  /** 门禁名称 */
  gateName: string;
  /** 是否通过（无 critical/high 问题） */
  passed: boolean;
  /** 发现的问题 */
  issues: GateIssue[];
  /** 门禁执行耗时（ms） */
  durationMs: number;
  /** 执行错误（门禁自身崩溃，不代表内容有问题） */
  error?: string;
  /** 门禁元数据（统计信息） */
  stats?: Record<string, unknown>;
}

// ============================================================
// 门禁流水线整体结果
// ============================================================

export interface GatePipelineResult {
  /** 整体是否通过（所有门禁 passed） */
  passed: boolean;
  /** 是否有阻断问题（critical） */
  hasBlocking: boolean;
  /** critical 问题数 */
  blockingCount: number;
  /** high 问题数 */
  highCount: number;
  /** 总问题数 */
  totalIssues: number;
  /** 各门禁结果（按 G1-G7 顺序） */
  gates: GateResult[];
  /** 所有问题（合并） */
  allIssues: GateIssue[];
  /** 智能决策：是否应阻断、原因、是否可自动修复 */
  decision: GateDecision;
  /** 总耗时（ms） */
  totalDurationMs: number;
}

export interface GateDecision {
  /** 是否应该阻断提交 */
  shouldBlock: boolean;
  /** 阻断/通过的原因（人可读） */
  reason: string;
  /** 是否所有问题都可自动修复（true 则走修复流程而非重写） */
  canAutoFix: boolean;
  /** 建议的下一步动作 */
  nextAction: 'accept' | 'auto_fix' | 'rewrite' | 'manual_review' | 'reject';
}

// ============================================================
// 门禁配置
// ============================================================

export interface GateConfig {
  /** 未知实体总数阈值（超过则 G6 阻断） */
  maxUnknownEntities: number;
  /** 未知龙套实体阈值（无 CHANGES 记录的实体） */
  maxUnnamedExtras: number;
  /** 蓝图角色缺席阈值（大纲要求出场但未出现的角色数） */
  maxMissingBlueprintRoles: number;
  /** 短章节阈值（字数低于此值则 G5 警告） */
  minChapterWords: number;
  /** 是否启用 G7 LLM 语义审查 */
  enableSemanticGate: boolean;
  /** 是否允许 AI 味问题降级通过（soft 走自动修复） */
  allowAIFlavorDegradedPass: boolean;
}

export const DEFAULT_GATE_CONFIG: GateConfig = {
  maxUnknownEntities: 5,
  maxUnnamedExtras: 3,
  maxMissingBlueprintRoles: 1,
  minChapterWords: 1500,
  enableSemanticGate: true,
  allowAIFlavorDegradedPass: true,
};

// ============================================================
// 门禁输入
// ============================================================

/**
 * 门禁执行上下文。所有门禁共享。
 */
export interface GateContext {
  /** 章节号 */
  chapter: number;
  /** 正文散文（已剥离 CHANGES） */
  prose: string;
  /** 解析出的 CHANGES */
  changes: import('../state/types').ChangesPayload;
  /** 当前状态快照（G3/G4 校验基准） */
  snapshot: import('../state/types').StateSnapshot;
  /** 章节大纲/任务书（G5 蓝图校验基准） */
  blueprint?: {
    mustCover?: string[];
    forbiddenZones?: string[];
    requiredCharacters?: string[];
    cen?: string;
  };
  /** 章节标题 */
  title?: string;
}

// ============================================================
// 门禁接口
// ============================================================

/**
 * 单道门禁的统一接口。每道门禁实现这个接口。
 */
export interface Gate {
  id: GateId;
  name: string;
  /** 是否需要 LLM 调用（G7=true，其余=false） */
  requiresLLM: boolean;
  /** 执行门禁检查 */
  run(ctx: GateContext, config: GateConfig): Promise<GateResult>;
}

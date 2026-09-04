/**
 * 单章写作管道对外契约类型：落库/记忆客户端端口 + 门禁结果归一化形状。
 *
 * 从已删除的 StateDriven L1–L7 簇（services/commit/CommitTransaction、services/gates/types）
 * 抽出仍被生产链使用的纯类型；实现全部在 story-runtime（LongFormWritingEngine +
 * ChapterCommitService），这里不含任何执行逻辑。
 */

import type { ChapterMemory, CharacterStateChange } from '@/types/project';

// ============================================================
// 落库 / 记忆端口（注入式，冒烟与 App 提供不同介质的实现）
// ============================================================

/** 章节正文持久化客户端 */
export interface ChapterPersistenceClient {
  /** 追加章节正文。返回旧内容（仅用于增量写入）。 */
  save(chapterId: string, content: string): Promise<{ oldContent: string }>;
  /** 精确替换章节正文；主提交与回滚必须优先使用。 */
  replace?(chapterId: string, content: string): Promise<{ oldContent: string }>;
}

/** 章节记忆提取客户端（best-effort，失败不影响提交成功与否） */
export interface MemoryClient {
  /**
   * 提取并保存章节记忆。
   * @param chapterId 章节持久化 ID
   * @param chapterNumber 章节序号（1-based）
   * @param prose 章节正文（已通过审查门）
   * @param aiStateChanges AI 事实提取的状态 delta（命运账唯一来源）；
   *        缺省时记忆只有规则层的状态碎片，不含命运账
   * @param aiEvents AI 事实提取的事件摘要（keyEvents 真源，2026-09-04 起随投影
   *        穿透；规则层 keyEvents 25-43% 章节空转，只做兜底）
   */
  extractAndSave(
    chapterId: string,
    chapterNumber: number,
    prose: string,
    aiStateChanges?: CharacterStateChange[],
    aiEvents?: string[]
  ): Promise<ChapterMemory | null>;
}

// ============================================================
// 门禁结果归一化形状（UI / 批量层消费 ChapterWriteOutput.gateResult）
// ============================================================

export type GateSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** 问题类别；决定门禁失败后的处理策略 */
export type GateCategory =
  | 'protocol'
  | 'reference'
  | 'consistency'
  | 'description'
  | 'blueprint'
  | 'entity'
  | 'semantic'
  | 'typesetting'
  | 'auto_fixable';

/** 单条门禁问题 */
export interface GateIssue {
  category: GateCategory;
  severity: GateSeverity;
  /** 在正文中的位置描述（如"开头300字"、"第5段"） */
  location: string;
  description: string;
  evidence?: string;
  suggestion?: string;
  autoFixable: boolean;
}

export type GateId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7' | 'G8';

/** 单道门禁结果 */
export interface GateResult {
  gateId: GateId;
  gateName: string;
  passed: boolean;
  issues: GateIssue[];
  durationMs: number;
  /** 门禁自身崩溃（不代表内容有问题） */
  error?: string;
  stats?: Record<string, unknown>;
}

/** 门禁决策 */
export interface GateDecision {
  shouldBlock: boolean;
  reason: string;
  canAutoFix: boolean;
  nextAction: 'accept' | 'auto_fix' | 'rewrite' | 'manual_review' | 'reject';
}

/** 门禁流水线整体结果（由 ContinuityReport 归一化而来） */
export interface GatePipelineResult {
  passed: boolean;
  hasBlocking: boolean;
  blockingCount: number;
  highCount: number;
  totalIssues: number;
  gates: GateResult[];
  allIssues: GateIssue[];
  decision: GateDecision;
  totalDurationMs: number;
}

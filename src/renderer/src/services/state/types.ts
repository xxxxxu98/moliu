/**
 * L1 状态层 - 核心类型定义
 *
 * 状态驱动架构的单一真相源。所有"这本书到目前为止的事实"都存在这里。
 * LLM 不再需要"记得"，只需要"读字段"。
 *
 * 设计原则：
 * 1. 强类型：每个实体有唯一 ID，描述永远只有一份
 * 2. 版本化：每章一份快照，绑定章节号，可回放
 * 3. 可 diff：所有变化通过 CHANGES 协议显式声明，可校验
 * 4. 冲突内置：写入时自动检测 entity+field 冲突
 *
 * 15 维快照覆盖：角色 / 剧情 / 世界 / 契约 四大类
 * 12 类 CHANGES 与快照维度一一对应
 */

import { z } from 'zod';

// ============================================================
// 实体类型与 ID 规范
// ============================================================

/**
 * 实体类型枚举。所有可被引用的实体都属于其中一类。
 * ID 命名规范：`<type>_<seq>`，如 `char_001`、`loc_003`、`fac_002`。
 */
export const EntityType = {
  CHARACTER: 'character',
  LOCATION: 'location',
  FACTION: 'faction',
  ITEM: 'item',
} as const;

export type EntityType = typeof EntityType[keyof typeof EntityType];

export const EntityTypeSchema = z.enum(['character', 'location', 'faction', 'item']);

/**
 * 通用实体引用。CHANGES 里所有 entity 字段都用这个格式。
 * ID 优先；找不到 ID 时回退到 name（运行时由别名表解析）。
 */
export const EntityRefSchema = z.object({
  /** 实体 ID（权威），如 `char_001` */
  id: z.string().optional(),
  /** 实体名称（兜底/展示），如 `林动` */
  name: z.string(),
  /** 实体类型，用于歧义消解 */
  type: EntityTypeSchema.optional(),
});

export type EntityRef = z.infer<typeof EntityRefSchema>;

// ============================================================
// 1. 角色维度
// ============================================================

/**
 * 角色状态：境界/能力/心理/关系等"会变"的属性。
 * 对应快照维度 #1。
 */
export const CharacterStateSchema = z.object({
  entityId: z.string(),
  name: z.string(),
  /** 境界/等级/实力档位 */
  powerLevel: z.string().default(''),
  /** 已掌握的能力清单 */
  abilities: z.array(z.string()).default([]),
  /** 心理/情绪状态 */
  mentalState: z.string().default(''),
  /** 角色定位（主角/反派/盟友等） */
  role: z.string().default(''),
  /** 当前存活状态 */
  alive: z.boolean().default(true),
  /** 最近一次变化的章节号 */
  lastUpdatedChapter: z.number().default(0),
});

export type CharacterState = z.infer<typeof CharacterStateSchema>;

/**
 * 角色外貌：发色/瞳色/特征等"不该变"的属性。
 * 对应快照维度 #3。变化即冲突，用于 G4 描写一致性门禁。
 */
export const CharacterAppearanceSchema = z.object({
  entityId: z.string(),
  /** 外观特征标签（发色黑、疤在左脸等） */
  features: z.array(z.string()).default([]),
  /** 性格标签（用于 OOC 检测） */
  personalityTags: z.array(z.string()).default([]),
  /** 说话风格 */
  speakingStyle: z.string().default(''),
});

export type CharacterAppearance = z.infer<typeof CharacterAppearanceSchema>;

/**
 * 角色关系。有向边：from → to。
 * 对应快照维度 #1 的子维度（关系网）。
 */
export const RelationshipSchema = z.object({
  /** 关系唯一键：`${fromEntityId}->${toEntityId}` */
  id: z.string(),
  fromEntityId: z.string(),
  toEntityId: z.string(),
  /** 关系类型 */
  type: z.enum(['ally', 'enemy', 'family', 'romantic', 'master_disciple', 'neutral', 'rival']),
  /** 信任度 -100~100 */
  trustScore: z.number().default(0),
  /** 关系描述 */
  description: z.string().default(''),
  establishedChapter: z.number().default(0),
});

export type Relationship = z.infer<typeof RelationshipSchema>;

// ============================================================
// 2. 剧情维度
// ============================================================

/**
 * 冲突进度。每条冲突线当前推进到哪一步。
 * 对应快照维度 #4。
 */
export const ConflictProgressSchema = z.object({
  id: z.string(),
  /** 冲突名称 */
  name: z.string(),
  /** 当前状态 */
  status: z.enum(['latent', 'brewing', 'active', 'escalating', 'climax', 'resolved', 'abandoned']),
  /** 推进度 0-100 */
  progress: z.number().min(0).max(100).default(0),
  /** 涉及的实体 */
  involvedEntities: z.array(z.string()).default([]),
  /** 最近推进事件 */
  lastEvent: z.string().default(''),
  lastUpdatedChapter: z.number().default(0),
});

export type ConflictProgress = z.infer<typeof ConflictProgressSchema>;

/**
 * 伏笔状态。这是长篇连贯性的命脉。
 * 对应快照维度 #5。
 */
export const ForeshadowTierSchema = z.enum(['micro', 'minor', 'major', 'arc', 'series']);

export const ForeshadowStateSchema = z.object({
  id: z.string(),
  /** 伏笔提示/线索文本 */
  hint: z.string(),
  /** 伏笔层级：越高越重要 */
  tier: ForeshadowTierSchema.default('minor'),
  /** 生命周期状态 */
  status: z.enum(['setup', 'hinted', 'reinforced', 'payoff', 'resolved', 'abandoned']),
  /** 埋设章节 */
  setupChapter: z.number().default(0),
  /** 计划回收章节（可空） */
  plannedPayoffChapter: z.number().optional(),
  /** 实际回收章节（可空） */
  actualPayoffChapter: z.number().optional(),
  /** 关联实体 */
  relatedEntities: z.array(z.string()).default([]),
});

export type ForeshadowTier = z.infer<typeof ForeshadowTierSchema>;
export type ForeshadowState = z.infer<typeof ForeshadowStateSchema>;

/**
 * 剧情节点（按章归档的关键事件）。
 * 对应快照维度 #6。用于跨章叙事追踪。
 */
export const PlotNodeRecordSchema = z.object({
  id: z.string(),
  chapter: z.number(),
  /** 节点关键词 */
  keywords: z.array(z.string()).default([]),
  /** 上下文摘要 */
  summary: z.string(),
  /** 涉及角色 */
  involvedCharacters: z.array(z.string()).default([]),
  /** 所属故事线 */
  strand: z.enum(['main', 'sub', 'romance', 'world', 'character']).default('main'),
});

export type PlotNodeRecord = z.infer<typeof PlotNodeRecordSchema>;

// ============================================================
// 3. 世界维度
// ============================================================

/**
 * 地点状态。
 * 对应快照维度 #7。
 */
export const LocationStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** 当前状态描述（被毁/占领/繁荣等） */
  status: z.string().default('正常'),
  /** 所属上级地点 */
  parentLocationId: z.string().optional(),
  lastUpdatedChapter: z.number().default(0),
});

export type LocationState = z.infer<typeof LocationStateSchema>;

/**
 * 地点特征（"不该变"的属性）。
 * 对应快照维度 #12。用于 G4 描写一致性门禁。
 */
export const LocationFeatureSchema = z.object({
  id: z.string(),
  /** 地理/环境特征 */
  environmentTags: z.array(z.string()).default([]),
  /** 氛围/基调 */
  atmosphere: z.string().default(''),
  /** 视觉标志物 */
  landmarks: z.array(z.string()).default([]),
});

export type LocationFeature = z.infer<typeof LocationFeatureSchema>;

/**
 * 势力状态。
 * 对应快照维度 #8。
 */
export const FactionStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** 势力当前状况 */
  status: z.string().default('正常'),
  /** 实力档位 */
  powerLevel: z.string().default(''),
  /** 与主角阵营关系 */
  attitudeToProtagonist: z.enum(['hostile', 'neutral', 'friendly', 'allied']).default('neutral'),
  lastUpdatedChapter: z.number().default(0),
});

export type FactionState = z.infer<typeof FactionStateSchema>;

/**
 * 时间线。
 * 对应快照维度 #9。防止时间跳跃混乱。
 */
export const TimelineStateSchema = z.object({
  /** 当前故事内时间描述 */
  currentTime: z.string().default(''),
  /** 距开局经过的时长 */
  elapsed: z.string().default(''),
  /** 当前章节号 */
  currentChapter: z.number().default(0),
  /** 关键时间锚点（按章） */
  anchors: z.array(z.object({
    chapter: z.number(),
    event: z.string(),
    time: z.string(),
  })).default([]),
});

export type TimelineState = z.infer<typeof TimelineStateSchema>;

/**
 * 世界观硬约束（不可违反的规则）。
 * 对应快照维度 #11。这是 G3 门禁的硬约束来源。
 */
export const WorldRuleSchema = z.object({
  id: z.string(),
  /** 规则名称 */
  name: z.string(),
  /** 规则内容 */
  rule: z.string(),
  /** 违反后的剧情后果 */
  violationConsequence: z.string().default(''),
  /** 是否为绝对规则（true 则任何违反都是 critical） */
  absolute: z.boolean().default(true),
});

export type WorldRule = z.infer<typeof WorldRuleSchema>;

// ============================================================
// 4. 契约维度
// ============================================================

/**
 * 物品流转。谁持有什么物品。
 * 对应快照维度 #10。
 */
export const ItemStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** 当前持有者 entityId */
  ownerId: z.string().default(''),
  /** 物品状态 */
  status: z.string().default('完好'),
  /** 获得章节 */
  acquiredChapter: z.number().default(0),
});

export type ItemState = z.infer<typeof ItemStateSchema>;

/**
 * 秘密状态。谁知道什么秘密。
 * 对应快照维度 #13。防止信息泄露逻辑错误。
 */
export const SecretStateSchema = z.object({
  id: z.string(),
  /** 秘密内容 */
  content: z.string(),
  /** 知情角色 entityId 列表 */
  knownBy: z.array(z.string()).default([]),
  /** 揭露状态 */
  status: z.enum(['hidden', 'partially_revealed', 'fully_revealed']).default('hidden'),
  setupChapter: z.number().default(0),
});

export type SecretState = z.infer<typeof SecretStateSchema>;

/**
 * 誓约约束。
 * 对应快照维度 #14。追踪承诺兑现。
 */
export const OathStateSchema = z.object({
  id: z.string(),
  /** 誓约内容 */
  content: z.string(),
  /** 立誓角色 */
  oathMakerId: z.string(),
  /** 相关角色 */
  targetEntityIds: z.array(z.string()).default([]),
  /** 状态 */
  status: z.enum(['active', 'fulfilled', 'broken', 'released']).default('active'),
  /** 约束条件 */
  conditions: z.string().default(''),
  /** 违约后果 */
  consequence: z.string().default(''),
  setupChapter: z.number().default(0),
});

export type OathState = z.infer<typeof OathStateSchema>;

/**
 * 截止约束（倒计时剧情）。
 * 对应快照维度 #15。追踪时间压力类剧情。
 */
export const DeadlineStateSchema = z.object({
  id: z.string(),
  /** 目标事件 */
  event: z.string(),
  /** 状态 */
  status: z.enum(['pending', 'approaching', 'triggered', 'missed', 'cancelled']).default('pending'),
  /** 剩余时间描述 */
  remaining: z.string().default(''),
  /** 距离触发的章节数（估算） */
  chaptersUntil: z.number().optional(),
  /** 触发条件 */
  triggerCondition: z.string().default(''),
  setupChapter: z.number().default(0),
});

export type DeadlineState = z.infer<typeof DeadlineStateSchema>;

// ============================================================
// 完整快照：15 维事实快照
// ============================================================

/**
 * 全局事实快照。整个项目的"单一真相源"。
 *
 * 读取规则：生成下一章时，从这里读字段值，而非靠模型回忆。
 * 写入规则：只通过 ChangesApplier 合并 CHANGES 写入，保证可追溯。
 */
export const StateSnapshotSchema = z.object({
  /** 项目 ID */
  projectId: z.string(),
  /** 该快照对应的章节号（写完第 N 章后的状态） */
  chapter: z.number().default(0),

  // --- 1. 角色维度 ---
  /** 维度 #1 角色状态 */
  characters: z.record(z.string(), CharacterStateSchema).default({}),
  /** 维度 #3 角色外貌 */
  characterAppearances: z.record(z.string(), CharacterAppearanceSchema).default({}),
  /** 维度 #1 关系网（有向边） */
  relationships: z.record(z.string(), RelationshipSchema).default({}),
  /** 维度 #2 角色当前位置（entityId → locationId） */
  characterLocations: z.record(z.string(), z.string()).default({}),

  // --- 2. 剧情维度 ---
  /** 维度 #4 冲突进度 */
  conflicts: z.record(z.string(), ConflictProgressSchema).default({}),
  /** 维度 #5 伏笔状态 */
  foreshadows: z.record(z.string(), ForeshadowStateSchema).default({}),
  /** 维度 #6 剧情节点（按章归档） */
  plotNodes: z.array(PlotNodeRecordSchema).default([]),

  // --- 3. 世界维度 ---
  /** 维度 #7 地点状态 */
  locations: z.record(z.string(), LocationStateSchema).default({}),
  /** 维度 #12 地点特征 */
  locationFeatures: z.record(z.string(), LocationFeatureSchema).default({}),
  /** 维度 #8 势力状态 */
  factions: z.record(z.string(), FactionStateSchema).default({}),
  /** 维度 #9 时间线 */
  timeline: TimelineStateSchema.default({}),
  /** 维度 #11 世界观硬约束 */
  worldRules: z.array(WorldRuleSchema).default([]),

  // --- 4. 契约维度 ---
  /** 维度 #10 物品流转 */
  items: z.record(z.string(), ItemStateSchema).default({}),
  /** 维度 #13 秘密 */
  secrets: z.record(z.string(), SecretStateSchema).default({}),
  /** 维度 #14 誓约 */
  oaths: z.record(z.string(), OathStateSchema).default({}),
  /** 维度 #15 截止约束 */
  deadlines: z.record(z.string(), DeadlineStateSchema).default({}),

  /** 元数据 */
  createdAt: z.string().default(''),
  updatedAt: z.string().default(''),
});

export type StateSnapshot = z.infer<typeof StateSnapshotSchema>;

// ============================================================
// 别名表：名称 → entityId 的解析
// ============================================================

/**
 * 别名表。CHANGES 里 AI 常用名称（"黑衣人"、"林动"）而非 ID。
 * 这里维护 name/alias → entityId 的映射，做实体解析。
 */
export const AliasMapSchema = z.object({
  /** alias → entityId。一个别名只指向一个实体。 */
  aliases: z.record(z.string(), z.string()).default({}),
  /** entityId → 主名称 */
  primaryNames: z.record(z.string(), z.string()).default({}),
});

export type AliasMap = z.infer<typeof AliasMapSchema>;

// ============================================================
// CHANGES 协议：12 类状态变更声明
// ============================================================

/**
 * 通用变更条目。所有 12 类 CHANGES 共享的字段结构。
 */
const BaseChangeSchema = z.object({
  /** 变更前值（可空，新增类变更无 old） */
  old: z.unknown().optional(),
  /** 变更后值 */
  new: z.unknown().optional(),
  /** 正文出处（G3 门禁回查用） */
  evidence: z.string().default(''),
  /** 变更原因（人可读 + 审计） */
  reason: z.string().default(''),
});

// 1. 角色状态变化
export const CharacterStateChangeSchema = BaseChangeSchema.extend({
  type: z.literal('character_state'),
  /** 目标角色 */
  entity: EntityRefSchema,
  /** 变化的字段：powerLevel / abilities / mentalState / alive */
  field: z.enum(['powerLevel', 'abilities', 'mentalState', 'alive', 'role']),
});

// 2. 角色移动
export const CharacterLocationChangeSchema = BaseChangeSchema.extend({
  type: z.literal('character_location'),
  entity: EntityRefSchema,
  /** 目标地点 */
  to: EntityRefSchema,
  /** 出发地点 */
  from: EntityRefSchema.optional(),
});

// 3. 角色外貌变化（罕见，触发 G4 警告）
export const CharacterAppearanceChangeSchema = BaseChangeSchema.extend({
  type: z.literal('character_appearance'),
  entity: EntityRefSchema,
  field: z.enum(['features', 'personalityTags', 'speakingStyle']),
});

// 4. 关系变化
export const RelationshipChangeSchema = BaseChangeSchema.extend({
  type: z.literal('relationship'),
  from: EntityRefSchema,
  to: EntityRefSchema,
  /** 关系类型 */
  relationType: z.enum(['ally', 'enemy', 'family', 'romantic', 'master_disciple', 'neutral', 'rival']),
  /** 信任度变化（可空，纯类型变化时无 delta） */
  delta: z.number().optional(),
});

// 5. 冲突进度
export const ConflictChangeSchema = BaseChangeSchema.extend({
  type: z.literal('conflict_progress'),
  /** 冲突 ID（不存在则视为新建） */
  conflictId: z.string(),
  name: z.string().default(''),
  /** 新状态 */
  newStatus: z.enum(['latent', 'brewing', 'active', 'escalating', 'climax', 'resolved', 'abandoned']).optional(),
  /** 进度推进 */
  progressDelta: z.number().optional(),
});

// 6. 伏笔动作
export const ForeshadowChangeSchema = BaseChangeSchema.extend({
  type: z.literal('foreshadow'),
  /** 伏笔 ID（不存在则视为新建） */
  id: z.string(),
  hint: z.string().default(''),
  /** 动作类型 */
  action: z.enum(['setup', 'hint', 'reinforce', 'payoff', 'abandon']),
  tier: ForeshadowTierSchema.optional(),
  plannedPayoffChapter: z.number().optional(),
});

// 7. 新剧情节点
export const PlotNodeChangeSchema = BaseChangeSchema.extend({
  type: z.literal('plot_node'),
  keywords: z.array(z.string()).default([]),
  summary: z.string().default(''),
  involvedCharacters: z.array(z.string()).default([]),
  strand: z.enum(['main', 'sub', 'romance', 'world', 'character']).default('main'),
});

// 8. 地点状态变化
export const LocationStateChangeSchema = BaseChangeSchema.extend({
  type: z.literal('location_state'),
  entity: EntityRefSchema,
  newStatus: z.string().optional(),
});

// 9. 势力状态变化
export const FactionStateChangeSchema = BaseChangeSchema.extend({
  type: z.literal('faction_state'),
  entity: EntityRefSchema,
  newStatus: z.string().optional(),
  newAttitude: z.enum(['hostile', 'neutral', 'friendly', 'allied']).optional(),
});

// 10. 时间推进
export const TimelineChangeSchema = BaseChangeSchema.extend({
  type: z.literal('timeline'),
  currentTime: z.string().default(''),
  elapsed: z.string().optional(),
  event: z.string().default(''),
});

// 11. 物品流转
export const ItemTransferChangeSchema = BaseChangeSchema.extend({
  type: z.literal('item_transfer'),
  item: EntityRefSchema,
  /** 新持有者 */
  toOwner: EntityRefSchema,
  /** 原持有者（可空，新物品无 from） */
  fromOwner: EntityRefSchema.optional(),
  newStatus: z.string().optional(),
});

// 12. 秘密揭示
export const SecretRevealChangeSchema = BaseChangeSchema.extend({
  type: z.literal('secret_reveal'),
  /** 秘密 ID（不存在则视为新建） */
  id: z.string(),
  content: z.string().default(''),
  /** 新知情角色 */
  newlyInformed: z.array(EntityRefSchema).default([]),
  newStatus: z.enum(['hidden', 'partially_revealed', 'fully_revealed']).optional(),
});

// 13. 誓约约束变化
export const OathChangeSchema = BaseChangeSchema.extend({
  type: z.literal('oath_change'),
  id: z.string(),
  content: z.string().default(''),
  oathMaker: EntityRefSchema.optional(),
  newStatus: z.enum(['active', 'fulfilled', 'broken', 'released']).optional(),
});

// 14. 截止约束变化
export const DeadlineChangeSchema = BaseChangeSchema.extend({
  type: z.literal('deadline_change'),
  id: z.string(),
  event: z.string().default(''),
  newStatus: z.enum(['pending', 'approaching', 'triggered', 'missed', 'cancelled']).optional(),
  remaining: z.string().optional(),
  chaptersUntil: z.number().optional(),
});

/**
 * 联合类型：所有 CHANGES 条目。
 * 用 discriminatedUnion 按 type 区分，Zod 自动收窄。
 */
export const ChangeSchema = z.discriminatedUnion('type', [
  CharacterStateChangeSchema,
  CharacterLocationChangeSchema,
  CharacterAppearanceChangeSchema,
  RelationshipChangeSchema,
  ConflictChangeSchema,
  ForeshadowChangeSchema,
  PlotNodeChangeSchema,
  LocationStateChangeSchema,
  FactionStateChangeSchema,
  TimelineChangeSchema,
  ItemTransferChangeSchema,
  SecretRevealChangeSchema,
  OathChangeSchema,
  DeadlineChangeSchema,
]);

export type Change = z.infer<typeof ChangeSchema>;

/** CHANGES 类型字面量（14 类，对应 14 种变更） */
export type ChangeType = Change['type'];

/**
 * 完整 CHANGES 协议载荷。AI 每章生成时输出。
 */
export const ChangesPayloadSchema = z.object({
  /** 协议版本 */
  version: z.literal('1.0').default('1.0'),
  /** 对应章节号 */
  chapter: z.number(),
  /** 变更条目列表 */
  changes: z.array(ChangeSchema).default([]),
});

export type ChangesPayload = z.infer<typeof ChangesPayloadSchema>;

// ============================================================
// 版本化快照
// ============================================================

/**
 * 版本化快照记录。每次提交一章后产生一份，不可变。
 * 可按 chapter 回放历史状态。
 */
export interface VersionedSnapshot {
  /** 版本号 = chapter */
  version: number;
  /** 该版本对应的快照 */
  snapshot: StateSnapshot;
  /** 产生该版本的 CHANGES */
  changes: ChangesPayload;
  /** 时间戳 */
  timestamp: string;
}

// ============================================================
// 冲突检测结果
// ============================================================

/**
 * 写入快照时检测到的冲突。
 * 同一 entity+field 出现不同 value 即冲突。
 */
export interface StateConflict {
  /** 冲突类型 */
  kind: 'value_mismatch' | 'missing_entity' | 'type_mismatch' | 'ambiguous_entity';
  /** 涉及实体 */
  entityId: string;
  /** 涉及字段 */
  field: string;
  /** 已存在的值 */
  existingValue: unknown;
  /** 试图写入的值 */
  newValue: unknown;
  /** 来源章节 */
  chapter: number;
  /** 冲突描述（人可读） */
  description: string;
  /** 严重度：critical 表示必须人工确认 */
  severity: 'critical' | 'warning';
}

// ============================================================
// 常量
// ============================================================

/** CHANGES 协议在正文里的分隔符标记 */
export const CHANGES_DELIMITER = '---CHANGES---';

/** CHANGES 协议版本 */
export const CHANGES_PROTOCOL_VERSION = '1.0' as const;

/** 所有 CHANGES 类型（用于遍历/文档生成） */
export const ALL_CHANGE_TYPES: ChangeType[] = [
  'character_state',
  'character_location',
  'character_appearance',
  'relationship',
  'conflict_progress',
  'foreshadow',
  'plot_node',
  'location_state',
  'faction_state',
  'timeline',
  'item_transfer',
  'secret_reveal',
  'oath_change',
  'deadline_change',
];

/**
 * 合同系统类型定义
 * 基于 webnovel-writer-master 的合同驱动架构
 */

// ============================================================
// 项目级合同类型
// ============================================================

/**
 * 项目级合同 - MASTER_SETTING.json
 * 项目的"宪法"，所有其他合同必须遵守
 */
export interface MasterContract {
  // 元信息
  meta: MasterMeta;
  
  // 题材Profile引用
  genreProfile: GenreProfileRef;
  
  // 核心设定
  coreSetting: CoreSetting;
  
  // 角色契约
  characters: CharacterContract[];
  
  // 创意约束
  creativeConstraints: CreativeConstraints;
  
  // 叙事线规划
  strands: StrandPlan;
  
  // 核心伏笔（全局）
  coreForeshadows: ForeshadowContract[];
  
  // 战力体系
  powerSystem: PowerLevelContract;
}

/**
 * 项目元信息
 */
export interface MasterMeta {
  projectId: string;
  title: string;
  genre: GenreType;
  targetWordCount: number;
  chapterCount: number;
  createdAt: string;
  updatedAt: string;
  version: string;
}

/**
 * 题材Profile引用
 */
export interface GenreProfileRef {
  id: string;
  name: string;
  // Hook配置
  hooks: {
    opening: HookType[];
    chapterEnd: HookType[];
    pacing: PacingConfig;
  };
  // 爽点配置
  coolpoints: {
    types: CoolPointType[];
    comboInterval: number;
    density: number;
  };
  // 节奏红线
  pacingRedLines: PacingRedLines;
}

/**
 * 题材类型
 */
export type GenreType = 'xianxia' | 'urban' | 'romance' | 'scifi' | 'fantasy' | 'mystery' | 'historical' | 'other';

/**
 * 节奏红线
 */
export interface PacingRedLines {
  questContinuityMax: number;   // Quest线最大连续章节数
  fireBreakMax: number;         // Fire线最大断档章节数
  constellationInterval: number; // Constellation揭示间隔
}

/**
 * 节奏配置
 */
export interface PacingConfig {
  questContinuityMax: number;
  fireBreakMax: number;
  constellationInterval: number;
}

// ============================================================
// 核心设定
// ============================================================

/**
 * 核心设定
 */
export interface CoreSetting {
  worldType: WorldType;
  powerSystem: string;
  goldenFinger: GoldenFinger;
  timeSetting: TimeSetting;
}

/**
 * 世界类型
 */
export type WorldType = 'urban' | 'ancient' | 'xianxia' | 'scifi' | 'fantasy' | 'historical';

/**
 * 金手指
 */
export interface GoldenFinger {
  type: string;           // 系统/传承/血脉/知识/其他
  name: string;
  style: GoldenFingerStyle;
  visibility: 'immediate' | 'gradual' | 'hidden';
  cost: string;
}

/**
 * 金手指风格
 */
export type GoldenFingerStyle = 'game' | 'cultivation' | 'mystery' | 'power' | 'knowledge';

/**
 * 时间设定
 */
export interface TimeSetting {
  era: string;
  timeline: 'linear' | 'branching' | 'loop';
}

// ============================================================
// 角色契约
// ============================================================

/**
 * 角色契约
 */
export interface CharacterContract {
  id: string;
  name: string;
  role: CharacterRole;
  description: string;
  personality: string[];
  appearance?: string;
  abilities?: string[];
  background?: string;
  // 结构化关系
  relationships: Relationship[];
  // 成长阶段
  growth: CharacterGrowth;
}

/**
 * 角色定位
 */
export type CharacterRole = 'protagonist' | 'antagonist' | 'mentor' | 'love_interest' | 'rival' | 'ally' | 'supporting';

/**
 * 角色关系
 */
export interface Relationship {
  targetName: string;
  type: RelationshipType;
  description: string;
  strength: number;  // 0-1
}

/**
 * 关系类型
 */
export type RelationshipType = 
  | 'friend' 
  | 'enemy' 
  | 'family' 
  | 'lover' 
  | 'rival' 
  | 'mentor' 
  | 'student' 
  | 'alliance' 
  | 'neutral';

/**
 * 角色成长
 */
export interface CharacterGrowth {
  currentStage: number;
  stages: GrowthStage[];
}

/**
 * 成长阶段
 */
export interface GrowthStage {
  stage: number;
  name: string;
  description: string;
  triggerChapter?: number;
}

// ============================================================
// 创意约束
// ============================================================

/**
 * 创意约束
 */
export interface CreativeConstraints {
  antiTrope: string;         // 反套路设计
  hardConstraints: string[];  // 硬约束
  protagonistFlaw: string;     // 主角缺陷驱动
  antagonistMirror: string;   // 反派镜像设计
}

// ============================================================
// 叙事线规划
// ============================================================

/**
 * 叙事线规划
 */
export interface StrandPlan {
  quest: QuestStrand;
  fire: FireStrand;
  constellation: ConstellationStrand;
}

/**
 * Quest线（主线）
 */
export interface QuestStrand {
  mainConflict: string;
  milestones: StrandMilestone[];
}

/**
 * Fire线（感情线）
 */
export interface FireStrand {
  romanceType: RomanceType;
  milestones: StrandMilestone[];
}

/**
 * Constellation线（世界观线）
 */
export interface ConstellationStrand {
  revealPlan: ConstellationReveal[];
}

/**
 * 叙事线里程碑
 */
export interface StrandMilestone {
  chapter: number;
  description: string;
  status: 'pending' | 'active' | 'completed';
}

/**
 * Constellation揭示计划
 */
export interface ConstellationReveal {
  chapter: number;
  rule: string;
  teaser: string;
}

/**
 * 感情线类型
 */
export type RomanceType = 'unrequited' | 'mutual' | 'secret' | 'bittersweet' | 'sweet';

// ============================================================
// 伏笔契约
// ============================================================

/**
 * 伏笔契约
 */
export interface ForeshadowContract {
  id: string;
  hint: string;
  type: ForeshadowType;
  buriedChapter: number;
  revealChapter: number;
  status: ForeshadowStatus;
  description?: string;
}

/**
 * 伏笔类型
 */
export type ForeshadowType = 'item' | 'dialogue' | 'event' | 'mystery' | 'character' | 'ability';

/**
 * 伏笔状态
 */
export type ForeshadowStatus = 'buried' | 'developed' | 'revealed' | 'forgotten';

// ============================================================
// 战力体系
// ============================================================

/**
 * 战力契约
 */
export interface PowerLevelContract {
  levels: PowerLevel[];
  rules: PowerRule[];
  constraints: PowerConstraint[];
}

/**
 * 战力等级
 */
export interface PowerLevel {
  level: number;
  name: string;
  description: string;
  features?: string[];
}

/**
 * 战力规则
 */
export interface PowerRule {
  name: string;
  description: string;
  // 战力上限规则
  upperLimit?: number;
  // 越级规则
  crossLevelLimit?: number;
}

/**
 * 战力约束
 */
export interface PowerConstraint {
  type: 'battle' | 'growth' | 'item' | 'skill';
  description: string;
  rule: string;
}

// ============================================================
// 卷级合同
// ============================================================

/**
 * 卷级合同
 */
export interface VolumeContract {
  meta: VolumeMeta;
  overview: VolumeOverview;
  characters: VolumeCharacters;
  strandProgress: VolumeStrandProgress;
  foreshadows: VolumeForeshadow[];
  climax: VolumeClimax;
}

/**
 * 卷元信息
 */
export interface VolumeMeta {
  volumeId: string;
  volumeNumber: number;
  title: string;
  startChapter: number;
  endChapter: number;
  targetWordCount: number;
}

/**
 * 卷概述
 */
export interface VolumeOverview {
  theme: string;
  mainConflict: string;
  subplots: string[];
}

/**
 * 卷角色
 */
export interface VolumeCharacters {
  added: CharacterInVolume[];
  arcs: CharacterArcInVolume[];
}

/**
 * 卷中角色
 */
export interface CharacterInVolume {
  characterId: string;
  firstAppearanceChapter: number;
  role: CharacterRole;
}

/**
 * 卷中角色弧线
 */
export interface CharacterArcInVolume {
  characterId: string;
  arcDescription: string;
  startChapter: number;
  endChapter: number;
}

/**
 * 卷叙事线进度
 */
export interface VolumeStrandProgress {
  quest: QuestProgress;
  fire: FireProgress;
  constellation: ConstellationProgress;
}

/**
 * Quest进度
 */
export interface QuestProgress {
  currentStage: number;
  stages: QuestStage[];
  conflicts: QuestConflict[];
}

/**
 * Quest阶段
 */
export interface QuestStage {
  stage: number;
  name: string;
  startChapter: number;
  endChapter: number;
  status: 'pending' | 'active' | 'completed';
}

/**
 * Quest冲突
 */
export interface QuestConflict {
  id: string;
  description: string;
  status: 'active' | 'resolved';
  chapters: number[];
}

/**
 * Fire进度
 */
export interface FireProgress {
  romanceType: RomanceType;
  currentStage: number;
  milestones: FireMilestone[];
}

/**
 * Fire里程碑
 */
export interface FireMilestone {
  chapter: number;
  type: FireMilestoneType;
  description: string;
  status: 'pending' | 'completed';
}

/**
 * Fire里程碑类型
 */
export type FireMilestoneType = 'confession' | 'kiss' | 'conflict' | 'breakup' | 'reunion';

/**
 * Constellation进度
 */
export interface ConstellationProgress {
  revealedRules: string[];
  revealedMysteries: string[];
  nextReveal: NextReveal | null;
}

/**
 * 下一个揭示
 */
export interface NextReveal {
  rule: string;
  expectedChapter: number;
  teaser: string;
}

/**
 * 卷伏笔
 */
export interface VolumeForeshadow {
  foreshadowId: string;
  buriedInChapter: number;
  plannedRevealChapter: number;
}

/**
 * 卷高潮
 */
export interface VolumeClimax {
  chapter: number;
  description: string;
  type: ClimaxType;
}

/**
 * 高潮类型
 */
export type ClimaxType = 'battle' | 'emotional' | 'revelation' | 'choice' | 'sacrifice';

// ============================================================
// 章节合同
// ============================================================

/**
 * 章节合同
 */
export interface ChapterContract {
  meta: ChapterMeta;
  // CBN: Chapter Beginning Node (章节起点)
  cbn: ChapterBeginningNode;
  // CPNs: Chapter Progress Nodes (章节推进节点)
  cpns: ChapterProgressNode[];
  // CEN: Chapter End Node (章节终点)
  cen: ChapterEndNode;
  // 角色出场
  charactersPresent: string[];
  // 地点
  location: string;
  // 约束
  constraints: ChapterConstraints;
  // 伏笔操作
  foreshadowOps: ForeshadowOp[];
}

/**
 * 章节元信息
 */
export interface ChapterMeta {
  chapterId: string;
  chapterNumber: number;
  volumeId: string;
  title: string;
  targetWordCount: number;
  status: ContractStatus;
}

/**
 * 合同状态
 */
export type ContractStatus = 'draft' | 'locked' | 'in_progress' | 'completed' | 'revised';

/**
 * 章节起点
 */
export interface ChapterBeginningNode {
  situation: string;
  characterStatus: string;
  pendingIssues: string[];
  hook: HookInstance;
}

/**
 * 章节推进节点
 */
export interface ChapterProgressNode {
  id: string;
  order: number;
  type: CPNType;
  description: string;
  expectedLength: number;
  strand?: 'quest' | 'fire' | 'constellation';
}

/**
 * 推进节点类型
 */
export type CPNType = 'conflict' | 'revelation' | 'character' | 'transition' | 'foreshadow' | 'coolpoint';

/**
 * 章节终点
 */
export interface ChapterEndNode {
  resolution: string;
  newHook: HookInstance;
  foreshadowReveal?: string;
  cliffhanger?: CliffhangerInstance;
}

/**
 * 章节约束
 */
export interface ChapterConstraints {
  mustInclude: string[];
  mustNotInclude: string[];
  callbacks: Callback[];
}

/**
 * 回调要求
 */
export interface Callback {
  type: 'character' | 'plot' | 'setting';
  description: string;
  sourceChapter: number;
}

/**
 * 伏笔操作
 */
export interface ForeshadowOp {
  id: string;
  type: 'burial' | 'development' | 'reveal';
  foreshadowId: string;
  description: string;
  chapter: number;
}

// ============================================================
// 钩子实例
// ============================================================

/**
 * 钩子实例
 */
export interface HookInstance {
  type: HookType;
  description: string;
  details: HookDetails;
  payoffChapter?: number;
}

/**
 * 钩子详情
 */
export interface HookDetails {
  question?: string;
  tension?: string;
  reveal?: string;
  choice?: string;
  mystery?: string;
  emotional?: string;
}

/**
 * 钩子类型
 */
export type HookType = 
  | 'cliffhanger'    // 悬崖式悬念
  | 'question'        // 疑问式钩子
  | 'revelation'     // 揭示式钩子
  | 'conflict'        // 冲突式钩子
  | 'tension'        // 紧张式钩子
  | 'choice'         // 选择式钩子
  | 'mystery'         // 神秘式钩子
  | 'emotional'       // 情感式钩子
  | 'action';         // 动作式钩子

/**
 * 悬崖实例
 */
export interface CliffhangerInstance {
  type: 'danger' | 'revelation' | 'choice' | 'mystery';
  description: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

// ============================================================
// 爽点类型（与 evaluation.ts 共享）
// ============================================================

/**
 * 爽点类型
 */
export type CoolPointType = 
  | 'face-slapping'      // 打脸
  | 'show-off'          // 装逼
  | 'identity-reveal'   // 身份掉马
  | 'growth'            // 成长
  | 'rescue'            // 英雄救美
  | 'treasure'          // 获得宝物
  | 'breakthrough'       // 突破
  | 'romance'           // 感情进展
  | 'revenge'           // 复仇
  | 'mystery-reveal'    // 真相揭示
  | 'comedy'            // 搞笑
  | 'justice';           // 正义伸张

// ============================================================
// 辅助函数
// ============================================================

/**
 * 创建空的项目合同
 */
export function createEmptyMasterContract(projectId: string, title: string): MasterContract {
  return {
    meta: {
      projectId,
      title,
      genre: 'urban',
      targetWordCount: 300000,
      chapterCount: 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: '1.0.0',
    },
    genreProfile: {
      id: 'urban',
      name: '都市',
      hooks: {
        opening: ['conflict'],
        chapterEnd: ['cliffhanger'],
        pacing: { questContinuityMax: 5, fireBreakMax: 10, constellationInterval: 10 },
      },
      coolpoints: {
        types: ['face-slapping', 'show-off'],
        comboInterval: 3,
        density: 2.0,
      },
      pacingRedLines: {
        questContinuityMax: 7,
        fireBreakMax: 15,
        constellationInterval: 10,
      },
    },
    coreSetting: {
      worldType: 'urban',
      powerSystem: 'modern',
      goldenFinger: { type: '', name: '', style: 'game', visibility: 'immediate', cost: '' },
      timeSetting: { era: 'modern', timeline: 'linear' },
    },
    characters: [],
    creativeConstraints: {
      antiTrope: '',
      hardConstraints: [],
      protagonistFlaw: '',
      antagonistMirror: '',
    },
    strands: {
      quest: { mainConflict: '', milestones: [] },
      fire: { romanceType: 'mutual', milestones: [] },
      constellation: { revealPlan: [] },
    },
    coreForeshadows: [],
    powerSystem: { levels: [], rules: [], constraints: [] },
  };
}

/**
 * 创建章节合同
 */
export function createEmptyChapterContract(
  chapterNumber: number,
  title: string,
  volumeId: string
): ChapterContract {
  return {
    meta: {
      chapterId: `ch-${chapterNumber}`,
      chapterNumber,
      volumeId,
      title,
      targetWordCount: 3000,
      status: 'draft',
    },
    cbn: {
      situation: '',
      characterStatus: '',
      pendingIssues: [],
      hook: { type: 'conflict', description: '', details: {} },
    },
    cpns: [],
    cen: {
      resolution: '',
      newHook: { type: 'cliffhanger', description: '', details: {} },
    },
    charactersPresent: [],
    location: '',
    constraints: { mustInclude: [], mustNotInclude: [], callbacks: [] },
    foreshadowOps: [],
  };
}

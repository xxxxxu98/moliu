/**
 * Moliu v2.0 主入口
 * 
 * 导出所有核心模块，提供统一的使用接口
 */

// ============================================================
// Types 导出 (注意: 部分类型已在 evaluation.ts 中统一定义)
// ============================================================

// 合同系统类型
export type {
  MasterContract,
  VolumeContract,
  ChapterContract,
  ContractStatus,
  CharacterContract,
  ForeshadowContract,
  ForeshadowStatus,
  StrandPlan,
  QuestStrand,
  FireStrand,
  ConstellationStrand,
  PowerLevelContract,
  HookInstance,
  CliffhangerInstance,
  CoolPointType,
  HookType,
  createEmptyMasterContract,
  createEmptyChapterContract,
} from './types/contract';

// 评估系统类型 (核心类型定义)
export type {
  ReadRetentionScore,
  ReadRetentionDimensions,
  HookScore,
  CoolPointScore,
  MicroFulfillmentScore,
  SuspenseDebtScore,
  RhythmHealthScore,
  OriginalityScore,
  GenreMatch,
  RiskWarning,
  RiskLevel,
  GenreProfile,
  CoolPointType,
  HookType,
  FiveDimensionEvaluation,
  EvaluationDimension,
  createEmptyReadRetentionScore,
} from './types/evaluation';

// 记忆系统类型
export type {
  ProjectState,
  EntityIndex,
  MemoryScratchpad,
  ChapterSummary,
  ForeshadowStatus,
  CharacterState,
  Entity,
  Relation,
  Event,
} from './types/memory';

// Strand系统类型
export type {
  StrandPlan,
  QuestStrand,
  FireStrand,
  ConstellationStrand,
  StrandStatus,
  RomanceType,
  FireMilestoneType,
  StrandWeaveConfig,
  PacingRedLines,
  createEmptyStrandPlan,
  createDefaultPacingRedLines,
} from './types/strand';

// 钩子类型 (辅助函数)
export {
  HOOK_TECHNIQUES,
  HOOK_TEMPLATES,
  getRecommendedHooks,
  getHookTypeName,
  getHookTypeDescription,
  createHookInstance,
} from './types/hook';

// ============================================================
// Data 导出
// ============================================================

// 题材Profile
export {
  GENRE_PROFILES,
  getGenreProfile,
  getGenreProfileByName,
  matchGenreProfile,
  getAllGenreProfiles,
  getGenreHooks,
  getGenreCoolpoints,
  validateGenreProfile,
  GENRE_TYPE_MAP,
  getGenreType,
} from './data/genre-profiles';

// 钩子技法
export {
  HOOK_TECHNIQUES,
  HOOK_TEMPLATES,
  GENRE_HOOK_PREFERENCES,
  getHookTechnique,
  getAllHookTechniques,
  getRecommendedHooksForGenre,
  getHookTechniquesForGenre,
  getHighEffectivenessHooks,
  getEasyHooks,
  getHookTemplatesForType,
  generateHook,
  getHookTypeName,
  getHookTypeDescription,
} from './data/hook-techniques';

// 爽点公式
export {
  COOLPOINT_FORMULAS,
  COOLPOINT_RHYTHM,
  COOLPOINT_COMBOS,
  getCoolPointFormula,
  getAllCoolPointFormulas,
  getRecommendedCoolPoints,
  getHighIntensityCoolPoints,
  getEasyCoolPoints,
  getCoolPointName,
  getCoolPointDescription,
  validateCoolPointRhythm,
  generateCoolPointSequence,
} from './data/coolpoint-formulas';

// 禁用词库
export {
  BANNED_WORDS,
  BANNED_PATTERNS,
  checkBannedWords,
  checkBannedPatterns,
  filterBannedWords,
  getBannedWordStats,
  getBannedWordSuggestions,
  getBannedWordsByCategory,
  getBannedWordsBySeverity,
  checkQualityWarnings,
  getQualityScore,
} from './data/banned-words';

// 反套路规则
export {
  ANTI_TROPES,
  ANTI_TROPE_RULES,
  TROPE_COMBINATIONS,
  getAntiTrope,
  getAllAntiTropes,
  getAntiTropesByGenre,
  getAntiTropesByDifficulty,
  getHighEffectivenessAntiTropes,
  suggestAntiTropes,
  getAntiTropeRules,
  getTropeCombinations,
  generateAntiTropeDesign,
  evaluateAntiTropeStrength,
} from './data/anti-trope-rules';

// 冲突模板
export {
  CONFLICT_TEMPLATES,
  CONFLICT_CURVES,
  getConflictTemplate,
  getAllConflictTemplates,
  getConflictTemplatesByType,
  getConflictTemplatesByGenre,
  getConflictTemplatesByDifficulty,
  getHighEffectivenessConflicts,
  getConflictTypeName,
  recommendConflictTemplates,
  generateConflictArc,
  calculateConflictIntensity,
  getConflictCurve,
  generateConflictSequence,
} from './data/conflict-templates';

// ============================================================
// Composables 导出
// ============================================================

export {
  useContractManager,
  useMemorySystem,
  useMarketTrends,
  useInspirationEvaluation,
  useWritingOrchestrator,
  useContextManager,
  useChapterWriter,
  useQualityChecker,
  usePromptBuilder,
  useForeshadowTracker,
  useCharacterConsistency,
  useAntiAI,
  createWritingSystem,
} from './composables';

// ============================================================
// 版本信息
// ============================================================

export const VERSION = '2.0.0';
export const BUILD_DATE = '2026-05-18';
export const BUILD_INFO = {
  version: VERSION,
  buildDate: BUILD_DATE,
  features: [
    'contract-driven-architecture',
    'memory-system',
    'read-retention-scoring',
    'anti-ai-detection',
    'genre-profiles',
    'hook-techniques',
    'coolpoint-formulas',
    'conflict-templates',
  ],
};

// ============================================================
// 工具函数
// ============================================================

/**
 * 创建默认项目配置
 */
export function createDefaultProjectConfig() {
  return {
    version: VERSION,
    settings: {
      autoSave: true,
      autoSaveInterval: 5000,
      qualityThreshold: 70,
      maxRetries: 3,
    },
    genre: 'urban' as const,
    targetWordCount: 300000,
    chapterCount: 100,
    enabledFeatures: [
      'contract-system',
      'memory-system',
      'quality-checker',
      'anti-ai',
      'market-trends',
    ],
  };
}

/**
 * 验证版本兼容性
 */
export function checkVersionCompatibility(version: string): {
  compatible: boolean;
  message: string;
} {
  const [major] = version.split('.').map(Number);
  
  if (major !== 2) {
    return {
      compatible: false,
      message: `版本不兼容：当前需要 v2.x，但检测到 v${major}.x。请升级到最新版本。`,
    };
  }
  
  return {
    compatible: true,
    message: '版本兼容',
  };
}

// ============================================================
// 初始化日志
// ============================================================

console.log(`[Moliu v${VERSION}] 系统已初始化`);
console.log(`[Moliu v${VERSION}] 构建日期: ${BUILD_DATE}`);

/**
 * 完结感知与进度管理系统导出
 * 
 * 本模块整合了增强的完结感知、进度追踪、伏笔管理和故事线管理功能
 */

// 类型导出
export * from './types/ending-perception';

// 完结感知引擎
export { 
  EndingPerceptionEngine,
  createEndingPerceptionEngine,
  generatePlotPhaseInfo,
  generateEndingGuidance,
  generatePayoffMissions,
  generateWritingStrategyAdjustment,
} from './services/writing/ending-perception-engine';

// 故事线管理器
export {
  StorylineManager,
  createStorylineManager,
} from './services/writing/storyline-manager';

// 增强伏笔追踪
export {
  ForeshadowTracker,
  ForeshadowAnalyzer,
  createForeshadowTracker,
  batchCreatePayoffMissions,
  type ForeshadowReport,
} from './services/writing/enhanced-foreshadow-tracker';

// 八条故事线管理器
export {
  EightStoryLinesManager,
  createEightStoryLinesManager,
} from './services/writing/eight-story-lines-manager';

// 写作任务书构建器（已更新）
export {
  WritingTaskBuilder,
  createTaskBookBuilder,
  buildAndExportTaskBook,
  type TaskBookBuildOptions,
} from './services/writing/writing-task-builder';

// ============================================================
// v2.0 写作系统
// ============================================================

// 预检服务
export {
  PreflightService,
  usePreflightService,
} from './services/writing/preflight/PreflightService';

// 投影写入器
export {
  ProjectionOrchestrator,
  useProjectionOrchestrator,
  type ProjectionWriters,
  type StateWriter,
  type IndexWriter,
  type SummaryWriter,
  type MemoryWriter,
  type VectorWriter,
} from './services/writing/commit/ProjectionWriters';

// 反模式注册表
export {
  AntiPatternsRegistryService,
  useAntiPatternsRegistry,
} from './services/writing/anti-patterns/AntiPatternsRegistry';

// 六门禁润色管道
export {
  SixGatePolishPipeline,
  useSixGatePolishPipeline,
} from './services/writing/polish/SixGatePolishPipeline';

// 章节提交管理器 v2
export {
  useChapterCommitManagerV2,
  type CommitInput,
  type CommitResult,
} from './services/writing/commit/ChapterCommitManagerV2';

// 写作编排器 v2
export {
  useWritingOrchestratorV2,
  type WritingOrchestratorOptions,
  type WritingOrchestratorState,
} from './services/writing/WritingOrchestratorV2';

// 类型定义
export * from './types/writing-v2';

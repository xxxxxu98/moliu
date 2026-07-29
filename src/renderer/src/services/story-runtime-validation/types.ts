/**
 * 可重复长篇运行时验证的公共类型。
 *
 * 数据集分类参考 ConStory-Bench 的长程一致性思路，并按中文网文运行时需要
 * 拆分人物约束、事实、文风、时间因果与世界规则。
 */

export type ValidationCategory =
  | 'character_memory'
  | 'character_knowledge'
  | 'character_ability'
  | 'fact'
  | 'style'
  | 'temporal_causality'
  | 'world_rule';

export type SyntheticChapterScale = 100 | 500 | 2000;

export interface SyntheticStateExpectation {
  entityId: string;
  field: string;
  expectedValue: string;
}

export interface SyntheticStyleExpectation {
  perspective: 'third_person_limited';
  tone: '冷峻克制';
  forbiddenPatterns: string[];
}

export interface SyntheticChapterOracle {
  knownEntities: string[];
  introducedEntities: string[];
  mustCover: string[];
  forbiddenFacts: string[];
  stateExpectations: SyntheticStateExpectation[];
  style: SyntheticStyleExpectation;
  causalPredecessors: number[];
  worldRules: string[];
}

export interface SyntheticChapter {
  id: string;
  chapterNumber: number;
  title: string;
  category: ValidationCategory;
  content: string;
  characterCount: number;
  oracle: SyntheticChapterOracle;
}

export interface SyntheticChapterGeneratorOptions {
  chapterCount: SyntheticChapterScale;
  seed?: number;
}

export interface ValidationMetricSample {
  chapterNumber: number;
  characterCount: number;
  consistencyErrorCount: number;
  entityMentionCount: number;
  unknownEntityCount: number;
  stateCheckCount: number;
  stateDriftCount: number;
  mustCoverCount: number;
  mustCoverMissCount: number;
  incorrectFactCount: number;
  incorrectFactStoredCount: number;
  retrievalLatencyMs: number[];
  contextTokens: number;
}

export interface ValidationMetrics {
  chapterCount: number;
  characterCount: number;
  consistencyErrorCount: number;
  cedPerTenThousandCharacters: number;
  entityMentionCount: number;
  unknownEntityCount: number;
  unknownEntityRate: number;
  stateCheckCount: number;
  stateDriftCount: number;
  stateDriftRate: number;
  mustCoverCount: number;
  mustCoverMissCount: number;
  mustCoverMissRate: number;
  incorrectFactCount: number;
  incorrectFactStoredCount: number;
  incorrectFactStorageRate: number;
  retrievalSampleCount: number;
  retrievalLatencyP50Ms: number;
  retrievalLatencyP95Ms: number;
  totalContextTokens: number;
  averageContextTokens: number;
  contextTokensP95: number;
}

export type BenchmarkScenario =
  | 'accepted_rejected'
  | 'startup_resume'
  | 'crash_recovery'
  | 'rewrite_rollback';

export type RuntimeChapterPhase = 'primary' | 'retry_after_crash' | 'rewrite';

export interface RuntimeStartInput {
  scenario: BenchmarkScenario;
  mode: 'fresh' | 'resume';
  checkpoint?: unknown;
}

export interface RuntimeChapterInput {
  scenario: BenchmarkScenario;
  phase: RuntimeChapterPhase;
  attempt: number;
  chapter: SyntheticChapter;
  shouldInjectCrash: boolean;
}

export interface RuntimeChapterResult {
  status: 'accepted' | 'rejected';
  metrics: ValidationMetricSample;
  reason?: string;
}

/**
 * 真实 SQLite、AI 或现有写作编排器通过此接口接入。验证工具本身不依赖具体运行时。
 */
export interface StoryRuntimeRunner {
  start(input: RuntimeStartInput): Promise<void>;
  runChapter(input: RuntimeChapterInput): Promise<RuntimeChapterResult>;
  createCheckpoint(): Promise<unknown>;
  restore(checkpoint: unknown): Promise<void>;
  rollback(checkpoint: unknown): Promise<void>;
  stop?(): Promise<void>;
}

export type StoryRuntimeRunnerFactory = () => StoryRuntimeRunner;

export interface BenchmarkHarnessOptions {
  scenarios?: BenchmarkScenario[];
  crashChapter?: number;
  resumeAfterChapter?: number;
  rewriteChapter?: number;
}

export interface BenchmarkTrace {
  scenario: BenchmarkScenario;
  chapterNumber: number;
  phase: RuntimeChapterPhase;
  status: 'accepted' | 'rejected' | 'crashed' | 'rolled_back';
  reason?: string;
}

export interface BenchmarkScenarioReport {
  scenario: BenchmarkScenario;
  acceptedCount: number;
  rejectedCount: number;
  crashCount: number;
  recoveryCount: number;
  rollbackCount: number;
  metrics: ValidationMetrics;
  traces: BenchmarkTrace[];
}

export interface BenchmarkReport {
  scenarios: BenchmarkScenarioReport[];
}

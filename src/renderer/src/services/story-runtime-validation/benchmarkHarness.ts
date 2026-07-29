import { ValidationMetricsCollector } from './metrics';
import type {
  BenchmarkHarnessOptions,
  BenchmarkReport,
  BenchmarkScenario,
  BenchmarkScenarioReport,
  BenchmarkTrace,
  RuntimeChapterPhase,
  RuntimeChapterResult,
  StoryRuntimeRunner,
  StoryRuntimeRunnerFactory,
  SyntheticChapter,
} from './types';

const DEFAULT_SCENARIOS: readonly BenchmarkScenario[] = [
  'accepted_rejected',
  'startup_resume',
  'crash_recovery',
  'rewrite_rollback',
];

interface MutableScenarioState {
  acceptedCount: number;
  rejectedCount: number;
  crashCount: number;
  recoveryCount: number;
  rollbackCount: number;
  collector: ValidationMetricsCollector;
  traces: BenchmarkTrace[];
}

function createScenarioState(): MutableScenarioState {
  return {
    acceptedCount: 0,
    rejectedCount: 0,
    crashCount: 0,
    recoveryCount: 0,
    rollbackCount: 0,
    collector: new ValidationMetricsCollector(),
    traces: [],
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function stopRunner(runner: StoryRuntimeRunner): Promise<void> {
  if (runner.stop) {
    await runner.stop();
  }
}

/**
 * 通过可注入 runner 验证运行时协议，不直接导入 SQLite、Electron 或 AI 客户端。
 */
export class StoryRuntimeBenchmarkHarness {
  private readonly runnerFactory: StoryRuntimeRunnerFactory;

  constructor(runnerFactory: StoryRuntimeRunnerFactory) {
    this.runnerFactory = runnerFactory;
  }

  async run(
    chapters: Iterable<SyntheticChapter>,
    options: BenchmarkHarnessOptions = {}
  ): Promise<BenchmarkReport> {
    const chapterList = [...chapters];
    if (chapterList.length === 0) {
      throw new RangeError('benchmark 至少需要一章数据');
    }

    const scenarios = options.scenarios ?? [...DEFAULT_SCENARIOS];
    const reports: BenchmarkScenarioReport[] = [];
    for (const scenario of scenarios) {
      reports.push(await this.runScenario(scenario, chapterList, options));
    }
    return { scenarios: reports };
  }

  private async runScenario(
    scenario: BenchmarkScenario,
    chapters: readonly SyntheticChapter[],
    options: BenchmarkHarnessOptions
  ): Promise<BenchmarkScenarioReport> {
    const state = createScenarioState();

    switch (scenario) {
      case 'accepted_rejected':
        await this.runAcceptedRejected(chapters, state);
        break;
      case 'startup_resume':
        await this.runStartupResume(chapters, state, options);
        break;
      case 'crash_recovery':
        await this.runCrashRecovery(chapters, state, options);
        break;
      case 'rewrite_rollback':
        await this.runRewriteRollback(chapters, state, options);
        break;
      default: {
        const exhaustiveCheck: never = scenario;
        throw new Error(`未知 benchmark 场景：${exhaustiveCheck}`);
      }
    }

    return {
      scenario,
      acceptedCount: state.acceptedCount,
      rejectedCount: state.rejectedCount,
      crashCount: state.crashCount,
      recoveryCount: state.recoveryCount,
      rollbackCount: state.rollbackCount,
      metrics: state.collector.getMetrics(),
      traces: state.traces,
    };
  }

  private async startRunner(
    scenario: BenchmarkScenario,
    mode: 'fresh' | 'resume',
    checkpoint?: unknown
  ): Promise<StoryRuntimeRunner> {
    const runner = this.runnerFactory();
    await runner.start({ scenario, mode, checkpoint });
    return runner;
  }

  private async execute(
    runner: StoryRuntimeRunner,
    scenario: BenchmarkScenario,
    chapter: SyntheticChapter,
    phase: RuntimeChapterPhase,
    attempt: number,
    shouldInjectCrash: boolean,
    state: MutableScenarioState
  ): Promise<RuntimeChapterResult> {
    const result = await runner.runChapter({
      scenario,
      phase,
      attempt,
      chapter,
      shouldInjectCrash,
    });
    state.collector.add(result.metrics);
    if (result.status === 'accepted') {
      state.acceptedCount += 1;
    } else {
      state.rejectedCount += 1;
    }
    state.traces.push({
      scenario,
      chapterNumber: chapter.chapterNumber,
      phase,
      status: result.status,
      reason: result.reason,
    });
    return result;
  }

  private async runAcceptedRejected(
    chapters: readonly SyntheticChapter[],
    state: MutableScenarioState
  ): Promise<void> {
    const scenario: BenchmarkScenario = 'accepted_rejected';
    const runner = await this.startRunner(scenario, 'fresh');
    try {
      for (const chapter of chapters) {
        await this.execute(runner, scenario, chapter, 'primary', 1, false, state);
      }
    } finally {
      await stopRunner(runner);
    }
  }

  private async runStartupResume(
    chapters: readonly SyntheticChapter[],
    state: MutableScenarioState,
    options: BenchmarkHarnessOptions
  ): Promise<void> {
    const scenario: BenchmarkScenario = 'startup_resume';
    const defaultSplit = chapters[Math.max(0, Math.floor(chapters.length / 2) - 1)].chapterNumber;
    const resumeAfterChapter = options.resumeAfterChapter ?? defaultSplit;
    let runner = await this.startRunner(scenario, 'fresh');
    let checkpoint = await runner.createCheckpoint();

    try {
      for (const chapter of chapters) {
        if (chapter.chapterNumber > resumeAfterChapter) {
          break;
        }
        const result = await this.execute(
          runner,
          scenario,
          chapter,
          'primary',
          1,
          false,
          state
        );
        if (result.status === 'accepted') {
          checkpoint = await runner.createCheckpoint();
        }
      }

      await stopRunner(runner);
      runner = await this.startRunner(scenario, 'resume', checkpoint);
      state.recoveryCount += 1;

      for (const chapter of chapters) {
        if (chapter.chapterNumber <= resumeAfterChapter) {
          continue;
        }
        await this.execute(runner, scenario, chapter, 'primary', 1, false, state);
      }
    } finally {
      await stopRunner(runner);
    }
  }

  private async runCrashRecovery(
    chapters: readonly SyntheticChapter[],
    state: MutableScenarioState,
    options: BenchmarkHarnessOptions
  ): Promise<void> {
    const scenario: BenchmarkScenario = 'crash_recovery';
    const defaultCrashChapter = chapters[Math.floor(chapters.length / 2)].chapterNumber;
    const crashChapter = options.crashChapter ?? defaultCrashChapter;
    let runner = await this.startRunner(scenario, 'fresh');
    let checkpoint = await runner.createCheckpoint();

    try {
      for (const chapter of chapters) {
        try {
          const result = await this.execute(
            runner,
            scenario,
            chapter,
            'primary',
            1,
            chapter.chapterNumber === crashChapter,
            state
          );
          if (result.status === 'accepted') {
            checkpoint = await runner.createCheckpoint();
          }
        } catch (error: unknown) {
          if (chapter.chapterNumber !== crashChapter) {
            throw error;
          }

          state.crashCount += 1;
          state.traces.push({
            scenario,
            chapterNumber: chapter.chapterNumber,
            phase: 'primary',
            status: 'crashed',
            reason: getErrorMessage(error),
          });
          await stopRunner(runner);
          runner = await this.startRunner(scenario, 'resume', checkpoint);
          await runner.restore(checkpoint);
          state.recoveryCount += 1;

          const retryResult = await this.execute(
            runner,
            scenario,
            chapter,
            'retry_after_crash',
            2,
            false,
            state
          );
          if (retryResult.status === 'accepted') {
            checkpoint = await runner.createCheckpoint();
          }
        }
      }
    } finally {
      await stopRunner(runner);
    }
  }

  private async runRewriteRollback(
    chapters: readonly SyntheticChapter[],
    state: MutableScenarioState,
    options: BenchmarkHarnessOptions
  ): Promise<void> {
    const scenario: BenchmarkScenario = 'rewrite_rollback';
    const defaultRewriteChapter = chapters[Math.floor(chapters.length / 2)].chapterNumber;
    const rewriteChapter = options.rewriteChapter ?? defaultRewriteChapter;
    const runner = await this.startRunner(scenario, 'fresh');

    try {
      for (const chapter of chapters) {
        const checkpoint = await runner.createCheckpoint();
        const result = await this.execute(
          runner,
          scenario,
          chapter,
          'primary',
          1,
          false,
          state
        );
        if (chapter.chapterNumber !== rewriteChapter || result.status !== 'rejected') {
          continue;
        }

        try {
          const rewriteResult = await this.execute(
            runner,
            scenario,
            chapter,
            'rewrite',
            2,
            false,
            state
          );
          if (rewriteResult.status === 'rejected') {
            await this.rollback(runner, scenario, chapter, checkpoint, state, rewriteResult.reason);
          }
        } catch (error: unknown) {
          await this.rollback(
            runner,
            scenario,
            chapter,
            checkpoint,
            state,
            getErrorMessage(error)
          );
        }
      }
    } finally {
      await stopRunner(runner);
    }
  }

  private async rollback(
    runner: StoryRuntimeRunner,
    scenario: BenchmarkScenario,
    chapter: SyntheticChapter,
    checkpoint: unknown,
    state: MutableScenarioState,
    reason?: string
  ): Promise<void> {
    await runner.rollback(checkpoint);
    state.rollbackCount += 1;
    state.traces.push({
      scenario,
      chapterNumber: chapter.chapterNumber,
      phase: 'rewrite',
      status: 'rolled_back',
      reason,
    });
  }
}

import { describe, expect, it } from 'vitest';
import {
  StoryRuntimeBenchmarkHarness,
  aggregateValidationMetrics,
  generateSyntheticChapters,
} from '..';
import type {
  BenchmarkScenario,
  RuntimeChapterInput,
  RuntimeChapterResult,
  RuntimeStartInput,
  StoryRuntimeRunner,
  SyntheticChapter,
  SyntheticChapterScale,
  ValidationMetricSample,
} from '..';

function createMetricSample(chapter: SyntheticChapter): ValidationMetricSample {
  const chapterNumber = chapter.chapterNumber;
  const hasIncorrectFact = chapterNumber % 50 === 0;
  return {
    chapterNumber,
    characterCount: chapter.characterCount,
    consistencyErrorCount: chapterNumber % 10 === 0 ? 1 : 0,
    entityMentionCount: 4,
    unknownEntityCount: chapterNumber % 20 === 0 ? 1 : 0,
    stateCheckCount: 2,
    stateDriftCount: chapterNumber % 25 === 0 ? 1 : 0,
    mustCoverCount: 1,
    mustCoverMissCount: chapterNumber % 40 === 0 ? 1 : 0,
    incorrectFactCount: hasIncorrectFact ? 1 : 0,
    incorrectFactStoredCount: chapterNumber % 100 === 0 ? 1 : 0,
    retrievalLatencyMs: [chapterNumber % 100, (chapterNumber % 100) + 0.5],
    contextTokens: 1000 + (chapterNumber % 10),
  };
}

describe('中文合成长篇数据生成器', () => {
  it.each<SyntheticChapterScale>([100, 500, 2000])(
    '按需生成 %i 章且覆盖全部一致性分类',
    chapterCount => {
      const chapters = [...generateSyntheticChapters({ chapterCount, seed: 42 })];
      expect(chapters).toHaveLength(chapterCount);
      expect(chapters[0].chapterNumber).toBe(1);
      expect(chapters.at(-1)?.chapterNumber).toBe(chapterCount);

      if (chapterCount >= 100) {
        expect(new Set(chapters.map(chapter => chapter.category))).toEqual(
          new Set([
            'character_memory',
            'character_knowledge',
            'character_ability',
            'fact',
            'style',
            'temporal_causality',
            'world_rule',
          ])
        );
      }
    }
  );

  it('相同 seed 可重复生成且不同 seed 会改变实体组合', () => {
    const first = [...generateSyntheticChapters({ chapterCount: 100, seed: 7 })];
    const repeated = [...generateSyntheticChapters({ chapterCount: 100, seed: 7 })];
    const different = [...generateSyntheticChapters({ chapterCount: 100, seed: 8 })];

    expect(repeated).toEqual(first);
    expect(different[0].content).not.toBe(first[0].content);
  });
});

describe('长篇指标聚合', () => {
  it('快速聚合 2000 章纯内存数据并计算确定性指标', () => {
    const chapters = generateSyntheticChapters({ chapterCount: 2000, seed: 20260729 });
    const samples = Array.from(chapters, createMetricSample);
    const metrics = aggregateValidationMetrics(samples);

    expect(metrics.chapterCount).toBe(2000);
    expect(metrics.characterCount).toBeGreaterThan(180_000);
    expect(metrics.consistencyErrorCount).toBe(200);
    expect(metrics.cedPerTenThousandCharacters).toBeGreaterThan(0);
    expect(metrics.unknownEntityRate).toBe(0.0125);
    expect(metrics.stateDriftRate).toBe(0.02);
    expect(metrics.mustCoverMissRate).toBe(0.025);
    expect(metrics.incorrectFactStorageRate).toBe(0.5);
    expect(metrics.retrievalSampleCount).toBe(4000);
    expect(metrics.retrievalLatencyP50Ms).toBe(49.5);
    expect(metrics.retrievalLatencyP95Ms).toBe(94.5);
    expect(metrics.totalContextTokens).toBe(2_009_000);
    expect(metrics.averageContextTokens).toBe(1004.5);
    expect(metrics.contextTokensP95).toBe(1009);
  });
});

interface MockRuntimeLog {
  starts: RuntimeStartInput[];
  restoredCount: number;
  rollbackCount: number;
}

class MockRuntimeRunner implements StoryRuntimeRunner {
  private revision = 0;
  private readonly log: MockRuntimeLog;

  constructor(log: MockRuntimeLog) {
    this.log = log;
  }

  async start(input: RuntimeStartInput): Promise<void> {
    this.log.starts.push(input);
  }

  async runChapter(input: RuntimeChapterInput): Promise<RuntimeChapterResult> {
    if (input.scenario === 'crash_recovery' && input.shouldInjectCrash) {
      throw new Error('注入崩溃');
    }

    this.revision += 1;
    const isRejectedInNormalRun =
      input.scenario === 'accepted_rejected' && input.chapter.chapterNumber === 2;
    const isRejectedRewrite =
      input.scenario === 'rewrite_rollback' &&
      input.chapter.chapterNumber === 3 &&
      (input.phase === 'primary' || input.phase === 'rewrite');

    return {
      status: isRejectedInNormalRun || isRejectedRewrite ? 'rejected' : 'accepted',
      metrics: createMetricSample(input.chapter),
    };
  }

  async createCheckpoint(): Promise<unknown> {
    return { revision: this.revision };
  }

  async restore(checkpoint: unknown): Promise<void> {
    this.revision = this.readRevision(checkpoint);
    this.log.restoredCount += 1;
  }

  async rollback(checkpoint: unknown): Promise<void> {
    this.revision = this.readRevision(checkpoint);
    this.log.rollbackCount += 1;
  }

  private readRevision(checkpoint: unknown): number {
    if (
      typeof checkpoint !== 'object' ||
      checkpoint === null ||
      !('revision' in checkpoint) ||
      typeof checkpoint.revision !== 'number'
    ) {
      throw new TypeError('无效 checkpoint');
    }
    return checkpoint.revision;
  }
}

describe('可注入 runtime benchmark harness', () => {
  it('覆盖启动恢复、accepted/rejected、崩溃恢复和重写回滚', async () => {
    const log: MockRuntimeLog = {
      starts: [],
      restoredCount: 0,
      rollbackCount: 0,
    };
    const harness = new StoryRuntimeBenchmarkHarness(() => new MockRuntimeRunner(log));
    const chapters = [
      ...generateSyntheticChapters({ chapterCount: 100, seed: 42 }),
    ].slice(0, 6);

    const report = await harness.run(chapters, {
      crashChapter: 3,
      resumeAfterChapter: 3,
      rewriteChapter: 3,
    });
    const byScenario = new Map<BenchmarkScenario, (typeof report.scenarios)[number]>(
      report.scenarios.map(scenario => [scenario.scenario, scenario])
    );

    expect(byScenario.get('accepted_rejected')).toMatchObject({
      acceptedCount: 5,
      rejectedCount: 1,
    });
    expect(byScenario.get('startup_resume')).toMatchObject({
      acceptedCount: 6,
      recoveryCount: 1,
    });
    expect(byScenario.get('crash_recovery')).toMatchObject({
      acceptedCount: 6,
      crashCount: 1,
      recoveryCount: 1,
    });
    expect(byScenario.get('rewrite_rollback')).toMatchObject({
      acceptedCount: 5,
      rejectedCount: 2,
      rollbackCount: 1,
    });
    expect(log.starts.filter(start => start.mode === 'resume')).toHaveLength(2);
    expect(log.restoredCount).toBe(1);
    expect(log.rollbackCount).toBe(1);
  });
});

/**
 * batchChapterRunner 单测：App 与真实冒烟共用的单章执行器——
 * 字数目标定位、分级重试预算、失败教训种子、伏笔熔断、蓝图再生、停批定局。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChapterWriteOutput } from '../ChapterWritingPipeline';
import type { Project } from '@/types/project';
import { BlueprintRepairLedger } from '@/services/outline/rolling/chapter-blueprint-regenerator';

const regenerateMock = vi.hoisted(() => vi.fn());
vi.mock('@/services/outline/rolling/chapter-blueprint-regenerator', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/services/outline/rolling/chapter-blueprint-regenerator')>();
  return { ...actual, regenerateChapterBlueprint: regenerateMock };
});

import {
  PERSISTENT_MAX_RETRIES,
  TRUNCATED_RETRY_SEED,
  extractForeshadowCitePrefix,
  resolveBatchChapterWordTarget,
  runBatchChapter,
  type BatchChapterAttemptInput,
  type RunBatchChapterOptions,
} from '../batchChapterRunner';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    plotOutline: [],
    chapters: [],
    metadata: { plannedChapterCount: 100 },
    ...overrides,
  } as unknown as Project;
}

function okOutput(): ChapterWriteOutput {
  return {
    success: true,
    prose: '正文'.repeat(100),
    title: '第1章',
    taskBook: null,
    gateResult: null,
    attempts: 1,
    forceAccepted: false,
    supplementRounds: 0,
  } as ChapterWriteOutput;
}

function failOutput(patch: Partial<ChapterWriteOutput>): ChapterWriteOutput {
  return {
    success: false,
    prose: '',
    title: '第1章',
    taskBook: null,
    gateResult: null,
    attempts: 1,
    forceAccepted: false,
    supplementRounds: 0,
    ...patch,
  } as ChapterWriteOutput;
}

function baseOptions(
  runAttempt: RunBatchChapterOptions['runAttempt'],
  patch: Partial<RunBatchChapterOptions> = {}
): RunBatchChapterOptions {
  return {
    chapterId: 'c10',
    chapterNumber: 10,
    baseWordCount: 3000,
    maxRetries: 5,
    ledger: new BlueprintRepairLedger(),
    getProject: () => makeProject(),
    runAttempt,
    ...patch,
  };
}

afterEach(() => {
  vi.useRealTimers();
  regenerateMock.mockReset();
});

describe('resolveBatchChapterWordTarget', () => {
  it('按 orderIndex 定位章节点（plotOutline 混有 act 节点时不错位）', () => {
    const project = makeProject({
      plotOutline: [
        { id: 'act', type: 'act', orderIndex: 0, title: '第一幕' },
        {
          id: 'n9',
          type: 'chapter',
          orderIndex: 9,
          title: '第10章',
          CBN: 'a',
          CPNs: ['b', 'c', 'd'],
          mustCover: ['e', 'f'],
        },
      ] as Project['plotOutline'],
    });
    // 6 个内容节点：3000 + (6-3)*200
    expect(resolveBatchChapterWordTarget(project, 10, 3000)).toBe(3600);
  });

  it('黄金三章固定 2600，不受基准影响', () => {
    expect(resolveBatchChapterWordTarget(makeProject(), 1, 800)).toBe(2600);
  });
});

describe('extractForeshadowCitePrefix', () => {
  it('取判官引伏笔的 hint 前缀，无引用返回 null', () => {
    expect(extractForeshadowCitePrefix('伏笔「玉佩背面刻着的生辰八字」notBeforeChapter=40')).toBe(
      '玉佩背面刻着的生辰八字'
    );
    expect(extractForeshadowCitePrefix('字数不足')).toBeNull();
  });
});

describe('runBatchChapter', () => {
  it('首次成功：返回 success 并带动态字数目标', async () => {
    const runAttempt = vi.fn(async (_input: BatchChapterAttemptInput) => okOutput());
    const outcome = await runBatchChapter(baseOptions(runAttempt));
    expect(outcome.status).toBe('success');
    expect(outcome.attempts).toBe(1);
    expect(runAttempt.mock.calls[0][0]).toMatchObject({ attempt: 1, targetWordCount: 3000 });
  });

  it('持久错误立即重试，达 PERSISTENT_MAX_RETRIES 即耗尽（不吃满 maxRetries）', async () => {
    const runAttempt = vi.fn(async () =>
      failOutput({ error: '角色名冲突', errorKind: 'review', retryable: false })
    );
    const outcome = await runBatchChapter(baseOptions(runAttempt));
    expect(outcome.status).toBe('exhausted');
    expect(runAttempt).toHaveBeenCalledTimes(PERSISTENT_MAX_RETRIES);
    if (outcome.status === 'exhausted') {
      expect(outcome.lastErrorKind).toBe('review');
      expect(outcome.lastError).toBe('角色名冲突');
    }
  });

  it('门禁 critical 问题作为下一轮种子；截断失败注入固定种子', async () => {
    const outputs = [
      failOutput({
        error: '门禁未通过',
        errorKind: 'review',
        retryable: false,
        gateResult: {
          passed: false,
          allIssues: [
            { severity: 'critical', description: '主角提前知道密信内容' },
            { severity: 'high', description: '节奏偏慢' },
          ],
        } as unknown as ChapterWriteOutput['gateResult'],
      }),
      failOutput({ error: 'JSON 被截断', errorKind: 'truncated', retryable: true }),
      okOutput(),
    ];
    vi.useFakeTimers();
    const runAttempt = vi.fn(async (_input: BatchChapterAttemptInput) => outputs.shift()!);
    const pending = runBatchChapter(baseOptions(runAttempt));
    await vi.runAllTimersAsync();
    const outcome = await pending;
    expect(outcome.status).toBe('success');
    expect(runAttempt.mock.calls[1][0].seedRevisionHints).toEqual(['主角提前知道密信内容']);
    expect(runAttempt.mock.calls[2][0].seedRevisionHints).toEqual([TRUNCATED_RETRY_SEED]);
  });

  it('瞬态错误退避重试，耗尽 maxRetries 后返回 exhausted', async () => {
    vi.useFakeTimers();
    const runAttempt = vi.fn(async () => {
      throw new Error('socket hang up');
    });
    const pending = runBatchChapter(baseOptions(runAttempt, { maxRetries: 2 }));
    await vi.runAllTimersAsync();
    const outcome = await pending;
    expect(outcome.status).toBe('exhausted');
    expect(runAttempt).toHaveBeenCalledTimes(2);
    if (outcome.status === 'exhausted') expect(outcome.lastErrorKind).toBe('network');
  });

  it('同一伏笔连续 2 次提前揭示拒稿 → 第 3 次尝试带豁免', async () => {
    const reject = (): ChapterWriteOutput =>
      failOutput({
        error: '伏笔「玉佩背面刻着的生辰八字」notBeforeChapter=40，本章提前揭示',
        errorKind: 'review',
        retryable: false,
      });
    const outputs = [reject(), reject(), okOutput()];
    const runAttempt = vi.fn(async (_input: BatchChapterAttemptInput) => outputs.shift()!);
    const outcome = await runBatchChapter(baseOptions(runAttempt));
    expect(outcome.status).toBe('success');
    expect(runAttempt.mock.calls[1][0].foreshadowExemptions).toBeUndefined();
    expect(runAttempt.mock.calls[2][0].foreshadowExemptions).toEqual(['玉佩背面刻着的生辰八字']);
  });

  it('履约域连续失败 2 次 → 再生蓝图并落库，旧种子作废', async () => {
    regenerateMock.mockResolvedValue({ blueprint: { title: '新蓝图' }, defects: [] });
    const fulfillFail = (): ChapterWriteOutput =>
      failOutput({
        error: 'mustCover 未履约：主角当众揭穿账册',
        errorKind: 'review',
        retryable: false,
        gateResult: {
          passed: false,
          allIssues: [{ severity: 'critical', description: '未写当众揭穿' }],
        } as unknown as ChapterWriteOutput['gateResult'],
      });
    const outputs = [fulfillFail(), fulfillFail(), okOutput()];
    const runAttempt = vi.fn(async (_input: BatchChapterAttemptInput) => outputs.shift()!);
    const applyRegeneratedBlueprint = vi.fn(async () => undefined);
    const latestProject = makeProject({ id: 'latest' });
    const outcome = await runBatchChapter(
      baseOptions(runAttempt, {
        repairBlueprint: async () => '{}',
        applyRegeneratedBlueprint,
        getProject: () => latestProject,
      })
    );
    expect(outcome.status).toBe('success');
    expect(regenerateMock).toHaveBeenCalledTimes(1);
    expect(regenerateMock.mock.calls[0][0]).toMatchObject({ project: latestProject, chapterNumber: 10 });
    expect(applyRegeneratedBlueprint).toHaveBeenCalledWith({ title: '新蓝图' });
    expect(runAttempt.mock.calls[2][0].seedRevisionHints).toBeUndefined();
  });

  it('审查服务不可用：不整章重跑，直接定局 review_unavailable', async () => {
    const runAttempt = vi.fn(async () =>
      failOutput({ error: '语义审查服务不可用', errorKind: 'review_unavailable', retryable: false })
    );
    const outcome = await runBatchChapter(baseOptions(runAttempt));
    expect(outcome.status).toBe('review_unavailable');
    expect(runAttempt).toHaveBeenCalledTimes(1);
  });

  it('用户停止：开写前 shouldStop 即返回 stopped，不调用单章执行', async () => {
    const runAttempt = vi.fn(async () => okOutput());
    const outcome = await runBatchChapter(baseOptions(runAttempt, { shouldStop: () => true }));
    expect(outcome.status).toBe('stopped');
    expect(runAttempt).not.toHaveBeenCalled();
  });

  it('forceAccepted / 门禁未过的「成功」输出不算提交', async () => {
    const runAttempt = vi.fn(async () => ({ ...okOutput(), forceAccepted: true }));
    const outcome = await runBatchChapter(baseOptions(runAttempt, { maxRetries: 1 }));
    expect(outcome.status).toBe('exhausted');
    if (outcome.status === 'exhausted') expect(outcome.lastError).toBe('严格门禁未通过，章节未提交');
  });
});

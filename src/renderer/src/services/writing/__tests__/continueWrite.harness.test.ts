import { describe, expect, it } from 'vitest';

import {
  assertHarnessInvariants,
  classifyChapterRunFailure,
  makeMalformedChapter1Contracts,
  makeSyntheticHarnessProject,
  runContinueWriteChapters,
  runContinueWriteHarness,
} from './continueWriteHarness';

describe('continueWrite harness', () => {
  it('规范化畸形蓝图：CEN 不再塌成推进至：=CPN，goal 不再是第1章', () => {
    const contracts = makeMalformedChapter1Contracts();
    expect(contracts.chapter.CEN).not.toMatch(/^推进至[：:]/u);
    expect(contracts.chapter.CEN).not.toBe('穿越醒来正在验尸');
    expect(contracts.chapter.goal).not.toBe('第1章');
    expect(contracts.chapter.mustCover.length).toBeGreaterThanOrEqual(1);
  });

  it('走 executeSmartContinue 正式路径：录制 AI 并满足卫生断言', async () => {
    const { recording, output, appliedOnce } = await runContinueWriteHarness({
      runId: 'continue-write-harness',
      // 单元测试只断言内存轨迹，避免 temp/ai-traces 无限堆积
      persistTrace: false,
    });

    expect(output.success).toBe(true);
    expect(output.longFormResult?.drafts.length).toBeGreaterThan(0);
    expect(output.longFormResult?.commit.status).toBe('accepted');
    expect(output.prose.trim().length).toBeGreaterThan(50);
    expect(appliedOnce).toBe(true);
    expect(output.taskBook).not.toBeNull();
    expect(output.taskBook?.CEN).not.toMatch(/^推进至[：:]/u);

    assertHarnessInvariants(recording);

    const purposes = recording.getRecords().map(item => item.purpose);
    expect(purposes).toContain('scene-draft');
    expect(purposes).toContain('chapter-judge');

    const draft = recording.getRecords().find(item => item.purpose === 'scene-draft')!;
    const payload = JSON.parse(draft.prompt) as {
      beat?: unknown;
      allowedCandidateEvents?: unknown;
      primaryBeatId: string;
    };
    expect(payload.beat).toBeUndefined();
    expect(payload.allowedCandidateEvents).toBeUndefined();
    expect(payload.primaryBeatId).toBeTruthy();
  }, 20_000);

  it('多章复用 session：正式批量路径 BATCH_CONTINUE（连续 2 章 accepted）', async () => {
    const { project } = makeSyntheticHarnessProject({ chapterCount: 2 });
    const checkpoints: Array<{ completed: number; requested: number; chapter: number }> = [];
    const result = await runContinueWriteChapters({
      project,
      fromChapter: 1,
      chapterCount: 2,
      targetWordCount: 800,
      runIdPrefix: 'continue-write-multi-harness',
      persistTrace: false,
      mode: 'batch',
      onChapterSettled: ({ result: chapter, completedChapters, requestedChapters }) => {
        checkpoints.push({
          completed: completedChapters,
          requested: requestedChapters,
          chapter: chapter.chapterNumber,
        });
      },
    });

    expect(result.mode).toBe('batch');
    if (process.versions.electron) {
      expect(result.runtimeBackend).toBe('sqlite');
    }
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters.every(item => item.mode === 'batch')).toBe(true);
    expect(result.chapters.every(item => item.output.success)).toBe(true);
    expect(result.chapters.every(item => item.output.longFormResult?.commit.status === 'accepted')).toBe(
      true
    );
    expect(checkpoints).toEqual([
      { completed: 1, requested: 2, chapter: 1 },
      { completed: 2, requested: 2, chapter: 2 },
    ]);

    const written = result.project.chapters
      .filter(item => item.orderIndex < 2)
      .map(item => (item.content || '').trim());
    expect(written[0]?.length).toBeGreaterThan(50);
    expect(written[1]?.length).toBeGreaterThan(50);

    assertHarnessInvariants(result.chapters[0].recording);
    assertHarnessInvariants(result.chapters[1].recording);
  }, 40_000);
});

describe('classifyChapterRunFailure（与 useBatchWriter 分类优先级对齐）', () => {
  it('结构化 errorKind/retryable 优先于 message 文本分类', () => {
    // message 文本会判成 schema（不可重试），但管道结构化字段判定为 server 瞬态——必须采信结构化，
    // 否则冒烟与真实环境在特殊错误文案下的重试预算分叉
    const classified = classifyChapterRunFailure(
      { errorKind: 'server', retryable: true },
      '结构校验失败: unexpected token',
    );
    expect(classified.kind).toBe('server');
    expect(classified.retryable).toBe(true);
  });

  it('结构化字段缺失时回退 message 文本分类', () => {
    const classified = classifyChapterRunFailure(
      { errorKind: undefined, retryable: undefined },
      '请求失败: 429 too many requests',
    );
    expect(classified.kind).toBe('rate_limit');
    expect(classified.retryable).toBe(true);
  });

  it('output 为 null（runChapter 抛异常路径）同样走文本分类', () => {
    const classified = classifyChapterRunFailure(null, 'socket hang up');
    expect(classified.kind).toBe('network');
    expect(classified.retryable).toBe(true);
  });

  it('retryable 缺失时沿用 message 分类的 retryable（生产 details 合成口径）', () => {
    const classified = classifyChapterRunFailure(
      { errorKind: 'server', retryable: undefined },
      'ETIMEDOUT',
    );
    expect(classified.kind).toBe('server');
    expect(classified.retryable).toBe(true);
  });

  it('用户中止（signal 已 abort）优先归为 aborted', () => {
    const controller = new AbortController();
    controller.abort();
    const classified = classifyChapterRunFailure(
      null,
      'The operation was aborted',
      controller.signal,
    );
    expect(classified.kind).toBe('aborted');
    expect(classified.retryable).toBe(false);
  });

  it('未被正则覆盖的空 message 落 unknown 兜底（不可重试，与生产一致）', () => {
    const classified = classifyChapterRunFailure(null, '写作失败');
    expect(classified.kind).toBe('unknown');
    expect(classified.retryable).toBe(false);
  });

  it('管线级故障熔断：连续 3 章以相同错误耗尽即中止整批（2026-10-01 r17 实证）', async () => {
    // r17 实证：salvage 接线 ReferenceError 让 102/200 章每章 3 连拒后「跳过继续」，
    // 无声成洞跑了 10 小时才被发现。熔断把损失锁死在 3 章内；错误互不相同的
    // 常规内容失败（每章 lastError 不同）不受影响。
    const { project } = makeSyntheticHarnessProject({ chapterCount: 5 });
    const boom = {
      async generate() {
        throw new Error('salvage stub: dependencies is not defined');
      },
    } as never;
    await expect(
      runContinueWriteChapters({
        project,
        fromChapter: 1,
        chapterCount: 5,
        targetWordCount: 800,
        runIdPrefix: 'continue-write-streak-breaker',
        persistTrace: false,
        mode: 'batch',
        ai: boom,
      }),
    ).rejects.toThrow('疑似管线级故障');
  }, 30_000);
});

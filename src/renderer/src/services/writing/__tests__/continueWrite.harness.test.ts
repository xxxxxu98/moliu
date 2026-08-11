import { describe, expect, it } from 'vitest';

import {
  assertHarnessInvariants,
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
    const result = await runContinueWriteChapters({
      project,
      fromChapter: 1,
      chapterCount: 2,
      targetWordCount: 800,
      runIdPrefix: 'continue-write-multi-harness',
      persistTrace: false,
      mode: 'batch',
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

    const written = result.project.chapters
      .filter(item => item.orderIndex < 2)
      .map(item => (item.content || '').trim());
    expect(written[0]?.length).toBeGreaterThan(50);
    expect(written[1]?.length).toBeGreaterThan(50);

    assertHarnessInvariants(result.chapters[0].recording);
    assertHarnessInvariants(result.chapters[1].recording);
  }, 40_000);
});

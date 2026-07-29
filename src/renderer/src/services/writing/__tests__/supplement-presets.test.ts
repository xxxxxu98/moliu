/**
 * supplement / chapterWritePresets 单元测试
 */

import { describe, it, expect, vi } from 'vitest';
import {
  checkWordCount,
  buildSupplementPrompt,
  runSupplementRounds,
  MIN_WORD_THRESHOLD,
  MAX_SUPPLEMENT_ROUNDS,
} from '../supplement';
import {
  SMART_CONTINUE_PRESET,
  BATCH_CONTINUE_PRESET,
  resolveChapterWriteOptions,
} from '../chapterWritePresets';

describe('checkWordCount', () => {
  it('字数不足时 needsSupplement=true', () => {
    const result = checkWordCount('短', 1000);
    expect(result.needsSupplement).toBe(true);
    expect(result.shortfall).toBeGreaterThan(0);
    expect(result.targetWords).toBe(1000);
  });

  it('达到 85% 阈值时不需要补写', () => {
    const target = 100;
    const minRequired = Math.floor(target * MIN_WORD_THRESHOLD);
    const content = '字'.repeat(minRequired);
    const result = checkWordCount(content, target);
    expect(result.needsSupplement).toBe(false);
    expect(result.shortfall).toBe(0);
  });
});

describe('buildSupplementPrompt', () => {
  it('包含轮次与结尾片段', () => {
    const prompt = buildSupplementPrompt({
      existingContent: '前文内容'.repeat(20) + '结尾锚点ABC',
      targetWordCount: 3000,
      additionalWords: 500,
      round: 2,
      maxRounds: 3,
      chapterTitle: '第1章',
      chapterOutline: '大纲',
    });

    expect(prompt).toContain('第 2/3 轮');
    expect(prompt).toContain('结尾锚点ABC');
    expect(prompt).toContain('第1章');
    expect(prompt).toContain('大纲');
  });
});

describe('runSupplementRounds', () => {
  it('已达标时不调用 drafter', async () => {
    const drafter = { draft: vi.fn() };
    const prose = '字'.repeat(900);
    const result = await runSupplementRounds({
      prose,
      targetWordCount: 1000,
      drafter,
      chapterTitle: '第1章',
    });

    expect(drafter.draft).not.toHaveBeenCalled();
    expect(result.rounds).toBe(0);
    expect(result.prose).toBe(prose);
  });

  it('不足时补写并追加', async () => {
    const drafter = {
      draft: vi.fn().mockResolvedValue('新增段落'),
    };
    const onRound = vi.fn();
    const result = await runSupplementRounds({
      prose: '短',
      targetWordCount: 100,
      drafter,
      chapterTitle: '第1章',
      maxRounds: 1,
      onRound,
    });

    expect(drafter.draft).toHaveBeenCalledTimes(1);
    expect(result.rounds).toBe(1);
    expect(result.prose).toContain('新增段落');
    expect(onRound).toHaveBeenCalledWith(1, '新增段落', expect.stringContaining('新增段落'));
  });

  it('不超过最大轮次', async () => {
    const drafter = {
      draft: vi.fn().mockResolvedValue('x'),
    };
    const result = await runSupplementRounds({
      prose: '短',
      targetWordCount: 10000,
      drafter,
      chapterTitle: '第1章',
    });

    expect(result.rounds).toBeLessThanOrEqual(MAX_SUPPLEMENT_ROUNDS);
    expect(drafter.draft.mock.calls.length).toBeLessThanOrEqual(MAX_SUPPLEMENT_ROUNDS);
  });
});

describe('chapterWritePresets', () => {
  it('智能续写开启预检与补字', () => {
    expect(SMART_CONTINUE_PRESET.enablePreflight).toBe(true);
    expect(SMART_CONTINUE_PRESET.enableSupplement).toBe(true);
    expect(SMART_CONTINUE_PRESET.useTaskBook).toBe(true);
  });

  it('批量续写关闭预检、开启补字', () => {
    expect(BATCH_CONTINUE_PRESET.enablePreflight).toBe(false);
    expect(BATCH_CONTINUE_PRESET.enableSupplement).toBe(true);
    expect(BATCH_CONTINUE_PRESET.useTaskBook).toBe(true);
  });

  it('resolveChapterWriteOptions 允许覆盖', () => {
    const resolved = resolveChapterWriteOptions(BATCH_CONTINUE_PRESET, {
      useTaskBook: false,
    });
    expect(resolved.useTaskBook).toBe(false);
    expect(resolved.enablePreflight).toBe(false);
    expect(resolved.enableSupplement).toBe(true);
  });
});

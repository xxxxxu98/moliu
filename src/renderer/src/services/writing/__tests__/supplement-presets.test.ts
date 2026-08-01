/**
 * supplement / chapterWritePresets 单元测试
 */

import { describe, it, expect, vi } from 'vitest';
import {
  checkWordCount,
  checkWordCountBounds,
  clampProseToMaxWords,
  chooseProseAfterCondense,
  buildSupplementPrompt,
  buildCondensePrompt,
  buildWordCountShortfallIssue,
  runSupplementRounds,
  sliceEndingSnippet,
  MIN_WORD_THRESHOLD,
  MAX_WORD_THRESHOLD,
  MAX_SUPPLEMENT_ROUNDS,
} from '../supplement';
import {
  SMART_CONTINUE_PRESET,
  BATCH_CONTINUE_PRESET,
  resolveChapterWriteOptions,
} from '../chapterWritePresets';
import { countWords } from '../utils';

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

describe('checkWordCountBounds', () => {
  it('落在 85%–115% 为 ok', () => {
    const target = 1000;
    const content = '字'.repeat(Math.floor(target * 0.95));
    expect(checkWordCountBounds(content, target).status).toBe('ok');
  });

  it('低于 85% 为 short，高于 115% 为 over', () => {
    const target = 1000;
    expect(checkWordCountBounds('字'.repeat(500), target).status).toBe('short');
    expect(
      checkWordCountBounds('字'.repeat(Math.ceil(target * MAX_WORD_THRESHOLD) + 1), target).status
    ).toBe('over');
  });
});

describe('clampProseToMaxWords', () => {
  it('超长时按句保留开头与结尾', () => {
    const head = '开场一句。冲突二句。推进三句。';
    const middle = '注水描写。'.repeat(40);
    const tail = '章末钩子出现。悬念落下。';
    const prose = `${head}${middle}${tail}`;
    const clamped = clampProseToMaxWords(prose, 40);
    expect(countWords(clamped)).toBeLessThanOrEqual(40);
    expect(clamped).toContain('开场一句');
    expect(clamped).toContain('悬念落下');
  });
});

describe('chooseProseAfterCondense', () => {
  it('压缩落在区间时采用压缩稿', () => {
    const target = 100;
    const original = '原。'.repeat(80);
    const condensed = '压。'.repeat(95);
    const result = chooseProseAfterCondense({
      originalProse: original,
      condensedProse: condensed,
      target,
    });
    expect(result.strategy).toBe('condensed');
    expect(result.prose).toBe(condensed);
  });

  it('压缩过短时回退原文硬裁（复现 ch3：5000→800）', () => {
    const target = 3000;
    // 构造明确超上限的原文（>3450）与过短压缩稿（<<2550）
    const original = `${'开场冲突推进细节描写一句。'.repeat(400)}${'章末钩子落下悬念。'.repeat(40)}`;
    const condensed = '梗概一句。'.repeat(40);
    expect(checkWordCountBounds(original, target).status).toBe('over');
    expect(checkWordCountBounds(condensed, target).status).toBe('short');

    const result = chooseProseAfterCondense({
      originalProse: original,
      condensedProse: condensed,
      target,
    });
    expect(result.strategy).toBe('original-clamp');
    expect(result.bounds.status).not.toBe('short');
    expect(result.bounds.currentWords).toBeLessThanOrEqual(result.bounds.maxWords);
    expect(result.prose).toContain('开场冲突推进');
    expect(result.prose).toContain('章末钩子落下');
  });
});

describe('buildWordCountShortfallIssue', () => {
  it('字数不足时返回 blocking issue', () => {
    const issue = buildWordCountShortfallIssue('太短了', 3000);
    expect(issue).not.toBeNull();
    expect(issue?.severity).toBe('blocking');
    expect(issue?.domain).toBe('fulfillment');
    expect(issue?.message).toContain('字数严重不足');
  });

  it('字数达标时返回 null', () => {
    const content = '字'.repeat(2600);
    expect(buildWordCountShortfallIssue(content, 3000)).toBeNull();
  });
});

describe('buildCondensePrompt', () => {
  it('包含硬性区间与原文', () => {
    const prompt = buildCondensePrompt({
      existingContent: '原文很长'.repeat(10),
      targetWordCount: 3000,
      minWords: 2550,
      maxWords: 3450,
      chapterTitle: '第1章',
      chapterOutline: '大纲',
    });
    expect(prompt).toContain('2550–3450');
    expect(prompt).toContain('严禁压到低于 2550');
    expect(prompt).toContain('第1章');
    expect(prompt).toContain('原文很长');
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
      pendingBeats: ['当众指凶', '章末落入三日处斩倒计时'],
    });

    expect(prompt).toContain('第 2/3 轮');
    expect(prompt).toContain('结尾锚点ABC');
    expect(prompt).toContain('第1章');
    expect(prompt).toContain('大纲');
    expect(prompt).toContain('必须推进的未完成节点');
    expect(prompt).toContain('当众指凶');
    expect(prompt).toContain('禁止纯夜色');
  });

  it('原文结尾按句边界截取，不从半句起', () => {
    const prefix = `${'前文一句。'.repeat(30)}完整停顿。`;
    const ending = '主角端起碗喝了一口，水很凉，但让他清醒了很多。他必须活下去。';
    const content = prefix + ending;
    const snippet = sliceEndingSnippet(content, 80);
    expect(snippet.startsWith('，')).toBe(false);
    expect(snippet.startsWith('水很凉')).toBe(false);
    expect(snippet.includes('他必须活下去')).toBe(true);

    const prompt = buildSupplementPrompt({
      existingContent: `${'前段完整句。'.repeat(40)}下一拍从半截开始会坏。最终落到完整句。续写从这里开始。`,
      targetWordCount: 3000,
      additionalWords: 200,
      round: 1,
      chapterTitle: '第1章',
    });
    const endingBlock =
      prompt.split('## 原文结尾（请从这里继续）\n')[1]?.split('\n\n## 章节上下文')[0] ?? '';
    expect(endingBlock.startsWith('下，')).toBe(false);
    expect(endingBlock.includes('续写从这里开始')).toBe(true);
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

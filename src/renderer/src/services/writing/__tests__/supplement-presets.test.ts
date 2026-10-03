/**
 * supplement / chapterWritePresets 单元测试
 */

import { describe, it, expect, vi } from 'vitest';
import {
  checkWordCount,
  checkWordCountBounds,
  chooseProseAfterCondense,
  buildSupplementPrompt,
  buildCondensePrompt,
  buildWordCountShortfallIssue,
  buildWordCountBoundsIssue,
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

describe('checkWordCount', () => {
  it('字数不足时 needsSupplement=true', () => {
    const result = checkWordCount('短', 1000);
    expect(result.needsSupplement).toBe(true);
    expect(result.shortfall).toBeGreaterThan(0);
    expect(result.targetWords).toBe(1000);
  });

  it('达到阈值时不需要补写', () => {
    const target = 100;
    const minRequired = Math.floor(target * MIN_WORD_THRESHOLD);
    const content = '字'.repeat(minRequired);
    const result = checkWordCount(content, target);
    expect(result.needsSupplement).toBe(false);
    expect(result.shortfall).toBe(0);
  });
});

describe('checkWordCountBounds', () => {
  it('落在 [MIN_WORD_THRESHOLD, MAX_WORD_THRESHOLD] 区间为 ok', () => {
    const target = 1000;
    const content = '字'.repeat(Math.floor(target * 0.95));
    expect(checkWordCountBounds(content, target).status).toBe('ok');
  });

  it('低于阈值为 short，高于 118% 为 over', () => {
    const target = 1000;
    expect(checkWordCountBounds('字'.repeat(500), target).status).toBe('short');
    expect(
      checkWordCountBounds('字'.repeat(Math.ceil(target * MAX_WORD_THRESHOLD) + 1), target).status
    ).toBe('over');
  });

  // 回归：MIN_WORD_THRESHOLD=0.80 时，~81% 的正文（实测 ch1 1628/2000=81.4% 场景）
  // 应判 ok 而非 short——此前 0.85 会把这类擦边章判 blocking 拒收，浪费整章重试预算。
  it('MIN_WORD_THRESHOLD=0.80：~81% 正文判 ok（回归 ch1 1628/2000 场景）', () => {
    expect(MIN_WORD_THRESHOLD).toBe(0.8);
    const target = 2000;
    // 1628 字 = 81.4%，应落在 [80%, 118%] 区间
    expect(checkWordCountBounds('字'.repeat(1628), target).status).toBe('ok');
    // 79% 仍应判 short（阈值没放得太松）
    expect(checkWordCountBounds('字'.repeat(1580), target).status).toBe('short');
  });
});

describe('chooseProseAfterCondense', () => {
  it('压缩落在区间时采用压缩稿', () => {
    const target = 100;
    // 口径为全文 length：原文超上限，压缩稿落在 80%–118%
    const original = '原。'.repeat(80); // 160
    const condensed = '压。'.repeat(50); // 100
    const result = chooseProseAfterCondense({
      originalProse: original,
      condensedProse: condensed,
      target,
    });
    expect(result.strategy).toBe('condensed');
    expect(result.prose).toBe(condensed);
  });

  it('压缩过短时回退原文不再硬裁（复现 ch3：5000→800，保留完整原文）', () => {
    const target = 3000;
    // 构造明确超上限的原文（>3540）与过短压缩稿（<<2400）
    const original = `${'开场冲突推进细节描写一句。'.repeat(400)}${'章末钩子落下悬念。'.repeat(40)}`;
    const condensed = '梗概一句。'.repeat(40);
    expect(checkWordCountBounds(original, target).status).toBe('over');
    expect(checkWordCountBounds(condensed, target).status).toBe('short');

    const result = chooseProseAfterCondense({
      originalProse: original,
      condensedProse: condensed,
      target,
    });
    // 回退原文、不再硬裁：strategy 标记为 original-kept，prose 即原文（完整保留，未掐断）
    expect(result.strategy).toBe('original-kept');
    expect(result.prose).toBe(original);
    // 原文未被裁，仍超上限（宁可偏长也不破坏文气）
    expect(result.bounds.status).toBe('over');
    expect(result.prose).toContain('开场冲突推进');
    expect(result.prose).toContain('章末钩子落下');
  });

  it('压缩完仍超上限时采用压缩稿不再硬裁', () => {
    const target = 3000;
    // 原文远超上限，压缩稿有所收敛但仍越界（>3540）
    const original = `${'开场冲突推进细节描写一句。'.repeat(600)}${'章末钩子落下悬念。'.repeat(40)}`;
    const condensed = `${'压缩后仍偏长细节描写一句。'.repeat(300)}章末钩子落下。`;
    expect(checkWordCountBounds(original, target).status).toBe('over');
    expect(checkWordCountBounds(condensed, target).status).toBe('over');

    const result = chooseProseAfterCondense({
      originalProse: original,
      condensedProse: condensed,
      target,
    });
    // 用压缩稿、不再硬裁：strategy 标记为 condensed-kept，prose 即压缩稿（完整保留，未掐断）
    expect(result.strategy).toBe('condensed-kept');
    expect(result.prose).toBe(condensed);
    expect(result.bounds.status).toBe('over');
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

describe('buildWordCountBoundsIssue', () => {
  it('超出上限时返回 blocking，区间内返回 null', () => {
    const target = 3000;
    const issue = buildWordCountBoundsIssue('字'.repeat(5000), target);

    expect(issue?.severity).toBe('blocking');
    expect(issue?.id).toMatch(/^word-count-over:/);
    expect(buildWordCountBoundsIssue('字'.repeat(3000), target)).toBeNull();
  });

  it('擦边超写（超限 ≤1.5% 上限）降为 warning 不拒收——2026-10-01 p1reg20 ch10 实证', () => {
    // ch10 实测形态：3549/3540（超 9 字，0.25%）曾 blocking 五连拒成洞
    const target = 3000; // 上限 = ceil(3000*1.18) = 3540；宽限带 = floor(3540*0.015) = 53 字
    const edgeIssue = buildWordCountBoundsIssue('字'.repeat(3549), target);
    expect(edgeIssue?.severity).toBe('warning');
    expect(edgeIssue?.id).toMatch(/^word-count-over-edge:/);
    expect(edgeIssue?.message).toContain('宽限带');

    // 宽限带边界内（超 53 字）仍 warning
    expect(buildWordCountBoundsIssue('字'.repeat(3593), target)?.severity).toBe('warning');
    // 超出宽限带（超 54 字）回到 blocking——真正失控超写必须拦
    expect(buildWordCountBoundsIssue('字'.repeat(3594), target)?.severity).toBe('blocking');
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

    // 超长正文（>6000 字）退回结尾片段锚定
    const prompt = buildSupplementPrompt({
      existingContent: `${'前段完整句。'.repeat(1200)}下一拍从半截开始会坏。最终落到完整句。续写从这里开始。`,
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

  it('单章体量正文整章塞进上下文，而不是只给结尾片段', () => {
    // 回归：只给 500 字结尾时，补字看不到本章前半程已确立的事实，
    // 实测补出「某人三年前死在漕运船上」与前文「去年冬天就死了」冲突，整章重写。
    const openingFact = '顾庸说，写这行批注的人去年冬天就死了。';
    const prompt = buildSupplementPrompt({
      existingContent: `${openingFact}\n\n${'中段推进。'.repeat(200)}\n\n结尾锚点在这里。`,
      targetWordCount: 3000,
      additionalWords: 600,
      round: 1,
      chapterTitle: '第5章',
      outputFormat: 'json',
    });

    expect(prompt).toContain('本章已写正文');
    expect(prompt).toContain(openingFact);
    expect(prompt).toContain('结尾锚点在这里');
    expect(prompt).toContain('事实一致');
  });

  it('带上出场名单与禁区（与起草同一套硬约束）', () => {
    const prompt = buildSupplementPrompt({
      existingContent: '正文内容。'.repeat(20),
      targetWordCount: 3000,
      additionalWords: 600,
      round: 1,
      chapterTitle: '第5章',
      allowedAppearanceNames: ['赵文远', '顾庸'],
      forbiddenZones: ['不让姜闻道登场'],
      outputFormat: 'json',
    });

    expect(prompt).toContain('出场名单');
    expect(prompt).toContain('赵文远、顾庸');
    expect(prompt).toContain('不让姜闻道登场');
  });

  it('outputFormat=json 时输出 JSON 数组指令（LongFormWritingEngine 偏短补字路径依赖）', () => {
    // 回归：LongFormWritingEngine.padDraftsIfUnderTarget 用 outputFormat:'json' 调用本函数，
    // 依赖 prompt 末尾包含「只输出一个 JSON 对象：{"paragraphs":[...]}」指令，
    // 与 system 的 JSON 要求一致，避免模型输出纯散文导致解析失败。
    const prompt = buildSupplementPrompt({
      existingContent: '前文内容'.repeat(20) + '结尾锚点',
      targetWordCount: 3000,
      additionalWords: 800,
      round: 1,
      maxRounds: 2,
      chapterTitle: '第2章 连夜查账',
      outputFormat: 'json',
    });
    expect(prompt).toContain('{"paragraphs"');
    expect(prompt).toContain('只输出一个 JSON 对象');
    expect(prompt).not.toContain('请直接输出补充内容正文');
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

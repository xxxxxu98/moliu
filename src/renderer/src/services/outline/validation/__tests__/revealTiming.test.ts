import { describe, expect, it } from 'vitest';

import {
  describeRevealTimingViolation,
  findRevealTimingViolations,
  parseRevealNotBeforeChapter,
} from '../revealTiming';

describe('parseRevealNotBeforeChapter', () => {
  it('「第N章」解析（与写作侧同口径）', () => {
    expect(parseRevealNotBeforeChapter('第35章')).toBe(35);
    expect(parseRevealNotBeforeChapter('第 12 章')).toBe(12);
    expect(parseRevealNotBeforeChapter('前期逐步揭示')).toBeNull();
    expect(parseRevealNotBeforeChapter(undefined)).toBeNull();
    expect(parseRevealNotBeforeChapter('第0章')).toBeNull();
  });
});

describe('findRevealTimingViolations 登场锁大纲期校验', () => {
  const characters = [
    { name: '赵元慎', role: 'support', revealTiming: '第35章' },
    { name: '裴准', role: 'protagonist', revealTiming: '第50章' },
    { name: '崔士元', role: 'antagonist', revealTiming: '开篇即登场' },
  ];

  it('锁定期之前的蓝图点名锁角色 → 命中（r15fix-reg20 ch18 形态）', () => {
    const violations = findRevealTimingViolations(
      [
        {
          orderIndex: 18,
          title: '第18章 御前召对',
          CBN: '老皇帝在乾清宫翻阅账册。',
          CPNs: ['赵元慎训诫裴准'],
          mustCover: ['赵元慎听取仓场大火实情'],
        },
      ],
      characters,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      chapterNumber: 18,
      characterName: '赵元慎',
      notBeforeChapter: 35,
    });
  });

  it('到点/过点出场不命中；仅出现在 CEN 也算点名', () => {
    expect(
      findRevealTimingViolations(
        [
          { orderIndex: 35, mustCover: ['赵元慎首次召对'] },
          { orderIndex: 40, CEN: '赵元慎的目光落在了账册上。' },
        ],
        characters,
      ),
    ).toHaveLength(0);
    expect(
      findRevealTimingViolations(
        [{ orderIndex: 20, CEN: '赵元慎的目光落在了账册上。' }],
        characters,
      ),
    ).toHaveLength(1);
  });

  it('主角豁免：主角锁属设定自相矛盾，蓝图扫描不判（交大纲审查）', () => {
    expect(
      findRevealTimingViolations(
        [{ orderIndex: 1, mustCover: ['裴准当堂对质'] }],
        characters,
      ),
    ).toHaveLength(0);
  });

  it('无锁角色不命中；多字段任一命中即报', () => {
    expect(
      findRevealTimingViolations(
        [{ orderIndex: 3, mustCover: ['崔士元亮出焦黑残账'] }],
        characters,
      ),
    ).toHaveLength(0);
    const hits = findRevealTimingViolations(
      [
        { orderIndex: 10, summary: '赵元慎在幕后注视着这一切。' },
        { orderIndex: 11, title: '第11章 赵元慎的暗手' },
      ],
      characters,
    );
    expect(hits).toHaveLength(2);
  });

  it('描述文案可直接进修复轮问题清单', () => {
    const text = describeRevealTimingViolation({
      chapterNumber: 18,
      characterName: '赵元慎',
      notBeforeChapter: 35,
      revealTiming: '第35章',
    });
    expect(text).toContain('第18章');
    expect(text).toContain('赵元慎');
    expect(text).toContain('禁登场');
  });
});

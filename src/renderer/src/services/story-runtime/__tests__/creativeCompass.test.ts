import { describe, expect, it } from 'vitest';

import {
  extractSceneBeatsFromOutline,
  findRequiredBeatForbiddenClash,
  renderCreativeCompass,
  renderSceneBeatLines,
} from '../creativeCompass';

describe('renderCreativeCompass', () => {
  it('四项都空时不注入', () => {
    expect(renderCreativeCompass({})).toBe('');
  });

  it('用已有卖点和卷目标拼一页', () => {
    const text = renderCreativeCompass({
      volumeObjective: '把假身份维持到第一次公开行动',
      emotionPrimary: '压迫',
      sellingPoints: [{ name: '自己查自己', description: '猎人与猎物是同一人' }],
      openingAnchor: '刀已经抵上，还没刺下去',
    });
    expect(text).toContain('【创作罗盘】');
    expect(text).toContain('阶段目标：把假身份维持到第一次公开行动；压迫');
    expect(text).toContain('必须保留：自己查自己：猎人与猎物是同一人');
    expect(text).toContain('开篇锚点：刀已经抵上，还没刺下去');
  });
});

describe('章内节拍', () => {
  it('空节拍不注入', () => {
    expect(renderSceneBeatLines([])).toEqual([]);
    expect(renderSceneBeatLines(undefined)).toEqual([]);
  });

  it('从大纲结构化块抽出节拍', () => {
    const beats = extractSceneBeatsFromOutline(`章纲\n\n--- 结构化节点 ---\n【CBN】刀抵在喉上\n【节拍】\n1. 刀还抵着，人没死\n2. 他认出这张脸\n【CEN】门外传来第二个人的脚步`);
    expect(beats).toEqual(['刀还抵着，人没死', '他认出这张脸']);
  });

  it('禁区与节拍逐字包含时退回蓝图', () => {
    expect(
      findRequiredBeatForbiddenClash(
        ['止血钳悬停在假项圈上方'],
        ['不得止血钳悬停在假项圈上方'],
      ),
    ).toContain('先改蓝图');
    expect(
      findRequiredBeatForbiddenClash(
        ['止血钳悬停在假项圈上方'],
        ['【让路】不得止血钳悬停在假项圈上方'],
      ),
    ).toBeUndefined();
    expect(
      findRequiredBeatForbiddenClash(['主簿身后闪出禁军影子'], ['不得揭示玉印来历']),
    ).toBeUndefined();
  });
});

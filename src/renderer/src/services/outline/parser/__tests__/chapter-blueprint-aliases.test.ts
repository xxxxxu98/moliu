import { describe, expect, it } from 'vitest';

import { parseChapterBlueprintSection } from '../expanded-outline-parser';

describe('chapter blueprint field aliases', () => {
  it('normalizes safe aliases emitted by the model into the chapter contract', () => {
    const [blueprint] = parseChapterBlueprintSection(`
### 第16章
- 标题：夜审粮仓
- 章首动作钩子：沈青梧回到县衙，发现粮仓封条已被人换过。
- 推进节点：核验封条；追问更夫；锁定内鬼
- 章尾钩子：账房暗格里露出半枚州府官印。
- 必出事件：沈青梧当场重验粮册；更夫交出染血钥匙
- forbiddenZones：禁止让内鬼无理由自曝；禁止跳过取证
- 章尾钩子文案：官印为何会出现在县衙粮仓？
- 爽点类型：智斗破局
`);

    expect(blueprint).toMatchObject({
      orderIndex: 16,
      title: '夜审粮仓',
      CBN: '沈青梧回到县衙，发现粮仓封条已被人换过。',
      CPNs: ['核验封条', '追问更夫', '锁定内鬼'],
      CEN: '账房暗格里露出半枚州府官印。',
      mustCover: ['沈青梧当场重验粮册', '更夫交出染血钥匙'],
      forbiddenZones: ['禁止让内鬼无理由自曝', '禁止跳过取证'],
      hookText: '官印为何会出现在县衙粮仓？',
    });
    // 未产出概要时回退 CBN（旧口径），保证老格式仍可解析
    expect(blueprint.summary).toBe('沈青梧回到县衙，发现粮仓封条已被人换过。');
  });

  it('概要字段成为章纲描述，不再与 CBN 逐字重复', () => {
    // summary 会落成 plotOutline.description 与 chapter.outline 的正文段，
    // 只回退 CBN 时整章章纲等于零信息增量。
    const [blueprint] = parseChapterBlueprintSection(`
### 第16章
- 标题：夜审粮仓
- 概要：沈青梧夜里回衙发现封条被换，顺着更夫的证词一路查到账房暗格，最后翻出半枚州府官印，把案子从县衙捅到了州府。
- CBN：沈青梧回到县衙，发现粮仓封条已被人换过。
- CPNs：核验封条；追问更夫；锁定内鬼
- CEN：账房暗格里露出半枚州府官印。
`);

    expect(blueprint.summary).toContain('把案子从县衙捅到了州府');
    expect(blueprint.summary).not.toBe(blueprint.CBN);
  });
});

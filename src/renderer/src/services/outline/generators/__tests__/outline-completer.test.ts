import { describe, expect, it } from 'vitest';

import {
  compactContext,
  extractOutlineSectionBody,
  extractRequestedChapterBlocks,
  findIncompleteChapterNumbers,
  replaceOutlineSection,
} from '../outline-completer';
import type { ExecutableOutline } from '../../types/executable-outline';
import type { OutlineDirection } from '../../types/direction';

describe('outline-completer', () => {
  it('替换被截断到文末的单章蓝图 section，并保留前文', () => {
    const raw = `## 故事定位\n- 书名：测试\n\n## 单章蓝图\n### 第1章\n- 标题：旧标题`;
    const next = replaceOutlineSection(
      raw,
      ['单章蓝图', '逐章蓝图'],
      '单章蓝图',
      '### 第1章\n- 标题：新标题\n\n### 第2章\n- 标题：第二章标题',
    );

    expect(next).toContain('## 故事定位');
    expect(next).not.toContain('旧标题');
    expect(next).toContain('### 第2章');
  });

  it('只提取本批要求的章节并按章号去重', () => {
    const blocks = extractRequestedChapterBlocks(
      `这里是说明\n### 第15章\n- 标题：不应接纳\n### 第16章\n- 标题：夜审账本\n- CBN：账本突然少了一页\n### 第17章\n- 标题：旧印翻案\n- CBN：旧印在灯下显出暗纹`,
      [16, 17],
    );

    expect([...blocks.keys()]).toEqual([16, 17]);
    expect(blocks.get(16)).toContain('夜审账本');
    expect(blocks.has(15)).toBe(false);
  });

  it('从完整响应中剥离 section 标题和后续 section', () => {
    const body = extractOutlineSectionBody(
      `## 关键角色规划\n#### 主角\n- 姓名：林川\n\n## 伏笔规划\n#### 短伏笔1`,
      ['关键角色规划', '关键角色'],
    );

    expect(body).toContain('姓名：林川');
    expect(body).not.toContain('伏笔规划');
  });

  it('补章上下文携带既有章节 canon，防止跨批次重启已完成剧情', () => {
    const context = compactContext(
      {
        title: '测试书',
        oneLiner: '一句话',
        premise: '前提',
        storyEngine: {} as ExecutableOutline['storyEngine'],
        volumePlan: [],
        startupPack30: {} as ExecutableOutline['startupPack30'],
        chapterBlueprints: [
          {
            orderIndex: 10,
            title: '三日终局',
            CBN: '期限最后一日当堂对质',
            CPNs: ['主角出示证据', '反派被收押'],
            CEN: '县丞被押往州府候审',
            mustCover: ['洗清冤屈'],
            forbiddenZones: ['不得让县丞恢复原职'],
          },
        ],
      } as ExecutableOutline,
      { title: '方向' } as OutlineDirection,
    );

    expect(context).toContain('"existingChapterCanon"');
    expect(context).toContain('"chapter": 10');
    expect(context).toContain('县丞被押往州府候审');
  });

  it('定点识别缺字段或占位标题的章节，不重生成其余章节', () => {
    const chapterBlueprints = Array.from({ length: 30 }, (_, index) => ({
      orderIndex: index + 1,
      title: `第${index + 1}章 有效标题`,
      CBN: '主角从上一章悬念切入并立刻采取行动',
      CPNs: ['核验证据', '推进冲突'],
      CEN: '新证据把矛盾推向下一章',
      mustCover: ['完成本章取证'],
      forbiddenZones: ['禁止提前揭晓幕后人'],
    }));
    chapterBlueprints[15].title = '第16章';
    chapterBlueprints[16].CBN = '';

    const incomplete = findIncompleteChapterNumbers({
      chapterBlueprints,
    } as ExecutableOutline);

    expect(incomplete).toEqual([16, 17]);
  });
});

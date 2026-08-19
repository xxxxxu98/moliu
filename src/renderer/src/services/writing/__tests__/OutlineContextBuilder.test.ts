/**
 * OutlineContextBuilder 单元测试
 *
 * 重点验证：
 * 1. P0 Bug A：首页大纲生成的逐章结构化节点（无 chapterId 绑定时）
 *    能通过位置兜底正确取回，修复此前"恒返回 null 导致大纲策略全部丢失"的 bug
 * 2. P1 B1：buildWindowedOutlineText 窗口化行为
 */

import { describe, it, expect } from 'vitest';
import {
  extractChapterContext,
  getChapterPlotNodes,
  buildChapterOutlineText,
  buildFullOutlineText,
  buildWindowedOutlineText,
} from '@/services/writing/OutlineContextBuilder';
import type { PlotNode } from '@/types/project';
import { OUTLINE_COMPLETENESS_POLICY } from '@/services/outline/validation/outlineCompleteness';

// 构造一个"模拟首页大纲落地后的 plotOutline"：
// 4 个 act 节点 + 3 个章节型节点（chapter 节点的 orderIndex 会被前面的 act 污染，
// 这正是 buildPlotOutline 的现状，也是位置兜底要解决的场景）
function makePlotOutline(): PlotNode[] {
  return [
    { id: 'act-1', title: '第一幕', type: 'act', orderIndex: 0, description: '开端' },
    { id: 'act-2', title: '第二幕上', type: 'act', orderIndex: 1, description: '铺垫' },
    { id: 'act-3', title: '第二幕下', type: 'act', orderIndex: 2, description: '冲突' },
    { id: 'act-4', title: '第三幕', type: 'act', orderIndex: 3, description: '收束' },
    {
      id: 'plot-ch-1',
      title: '第1章',
      type: 'chapter',
      orderIndex: 4, // 被 act 污染：不是 0
      description: '主角登场',
      CBN: '主角在小镇醒来',
      CPNs: ['发现异象', '踏上旅程'],
      CEN: '走出小镇',
      mustCover: ['建立主角人设'],
      chapterType: 'world_intro',
      hookType: 'sudden_reveal',
      isClimax: false,
    },
    {
      id: 'plot-ch-2',
      title: '第2章',
      type: 'chapter',
      orderIndex: 5,
      description: '初遇反派',
      CBN: '走出小镇',
      CPNs: ['遭遇埋伏'],
      CEN: '险胜',
      chapterType: 'conflict',
      isClimax: false,
    },
    {
      id: 'plot-ch-3',
      title: '第3章',
      type: 'chapter',
      orderIndex: 6,
      description: '决战',
      CBN: '抵达敌营',
      CPNs: ['正面交锋'],
      CEN: '反派伏诛',
      chapterType: 'climax',
      isClimax: true,
    },
  ];
}

describe('OutlineContextBuilder - P0 Bug A 修复', () => {
  it('getChapterPlotNodes 只返回章节型节点并按 orderIndex 排序', () => {
    const nodes = getChapterPlotNodes(makePlotOutline());
    expect(nodes.map((n) => n.title)).toEqual(['第1章', '第2章', '第3章']);
  });

  it('extractChapterContext: 无 chapterId 绑定时，用 chapterId 直接命中 plot 节点 id', () => {
    const plot = makePlotOutline();
    const ctx = extractChapterContext(plot, 'plot-ch-2', '第2章');
    expect(ctx).not.toBeNull();
    expect(ctx!.description).toBe('初遇反派');
    expect(ctx!.chapterType).toBe('conflict');
  });

  it('extractChapterContext: 位置兜底——第 N 个 chapter 节点 = 第 N 章', () => {
    const plot = makePlotOutline();
    // 真实 Chapter 的 id 是 'chapter-xxx'，和 plot 节点 id（'plot-ch-x'）不一致，
    // 且 plot 节点没有 chapterId 字段，只能靠位置兜底
    const ctx = extractChapterContext(plot, 'chapter-real-id', '第3章', 2);
    expect(ctx).not.toBeNull();
    expect(ctx!.title).toBe('第3章');
    expect(ctx!.CBN).toBe('抵达敌营');
    expect(ctx!.chapterType).toBe('climax');
    expect(ctx!.isClimax).toBe(true);
  });

  it('extractChapterContext: 位置兜底——第 0 章命中第一个 chapter 节点', () => {
    const ctx = extractChapterContext(makePlotOutline(), 'chapter-1', '第1章', 0);
    expect(ctx).not.toBeNull();
    expect(ctx!.CBN).toBe('主角在小镇醒来');
    expect(ctx!.chapterType).toBe('world_intro');
    expect(ctx!.hookType).toBe('sudden_reveal');
    expect(ctx!.CPNs).toEqual(['发现异象', '踏上旅程']);
    expect(ctx!.mustCover).toEqual(['建立主角人设']);
  });

  it('extractChapterContext: 位置越界返回 null', () => {
    const ctx = extractChapterContext(makePlotOutline(), 'chapter-x', 'X', 99);
    expect(ctx).toBeNull();
  });

  it('extractChapterContext: chapterId 显式绑定优先于位置兜底', () => {
    const plot: PlotNode[] = [
      {
        id: 'plot-a',
        title: '章节A',
        type: 'chapter',
        orderIndex: 0,
        description: 'A 的描述',
      },
      {
        id: 'plot-b',
        title: '章节B',
        type: 'chapter',
        orderIndex: 1,
        description: 'B 的描述',
        chapterId: 'bound-chapter-id',
      },
    ];
    // 即使位置传 0（对应 A），但 bound-chapter-id 绑定在 B 上，应命中 B
    const ctx = extractChapterContext(plot, 'bound-chapter-id', undefined, 0);
    expect(ctx!.description).toBe('B 的描述');
  });

  it('extractChapterContext: 不传 chapterOrderIndex 时禁用位置兜底', () => {
    // 既不命中 chapterId 也不命中 id，且未给位置 → null
    const ctx = extractChapterContext(makePlotOutline(), 'totally-unknown');
    expect(ctx).toBeNull();
  });
});

describe('buildChapterOutlineText', () => {
  it('把结构化节点拼成可读 prompt 文本', () => {
    const ctx = extractChapterContext(makePlotOutline(), 'chapter-x', '第1章', 0)!;
    const text = buildChapterOutlineText(ctx, true);
    expect(text).toContain('主角在小镇醒来');
    expect(text).toContain('【推进节点 CPNs】');
    expect(text).toContain('1. 发现异象');
    expect(text).toContain('【章节类型】世界观介绍');
    expect(text).toContain('【章尾钩子】突然揭示');
  });

  it('includeStrategyFields=false 时不输出章节类型等策略字段', () => {
    const ctx = extractChapterContext(makePlotOutline(), 'chapter-x', '第1章', 0)!;
    const text = buildChapterOutlineText(ctx, false);
    expect(text).not.toContain('【章节类型】');
    expect(text).toContain('【章节起点 CBN】');
  });
});

describe('OutlineContextBuilder - P1 B1 窗口化', () => {
  function makeManyChapters(count: number): PlotNode[] {
    const nodes: PlotNode[] = [
      { id: 'act-1', title: '第一幕', type: 'act', orderIndex: 0, description: '开端' },
    ];
    for (let i = 0; i < count; i++) {
      nodes.push({
        id: `plot-ch-${i}`,
        title: `第${i + 1}章`,
        type: 'chapter',
        orderIndex: i + 1, // 被 act 污染
        description: `第${i + 1}章描述`,
        CBN: `第${i + 1}章起点`,
        isClimax: i === count - 1,
      });
    }
    return nodes;
  }

  it('buildFullOutlineText: 全量输出所有章节细纲', () => {
    const plot = makeManyChapters(30);
    const full = buildFullOutlineText(plot);
    // 30 章都应出现细纲行（CBN）
    const cbnCount = (full.match(/章节起点 CBN/g) || []).length;
    expect(cbnCount).toBe(30);
  });

  it('buildWindowedOutlineText: 当前章 ± 5 章有细纲，其余只有标题（当前章细纲由外层注入）', () => {
    const plot = makeManyChapters(30);
    const win = buildWindowedOutlineText(plot, 15, 5);

    // 当前章 15（0-based），窗口是 10..20。
    // 当前章细纲由调用方（useChapterWriter.buildWritingPromptParts）单独注入，窗口内不再展开，
    // 因此 CBN 只应出现在窗口内除当前章外的 10 章上（10..14 + 16..20）。
    const cbnCount = (win.match(/章节起点 CBN/g) || []).length;
    expect(cbnCount).toBe(10);

    // 当前章标记（保留，便于模型定位），且指向"详见本章大纲"
    expect(win).toContain('【当前章】');
    expect(win).toContain('（详见上方「本章大纲」）');

    // 前后省略提示
    expect(win).toContain('省略前');
    expect(win).toContain('省略后');

    // 远端章节只有标题行（无 CBN），例：第1章标题
    expect(win).toContain('【第1章】第1章');
  });

  it('buildWindowedOutlineText: 开头章节不输出"省略前"', () => {
    const plot = makeManyChapters(30);
    const win = buildWindowedOutlineText(plot, 0, 5);
    expect(win).not.toContain('省略前');
    expect(win).toContain('省略后');
  });

  it('buildWindowedOutlineText: 末尾章节不输出"省略后"', () => {
    const plot = makeManyChapters(30);
    const win = buildWindowedOutlineText(plot, 29, 5);
    expect(win).toContain('省略前');
    expect(win).not.toContain('省略后');
  });

  it('buildWindowedOutlineText: 大幅少于全量输出（每章有真实细纲）', () => {
    const plot = makeManyChapters(100);
    // 模拟真实场景：每章细纲上百字（CPNs/mustCover/forbiddenZones 等）
    plot.forEach((node, i) => {
      if (node.type === 'chapter') {
        node.CPNs = Array.from({ length: 4 }, (_, k) => `推进节点${i}-${k}：很长的描述用于模拟真实大纲细纲内容`.repeat(3));
        node.mustCover = [`必须覆盖${i}：` + 'x'.repeat(80)];
        node.forbiddenZones = [`禁区${i}：` + 'y'.repeat(80)];
      }
    });
    const full = buildFullOutlineText(plot);
    const win = buildWindowedOutlineText(plot, 50, 5);
    // 窗口化应显著短于全量（100 章里只展开 11 章细纲）
    expect(win.length).toBeLessThan(full.length * 0.25);
  });

  it('buildWindowedOutlineText: 空大纲返回空串', () => {
    expect(buildWindowedOutlineText([], 0, 5)).toBe('');
    expect(buildFullOutlineText([])).toBe('');
  });
});

describe('OutlineContextBuilder - orderIndex 去污染（启动包窗口修复）', () => {
  it('extractChapterContext: orderIndex 用位置序号而非节点原始 orderIndex（被 act 污染的场景）', () => {
    const plot = makePlotOutline(); // 4 个 act + 3 个 chapter，chapter.orderIndex 从 4 开始
    // 命中第 1 个 chapter 节点（plot-ch-1），其 node.orderIndex=4，但位置序号应为 0
    const ctx = extractChapterContext(plot, 'plot-ch-1', '第1章');
    expect(ctx).not.toBeNull();
    // 关键断言：ctx.orderIndex 必须是 0（章节序号），不是 4（被污染的节点序号）。
    // 若透传 node.orderIndex，buildEnhancedDesignPrompt 的启动包窗口判断会提前失效。
    expect(ctx!.orderIndex).toBe(0);

    const ctx2 = extractChapterContext(plot, 'plot-ch-3', '第3章');
    expect(ctx2!.orderIndex).toBe(2); // 不是 6
  });

  it('buildEnhancedDesignPrompt: 启动包在 polluted-orderIndex 场景下仍正确注入', async () => {
    // 直接验证最终效果：30 个 chapter 节点但 orderIndex 被前置 act 污染到 4..33，
    // 第 1 章（位置 0）必须仍命中 startupPack 注入条件。
    const { buildEnhancedDesignPrompt } = await import('@/services/writing/OutlineContextBuilder');
    const plot = makePlotOutline();
    const ctx = extractChapterContext(plot, 'plot-ch-1', '第1章')!;
    const prompt = buildEnhancedDesignPrompt({
      projectTitle: '测试',
      projectSynopsis: '',
      projectGenre: [],
      currentChapter: ctx,
      currentChapterOutline: ctx.description,
      startupPack: {
        openingHook: '钩子',
        promiseToReader: '承诺',
        protagonistFirstImpression: '',
        firstMajorCoolPoint: '',
        firstConflictCycle: '',
        chapterBlocks: [],
      },
    });
    // ctx.orderIndex=0 → currentChapterNo=1 → 应注入启动包段落
    expect(prompt).toContain(
      `开篇承诺与前 ${OUTLINE_COMPLETENESS_POLICY.startupChapterCount} 章启动包`,
    );
    expect(prompt).toContain('当前是第 1 章');
  });
});

describe('OutlineContextBuilder - Bug 3/4 故事线渲染修复', () => {
  it('Bug 3: 人物线输出角色名（id）而非 role', async () => {
    const { buildEnhancedDesignPrompt } = await import('@/services/writing/OutlineContextBuilder');
    const ctx = extractChapterContext(makePlotOutline(), 'plot-ch-1', '第1章')!;
    const prompt = buildEnhancedDesignPrompt({
      projectTitle: '测试',
      projectSynopsis: '',
      projectGenre: [],
      currentChapter: ctx,
      currentChapterOutline: '',
      storyLines: {
        // normalizeStoryLines 的真实形状：planned 为 [{id, role}]
        character: {
          planned: [
            { id: '萧炎', role: '主角' },
            { id: '药老', role: '导师' },
          ],
          introduced: [],
          keyRelationships: [],
        },
      } as any,
    });
    expect(prompt).toContain('萧炎');
    expect(prompt).toContain('药老');
    // 不应把 role 当成名字输出
    expect(prompt).not.toMatch(/人物线：主角、导师/);
  });

  it('Bug 4: 收集线从 collection.target 读取（progress 恒为空）', async () => {
    const { buildEnhancedDesignPrompt } = await import('@/services/writing/OutlineContextBuilder');
    const ctx = extractChapterContext(makePlotOutline(), 'plot-ch-1', '第1章')!;
    const prompt = buildEnhancedDesignPrompt({
      projectTitle: '测试',
      projectSynopsis: '',
      projectGenre: [],
      currentChapter: ctx,
      currentChapterOutline: '',
      storyLines: {
        collection: {
          target: ['异火', '灵印', '法宝'],
          progress: [], // normalizeStoryLines 落库后恒为空
        },
      } as any,
    });
    expect(prompt).toContain('异火');
    expect(prompt).toContain('法宝');
    expect(prompt).not.toMatch(/收集线：（暂无）/);
  });
});

describe('OutlineContextBuilder - R4 窗口化越界处理', () => {
  it('chapterOrderIndex 超出节点数时不把末章错标为当前章，改为显式声明无细纲', () => {
    const plot = makePlotOutline(); // 3 个 chapter 节点（0..2）
    // 启动包只有前 50 章细纲，写第 51 章时 chapterOrderIndex=50 远超节点数。
    // 旧行为把第 50 个节点错标成「【当前章】」——给模型注入错误的承接信号；
    // 新行为：不标当前章，窗口锚定末节点保留最近上下文，并声明本章无细纲。
    const win = buildWindowedOutlineText(plot, 10, 5);
    expect(win).not.toContain('【当前章】');
    expect(win).toContain('【本章无章级细纲】');
    expect(win).toContain('第 11 章');
    // 窗口仍锚定末节点：第 3 章细纲保留（供承接参考）
    expect(win).toContain('【第3章】');
  });

  it('chapterOrderIndex 为负数时 clamp 到第 0 章', () => {
    const plot = makePlotOutline();
    const win = buildWindowedOutlineText(plot, -5, 5);
    expect(win).toContain('【当前章】');
  });
});

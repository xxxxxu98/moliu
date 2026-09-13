import { describe, expect, it } from 'vitest';

import {
  blueprintToPlotNode,
  buildRollContextBase,
  buildVolumeAnchor,
  buildWrittenChapterDigests,
  computeOutlineRunway,
  findBlueprintRepetition,
  inspectRolledBlueprintQuality,
  isUsableRolledBlueprint,
  parseBlueprintBlocks,
  rollOutlineForward,
} from '../outline-roller';
import type { Chapter, PlotNode, Project } from '@/types/project';

function makeChapter(overrides: Partial<Chapter> & { index: number }): Chapter {
  return {
    id: `chapter-${overrides.index}`,
    title: `第${overrides.index + 1}章`,
    content: '',
    wordCount: 0,
    orderIndex: overrides.index,
    version: 1,
    status: 'draft',
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
    ...overrides,
  };
}

function makePlotNode(index: number): PlotNode {
  return {
    id: `plot-${index}`,
    title: `节点${index + 1}`,
    type: 'chapter',
    orderIndex: index,
    CBN: `第${index + 1}章开场钩子`,
    CPNs: ['推进主线'],
    CEN: `第${index + 1}章收束状态`,
    mustCover: ['事件A'],
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-test',
    name: '测试书',
    description: '一句话卖点',
    genre: [],
    volumes: [],
    chapters: [],
    characters: [],
    foreshadows: [],
    worldSchema: { locations: [], rules: [], factions: [] },
    plotOutline: [],
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
    wordCount: 0,
    ...overrides,
  } as Project;
}

describe('computeOutlineRunway', () => {
  it('跑道 = chapter 节点数 − 已写章数；空章不消耗跑道', () => {
    const state = computeOutlineRunway(
      [makeChapter({ index: 0 }), makeChapter({ index: 1 })],
      Array.from({ length: 50 }, (_, i) => makePlotNode(i)),
    );
    expect(state).toEqual({
      chapterNodeCount: 50,
      existingChapters: 2,
      writtenThrough: 0,
      runway: 50,
    });
  });

  it('写到第 41 章时跑道降为 9（触发阈值内），滚动带着 41 章 digest', () => {
    const chapters = Array.from({ length: 50 }, (_, i) =>
      i < 41
        ? makeChapter({ index: i, content: `第${i + 1}章正文。`.repeat(10) })
        : makeChapter({ index: i }));
    const state = computeOutlineRunway(chapters, Array.from({ length: 50 }, (_, i) => makePlotNode(i)));
    expect(state.writtenThrough).toBe(41);
    expect(state.runway).toBe(9);
  });

  it('bare-written 旧书（写超细纲）跑道为负，触发追赶式滚动', () => {
    const chapters = Array.from({ length: 52 }, (_, i) =>
      makeChapter({ index: i, content: `第${i + 1}章正文。`.repeat(10) }));
    const state = computeOutlineRunway(chapters, Array.from({ length: 50 }, (_, i) => makePlotNode(i)));
    expect(state.runway).toBe(-2);
  });
});

describe('buildWrittenChapterDigests', () => {
  it('收束状态优先 plot 节点 CEN，退 plotSummary，再退正文尾部', () => {
    const chapters = [
      makeChapter({ index: 0, content: 'x'.repeat(200), plotSummary: '摘要兜底' }),
      makeChapter({ index: 1, content: 'y'.repeat(300), plotSummary: '第二摘要' }),
      makeChapter({ index: 2, content: '' }),
    ];
    // 只有第 1 章有 plot 节点：第 2 章验证 plotSummary 兜底
    const digests = buildWrittenChapterDigests(chapters, [makePlotNode(0)]);

    expect(digests.map(d => d.chapterNumber)).toEqual([1, 2]);
    expect(digests[0].endingState).toContain('第1章收束状态');
    expect(digests[1].endingState).toBe('第二摘要');
  });

  it('无 plot 节点也无 plotSummary 时退到正文尾部', () => {
    const chapters = [makeChapter({ index: 0, content: '剧情走到主簿带兵围住库房门口。' })];
    const digests = buildWrittenChapterDigests(chapters, []);
    expect(digests[0].endingState).toContain('主簿带兵围住库房');
  });
});

describe('buildVolumeAnchor', () => {
  it('按每卷章数定位当前卷并标注【当前卷】', () => {
    const project = makeProject({
      metadata: {
        storyScale: { estimatedChaptersPerVolume: 30 },
        volumePlans: [
          { volumeIndex: 1, title: '第一卷', objective: '立足', coreConflict: 'A', climax: '', reversal: '', endingHook: '', protagonistGrowth: '', keyCharacters: [], setupForeshadows: [], payoffForeshadows: ['印记'], relationshipShifts: [] },
          { volumeIndex: 2, title: '第二卷', objective: '扩张', coreConflict: 'B', climax: '', reversal: '', endingHook: '', protagonistGrowth: '', keyCharacters: [], setupForeshadows: [], payoffForeshadows: [], relationshipShifts: [] },
        ],
      },
    });
    const anchor = buildVolumeAnchor(project, 45);
    expect(anchor).toContain('【当前卷】第2卷《第二卷》');
    expect(anchor).toContain('第一卷');
    expect(anchor).not.toContain('【当前卷】第1卷');
  });

  it('无卷纲时给出占位说明', () => {
    expect(buildVolumeAnchor(makeProject(), 51)).toContain('无结构化卷纲');
  });
});

describe('buildRollContextBase', () => {
  it('活跃伏笔只列未回收的，且带埋设/回收章号与载体', () => {
    const project = makeProject({
      foreshadows: [
        {
          id: 'f1', hint: '半块玉印', type: 'item', status: 'buried',
          createdChapter: 3, setupChapter: 3, payoffChapter: 80, carrierCharacter: '许七',
        },
        {
          id: 'f2', hint: '已回收的旧伏笔', type: 'event', status: 'resolved',
          createdChapter: 1, setupChapter: 1, payoffChapter: 10,
        },
      ] as Project['foreshadows'],
    });
    const base = buildRollContextBase(project, 51);
    expect(base.activeForeshadows).toContain('半块玉印');
    expect(base.activeForeshadows).toContain('埋设3章→回收80章');
    expect(base.activeForeshadows).toContain('载体：许七');
    expect(base.activeForeshadows).not.toContain('已回收的旧伏笔');
  });

  it('plannedTail 携带滚动起点前最近几章的既有蓝图收束（承接链桥）', () => {
    const project = makeProject({
      plotOutline: Array.from({ length: 50 }, (_, i) => makePlotNode(i)),
    });
    const base = buildRollContextBase(project, 51);
    // 最近 5 章的规划 CEN 进承接桥
    expect(base.plannedTail).toHaveLength(5);
    expect(base.plannedTail.at(-1)).toContain('第50章');
    expect(base.plannedTail.at(-1)).toContain('第50章收束状态');
    expect(base.plannedTail[0]).toContain('第46章');
  });

  it('writtenThrough 如实计数：冒烟场景（全部空章）为 0', () => {
    const project = makeProject({
      chapters: Array.from({ length: 50 }, (_, i) => makeChapter({ index: i })),
      plotOutline: Array.from({ length: 50 }, (_, i) => makePlotNode(i)),
    });
    const base = buildRollContextBase(project, 51);
    expect(base.writtenThrough).toBe(0);
    expect(base.writtenState).toBe('（暂无已写章节）');
  });
});

describe('parseBlueprintBlocks / isUsableRolledBlueprint', () => {
  const validBlock = (n: number) => `### 第${n}章
- 标题：夜审账本惊变
- 概要：许衡夜查库房账目，发现军资去向，被巡夜主簿撞破，被迫提前摊牌。
- CBN：三更库房灯下账页缺角
- CPNs：许衡比对旧账发现缺口；巡夜主簿带人围库房；许衡以印信压住场面
- CEN：主簿身后闪出禁军影子
- mustCover：查清军资缺口；逼退巡夜主簿
- 禁区：不得揭示玉印来历
- 章尾钩子文案：账还没查完，刀已经架到脖子上了
- 爽点类型：解谜`;

  it('解析完整章块并通过轻量门禁', () => {
    const parsed = parseBlueprintBlocks(validBlock(51), [51]);
    const bp = parsed.get(51);
    expect(bp).toBeDefined();
    expect(isUsableRolledBlueprint(bp)).toBe(true);
    expect(bp!.CPNs).toHaveLength(3);
    expect(bp!.mustCover).toHaveLength(2);
    expect(bp!.hookText).toContain('账还没查完');
  });

  it('缺 CEN 或 CPNs 为空时不过门禁', () => {
    const noCen = validBlock(52).replace(/- CEN：.*/u, '- CEN：');
    const parsed = parseBlueprintBlocks(noCen, [52]);
    expect(parsed.has(52)).toBe(false); // CEN 空在解析层就拒收

    const noCpns = validBlock(53).replace(/- CPNs：.*/u, '- CPNs：');
    const weak = parseBlueprintBlocks(noCpns, [53]).get(53);
    expect(weak).toBeDefined();
    expect(isUsableRolledBlueprint(weak)).toBe(false);
  });

  it('缺 mustCover/禁区等可选字段的章块不再抛 raw.split TypeError（2026-08-24 冒烟批次 51-60 实测）', () => {
    // 网关截断响应：只有标题/概要/CBN/CPNs/CEN，缺 mustCover 与禁区
    const truncated = `### 第54章
- 标题：残卷滴血露破绊
- 概要：沈淮细勘血印密卷查出时序矛盾，深夜遭抢夺。
- CBN：烛光下血印边缘泛硫磺黄
- CPNs：细勘密卷发现时序矛盾；周崇礼深夜带人抢卷；沈淮抢先转移原件
- CEN：刀光逼近值房门`;
    expect(() => parseBlueprintBlocks(truncated, [54])).not.toThrow();
    const bp = parseBlueprintBlocks(truncated, [54]).get(54);
    expect(bp).toBeDefined();
    expect(bp!.mustCover).toEqual([]);
    expect(bp!.forbiddenZones).toEqual([]);
    expect(isUsableRolledBlueprint(bp)).toBe(false); // mustCover 空 → 不可用，留给定点修复
  });

  it('蓝图落 PlotNode：orderIndex=章号-1，结构化字段齐全', () => {
    const bp = parseBlueprintBlocks(validBlock(51), [51]).get(51)!;
    const node = blueprintToPlotNode(bp, 'proj-test');
    expect(node.type).toBe('chapter');
    expect(node.orderIndex).toBe(50);
    expect(node.CBN).toBeTruthy();
    expect(node.CPNs!.length).toBeGreaterThanOrEqual(1);
    expect(node.CEN).toBeTruthy();
    expect(node.mustCover!.length).toBeGreaterThan(0);
  });

  it('污染序号空间：追加到既有最大 orderIndex 之后并绑定 chapterId', () => {
    // 旧项目：act/subplot 节点混用 orderIndex 计数，chapter 节点序号 0,1,5(污染)
    const pollutedNodes: PlotNode[] = [
      { ...makePlotNode(0), orderIndex: 0 },
      { ...makePlotNode(1), orderIndex: 1 },
      { ...makePlotNode(2), orderIndex: 5 },
    ];
    const bp = parseBlueprintBlocks(validBlock(51), [51]).get(51)!;
    const node = blueprintToPlotNode(bp, 'proj-test', {
      existingChapterNodes: pollutedNodes,
      rollFromChapter: 51,
      chapter: { id: 'chapter-51' },
    });
    // 追加在最大 orderIndex(5) 之后，不穿插污染区间
    expect(node.orderIndex).toBe(6);
    expect(node.chapterId).toBe('chapter-51');
  });

  it('干净序号空间：即使传了 existingChapterNodes 也用章号-1，不绑 chapterId', () => {
    const cleanNodes = [makePlotNode(0), makePlotNode(1)];
    const bp = parseBlueprintBlocks(validBlock(3), [3]).get(3)!;
    const node = blueprintToPlotNode(bp, 'proj-test', {
      existingChapterNodes: cleanNodes,
      rollFromChapter: 3,
      chapter: { id: 'chapter-3' },
    });
    expect(node.orderIndex).toBe(2);
    expect(node.chapterId).toBeUndefined();
  });
});

describe('rollOutlineForward', () => {
  const blockFor = (n: number) => `### 第${n}章
- 标题：第${n}章夜审惊变
- 概要：概要内容填写足够长以通过基本校验要求第${n}章概要补充说明文字。
- CBN：三更灯下账页缺角第${n}章
- CPNs：比对旧账发现缺口；主簿带人围库房；以印信压住场面
- CEN：主簿身后闪出禁军影子第${n}章
- mustCover：查清军资缺口；逼退巡夜主簿
- 禁区：不得揭示玉印来历
- 章尾钩子文案：账还没查完，刀已经架到脖子上了
- 爽点类型：解谜`;

  function makeRollProject(plannedChapterCount?: number): Project {
    return makeProject({
      chapters: Array.from({ length: 50 }, (_, i) =>
        makeChapter({ index: i, content: `第${i + 1}章正文内容。`.repeat(20) })),
      plotOutline: Array.from({ length: 50 }, (_, i) => makePlotNode(i)),
      metadata: plannedChapterCount ? { plannedChapterCount } : undefined,
    });
  }

  it('从第 51 章起补蓝图并落库，persist 收到连续节点与计划章数', async () => {
    const project = makeRollProject(120);
    const persisted: { nodes: PlotNode[]; planned: number }[] = [];
    const result = await rollOutlineForward({
      project,
      callStructuredText: async (_system, user) => {
        const requested = [...user.matchAll(/第?(\d+)/gu)].map(m => Number(m[1]));
        // 取【只需补写的章号】行之后的章号序列太脆弱，直接按 prompt 内首个连续区间模拟
        const batch = [51, 52, 53].filter(n => requested.includes(n));
        return batch.map(blockFor).join('\n\n');
      },
      persist: async (nodes, plannedChapterCount) => {
        persisted.push({ nodes: [...nodes], planned: plannedChapterCount });
      },
    });

    // 只解出 51-53 章（模拟模型只输出 3 章）→ 前缀截断到 53，warnings 提示 54 章起缺失
    // 注：OUTLINE_ROLL_BATCH_CHAPTERS 默认 50，requestChapterNumbers 为 51-100，
    // callStructuredText 只返回 51-53，validTo=53。
    expect(result.appendedCount).toBe(3);
    expect(result.fromChapter).toBe(51);
    expect(result.toChapter).toBe(53);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].nodes.map(n => n.orderIndex)).toEqual([50, 51, 52]);
    // plannedChapterCount 不回退：原计划 120 章，续纲只到 53 也不把计划降下来
    expect(persisted[0].planned).toBe(120);
    expect(result.warnings.join('\n')).toMatch(/54-/);
  });

  it('一章都解不出时返回 0 且不落库', async () => {
    const project = makeRollProject();
    let persisted = false;
    const result = await rollOutlineForward({
      project,
      callStructuredText: async () => '模型返回了无法解析的内容',
      persist: async () => {
        persisted = true;
      },
    });
    expect(result.appendedCount).toBe(0);
    expect(persisted).toBe(false);
    expect(result.warnings.join('\n')).toContain('未产出可用蓝图');
  });

  it('定点修复覆盖首轮整章缺失的章号时不崩且修复稿被采纳（glm 200 章 6 次实测）', async () => {
    // 2026-09-10 受害样本：repairTargets 含首轮 AI 未返回的章（blueprints 无该
    // 条目），修复响应解出该章后 blueprintDefectCount(undefined) 读 mustCover
    // 抛 TypeError → 整批修复稿被 try/catch 丢弃，后续批次连环缺失。
    const project = makeRollProject(120);
    let call = 0;
    const result = await rollOutlineForward({
      project,
      callStructuredText: async () => {
        call += 1;
        if (call === 1) return blockFor(51); // 首轮只解出 51，52/53 整章缺失
        return [blockFor(52), blockFor(53)].join('\n\n'); // 定点修复轮补齐
      },
      persist: async () => {},
    });
    expect(result.appendedCount).toBe(3); // 51 + 修复轮采纳的 52/53
    expect(result.warnings.join('\n')).not.toContain('定点修复失败');
  });

  it('滚纲触顶全书计划章数时注入终卷收束硬约束，中段批次不注入', async () => {
    // 2026-09-10 glm r2 实证：终批与中段用同一提示词，200 章收在「面圣亮牌
    // 前一秒」半空（结尾不收束 S1）。终批必须带收束指令。
    const prompts: string[] = [];
    const project = makeRollProject(55); // plannedCount=55，滚 51-55 即触顶终批
    await rollOutlineForward({
      project,
      callStructuredText: async (_system, user) => {
        prompts.push(user);
        return blockFor(51); // 只需触发首轮请求即可断言 prompt 内容
      },
      persist: async () => {},
    });
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts[0]).toContain('终卷收束硬约束');
    expect(prompts[0]).toContain('全书共55章');
    expect(prompts[0]).toContain('末章（第55章）CEN 必须是全书收束句');

    const midPrompts: string[] = [];
    const midProject = makeRollProject(120); // 51-100 为中段批
    await rollOutlineForward({
      project: midProject,
      callStructuredText: async (_system, user) => {
        midPrompts.push(user);
        return blockFor(51);
      },
      persist: async () => {},
    });
    expect(midPrompts[0]).not.toContain('终卷收束硬约束');
  });

  it('已达计划章数上限时跳过并说明原因', async () => {
    const project = makeRollProject(50);
    const result = await rollOutlineForward({
      project,
      callStructuredText: async () => {
        throw new Error('不应发起请求');
      },
      persist: async () => {
        throw new Error('不应落库');
      },
    });
    expect(result.appendedCount).toBe(0);
    expect(result.skippedReason).toContain('计划章数上限');
  });

  it('mid 模式预建空章不推高滚动起点：80 空章 + 50 细纲 → 仍从第 51 章滚', async () => {
    const project = makeProject({
      chapters: Array.from({ length: 80 }, (_, i) => makeChapter({ index: i })),
      plotOutline: Array.from({ length: 50 }, (_, i) => makePlotNode(i)),
      metadata: { plannedChapterCount: 80 },
    });
    const persisted: PlotNode[][] = [];
    const result = await rollOutlineForward({
      project,
      callStructuredText: async (_system, user) => {
        const nums = [...user.matchAll(/(\d+)/gu)].map(m => Number(m[1]));
        const batch = [51].filter(n => nums.includes(n));
        return batch.map(n => `### 第${n}章\n- 标题：第${n}章夜审惊变\n- 概要：概要内容足够长概要内容足够长概要补充说明文字。\n- CBN：三更灯下账页缺角第${n}章\n- CPNs：比对旧账发现缺口；主簿带人围库房；以印信压住场面\n- CEN：主簿身后闪出禁军影子第${n}章\n- mustCover：查清军资缺口；逼退巡夜主簿\n- 禁区：不得揭示玉印来历\n- 章尾钩子文案：账还没查完\n- 爽点类型：解谜`).join('\n\n');
      },
      persist: async (nodes) => {
        persisted.push([...nodes]);
      },
    });
    // 若误用章节总数（80）推起点会得到 81 → 直接 skip；正确口径从 51 起
    expect(result.fromChapter).toBe(51);
    expect(result.appendedCount).toBe(1);
    expect(persisted.at(-1)![0].orderIndex).toBe(50);
  });

  it('状态基底含已写收束、活跃伏笔与角色名单', async () => {
    const project = makeRollProject();
    let seenUserPrompt = '';
    let seenSystemPrompt = '';
    await rollOutlineForward({
      project,
      callStructuredText: async (system, user) => {
        seenSystemPrompt = system;
        seenUserPrompt = user;
        return '空响应';
      },
      persist: async () => {},
    });
    expect(seenUserPrompt).toContain('【已写进度与收束状态】');
    expect(seenUserPrompt).toContain('第50章收束状态');
    expect(seenUserPrompt).toContain('【活跃伏笔');
    expect(seenUserPrompt).toContain('【角色名单】');
    // 承接链桥：既有蓝图的收尾也注入（正文 digest 与滚动起点之间隔着未写章）
    expect(seenUserPrompt).toContain('【紧邻既有蓝图收束】');
    // 已写到 50 章、从 51 章滚：进度措辞如实
    expect(seenSystemPrompt).toContain('正文已写到第50章');
  });

  it('命运锁：章记忆里的下狱/去职角色注入滚纲上下文与硬约束（2026-09-01 终验书反派复位实锤）', async () => {
    const project = makeRollProject();
    project.chapterMemories = [
      {
        chapterId: 'ch27',
        chapterTitle: 'Chapter 27',
        chapterIndex: 26,
        corePlot: '严嵩林被革职下狱',
        keyEvents: ['严嵩林被当堂革职下狱'],
        locations: [],
        characterStateChanges: [
          { characterName: '严嵩林', stateType: 'status', state: '下狱', detail: '枷入天牢' },
        ],
        revealedForeshadows: [],
        newForeshadows: [],
        wordCount: 100,
        createdAt: new Date().toISOString(),
      },
    ];
    let seenUserPrompt = '';
    let seenSystemPrompt = '';
    await rollOutlineForward({
      project,
      callStructuredText: async (system, user) => {
        seenSystemPrompt = system;
        seenUserPrompt = user;
        return '空响应';
      },
      persist: async () => {},
    });
    expect(seenUserPrompt).toContain('【命运锁');
    expect(seenUserPrompt).toContain('严嵩林（第27章下狱）');
    expect(seenSystemPrompt).toContain('【命运锁】');
    expect(seenSystemPrompt).toContain('【禁区相容】');
  });

  it('命运弧计数：同向命运 ≥2 次在命运锁行标注累计，橡皮筋禁令注入硬约束（赵烈下狱×7 形态）', async () => {
    const project = makeRollProject();
    const mem = (chapterIndex: number, state: string) => ({
      chapterId: `ch${chapterIndex}`,
      chapterTitle: `Chapter ${chapterIndex}`,
      chapterIndex,
      corePlot: '赵烈命运节点',
      keyEvents: [],
      locations: [],
      characterStateChanges: [
        { characterName: '赵烈', stateType: 'status', state, detail: '台账' },
      ],
      revealedForeshadows: [],
      newForeshadows: [],
      wordCount: 100,
      createdAt: new Date().toISOString(),
    });
    project.chapterMemories = [mem(80, '下狱'), mem(119, '下狱'), mem(154, '下狱'), mem(196, '越狱')];
    let seenUserPrompt = '';
    let seenSystemPrompt = '';
    const base = buildRollContextBase(project, 201);
    await rollOutlineForward({
      project,
      callStructuredText: async (system, user) => {
        seenSystemPrompt = system;
        seenUserPrompt = user;
        return '空响应';
      },
      persist: async () => {},
    });
    // FATE_STATES 不含越狱（解除方向不参与橡皮筋计数），终态=最晚 FATE 态（下狱@154）
    const zhao = base.fateLockEntries.find(e => e.name === '赵烈');
    expect(zhao?.state).toBe('下狱');
    expect(zhao?.maxSameStateCount).toBe(3);
    expect(zhao?.history).toEqual([{ state: '下狱', count: 3 }]);
    expect(base.fateLocks.some(line => line.includes('赵烈') && line.includes('下狱×3'))).toBe(true);
    expect(seenSystemPrompt).toContain('【命运橡皮筋禁令】');
    expect(seenUserPrompt).toContain('【命运锁');
  });

  it('冒烟场景（正文未写、蓝图已就位）进度措辞不谎称已写', async () => {
    const project = makeProject({
      chapters: Array.from({ length: 50 }, (_, i) => makeChapter({ index: i })),
      plotOutline: Array.from({ length: 50 }, (_, i) => makePlotNode(i)),
      metadata: { plannedChapterCount: 120 },
    });
    let seenSystemPrompt = '';
    await rollOutlineForward({
      project,
      callStructuredText: async (system) => {
        seenSystemPrompt = system;
        return '空响应';
      },
      maxChapters: 60,
      persist: async () => {},
    });
    expect(seenSystemPrompt).toContain('正文尚未开写，第1-50章已有章级蓝图');
  });

  it('maxChapters 圈定射程：只补到目标章数', async () => {
    const project = makeRollProject();
    const persisted: PlotNode[][] = [];
    const result = await rollOutlineForward({
      project,
      callStructuredText: async (_system, user) => {
        // 按 prompt 中请求的章号动态生成块
        const nums = [...user.matchAll(/第?(\d+)/gu)].map(m => Number(m[1]));
        const batch = [51, 52, 53, 54, 55].filter(n => nums.includes(n));
        return batch.map(n => `### 第${n}章\n- 标题：第${n}章夜审惊变\n- 概要：概要内容足够长概要内容足够长概要补充说明文字。\n- CBN：三更灯下账页缺角第${n}章\n- CPNs：比对旧账发现缺口；主簿带人围库房；以印信压住场面\n- CEN：主簿身后闪出禁军影子第${n}章\n- mustCover：查清军资缺口；逼退巡夜主簿\n- 禁区：不得揭示玉印来历\n- 章尾钩子文案：账还没查完\n- 爽点类型：解谜`).join('\n\n');
      },
      maxChapters: 55,
      persist: async (nodes) => {
        persisted.push([...nodes]);
      },
    });
    expect(result.fromChapter).toBe(51);
    expect(result.toChapter).toBe(55);
    expect(result.appendedCount).toBe(5);
    expect(persisted.at(-1)).toHaveLength(5);
  });
});

describe('inspectRolledBlueprintQuality / findBlueprintRepetition', () => {
  const bpFrom = (raw: string, n: number) => parseBlueprintBlocks(raw, [n]).get(n)!;

  it('跨章目标 mustCover 判 over-scoped-mustcover', () => {
    const raw = `### 第61章
- 标题：血染公堂翻旧案
- 概要：概要内容足够长概要内容足够长概要补充说明文字。
- CBN：三更灯下账页缺角61
- CPNs：比对旧账发现缺口；主簿带人围库房；以印信压住场面
- CEN：主簿身后闪出禁军影子61
- mustCover：完成从查账到定罪的全流程
- 禁区：不得揭示玉印来历`;
    const issues = inspectRolledBlueprintQuality(bpFrom(raw, 61));
    expect(issues.some(issue => issue.kind === 'over-scoped-mustcover')).toBe(true);
  });

  it('承接模板 CBN 判 template-cbn', () => {
    const raw = `### 第62章
- 标题：禁军围府锁重门
- 概要：概要内容足够长概要内容足够长概要补充说明文字。
- CBN：承接上章结尾：主簿身后闪出禁军影子
- CPNs：比对旧账发现缺口；主簿带人围库房；以印信压住场面
- CEN：府门外的马蹄声越来越近62
- mustCover：查清军资缺口
- 禁区：不得揭示玉印来历`;
    const issues = inspectRolledBlueprintQuality(bpFrom(raw, 62));
    expect(issues.some(issue => issue.kind === 'template-cbn')).toBe(true);
  });

  it('企划口吻节点判 reader-meta', () => {
    const raw = `### 第63章
- 标题：库房对峙见真章
- 概要：概要内容足够长概要内容足够长概要补充说明文字。
- CBN：三更灯下账页缺角63
- CPNs：让读者对接下来的反转充满期待
- CEN：主簿身后闪出禁军影子63
- mustCover：查清军资缺口
- 禁区：不得揭示玉印来历`;
    const issues = inspectRolledBlueprintQuality(bpFrom(raw, 63));
    expect(issues.some(issue => issue.kind === 'reader-meta')).toBe(true);
  });

  it('相邻章 CBN：子串包含判复述；仅差序号的模板句不误伤', () => {
    const mk = (n: number, cbn: string) =>
      ({ ...bpFrom(`### 第${n}章\n- 标题：夜审账本惊变\n- 概要：概要内容足够长概要内容足够长概要补充说明文字。\n- CBN：${cbn}\n- CPNs：比对旧账发现缺口\n- CEN：影子逼近${n}\n- mustCover：查清缺口`, n), orderIndex: n });
    // 本章开头吞了上章 CBN 全文再加尾巴 → 子串包含，判复述
    const repeated = [mk(64, '三更灯下账页缺角见血印'), mk(65, '三更灯下账页缺角见血印加急')];
    expect(findBlueprintRepetition(repeated)).toHaveLength(1);
    // 仅差一个序号（换查第几笔账）→ 合法的相邻推进，不误伤
    const sequential = [mk(66, '核对第3笔账目发现缺口'), mk(67, '核对第4笔账目发现缺口')];
    expect(findBlueprintRepetition(sequential)).toHaveLength(0);
  });

  // ---------- 2026-09-12 g38f r3 新守卫：截断残句 + 终章收束 ----------

  it('CBN 句末方位悬垂判 truncated-hook-clause（reg 实证：「…沈淮安手中。」）', () => {
    const raw = `### 第64章
- 标题：浮尸抬上井栏
- 概要：概要内容足够长概要内容足够长概要补充说明文字。
- CBN：仵作刚将浮尸抬上井栏，沈淮安手中
- CPNs：勘验浮尸伤痕；追问井边脚印
- CEN：井底捞出一枚私印
- mustCover：勘验浮尸锁定死因
- 禁区：不得揭示私印主人`;
    const issues = inspectRolledBlueprintQuality(bpFrom(raw, 64));
    expect(issues.some(issue => issue.kind === 'truncated-hook-clause')).toBe(true);
  });

  it('完整谓语句尾（…亮着。/…假的。）不误判截断', () => {
    const raw = `### 第65章
- 标题：值房灯火未熄
- 概要：概要内容足够长概要内容足够长概要补充说明文字。
- CBN：三更过去，值房的灯还亮着
- CPNs：伏在檐下盯梢；记下进出人影
- CEN：帐本夹层抖出半张假契
- mustCover：确认值房夜间异动
- 禁区：不得揭示假契内容`;
    const issues = inspectRolledBlueprintQuality(bpFrom(raw, 65));
    expect(issues.some(issue => issue.kind === 'truncated-hook-clause')).toBe(false);
  });

  it('介词/动词引导的方位句尾不误判（r4 启动误伤实证：「拍在督粮官眼前。」「递到陆承宣手中。」）', () => {
    const raw = `### 第66章
- 标题：总表拍上公案
- 概要：概要内容足够长概要内容足够长概要补充说明文字。
- CBN：折算总表拍在督粮官眼前
- CPNs：督粮官验看总表；当场对质折算口径
- CEN：烫金公文递到陆承宣手中
- mustCover：总表当堂呈验定口径
- 禁区：不得揭示公文发出者`;
    const issues = inspectRolledBlueprintQuality(bpFrom(raw, 66));
    expect(issues.some(issue => issue.kind === 'truncated-hook-clause')).toBe(false);
  });

  it('isFinale 末章缺收束声明判 finale-not-closing；带收束词放行', () => {
    const raw = `### 第200章
- 标题：牢里崔相服毒了
- 概要：概要内容足够长概要内容足够长概要补充说明文字。
- CBN：小太监连滚带爬摔进大殿
- CPNs：传报崔相狱中服毒；百官骤然失声
- CEN：姜德海跌撞扑上新帝耳语
- mustCover：传报崔文简服毒消息
- 禁区：不得提前揭示服毒真假`;
    const bp = bpFrom(raw, 200);
    expect(
      inspectRolledBlueprintQuality(bp, { isFinale: true }).some(
        issue => issue.kind === 'finale-not-closing',
      ),
    ).toBe(true);
    // 补收束声明（g38f r3 主轮 ch200 缺的正是这个）→ 放行
    const closed = {
      ...bp,
      CEN: '新朝格局尘埃落定，主角功成归处已明',
    };
    expect(
      inspectRolledBlueprintQuality(closed, { isFinale: true }).some(
        issue => issue.kind === 'finale-not-closing',
      ),
    ).toBe(false);
    // 非末章同内容不校验收束
    expect(
      inspectRolledBlueprintQuality(bp).some(
        issue => issue.kind === 'finale-not-closing',
      ),
    ).toBe(false);
  });
});

/**
 * outline-reviewer 单测
 *
 * 覆盖：
 * - inspectOutlineQuality：占位事件 / 模板话术 / 禁区全块复制 / 卷卖点未覆盖 / 区间断档 / 括号未配对 六类质检
 * - reviewAndFixOutline：初稿无问题不发请求 / 修正改善则采用 / 未改善回退 / 解析失败回退 / 异常回退 / abort 上抛
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutableOutline } from '../../types/executable-outline';

// mock 解析器：reviewAndFixOutline 内部的初稿/修正稿解析结果由测试控制
const parseExpandedOutlineMock = vi.fn();
vi.mock('../../parser/expanded-outline-parser', () => ({
  parseExpandedOutline: (...args: unknown[]) => parseExpandedOutlineMock(...args),
}));

import {
  inspectOutlineQuality,
  parseChapterRange,
  reviewAndFixOutline,
} from '../outline-reviewer';

function makeBlock(overrides: Record<string, unknown> = {}) {
  return {
    range: '1-5章',
    objective: '炼药入门',
    mustEvents: ['觉醒异火'],
    coolPoints: ['炼丹惊全场'],
    hookRequirement: '药老现身',
    pacing: 'fast',
    readerExpectation: '爽',
    ...overrides,
  };
}

/** 劣化大纲：五类问题全占 */
function makeDirtyOutline(): ExecutableOutline {
  return {
    title: '测试方案',
    oneLiner: '卖点',
    premise: '前提',
    positioning: {
      targetReaders: [],
      coreEmotions: [],
      sellingPoints: [],
      styleKeywords: [],
    },
    storyScale: {
      targetWordCount: '100万字',
      estimatedChapterCount: 400,
      averageWordsPerChapter: 2500,
      suggestedVolumeCount: 6,
      estimatedChaptersPerVolume: 67,
      startupPhaseRatio: '8%',
      longformProgressionNote: '',
    },
    storyEngine: {
      protagonistName: '主角',
      protagonistStart: '',
      protagonistGoalLongTerm: '',
      protagonistGoalShortTerm: '',
      coreConflict: '',
      escalationPath: [],
      failureCost: '',
    },
    volumePlan: [
      {
        volumeIndex: 1,
        title: '第1卷',
        objective: '完成校园鬼域闭环',
        coreConflict: '',
        climax: '厉鬼群自动让开一条路',
        reversal: '',
        endingHook: '',
        protagonistGrowth: '',
        keyCharacters: [],
        setupForeshadows: [],
        payoffForeshadows: [],
        relationshipShifts: [],
      },
    ],
    startupPack30: {
      openingHook: '主角在教室醒来',
      promiseToReader: '',
      protagonistFirstImpression: '',
      firstMajorCoolPoint: '',
      firstConflictCycle: '',
      chapterBlocks: [
        // 块1：占位事件 + 模板话术 + 禁区（与后两块相同 → 全章复制）
        makeBlock({
          mustEvents: ['推进主线'],
          hookRequirement: '承接上章结尾：药老现身',
          forbiddenZones: ['不能让药老提前暴露真实身份'],
        }),
        // 块2：区间断档（6-10 之后跳 11）+ 禁区与前块相同
        makeBlock({
          range: '11-15章',
          forbiddenZones: ['不能让药老提前暴露真实身份'],
        }),
        // 块3：禁区与前两块相同（三连 → 全章复制），卖点仍未出现
        makeBlock({
          range: '16-20章',
          forbiddenZones: ['不能让药老提前暴露真实身份'],
        }),
      ],
    },
    keyCharacters: [],
    foreshadowPlan: [],
  } as ExecutableOutline;
}

/** 干净大纲：五类问题全无 */
function makeCleanOutline(): ExecutableOutline {
  const outline = makeDirtyOutline();
  outline.startupPack30.chapterBlocks = [
    makeBlock({
      objective: '完成校园鬼域闭环',
      mustEvents: ['主角在教室醒来'],
      hookRequirement: '药老现身',
    }),
    makeBlock({
      range: '6-10章',
      mustEvents: ['发现尸体异常'],
      hookRequirement: '内院名额揭晓',
      forbiddenZones: ['不能解释灵异源头'],
    }),
    makeBlock({
      range: '11-15章',
      mustEvents: ['厉鬼群自动让开一条路'],
      coolPoints: ['厉鬼群自动让开一条路'],
      forbiddenZones: ['不能让药老提前暴露真实身份'],
    }),
  ];
  return outline;
}

const DIRECTION = { name: '测试方向', description: '测试' } as never;

beforeEach(() => {
  parseExpandedOutlineMock.mockReset();
});

describe('inspectOutlineQuality', () => {
  it('劣化大纲命中全部五类问题', () => {
    const issues = inspectOutlineQuality(makeDirtyOutline());
    const kinds = issues.map(issue => issue.kind);
    expect(kinds).toContain('placeholder-events');
    expect(kinds).toContain('template-cbn');
    expect(kinds).toContain('duplicated-forbidden');
    expect(kinds).toContain('missing-selling-point');
    expect(kinds).toContain('broken-range');
  });

  it('必出事件括号未配对命中 unbalanced-paren', () => {
    const outline = makeDirtyOutline();
    outline.startupPack30.chapterBlocks = [
      makeBlock({
        mustEvents: ['他回溯玉佛照片（无血文物证'],
      }),
    ];
    const issues = inspectOutlineQuality(outline);
    expect(issues.some(issue => issue.kind === 'unbalanced-paren')).toBe(true);
  });

  it('括号配对的事件不误报', () => {
    const outline = makeDirtyOutline();
    outline.startupPack30.chapterBlocks = [
      makeBlock({
        mustEvents: ['他回溯玉佛照片（无血文物证）'],
      }),
    ];
    expect(inspectOutlineQuality(outline).some(issue => issue.kind === 'unbalanced-paren')).toBe(
      false
    );
  });

  it('括号跨事件拆分：单条未闭合但 block 合并配平，报跨事件拆分', () => {
    // 复刻 REAL AI smoke twist 模块的真实 case：一个括号被拆到两条事件
    const outline = makeDirtyOutline();
    outline.startupPack30.chapterBlocks = [
      makeBlock({
        mustEvents: [
          '陈默在古战场边缘发现时间循环的肉眼可见效果（场景重复',
          '人物卡帧）',
        ],
      }),
    ];
    const issues = inspectOutlineQuality(outline).filter(i => i.kind === 'unbalanced-paren');
    // 两条事件都未配对，各报一条
    expect(issues.length).toBe(2);
    // 文案含"跨事件拆分"，修正 prompt 据此给出针对性指令
    expect(issues.every(i => i.detail.includes('跨事件拆分'))).toBe(true);
  });

  it('括号真漏：单条未闭合且 block 合并仍不配平，报未配对（非跨事件）', () => {
    const outline = makeDirtyOutline();
    outline.startupPack30.chapterBlocks = [
      makeBlock({
        mustEvents: ['发现效果（场景重复', '人物卡帧'],
      }),
    ];
    const issues = inspectOutlineQuality(outline).filter(i => i.kind === 'unbalanced-paren');
    expect(issues.length).toBe(1);
    // 文案不含"跨事件拆分"（合并后开1闭0仍不配平）
    expect(issues[0].detail.includes('跨事件拆分')).toBe(false);
  });

  it('开篇钩子为空或超过 35 字命中 opening-hook', () => {
    const outline = makeDirtyOutline();
    outline.startupPack30.openingHook = '钩'.repeat(50);
    expect(
      inspectOutlineQuality(outline).some(issue => issue.kind === 'opening-hook')
    ).toBe(true);

    outline.startupPack30.openingHook = '';
    expect(
      inspectOutlineQuality(outline).some(issue => issue.kind === 'opening-hook')
    ).toBe(true);

    // 纯空白串（reporter 先 trim，按“为空”更严格口径命中）
    outline.startupPack30.openingHook = '   ';
    expect(
      inspectOutlineQuality(outline).some(issue => issue.kind === 'opening-hook')
    ).toBe(true);
  });

  it('开篇钩子合规不误报', () => {
    const outline = makeDirtyOutline();
    outline.startupPack30.openingHook = '主角在教室醒来';
    expect(inspectOutlineQuality(outline).some(issue => issue.kind === 'opening-hook')).toBe(false);
  });

  it('开篇钩子 35 字边界：35 不报、36 报', () => {
    const outline = makeDirtyOutline();
    outline.startupPack30.openingHook = '钩'.repeat(35);
    expect(inspectOutlineQuality(outline).some(issue => issue.kind === 'opening-hook')).toBe(false);

    outline.startupPack30.openingHook = '钩'.repeat(36);
    expect(inspectOutlineQuality(outline).some(issue => issue.kind === 'opening-hook')).toBe(true);
  });

  it('startupPack30 缺失不崩溃', () => {
    const outline = makeDirtyOutline();
    outline.startupPack30 = undefined as never;
    // 不抛异常；开篇钩子按“为空”报（可选链兜底），其余规则照常运行
    const issues = inspectOutlineQuality(outline);
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.some(issue => issue.kind === 'opening-hook')).toBe(true);
  });

  it('干净大纲零问题', () => {
    expect(inspectOutlineQuality(makeCleanOutline())).toEqual([]);
  });

  it('空大纲不崩溃', () => {
    expect(inspectOutlineQuality(null as unknown as ExecutableOutline)).toEqual([]);
  });

  // ---------- over-scoped-mustcover（缺陷修复） ----------
  // 真实回归：smoke:storyflow:real 实测——AI 把卷级 objective「完成临水县从空壳穷县到模范县的逆转」
  // 写进单章 mustCover，下游 chapter-judge 持续判未履约 → 持久错误重试耗尽 → 死循环。
  it('chapterBlueprints 单章 mustCover 含整卷/全书级跨章目标命中 over-scoped-mustcover', () => {
    const outline = makeCleanOutline();
    outline.chapterBlueprints = [
      {
        orderIndex: 1,
        title: '一睁眼官帽盖脸',
        summary: 'CBN',
        CBN: '沈知行醒来',
        CPNs: ['醒来'],
        CEN: '门外差役高喊',
        mustCover: [
          '醒来并承认自己成了临水县新任知县',
          '完成临水县从空壳穷县到模范县的逆转', // 整卷目标，应命中
        ],
        forbiddenZones: [],
        hookType: 'reveal',
      },
    ];
    const issues = inspectOutlineQuality(outline);
    const overScoped = issues.filter(i => i.kind === 'over-scoped-mustcover');
    expect(overScoped.length).toBe(1);
    expect(overScoped[0].chapterOrder).toBe(1);
    expect(overScoped[0].detail).toContain('完成临水县从空壳穷县到模范县的逆转');
  });

  it('chapterBlueprints mustCover 全是单章节点时不误报 over-scoped-mustcover', () => {
    const outline = makeCleanOutline();
    outline.chapterBlueprints = [
      {
        orderIndex: 1,
        title: '开局',
        summary: 'CBN',
        CBN: '沈知行醒来',
        CPNs: ['醒来'],
        CEN: '差役高喊',
        mustCover: ['醒来验尸', '当众指认', '翻案打脸'], // 全是单章节奏点
        forbiddenZones: [],
        hookType: 'reveal',
      },
    ];
    const issues = inspectOutlineQuality(outline);
    expect(issues.some(i => i.kind === 'over-scoped-mustcover')).toBe(false);
  });

  it('多章命中 over-scoped-mustcover 时整批最多报 3 条（避免修正 prompt 过长）', () => {
    const outline = makeCleanOutline();
    outline.chapterBlueprints = Array.from({ length: 5 }, (_, i) => ({
      orderIndex: i + 1,
      title: `第${i + 1}章`,
      summary: 'CBN',
      CBN: 'CBN',
      CPNs: [],
      CEN: 'CEN',
      mustCover: ['完成家族复兴'], // 每章都命中
      forbiddenZones: [],
      hookType: 'reveal',
    }));
    const issues = inspectOutlineQuality(outline);
    expect(issues.filter(i => i.kind === 'over-scoped-mustcover').length).toBe(3);
  });
});

describe('parseChapterRange', () => {
  it('解析 "1-5章" / "11~15章"', () => {
    expect(parseChapterRange('1-5章')).toEqual({ start: 1, end: 5 });
    expect(parseChapterRange('11~15章')).toEqual({ start: 11, end: 15 });
  });

  it('非法区间返回 null', () => {
    expect(parseChapterRange('第1章')).toBeNull();
    expect(parseChapterRange('')).toBeNull();
  });
});

describe('reviewAndFixOutline', () => {
  it('初稿无法解析：跳过修正', async () => {
    parseExpandedOutlineMock.mockReturnValue(null);
    const result = await reviewAndFixOutline({
      initialRawText: '不是合法大纲',
      direction: DIRECTION,
      callStructuredTextMode: vi.fn(),
    });
    expect(result.applied).toBe(false);
    expect(result.rawText).toBe('不是合法大纲');
    expect(result.warnings.join('')).toContain('跳过');
  });

  it('初稿零问题：不发修正请求', async () => {
    parseExpandedOutlineMock.mockReturnValue(makeCleanOutline());
    const call = vi.fn();
    const result = await reviewAndFixOutline({
      initialRawText: '干净稿',
      direction: DIRECTION,
      callStructuredTextMode: call,
    });
    expect(call).not.toHaveBeenCalled();
    expect(result.applied).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it('修正稿改善：采用修正稿', async () => {
    // 第 1 次解析 = 初稿（劣化）；第 2 次解析 = 修正稿（干净）
    parseExpandedOutlineMock
      .mockReturnValueOnce(makeDirtyOutline())
      .mockReturnValueOnce(makeCleanOutline());
    const fixedRaw = '修正后的完整大纲';
    const result = await reviewAndFixOutline({
      initialRawText: '初稿',
      direction: DIRECTION,
      callStructuredTextMode: vi.fn().mockResolvedValue(fixedRaw),
    });
    expect(result.applied).toBe(true);
    expect(result.rawText).toBe(fixedRaw);
    expect(result.warnings.join('')).toContain('修复');
  });

  it('修正稿未改善：回退初稿', async () => {
    parseExpandedOutlineMock
      .mockReturnValueOnce(makeDirtyOutline())
      .mockReturnValueOnce(makeDirtyOutline()); // 修正稿同样劣化
    const result = await reviewAndFixOutline({
      initialRawText: '初稿',
      direction: DIRECTION,
      callStructuredTextMode: vi.fn().mockResolvedValue('没修好'),
    });
    expect(result.applied).toBe(false);
    expect(result.rawText).toBe('初稿');
    expect(result.warnings.join('')).toContain('未提升');
  });

  it('修正稿解析失败：回退初稿', async () => {
    parseExpandedOutlineMock.mockReturnValueOnce(makeDirtyOutline()).mockReturnValueOnce(null);
    const result = await reviewAndFixOutline({
      initialRawText: '初稿',
      direction: DIRECTION,
      callStructuredTextMode: vi.fn().mockResolvedValue('无法解析的修正稿'),
    });
    expect(result.applied).toBe(false);
    expect(result.rawText).toBe('初稿');
  });

  it('修正请求异常：回退初稿并给 warning', async () => {
    parseExpandedOutlineMock.mockReturnValue(makeDirtyOutline());
    const result = await reviewAndFixOutline({
      initialRawText: '初稿',
      direction: DIRECTION,
      callStructuredTextMode: vi.fn().mockRejectedValue(new Error('网络错误')),
    });
    expect(result.applied).toBe(false);
    expect(result.rawText).toBe('初稿');
    expect(result.warnings.join('')).toContain('回退');
  });

  it('修正请求被 abort：向上抛（不吞取消）', async () => {
    parseExpandedOutlineMock.mockReturnValue(makeDirtyOutline());
    await expect(
      reviewAndFixOutline({
        initialRawText: '初稿',
        direction: DIRECTION,
        callStructuredTextMode: vi
          .fn()
          .mockRejectedValue(new DOMException('Aborted', 'AbortError')),
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

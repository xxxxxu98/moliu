import { describe, expect, it } from 'vitest';

import type { PlotNode, Project } from '@/types/project';

import {
  BlueprintRepairLedger,
  applyBlueprintToPlotNode,
  blueprintToChapterUpdate,
  inspectChapterBlueprintDefects,
  inspectBlueprintObjectDefects,
  isFulfillmentDomainFailure,
  regenerateChapterBlueprint,
} from '../chapter-blueprint-regenerator';
import { parseBlueprintBlocks } from '../outline-roller';

function makeChapterNode(orderIndex: number, overrides: Partial<PlotNode> = {}): PlotNode {
  return {
    id: `plot-ch${orderIndex}`,
    title: `第${orderIndex + 1}章`,
    type: 'chapter',
    orderIndex,
    CBN: '三更灯下账页缺角见血印',
    CPNs: ['比对旧账发现缺口', '主簿带人围库房'],
    CEN: '主簿身后闪出禁军影子',
    mustCover: ['查清军资缺口', '逼退巡夜主簿'],
    ...overrides,
  };
}

describe('inspectChapterBlueprintDefects', () => {
  it('跨章目标 mustCover 判 over-scoped-mustcover', () => {
    const node = makeChapterNode(50, {
      mustCover: ['完成从查账到定罪的全流程'],
    });
    expect(inspectChapterBlueprintDefects(node)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'over-scoped-mustcover' }),
      ])
    );
  });

  it('承接模板 CBN 与空壳 CEN 分别判 template-cbn / hollow-cen', () => {
    const node = makeChapterNode(51, {
      CBN: '承接上章结尾：主簿身后闪出禁军影子',
      CEN: '推进至：比对旧账发现缺口',
    });
    const defects = inspectChapterBlueprintDefects(node);
    expect(defects.some(defect => defect.kind === 'template-cbn')).toBe(true);
    expect(defects.some(defect => defect.kind === 'hollow-cen')).toBe(true);
  });

  it('健康蓝图无缺陷', () => {
    expect(inspectChapterBlueprintDefects(makeChapterNode(52))).toEqual([]);
  });
});

describe('applyBlueprintToPlotNode', () => {
  it('按章号回写合同字段，保留 id/orderIndex/chapterId', () => {
    const node = makeChapterNode(2, { id: 'plot-fixed' });
    (node as PlotNode & { chapterId?: string }).chapterId = 'chapter-3';
    const nodes = [makeChapterNode(0), makeChapterNode(1), node];
    const raw = `### 第3章
- 标题：再生后的新章题
- 概要：再生后的概要内容足够长以供校验。
- CBN：再生蓝图的新开篇动作
- CPNs：新推进节点一；新推进节点二
- CEN：再生后的章尾悬念
- mustCover：新事件一；新事件二`;
    const blueprint = parseBlueprintBlocks(raw, [3]).get(3)!;
    const updated = applyBlueprintToPlotNode(nodes, 3, blueprint);
    expect(updated).toBeDefined();
    expect(updated!.id).toBe('plot-fixed');
    expect((updated as PlotNode & { chapterId?: string }).chapterId).toBe('chapter-3');
    expect(updated!.CBN).toContain('新开篇');
    expect(updated!.mustCover).toHaveLength(2);
  });

  it('章号越界返回 undefined 不抛错', () => {
    expect(applyBlueprintToPlotNode([makeChapterNode(0)], 5, {} as never)).toBeUndefined();
  });
});

describe('BlueprintRepairLedger', () => {
  it('连续失败达阈值触发，预算耗尽后不再触发', () => {
    const ledger = new BlueprintRepairLedger();
    expect(ledger.shouldTrigger('ch-1')).toBe(false);
    ledger.recordFailure('ch-1'); // 1 次
    expect(ledger.shouldTrigger('ch-1')).toBe(false);
    ledger.recordFailure('ch-1'); // 2 次 → 达阈值
    expect(ledger.shouldTrigger('ch-1')).toBe(true);
    ledger.markRegenerated('ch-1'); // 预算(1)耗尽，失败计数清零
    expect(ledger.shouldTrigger('ch-1')).toBe(false);
    ledger.recordFailure('ch-1');
    ledger.recordFailure('ch-1');
    expect(ledger.shouldTrigger('ch-1')).toBe(false); // 再生预算用尽
  });

  it('resetChapter 成功后清零失败计数（跨章不误触发）', () => {
    const ledger = new BlueprintRepairLedger();
    ledger.recordFailure('ch-1');
    ledger.resetChapter('ch-1');
    ledger.recordFailure('ch-1');
    expect(ledger.shouldTrigger('ch-1')).toBe(false);
  });
});

describe('isFulfillmentDomainFailure', () => {
  it('履约类消息命中，网络/超时类不归因蓝图', () => {
    expect(isFulfillmentDomainFailure('未履约节点：查清军资缺口')).toBe(true);
    expect(isFulfillmentDomainFailure('语义问题[fulfillment] 第2段 未兑现 查清缺口')).toBe(true);
    expect(isFulfillmentDomainFailure('network error: fetch failed')).toBe(false);
    expect(isFulfillmentDomainFailure('AI 流式响应提前中断：已收到 17876 字')).toBe(false);
    expect(isFulfillmentDomainFailure(undefined)).toBe(false);
  });

  it('命运禁区/fact_conflict 拒稿归因蓝图（2026-09-13 r4 ch187 齐王受害样本）', () => {
    // 过期蓝图节点要求已下狱角色自由出场：写作端两头违约，纯重试修不好，
    // 必须走蓝图再生（再生提示词带命运锁，改走【解除】或移除该角色）
    expect(isFulfillmentDomainFailure('严格门禁未通过：正文触发本章禁区')).toBe(true);
    expect(
      isFulfillmentDomainFailure(
        '触发本章禁区：齐王已于第136章下狱（证据：着即革除齐王爵位），本章禁止其以在场活人身份出场'
      )
    ).toBe(true);
    expect(
      isFulfillmentDomainFailure(
        '语义问题[fact_conflict] 状态摘要中齐王处于【下狱】状态，本章未交代越狱过程'
      )
    ).toBe(true);
  });
});

describe('inspectBlueprintObjectDefects（再生产物复检核）', () => {
  it('残缺稿判 empty-fields：mustCover 为空', () => {
    const defects = inspectBlueprintObjectDefects({
      orderIndex: 3,
      title: '再生标题',
      summary: '概要',
      CBN: '三更灯下账页缺角',
      CPNs: ['推进节点一'],
      CEN: '章尾悬念钩子',
      mustCover: [],
    });
    expect(defects.some(defect => defect.kind === 'empty-fields')).toBe(true);
  });

  it('健康稿零缺陷', () => {
    const defects = inspectBlueprintObjectDefects({
      orderIndex: 4,
      title: '夜审账本惊变',
      summary: '概要足够长以供校验之用。',
      CBN: '三更灯下账页缺角见血印',
      CPNs: ['比对旧账发现缺口'],
      CEN: '主簿身后闪出禁军影子',
      mustCover: ['查清军资缺口'],
    });
    expect(defects).toEqual([]);
  });
});

describe('blueprintToChapterUpdate（Chapter 实体同步）', () => {
  it('产出带结构化节点块的 outline 与 CBN/CEN 摘要 plotSummary', () => {
    const raw = `### 第5章
- 标题：再生后的新章题
- 概要：再生后的概要内容足够长。
- CBN：再生蓝图的新开篇动作
- CPNs：新推进节点一；新推进节点二
- CEN：再生后的章尾悬念
- mustCover：新事件一；新事件二
- 禁区：不得揭示新蓝图的底牌`;
    const blueprint = parseBlueprintBlocks(raw, [5]).get(5)!;
    const update = blueprintToChapterUpdate(blueprint);
    expect(update.outline).toContain('【CBN】再生蓝图的新开篇动作');
    expect(update.outline).toContain('【必须覆盖】新事件一、新事件二');
    expect(update.outline).toContain('【禁区】不得揭示新蓝图的底牌');
    expect(update.plotSummary).toBe('CBN: 再生蓝图的新开篇动作\nCEN: 再生后的章尾悬念');
  });
});

describe('regenerateChapterBlueprint 复检门禁', () => {
  const makeProject = (nodes: PlotNode[]): Project =>
    ({
      id: 'proj-regen',
      name: '测试书',
      plotOutline: nodes,
      chapters: [],
      characters: [],
      foreshadows: [],
      metadata: {},
    }) as unknown as Project;

  const healthyRaw = `### 第2章
- 标题：再生产物健康稿
- 概要：再生后的概要内容足够长以通过校验。
- CBN：再生的独立新开篇画面
- CPNs：再生节点一；再生节点二
- CEN：再生后的章尾悬念钩子
- mustCover：再生事件一；再生事件二`;

  // 解析可过但内容退化：mustCover 是跨章目标（over-scoped）——原稿健康，
  // 再生稿引入原稿没有的新缺陷类别 → 复检必须拒绝
  const degradedRaw = `### 第2章
- 标题：退化的再生稿
- 概要：再生后的概要内容足够长以通过。
- CBN：再生的独立新开篇画面
- CPNs：再生节点一；再生节点二
- CEN：再生后的章尾悬念钩子
- mustCover：完成从查账到定罪的全流程`;

  it('健康再生产物正常返回', async () => {
    const result = await regenerateChapterBlueprint({
      project: makeProject([makeChapterNode(0), makeChapterNode(1)]),
      chapterNumber: 2,
      callStructuredText: async () => healthyRaw,
    });
    expect(result.blueprint).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it('带新缺陷的再生产物被复检拒绝且不返回蓝图', async () => {
    const original = makeChapterNode(1); // 原稿健康（0 缺陷）
    const result = await regenerateChapterBlueprint({
      project: makeProject([makeChapterNode(0), original]),
      chapterNumber: 2,
      callStructuredText: async () => degradedRaw,
    });
    expect(result.blueprint).toBeUndefined();
    expect(result.error).toContain('复检未通过');
    expect(result.error).toContain('over-scoped-mustcover');
  });

  it('解析层就残缺的响应按原有错误路径拒绝', async () => {
    const result = await regenerateChapterBlueprint({
      project: makeProject([makeChapterNode(0), makeChapterNode(1)]),
      chapterNumber: 2,
      callStructuredText: async () => '完全不是蓝图格式的回复',
    });
    expect(result.blueprint).toBeUndefined();
    expect(result.error).toContain('无法解析出本章内容');
  });

  it('目标章无 plot 节点时明确报错', async () => {
    const result = await regenerateChapterBlueprint({
      project: makeProject([]),
      chapterNumber: 3,
      callStructuredText: async () => healthyRaw,
    });
    expect(result.blueprint).toBeUndefined();
    expect(result.error).toContain('没有 plot 节点');
  });
});

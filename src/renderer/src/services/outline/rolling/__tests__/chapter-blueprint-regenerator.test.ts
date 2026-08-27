import { describe, expect, it } from 'vitest';

import type { PlotNode } from '@/types/project';

import {
  BlueprintRepairLedger,
  applyBlueprintToPlotNode,
  inspectChapterBlueprintDefects,
  isFulfillmentDomainFailure,
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
    expect(isFulfillmentDomainFailure('严格门禁未通过：正文触发本章禁区')).toBe(false);
    expect(isFulfillmentDomainFailure(undefined)).toBe(false);
  });
});

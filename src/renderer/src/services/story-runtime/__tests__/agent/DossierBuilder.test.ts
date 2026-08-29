import { describe, expect, it } from 'vitest';

import { DossierBuilder, renderDossier } from '../../agent/DossierBuilder';
import type { ResearchRunSummary } from '@/types/story-runtime';

const stats: ResearchRunSummary = {
  rounds: 3,
  toolCalls: 2,
  byTool: { query_entity: 1, list_foreshadows: 1 },
  ms: 1200,
  finishReason: 'model-finish',
};

describe('DossierBuilder', () => {
  it('同实体后查覆盖前查,sourceRounds 留痕;version 自增', () => {
    const builder = new DossierBuilder();
    builder.recordEntitySnapshot({
      id: 'zhoumao',
      name: '周茂',
      kind: 'character',
      statusLine: 'status=alive',
      sourceRounds: [1],
    });
    const v1 = builder.version();
    builder.recordEntitySnapshot({
      id: 'zhoumao',
      name: '周茂',
      kind: 'character',
      statusLine: 'status=dead;死因=鸩杀',
      sourceRounds: [2],
    });
    const dossier = builder.build(stats);
    expect(dossier.entitySnapshots).toHaveLength(1);
    expect(dossier.entitySnapshots[0]?.statusLine).toBe('status=dead;死因=鸩杀');
    expect(dossier.entitySnapshots[0]?.sourceRounds).toEqual([1, 2]);
    expect(builder.version()).toBeGreaterThan(v1);
  });

  it('gaps 按 topic 去重,coverage 的 gaps 并入', () => {
    const builder = new DossierBuilder();
    builder.recordGaps([{ topic: '遗诏下落', reason: '无命中' }]);
    builder.recordGaps([{ topic: '遗诏下落', reason: '重复' }]);
    builder.recordCoverage({
      castStatesConfirmed: ['林夜'],
      gaps: [{ topic: '哑仆兵器', reason: '未定位' }],
    });
    const dossier = builder.build(stats);
    expect(dossier.gaps.map(gap => gap.topic)).toEqual(['遗诏下落', '哑仆兵器']);
    expect(dossier.coverage?.castStatesConfirmed).toEqual(['林夜']);
  });

  it('时间线/场景引用去重', () => {
    const builder = new DossierBuilder();
    builder.recordTimelineFact('第312章 周茂身死');
    builder.recordTimelineFact('第312章 周茂身死');
    builder.recordSceneRef({ chapter: 312, summary: '鸩杀' });
    builder.recordSceneRef({ chapter: 312, summary: '鸩杀' });
    const dossier = builder.build(stats);
    expect(dossier.timelineFacts).toHaveLength(1);
    expect(dossier.priorSceneRefs).toHaveLength(1);
  });

  it('renderDossier:分节渲染,gaps 永远保留且带不得虚构指令', () => {
    const builder = new DossierBuilder();
    builder.recordEntitySnapshot({
      id: 'zhoumao',
      name: '周茂',
      kind: 'character',
      statusLine: 'status=dead;location=皇陵',
      sourceRounds: [1],
    });
    builder.recordForeshadowCheck({
      id: 'fs-ghost',
      hint: '遗诏下落成谜',
      status: 'buried',
      note: '已到回收时点(第313章)',
    });
    builder.recordGaps([{ topic: '哑仆的兵器下落', reason: 'scene_chunks 无命中' }]);
    const rendered = renderDossier(builder.build(stats));
    expect(rendered).toContain('【检索档案】');
    expect(rendered).toContain('周茂');
    expect(rendered).toContain('fs-ghost');
    expect(rendered).toContain('不得虚构');
    expect(rendered).toContain('哑仆的兵器下落');
  });

  it('renderDossier:超长硬截断', () => {
    const builder = new DossierBuilder();
    for (let index = 0; index < 30; index += 1) {
      builder.recordTimelineFact(`第${300 + index}章 ${'很长的时间线事实'.repeat(8)}`);
    }
    const rendered = renderDossier(builder.build(stats), 500);
    expect(rendered.length).toBeLessThanOrEqual(530);
    expect(rendered).toContain('档案超长截断');
  });
});

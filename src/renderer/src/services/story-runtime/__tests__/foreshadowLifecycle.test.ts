import { describe, it, expect } from 'vitest';
import {
  normalizeForeshadow,
  markForeshadowPlanted,
  isPlanted,
  calculateForeshadowUrgency,
} from '../foreshadowLifecycle';
import type { Foreshadow } from '@/types/project';

function makeForeshadow(overrides: Partial<Foreshadow> = {}): Foreshadow {
  return {
    id: 'fs-1',
    hint: '水库沉尸打捞现场死者脚踝处反向缠绕的麻绳',
    type: 'item',
    status: 'buried',
    createdChapter: 15,
    ...overrides,
  };
}

describe('normalizeForeshadow', () => {
  it('规划章号超出已写章数时退回 planned（不冒充已埋设）', () => {
    const legacy = makeForeshadow({
      status: 'buried',
      createdChapter: 488,
      setupChapter: 488,
    });
    const normalized = normalizeForeshadow(legacy, 100);
    expect(normalized.status).toBe('planned');
    expect(normalized.createdChapter).toBe(488);
    expect(normalized.actualPlantedChapter).toBeUndefined();
  });

  it('埋设章在已写范围内时保持 buried', () => {
    const planted = makeForeshadow({ status: 'buried', createdChapter: 15, setupChapter: 15 });
    expect(normalizeForeshadow(planted, 100).status).toBe('buried');
  });

  it('有 actualPlantedChapter 且在已写范围内时以实际章为准', () => {
    const planted = makeForeshadow({
      status: 'buried',
      createdChapter: 488,
      setupChapter: 488,
      actualPlantedChapter: 90,
    });
    const normalized = normalizeForeshadow(planted, 100);
    expect(normalized.status).toBe('buried');
    expect(normalized.createdChapter).toBe(90);
  });

  it('resolved 伏笔不降级', () => {
    const resolved = makeForeshadow({ status: 'resolved', createdChapter: 488, setupChapter: 488 });
    expect(normalizeForeshadow(resolved, 10).status).toBe('resolved');
  });

  it('无 setupChapter 的旧数据保持原状', () => {
    const legacy = makeForeshadow({ setupChapter: undefined });
    const normalized = normalizeForeshadow(legacy, 100);
    expect(normalized.status).toBe('buried');
    expect(normalized.createdChapter).toBe(15);
  });
});

describe('markForeshadowPlanted', () => {
  it('planned 伏笔确认埋设后转 buried 并回填实际章号', () => {
    const planned = makeForeshadow({ status: 'planned', createdChapter: 488, setupChapter: 488 });
    const planted = markForeshadowPlanted(planned, 95);
    expect(planted.status).toBe('buried');
    expect(planted.actualPlantedChapter).toBe(95);
    expect(planted.createdChapter).toBe(95);
  });

  it('resolved 伏笔不被回退', () => {
    const resolved = makeForeshadow({ status: 'resolved' });
    expect(markForeshadowPlanted(resolved, 95).status).toBe('resolved');
  });
});

describe('isPlanted', () => {
  it('planned 未埋设，其余视为已埋', () => {
    expect(isPlanted(makeForeshadow({ status: 'planned' }))).toBe(false);
    expect(isPlanted(makeForeshadow({ status: 'buried' }))).toBe(true);
    expect(isPlanted(makeForeshadow({ status: 'resolved' }))).toBe(true);
  });
});

describe('calculateForeshadowUrgency', () => {
  it('规划章号失真修复：planned 伏笔不再恒为 critical（旧实现 488/100 进度比）', () => {
    const planned = makeForeshadow({
      status: 'planned',
      createdChapter: 488,
      setupChapter: 488,
      suggestedResolutionChapter: undefined,
    });
    const urgency = calculateForeshadowUrgency(planned, 50, 1500);
    expect(['low', 'medium']).toContain(urgency.level);
    expect(urgency.score).toBeLessThan(50);
  });

  it('已埋设伏笔按实际埋设章计算进度比', () => {
    const planted = makeForeshadow({
      status: 'buried',
      actualPlantedChapter: 1250,
      createdChapter: 1250,
      suggestedResolutionChapter: undefined,
    });
    // 1500 章规划写到 1450 章，埋于 1250 → plantedProgress 0.83 / current 0.97 → critical
    expect(calculateForeshadowUrgency(planted, 1450, 1500).level).toBe('critical');
  });

  it('临近规划埋设点的 planned 伏笔升级提示', () => {
    const approaching = makeForeshadow({
      status: 'planned',
      setupChapter: 53,
      createdChapter: 53,
    });
    expect(calculateForeshadowUrgency(approaching, 51, 1500).level).toBe('low');
    expect(calculateForeshadowUrgency(approaching, 53, 1500).level).toBe('medium');
  });

  it('超期未回收恒为 critical', () => {
    const overdue = makeForeshadow({
      status: 'buried',
      createdChapter: 10,
      suggestedResolutionChapter: 40,
    });
    expect(calculateForeshadowUrgency(overdue, 55, 100).level).toBe('critical');
  });

  it('无 plannedChapterCount 时兜底 100', () => {
    const normal = makeForeshadow({ status: 'buried', createdChapter: 10 });
    const urgency = calculateForeshadowUrgency(normal, 50);
    expect(urgency.score).toBeGreaterThan(0);
  });
});

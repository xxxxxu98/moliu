/**
 * ProjectionOrchestrator 测试
 *
 * 实际 API 仅有 runAll / getStatus / isAllSuccess；此前的用例调用的是
 * getStatusMap、runState 等并不存在的方法，故整体按真实接口重写。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChapterMetadata } from '../ProjectionWriters';
import type { ExtractionResult } from '@/types/writing-v2';

/** 各 Writer 在构造时即取 store，mock 需在实例化前就位 */
const store = {
  sortedChapters: [{ id: 'ch-1', orderIndex: 0, wordCount: 1000 }],
  sortedVolumes: [{ id: 'vol-1', orderIndex: 0 }],
  characters: [] as Array<{ id: string; name: string; profile?: Record<string, unknown> }>,
  chapterMemories: [] as Array<{ chapterId: string; summary: string; corePlot: string }>,
  currentProject: { id: 'proj-1' } as { id: string } | null,
  updateChapter: vi.fn(async () => {}),
  updateCharacter: vi.fn(async () => {}),
  updateProjectInfo: vi.fn(async () => {}),
  updateVolume: vi.fn(async () => {}),
  addChapterMemory: vi.fn(() => {}),
  saveCurrentProject: vi.fn(async () => {}),
  updateCharacterArc: vi.fn(() => {}),
  updatePlotThread: vi.fn(() => {}),
};

vi.mock('@/stores/project.store', () => ({
  useProjectStore: () => store,
}));

import { ProjectionOrchestrator } from '../ProjectionWriters';

const extraction: ExtractionResult = {
  acceptedEvents: [],
  stateDeltas: [],
  entityDeltas: [],
  entitiesAppeared: [],
  scenes: [{ location: '县衙', time: '午时', participants: ['沈确'] }],
  summaryText: '沈确当堂拒绝画押',
};

const metadata: ChapterMetadata = {
  title: '第1章',
  wordCount: 1000,
  status: 'draft',
  coolPoints: 0,
  foreshadows: 0,
};

function runAll(orchestrator: ProjectionOrchestrator, override: Partial<ExtractionResult> = {}) {
  return orchestrator.runAll(1, {
    extraction: { ...extraction, ...override },
    disambiguation: { pending: [], resolved: [] },
    metadata,
  });
}

describe('ProjectionOrchestrator', () => {
  let orchestrator: ProjectionOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    store.addChapterMemory.mockImplementation(() => {});
    orchestrator = new ProjectionOrchestrator();
  });

  it('runAll 返回五路投影状态，全部成功时关键四路为 done', async () => {
    const status = await runAll(orchestrator);

    expect(status).toEqual({
      state: 'done',
      index: 'done',
      summary: 'done',
      memory: 'done',
      vector: 'done',
    });
    expect(store.updateChapter).toHaveBeenCalled();
    expect(store.addChapterMemory).toHaveBeenCalled();
  });

  it('getStatus 返回最近一次 runAll 的结果快照', async () => {
    expect(orchestrator.getStatus()).toEqual({
      state: 'pending',
      index: 'pending',
      summary: 'pending',
      memory: 'pending',
      vector: 'pending',
    });

    await runAll(orchestrator);

    expect(orchestrator.getStatus().state).toBe('done');
    // 返回的是快照，外部改动不应污染内部状态
    const snapshot = orchestrator.getStatus();
    snapshot.state = 'failed';
    expect(orchestrator.getStatus().state).toBe('done');
  });

  it('单路投影抛错只标记该路 failed，不阻断其余投影', async () => {
    store.addChapterMemory.mockImplementation(() => {
      throw new Error('记忆写入失败');
    });

    const status = await runAll(orchestrator);

    expect(status.memory).toBe('failed');
    expect(status.state).toBe('done');
    expect(status.index).toBe('done');
    expect(status.summary).toBe('done');
    expect(orchestrator.isAllSuccess()).toBe(false);
  });

  it('isAllSuccess 只看状态/索引/摘要/记忆四路，全成功时为真', async () => {
    await runAll(orchestrator);
    expect(orchestrator.isAllSuccess()).toBe(true);
  });

  it('再次 runAll 会重置上一轮的失败状态', async () => {
    store.addChapterMemory.mockImplementation(() => {
      throw new Error('记忆写入失败');
    });
    expect((await runAll(orchestrator)).memory).toBe('failed');

    store.addChapterMemory.mockImplementation(() => {});
    expect((await runAll(orchestrator)).memory).toBe('done');
  });
});

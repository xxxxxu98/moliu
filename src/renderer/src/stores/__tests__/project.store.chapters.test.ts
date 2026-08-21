/**
 * createChapter 章号口径回归。
 *
 * 真实事故：批量续写跨卷建章时占位标题用卷内计数——卷一 70 章后在卷二建
 * 全书第 99 章，目录短暂显示「第29章」（99 - 70 = 29），正文落库被真实
 * 标题覆盖后又变回「第99章」。占位标题和 orderIndex 都必须全书连续。
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Chapter, Project } from '@/types/project';

import { useProjectStore } from '../project.store';

function installProjectApi(): { get: (id: string) => Project | undefined } {
  const store = new Map<string, Project>();
  const clone = (project: Project): Project =>
    JSON.parse(JSON.stringify(project)) as Project;

  (window as unknown as { electronAPI: unknown }).electronAPI = {
    getProject: async (id: string): Promise<Project | null> => {
      const project = store.get(id);
      return project ? clone(project) : null;
    },
    saveProject: async (project: Project): Promise<void> => {
      store.set(project.id, clone(project));
    },
  };

  return { get: id => store.get(id) };
}

function makeChapter(overrides: Partial<Chapter>): Chapter {
  return {
    id: `chapter-${overrides.orderIndex ?? 0}`,
    title: `第${(overrides.orderIndex ?? 0) + 1}章`,
    content: '正文',
    wordCount: 2,
    version: 1,
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    writeStatus: 'success',
    ...overrides,
  };
}

describe('createChapter 章号口径', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    installProjectApi();
  });

  it('跨卷新章占位标题用全书章号，不用卷内计数', async () => {
    const store = useProjectStore();
    store.setCurrentProject({
      id: 'proj-1',
      name: '多卷项目',
      volumes: [
        { id: 'vol-1', name: '第一卷', orderIndex: 0 },
        { id: 'vol-2', name: '第二卷', orderIndex: 1 },
      ],
      chapters: Array.from({ length: 70 }, (_, i) =>
        makeChapter({ orderIndex: i, volumeId: 'vol-1' }),
      ),
    } as unknown as Project);

    const newChapter = await store.createChapter('vol-2');

    // 卷二当前 0 章；全书第 71 章占位标题必须是「第71章」而非「第1章」
    expect(newChapter?.title).toBe('第71章');
    expect(newChapter?.orderIndex).toBe(70);
  });

  it('显式传入 globalOrderIndex 时占位标题与之一致', async () => {
    const store = useProjectStore();
    store.setCurrentProject({
      id: 'proj-1',
      name: '多卷项目',
      volumes: [
        { id: 'vol-1', name: '第一卷', orderIndex: 0 },
        { id: 'vol-2', name: '第二卷', orderIndex: 1 },
      ],
      // 既有 70 章：卷一 1-40、卷二 41-70
      chapters: [
        ...Array.from({ length: 40 }, (_, i) =>
          makeChapter({ orderIndex: i, volumeId: 'vol-1' }),
        ),
        ...Array.from({ length: 30 }, (_, i) =>
          makeChapter({ orderIndex: 40 + i, volumeId: 'vol-2' }),
        ),
      ],
    } as unknown as Project);

    // 批量续写滚动建章路径：全书第 99 章挂卷二
    const newChapter = await store.createChapter('vol-2', {
      globalOrderIndex: 98,
    });

    // 旧实现：卷内 30 章 → 占位标题「第31章」；正确：全书第 99 章
    expect(newChapter?.title).toBe('第99章');
    expect(newChapter?.orderIndex).toBe(98);
  });

  it('未传 globalOrderIndex 的单卷追加保持全书连续章号', async () => {
    const store = useProjectStore();
    store.setCurrentProject({
      id: 'proj-1',
      name: '单卷项目',
      volumes: [{ id: 'vol-1', name: '第一卷', orderIndex: 0 }],
      chapters: [
        makeChapter({ orderIndex: 0, volumeId: 'vol-1' }),
        makeChapter({ orderIndex: 1, volumeId: 'vol-1' }),
      ],
    } as unknown as Project);

    const newChapter = await store.createChapter('vol-1');

    expect(newChapter?.title).toBe('第3章');
    expect(newChapter?.orderIndex).toBe(2);
  });
});

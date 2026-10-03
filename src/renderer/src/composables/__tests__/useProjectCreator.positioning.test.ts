/**
 * 应用大纲后，大纲定位（题材/文风/读者/情绪）必须真正落库。
 *
 * 回归背景：buildProjectMetadata 一直算出了 outlinePositioning，但 createProject 组装
 * newMetadata 时漏搬该字段，落库结果里静默丢失；而既有自测只校验平行实现
 * buildLongformPersistPayload，覆盖不到生产路径，故长期未被发现。
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GeneratedOutline } from '@/types/inspiration';
import type { Project } from '@/types/project';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { useProjectCreator } from '../useProjectCreator';

/** 内存版 electronAPI：仅保留项目增删改查，语义对齐主进程的 metadata 浅合并 */
function installProjectApi(): { get: (id: string) => Project | undefined } {
  const store = new Map<string, Project>();
  const clone = (project: Project): Project => JSON.parse(JSON.stringify(project)) as Project;

  (window as unknown as { electronAPI: unknown }).electronAPI = {
    createProject: async (data: Project): Promise<Project> => {
      store.set(data.id, clone(data));
      return clone(data);
    },
    updateProject: async (id: string, updates: Partial<Project>): Promise<Project | null> => {
      const current = store.get(id);
      if (!current) return null;
      const merged: Project = {
        ...current,
        ...updates,
        metadata: { ...(current.metadata ?? {}), ...(updates.metadata ?? {}) },
      };
      store.set(id, clone(merged));
      return clone(merged);
    },
    getProject: async (id: string): Promise<Project | null> => {
      const project = store.get(id);
      return project ? clone(project) : null;
    },
    saveProject: async (project: Project): Promise<void> => {
      store.set(project.id, clone(project));
    },
    listProjects: async (): Promise<Project[]> => [...store.values()].map(clone),
  };

  return { get: id => store.get(id) };
}

function makeOutline(overrides: Partial<GeneratedOutline> = {}): GeneratedOutline {
  return {
    title: '青囊令',
    synopsis: '医官之子卷入宫廷药案',
    genres: ['古代权谋'],
    styleKeywords: ['冷峻', '快节奏'],
    targetReaders: ['男频权谋读者'],
    coreEmotions: ['憋屈后爽'],
    chapters: [],
    ...overrides,
  } as GeneratedOutline;
}

describe('useProjectCreator.createProject - 大纲定位落库', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('把 outlinePositioning 写进落库 metadata，续写端才拿得到定位约束', async () => {
    const projects = installProjectApi();

    const projectId = await useProjectCreator().createProject(makeOutline(), {});

    expect(projectId).toBeTruthy();
    expect(projects.get(projectId!)?.metadata?.outlinePositioning).toEqual({
      genres: ['古代权谋'],
      styleKeywords: ['冷峻', '快节奏'],
      targetReaders: ['男频权谋读者'],
      coreEmotions: ['憋屈后爽'],
      // 冷峻/快节奏无硬核或小白信号 → balanced；有 styleKeywords 信号所以持久化
      vocabularyTier: 'balanced',
    });
  });

  it('定位含硬核信号时词汇档位推导为 hardcore 落库', async () => {
    const projects = installProjectApi();

    const projectId = await useProjectCreator().createProject(
      makeOutline({ styleKeywords: ['冷峻', '硬核', '严密推演'] }),
      {},
    );

    expect(projectId).toBeTruthy();
    expect(projects.get(projectId!)?.metadata?.outlinePositioning?.vocabularyTier).toBe(
      'hardcore'
    );
  });

  it('定位四项全空时不写入空壳，避免落库噪声字段', async () => {
    const projects = installProjectApi();

    const projectId = await useProjectCreator().createProject(
      makeOutline({
        genres: [],
        styleKeywords: [],
        targetReaders: [],
        coreEmotions: [],
        startupPack: { openingHook: '铃响了' },
      } as Partial<GeneratedOutline>),
      {},
    );

    expect(projectId).toBeTruthy();
    expect(projects.get(projectId!)?.metadata?.outlinePositioning).toBeUndefined();
  });
});

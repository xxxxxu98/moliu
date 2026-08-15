/**
 * 应用大纲必须连章节实体一起建出来。
 *
 * 回归背景：首页四个入口（QuickStart/ProOutliner/InspirationPanel/TopicDiscoveryBoard）
 * 只调 createProject，而建章逻辑当时只挂在编辑器内的 WritingSetupWizard 上，导致应用大纲后
 * chapters 表为空、plotOutline 章节节点的 chapterId 全空，编辑器里没有任何可写章节。
 * 另一处：建章只读 chapter.outline，而大纲链路的 GeneratedChapter 用 summary 装章纲，
 * 两个同名类型靠 as unknown 互转，章纲描述会静默丢成空串。
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GeneratedOutline } from '@/types/inspiration';
import type { Project } from '@/types/project';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { useProjectCreator } from '../useProjectCreator';

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

function makeOutline(): GeneratedOutline {
  return {
    title: '青囊令',
    synopsis: '医官之子卷入宫廷药案',
    genres: ['古代权谋'],
    styleKeywords: ['冷峻'],
    targetReaders: ['男频权谋读者'],
    coreEmotions: ['憋屈后爽'],
    chapters: [
      {
        title: '醒来就被灌毒酒',
        summary: '穿越初醒即被按住灌药，靠药理知识当众反将一军。',
        number: 1,
        CBN: '毒酒灌进喉咙',
        CPNs: ['当众指认砒霜'],
        CEN: '白公公轻声道：陛下您醒了',
        mustCover: ['逼灌药者当场喝下'],
      },
      {
        title: '汤里还有一口毒',
        summary: '安神汤气味异常，野猫验毒确认杀局未止。',
        number: 2,
        CBN: '安神汤还冒着热气',
        CPNs: ['野猫舔汤倒地'],
        CEN: '铜牌背面烙着慈宁宫',
      },
    ],
  } as unknown as GeneratedOutline;
}

describe('useProjectCreator.createProject - 应用大纲同时建章', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('建出章节实体并把 chapterId 回填到 plotOutline 章节节点', async () => {
    const projects = installProjectApi();

    const projectId = await useProjectCreator().createProject(makeOutline(), {});
    const persisted = projects.get(projectId!);

    expect(persisted?.chapters).toHaveLength(2);
    // 建章落库标题带序号「第N章 短标题」，与续写回写口径一致
    expect(persisted?.chapters?.map(chapter => chapter.title)).toEqual([
      '第1章 醒来就被灌毒酒',
      '第2章 汤里还有一口毒',
    ]);

    // createChapter 用 `chapter-${Date.now()}` 生成 id，同毫秒批量建章会撞 id，
    // 后续 updateChapter 按 id findIndex 会改到同一条上。
    const chapterIds = (persisted?.chapters ?? []).map(chapter => chapter.id);
    expect(new Set(chapterIds).size).toBe(chapterIds.length);

    const chapterNodes = (persisted?.plotOutline ?? []).filter(node => node.type === 'chapter');
    expect(chapterNodes).toHaveLength(2);
    expect(chapterNodes.every(node => Boolean(node.chapterId))).toBe(true);
  });

  it('章纲描述（summary）必须写进 chapter.outline，不能只剩结构化节点块', async () => {
    const projects = installProjectApi();

    const projectId = await useProjectCreator().createProject(makeOutline(), {});
    const firstChapter = projects.get(projectId!)?.chapters?.[0];
    const descriptive = (firstChapter?.outline ?? '').split('--- 结构化节点 ---')[0].trim();

    expect(descriptive).toBe('穿越初醒即被按住灌药，靠药理知识当众反将一军。');
    expect(firstChapter?.outline).toContain('【CBN】毒酒灌进喉咙');
  });
});

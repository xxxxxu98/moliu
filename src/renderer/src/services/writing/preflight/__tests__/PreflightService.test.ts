/**
 * PreflightService 测试
 *
 * 实际 preflight() 返回 { valid, errors, warnings, contracts, projectInfo }；
 * 此前的用例断言的是 ready/checks/timestamp 以及 getStatusDescription 等并不存在的
 * 方法，故整体按真实接口重写。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Chapter, Project, Volume } from '@/types/project';

const store = {
  currentProject: null as Project | null,
  currentChapter: null as Chapter | null,
  chapters: [] as Chapter[],
  sortedChapters: [] as Chapter[],
  volumes: [] as Volume[],
};

vi.mock('@/stores/project.store', () => ({
  useProjectStore: () => store,
}));

import { PreflightService } from '../PreflightService';

function makeChapter(orderIndex: number, overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: `ch-${orderIndex + 1}`,
    title: `第${orderIndex + 1}章`,
    orderIndex,
    volumeId: 'vol-1',
    content: '',
    wordCount: 0,
    status: 'draft',
    ...overrides,
  } as Chapter;
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: '青囊令',
    genre: [{ id: 'g-1', name: '古代权谋', color: '#8b5cf6' }],
    characters: [{ id: 'c-1', name: '沈确' }],
    worldSchema: { locations: [], rules: [], factions: [] },
    plotOutline: [{ id: 'p-1', type: 'chapter', orderIndex: 0, title: '第1章' }],
    chapters: [makeChapter(0)],
    foreshadows: [],
    volumes: [],
    ...overrides,
  } as unknown as Project;
}

function resetStore(): void {
  store.currentProject = null;
  store.currentChapter = null;
  store.chapters = [];
  store.sortedChapters = [];
  store.volumes = [];
}

describe('PreflightService.preflight', () => {
  let service: PreflightService;

  beforeEach(() => {
    resetStore();
    service = new PreflightService();
  });

  it('没有加载项目时判定不通过并给出错误', async () => {
    const result = await service.preflight();

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('没有加载项目');
    expect(result.warnings).toEqual([]);
  });

  it('项目结构齐全时通过，并回传题材与章节数', async () => {
    store.currentProject = makeProject();
    store.chapters = [makeChapter(0)];

    const result = await service.preflight();

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.contracts.genre).toBe('古代权谋');
    expect(result.projectInfo).toMatchObject({ id: 'proj-1', name: '青囊令', chapterCount: 1 });
  });

  it('缺角色/世界观/大纲/章节时只出警告，不阻断预检', async () => {
    store.currentProject = makeProject({
      characters: [],
      worldSchema: undefined,
      plotOutline: [],
      chapters: [],
    } as unknown as Partial<Project>);

    const result = await service.preflight();

    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([
      '项目没有设定角色',
      '项目没有设定世界观',
      '项目没有设定大纲',
      '项目没有章节',
    ]);
  });

  it('指定的章号不存在时判定不通过', async () => {
    store.currentProject = makeProject();
    store.chapters = [makeChapter(0)];

    const result = await service.preflight(9);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('章节 9 不存在');
  });

  it('指定章号存在时装配卷合同与章节合同', async () => {
    const chapter = makeChapter(0, { id: 'ch-1' });
    store.currentProject = makeProject({
      plotOutline: [
        {
          id: 'p-1',
          type: 'chapter',
          orderIndex: 0,
          chapterId: 'ch-1',
          description: '当堂拒绝画押',
          CBN: '惊堂木拍响',
          CPNs: ['核对账册'],
          CEN: '发现账目出入',
        },
      ],
    } as unknown as Partial<Project>);
    store.chapters = [chapter];
    store.volumes = [{ id: 'vol-1', name: '第一卷', orderIndex: 0 } as Volume];

    const result = await service.preflight(1);

    expect(result.contracts.volume).toMatchObject({ volumeNumber: 1, title: '第一卷' });
    expect(result.contracts.chapter?.directive).toMatchObject({
      goal: '当堂拒绝画押',
      CBN: '惊堂木拍响',
      CEN: '发现账目出入',
    });
  });
});

describe('PreflightService.validateProjectReadiness', () => {
  let service: PreflightService;

  beforeEach(() => {
    resetStore();
    service = new PreflightService();
  });

  it('项目未加载时列出缺失项', async () => {
    expect(await service.validateProjectReadiness()).toEqual({
      ready: false,
      missingItems: ['项目未加载'],
    });
  });

  it('逐项列出缺失的设定', async () => {
    store.currentProject = makeProject({
      characters: [],
      plotOutline: [],
    } as unknown as Partial<Project>);

    expect(await service.validateProjectReadiness()).toEqual({
      ready: false,
      missingItems: ['角色设定', '故事大纲'],
    });
  });

  it('设定齐全时就绪', async () => {
    store.currentProject = makeProject();

    expect(await service.validateProjectReadiness()).toEqual({ ready: true, missingItems: [] });
  });
});

describe('PreflightService.getCurrentChapterContext', () => {
  let service: PreflightService;

  beforeEach(() => {
    resetStore();
    service = new PreflightService();
  });

  it('没有当前章节时返回 null', async () => {
    store.currentProject = makeProject();

    expect(await service.getCurrentChapterContext()).toBeNull();
  });

  it('取前章结尾与近期章节原文，并过滤已回收伏笔', async () => {
    const first = makeChapter(0, { content: '第一章正文结尾。' });
    const second = makeChapter(1);
    store.currentProject = makeProject({
      foreshadows: [
        { id: 'f-1', hint: '未回收', status: 'planted' },
        { id: 'f-2', hint: '已回收', status: 'resolved' },
      ],
    } as unknown as Partial<Project>);
    store.currentChapter = second;
    store.sortedChapters = [first, second];

    const context = await service.getCurrentChapterContext();

    expect(context?.chapterNumber).toBe(2);
    expect(context?.previousChapterEnding).toBe('第一章正文结尾。');
    expect(context?.recentChaptersFullText).toContain('第一章正文结尾。');
    expect(context?.foreshadows).toHaveLength(1);
    expect(context?.foreshadows[0].hint).toBe('未回收');
  });
});

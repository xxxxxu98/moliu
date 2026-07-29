import { describe, expect, it } from 'vitest';

import { LegacyProjectMigrator } from '../LegacyProjectMigrator';

describe('LegacyProjectMigrator', () => {
  it('将旧项目、实体、规则、伏笔和章节记忆迁移为 bootstrap 数据', () => {
    const result = new LegacyProjectMigrator().migrate({
      id: 'project-1',
      name: '长夜',
      description: '少年寻找失落真相',
      genre: [{ name: '仙侠' }],
      characters: [
        {
          id: 'char-1',
          name: '林夜',
          role: '主角',
          profile: { personality: ['克制'] },
        },
      ],
      worldSchema: {
        rules: [
          {
            id: 'rule-1',
            name: '禁飞',
            description: '城内不可御剑',
            locked: true,
          },
        ],
      },
      foreshadows: [
        {
          id: 'f-1',
          hint: '断剑会发光',
          status: 'buried',
          createdChapter: 1,
        },
      ],
      plotOutline: [{ id: 'o-1', title: '入城', CPNs: ['遭遇盘查'] }],
      chapterMemories: [
        {
          chapterId: 'c-1',
          chapterTitle: '入城',
          chapterIndex: 1,
          corePlot: '林夜入城',
          keyEvents: ['入城'],
          locations: ['北门'],
          timelineMark: '第一日',
          revealedForeshadows: [],
          newForeshadows: ['断剑'],
        },
      ],
      chapters: [
        {
          id: 'c-1',
          title: '入城',
          content: '林夜抵达北门。\n\n---\n\n守卫拦住了他。',
          orderIndex: 0,
        },
      ],
    });

    expect(result.schemaVersion).toBe('story-runtime/v1');
    expect(result.entities[0].attributes.profile).toEqual({ personality: ['克制'] });
    expect(result.rules[0].attributes.locked).toBe(true);
    expect(result.initialState.openForeshadows).toEqual(['f-1']);
    expect(result.initialState.timeline).toEqual(['第一日']);
    expect(result.sceneChunks).toHaveLength(2);
    expect(result.sceneChunks.map(scene => scene.id)).toEqual(['c-1:scene:1', 'c-1:scene:2']);
  });

  it('空正文不会产生无效场景块', () => {
    const result = new LegacyProjectMigrator().migrate({
      id: 'project-1',
      name: '空章项目',
      chapters: [{ id: 'c-1', title: '空章', content: '   ', orderIndex: 0 }],
    });

    expect(result.sceneChunks).toEqual([]);
    expect(result.initialState.chapter).toBe(0);
  });
});

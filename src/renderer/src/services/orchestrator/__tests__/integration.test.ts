/**
 * @vitest-environment happy-dom
 *
 * 整合层集成测试：验证 L1-L7 完整闭环
 *
 * 用 mock drafter 模拟 AI 生成，验证：
 * 1. initialize 正确构建状态快照
 * 2. writeChapter 走完 读→检→组→写→审→提→记 全流程
 * 3. 状态在提交后正确更新
 * 4. 检索索引在提交后可查
 * 5. 崩溃恢复能找到正确续写点
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateDrivenWritingOrchestrator } from '../StateDrivenWritingOrchestrator';
import { CHANGES_DELIMITER } from '../../state/types';
import type { Project, Chapter, Character } from '@/types/project';

// ============================================================
// Mock 数据
// ============================================================

function makeProject(): Project {
  const character: Character = {
    id: 'char_001',
    name: '林动',
    role: '主角',
    description: '热血少年',
    profile: {
      personality: ['热血', '坚韧'],
      appearance: '黑发黑瞳',
      abilities: ['九幽诀'],
    },
    createdAt: '',
    updatedAt: '',
  };

  return {
    id: 'test-integration',
    name: '测试小说',
    description: '测试用',
    genre: [{ id: 'xianxia', name: '仙侠' }],
    wordCount: 0,
    volumes: [],
    chapters: [],
    characters: [character],
    worldSchema: {
      locations: [{ id: 'loc_001', name: '青云宗', level: 'special' }],
      rules: [{ id: 'wr_001', name: '凡人不可飞行', description: '未达筑基不能御空', locked: true, category: 'cultivation' }],
      factions: [],
    },
    foreshadows: [{
      id: 'fs_001', hint: '断剑嗡鸣', type: 'item', status: 'buried', createdChapter: 1,
    }],
    plotOutline: [],
    chapterMemories: [],
    createdAt: '',
    updatedAt: '',
  };
}

function makeChapter(orderIndex: number, title = '测试章节'): Chapter {
  return {
    id: `chapter_${orderIndex}`,
    title,
    content: '',
    wordCount: 0,
    orderIndex,
    version: 1,
    status: 'draft',
    createdAt: '',
    updatedAt: '',
  };
}

/** Mock drafter：返回带 CHANGES 的输出。 */
function makeMockDrafter(prose: string, changes: object) {
  return {
    async draft(_prompt: string, _params: any) {
      return `${prose}\n\n${CHANGES_DELIMITER}\n${JSON.stringify(changes)}`;
    },
  };
}

// ============================================================
// 集成测试
// ============================================================

describe('StateDrivenWritingOrchestrator', () => {
  let orchestrator: StateDrivenWritingOrchestrator;

  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
    orchestrator = new StateDrivenWritingOrchestrator(
      makeMockDrafter('林动盘膝而坐，开始修炼九幽诀。灵气漩涡凝聚，他感到境界松动。', {
        version: '1.0',
        chapter: 1,
        changes: [{
          type: 'character_state',
          entity: { id: 'char_001', name: '林动', type: 'character' },
          field: 'powerLevel',
          old: '',
          new: '练气一层',
          evidence: '境界松动',
          reason: '初次修炼',
        }],
      }),
      null,  // 无 git
      null,  // 无 persistence
      { enableSemanticGate: false, enableGitBackup: false },  // 测试不开 LLM/git
    );
  });

  it('initialize 构建状态快照', async () => {
    const project = makeProject();
    const { snapshot, warnings } = await orchestrator.initialize(project);
    expect(snapshot.projectId).toBe('test-integration');
    expect(snapshot.characters.char_001).toBeDefined();
    expect(snapshot.characters.char_001.name).toBe('林动');
    expect(snapshot.foreshadows.fs_001).toBeDefined();
    expect(warnings).toBeDefined();
  });

  it('initialize 同项目幂等并只索引一次已有正文', async () => {
    const project = makeProject();
    project.chapters = [{
      ...makeChapter(0),
      content: '林动在青云宗修炼已有正文。',
      wordCount: 13,
    }];

    await orchestrator.initialize(project);
    const firstRetriever = orchestrator.getRetriever();
    const firstSize = firstRetriever?.size();
    await orchestrator.initialize(project);

    expect(orchestrator.getRetriever()).toBe(firstRetriever);
    expect(orchestrator.getRetriever()?.size()).toBe(firstSize);
    expect(firstSize).toBeGreaterThan(0);
  });

  it('writeChapter 走完完整闭环', async () => {
    const project = makeProject();
    const chapter = makeChapter(0, '第1章 初次修炼');

    const events: string[] = [];
    orchestrator.addListener(e => events.push(e.type));

    await orchestrator.initialize(project);

    const result = await orchestrator.writeChapter(project, chapter, 2000, {
      currentChapterOutline: '林动开始修炼',
    });

    expect(result.success).toBe(true);
    expect(result.prose).toContain('林动');
    expect(result.changes).not.toBeNull();
    expect(result.snapshot).not.toBeNull();
    // 状态已更新
    expect(result.snapshot?.characters.char_001.powerLevel).toBe('练气一层');
    // 事件流完整
    expect(events).toContain('state_loaded');
    expect(events).toContain('context_assembled');
    expect(events).toContain('commit_done');
    expect(events).toContain('checkpoint_saved');
  });

  it('提交后检索索引可查', async () => {
    const project = makeProject();
    await orchestrator.initialize(project);
    const chapter = makeChapter(0);

    await orchestrator.writeChapter(project, chapter, 2000, {
      currentChapterOutline: '林动修炼',
    });

    const retriever = orchestrator.getRetriever();
    expect(retriever).not.toBeNull();
    expect(retriever!.size()).toBeGreaterThan(0);
  });

  it('多章连续写作状态累积', async () => {
    const project = makeProject();
    await orchestrator.initialize(project);

    // 第 1 章：境界到练气一层
    await orchestrator.writeChapter(project, makeChapter(0), 2000, {
      currentChapterOutline: '林动修炼',
    });

    // 重建 drafter 让第 2 章升级
    const drafter2 = makeMockDrafter('林动继续修炼，突破到练气二层。', {
      version: '1.0', chapter: 2,
      changes: [{
        type: 'character_state',
        entity: { id: 'char_001', name: '林动', type: 'character' },
        field: 'powerLevel', old: '练气一层', new: '练气二层',
        evidence: '突破到练气二层',
      }],
    });
    // 直接换内部 drafter（测试用）
    (orchestrator as any).drafter = drafter2;

    const result2 = await orchestrator.writeChapter(project, makeChapter(1), 2000, {
      currentChapterOutline: '林动突破',
    });

    expect(result2.success).toBe(true);
    // 状态累积
    expect(result2.snapshot?.characters.char_001.powerLevel).toBe('练气二层');
    expect(result2.snapshot?.chapter).toBe(2);
  });

  it('连续 3 章每章重复 initialize 仍保留快照和检索器', async () => {
    const project = makeProject();
    const levels = ['练气一层', '练气二层', '练气三层'];
    let draftIndex = 0;
    const drafter = {
      async draft() {
        const index = draftIndex++;
        const prose = `林动继续修炼，明确突破到${levels[index]}。`;
        return `${prose}\n\n${CHANGES_DELIMITER}\n${JSON.stringify({
          version: '1.0',
          chapter: index + 1,
          changes: [{
            type: 'character_state',
            entity: { id: 'char_001', name: '林动', type: 'character' },
            field: 'powerLevel',
            old: index === 0 ? '' : levels[index - 1],
            new: levels[index],
            evidence: `突破到${levels[index]}`,
          }],
        })}`;
      },
    };
    const continuousOrchestrator = new StateDrivenWritingOrchestrator(
      drafter,
      null,
      null,
      null,
      { enableSemanticGate: false, enableGitBackup: false },
    );

    await continuousOrchestrator.initialize(project);
    const retrieverIdentity = continuousOrchestrator.getRetriever();
    for (let index = 0; index < 3; index++) {
      await continuousOrchestrator.initialize(project);
      expect(continuousOrchestrator.getRetriever()).toBe(retrieverIdentity);

      const result = await continuousOrchestrator.writeChapter(
        project,
        makeChapter(index),
        2000,
      );
      expect(result.success).toBe(true);
    }

    expect(continuousOrchestrator.getSnapshot()?.characters.char_001.powerLevel).toBe('练气三层');
    expect(continuousOrchestrator.getStateStore()?.getVersions()).toEqual([1, 2, 3]);
    expect(continuousOrchestrator.getRetriever()?.size()).toBeGreaterThanOrEqual(3);
  });

  it('门禁失败零污染且保留正文与门禁结果', async () => {
    const project = makeProject();
    const save = vi.fn().mockResolvedValue({ oldContent: '' });
    const badDrafter = makeMockDrafter('林动从元婴期突破到化神期。', {
      version: '1.0', chapter: 1,
      changes: [{
        type: 'character_state',
        entity: { id: 'char_001', name: '林动', type: 'character' },
        field: 'powerLevel',
        old: '元婴期',  // 与快照（空）不符
        new: '化神期',
      }],
    });
    const strictOrchestrator = new StateDrivenWritingOrchestrator(
      badDrafter,
      null,
      { save },
      null,
      { enableSemanticGate: false, enableGitBackup: false, maxRetries: 2 },
    );
    await strictOrchestrator.initialize(project);
    const beforeSnapshot = strictOrchestrator.getSnapshot();

    const result = await strictOrchestrator.writeChapter(project, makeChapter(0), 2000, {
      currentChapterOutline: '林动突破',
    });

    expect(result.success).toBe(false);
    expect(result.prose).toContain('元婴期');
    expect(result.gateResult?.passed).toBe(false);
    expect(result.commitResult).toBeNull();
    expect(result.error).toContain('严格门禁失败');
    expect(save).not.toHaveBeenCalled();
    expect(strictOrchestrator.getRetriever()?.size()).toBe(0);
    expect(strictOrchestrator.getStateStore()?.getVersions()).toEqual([]);
    expect(strictOrchestrator.getSnapshot()).toEqual(beforeSnapshot);
  });

  it('崩溃恢复', async () => {
    const project = makeProject();
    await orchestrator.initialize(project);
    await orchestrator.writeChapter(project, makeChapter(0), 2000);

    // 模拟崩溃：新建 orchestrator（但检查点已持久化）
    const newOrchestrator = new StateDrivenWritingOrchestrator(
      makeMockDrafter('续写', { version: '1.0', chapter: 2, changes: [] }),
      null, null,
      { enableSemanticGate: false, enableGitBackup: false },
    );
    await newOrchestrator.initialize(project);

    const recovery = newOrchestrator.recover();
    expect(recovery.canRecover).toBe(true);
    expect(recovery.resumeChapter).toBe(2);  // 第 1 章已提交，从第 2 章继续
  });

  it('事件回调被触发', async () => {
    const project = makeProject();
    await orchestrator.initialize(project);

    const events: any[] = [];
    orchestrator.addListener(e => events.push(e));

    await orchestrator.writeChapter(project, makeChapter(0), 2000);

    // 至少触发了一些事件
    expect(events.length).toBeGreaterThan(0);
    const types = events.map(e => e.type);
    expect(types).toContain('context_assembled');
    expect(types).toContain('commit_done');
  });
});

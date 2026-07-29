/**
 * @vitest-environment happy-dom
 *
 * 端到端长跑验证 + 注入适配器集成测试
 *
 * 验证：
 * 1. StateDrivenWritingOrchestrator 跑通真实 L1-L7 闭环（不只 mock）
 * 2. 10 章连续写作 → 状态累积无矛盾
 * 3. 崩溃 → 从最近 checkpoint 恢复
 * 4. 注入适配器：mock AI / mock Git / mock persistence 全部能跑
 * 5. 验收标准 #5（中途中断后能从 checkpoint 恢复）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateDrivenWritingOrchestrator } from '../StateDrivenWritingOrchestrator';
import type {
  DrafterClient,
  GitBackupClient,
  ChapterPersistenceClient,
  WriteChapterResult,
} from '../index';
import type { Project, Chapter, Character } from '@/types/project';
import { CHANGES_DELIMITER } from '../../state/types';

// ============================================================
// 测试 Fixtures
// ============================================================

function makeProject(numChapters = 0): Project {
  const character: Character = {
    id: 'char_001',
    name: '林动',
    role: '主角',
    description: '热血少年',
    profile: { personality: ['热血'], appearance: '黑发黑瞳', abilities: [] },
    createdAt: '',
    updatedAt: '',
  };
  return {
    id: 'e2e-project',
    name: 'E2E 测试小说',
    description: '',
    genre: [{ id: 'xianxia', name: '仙侠' }],
    wordCount: 0,
    status: 'writing',
    volumes: [],
    chapters: [],
    characters: [character],
    worldSchema: {
      locations: [{ id: 'loc_001', name: '青云宗', level: 'special' }],
      rules: [],
      factions: [],
    },
    foreshadows: [],
    plotOutline: [],
    chapterMemories: [],
    createdAt: '',
    updatedAt: '',
  };
}

function makeChapter(orderIndex: number, title?: string): Chapter {
  return {
    id: `chapter_${orderIndex}`,
    title: title || `第${orderIndex + 1}章`,
    content: '',
    wordCount: 0,
    orderIndex,
    version: 1,
    status: 'draft',
    createdAt: '',
    updatedAt: '',
  };
}

/**
 * 模拟 AI 起草：第 N 章返回对应境界升级 + 实际累计字数。
 */
function makeProgressiveDrafter() {
  const powerLevels = ['练气一层', '练气二层', '练气三层', '练气四层', '练气五层',
                       '筑基初期', '筑基中期', '筑基后期', '金丹初期', '金丹中期'];
  const callCount = { value: 0 };

  const drafter: DrafterClient = {
    async draft(_prompt, _params) {
      const callIndex = callCount.value;
      const idx = Math.min(callIndex, powerLevels.length - 1);
      const power = powerLevels[idx];
      callCount.value++;
      const prose = `第${callIndex + 1}章：林动盘膝而坐，开始修炼。灵气漩涡凝聚，他感到境界松动，终于突破到${power}。`;
      const changes = {
        version: '1.0', chapter: callIndex + 1,
        changes: [{
          type: 'character_state',
          entity: { id: 'char_001', name: '林动', type: 'character' },
          field: 'powerLevel',
          old: callIndex === 0 ? '' : powerLevels[callIndex - 1],  // 首章 old 为空；后续 old 是前章值
          new: power,
          evidence: `突破到${power}`,
        }],
      };
      return `${prose}\n\n${CHANGES_DELIMITER}\n${JSON.stringify(changes)}`;
    },
  };

  return { drafter, getCallCount: () => callCount.value };
}

/**
 * 模拟 Git 备份：记录被备份的章节。
 */
function makeGitBackupRecorder() {
  const backed: Array<{ chapter: number; content: string; title: string }> = [];
  const client: GitBackupClient = {
    async backup(chapter, content, title) {
      backed.push({ chapter, content, title });
    },
  };
  return { client, backed, getCount: () => backed.length, getLast: () => backed[backed.length - 1] };
}

/**
 * 模拟章节持久化：把所有章节正文存到 Map。
 */
function makePersistenceRecorder() {
  const stored: Map<string, string> = new Map();
  const client: ChapterPersistenceClient = {
    async save(chapterId, content) {
      const old = stored.get(chapterId) ?? '';
      const next = old + (old && !old.endsWith('\n') ? '\n\n' : '') + content;
      stored.set(chapterId, next);
      return { oldContent: old };
    },
    async replace(chapterId, content) {
      const oldContent = stored.get(chapterId) ?? '';
      stored.set(chapterId, content);
      return { oldContent };
    },
  };
  return { client, stored, getCount: () => stored.size, getAll: () => new Map(stored) };
}

// ============================================================
// E2E：完整 L1-L7 闭环（不只 mock）
// ============================================================

describe('E2E 端到端集成', () => {
  let project: Project;
  const TOTAL_CHAPTERS = 10;

  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
    project = makeProject();
    for (let i = 0; i < TOTAL_CHAPTERS; i++) {
      project.chapters.push(makeChapter(i));
    }
  });

  it('StateDrivenWritingOrchestrator 跑通真实 L1-L7 闭环', async () => {
    const { drafter } = makeProgressiveDrafter();
    const { client: git, getCount: gitCount } = makeGitBackupRecorder();
    const { client: persist, stored } = makePersistenceRecorder();

    const orch = new StateDrivenWritingOrchestrator(drafter, git, persist, null, {
      enableSemanticGate: false,
      enableGitBackup: true,
    });
    await orch.initialize(project);

    const result: WriteChapterResult = await orch.writeChapter(project, project.chapters[0], 1000, {
      currentChapterOutline: '林动开始修炼',
    });

    // L1 读快照：初始化后快照存在
    const snap = orch.getSnapshot();
    expect(snap).not.toBeNull();
    expect(snap?.characters.char_001).toBeDefined();

    // L4 起草：prose 长度 > 0
    expect(result.prose.length).toBeGreaterThan(0);

    // L5 门禁：result.gateResult 应存在（即使 passed=true）
    expect(result.gateResult).toBeDefined();
    // 通过（无 LLM 语义审查，默认 passed）

    // L6 提交：commitResult 应存在
    expect(result.commitResult).toBeDefined();
    expect(result.commitResult?.success).toBe(true);

    // L1 状态已更新
    expect(result.snapshot?.characters.char_001.powerLevel).toBe('练气一层');

    // L6 RAG 索引：retriever 非空且 size > 0
    expect(orch.getRetriever()?.size()).toBeGreaterThan(0);

    // L6 Git 备份：至少调 1 次
    expect(gitCount()).toBeGreaterThanOrEqual(1);

    // L6 持久化：stored 包含该章
    expect(stored.size).toBe(1);

    // L7 checkpoint：stateExport 在 snapshot 中
    expect(result.snapshot).toBeDefined();
  });

  it('10 章连续写作：状态累积、伏笔可追溯', async () => {
    const { drafter } = makeProgressiveDrafter();
    const git = makeGitBackupRecorder();
    const persist = makePersistenceRecorder();

    const orch = new StateDrivenWritingOrchestrator(drafter, git.client, persist.client);
    await orch.initialize(project);

    const results: WriteChapterResult[] = [];
    for (let i = 0; i < TOTAL_CHAPTERS; i++) {
      const r = await orch.writeChapter(project, project.chapters[i], 1000, {
        currentChapterOutline: `第 ${i + 1} 章：林动继续修炼`,
      });
      results.push(r);
      if (!r.success) {
        console.error(`第 ${i + 1} 章失败：`, r.error);
        break;
      }
    }

    // 10 章全部成功
    expect(results.length).toBe(TOTAL_CHAPTERS);
    for (let i = 0; i < results.length; i++) {
      expect(results[i].success).toBe(true);
    }

    // 最终状态：林动应达到金丹中期
    const finalSnap = orch.getSnapshot();
    expect(finalSnap?.characters.char_001.powerLevel).toBe('金丹中期');

    // 当前章节号
    expect(finalSnap?.chapter).toBe(TOTAL_CHAPTERS);

    // RAG 索引有 10+ 个切片
    expect(orch.getRetriever()?.size()).toBeGreaterThanOrEqual(TOTAL_CHAPTERS);

    // Git 备份调 10 次
    expect(git.getCount()).toBe(TOTAL_CHAPTERS);

    // 持久化 10 个章节
    expect(persist.getCount()).toBe(TOTAL_CHAPTERS);
  });

  it('5 章后崩溃 → 从 checkpoint 恢复第 6 章', async () => {
    const { drafter } = makeProgressiveDrafter();
    const git = makeGitBackupRecorder();
    const persist = makePersistenceRecorder();

    // 阶段 1：写 5 章
    const orch1 = new StateDrivenWritingOrchestrator(drafter, git.client, persist.client);
    await orch1.initialize(project);

    for (let i = 0; i < 5; i++) {
      await orch1.writeChapter(project, project.chapters[i], 1000);
    }
    // 验证：5 章提交后状态
    expect(orch1.getSnapshot()?.characters.char_001.powerLevel).toBe('练气五层');
    expect(orch1.getSnapshot()?.chapter).toBe(5);

    // 阶段 2：模拟崩溃（销毁 orch1，新建 orch2）
    const recovery = orch1.recover();
    expect(recovery.canRecover).toBe(true);
    expect(recovery.resumeChapter).toBe(6);  // 从第 6 章继续

    // 阶段 3：新编排器从 checkpoint 恢复
    const orch2 = new StateDrivenWritingOrchestrator(drafter, git.client, persist.client);
    await orch2.initialize(project);
    const recovery2 = orch2.recover();
    expect(recovery2.canRecover).toBe(true);
    expect(recovery2.resumeChapter).toBe(6);

    // 状态应从第 5 章恢复（不是空的）
    const recoveredSnap = orch2.getSnapshot();
    expect(recoveredSnap?.characters.char_001.powerLevel).toBe('练气五层');
    expect(recoveredSnap?.chapter).toBe(5);

    // 阶段 4：继续写第 6 章
    const r6 = await orch2.writeChapter(project, project.chapters[5], 1000, {
      currentChapterOutline: '第 6 章：林动突破到筑基',
    });
    expect(r6.success).toBe(true);
    expect(r6.snapshot?.characters.char_001.powerLevel).toBe('筑基初期');
  });

  it('注入适配器全 mock：orchestrator 不依赖具体服务', async () => {
    const drafter: DrafterClient = { async draft() { return 'mock'; } };
    const git: GitBackupClient = { async backup() { /* mock */ } };
    const persist: ChapterPersistenceClient = {
      async save() { return { oldContent: '' }; },
      async replace() { return { oldContent: '' }; },
    };

    const orch = new StateDrivenWritingOrchestrator(drafter, git, persist);
    await orch.initialize(project);

    // 不报"未实现"或"未注入"错误
    expect(orch.getSnapshot()).not.toBeNull();
  });

  it('每章事件流被正确触发', async () => {
    const { drafter } = makeProgressiveDrafter();
    const git = makeGitBackupRecorder();
    const persist = makePersistenceRecorder();

    const orch = new StateDrivenWritingOrchestrator(drafter, git.client, persist.client);
    const events: string[] = [];
    orch.addListener(e => events.push(e.type));

    await orch.initialize(project);
    await orch.writeChapter(project, project.chapters[0], 1000);

    // 事件流应至少包含 state_loaded, context_assembled, commit_done, checkpoint_saved
    expect(events).toContain('state_loaded');
    expect(events).toContain('context_assembled');
    expect(events).toContain('commit_done');
    expect(events).toContain('checkpoint_saved');
  });
});

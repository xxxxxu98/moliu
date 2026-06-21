/**
 * @vitest-environment happy-dom
 *
 * L6 提交层 + L7 恢复层单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createStateStore, destroyStateStore, createChangesApplier, createEmptyChanges } from '../../state';
import { HybridRetriever } from '../../retrieval/HybridRetriever';
import { CommitTransaction, IndexSyncWriter } from '../../commit/CommitTransaction';
import { CheckpointManager, SessionStateManager, recoverFromCrash } from '../RecoveryManager';
import { CHANGES_DELIMITER } from '../../state/types';
import type { ChangesPayload, Change } from '../../state/types';

const PROJECT_ID = 'test-project-l6l7';

function makeStore() {
  destroyStateStore(PROJECT_ID);
  return createStateStore(PROJECT_ID);
}

function seedChar(store: ReturnType<typeof makeStore>) {
  store.registerEntity('char_001', '林动');
  store.setSnapshot({
    ...store.getSnapshot(),
    characters: {
      char_001: {
        entityId: 'char_001', name: '林动', powerLevel: '练气一层',
        abilities: [], mentalState: '', role: '主角', alive: true, lastUpdatedChapter: 0,
      },
    },
  });
}

function makeChange(partial: Partial<Change> & { type: Change['type'] }): Change {
  return partial as Change;
}

// ============================================================
// CommitTransaction
// ============================================================

describe('CommitTransaction', () => {
  let store: ReturnType<typeof makeStore>;
  let retriever: HybridRetriever;
  let tx: CommitTransaction;

  beforeEach(() => {
    store = makeStore();
    seedChar(store);
    retriever = new HybridRetriever();
    tx = new CommitTransaction(
      store,
      createChangesApplier(store),
      retriever,
      null,  // 无 git
      null,  // 无 persistence
    );
  });

  it('成功提交：状态应用 + RAG 索引', async () => {
    const changes: ChangesPayload = {
      version: '1.0', chapter: 1,
      changes: [makeChange({
        type: 'character_state',
        entity: { id: 'char_001', name: '林动', type: 'character' },
        field: 'powerLevel', old: '练气一层', new: '练气二层',
        evidence: '林动突破',
      })],
    };
    const result = await tx.commit({
      chapter: 1,
      prose: '林动突破到练气二层。',
      changes,
      title: '第1章 突破',
    });

    expect(result.success).toBe(true);
    expect(result.steps.length).toBe(2);  // state_apply + rag_index
    // 状态已更新
    expect(store.getCharacter('char_001')?.powerLevel).toBe('练气二层');
    // RAG 已索引
    expect(retriever.size()).toBeGreaterThan(0);
  });

  it('状态应用失败 → 事务失败', async () => {
    // 制造一个必然失败的 CHANGES（无任何 changes）
    const changes: ChangesPayload = {
      version: '1.0', chapter: 1, changes: [],
    };
    // applier 对空 changes 会 success=true appliedCount=0，需要 mock 一个失败场景
    // 这里用 strict 模式 + 制造冲突
    store.setSnapshot({
      ...store.getSnapshot(),
      characters: {
        char_001: {
          ...store.getSnapshot().characters.char_001,
          alive: false,  // 已死
        },
      },
    });
    const deadRevive: ChangesPayload = {
      version: '1.0', chapter: 1,
      changes: [makeChange({
        type: 'character_state',
        entity: { id: 'char_001', name: '林动', type: 'character' },
        field: 'alive', old: false, new: true,
      })],
    };
    // strict 模式下 critical 冲突 → apply 失败
    const result = await tx.commit({
      chapter: 1,
      prose: '林动复活',
      changes: deadRevive,
      applyOptions: { strictness: 'strict' },
    });
    expect(result.success).toBe(false);
  });

  it('skipRagIndex 跳过索引步骤', async () => {
    const result = await tx.commit({
      chapter: 1,
      prose: '测试',
      changes: createEmptyChanges(1),
      skipRagIndex: true,
    });
    expect(result.success).toBe(true);
    expect(result.steps.length).toBe(1);  // 只有 state_apply
    expect(retriever.size()).toBe(0);
  });
});

// ============================================================
// IndexSyncWriter
// ============================================================

describe('IndexSyncWriter', () => {
  it('单章同步', async () => {
    const retriever = new HybridRetriever();
    const writer = new IndexSyncWriter(retriever);
    const result = await writer.syncChapter(1, '林动修炼九幽诀', ['林动']);
    expect(result.chunkCount).toBeGreaterThan(0);
    expect(retriever.size()).toBeGreaterThan(0);
  });

  it('批量同步', async () => {
    const retriever = new HybridRetriever();
    const writer = new IndexSyncWriter(retriever);
    const progress: Array<{ done: number; total: number }> = [];
    const result = await writer.syncChapters(
      [
        { chapter: 1, content: '林动修炼' },
        { chapter: 2, content: '林动战斗' },
        { chapter: 3, content: '林动休息' },
      ],
      ['林动'],
      (done, total) => progress.push({ done, total }),
    );
    expect(result.syncedCount).toBe(3);
    expect(result.failedCount).toBe(0);
    expect(progress.length).toBe(3);
    expect(progress[2]).toEqual({ done: 3, total: 3 });
  });
});

// ============================================================
// CheckpointManager
// ============================================================

describe('CheckpointManager', () => {
  let mgr: CheckpointManager;

  beforeEach(() => {
    // 清掉 localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    mgr = new CheckpointManager(PROJECT_ID);
  });

  it('保存并查询检查点', () => {
    mgr.save({ projectId: PROJECT_ID, chapter: 1, type: 'post_commit', commitResult: { success: true, chapter: 1 } });
    expect(mgr.size()).toBe(1);
    const cps = mgr.getByChapter(1);
    expect(cps.length).toBe(1);
  });

  it('getRecoveryPoint 返回最近成功的 post_commit', () => {
    mgr.save({ projectId: PROJECT_ID, chapter: 1, type: 'post_commit', commitResult: { success: true, chapter: 1 } });
    mgr.save({ projectId: PROJECT_ID, chapter: 2, type: 'post_commit', commitResult: { success: true, chapter: 2 } });
    mgr.save({ projectId: PROJECT_ID, chapter: 3, type: 'pre_draft' });
    const recovery = mgr.getRecoveryPoint();
    expect(recovery?.chapter).toBe(2);
  });

  it('getLatestByType 按类型查', () => {
    mgr.save({ projectId: PROJECT_ID, chapter: 1, type: 'pre_draft', draftContent: '草稿1' });
    mgr.save({ projectId: PROJECT_ID, chapter: 2, type: 'pre_draft', draftContent: '草稿2' });
    const latest = mgr.getLatestByType('pre_draft');
    expect(latest?.draftContent).toBe('草稿2');
  });

  it('pruneAfter 删除后续检查点', () => {
    mgr.save({ projectId: PROJECT_ID, chapter: 1, type: 'post_commit', commitResult: { success: true, chapter: 1 } });
    mgr.save({ projectId: PROJECT_ID, chapter: 2, type: 'post_commit', commitResult: { success: true, chapter: 2 } });
    mgr.save({ projectId: PROJECT_ID, chapter: 3, type: 'post_commit', commitResult: { success: true, chapter: 3 } });
    mgr.pruneAfter(2);
    expect(mgr.size()).toBe(2);
  });

  it('持久化到 localStorage', () => {
    mgr.save({ projectId: PROJECT_ID, chapter: 1, type: 'post_commit', commitResult: { success: true, chapter: 1 } });
    const newMgr = new CheckpointManager(PROJECT_ID);
    expect(newMgr.size()).toBe(1);
  });
});

// ============================================================
// SessionStateManager
// ============================================================

describe('SessionStateManager', () => {
  let mgr: SessionStateManager;

  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
    mgr = new SessionStateManager(PROJECT_ID);
  });

  it('开始并查询会话', () => {
    const session = mgr.start(PROJECT_ID, 1, 10);
    expect(session.status).toBe('running');
    expect(session.startChapter).toBe(1);
    expect(mgr.getCurrent()?.id).toBe(session.id);
  });

  it('标记章节完成/失败', () => {
    mgr.start(PROJECT_ID, 1, 10);
    mgr.markChapterCompleted(1);
    mgr.markChapterCompleted(2);
    mgr.markChapterFailed(3, 'API 超时');
    const session = mgr.getCurrent()!;
    expect(session.completedChapters).toEqual([1, 2]);
    expect(session.failedChapters).toEqual([3]);
    expect(session.errors.length).toBe(1);
  });

  it('getResumeChapter：当前章未完成则重做', () => {
    mgr.start(PROJECT_ID, 5, 10);
    mgr.setCurrentChapter(5);
    expect(mgr.getResumeChapter()).toBe(5);
  });

  it('getResumeChapter：当前章已完成则下一章', () => {
    mgr.start(PROJECT_ID, 5, 10);
    mgr.setCurrentChapter(5);
    mgr.markChapterCompleted(5);
    expect(mgr.getResumeChapter()).toBe(6);
  });

  it('pause/resume/complete', () => {
    mgr.start(PROJECT_ID, 1, 5);
    mgr.pause();
    expect(mgr.getCurrent()?.status).toBe('paused');
    mgr.resume();
    expect(mgr.getCurrent()?.status).toBe('running');
    mgr.complete();
    expect(mgr.getCurrent()?.status).toBe('completed');
    expect(mgr.getCurrent()?.endTime).toBeDefined();
  });
});

// ============================================================
// recoverFromCrash
// ============================================================

describe('recoverFromCrash', () => {
  let cpMgr: CheckpointManager;
  let sessionMgr: SessionStateManager;
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
    cpMgr = new CheckpointManager(PROJECT_ID);
    sessionMgr = new SessionStateManager(PROJECT_ID);
    store = makeStore();
  });

  it('优先从 post_commit 检查点恢复', () => {
    cpMgr.save({
      projectId: PROJECT_ID, chapter: 3, type: 'post_commit',
      commitResult: { success: true, chapter: 3 },
    });
    const result = recoverFromCrash(cpMgr, sessionMgr, store);
    expect(result.canRecover).toBe(true);
    expect(result.resumeChapter).toBe(4);
  });

  it('无检查点时从会话状态恢复', () => {
    sessionMgr.start(PROJECT_ID, 1, 10);
    sessionMgr.setCurrentChapter(5);
    const result = recoverFromCrash(cpMgr, sessionMgr, store);
    expect(result.canRecover).toBe(true);
    expect(result.resumeChapter).toBe(5);
  });

  it('无任何状态返回不可恢复', () => {
    const result = recoverFromCrash(cpMgr, sessionMgr, store);
    expect(result.canRecover).toBe(false);
    expect(result.resumeChapter).toBe(1);
  });
});

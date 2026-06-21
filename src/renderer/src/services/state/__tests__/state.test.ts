/**
 * @vitest-environment happy-dom
 *
 * L1 状态层单元测试
 *
 * 覆盖：
 * 1. types schema 校验
 * 2. ChangesProtocol 解析（容错）
 * 3. StateSnapshotStore 读写 + 版本 + 冲突检测
 * 4. ChangesApplier 事务化应用
 *
 * 这些测试是 M1 里程碑（L1 地基）的验收依据。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CHANGES_DELIMITER,
  StateSnapshotSchema,
  ChangesPayloadSchema,
  ChangeSchema,
} from '../types';
import {
  extractChanges,
  buildChangesProtocolPrompt,
  formatChangesPayload,
  createEmptyChanges,
} from '../ChangesProtocol';
import { StateSnapshotStore, createStateStore, destroyStateStore } from '../StateSnapshotStore';
import { createChangesApplier } from '../ChangesApplier';

// ============================================================
// 工具：构建测试用快照/CHANGES
// ============================================================

const PROJECT_ID = 'test-project';

function makeStore(): StateSnapshotStore {
  destroyStateStore(PROJECT_ID);
  return createStateStore(PROJECT_ID);
}

function seedCharacter(store: StateSnapshotStore, id: string, name: string, power = '练气一层') {
  store.registerEntity(id, name);
  store.setSnapshot({
    ...store.getSnapshot(),
    characters: {
      ...store.getSnapshot().characters,
      [id]: {
        entityId: id,
        name,
        powerLevel: power,
        abilities: [],
        mentalState: '',
        role: '主角',
        alive: true,
        lastUpdatedChapter: 0,
      },
    },
    characterLocations: {
      ...store.getSnapshot().characterLocations,
      [id]: 'loc_001',
    },
  });
  store.registerEntity('loc_001', '青云宗');
  store.setSnapshot({
    ...store.getSnapshot(),
    locations: {
      ...store.getSnapshot().locations,
      loc_001: {
        id: 'loc_001',
        name: '青云宗',
        status: '正常',
        lastUpdatedChapter: 0,
      },
    },
  });
}

// ============================================================
// types.ts schema 校验
// ============================================================

describe('types.ts schema', () => {
  it('空快照通过校验', () => {
    const result = StateSnapshotSchema.safeParse({
      projectId: PROJECT_ID,
    });
    expect(result.success).toBe(true);
  });

  it('完整快照通过校验且填充默认值', () => {
    const result = StateSnapshotSchema.safeParse({
      projectId: PROJECT_ID,
      chapter: 5,
      characters: {
        char_001: {
          entityId: 'char_001',
          name: '林动',
          role: '主角',
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.characters.char_001.alive).toBe(true);
      expect(result.data.characters.char_001.abilities).toEqual([]);
      expect(result.data.chapter).toBe(5);
    }
  });

  it('CHANGES 单条变更校验', () => {
    const result = ChangeSchema.safeParse({
      type: 'character_state',
      entity: { id: 'char_001', name: '林动', type: 'character' },
      field: 'powerLevel',
      old: '练气一层',
      new: '练气二层',
      reason: '突破',
    });
    expect(result.success).toBe(true);
  });

  it('CHANGES 非法类型被拒', () => {
    const result = ChangeSchema.safeParse({
      type: 'unknown_type',
      entity: { name: '林动' },
    });
    expect(result.success).toBe(false);
  });

  it('CHANGES payload 校验', () => {
    const result = ChangesPayloadSchema.safeParse({
      version: '1.0',
      chapter: 3,
      changes: [
        {
          type: 'foreshadow',
          id: 'fs_001',
          hint: '神秘断剑',
          action: 'setup',
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// ChangesProtocol.ts 解析
// ============================================================

describe('ChangesProtocol.extractChanges', () => {
  it('从带分隔符的完整输出中提取散文 + CHANGES', () => {
    const raw = `林动盘膝而坐，掌心灵气漩涡凝聚，经脉中传来突破的轰鸣。

${CHANGES_DELIMITER}
{
  "version": "1.0",
  "chapter": 5,
  "changes": [
    {
      "type": "character_state",
      "entity": { "id": "char_001", "name": "林动", "type": "character" },
      "field": "powerLevel",
      "old": "练气三层",
      "new": "练气四层",
      "evidence": "掌心灵气漩涡凝聚",
      "reason": "突破"
    }
  ]
}`;
    const result = extractChanges(raw);
    expect(result.diagnostics.found).toBe(true);
    expect(result.diagnostics.valid).toBe(true);
    expect(result.diagnostics.changeCount).toBe(1);
    expect(result.prose).toContain('林动盘膝');
    expect(result.prose).not.toContain('CHANGES');
    expect(result.changes?.changes[0]).toMatchObject({ type: 'character_state' });
  });

  it('无分隔符时整段当散文', () => {
    const raw = '这是一段普通的正文，没有任何 CHANGES。';
    const result = extractChanges(raw);
    expect(result.diagnostics.found).toBe(false);
    expect(result.prose).toBe(raw);
    expect(result.changes).toBeNull();
  });

  it('容错处理 markdown 代码块包裹', () => {
    const raw = `正文。

${CHANGES_DELIMITER}
\`\`\`json
{ "version": "1.0", "chapter": 1, "changes": [] }
\`\`\``;
    const result = extractChanges(raw);
    expect(result.diagnostics.found).toBe(true);
    expect(result.diagnostics.valid).toBe(true);
  });

  it('容错处理尾随逗号', () => {
    const raw = `正文。

${CHANGES_DELIMITER}
{
  "version": "1.0",
  "chapter": 1,
  "changes": [
    { "type": "timeline", "currentTime": "次日清晨", "event": "下山", }
  ]
}`;
    const result = extractChanges(raw);
    expect(result.diagnostics.parsed).toBe(true);
    expect(result.diagnostics.valid).toBe(true);
  });

  it('部分坏条目：保留有效条目', () => {
    const raw = `正文。

${CHANGES_DELIMITER}
{
  "version": "1.0",
  "chapter": 1,
  "changes": [
    { "type": "timeline", "currentTime": "次日", "event": "下山" },
    { "type": "INVALID_TYPE", "foo": "bar" }
  ]
}`;
    const result = extractChanges(raw);
    expect(result.diagnostics.valid).toBe(true);
    expect(result.diagnostics.changeCount).toBe(1);
    expect(result.diagnostics.errors.length).toBeGreaterThan(0);
  });

  it('空正文不崩溃', () => {
    const result = extractChanges('');
    expect(result.prose).toBe('');
    expect(result.changes).toBeNull();
  });
});

describe('ChangesProtocol.formatChangesPayload', () => {
  it('空变更显示提示', () => {
    const text = formatChangesPayload(createEmptyChanges(1));
    expect(text).toContain('无状态变更');
  });

  it('格式化变更为人可读', () => {
    const text = formatChangesPayload({
      version: '1.0',
      chapter: 1,
      changes: [
        {
          type: 'character_state',
          entity: { id: 'char_001', name: '林动', type: 'character' },
          field: 'powerLevel',
          old: '练气一层',
          new: '练气二层',
          evidence: '',
          reason: '突破',
        },
      ],
    });
    expect(text).toContain('林动');
    expect(text).toContain('练气一层');
    expect(text).toContain('练气二层');
  });
});

describe('ChangesProtocol.buildChangesProtocolPrompt', () => {
  it('生成包含分隔符和示例的 prompt', () => {
    const prompt = buildChangesProtocolPrompt({ includeExamples: true });
    expect(prompt).toContain(CHANGES_DELIMITER);
    expect(prompt).toContain('character_state');
    expect(prompt).toContain('示例');
  });

  it('省略示例时更精简', () => {
    const prompt = buildChangesProtocolPrompt({ includeExamples: false });
    expect(prompt).toContain(CHANGES_DELIMITER);
    expect(prompt).not.toContain('示例');
  });
});

// ============================================================
// StateSnapshotStore.ts
// ============================================================

describe('StateSnapshotStore', () => {
  let store: StateSnapshotStore;

  beforeEach(() => {
    store = makeStore();
    seedCharacter(store, 'char_001', '林动', '练气一层');
  });

  describe('读写', () => {
    it('getSnapshot 返回深拷贝', () => {
      const snap1 = store.getSnapshot();
      snap1.chapter = 99;
      const snap2 = store.getSnapshot();
      expect(snap2.chapter).not.toBe(99);
    });

    it('resolveEntity 通过 ID 直接返回', () => {
      expect(store.resolveEntity({ id: 'char_001', name: '林动' })).toBe('char_001');
    });

    it('resolveEntity 通过名称兜底', () => {
      expect(store.resolveEntity({ name: '林动' })).toBe('char_001');
    });

    it('resolveEntity 未注册返回 null', () => {
      expect(store.resolveEntity({ name: '陌生人' })).toBeNull();
    });
  });

  describe('版本管理', () => {
    it('commitVersion 写入新版本', () => {
      const snap = store.getSnapshot();
      snap.chapter = 1;
      const result = store.commitVersion(1, snap, createEmptyChanges(1));
      expect(result.success).toBe(true);
      expect(store.getLatestVersion()).toBe(1);
    });

    it('不允许覆盖已存在版本', () => {
      const snap1 = store.getSnapshot();
      store.commitVersion(1, snap1, createEmptyChanges(1));
      const snap2 = store.getSnapshot();
      const result = store.commitVersion(1, snap2, createEmptyChanges(1));
      expect(result.success).toBe(false);
    });

    it('rollbackTo 回滚丢弃后续版本', () => {
      // 提交 1, 2, 3
      for (let i = 1; i <= 3; i++) {
        const snap = store.getSnapshot();
        snap.chapter = i;
        store.commitVersion(i, snap, createEmptyChanges(i));
      }
      expect(store.getVersions()).toEqual([1, 2, 3]);

      const result = store.rollbackTo(1);
      expect(result.success).toBe(true);
      expect(store.getVersions()).toEqual([1]);
      expect(store.getSnapshot().chapter).toBe(1);
    });

    it('getSnapshotAt 回放历史', () => {
      for (let i = 1; i <= 3; i++) {
        const snap = store.getSnapshot();
        snap.chapter = i;
        store.commitVersion(i, snap, createEmptyChanges(i));
      }
      const histSnap = store.getSnapshotAt(2);
      expect(histSnap?.chapter).toBe(2);
    });
  });

  describe('冲突检测', () => {
    it('old 值与快照不符 → critical 冲突', () => {
      const changes = {
        version: '1.0' as const,
        chapter: 1,
        changes: [
          {
            type: 'character_state' as const,
            entity: { id: 'char_001', name: '林动', type: 'character' as const },
            field: 'powerLevel' as const,
            old: '练气九层',  // 快照里是练气一层
            new: '练气十层',
            reason: '突破',
          },
        ],
      };
      const conflicts = store.detectConflicts(changes, 1);
      const critical = conflicts.filter(c => c.severity === 'critical');
      expect(critical.length).toBeGreaterThan(0);
      expect(critical[0].kind).toBe('value_mismatch');
    });

    it('未埋设就回收伏笔 → critical 冲突', () => {
      const changes = {
        version: '1.0' as const,
        chapter: 1,
        changes: [
          {
            type: 'foreshadow' as const,
            id: 'fs_not_exists',
            hint: '不存在',
            action: 'payoff' as const,
          },
        ],
      };
      const conflicts = store.detectConflicts(changes, 1);
      const critical = conflicts.filter(c => c.severity === 'critical');
      expect(critical.length).toBe(1);
      expect(critical[0].kind).toBe('missing_entity');
    });

    it('死人复活 → critical 冲突', () => {
      // 标记角色死亡
      const snap = store.getSnapshot();
      snap.characters.char_001.alive = false;
      store.setSnapshot(snap);

      const changes = {
        version: '1.0' as const,
        chapter: 1,
        changes: [
          {
            type: 'character_state' as const,
            entity: { id: 'char_001', name: '林动', type: 'character' as const },
            field: 'alive' as const,
            old: false,
            new: true,
            reason: '复活',
          },
        ],
      };
      const conflicts = store.detectConflicts(changes, 1);
      const critical = conflicts.filter(c => c.severity === 'critical');
      expect(critical.length).toBeGreaterThan(0);
    });
  });

  describe('持久化', () => {
    it('export/import 往返一致', () => {
      const snap = store.getSnapshot();
      snap.chapter = 2;
      store.commitVersion(2, snap, createEmptyChanges(2));
      const exported = store.export();

      const newStore = new StateSnapshotStore(PROJECT_ID);
      const result = newStore.import(exported);
      expect(result.success).toBe(true);
      expect(newStore.getSnapshot().chapter).toBe(2);
      expect(newStore.getLatestVersion()).toBe(2);
    });
  });
});

// ============================================================
// ChangesApplier.ts
// ============================================================

describe('ChangesApplier', () => {
  let store: StateSnapshotStore;

  beforeEach(() => {
    store = makeStore();
    seedCharacter(store, 'char_001', '林动', '练气一层');
  });

  it('应用角色状态变更', () => {
    const applier = createChangesApplier(store);
    const result = applier.apply({
      version: '1.0',
      chapter: 1,
      changes: [
        {
          type: 'character_state',
          entity: { id: 'char_001', name: '林动', type: 'character' },
          field: 'powerLevel',
          old: '练气一层',
          new: '练气二层',
          reason: '突破',
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.appliedCount).toBe(1);
    const char = store.getCharacter('char_001');
    expect(char?.powerLevel).toBe('练气二层');
    expect(char?.lastUpdatedChapter).toBe(1);
  });

  it('strict 模式下 critical 冲突拒绝整批', () => {
    const applier = createChangesApplier(store);
    const result = applier.apply(
      {
        version: '1.0',
        chapter: 1,
        changes: [
          {
            type: 'character_state',
            entity: { id: 'char_001', name: '林动', type: 'character' },
            field: 'powerLevel',
            old: '错误的旧值',
            new: '练气二层',
          },
        ],
      },
      { strictness: 'strict' },
    );

    expect(result.success).toBe(false);
    expect(result.appliedCount).toBe(0);
    // 快照不变
    expect(store.getCharacter('char_001')?.powerLevel).toBe('练气一层');
  });

  it('lenient 模式跳过冲突条目继续应用其他', () => {
    const applier = createChangesApplier(store);
    const result = applier.apply({
      version: '1.0',
      chapter: 1,
      changes: [
        // 这条有冲突（old 不符）
        {
          type: 'character_state',
          entity: { id: 'char_001', name: '林动', type: 'character' },
          field: 'powerLevel',
          old: '错误的旧值',
          new: '练气二层',
        },
        // 这条无冲突
        {
          type: 'character_state',
          entity: { id: 'char_001', name: '林动', type: 'character' },
          field: 'mentalState',
          new: '意气风发',
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.appliedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    // 第二条应用了
    expect(store.getCharacter('char_001')?.mentalState).toBe('意气风发');
    // 第一条未应用
    expect(store.getCharacter('char_001')?.powerLevel).toBe('练气一层');
  });

  it('自动创建未登记实体', () => {
    const applier = createChangesApplier(store);
    const result = applier.apply({
      version: '1.0',
      chapter: 1,
      changes: [
        {
          type: 'character_state',
          entity: { name: '新角色', type: 'character' },
          field: 'role',
          new: '反派',
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.createdEntities.length).toBe(1);
    const newId = result.createdEntities[0];
    expect(newId).toMatch(/^char_\d{3}$/);
    const newChar = store.getCharacter(newId);
    expect(newChar?.name).toBe('新角色');
    expect(newChar?.role).toBe('反派');
    // 别名已注册
    expect(store.resolveEntity({ name: '新角色' })).toBe(newId);
  });

  it('伏笔 setup 后能 payoff', () => {
    const applier = createChangesApplier(store);
    // setup
    const setupResult = applier.apply({
      version: '1.0',
      chapter: 1,
      changes: [
        {
          type: 'foreshadow',
          id: 'fs_test',
          hint: '神秘断剑嗡鸣',
          action: 'setup',
          tier: 'major',
          plannedPayoffChapter: 10,
        },
      ],
    });
    expect(setupResult.success).toBe(true);

    // payoff
    const payoffResult = applier.apply({
      version: '1.0',
      chapter: 10,
      changes: [
        {
          type: 'foreshadow',
          id: 'fs_test',
          hint: '神秘断剑嗡鸣',
          action: 'payoff',
        },
      ],
    });
    expect(payoffResult.success).toBe(true);

    const snap = store.getSnapshot();
    expect(snap.foreshadows.fs_test.status).toBe('payoff');
    expect(snap.foreshadows.fs_test.setupChapter).toBe(1);
    expect(snap.foreshadows.fs_test.actualPayoffChapter).toBe(10);
  });

  it('dryRun 不实际写入', () => {
    const applier = createChangesApplier(store);
    const result = applier.apply(
      {
        version: '1.0',
        chapter: 1,
        changes: [
          {
            type: 'character_state',
            entity: { id: 'char_001', name: '林动', type: 'character' },
            field: 'powerLevel',
            old: '练气一层',
            new: '练气二层',
          },
        ],
      },
      { dryRun: true },
    );

    expect(result.success).toBe(true);
    // dryRun 不写入 store
    expect(store.getCharacter('char_001')?.powerLevel).toBe('练气一层');
    expect(store.getLatestVersion()).toBe(0);
  });

  it('关系变化累积信任度', () => {
    const applier = createChangesApplier(store);
    // 先注册第二角色
    seedCharacter(store, 'char_002', '反派A', '练气一层');

    // 第一次：信任度 +30
    applier.apply({
      version: '1.0',
      chapter: 1,
      changes: [
        {
          type: 'relationship',
          from: { id: 'char_001', name: '林动', type: 'character' },
          to: { id: 'char_002', name: '反派A', type: 'character' },
          relationType: 'ally',
          delta: 30,
        },
      ],
    });

    // 第二次：信任度 -10
    applier.apply({
      version: '1.0',
      chapter: 2,
      changes: [
        {
          type: 'relationship',
          from: { id: 'char_001', name: '林动', type: 'character' },
          to: { id: 'char_002', name: '反派A', type: 'character' },
          relationType: 'ally',
          delta: -10,
        },
      ],
    });

    const snap = store.getSnapshot();
    const rel = snap.relationships['char_001->char_002'];
    expect(rel).toBeDefined();
    expect(rel.trustScore).toBe(20);  // 30 + (-10)
  });
});

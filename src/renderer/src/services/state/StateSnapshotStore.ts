/**
 * L1 状态层 - 状态快照存储
 *
 * 职责：
 * 1. 维护当前快照（"单一真相源"）
 * 2. 维护版本历史（每章一份，可回放任意历史状态）
 * 3. 写入时冲突检测
 * 4. 别名表管理（name → entityId）+ 实体解析
 *
 * 存储：内存 + 接口抽象。后续可平滑替换为 IndexedDB（接口不变）。
 *
 * 不变性约定：
 * - 历史版本一旦 commit 即不可变
 * - 当前快照可变，但只能通过 ChangesApplier 修改（保证可追溯）
 */

import {
  AliasMapSchema,
  StateSnapshotSchema,
  type AliasMap,
  type Change,
  type ChangesPayload,
  type EntityRef,
  type StateConflict,
  type StateSnapshot,
  type VersionedSnapshot,
} from './types';

// ============================================================
// 深拷贝工具
// ============================================================

/** 结构化深拷贝（快照都是 JSON 可序列化的）。 */
function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

// ============================================================
// 快照存储
// ============================================================

/**
 * 快照存储。每个项目一个实例。
 *
 * 通过 createStateStore(projectId) 创建，避免全局单例导致的跨项目污染。
 */
export class StateSnapshotStore {
  /** 当前快照（最新状态） */
  private _current: StateSnapshot;
  /** 版本历史：chapter → 不可变快照记录 */
  private readonly _versions = new Map<number, VersionedSnapshot>();
  /** 别名表 */
  private _aliasMap: AliasMap = { aliases: {}, primaryNames: {} };
  /** 实体类型 → 已分配的最大序号（用于生成新 ID） */
  private readonly _seqCounters = new Map<string, number>();

  constructor(projectId: string) {
    this._current = this.createEmptySnapshot(projectId);
  }

  // ============================================================
  // 读取
  // ============================================================

  /** 获取当前快照（返回深拷贝，防止外部直接改）。 */
  getSnapshot(): StateSnapshot {
    return deepClone(this._current);
  }

  /** 获取只读引用（性能优先，调用方不得修改）。 */
  peekSnapshot(): Readonly<StateSnapshot> {
    return this._current;
  }

  /** 获取某历史章节的快照（回放）。 */
  getSnapshotAt(chapter: number): StateSnapshot | null {
    // 找到 <= chapter 的最大版本
    let target: VersionedSnapshot | null = null;
    for (const [ver, rec] of this._versions) {
      if (ver <= chapter && (!target || ver > target.version)) {
        target = rec;
      }
    }
    // chapter === 0 或无版本时返回当前（初始状态）
    if (!target && chapter === 0) return deepClone(this._current);
    return target ? deepClone(target.snapshot) : null;
  }

  /** 获取所有版本号（升序）。 */
  getVersions(): number[] {
    return Array.from(this._versions.keys()).sort((a, b) => a - b);
  }

  /** 获取最新版本号（无版本返回 0）。 */
  getLatestVersion(): number {
    const versions = this.getVersions();
    return versions.length > 0 ? versions[versions.length - 1] : 0;
  }

  /** 获取版本记录（含 CHANGES）。 */
  getVersionRecord(chapter: number): VersionedSnapshot | null {
    const rec = this._versions.get(chapter);
    return rec ? deepClone(rec) : null;
  }

  // ============================================================
  // 写入
  // ============================================================

  /**
   * 直接设置当前快照（用于初始化/恢复）。
   * 会做 schema 校验。
   */
  setSnapshot(snapshot: unknown): { success: boolean; error?: string } {
    const result = StateSnapshotSchema.safeParse(snapshot);
    if (!result.success) {
      return { success: false, error: `快照校验失败: ${result.error.issues.slice(0, 2).map(i => i.path.join('.') + ': ' + i.message).join('; ')}` };
    }
    this._current = result.data;
    return { success: true };
  }

  /**
   * 提交一个新版本（内部使用，外部应通过 ChangesApplier.commit）。
   *
   * @param chapter 章节号（必须 > 最新版本）
   * @param snapshot 写入 CHANGES 后的新快照
   * @param changes 产生该版本的 CHANGES
   */
  commitVersion(
    chapter: number,
    snapshot: StateSnapshot,
    changes: ChangesPayload,
  ): { success: boolean; error?: string } {
    if (chapter <= this.getLatestVersion()) {
      return { success: false, error: `章节号 ${chapter} 必须大于当前最新版本 ${this.getLatestVersion()}` };
    }

    const validated = StateSnapshotSchema.safeParse(snapshot);
    if (!validated.success) {
      return { success: false, error: '快照校验失败' };
    }

    const record: VersionedSnapshot = {
      version: chapter,
      snapshot: deepClone(validated.data),
      changes: deepClone(changes),
      timestamp: new Date().toISOString(),
    };

    this._versions.set(chapter, record);
    this._current = deepClone(validated.data);
    return { success: true };
  }

  /**
   * 回滚到指定版本（丢弃之后的版本）。
   * 用于"时光倒流"重写章节。
   */
  rollbackTo(chapter: number): { success: boolean; error?: string } {
    if (!this._versions.has(chapter) && chapter !== 0) {
      return { success: false, error: `版本 ${chapter} 不存在` };
    }

    // 丢弃 > chapter 的所有版本
    for (const ver of Array.from(this._versions.keys())) {
      if (ver > chapter) {
        this._versions.delete(ver);
      }
    }

    // 更新当前快照
    if (chapter === 0) {
      const projectId = this._current.projectId;
      this._current = this.createEmptySnapshot(projectId);
    } else {
      const rec = this._versions.get(chapter)!;
      this._current = deepClone(rec.snapshot);
    }
    return { success: true };
  }

  // ============================================================
  // 冲突检测
  // ============================================================

  /**
   * 检测一组 CHANGES 与当前快照的潜在冲突。
   * 不实际写入，只报告。ChangesApplier 在写入前调用。
   */
  detectConflicts(changes: ChangesPayload, chapter: number): StateConflict[] {
    const conflicts: StateConflict[] = [];

    for (const change of changes.changes) {
      const detected = this.detectSingleChangeConflict(change, chapter);
      conflicts.push(...detected);
    }

    return conflicts;
  }

  /**
   * 检测单条变更的冲突（公开方法，供 ChangesApplier 精确判断每条 change）。
   */
  detectSingleChangeConflict(change: Change, chapter: number): StateConflict[] {
    const conflicts: StateConflict[] = [];

    switch (change.type) {
      case 'character_state': {
        const entityId = this.resolveEntity(change.entity);
        if (!entityId) {
          conflicts.push(this.makeConflict('missing_entity', change.entity.name, change.field,
            null, change.new, chapter, `角色 ${change.entity.name} 未登记`, 'warning'));
          break;
        }
        const charState = this._current.characters[entityId];
        if (!charState) break;

        // old 值校验：CHANGES 声称的 old 必须与快照一致
        if (change.old !== undefined) {
          const actualOld = (charState as any)[change.field];
          if (change.old !== actualOld && !this.valuesLooselyEqual(change.old, actualOld)) {
            conflicts.push(this.makeConflict('value_mismatch', entityId, change.field,
              actualOld, change.new, chapter,
              `${change.entity.name} 的 ${change.field}：CHANGES 声称旧值为 "${fmt(change.old)}"，实际快照为 "${fmt(actualOld)}"`,
              'critical'));
          }
        }
        // 死人复活检测
        if (change.field === 'alive' && change.new === true && charState.alive === false) {
          conflicts.push(this.makeConflict('value_mismatch', entityId, 'alive',
            false, true, chapter, `${change.entity.name} 已死亡，不能复活`, 'critical'));
        }
        break;
      }

      case 'character_location': {
        const entityId = this.resolveEntity(change.entity);
        if (!entityId) break;
        const currentLoc = this._current.characterLocations[entityId];
        if (change.from && currentLoc) {
          const fromId = this.resolveEntity(change.from);
          if (fromId && fromId !== currentLoc) {
            const fromName = this._aliasMap.primaryNames[fromId] || fromId;
            const curName = this._aliasMap.primaryNames[currentLoc] || currentLoc;
            conflicts.push(this.makeConflict('value_mismatch', entityId, 'location',
              currentLoc, change.to.id || change.to.name, chapter,
              `${change.entity.name} 的出发地声明为 "${fromName}"，实际快照显示在 "${curName}"`,
              'critical'));
          }
        }
        break;
      }

      case 'foreshadow': {
        if (change.action === 'setup') {
          // 重复埋设检测
          const existing = this._current.foreshadows[change.id];
          if (existing && existing.status !== 'abandoned') {
            conflicts.push(this.makeConflict('value_mismatch', change.id, 'status',
              existing.status, 'setup', chapter,
              `伏笔 #${change.id} 已存在（状态 ${existing.status}），不能重复埋设`,
              'warning'));
          }
        } else if (change.action === 'payoff' || change.action === 'reinforce') {
          // 未埋设就回收检测
          const existing = this._current.foreshadows[change.id];
          if (!existing) {
            conflicts.push(this.makeConflict('missing_entity', change.id, 'foreshadow',
              null, change.action, chapter,
              `伏笔 #${change.id} 从未埋设，不能 ${change.action === 'payoff' ? '回收' : '强化'}`,
              'critical'));
          }
        }
        break;
      }

      case 'secret_reveal': {
        const existing = this._current.secrets[change.id];
        if (existing && change.newlyInformed) {
          // 重复告知检测
          for (const newcomer of change.newlyInformed) {
            const newId = this.resolveEntity(newcomer);
            if (newId && existing.knownBy.includes(newId)) {
              conflicts.push(this.makeConflict('value_mismatch', change.id, 'knownBy',
                existing.knownBy, newId, chapter,
                `秘密 #${change.id} 已被 ${newcomer.name} 知晓，不能重复告知`,
                'warning'));
            }
          }
        }
        break;
      }

      default:
        // 其他类型暂不做细粒度冲突检测（交给 G3 门禁 + G7 LLM 审查）
        break;
    }

    return conflicts;
  }

  private valuesLooselyEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null && b == null) return true;
    // 字符串比较时去空格
    if (typeof a === 'string' && typeof b === 'string') {
      return a.trim() === b.trim();
    }
    return false;
  }

  private makeConflict(
    kind: StateConflict['kind'],
    entityId: string,
    field: string,
    existingValue: unknown,
    newValue: unknown,
    chapter: number,
    description: string,
    severity: StateConflict['severity'],
  ): StateConflict {
    return { kind, entityId, field, existingValue, newValue, chapter, description, severity };
  }

  // ============================================================
  // 别名表与实体解析
  // ============================================================

  /** 注册别名：alias → entityId。 */
  registerAlias(alias: string, entityId: string): void {
    const key = alias.trim().toLowerCase();
    if (key) this._aliasMap.aliases[key] = entityId;
  }

  /** 批量注册实体的主名称 + 别名。 */
  registerEntity(entityId: string, primaryName: string, aliases: string[] = []): void {
    this._aliasMap.primaryNames[entityId] = primaryName;
    this.registerAlias(primaryName, entityId);
    for (const a of aliases) this.registerAlias(a, entityId);
  }

  /** 解析实体引用 → entityId。找不到返回 null。 */
  resolveEntity(ref: EntityRef | string): string | null {
    // 直接传 ID
    if (typeof ref === 'string') {
      // 形如 char_001 直接返回
      if (/^(char|loc|fac|item)_\w+$/i.test(ref)) return ref;
      return this._aliasMap.aliases[ref.trim().toLowerCase()] ?? null;
    }
    // ID 优先
    if (ref.id) return ref.id;
    // 名称兜底
    if (ref.name) {
      return this._aliasMap.aliases[ref.name.trim().toLowerCase()] ?? null;
    }
    return null;
  }

  /** 获取别名表（深拷贝）。 */
  getAliasMap(): AliasMap {
    return deepClone(this._aliasMap);
  }

  /** 设置别名表（用于恢复）。 */
  setAliasMap(map: unknown): { success: boolean; error?: string } {
    const result = AliasMapSchema.safeParse(map);
    if (!result.success) return { success: false, error: '别名表校验失败' };
    this._aliasMap = result.data;
    return { success: true };
  }

  /**
   * 生成新实体 ID。
   * @param type 实体类型前缀（char/loc/fac/item）
   * @param suggestedId 建议 ID（若已存在则忽略）
   */
  generateEntityId(type: 'char' | 'loc' | 'fac' | 'item', suggestedId?: string): string {
    if (suggestedId && !this._aliasMap.primaryNames[suggestedId]) {
      return suggestedId;
    }
    const counter = (this._seqCounters.get(type) ?? 0) + 1;
    this._seqCounters.set(type, counter);
    return `${type}_${String(counter).padStart(3, '0')}`;
  }

  // ============================================================
  // 查询辅助
  // ============================================================

  /** 获取活跃伏笔（未回收且未放弃）。 */
  getActiveForeshadows() {
    return Object.values(this._current.foreshadows).filter(
      f => f.status !== 'payoff' && f.status !== 'resolved' && f.status !== 'abandoned',
    );
  }

  /** 获取逾期伏笔（计划回收章节 < 当前章节 且仍未回收）。 */
  getOverdueForeshadows(currentChapter: number) {
    return Object.values(this._current.foreshadows).filter(
      f => f.plannedPayoffChapter !== undefined
        && f.plannedPayoffChapter < currentChapter
        && f.status !== 'payoff'
        && f.status !== 'resolved',
    );
  }

  /** 获取角色当前状态（深拷贝）。 */
  getCharacter(entityId: string) {
    const char = this._current.characters[entityId];
    return char ? deepClone(char) : null;
  }

  // ============================================================
  // 持久化（序列化/反序列化）
  // ============================================================

  /** 导出完整状态（用于持久化到 IndexedDB/文件）。 */
  export(): {
    current: StateSnapshot;
    versions: VersionedSnapshot[];
    aliasMap: AliasMap;
  } {
    return {
      current: deepClone(this._current),
      versions: Array.from(this._versions.values()).map(v => deepClone(v)),
      aliasMap: deepClone(this._aliasMap),
    };
  }

  /** 导入完整状态（用于从持久化恢复）。 */
  import(data: {
    current: StateSnapshot;
    versions?: VersionedSnapshot[];
    aliasMap?: AliasMap;
  }): { success: boolean; error?: string } {
    const snapResult = this.setSnapshot(data.current);
    if (!snapResult.success) return snapResult;

    this._versions.clear();
    if (data.versions) {
      for (const v of data.versions) {
        this._versions.set(v.version, deepClone(v));
      }
    }

    if (data.aliasMap) {
      const aliasResult = this.setAliasMap(data.aliasMap);
      if (!aliasResult.success) return aliasResult;
    }
    return { success: true };
  }

  /** 重置到空状态。 */
  reset(): void {
    const projectId = this._current.projectId;
    this._current = this.createEmptySnapshot(projectId);
    this._versions.clear();
    this._aliasMap = { aliases: {}, primaryNames: {} };
    this._seqCounters.clear();
  }

  // ============================================================
  // 内部
  // ============================================================

  private createEmptySnapshot(projectId: string): StateSnapshot {
    return {
      projectId,
      chapter: 0,
      characters: {},
      characterAppearances: {},
      relationships: {},
      characterLocations: {},
      conflicts: {},
      foreshadows: {},
      plotNodes: [],
      locations: {},
      locationFeatures: {},
      factions: {},
      timeline: { currentTime: '', elapsed: '', currentChapter: 0, anchors: [] },
      worldRules: [],
      items: {},
      secrets: {},
      oaths: {},
      deadlines: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}

function fmt(value: unknown): string {
  if (value === undefined || value === null) return '∅';
  if (Array.isArray(value)) return `[${value.join(', ')}]`;
  return String(value);
}

// ============================================================
// 工厂函数 + 实例缓存
// ============================================================

/** 每个项目一个 store 实例，避免跨项目污染。 */
const _stores = new Map<string, StateSnapshotStore>();

/** 获取或创建项目的状态存储。 */
export function createStateStore(projectId: string): StateSnapshotStore {
  let store = _stores.get(projectId);
  if (!store) {
    store = new StateSnapshotStore(projectId);
    _stores.set(projectId, store);
  }
  return store;
}

/** 获取已存在的 store（不创建）。 */
export function getStateStore(projectId: string): StateSnapshotStore | null {
  return _stores.get(projectId) ?? null;
}

/** 销毁项目的 store（用于项目删除）。 */
export function destroyStateStore(projectId: string): void {
  _stores.delete(projectId);
}

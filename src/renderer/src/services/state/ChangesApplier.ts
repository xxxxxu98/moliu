/**
 * L1 状态层 - CHANGES 应用器
 *
 * 职责：把 AI 声明的 CHANGES 安全地合并到状态快照。
 *
 * 事务化保证：要么全部成功，要么快照不变。
 * 冲突分级处理：
 * - critical 冲突：strict 模式拒绝整批；lenient 模式跳过该条
 * - warning 冲突：记录但不阻断
 *
 * 这是"概率型 AI 输出"到"确定性状态"的转换边界。
 * 所有写入都经过这里，保证可追溯 + 可回滚。
 */

import { StateSnapshotStore } from './StateSnapshotStore';
import {
  type Change,
  type ChangesPayload,
  type EntityRef,
  type EntityType,
  type StateConflict,
  type StateSnapshot,
} from './types';

// ============================================================
// 类型
// ============================================================

export type ApplyStrictness = 'strict' | 'lenient';

export interface ApplyOptions {
  /** 严格度：strict 遇 critical 冲突拒绝整批；lenient 跳过冲突条目 */
  strictness?: ApplyStrictness;
  /** 是否允许自动创建未登记实体（默认 true，受 G6 阈值控制） */
  allowAutoCreateEntities?: boolean;
  /** 是否在实际写入前做 dry-run（不 commit） */
  dryRun?: boolean;
}

export interface ApplyResult {
  /** 是否成功提交（strict 下有 critical 冲突则为 false） */
  success: boolean;
  /** 应用后的新快照（success=true 时有值） */
  newSnapshot?: StateSnapshot;
  /** 实际应用的变更条数 */
  appliedCount: number;
  /** 跳过的变更条数（因冲突） */
  skippedCount: number;
  /** 检测到的所有冲突 */
  conflicts: StateConflict[];
  /** 自动创建的实体 ID 列表 */
  createdEntities: string[];
  /** 错误信息 */
  errors: string[];
  /** 新版本号 */
  newVersion?: number;
}

// ============================================================
// 应用器
// ============================================================

export class ChangesApplier {
  constructor(private readonly store: StateSnapshotStore) {}

  /**
   * 应用 CHANGES 到快照。
   *
   * 流程：
   * 1. 冲突检测（基于当前快照）
   * 2. strict 模式遇 critical → 拒绝
   * 3. 深拷贝快照作为工作副本
   * 4. 逐条应用（跳过 critical 冲突条目）
   * 5. 更新快照元数据（chapter / updatedAt）
   * 6. commit 为新版本（除非 dryRun）
   */
  apply(changes: ChangesPayload, options: ApplyOptions = {}): ApplyResult {
    const {
      strictness = 'lenient',
      allowAutoCreateEntities = true,
      dryRun = false,
    } = options;

    const result: ApplyResult = {
      success: false,
      appliedCount: 0,
      skippedCount: 0,
      conflicts: [],
      createdEntities: [],
      errors: [],
    };

    const chapter = changes.chapter;

    // 1. 冲突检测（每条 change 独立检测，便于精确跳过冲突条目）
    // 注意：检测基于"当前快照"，而应用是顺序累加的——所以这里只做"批前静态检测"，
    // 决定哪些条目在 strict 下整批拒绝、在 lenient 下跳过。
    // 批内自洽性（如同一批里两条相互冲突）由 schema 和应用顺序保证。
    const perChangeConflicts = changes.changes.map(change =>
      this.store.detectSingleChangeConflict(change, chapter),
    );
    const allConflicts = perChangeConflicts.flat();
    result.conflicts = allConflicts;

    const criticalConflicts = allConflicts.filter(c => c.severity === 'critical');

    // 2. strict 模式：有 critical 冲突直接拒绝
    if (strictness === 'strict' && criticalConflicts.length > 0) {
      result.errors = criticalConflicts.map(c => c.description);
      result.skippedCount = changes.changes.length;
      return result;
    }

    // 3. 工作副本
    const working = this.store.getSnapshot();

    // 标记哪些 change 索引有 critical 冲突（lenient 模式跳过这些）
    const skipIndices = new Set<number>();
    perChangeConflicts.forEach((confs, idx) => {
      if (confs.some(c => c.severity === 'critical')) {
        skipIndices.add(idx);
      }
    });

    // 4. 逐条应用（跳过有 critical 冲突的条目）
    changes.changes.forEach((change, idx) => {
      if (skipIndices.has(idx)) {
        const conf = perChangeConflicts[idx].find(c => c.severity === 'critical');
        result.errors.push(`跳过冲突变更: ${conf?.description ?? '未知冲突'}`);
        result.skippedCount++;
        return;
      }
      const applied = this.applyOne(change, working, chapter, {
        allowAutoCreateEntities,
        createdEntities: result.createdEntities,
        warnings: result.errors,
      });

      if (applied) {
        result.appliedCount++;
      } else {
        result.skippedCount++;
      }
    });

    // 5. 更新元数据
    working.chapter = chapter;
    working.timeline = { ...working.timeline, currentChapter: chapter };
    working.updatedAt = new Date().toISOString();

    // 6. 校验工作副本
    if (!this.validateSnapshot(working, result.errors)) {
      return result;
    }

    // 7. commit（除非 dryRun）
    if (!dryRun) {
      const commitResult = this.store.commitVersion(chapter, working, changes);
      if (!commitResult.success) {
        result.errors.push(commitResult.error || 'commit 失败');
        return result;
      }
      result.newVersion = chapter;
      result.newSnapshot = working;
    } else {
      result.newSnapshot = working;
    }

    result.success = true;
    return result;
  }

  // ============================================================
  // 单条变更应用
  // ============================================================

  private applyOne(
    change: Change,
    snapshot: StateSnapshot,
    chapter: number,
    ctx: {
      allowAutoCreateEntities: boolean;
      createdEntities: string[];
      warnings: string[];
    },
  ): boolean {
    // 冲突跳过逻辑已在 apply() 主流程里按 changeIndex 处理，
    // 此处假设传入的 change 已通过冲突过滤（或为 warning 级冲突可放行）。
    try {
      switch (change.type) {
        case 'character_state':
          return this.applyCharacterState(change, snapshot, chapter, ctx);
        case 'character_location':
          return this.applyCharacterLocation(change, snapshot, chapter, ctx);
        case 'character_appearance':
          return this.applyCharacterAppearance(change, snapshot, chapter, ctx);
        case 'relationship':
          return this.applyRelationship(change, snapshot, chapter, ctx);
        case 'conflict_progress':
          return this.applyConflictProgress(change, snapshot, chapter);
        case 'foreshadow':
          return this.applyForeshadow(change, snapshot, chapter);
        case 'plot_node':
          return this.applyPlotNode(change, snapshot, chapter);
        case 'location_state':
          return this.applyLocationState(change, snapshot, chapter, ctx);
        case 'faction_state':
          return this.applyFactionState(change, snapshot, chapter, ctx);
        case 'timeline':
          return this.applyTimeline(change, snapshot, chapter);
        case 'item_transfer':
          return this.applyItemTransfer(change, snapshot, chapter, ctx);
        case 'secret_reveal':
          return this.applySecretReveal(change, snapshot, chapter, ctx);
        case 'oath_change':
          return this.applyOathChange(change, snapshot, chapter, ctx);
        case 'deadline_change':
          return this.applyDeadlineChange(change, snapshot, chapter);
        default:
          ctx.warnings.push(`未知变更类型，跳过: ${JSON.stringify(change).slice(0, 100)}`);
          return false;
      }
    } catch (err) {
      ctx.warnings.push(`应用变更失败 (${change.type}): ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  // --- 角色维度 ---

  private applyCharacterState(
    change: Extract<Change, { type: 'character_state' }>,
    snapshot: StateSnapshot,
    chapter: number,
    ctx: { allowAutoCreateEntities: boolean; createdEntities: string[]; warnings: string[] },
  ): boolean {
    let entityId = this.store.resolveEntity(change.entity);
    if (!entityId) {
      if (!ctx.allowAutoCreateEntities) return false;
      entityId = this.store.generateEntityId('char', change.entity.id);
      snapshot.characters[entityId] = {
        entityId,
        name: change.entity.name,
        powerLevel: '',
        abilities: [],
        mentalState: '',
        role: '',
        alive: true,
        lastUpdatedChapter: 0,
      };
      this.store.registerEntity(entityId, change.entity.name);
      ctx.createdEntities.push(entityId);
    }

    const char = snapshot.characters[entityId];
    if (!char) return false;

    switch (change.field) {
      case 'powerLevel':
        char.powerLevel = String(change.new ?? '');
        break;
      case 'abilities':
        char.abilities = Array.isArray(change.new) ? change.new.map(String) : char.abilities;
        break;
      case 'mentalState':
        char.mentalState = String(change.new ?? '');
        break;
      case 'alive':
        char.alive = Boolean(change.new);
        break;
      case 'role':
        char.role = String(change.new ?? '');
        break;
    }
    char.lastUpdatedChapter = chapter;
    return true;
  }

  private applyCharacterLocation(
    change: Extract<Change, { type: 'character_location' }>,
    snapshot: StateSnapshot,
    chapter: number,
    ctx: { allowAutoCreateEntities: boolean; createdEntities: string[]; warnings: string[] },
  ): boolean {
    let charId = this.store.resolveEntity(change.entity);
    if (!charId) {
      if (!ctx.allowAutoCreateEntities) return false;
      charId = this.store.generateEntityId('char', change.entity.id);
      snapshot.characters[charId] = {
        entityId: charId,
        name: change.entity.name,
        powerLevel: '',
        abilities: [],
        mentalState: '',
        role: '',
        alive: true,
        lastUpdatedChapter: chapter,
      };
      this.store.registerEntity(charId, change.entity.name);
      ctx.createdEntities.push(charId);
    }

    let locId = this.store.resolveEntity(change.to);
    if (!locId) {
      if (!ctx.allowAutoCreateEntities) return false;
      locId = this.store.generateEntityId('loc', change.to.id);
      snapshot.locations[locId] = {
        id: locId,
        name: change.to.name,
        status: '正常',
        lastUpdatedChapter: chapter,
      };
      this.store.registerEntity(locId, change.to.name);
      ctx.createdEntities.push(locId);
    }

    snapshot.characterLocations[charId] = locId;
    return true;
  }

  private applyCharacterAppearance(
    change: Extract<Change, { type: 'character_appearance' }>,
    snapshot: StateSnapshot,
    chapter: number,
    ctx: { allowAutoCreateEntities: boolean; createdEntities: string[]; warnings: string[] },
  ): boolean {
    // 外貌变化罕见，记 warning（G4 门禁会重点审查）
    ctx.warnings.push(`[外貌变化警告] ${change.entity.name} 的 ${change.field} 变化，请 G4 门禁复核`);

    let entityId = this.store.resolveEntity(change.entity);
    if (!entityId) {
      if (!ctx.allowAutoCreateEntities) return false;
      entityId = this.store.generateEntityId('char', change.entity.id);
      ctx.createdEntities.push(entityId);
      this.store.registerEntity(entityId, change.entity.name);
    }

    let appearance = snapshot.characterAppearances[entityId];
    if (!appearance) {
      appearance = { entityId, features: [], personalityTags: [], speakingStyle: '' };
      snapshot.characterAppearances[entityId] = appearance;
    }

    switch (change.field) {
      case 'features':
        appearance.features = Array.isArray(change.new) ? change.new.map(String) : appearance.features;
        break;
      case 'personalityTags':
        appearance.personalityTags = Array.isArray(change.new) ? change.new.map(String) : appearance.personalityTags;
        break;
      case 'speakingStyle':
        appearance.speakingStyle = String(change.new ?? '');
        break;
    }
    return true;
  }

  private applyRelationship(
    change: Extract<Change, { type: 'relationship' }>,
    snapshot: StateSnapshot,
    chapter: number,
    ctx: { allowAutoCreateEntities: boolean; createdEntities: string[]; warnings: string[] },
  ): boolean {
    let fromId = this.store.resolveEntity(change.from);
    let toId = this.store.resolveEntity(change.to);
    if (!fromId || !toId) {
      if (!ctx.allowAutoCreateEntities) return false;
      if (!fromId) {
        fromId = this.store.generateEntityId('char', change.from.id);
        ctx.createdEntities.push(fromId);
        this.store.registerEntity(fromId, change.from.name);
      }
      if (!toId) {
        toId = this.store.generateEntityId('char', change.to.id);
        ctx.createdEntities.push(toId);
        this.store.registerEntity(toId, change.to.name);
      }
    }

    const relId = `${fromId}->${toId}`;
    const existing = snapshot.relationships[relId];
    const trustScore = existing
      ? Math.max(-100, Math.min(100, existing.trustScore + (change.delta ?? 0)))
      : Math.max(-100, Math.min(100, change.delta ?? 0));

    snapshot.relationships[relId] = {
      id: relId,
      fromEntityId: fromId,
      toEntityId: toId,
      type: change.relationType,
      trustScore,
      description: existing?.description || '',
      establishedChapter: existing?.establishedChapter ?? chapter,
    };
    return true;
  }

  // --- 剧情维度 ---

  private applyConflictProgress(
    change: Extract<Change, { type: 'conflict_progress' }>,
    snapshot: StateSnapshot,
    chapter: number,
  ): boolean {
    const existing = snapshot.conflicts[change.conflictId];
    const progress = existing
      ? Math.max(0, Math.min(100, existing.progress + (change.progressDelta ?? 0)))
      : Math.max(0, Math.min(100, change.progressDelta ?? 0));

    snapshot.conflicts[change.conflictId] = {
      id: change.conflictId,
      name: change.name || existing?.name || change.conflictId,
      status: change.newStatus ?? existing?.status ?? 'active',
      progress,
      involvedEntities: existing?.involvedEntities ?? [],
      lastEvent: change.reason || existing?.lastEvent || '',
      lastUpdatedChapter: chapter,
    };
    return true;
  }

  private applyForeshadow(
    change: Extract<Change, { type: 'foreshadow' }>,
    snapshot: StateSnapshot,
    chapter: number,
  ): boolean {
    const existing = snapshot.foreshadows[change.id];

    const statusMap: Record<string, StateSnapshot['foreshadows'][string]['status']> = {
      setup: 'setup',
      hint: 'hinted',
      reinforce: 'reinforced',
      payoff: 'payoff',
      abandon: 'abandoned',
    };

    snapshot.foreshadows[change.id] = {
      id: change.id,
      hint: change.hint || existing?.hint || '',
      tier: change.tier ?? existing?.tier ?? 'minor',
      status: statusMap[change.action] ?? existing?.status ?? 'setup',
      setupChapter: existing?.setupChapter ?? (change.action === 'setup' ? chapter : 0),
      plannedPayoffChapter: change.plannedPayoffChapter ?? existing?.plannedPayoffChapter,
      actualPayoffChapter: change.action === 'payoff' ? chapter : existing?.actualPayoffChapter,
      relatedEntities: existing?.relatedEntities ?? [],
    };
    return true;
  }

  private applyPlotNode(
    change: Extract<Change, { type: 'plot_node' }>,
    snapshot: StateSnapshot,
    chapter: number,
  ): boolean {
    snapshot.plotNodes.push({
      id: `pn_${chapter}_${snapshot.plotNodes.length + 1}`,
      chapter,
      keywords: change.keywords,
      summary: change.summary,
      involvedCharacters: change.involvedCharacters,
      strand: change.strand,
    });
    return true;
  }

  // --- 世界维度 ---

  private applyLocationState(
    change: Extract<Change, { type: 'location_state' }>,
    snapshot: StateSnapshot,
    chapter: number,
    ctx: { allowAutoCreateEntities: boolean; createdEntities: string[]; warnings: string[] },
  ): boolean {
    let entityId = this.store.resolveEntity(change.entity);
    if (!entityId) {
      if (!ctx.allowAutoCreateEntities) return false;
      entityId = this.store.generateEntityId('loc', change.entity.id);
      ctx.createdEntities.push(entityId);
      this.store.registerEntity(entityId, change.entity.name);
      snapshot.locations[entityId] = {
        id: entityId,
        name: change.entity.name,
        status: '正常',
        lastUpdatedChapter: chapter,
      };
    }

    const loc = snapshot.locations[entityId];
    if (loc && change.newStatus) {
      loc.status = change.newStatus;
      loc.lastUpdatedChapter = chapter;
    }
    return true;
  }

  private applyFactionState(
    change: Extract<Change, { type: 'faction_state' }>,
    snapshot: StateSnapshot,
    chapter: number,
    ctx: { allowAutoCreateEntities: boolean; createdEntities: string[]; warnings: string[] },
  ): boolean {
    let entityId = this.store.resolveEntity(change.entity);
    if (!entityId) {
      if (!ctx.allowAutoCreateEntities) return false;
      entityId = this.store.generateEntityId('fac', change.entity.id);
      ctx.createdEntities.push(entityId);
      this.store.registerEntity(entityId, change.entity.name);
      snapshot.factions[entityId] = {
        id: entityId,
        name: change.entity.name,
        status: '正常',
        powerLevel: '',
        attitudeToProtagonist: 'neutral',
        lastUpdatedChapter: chapter,
      };
    }

    const fac = snapshot.factions[entityId];
    if (fac) {
      if (change.newStatus) fac.status = change.newStatus;
      if (change.newAttitude) fac.attitudeToProtagonist = change.newAttitude;
      fac.lastUpdatedChapter = chapter;
    }
    return true;
  }

  private applyTimeline(
    change: Extract<Change, { type: 'timeline' }>,
    snapshot: StateSnapshot,
    chapter: number,
  ): boolean {
    snapshot.timeline = {
      ...snapshot.timeline,
      currentTime: change.currentTime || snapshot.timeline.currentTime,
      elapsed: change.elapsed || snapshot.timeline.elapsed,
      currentChapter: chapter,
      anchors: change.event
        ? [...snapshot.timeline.anchors, { chapter, event: change.event, time: change.currentTime }]
        : snapshot.timeline.anchors,
    };
    return true;
  }

  // --- 契约维度 ---

  private applyItemTransfer(
    change: Extract<Change, { type: 'item_transfer' }>,
    snapshot: StateSnapshot,
    chapter: number,
    ctx: { allowAutoCreateEntities: boolean; createdEntities: string[]; warnings: string[] },
  ): boolean {
    let itemId = this.store.resolveEntity(change.item);
    let ownerId: string | null = null;

    if (!itemId) {
      if (!ctx.allowAutoCreateEntities) return false;
      itemId = this.store.generateEntityId('item', change.item.id);
      ctx.createdEntities.push(itemId);
      this.store.registerEntity(itemId, change.item.name);
    }

    if (change.toOwner) {
      ownerId = this.store.resolveEntity(change.toOwner);
      if (!ownerId && ctx.allowAutoCreateEntities) {
        ownerId = this.store.generateEntityId('char', change.toOwner.id);
        ctx.createdEntities.push(ownerId);
        this.store.registerEntity(ownerId, change.toOwner.name);
      }
    }

    snapshot.items[itemId] = {
      id: itemId,
      name: change.item.name,
      ownerId: ownerId ?? '',
      status: change.newStatus ?? snapshot.items[itemId]?.status ?? '完好',
      acquiredChapter: snapshot.items[itemId]?.acquiredChapter ?? chapter,
    };
    return true;
  }

  private applySecretReveal(
    change: Extract<Change, { type: 'secret_reveal' }>,
    snapshot: StateSnapshot,
    chapter: number,
    ctx: { allowAutoCreateEntities: boolean; createdEntities: string[]; warnings: string[] },
  ): boolean {
    let existing = snapshot.secrets[change.id];
    if (!existing) {
      existing = {
        id: change.id,
        content: change.content,
        knownBy: [],
        status: 'hidden',
        setupChapter: chapter,
      };
      snapshot.secrets[change.id] = existing;
    }

    // 解析新知情角色
    const newKnown: string[] = [];
    for (const newcomer of change.newlyInformed) {
      let id = this.store.resolveEntity(newcomer);
      if (!id && ctx.allowAutoCreateEntities) {
        id = this.store.generateEntityId('char', newcomer.id);
        ctx.createdEntities.push(id);
        this.store.registerEntity(id, newcomer.name);
      }
      if (id && !existing.knownBy.includes(id)) {
        newKnown.push(id);
      }
    }

    existing.knownBy = [...existing.knownBy, ...newKnown];
    if (change.newStatus) existing.status = change.newStatus;
    else if (newKnown.length > 0 && existing.status === 'hidden') {
      existing.status = 'partially_revealed';
    }
    return true;
  }

  private applyOathChange(
    change: Extract<Change, { type: 'oath_change' }>,
    snapshot: StateSnapshot,
    chapter: number,
    ctx: { allowAutoCreateEntities: boolean; createdEntities: string[]; warnings: string[] },
  ): boolean {
    let makerId = '';
    if (change.oathMaker) {
      makerId = this.store.resolveEntity(change.oathMaker) ?? '';
      if (!makerId && ctx.allowAutoCreateEntities) {
        makerId = this.store.generateEntityId('char', change.oathMaker.id);
        ctx.createdEntities.push(makerId);
        this.store.registerEntity(makerId, change.oathMaker.name);
      }
    }

    const existing = snapshot.oaths[change.id];
    snapshot.oaths[change.id] = {
      id: change.id,
      content: change.content || existing?.content || '',
      oathMakerId: makerId || existing?.oathMakerId || '',
      targetEntityIds: existing?.targetEntityIds ?? [],
      status: change.newStatus ?? existing?.status ?? 'active',
      conditions: existing?.conditions ?? '',
      consequence: existing?.consequence ?? '',
      setupChapter: existing?.setupChapter ?? chapter,
    };
    return true;
  }

  private applyDeadlineChange(
    change: Extract<Change, { type: 'deadline_change' }>,
    snapshot: StateSnapshot,
    chapter: number,
  ): boolean {
    const existing = snapshot.deadlines[change.id];
    snapshot.deadlines[change.id] = {
      id: change.id,
      event: change.event || existing?.event || change.id,
      status: change.newStatus ?? existing?.status ?? 'pending',
      remaining: change.remaining ?? existing?.remaining ?? '',
      chaptersUntil: change.chaptersUntil ?? existing?.chaptersUntil,
      triggerCondition: existing?.triggerCondition ?? '',
      setupChapter: existing?.setupChapter ?? chapter,
    };
    return true;
  }

  // ============================================================
  // 辅助
  // ============================================================

  private validateSnapshot(snapshot: StateSnapshot, errors: string[]): boolean {
    // 基本完整性检查（详细 schema 校验由 store.commitVersion 完成）
    if (!snapshot.projectId) {
      errors.push('快照缺少 projectId');
      return false;
    }
    return true;
  }

  /** 把实体类型前缀映射到 EntityType 常量。 */
  private entityTypeFromPrefix(prefix: string): EntityType {
    switch (prefix) {
      case 'char': return 'character' as EntityType;
      case 'loc': return 'location' as EntityType;
      case 'fac': return 'faction' as EntityType;
      case 'item': return 'item' as EntityType;
      default: return 'character' as EntityType;
    }
  }
}

// ============================================================
// 工厂
// ============================================================

export function createChangesApplier(store: StateSnapshotStore): ChangesApplier {
  return new ChangesApplier(store);
}

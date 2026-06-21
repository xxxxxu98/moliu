/**
 * L1 状态层 - 快照构建器
 *
 * 职责：从现有项目数据（characters / worldSchema / foreshadows / chapterMemories）
 * 初始化状态快照 + 别名表，让 L1 能接入存量项目。
 *
 * 设计：
 * - 主入口 buildFromProject(project)：从项目设定建初始快照
 * - 可选 backfillFromChapters：从已写章节回填历史状态（用 DataExtractor）
 * - 兼容现有 character/location id（直接复用，不强制 char_xxx 格式）
 */

import { StateSnapshotStore, createStateStore } from './StateSnapshotStore';
import { createChangesApplier } from './ChangesApplier';
import { createEmptyChanges } from './ChangesProtocol';
import type {
  Character,
  Faction,
  Foreshadow,
  Location,
  Project,
  WorldRule,
} from '@/types/project';
import type {
  ForeshadowTier,
  StateSnapshot,
} from './types';
import type { ApplyResult } from './ChangesApplier';

// ============================================================
// DataExtractor 注入式 factory
// state 层不能硬依赖 writing 子系统；运行时由上层注入。
// ============================================================

type DataExtractorLike = { extract: (chapter: any, idx: number) => any };
let _dataExtractorFactory: (() => DataExtractorLike) | null = null;

/**
 * 注入 DataExtractor 工厂（由 writing 子系统在启动时调用）。
 * 不注入则 backfillFromChapters 直接跳过。
 */
export function setDataExtractorFactory(factory: (() => DataExtractorLike) | null): void {
  _dataExtractorFactory = factory;
}

// ============================================================
// 关系类型映射：项目 RelationshipType → 快照 RelationshipType
// ============================================================

type ProjectRelationType = 'friend' | 'enemy' | 'family' | 'lover' | 'rival' | 'mentor' | 'student' | 'alliance' | 'neutral';
type SnapshotRelationType = 'ally' | 'enemy' | 'family' | 'romantic' | 'master_disciple' | 'neutral' | 'rival';

const RELATION_MAP: Record<ProjectRelationType, { type: SnapshotRelationType; trust: number }> = {
  friend: { type: 'ally', trust: 40 },
  enemy: { type: 'enemy', trust: -60 },
  family: { type: 'family', trust: 60 },
  lover: { type: 'romantic', trust: 80 },
  rival: { type: 'rival', trust: -20 },
  mentor: { type: 'master_disciple', trust: 50 },
  student: { type: 'master_disciple', trust: 50 },
  alliance: { type: 'ally', trust: 50 },
  neutral: { type: 'neutral', trust: 0 },
};

const FORESHADOW_STATUS_MAP: Record<Foreshadow['status'], 'setup' | 'hinted' | 'reinforced' | 'resolved' | 'abandoned'> = {
  buried: 'setup',
  hinted: 'hinted',
  foreshadowed: 'reinforced',
  resolved: 'resolved',
};

const FORESHADOW_TIER_MAP: Record<NonNullable<Foreshadow['importance']>, ForeshadowTier> = {
  main: 'arc',
  subplot: 'major',
  emotion: 'minor',
};

const FACTION_ATTITUDE_MAP: Record<'ally' | 'enemy' | 'neutral', 'hostile' | 'neutral' | 'friendly' | 'allied'> = {
  ally: 'allied',
  enemy: 'hostile',
  neutral: 'neutral',
};

// ============================================================
// 构建器
// ============================================================

export class SnapshotBuilder {
  constructor(private readonly store: StateSnapshotStore) {}

  /**
   * 从项目数据构建初始快照。
   *
   * 流程：
   * 1. 注册所有实体（角色/地点/势力）到别名表
   * 2. 从设定填充快照各维度
   * 3. 设置时间线初始章节
   * 4. 不回填历史（已写章节的回填用 backfillFromChapters）
   */
  buildFromProject(project: Project, options?: { backfillChapters?: boolean }): {
    snapshot: StateSnapshot;
    stats: BuildStats;
    warnings: string[];
  } {
    const warnings: string[] = [];
    const stats: BuildStats = {
      characters: 0,
      locations: 0,
      factions: 0,
      worldRules: 0,
      foreshadows: 0,
      relationships: 0,
      backfilledChapters: 0,
    };

    // 初始空快照
    const snapshot: StateSnapshot = {
      projectId: project.id,
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

    // 1. 角色
    for (const char of project.characters ?? []) {
      this.addCharacter(snapshot, char, warnings);
      stats.characters++;
    }

    // 2. 角色关系（双向）
    for (const char of project.characters ?? []) {
      this.addCharacterRelationships(snapshot, char, project, warnings);
    }
    stats.relationships = Object.keys(snapshot.relationships).length;

    // 3. 地点
    for (const loc of project.worldSchema?.locations ?? []) {
      this.addLocation(snapshot, loc);
      stats.locations++;
    }

    // 4. 势力
    for (const fac of project.worldSchema?.factions ?? []) {
      this.addFaction(snapshot, fac);
      stats.factions++;
    }

    // 5. 世界规则
    for (const rule of project.worldSchema?.rules ?? []) {
      this.addWorldRule(snapshot, rule);
      stats.worldRules++;
    }

    // 6. 伏笔
    for (const fs of project.foreshadows ?? []) {
      this.addForeshadow(snapshot, fs);
      stats.foreshadows++;
    }

    // 7. 时间线初始章节（设为最大已写章节号）
    const maxChapter = this.getMaxWrittenChapter(project);
    snapshot.chapter = maxChapter;
    snapshot.timeline.currentChapter = maxChapter;

    // 8. 写入 store（覆盖初始状态）
    const setOk = this.store.setSnapshot(snapshot);
    if (!setOk.success) {
      warnings.push(`快照写入失败: ${setOk.error}`);
    }

    // 9. 可选：回填历史
    if (options?.backfillChapters) {
      const backfill = this.backfillFromChapters(project);
      stats.backfilledChapters = backfill.appliedChapters;
      warnings.push(...backfill.warnings);
    }

    return { snapshot: this.store.getSnapshot(), stats, warnings };
  }

  // ============================================================
  // 实体添加
  // ============================================================

  private addCharacter(snapshot: StateSnapshot, char: Character, warnings: string[]): void {
    const entityId = char.id;
    const profile = char.profile ?? { personality: [] };

    // 注册别名
    this.store.registerEntity(entityId, char.name);

    snapshot.characters[entityId] = {
      entityId,
      name: char.name,
      powerLevel: '',
      abilities: profile.abilities ?? [],
      mentalState: '',
      role: char.role ?? '',
      alive: true,
      lastUpdatedChapter: 0,
    };

    // 外貌
    const appearanceText = profile.appearance ?? '';
    snapshot.characterAppearances[entityId] = {
      entityId,
      features: appearanceText ? [appearanceText] : [],
      personalityTags: profile.personality ?? [],
      speakingStyle: '',
    };

    if (!char.name) {
      warnings.push(`角色 ${entityId} 缺少名称`);
    }
  }

  private addCharacterRelationships(
    snapshot: StateSnapshot,
    char: Character,
    project: Project,
    warnings: string[],
  ): void {
    const rels = char.profile?.relationships ?? [];
    for (const rel of rels) {
      // 通过 targetName 找到目标角色
      const target = (project.characters ?? []).find(c => c.name === rel.targetName);
      if (!target) {
        warnings.push(`角色 ${char.name} 的关系目标 "${rel.targetName}" 未找到，跳过`);
        continue;
      }

      const relId = `${char.id}->${target.id}`;
      const mapped = RELATION_MAP[rel.type as ProjectRelationType] ?? RELATION_MAP.neutral;

      // 避免重复（双向关系只建一条主向）
      if (snapshot.relationships[relId]) continue;
      // 如果反向已存在，跳过
      const reverseId = `${target.id}->${char.id}`;
      if (snapshot.relationships[reverseId]) continue;

      snapshot.relationships[relId] = {
        id: relId,
        fromEntityId: char.id,
        toEntityId: target.id,
        type: mapped.type,
        trustScore: mapped.trust,
        description: rel.description ?? '',
        establishedChapter: 0,
      };
    }
  }

  private addLocation(snapshot: StateSnapshot, loc: Location): void {
    this.store.registerEntity(loc.id, loc.name);
    snapshot.locations[loc.id] = {
      id: loc.id,
      name: loc.name,
      status: '正常',
      parentLocationId: loc.parentId,
      lastUpdatedChapter: 0,
    };

    // 地点特征（从 description 粗略提取）
    if (loc.description) {
      snapshot.locationFeatures[loc.id] = {
        id: loc.id,
        environmentTags: [],
        atmosphere: loc.description,
        landmarks: [],
      };
    }
  }

  private addFaction(snapshot: StateSnapshot, fac: Faction): void {
    this.store.registerEntity(fac.id, fac.name);
    const attitude = fac.relation?.type ? FACTION_ATTITUDE_MAP[fac.relation.type] : 'neutral';
    snapshot.factions[fac.id] = {
      id: fac.id,
      name: fac.name,
      status: fac.description ?? '正常',
      powerLevel: '',
      attitudeToProtagonist: attitude,
      lastUpdatedChapter: 0,
    };
  }

  private addWorldRule(snapshot: StateSnapshot, rule: WorldRule): void {
    snapshot.worldRules.push({
      id: rule.id,
      name: rule.name,
      rule: rule.description,
      violationConsequence: '',
      absolute: rule.locked,
    });
  }

  private addForeshadow(snapshot: StateSnapshot, fs: Foreshadow): void {
    const status = FORESHADOW_STATUS_MAP[fs.status] ?? 'setup';
    const tier = fs.importance ? FORESHADOW_TIER_MAP[fs.importance] : 'minor';
    snapshot.foreshadows[fs.id] = {
      id: fs.id,
      hint: fs.hint,
      tier,
      status,
      setupChapter: fs.createdChapter ?? fs.setupChapter ?? 0,
      plannedPayoffChapter: fs.suggestedResolutionChapter ?? fs.payoffChapter,
      actualPayoffChapter: fs.status === 'resolved' ? (fs.payoffChapter ?? fs.suggestedResolutionChapter) : undefined,
      relatedEntities: fs.carrierCharacter ? [fs.carrierCharacter] : [],
    };
  }

  // ============================================================
  // 历史回填（可选）
  // ============================================================

  /**
   * 从已写章节回填历史状态。
   * 用 DataExtractor 逐章提取 + ChangesApplier 应用。
   *
   * 注意：这是"尽力而为"的回填，准确率不如 AI 主动声明 CHANGES。
   * 主要用于把存量项目迁移到新架构。
   */
  backfillFromChapters(project: Project): {
    appliedChapters: number;
    warnings: string[];
  } {
    const warnings: string[] = [];
    const applier = createChangesApplier(this.store);

    // DataExtractor 通过注入式 factory 获取，避免 state 层对 writing 子系统的硬依赖。
    // 生产代码在启动时调用 setDataExtractorFactory 注入；未注入则跳过回填。
    if (!_dataExtractorFactory) {
      warnings.push('DataExtractor 未注入，跳过历史回填（调用 setDataExtractorFactory 启用）');
      return { appliedChapters: 0, warnings };
    }

    let extractor: any;
    try {
      extractor = _dataExtractorFactory();
    } catch (err) {
      warnings.push(`DataExtractor 创建失败，跳过历史回填: ${err instanceof Error ? err.message : String(err)}`);
      return { appliedChapters: 0, warnings };
    }
    const sortedChapters = [...(project.chapters ?? [])]
      .filter(c => c.content && c.content.trim().length > 100)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    let applied = 0;
    for (const chapter of sortedChapters) {
      try {
        const extraction = extractor.extract(chapter, chapter.orderIndex + 1);
        // 把 ExtractionResult 转成 ChangesPayload
        const changes = this.extractionToChanges(extraction, chapter.orderIndex + 1);
        const result: ApplyResult = applier.apply(changes, {
          strictness: 'lenient',
          allowAutoCreateEntities: false, // 回填不创建新实体，避免脏数据
        });
        if (result.success) {
          applied++;
        } else {
          warnings.push(`第 ${chapter.orderIndex + 1} 章回填失败: ${result.errors.slice(0, 1).join('; ')}`);
        }
      } catch (err) {
        warnings.push(`第 ${chapter.orderIndex + 1} 章回填异常: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { appliedChapters: applied, warnings };
  }

  /**
   * 把 DataExtractor 的 ExtractionResult 转成 ChangesPayload。
   * 这是个有损转换（正则提取的精度有限）。
   */
  private extractionToChanges(extraction: any, chapter: number) {
    const changes: any[] = [];

    // 状态变化 → character_state
    for (const delta of extraction.stateDeltas ?? []) {
      changes.push({
        type: 'character_state',
        entity: { name: delta.entity_id, type: 'character' },
        field: 'mentalState',
        old: delta.from,
        new: delta.to,
        evidence: '',
        reason: '历史回填',
      });
    }

    // 事件 → plot_node
    for (const event of extraction.acceptedEvents ?? []) {
      changes.push({
        type: 'plot_node',
        keywords: [],
        summary: `${event.subject}${event.payload?.action ?? ''}${event.payload?.result ?? ''}`,
        involvedCharacters: [event.subject],
        strand: 'main',
        evidence: '',
        reason: '历史回填',
      });
    }

    return createEmptyChanges(chapter).changes.length >= 0
      ? { version: '1.0' as const, chapter, changes }
      : { version: '1.0' as const, chapter, changes: [] };
  }

  // ============================================================
  // 辅助
  // ============================================================

  private getMaxWrittenChapter(project: Project): number {
    const chapters = project.chapters ?? [];
    if (chapters.length === 0) return 0;
    return Math.max(...chapters.map(c => c.orderIndex + 1));
  }
}

export interface BuildStats {
  characters: number;
  locations: number;
  factions: number;
  worldRules: number;
  foreshadows: number;
  relationships: number;
  backfilledChapters: number;
}

// ============================================================
// 工厂
// ============================================================

export function createSnapshotBuilder(store: StateSnapshotStore): SnapshotBuilder {
  return new SnapshotBuilder(store);
}

/**
 * 便捷入口：从项目构建并初始化状态存储。
 * 返回 (store, builder)，调用方可继续用 store 读写。
 */
export function initializeStateFromProject(
  project: Project,
  options?: { backfillChapters?: boolean },
): {
  store: StateSnapshotStore;
  builder: SnapshotBuilder;
  stats: BuildStats;
  warnings: string[];
} {
  const store = new StateSnapshotStore(project.id);
  // 注册到全局缓存
  // （createStateStore 会复用，这里手动 new 是为了拿到新实例做构建）
  const builder = new SnapshotBuilder(store);
  const { stats, warnings } = builder.buildFromProject(project, options);

  // 同步到全局缓存
  // createStateStore 返回的是单例，我们把构建好的状态导入它
  const globalStore = createStateStore(project.id);
  globalStore.import(store.export());

  return { store: globalStore, builder, stats, warnings };
}

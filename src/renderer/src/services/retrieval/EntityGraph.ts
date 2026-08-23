/**
 * L2 检索层 - 实体图倒排索引
 *
 * 维护"实体 → 出现章节/切片"的倒排索引。
 * 大纲提到"林婉儿"时，拉取她所有出场的切片。
 *
 * 与 BM25（关键词）/向量（语义）互补：
 * - BM25 擅长精确词匹配，但实体别名/代词难处理
 * - 向量擅长语义，但专有名词召回不稳定
 * - 实体图直接按实体 ID 精确召回，最稳
 */

import type { StateSnapshot } from '../state/types';

/** 检索侧姓氏称谓变体：与 story-runtime/entityDisambiguation 的词表保持同源子集 */
const SURNAME_TITLE_VARIANTS = [
  '教授', '院士', '老师', '先生', '老板', '老汉', '队长', '局长', '所长',
  '大夫', '师傅', '大叔', '大爷', '掌柜', '专家', '总',
];

// ============================================================
// 类型
// ============================================================

export interface EntityOccurrence {
  /** 实体 ID 或名称 */
  entity: string;
  /** 切片 ID */
  chunkId: string;
  /** 章节号 */
  chapter: number;
  /** 出现次数 */
  count: number;
}

export interface EntityGraphQueryResult {
  chunkIds: string[];
  /** 命中的实体列表 */
  matchedEntities: string[];
}

// ============================================================
// 实体图
// ============================================================

export class EntityGraph {
  /** 实体 → 出现记录 */
  private entityIndex: Map<string, EntityOccurrence[]> = new Map();
  /** 别名 → 主实体名（用于消歧） */
  private aliasMap: Map<string, string> = new Map();
  /** 切片 ID → 切片文本缓存（用于返回） */
  private chunkTexts: Map<string, { chapter: number; text: string }> = new Map();

  /** 注册别名。 */
  registerAlias(alias: string, primaryName: string): void {
    this.aliasMap.set(alias.trim(), primaryName.trim());
  }

  /** 批量注册别名（从状态快照的角色/地点/势力）。 */
  registerFromSnapshot(snapshot: StateSnapshot): void {
    for (const c of Object.values(snapshot.characters)) {
      this.registerAlias(c.name, c.name);
      // 姓氏 + 称谓变体（如"宋怀远" → "宋教授"可解析回主名）。
      // 检索按主名计数，不注册这些变体会漏检以称号提及角色的切片。
      if (c.name.length >= 2 && /^[\u4e00-\u9fff]{2,}$/u.test(c.name)) {
        const surname = c.name[0];
        for (const title of SURNAME_TITLE_VARIANTS) {
          this.aliasMap.set(`${surname}${title}`, c.name);
        }
        for (const prefix of ['老', '小', '阿']) {
          this.aliasMap.set(`${prefix}${surname}`, c.name);
        }
      }
    }
    for (const l of Object.values(snapshot.locations)) {
      this.registerAlias(l.name, l.name);
    }
    for (const f of Object.values(snapshot.factions)) {
      this.registerAlias(f.name, f.name);
    }
  }

  /**
   * 索引一个切片：提取切片里的实体，更新倒排。
   * @param chunkId 切片 ID
   * @param chapter 章节号
   * @param text 切片文本
   * @param knownEntities 已知实体名列表（从快照/别名表）
   */
  indexChunk(chunkId: string, chapter: number, text: string, knownEntities: string[] = []): void {
    this.removeChunk(chunkId);
    this.chunkTexts.set(chunkId, { chapter, text });

    // 统计每个已知实体在切片中的出现次数
    for (const entity of knownEntities) {
      const count = this.countOccurrences(text, entity);
      if (count > 0) {
        const resolved = this.aliasMap.get(entity) ?? entity;
        const occurrences = this.entityIndex.get(resolved) ?? [];
        occurrences.push({ entity: resolved, chunkId, chapter, count });
        this.entityIndex.set(resolved, occurrences);
      }
    }
  }

  /** 删除一个切片及其所有实体倒排记录。 */
  removeChunk(chunkId: string): boolean {
    const existed = this.chunkTexts.delete(chunkId);

    for (const [entity, occurrences] of this.entityIndex) {
      const remaining = occurrences.filter(occurrence => occurrence.chunkId !== chunkId);
      if (remaining.length > 0) {
        this.entityIndex.set(entity, remaining);
      } else {
        this.entityIndex.delete(entity);
      }
    }

    return existed;
  }

  /**
   * 查询：给定一组实体，返回所有相关切片 ID。
   * @param entities 实体名/ID列表
   * @param options.topKPerEntity 每个实体最多返回多少切片
   * @param options.requireAll 是否要求所有实体都出现（AND），默认 OR
   */
  query(entities: string[], options: { topKPerEntity?: number; requireAll?: boolean } = {}): EntityGraphQueryResult {
    const { topKPerEntity = 5, requireAll = false } = options;
    if (entities.length === 0) return { chunkIds: [], matchedEntities: [] };

    // 解析别名
    const resolvedEntities = entities.map(e => this.aliasMap.get(e) ?? e);

    // 收集每个实体的切片
    const chunkToEntities: Map<string, Set<string>> = new Map();
    const allMatchedEntities = new Set<string>();

    for (const entity of resolvedEntities) {
      const occurrences = this.entityIndex.get(entity);
      if (!occurrences || occurrences.length === 0) continue;
      allMatchedEntities.add(entity);

      // 按出现次数降序，取 topK
      const sorted = [...occurrences].sort((a, b) => b.count - a.count);
      for (const occ of sorted.slice(0, topKPerEntity)) {
        if (!chunkToEntities.has(occ.chunkId)) {
          chunkToEntities.set(occ.chunkId, new Set());
        }
        chunkToEntities.get(occ.chunkId)!.add(entity);
      }
    }

    // 过滤：requireAll 则只保留命中所有实体的切片
    let results: Array<{ chunkId: string; entityCount: number }> = [];
    for (const [chunkId, ents] of chunkToEntities) {
      if (requireAll && ents.size < resolvedEntities.length) continue;
      results.push({ chunkId, entityCount: ents.size });
    }

    // 按命中实体数降序、然后按章节号升序（近的优先）
    results.sort((a, b) => {
      if (a.entityCount !== b.entityCount) return b.entityCount - a.entityCount;
      const chapA = this.chunkTexts.get(a.chunkId)?.chapter ?? 0;
      const chapB = this.chunkTexts.get(b.chunkId)?.chapter ?? 0;
      return chapB - chapA;
    });

    return {
      chunkIds: results.map(r => r.chunkId),
      matchedEntities: Array.from(allMatchedEntities),
    };
  }

  /** 获取切片文本。 */
  getChunkText(chunkId: string): { chapter: number; text: string } | null {
    return this.chunkTexts.get(chunkId) ?? null;
  }

  /** 清空索引。 */
  clear(): void {
    this.entityIndex.clear();
    this.aliasMap.clear();
    this.chunkTexts.clear();
  }

  /** 已索引切片数。 */
  size(): number {
    return this.chunkTexts.size;
  }

  /** 已索引实体数。 */
  entityCount(): number {
    return this.entityIndex.size;
  }

  // ============================================================
  // 辅助
  // ============================================================

  private countOccurrences(text: string, term: string): number {
    if (!term) return 0;
    let count = 0;
    let idx = text.indexOf(term);
    while (idx !== -1) {
      count++;
      idx = text.indexOf(term, idx + term.length);
    }
    return count;
  }
}

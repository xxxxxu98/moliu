/**
 * Incremental Writeback System
 * 增量写回机制 - 将生成的内容增量写回到设定集
 * 从 webnovel-writer 借鉴的增量更新策略
 */

import type { VolumeContract, StoryContract, ChapterCommit } from '../contracts';
import type { PriorityLevel } from '../types';

/**
 * 增量写回条目类型
 */
export type WritebackEntryType = 
  | 'character'    // 角色
  | 'faction'       // 势力
  | 'location'      // 地点
  | 'item'          // 物品/道具
  | 'foreshadow'   // 伏笔
  | 'plot'          // 剧情线
  | 'setting';      // 设定

/**
 * 增量写回条目
 */
export interface WritebackEntry {
  type: WritebackEntryType;
  id: string;
  name: string;
  description: string;
  sourceChapter?: number;
  sourceVolume?: number;
  relatedEntries?: string[];
  /** 优先级级别 */
  priority: PriorityLevel;
  /** 紧急程度标签 */
  urgencyTag?: 'blocking' | 'important' | 'normal' | 'optional';
  /** 冲突风险 */
  conflictRisk?: 'high' | 'medium' | 'low';
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 增量写回结果
 */
export interface WritebackResult {
  success: boolean;
  entries: WritebackEntry[];
  conflicts: WritebackConflict[];
  warnings: WritebackWarning[];
  /** 按优先级分组的结果 */
  groupedByPriority?: Record<PriorityLevel, WritebackEntry[]>;
}

/**
 * 写回冲突
 */
export interface WritebackConflict {
  type: WritebackEntryType;
  id: string;
  name: string;
  existingContent: string;
  newContent: string;
  resolution: 'keep_existing' | 'merge' | 'replace' | 'pending';
  /** 冲突严重性 */
  severity: 'critical' | 'warning';
  /** 冲突描述 */
  description?: string;
}

/**
 * 写回警告
 */
export interface WritebackWarning {
  type: string;
  description: string;
  priority: PriorityLevel;
  entryId?: string;
}

/**
 * 写回策略配置
 */
export interface WritebackStrategy {
  autoMerge: boolean;
  conflictResolution: 'keep_existing' | 'prompt_user' | 'auto_merge';
  backupEnabled: boolean;
  /** 优先级阈值：高于此优先级的需要用户确认 */
  priorityThreshold?: PriorityLevel;
}

/**
 * 智能优先级分配器
 */
class WritebackPriorityAllocator {
  /**
   * 根据条目类型和上下文分配优先级
   */
  allocate(
    entry: Partial<WritebackEntry>,
    context: {
      contractType?: 'story' | 'volume' | 'chapter';
      generationPhase?: 'init' | 'plan' | 'write';
      existingCount?: number;
      hasConflicts?: boolean;
    }
  ): PriorityLevel {
    const { type, name, description } = entry;
    
    // 1. 基于类型的默认优先级
    const typePriority = this.getTypeDefaultPriority(type as WritebackEntryType);
    
    // 2. 基于名称的优先级调整
    const nameAdjustment = this.getNamePriorityAdjustment(name || '');
    
    // 3. 基于描述的优先级调整
    const descAdjustment = this.getDescriptionPriorityAdjustment(description || '');
    
    // 4. 基于上下文的优先级调整
    const contextAdjustment = this.getContextPriorityAdjustment(context);
    
    // 综合计算
    const totalWeight = typePriority + nameAdjustment + descAdjustment + contextAdjustment;
    
    if (totalWeight >= 85) return 'critical';
    if (totalWeight >= 65) return 'high';
    if (totalWeight >= 40) return 'medium';
    return 'low';
  }

  private getTypeDefaultPriority(type: WritebackEntryType): number {
    const priorities: Record<WritebackEntryType, number> = {
      character: 60,     // 角色 - 高优先级
      faction: 55,       // 势力 - 高优先级
      foreshadow: 70,    // 伏笔 - 高优先级
      plot: 65,         // 剧情线 - 高优先级
      setting: 45,      // 设定 - 中优先级
      location: 35,     // 地点 - 中优先级
      item: 40,         // 物品 - 中优先级
    };
    return priorities[type] || 50;
  }

  private getNamePriorityAdjustment(name: string): number {
    // 重要角色关键词
    const criticalKeywords = ['主角', '男主', '女主', 'boss', '终极'];
    const highKeywords = ['反派', '导师', '女主', '男主', '关键'];
    const mediumKeywords = ['配角', '次要', '普通'];

    if (criticalKeywords.some(k => name.includes(k))) return 25;
    if (highKeywords.some(k => name.includes(k))) return 15;
    if (mediumKeywords.some(k => name.includes(k))) return 5;
    return 0;
  }

  private getDescriptionPriorityAdjustment(desc: string): number {
    // 核心剧情相关
    const criticalPatterns = [/关键/, /核心/, /主线/, /重要/];
    const highPatterns = [/推动/, /影响/, /转折/];
    const mediumPatterns = [/相关/, /涉及/];

    if (criticalPatterns.some(p => p.test(desc))) return 20;
    if (highPatterns.some(p => p.test(desc))) return 10;
    if (mediumPatterns.some(p => p.test(desc))) return 5;
    return 0;
  }

  private getContextPriorityAdjustment(context: {
    contractType?: string;
    generationPhase?: string;
    existingCount?: number;
  }): number {
    let adjustment = 0;

    // 初始化阶段优先级更高
    if (context.generationPhase === 'init') {
      adjustment += 10;
    }

    // 故事契约级别更高
    if (context.contractType === 'story') {
      adjustment += 15;
    } else if (context.contractType === 'volume') {
      adjustment += 10;
    }

    // 已有大量条目时新条目优先级降低
    if (context.existingCount && context.existingCount > 50) {
      adjustment -= 10;
    }

    return Math.max(-15, Math.min(25, adjustment));
  }

  /**
   * 获取紧急程度标签
   */
  getUrgencyTag(priority: PriorityLevel): WritebackEntry['urgencyTag'] {
    switch (priority) {
      case 'critical':
        return 'blocking';
      case 'high':
        return 'important';
      case 'medium':
        return 'normal';
      case 'low':
        return 'optional';
    }
  }

  /**
   * 评估冲突风险
   */
  assessConflictRisk(
    entry: WritebackEntry,
    existingEntries: WritebackEntry[]
  ): WritebackEntry['conflictRisk'] {
    // 检查名称相似度
    for (const existing of existingEntries) {
      if (existing.type === entry.type && this.similarity(entry.name, existing.name) > 0.7) {
        return 'high';
      }
    }

    // 检查类型冲突
    const highConflictTypes = ['character', 'faction', 'setting'];
    if (highConflictTypes.includes(entry.type)) {
      return 'medium';
    }

    return 'low';
  }

  private similarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;

    if (longer.includes(shorter)) return shorter.length / longer.length;

    // 简单的编辑距离计算
    const editDistance = this.editDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private editDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }
}

/**
 * 增量写回结果
 */
export interface WritebackResult {
  success: boolean;
  entries: WritebackEntry[];
  conflicts: WritebackConflict[];
  warnings: string[];
}

/**
 * 写回冲突
 */
export interface WritebackConflict {
  type: WritebackEntryType;
  id: string;
  name: string;
  existingContent: string;
  newContent: string;
  resolution: 'keep_existing' | 'merge' | 'replace' | 'pending';
}

/**
 * 写回策略配置
 */
export interface WritebackStrategy {
  autoMerge: boolean;
  conflictResolution: 'keep_existing' | 'prompt_user' | 'auto_merge';
  backupEnabled: boolean;
}

/**
 * 增量写回器
 */
export class IncrementalWriteback {
  private strategy: WritebackStrategy = {
    autoMerge: true,
    conflictResolution: 'auto_merge',
    backupEnabled: true,
  };

  /** 优先级分配器 */
  private priorityAllocator = new WritebackPriorityAllocator();

  /** 缓存的现有条目 */
  private cachedEntries: WritebackEntry[] = [];

  /**
   * 从卷契约提取增量内容
   */
  extractFromVolume(
    volume: VolumeContract,
    context?: { existingEntries?: WritebackEntry[] }
  ): WritebackEntry[] {
    const entries: WritebackEntry[] = [];
    const existingEntries = context?.existingEntries || this.cachedEntries;

    // 从节拍表提取
    for (const beat of volume.beats) {
      // 提取新角色
      const characters = this.extractCharacters(beat.description);
      for (const char of characters) {
        const entry = this.createEntry(char, 'character', volume.volumeId, undefined, {
          contractType: 'volume',
          generationPhase: 'plan',
          existingCount: existingEntries.filter(e => e.type === 'character').length,
        });
        entries.push(entry);
      }

      // 提取新势力
      const factions = this.extractFactions(beat.description);
      for (const faction of factions) {
        const entry = this.createEntry(faction, 'faction', volume.volumeId, undefined, {
          contractType: 'volume',
          generationPhase: 'plan',
          existingCount: existingEntries.filter(e => e.type === 'faction').length,
        });
        entries.push(entry);
      }

      // 提取新地点
      const locations = this.extractLocations(beat.description);
      for (const loc of locations) {
        const entry = this.createEntry(loc, 'location', volume.volumeId, undefined, {
          contractType: 'volume',
          generationPhase: 'plan',
          existingCount: existingEntries.filter(e => e.type === 'location').length,
        });
        entries.push(entry);
      }

      // 提取伏笔
      if (beat.promise) {
        const entry = this.createEntry(
          { name: `伏笔-${entries.length}`, description: beat.promise },
          'foreshadow',
          volume.volumeId,
          undefined,
          {
            contractType: 'volume',
            generationPhase: 'plan',
            existingCount: existingEntries.filter(e => e.type === 'foreshadow').length,
          }
        );
        entry.priority = 'critical';
        entry.urgencyTag = 'important';
        entries.push(entry);
      }
    }

    // 从三线状态提取
    const { quest, fire, constellation } = volume.strandStatus;

    // Quest 线
    if (quest.mainObjective) {
      const entry = this.createEntry(
        { name: '主线剧情', description: quest.mainObjective },
        'plot',
        volume.volumeId,
        undefined,
        {
          contractType: 'volume',
          generationPhase: 'plan',
          existingCount: existingEntries.filter(e => e.type === 'plot').length,
        }
      );
      entry.priority = 'high';
      entry.urgencyTag = 'important';
      entries.push(entry);
    }

    // Fire 线
    if (fire.keyMoments && fire.keyMoments.length > 0) {
      const entry = this.createEntry(
        { name: '感情线', description: fire.keyMoments.join('; ') },
        'plot',
        volume.volumeId,
        undefined,
        {
          contractType: 'volume',
          generationPhase: 'plan',
        }
      );
      entries.push(entry);
    }

    // Constellation 线
    if (constellation.newRevelations && constellation.newRevelations.length > 0) {
      const entry = this.createEntry(
        { name: '世界观线', description: constellation.newRevelations.join('; ') },
        'plot',
        volume.volumeId,
        undefined,
        {
          contractType: 'volume',
          generationPhase: 'plan',
        }
      );
      entries.push(entry);
    }

    // 更新缓存
    this.cachedEntries = [...existingEntries, ...entries];

    // 评估冲突风险
    for (const entry of entries) {
      entry.conflictRisk = this.priorityAllocator.assessConflictRisk(entry, existingEntries);
    }

    return entries;
  }

  /**
   * 从章节承诺提取增量内容
   */
  extractFromChapter(
    chapter: ChapterCommit,
    context?: { existingEntries?: WritebackEntry[] }
  ): WritebackEntry[] {
    const entries: WritebackEntry[] = [];
    const existingEntries = context?.existingEntries || this.cachedEntries;

    // 从节点提取
    const allNodes = [
      chapter.nodes.cbn,
      ...(chapter.nodes.cpns || []),
      chapter.nodes.cen,
    ];

    for (const node of allNodes) {
      if (!node || !node.statement) continue;

      // 提取角色
      const characters = this.extractCharacters(node.statement);
      for (const char of characters) {
        const entry = this.createEntry(char, 'character', undefined, chapter.chapterId, {
          contractType: 'chapter',
          generationPhase: 'write',
          existingCount: existingEntries.filter(e => e.type === 'character').length,
        });
        entries.push(entry);
      }

      // 提取物品
      const items = this.extractItems(node.statement);
      for (const item of items) {
        const entry = this.createEntry(item, 'item', undefined, chapter.chapterId, {
          contractType: 'chapter',
          generationPhase: 'write',
          existingCount: existingEntries.filter(e => e.type === 'item').length,
        });
        entries.push(entry);
      }
    }

    // 从要求提取
    const { objective, resistance, coolPoint } = chapter.requirements;

    if (objective) {
      const entry = this.createEntry(
        { name: '章节目标', description: objective },
        'plot',
        undefined,
        chapter.chapterId,
        {
          contractType: 'chapter',
          generationPhase: 'write',
        }
      );
      entry.priority = 'high';
      entry.urgencyTag = 'important';
      entries.push(entry);
    }

    if (coolPoint) {
      const entry = this.createEntry(
        { name: '爽点设计', description: coolPoint },
        'plot',
        undefined,
        chapter.chapterId,
        {
          contractType: 'chapter',
          generationPhase: 'write',
        }
      );
      entries.push(entry);
    }

    // 更新缓存
    this.cachedEntries = [...existingEntries, ...entries];

    return entries;
  }

  /**
   * 创建条目（使用智能优先级分配）
   */
  private createEntry(
    data: { name: string; description: string },
    type: WritebackEntryType,
    sourceVolume?: number,
    sourceChapter?: number,
    context?: {
      contractType?: 'story' | 'volume' | 'chapter';
      generationPhase?: 'init' | 'plan' | 'write';
      existingCount?: number;
    }
  ): WritebackEntry {
    const priority = this.priorityAllocator.allocate(
      { type, name: data.name, description: data.description },
      context
    );

    return {
      type,
      id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: data.name,
      description: data.description,
      sourceVolume,
      sourceChapter,
      priority,
      urgencyTag: this.priorityAllocator.getUrgencyTag(priority),
    };
  }

  /**
   * 执行写回
   */
  async writeback(
    entries: WritebackEntry[],
    existingContent: Record<string, string>
  ): Promise<WritebackResult> {
    const conflicts: WritebackConflict[] = [];
    const warnings: WritebackWarning[] = [];
    const processedEntries: WritebackEntry[] = [];
    const groupedByPriority: Record<PriorityLevel, WritebackEntry[]> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
    };

    for (const entry of entries) {
      // 按优先级分组
      groupedByPriority[entry.priority].push(entry);

      // 检查是否与现有内容冲突
      const existingKey = this.findExistingKey(entry, existingContent);

      if (existingKey) {
        const conflict: WritebackConflict = {
          type: entry.type,
          id: entry.id,
          name: entry.name,
          existingContent: existingContent[existingKey],
          newContent: entry.description,
          resolution: this.strategy.conflictResolution === 'auto_merge' ? 'merge' : 'pending',
          severity: entry.conflictRisk === 'high' ? 'critical' : 'warning',
          description: `类型 "${entry.type}" 中已存在 "${entry.name}"`,
        };

        // 自动合并
        if (this.strategy.autoMerge && conflict.resolution === 'merge') {
          const merged = this.mergeContent(existingContent[existingKey], entry.description);
          existingContent[existingKey] = merged;
          processedEntries.push(entry);
        } else {
          conflicts.push(conflict);
        }
      } else {
        // 新增内容
        const key = this.generateKey(entry);
        existingContent[key] = entry.description;
        processedEntries.push(entry);
      }
    }

    // 生成警告
    if (conflicts.length > 0) {
      warnings.push({
        type: 'CONFLICTS_DETECTED',
        description: `检测到 ${conflicts.length} 个潜在冲突`,
        priority: 'medium',
      });
    }

    return {
      success: conflicts.length === 0,
      entries: processedEntries,
      conflicts,
      warnings,
      groupedByPriority,
    };
  }

  /**
   * 生成 Markdown 格式的写回内容（按优先级排序）
   */
  generateMarkdown(entries: WritebackEntry[]): string {
    const sections: string[] = [];

    // 按优先级排序
    const sortedEntries = [...entries].sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // 按类型分组
    const byType = this.groupByType(sortedEntries);

    for (const [type, typeEntries] of Object.entries(byType)) {
      if (typeEntries.length === 0) continue;

      sections.push(`## ${this.getTypeTitle(type as WritebackEntryType)}`);

      // 添加优先级子标题
      const criticalEntries = typeEntries.filter(e => e.priority === 'critical');
      const highEntries = typeEntries.filter(e => e.priority === 'high');
      const otherEntries = typeEntries.filter(e => e.priority !== 'critical' && e.priority !== 'high');

      if (criticalEntries.length > 0) {
        sections.push('\n### 🔴 阻塞级（必须处理）');
        for (const entry of criticalEntries) {
          const source = this.formatSource(entry);
          sections.push(`#### ${entry.name} ${source}`);
          sections.push(entry.description);
          sections.push('');
        }
      }

      if (highEntries.length > 0) {
        sections.push('\n### 🟠 重要（建议处理）');
        for (const entry of highEntries) {
          const source = this.formatSource(entry);
          sections.push(`#### ${entry.name} ${source}`);
          sections.push(entry.description);
          sections.push('');
        }
      }

      if (otherEntries.length > 0) {
        sections.push('\n### 其他');
        for (const entry of otherEntries) {
          const source = this.formatSource(entry);
          sections.push(`#### ${entry.name} ${source}`);
          sections.push(entry.description);
          sections.push('');
        }
      }
    }

    return sections.join('\n');
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cachedEntries = [];
  }

  /**
   * 获取缓存
   */
  getCache(): WritebackEntry[] {
    return [...this.cachedEntries];
  }

  // ====== 辅助方法 ======

  /**
   * 提取角色
   */
  private extractCharacters(text: string): { name: string; description: string }[] {
    const characters: { name: string; description: string }[] = [];
    
    // 简单的基于引号提取
    const namePattern = /「([^」]+)」/g;
    let match;

    while ((match = namePattern.exec(text)) !== null) {
      const name = match[1].trim();
      if (name.length >= 2 && name.length <= 10) {
        characters.push({
          name,
          description: '',
        });
      }
    }

    return characters;
  }

  /**
   * 提取势力
   */
  private extractFactions(text: string): { name: string; description: string }[] {
    const factions: { name: string; description: string }[] = [];
    
    // 常见的势力关键词
    const factionKeywords = ['宗门', '家族', '门派', '帝国', '教派', '联盟', '商会'];
    
    for (const keyword of factionKeywords) {
      const pattern = new RegExp(`(${keyword}[^，。,，]{0,10})`, 'g');
      const match = pattern.exec(text);
      
      if (match) {
        factions.push({
          name: match[1].trim(),
          description: '',
        });
      }
    }

    return factions;
  }

  /**
   * 提取地点
   */
  private extractLocations(text: string): { name: string; description: string }[] {
    const locations: { name: string; description: string }[] = [];
    
    // 常见的地点关键词
    const locationKeywords = ['城', '山', '洞', '府', '殿', '阁', '塔'];
    
    for (const keyword of locationKeywords) {
      const pattern = new RegExp(`([^，。,，\\s]{2,8}${keyword})`, 'g');
      let match;

      while ((match = pattern.exec(text)) !== null) {
        locations.push({
          name: match[1].trim(),
          description: '',
        });
      }
    }

    return locations;
  }

  /**
   * 提取物品
   */
  private extractItems(text: string): { name: string; description: string }[] {
    const items: { name: string; description: string }[] = [];
    
    // 常见的物品关键词
    const itemKeywords = ['剑', '刀', '功法', '秘籍', '丹药', '神器', '法宝'];
    
    for (const keyword of itemKeywords) {
      const pattern = new RegExp(`([^，。,，\\s]{2,6}${keyword})`, 'g');
      let match;

      while ((match = pattern.exec(text)) !== null) {
        items.push({
          name: match[1].trim(),
          description: '',
        });
      }
    }

    return items;
  }

  /**
   * 查找现有内容的键
   */
  private findExistingKey(
    entry: WritebackEntry,
    existingContent: Record<string, string>
  ): string | null {
    for (const [key, content] of Object.entries(existingContent)) {
      // 检查名称是否匹配
      if (key.includes(entry.name) || content.includes(entry.name)) {
        return key;
      }
    }
    return null;
  }

  /**
   * 生成键
   */
  private generateKey(entry: WritebackEntry): string {
    return `${entry.type}-${entry.id}`;
  }

  /**
   * 合并内容
   */
  private mergeContent(existing: string, newContent: string): string {
    // 简单策略：如果新内容更长，用新内容；否则合并
    if (newContent.length > existing.length) {
      return `${existing}\n\n${newContent}`;
    }
    return existing;
  }

  /**
   * 按类型分组
   */
  private groupByType(entries: WritebackEntry[]): Record<WritebackEntryType, WritebackEntry[]> {
    const groups: Partial<Record<WritebackEntryType, WritebackEntry[]>> = {};

    for (const entry of entries) {
      if (!groups[entry.type]) {
        groups[entry.type] = [];
      }
      groups[entry.type]!.push(entry);
    }

    return groups as Record<WritebackEntryType, WritebackEntry[]>;
  }

  /**
   * 获取类型标题
   */
  private getTypeTitle(type: WritebackEntryType): string {
    const titles: Record<WritebackEntryType, string> = {
      character: '新增角色',
      faction: '新增势力',
      location: '新增地点',
      item: '新增物品',
      foreshadow: '伏笔追踪',
      plot: '剧情线更新',
      setting: '设定更新',
    };
    return titles[type] || type;
  }

  /**
   * 格式化来源
   */
  private formatSource(entry: WritebackEntry): string {
    if (entry.sourceVolume) {
      return `(来源：第${entry.sourceVolume}卷)`;
    }
    if (entry.sourceChapter) {
      return `(来源：第${entry.sourceChapter}章)`;
    }
    return '';
  }

  /**
   * 设置写回策略
   */
  setStrategy(strategy: Partial<WritebackStrategy>): void {
    this.strategy = { ...this.strategy, ...strategy };
  }
}

// 导出单例
export const incrementalWriteback = new IncrementalWriteback();

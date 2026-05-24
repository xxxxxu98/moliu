/**
 * Anti-Patterns 注册表 (经验回流机制)
 * 
 * 职责：
 * 1. 管理项目级别的反模式列表
 * 2. 从审查结果回流问题模式
 * 3. 提供反模式查询接口
 */

import type { AntiPatternsRegistry, AntiPatternEntry } from '@/types/writing-v2';

const STORAGE_KEY = 'moliu_anti_patterns';
const MIN_FREQUENCY_THRESHOLD = 2;  // 最低频率阈值
const MAX_PATTERNS = 100;            // 最大模式数量

export class AntiPatternsRegistryService {
  private registry: AntiPatternsRegistry;
  private projectId: string = '';

  constructor() {
    this.registry = {
      patterns: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * 初始化注册表
   */
  initialize(projectId: string): void {
    this.projectId = projectId;
    
    // 从 localStorage 加载
    const stored = localStorage.getItem(`${STORAGE_KEY}_${projectId}`);
    if (stored) {
      try {
        this.registry = JSON.parse(stored);
      } catch {
        console.warn('[AntiPatterns] 加载失败，使用空注册表');
        this.registry = { patterns: [], lastUpdated: new Date().toISOString() };
      }
    } else {
      this.registry = { patterns: [], lastUpdated: new Date().toISOString() };
    }

    console.log('[AntiPatterns] 初始化:', {
      projectId,
      patternCount: this.registry.patterns.length,
    });
  }

  /**
   * 获取所有反模式
   */
  getPatterns(): AntiPatternEntry[] {
    return [...this.registry.patterns];
  }

  /**
   * 获取高严重度反模式
   */
  getHighSeverityPatterns(): AntiPatternEntry[] {
    return this.registry.patterns.filter((p) => p.severity === 'high');
  }

  /**
   * 获取反模式字符串列表（用于任务书）
   */
  getPatternStrings(): string[] {
    return this.registry.patterns
      .filter((p) => p.frequency >= MIN_FREQUENCY_THRESHOLD)
      .map((p) => p.pattern);
  }

  /**
   * 添加反模式（来自审查结果）
   */
  addFromReview(
    pattern: string,
    chapterNumber: number,
    severity: 'high' | 'medium' | 'low'
  ): boolean {
    // 检查是否已存在
    const existing = this.registry.patterns.find((p) => p.pattern === pattern);

    if (existing) {
      // 更新频率
      existing.frequency += 1;
      existing.lastFoundChapter = chapterNumber;

      // 更新严重度（只能升级不能降级）
      if (severity === 'high') {
        existing.severity = 'high';
      } else if (severity === 'medium' && existing.severity === 'low') {
        existing.severity = 'medium';
      }

      console.log('[AntiPatterns] 更新反模式:', {
        pattern: pattern.slice(0, 30),
        frequency: existing.frequency,
        severity: existing.severity,
      });
    } else {
      // 检查是否达到最大数量
      if (this.registry.patterns.length >= MAX_PATTERNS) {
        // 移除最低频率的模式
        this.removeLowestFrequency();
      }

      // 添加新模式
      const newEntry: AntiPatternEntry = {
        id: `ap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        pattern,
        source: 'review',
        firstFoundChapter: chapterNumber,
        frequency: 1,
        severity,
      };

      this.registry.patterns.push(newEntry);

      console.log('[AntiPatterns] 添加反模式:', {
        pattern: pattern.slice(0, 30),
        severity,
        totalPatterns: this.registry.patterns.length,
      });
    }

    // 保存
    this.save();

    return true;
  }

  /**
   * 批量添加反模式
   */
  addBatchFromReview(
    patterns: Array<{ pattern: string; severity: 'high' | 'medium' | 'low' }>,
    chapterNumber: number
  ): number {
    let added = 0;

    for (const { pattern, severity } of patterns) {
      // 只添加中高严重度
      if (severity === 'high' || severity === 'medium') {
        if (this.addFromReview(pattern, chapterNumber, severity)) {
          added++;
        }
      }
    }

    console.log('[AntiPatterns] 批量添加:', {
      input: patterns.length,
      added,
      total: this.registry.patterns.length,
    });

    return added;
  }

  /**
   * 手动添加反模式
   */
  addManual(pattern: string, autoFix?: string): boolean {
    // 检查是否已存在
    const existing = this.registry.patterns.find((p) => p.pattern === pattern);
    if (existing) {
      console.warn('[AntiPatterns] 模式已存在:', pattern.slice(0, 30));
      return false;
    }

    const newEntry: AntiPatternEntry = {
      id: `ap_manual_${Date.now()}`,
      pattern,
      source: 'manual',
      firstFoundChapter: 0,
      frequency: 0,
      severity: 'medium',
      autoFix,
    };

    this.registry.patterns.push(newEntry);
    this.save();

    console.log('[AntiPatterns] 手动添加:', {
      pattern: pattern.slice(0, 30),
      autoFix: autoFix?.slice(0, 30),
    });

    return true;
  }

  /**
   * 移除反模式
   */
  remove(patternId: string): boolean {
    const index = this.registry.patterns.findIndex((p) => p.id === patternId);
    if (index === -1) {
      return false;
    }

    this.registry.patterns.splice(index, 1);
    this.save();

    console.log('[AntiPatterns] 移除反模式:', { patternId });
    return true;
  }

  /**
   * 清空所有反模式
   */
  clear(): void {
    this.registry.patterns = [];
    this.registry.lastUpdated = new Date().toISOString();
    this.save();

    console.log('[AntiPatterns] 清空反模式列表');
  }

  /**
   * 导出注册表
   */
  export(): string {
    return JSON.stringify(this.registry, null, 2);
  }

  /**
   * 导入注册表
   */
  import(json: string): boolean {
    try {
      const imported = JSON.parse(json) as AntiPatternsRegistry;

      // 验证结构
      if (!imported.patterns || !Array.isArray(imported.patterns)) {
        throw new Error('无效的注册表结构');
      }

      this.registry = imported;
      this.registry.lastUpdated = new Date().toISOString();
      this.save();

      console.log('[AntiPatterns] 导入:', {
        patterns: imported.patterns.length,
      });

      return true;
    } catch (error) {
      console.error('[AntiPatterns] 导入失败:', error);
      return false;
    }
  }

  /**
   * 获取注册表统计
   */
  getStats(): {
    total: number;
    bySeverity: Record<string, number>;
    bySource: Record<string, number>;
    topPatterns: AntiPatternEntry[];
  } {
    const bySeverity: Record<string, number> = {
      high: 0,
      medium: 0,
      low: 0,
    };

    const bySource: Record<string, number> = {
      review: 0,
      manual: 0,
    };

    for (const pattern of this.registry.patterns) {
      bySeverity[pattern.severity]++;
      bySource[pattern.source]++;
    }

    // 按频率排序，取前10
    const topPatterns = [...this.registry.patterns]
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);

    return {
      total: this.registry.patterns.length,
      bySeverity,
      bySource,
      topPatterns,
    };
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /**
   * 保存到 localStorage
   */
  private save(): void {
    if (!this.projectId) {
      console.warn('[AntiPatterns] 未设置项目ID，跳过保存');
      return;
    }

    this.registry.lastUpdated = new Date().toISOString();

    try {
      localStorage.setItem(
        `${STORAGE_KEY}_${this.projectId}`,
        JSON.stringify(this.registry)
      );
    } catch (error) {
      console.error('[AntiPatterns] 保存失败:', error);
    }
  }

  /**
   * 移除最低频率的模式
   */
  private removeLowestFrequency(): void {
    if (this.registry.patterns.length === 0) {
      return;
    }

    // 找到最低频率的模式
    let minFreq = Infinity;
    let minIndex = -1;

    for (let i = 0; i < this.registry.patterns.length; i++) {
      if (this.registry.patterns[i].frequency < minFreq) {
        minFreq = this.registry.patterns[i].frequency;
        minIndex = i;
      }
    }

    if (minIndex !== -1) {
      this.registry.patterns.splice(minIndex, 1);
      console.log('[AntiPatterns] 移除最低频率模式:', {
        pattern: this.registry.patterns[minIndex]?.pattern.slice(0, 30),
        frequency: minFreq,
      });
    }
  }
}

// ============================================================
// Composable 导出
// ============================================================

let registryInstance: AntiPatternsRegistryService | null = null;

export function useAntiPatternsRegistry(): AntiPatternsRegistryService {
  if (!registryInstance) {
    registryInstance = new AntiPatternsRegistryService();
  }
  return registryInstance;
}

export default AntiPatternsRegistryService;

/**
 * 伏笔追踪系统
 * 参考 webnovel-writer 的设计
 */

import type { EnhancedForeshadow, LoopType, UrgencyLevel } from '@/types/writing-task';

// ============================================
// 伏笔分析器
// ============================================

/**
 * 伏笔分析器
 * 从文本中提取伏笔
 */
export class ForeshadowAnalyzer {
  /**
   * 分析文本中的伏笔
   */
  static analyze(text: string, chapterNumber: number): EnhancedForeshadow[] {
    const foreshadows: EnhancedForeshadow[] = [];
    const patterns = [
      { pattern: /神秘|秘密|隐藏|真相|似乎|不对劲/, type: 'mystery' as LoopType },
      { pattern: /危机|危险|威胁|冲突|对立|对抗/, type: 'conflict' as LoopType },
      { pattern: /承诺|发誓|约定|一定会|等着瞧/, type: 'promise' as LoopType },
      { pattern: /即将|将要|马上就要|很快/, type: 'threat' as LoopType },
      { pattern: /为什么|怎么回事|谁在|是什么/, type: 'question' as LoopType },
    ];

    for (const { pattern, type } of patterns) {
      if (pattern.test(text)) {
        foreshadows.push({
          id: `fs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          content: text.slice(0, 100),
          loopType: type,
          urgency: 'medium',
          plantedChapter: chapterNumber,
          plantedAt: new Date().toISOString(),
        });
      }
    }

    return foreshadows;
  }

  /**
   * 计算伏笔紧急度
   */
  static calculateUrgency(
    analysis: { plantedChapter: number; expectedPayoffChapter?: number },
    currentChapter: number
  ): UrgencyLevel {
    const expectedChapter = analysis.expectedPayoffChapter || analysis.plantedChapter + 10;
    const remainingChapters = expectedChapter - currentChapter;

    if (remainingChapters <= 0) return 'critical';
    if (remainingChapters <= 2) return 'high';
    if (remainingChapters <= 5) return 'medium';
    return 'low';
  }
}

// ============================================
// 伏笔追踪器
// ============================================

/**
 * 伏笔追踪器
 * 管理伏笔的添加、状态更新和报告生成
 */
export class ForeshadowTracker {
  private foreshadows: Map<string, EnhancedForeshadow> = new Map();
  private currentChapter: number;

  constructor(initialForeshadows: EnhancedForeshadow[] = [], currentChapter: number = 1) {
    this.currentChapter = currentChapter;
    
    for (const fs of initialForeshadows) {
      this.foreshadows.set(fs.id, { ...fs });
    }
  }

  /**
   * 添加伏笔
   */
  add(foreshadow: EnhancedForeshadow): void {
    this.foreshadows.set(foreshadow.id, { ...foreshadow });
  }

  /**
   * 更新伏笔状态
   * @param id 伏笔ID
   * @param status 新状态 ('buried' | 'hinted' | 'foreshadowed' | 'resolved' | 'invalid')
   * @param payoffChapter 回收章节（可选）
   * @returns 是否更新成功
   */
  updateStatus(
    id: string,
    status: 'buried' | 'hinted' | 'foreshadowed' | 'resolved' | 'invalid',
    payoffChapter?: number
  ): boolean {
    const foreshadow = this.foreshadows.get(id);
    if (!foreshadow) {
      return false;
    }

    foreshadow.status = status;
    if (status === 'resolved' && payoffChapter !== undefined) {
      foreshadow.payoffChapter = payoffChapter;
    }

    this.foreshadows.set(id, foreshadow);
    return true;
  }

  /**
   * 获取所有伏笔
   */
  getAll(): EnhancedForeshadow[] {
    return Array.from(this.foreshadows.values());
  }

  /**
   * 获取活跃伏笔（未解决的）
   */
  getActive(): EnhancedForeshadow[] {
    return this.getAll().filter(fs => 
      fs.status !== 'resolved' && fs.status !== 'invalid'
    );
  }

  /**
   * 获取紧急伏笔
   */
  getUrgent(): EnhancedForeshadow[] {
    return this.getActive().filter(fs => {
      const urgency = ForeshadowAnalyzer.calculateUrgency(
        { plantedChapter: fs.plantedChapter, expectedPayoffChapter: fs.expectedPayoffChapter },
        this.currentChapter
      );
      return urgency === 'critical' || urgency === 'high';
    });
  }

  /**
   * 获取过期伏笔
   */
  getOverdue(): EnhancedForeshadow[] {
    return this.getActive().filter(fs => {
      const urgency = ForeshadowAnalyzer.calculateUrgency(
        { plantedChapter: fs.plantedChapter, expectedPayoffChapter: fs.expectedPayoffChapter },
        this.currentChapter
      );
      return urgency === 'critical';
    });
  }

  /**
   * 获取已解决的伏笔
   */
  getResolved(): EnhancedForeshadow[] {
    return this.getAll().filter(fs => fs.status === 'resolved');
  }

  /**
   * 生成追踪报告
   */
  generateReport(): {
    activeForeshadows: EnhancedForeshadow[];
    urgentForeshadows: EnhancedForeshadow[];
    overdueForeshadows: EnhancedForeshadow[];
    resolvedForeshadows: EnhancedForeshadow[];
    stats: {
      total: number;
      buried: number;
      hinted: number;
      foreshadowed: number;
      resolved: number;
    };
  } {
    const all = this.getAll();
    const active = this.getActive();
    const urgent = this.getUrgent();
    const overdue = this.getOverdue();
    const resolved = this.getResolved();

    const stats = {
      total: all.length,
      buried: all.filter(fs => fs.status === 'buried').length,
      hinted: all.filter(fs => fs.status === 'hinted').length,
      foreshadowed: all.filter(fs => fs.status === 'foreshadowed').length,
      resolved: resolved.length,
    };

    return {
      activeForeshadows: active,
      urgentForeshadows: urgent,
      overdueForeshadows: overdue,
      resolvedForeshadows: resolved,
      stats,
    };
  }

  /**
   * 设置当前章节
   */
  setCurrentChapter(chapter: number): void {
    this.currentChapter = chapter;
  }

  /**
   * 获取当前章节
   */
  getCurrentChapter(): number {
    return this.currentChapter;
  }
}

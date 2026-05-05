/**
 * 增强伏笔追踪服务
 * 参考 webnovel-writer 的伏笔管理设计
 * 
 * 增强内容：
 * - 悬念类型 (loopType)
 * - 紧急度 (urgency)
 * - 预期回收章节 (loopDeadline)
 * - 实际回收章节 (payoffChapter)
 */

import type {
  EnhancedForeshadow,
  LoopType,
  UrgencyLevel,
  ForeshadowStatus,
} from '@/types/writing-task';
import type { Foreshadow } from '@/types/project';

export interface ForeshadowAnalysis {
  /** 伏笔ID */
  id: string;
  /** 内容 */
  content: string;
  /** 类型 */
  type: LoopType;
  /** 紧急度 */
  urgency: UrgencyLevel;
  /** 埋设章节 */
  plantedChapter: number;
  /** 预期回收章节 */
  expectedPayoff?: number;
  /** 置信度 */
  confidence: number;
}

export interface ForeshadowTrackingResult {
  /** 当前所有伏笔 */
  activeForeshadows: EnhancedForeshadow[];
  /** 紧迫伏笔（需要尽快回收）*/
  urgentForeshadows: EnhancedForeshadow[];
  /** 逾期伏笔（已超过预期回收章节）*/
  overdueForeshadows: EnhancedForeshadow[];
  /** 已回收伏笔 */
  resolvedForeshadows: EnhancedForeshadow[];
  /** 统计信息 */
  stats: ForeshadowTrackingStats;
}

export interface ForeshadowTrackingStats {
  total: number;
  buried: number;
  hinted: number;
  foreshadowed: number;
  resolved: number;
  overdue: number;
}

/**
 * 伏笔分析器
 */
export class ForeshadowAnalyzer {
  /**
   * 从文本中分析伏笔
   */
  static analyze(text: string, chapterNumber: number): ForeshadowAnalysis[] {
    const analyses: ForeshadowAnalysis[] = [];

    // 悬念关键词
    const suspensePatterns = [
      { pattern: /似乎(.+?)[，。]/g, type: 'mystery' as LoopType },
      { pattern: /好像(.+?)[，。]/g, type: 'mystery' as LoopType },
      { pattern: /隐约(.+?)[，。]/g, type: 'mystery' as LoopType },
      { pattern: /总觉得(.+?)[，。]/g, type: 'mystery' as LoopType },
    ];

    // 冲突伏笔
    const conflictPatterns = [
      { pattern: /不知为何(.+?)[，。]/g, type: 'conflict' as LoopType },
      { pattern: /迟早(.+?)[，。]/g, type: 'conflict' as LoopType },
      { pattern: /(.+?)迟早要(发生|出现|暴露)/g, type: 'conflict' as LoopType },
    ];

    // 承诺伏笔
    const promisePatterns = [
      { pattern: /答应(.+?)[，。]/g, type: 'promise' as LoopType },
      { pattern: /发誓(.+?)[，。]/g, type: 'promise' as LoopType },
      { pattern: /(.+?)不会(.+?忘记|食言)/g, type: 'promise' as LoopType },
    ];

    // 威胁伏笔
    const threatPatterns = [
      { pattern: /(.+?)不会放过(.+?)[，。]/g, type: 'threat' as LoopType },
      { pattern: /(.+?)早晚(.+?报复|报仇)/g, type: 'threat' as LoopType },
      { pattern: /(.+?)必定(.+?报复|报仇)/g, type: 'threat' as LoopType },
    ];

    // 问题伏笔
    const questionPatterns = [
      { pattern: /(.+?)究竟(.+?)[？?]/g, type: 'question' as LoopType },
      { pattern: /(.+?)到底(.+?)[？?]/g, type: 'question' as LoopType },
      { pattern: /(.+?)是谁(.+?)[？?]/g, type: 'question' as LoopType },
    ];

    // 执行分析
    const allPatterns = [
      ...suspensePatterns,
      ...conflictPatterns,
      ...promisePatterns,
      ...threatPatterns,
      ...questionPatterns,
    ];

    for (const { pattern, type } of allPatterns) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(text)) !== null) {
        if (match[0].length > 5 && match[0].length < 100) {
          const analysis: ForeshadowAnalysis = {
            id: `foreshadow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            content: match[0].trim(),
            type,
            urgency: 'medium',
            plantedChapter: chapterNumber,
            confidence: 0.8,
          };

          // 根据类型和上下文判断紧急度
          analysis.urgency = this.calculateUrgency(analysis, chapterNumber);

          // 计算预期回收章节
          analysis.expectedPayoff = this.calculateExpectedPayoff(analysis);

          analyses.push(analysis);
        }
      }
    }

    return analyses;
  }

  /**
   * 计算紧急度
   */
  private static calculateUrgency(
    analysis: ForeshadowAnalysis,
    currentChapter: number
  ): UrgencyLevel {
    const content = analysis.content.toLowerCase();

    // 高紧急度关键词
    const highUrgencyKeywords = [
      '危险', '危机', '致命', '生死', '死亡', '威胁',
      '复仇', '报仇', '必定', '绝对', '威胁',
    ];

    // 低紧急度关键词
    const lowUrgencyKeywords = [
      '未来', '将来', '以后', '迟早', '慢慢',
      '不急', '以后再说',
    ];

    for (const keyword of highUrgencyKeywords) {
      if (content.includes(keyword)) {
        return 'high';
      }
    }

    for (const keyword of lowUrgencyKeywords) {
      if (content.includes(keyword)) {
        return 'low';
      }
    }

    // 根据类型判断
    switch (analysis.type) {
      case 'threat':
        return 'high';
      case 'conflict':
        return 'medium';
      case 'promise':
        return 'medium';
      case 'question':
        return 'low';
      default:
        return 'medium';
    }
  }

  /**
   * 计算预期回收章节
   */
  private static calculateExpectedPayoff(analysis: ForeshadowAnalysis): number {
    const content = analysis.content;
    let offset = 5; // 默认5章后回收

    // 根据紧急度调整
    switch (analysis.urgency) {
      case 'critical':
        offset = 2;
        break;
      case 'high':
        offset = 3;
        break;
      case 'medium':
        offset = 5;
        break;
      case 'low':
        offset = 10;
        break;
    }

    // 根据伏笔类型调整
    switch (analysis.type) {
      case 'threat':
        offset = Math.max(2, offset - 1);
        break;
      case 'promise':
        offset = Math.max(3, offset);
        break;
      case 'question':
        offset = Math.min(15, offset + 3);
        break;
    }

    return analysis.plantedChapter + offset;
  }

  /**
   * 转换为增强伏笔
   */
  static toEnhancedForeshadow(analysis: ForeshadowAnalysis): EnhancedForeshadow {
    return {
      id: analysis.id,
      content: analysis.content,
      loopType: analysis.type,
      urgency: analysis.urgency,
      plantedChapter: analysis.plantedChapter,
      expectedPayoffChapter: analysis.expectedPayoff,
      status: 'buried',
      confidence: analysis.confidence,
    };
  }

  /**
   * 从旧版伏笔转换
   */
  static fromLegacyForeshadow(foreshadow: Foreshadow): EnhancedForeshadow {
    return {
      id: foreshadow.id,
      content: foreshadow.hint,
      loopType: this.inferLoopType(foreshadow),
      urgency: 'medium',
      plantedChapter: foreshadow.createdChapter,
      expectedPayoffChapter: foreshadow.suggestedResolutionChapter,
      status: foreshadow.status as ForeshadowStatus,
      confidence: 0.7,
    };
  }

  /**
   * 推断伏笔类型
   */
  private static inferLoopType(foreshadow: Foreshadow): LoopType {
    const hint = foreshadow.hint.toLowerCase();

    if (hint.includes('?') || hint.includes('？') || hint.includes('谁') || hint.includes('什么')) {
      return 'question';
    }
    if (hint.includes('威胁') || hint.includes('报复') || hint.includes('仇')) {
      return 'threat';
    }
    if (hint.includes('答应') || hint.includes('承诺') || hint.includes('发誓')) {
      return 'promise';
    }
    if (hint.includes('冲突') || hint.includes('矛盾') || hint.includes('对立')) {
      return 'conflict';
    }

    return 'mystery';
  }
}

/**
 * 伏笔追踪器
 */
export class ForeshadowTracker {
  private foreshadows: Map<string, EnhancedForeshadow> = new Map();
  private currentChapter: number;

  constructor(initialForeshadows: EnhancedForeshadow[] = [], currentChapter: number = 0) {
    this.currentChapter = currentChapter;
    for (const fs of initialForeshadows) {
      this.foreshadows.set(fs.id, fs);
    }
  }

  /**
   * 添加伏笔
   */
  add(foreshadow: EnhancedForeshadow): void {
    this.foreshadows.set(foreshadow.id, foreshadow);
  }

  /**
   * 批量添加伏笔
   */
  addBatch(foreshadows: EnhancedForeshadow[]): void {
    for (const fs of foreshadows) {
      this.foreshadows.set(fs.id, fs);
    }
  }

  /**
   * 更新伏笔状态
   */
  updateStatus(id: string, status: ForeshadowStatus, payoffChapter?: number): boolean {
    const foreshadow = this.foreshadows.get(id);
    if (!foreshadow) return false;

    foreshadow.status = status;
    if (payoffChapter !== undefined) {
      foreshadow.payoffChapter = payoffChapter;
    }

    this.foreshadows.set(id, foreshadow);
    return true;
  }

  /**
   * 获取当前章节的所有活跃伏笔
   */
  getActive(): EnhancedForeshadow[] {
    return Array.from(this.foreshadows.values()).filter(
      fs => fs.status !== 'resolved' && fs.status !== 'abandoned'
    );
  }

  /**
   * 获取紧迫伏笔
   */
  getUrgent(): EnhancedForeshadow[] {
    return this.getActive().filter(
      fs => fs.urgency === 'critical' || fs.urgency === 'high'
    );
  }

  /**
   * 获取逾期伏笔
   */
  getOverdue(): EnhancedForeshadow[] {
    return this.getActive().filter(
      fs =>
        fs.expectedPayoffChapter !== undefined &&
        fs.expectedPayoffChapter < this.currentChapter
    );
  }

  /**
   * 获取统计信息
   */
  getStats(): ForeshadowTrackingStats {
    const all = Array.from(this.foreshadows.values());
    const active = this.getActive();
    const overdue = this.getOverdue();

    return {
      total: all.length,
      buried: active.filter(fs => fs.status === 'buried').length,
      hinted: active.filter(fs => fs.status === 'hinted').length,
      foreshadowed: active.filter(fs => fs.status === 'foreshadowed').length,
      resolved: all.filter(fs => fs.status === 'resolved').length,
      overdue: overdue.length,
    };
  }

  /**
   * 生成追踪报告
   */
  generateReport(): ForeshadowTrackingResult {
    const active = this.getActive();
    const urgent = this.getUrgent();
    const overdue = this.getOverdue();
    const resolved = Array.from(this.foreshadows.values()).filter(
      fs => fs.status === 'resolved'
    );

    return {
      activeForeshadows: active,
      urgentForeshadows: urgent,
      overdueForeshadows: overdue,
      resolvedForeshadows: resolved,
      stats: this.getStats(),
    };
  }

  /**
   * 导出为 JSON
   */
  toJSON(): EnhancedForeshadow[] {
    return Array.from(this.foreshadows.values());
  }

  /**
   * 从 JSON 导入
   */
  static fromJSON(data: EnhancedForeshadow[], currentChapter: number = 0): ForeshadowTracker {
    return new ForeshadowTracker(data, currentChapter);
  }
}

/**
 * 伏笔验证器
 */
export class ForeshadowValidator {
  /**
   * 验证伏笔的完整性
   */
  static validate(foreshadow: EnhancedForeshadow): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!foreshadow.id) {
      errors.push('伏笔ID不能为空');
    }

    if (!foreshadow.content || foreshadow.content.length < 3) {
      errors.push('伏笔内容太短');
    }

    if (!foreshadow.loopType) {
      errors.push('伏笔类型未指定');
    }

    if (!foreshadow.plantedChapter) {
      errors.push('埋设章节未指定');
    }

    if (!foreshadow.status) {
      errors.push('伏笔状态未指定');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 检查伏笔是否需要回收
   */
  static shouldPayoff(
    foreshadow: EnhancedForeshadow,
    currentChapter: number
  ): { should: boolean; reason: string } {
    // 已回收则跳过
    if (foreshadow.status === 'resolved') {
      return { should: false, reason: '已回收' };
    }

    // 被放弃则跳过
    if (foreshadow.status === 'abandoned') {
      return { should: false, reason: '已放弃' };
    }

    // 逾期检查
    if (
      foreshadow.expectedPayoffChapter &&
      foreshadow.expectedPayoffChapter < currentChapter
    ) {
      return {
        should: true,
        reason: `已逾期（预期第${foreshadow.expectedPayoffChapter}章回收，当前第${currentChapter}章）`,
      };
    }

    // 紧急度检查
    if (foreshadow.urgency === 'critical' || foreshadow.urgency === 'high') {
      const chaptersUntilExpected =
        foreshadow.expectedPayoffChapter! - currentChapter;

      if (chaptersUntilExpected <= 3) {
        return {
          should: true,
          reason: `紧迫伏笔（剩余${chaptersUntilExpected}章）`,
        };
      }
    }

    return { should: false, reason: '' };
  }

  /**
   * 生成伏笔回收建议
   */
  static generatePayoffSuggestion(
    foreshadow: EnhancedForeshadow
  ): string {
    const typeHints: Record<LoopType, string> = {
      mystery: '通过揭示谜底或发现真相来回收',
      conflict: '通过冲突爆发或矛盾解决来回收',
      promise: '通过兑现承诺或违背誓言来回收',
      threat: '通过威胁实现或危机解除来回收',
      question: '通过回答疑问或揭示答案来回收',
    };

    const baseHint = typeHints[foreshadow.loopType] || '通过情节发展自然回收';

    if (foreshadow.urgency === 'critical') {
      return `【紧急】${baseHint}，建议在本章或下章内回收`;
    }

    if (foreshadow.urgency === 'high') {
      return `【高优】${baseHint}，建议在3章内回收`;
    }

    return baseHint;
  }
}

// ============================================
// 工厂函数
// ============================================

/**
 * 创建伏笔追踪器
 */
export function createForeshadowTracker(
  initialForeshadows?: EnhancedForeshadow[],
  currentChapter?: number
): ForeshadowTracker {
  return new ForeshadowTracker(initialForeshadows, currentChapter);
}

/**
 * 分析文本中的伏笔
 */
export function analyzeForeshadows(
  text: string,
  chapterNumber: number
): EnhancedForeshadow[] {
  const analyses = ForeshadowAnalyzer.analyze(text, chapterNumber);
  return analyses.map(a => ForeshadowAnalyzer.toEnhancedForeshadow(a));
}

/**
 * 生成伏笔追踪报告
 */
export function generateForeshadowReport(
  foreshadows: EnhancedForeshadow[],
  currentChapter: number
): ForeshadowTrackingResult {
  const tracker = ForeshadowTracker.fromJSON(foreshadows, currentChapter);
  return tracker.generateReport();
}

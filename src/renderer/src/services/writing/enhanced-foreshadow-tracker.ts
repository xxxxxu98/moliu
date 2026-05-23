/**
 * 增强版伏笔追踪系统
 * 参考 oh-story-claudecode 的伏笔设计
 * 
 * 核心改进：
 * 1. 伏笔紧急度计算
 * 2. 揭示难度评估
 * 3. 关联冲突线
 * 4. 揭示任务生成
 */

import type {
  EnhancedForeshadow,
  PayoffMission,
  LoopType,
  UrgencyLevel,
  ForeshadowStatus,
} from '@/types/writing-task';
import type {
  Project,
  Foreshadow,
  ChapterMemory,
  PlotNode,
  MajorConflict,
} from '@/types/project';
import type { ConflictDesign } from '@/types/project';

/**
 * 伏笔追踪器
 */
export class ForeshadowTracker {
  private project: Project;
  private foreshadows: EnhancedForeshadow[];
  private currentChapter: number;
  private plannedTotalChapters: number;

  constructor(
    project: Project,
    currentChapter: number,
    foreshadows: EnhancedForeshadow[],
    plannedTotalChapters?: number
  ) {
    this.project = project;
    this.currentChapter = currentChapter;
    this.foreshadows = foreshadows;
    this.plannedTotalChapters = plannedTotalChapters || 
      project.metadata?.plannedChapterCount || 
      100;
  }

  /**
   * 创建增强伏笔
   */
  static createEnhancedForeshadow(
    foreshadow: Foreshadow,
    currentChapter: number,
    plannedTotalChapters: number
  ): EnhancedForeshadow {
    const urgency = this.calculateUrgency(
      foreshadow.createdChapter,
      foreshadow.suggestedResolutionChapter,
      currentChapter,
      plannedTotalChapters
    );

    return {
      id: foreshadow.id,
      content: foreshadow.hint,
      loopType: this.inferLoopType(foreshadow.hint),
      urgency,
      plantedChapter: foreshadow.createdChapter,
      expectedPayoffChapter: foreshadow.suggestedResolutionChapter,
      status: this.mapStatus(foreshadow.status),
      confidence: 0.8,
      note: undefined,
    };
  }

  /**
   * 推断悬念类型
   */
  private static inferLoopType(hint: string): LoopType {
    const lowerHint = hint.toLowerCase();
    
    if (/神秘|秘密|隐藏|真相/.test(lowerHint)) {
      return 'mystery';
    }
    if (/危机|危险|威胁|冲突|对立/.test(lowerHint)) {
      return 'conflict';
    }
    if (/承诺|发誓|约定/.test(lowerHint)) {
      return 'promise';
    }
    if (/即将|将要|马上就要/.test(lowerHint)) {
      return 'threat';
    }
    if (/为什么|怎么回事|谁在/.test(lowerHint)) {
      return 'question';
    }
    
    return 'mystery';
  }

  /**
   * 映射状态
   */
  private static mapStatus(status: string): ForeshadowStatus {
    switch (status) {
      case 'resolved':
        return 'resolved';
      case 'abandoned':
        return 'abandoned';
      case 'hinted':
        return 'hinted';
      case 'foreshadowed':
        return 'foreshadowed';
      default:
        return 'buried';
    }
  }

  /**
   * 计算紧急度
   */
  private static calculateUrgency(
    plantedChapter: number,
    expectedPayoffChapter: number | undefined,
    currentChapter: number,
    plannedTotalChapters: number
  ): UrgencyLevel {
    // 如果有期望揭示章节
    if (expectedPayoffChapter) {
      const remaining = expectedPayoffChapter - currentChapter;
      if (remaining <= 0) return 'critical';
      if (remaining <= 3) return 'high';
      if (remaining <= 5) return 'medium';
      return 'low';
    }

    // 按总进度推算
    const plantedProgress = plantedChapter / plannedTotalChapters;
    const currentProgress = currentChapter / plannedTotalChapters;

    if (plantedProgress > 0.8 && currentProgress > 0.9) return 'critical';
    if (plantedProgress > 0.6 && currentProgress > 0.75) return 'high';
    if (plantedProgress > 0.4 && currentProgress > 0.5) return 'medium';
    return 'low';
  }

  /**
   * 获取所有伏笔
   */
  getAll(): EnhancedForeshadow[] {
    return [...this.foreshadows];
  }

  /**
   * 获取活跃伏笔（未解决的）
   */
  getActive(): EnhancedForeshadow[] {
    return this.foreshadows.filter(fs => 
      fs.status !== 'resolved' && fs.status !== 'abandoned'
    );
  }

  /**
   * 获取紧急伏笔
   */
  getUrgent(): EnhancedForeshadow[] {
    return this.getActive().filter(fs => 
      fs.urgency === 'critical' || fs.urgency === 'high'
    );
  }

  /**
   * 获取过期伏笔（应该揭示但未揭示）
   */
  getOverdue(): EnhancedForeshadow[] {
    return this.getActive().filter(fs => fs.urgency === 'critical');
  }

  /**
   * 获取已解决伏笔
   */
  getResolved(): EnhancedForeshadow[] {
    return this.foreshadows.filter(fs => fs.status === 'resolved');
  }

  /**
   * 生成揭示任务列表
   */
  generatePayoffMissions(): PayoffMission[] {
    return this.getActive()
      .map(fs => this.createPayoffMission(fs))
      .sort((a, b) => {
        const urgencyOrder: Record<UrgencyLevel, number> = { 
          critical: 0, high: 1, medium: 2, low: 3 
        };
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      });
  }

  /**
   * 创建揭示任务
   */
  private createPayoffMission(fs: EnhancedForeshadow): PayoffMission {
    return {
      foreshadowId: fs.id,
      hint: fs.content,
      urgency: fs.urgency,
      suggestedChapter: this.calculateSuggestedChapter(fs),
      difficulty: this.estimatePayoffDifficulty(fs),
      plotPoints: this.findPlotPointsForPayoff(fs),
      storyCardTemplates: this.getCompatibleStoryCards(fs),
      relatedConflicts: this.findRelatedConflicts(fs),
      payoffMethod: this.getPayoffMethodSuggestion(fs),
    };
  }

  /**
   * 计算建议揭示章节
   */
  private calculateSuggestedChapter(fs: EnhancedForeshadow): number {
    if (fs.expectedPayoffChapter) {
      return fs.expectedPayoffChapter;
    }

    // 根据埋设位置和紧迫度推算
    const baseChapter = fs.plantedChapter + 10;
    const urgencyBonus = {
      critical: 0,
      high: 2,
      medium: 3,
      low: 5,
    }[fs.urgency];

    return Math.min(baseChapter + urgencyBonus, this.plannedTotalChapters);
  }

  /**
   * 估算揭示难度
   */
  private estimatePayoffDifficulty(fs: EnhancedForeshadow): 'easy' | 'medium' | 'hard' {
    const activeCount = this.getActive().length;
    const unresolvedCount = activeCount + this.getOverdue().length;

    // 紧迫伏笔多，难度增加
    if (this.getOverdue().length > 3) return 'hard';
    if (unresolvedCount > 10) return 'medium';
    
    // 根据悬念类型判断
    switch (fs.loopType) {
      case 'mystery':
        return unresolvedCount > 5 ? 'medium' : 'easy';
      case 'conflict':
        return 'medium';
      default:
        return 'easy';
    }
  }

  /**
   * 查找适合揭示的情节点
   */
  private findPlotPointsForPayoff(fs: EnhancedForeshadow): string[] {
    const points: string[] = [];

    // 查找相关冲突
    const relatedConflicts = this.findRelatedConflicts(fs);
    for (const conflict of relatedConflicts) {
      points.push(`在${conflict}冲突高潮时揭示`);
    }

    // 根据悬念类型添加建议
    switch (fs.loopType) {
      case 'mystery':
        points.push('关键对话场景', '回忆闪回', '证据发现');
        break;
      case 'conflict':
        points.push('战斗/对决场景', '谈判破裂', '关键时刻');
        break;
      case 'promise':
        points.push('承诺兑现时刻', '危机时刻', '情感高潮');
        break;
      case 'threat':
        points.push('威胁爆发时刻', '危机解决', '真相揭露');
        break;
      case 'question':
        points.push('答疑解惑场景', '关键对话', '真相揭晓');
        break;
    }

    return points.slice(0, 5);
  }

  /**
   * 查找相关冲突
   */
  private findRelatedConflicts(fs: EnhancedForeshadow): string[] {
    const conflicts: string[] = [];
    
    // 从大纲冲突查找
    const conflictDesign = this.project.conflictDesign;
    if (conflictDesign?.majorConflicts) {
      for (const conflict of conflictDesign.majorConflicts) {
        // 简单关键词匹配
        if (fs.content.includes(conflict.title)) {
          conflicts.push(conflict.title);
        }
      }
    }

    // 从伏笔hint推断
    if (fs.content.includes('反派')) {
      conflicts.push('主线反派冲突');
    }
    if (fs.content.includes('感情') || fs.content.includes('爱')) {
      conflicts.push('感情线冲突');
    }

    return conflicts.slice(0, 3);
  }

  /**
   * 获取兼容的故事卡
   */
  private getCompatibleStoryCards(fs: EnhancedForeshadow): string[] {
    switch (fs.loopType) {
      case 'mystery':
        return [
          '真相揭晓',
          '身份揭露',
          '反转再反转',
          '证据链完整',
        ];
      case 'conflict':
        return [
          '英雄救美',
          '临危受命',
          '以弱胜强',
          '热血爆发',
        ];
      case 'promise':
        return [
          '承诺兑现',
          '好人好报',
          '信守诺言',
        ];
      case 'threat':
        return [
          '危机解除',
          '化险为夷',
          '绝地反击',
        ];
      case 'question':
        return [
          '答疑解惑',
          '真相大白',
          '误会解除',
        ];
      default:
        return ['装逼打脸', '真相揭晓'];
    }
  }

  /**
   * 获取揭示方式建议
   */
  private getPayoffMethodSuggestion(fs: EnhancedForeshadow): string {
    switch (fs.loopType) {
      case 'mystery':
        return '通过层层铺垫，在高潮时刻揭晓真相，注意不要一次性全部揭示，保持悬念';
      case 'conflict':
        return '在关键冲突/战斗场景中自然揭示，配合高潮情节';
      case 'promise':
        return '在情感高潮或关键时刻兑现承诺，制造情感爆点';
      case 'threat':
        return '在危机爆发或解决时揭示，让主角化险为夷';
      case 'question':
        return '通过对话、回忆或关键证据揭示，解答读者疑惑';
      default:
        return '选择合适的剧情节点自然揭示';
    }
  }

  /**
   * 生成追踪报告
   */
  generateReport(): ForeshadowReport {
    const active = this.getActive();
    const urgent = this.getUrgent();
    const overdue = this.getOverdue();
    const resolved = this.getResolved();

    return {
      activeForeshadows: active,
      urgentForeshadows: urgent,
      overdueForeshadows: overdue,
      resolvedForeshadows: resolved,
      stats: {
        total: this.foreshadows.length,
        active: active.length,
        urgent: urgent.length,
        overdue: overdue.length,
        resolved: resolved.length,
        buried: active.filter(f => f.status === 'buried').length,
        hinted: active.filter(f => f.status === 'hinted').length,
        foreshadowed: active.filter(f => f.status === 'foreshadowed').length,
      },
      overdueRate: overdue.length / Math.max(active.length, 1),
      payoffProgress: resolved.length / Math.max(this.foreshadows.length, 1),
      nextPayoffSuggestion: this.getNextPayoffSuggestion(),
    };
  }

  /**
   * 获取下一个揭示建议
   */
  private getNextPayoffSuggestion(): string | undefined {
    const overdue = this.getOverdue();
    if (overdue.length > 0) {
      return `⚠️ 优先处理过期伏笔：${overdue[0].content.slice(0, 30)}...`;
    }

    const urgent = this.getUrgent();
    if (urgent.length > 0) {
      return `📌 建议下章揭示：${urgent[0].content.slice(0, 30)}...`;
    }

    return undefined;
  }

  /**
   * 添加伏笔
   */
  add(foreshadow: EnhancedForeshadow): void {
    this.foreshadows.push({ ...foreshadow });
  }

  /**
   * 更新伏笔状态
   */
  updateStatus(
    id: string,
    status: ForeshadowStatus,
    payoffChapter?: number
  ): boolean {
    const fs = this.foreshadows.find(f => f.id === id);
    if (!fs) return false;

    fs.status = status;
    if (status === 'resolved' && payoffChapter !== undefined) {
      fs.payoffChapter = payoffChapter;
    }

    return true;
  }

  /**
   * 设置当前章节
   */
  setCurrentChapter(chapter: number): void {
    this.currentChapter = chapter;
    
    // 更新所有活跃伏笔的紧急度
    for (const fs of this.foreshadows) {
      if (fs.status !== 'resolved' && fs.status !== 'abandoned') {
        fs.urgency = ForeshadowTracker.calculateUrgency(
          fs.plantedChapter,
          fs.expectedPayoffChapter,
          chapter,
          this.plannedTotalChapters
        );
      }
    }
  }
}

/**
 * 伏笔报告
 */
export interface ForeshadowReport {
  activeForeshadows: EnhancedForeshadow[];
  urgentForeshadows: EnhancedForeshadow[];
  overdueForeshadows: EnhancedForeshadow[];
  resolvedForeshadows: EnhancedForeshadow[];
  stats: {
    total: number;
    active: number;
    urgent: number;
    overdue: number;
    resolved: number;
    buried: number;
    hinted: number;
    foreshadowed: number;
  };
  overdueRate: number;
  payoffProgress: number;
  nextPayoffSuggestion?: string;
}

/**
 * 伏笔分析器
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
      const matches = text.match(new RegExp(`[^。！？]{10,50}${pattern}[^。！？]{0,30}[。！？]`, 'g'));
      if (matches) {
        for (const match of matches.slice(0, 3)) {
          foreshadows.push({
            id: `fs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            content: match.slice(0, 100),
            loopType: type,
            urgency: 'medium',
            plantedChapter: chapterNumber,
            status: 'buried',
            confidence: 0.6,
          });
        }
      }
    }

    return foreshadows;
  }

  /**
   * 识别伏笔类型
   */
  static recognizeType(text: string): LoopType {
    const lowerText = text.toLowerCase();
    
    if (/秘密|隐藏|真相/.test(lowerText)) return 'mystery';
    if (/冲突|对抗|对立/.test(lowerText)) return 'conflict';
    if (/承诺|誓言/.test(lowerText)) return 'promise';
    if (/危险|威胁|危机/.test(lowerText)) return 'threat';
    if (/为什么|怎么.*原因/.test(lowerText)) return 'question';
    
    return 'mystery';
  }

  /**
   * 评估揭示时机
   */
  static evaluatePayoffTiming(
    foreshadow: EnhancedForeshadow,
    currentChapter: number,
    plannedTotalChapters: number
  ): {
    isOptimal: boolean;
    isUrgent: boolean;
    suggestion: string;
  } {
    const urgency = ForeshadowTracker.calculateUrgency(
      foreshadow.plantedChapter,
      foreshadow.expectedPayoffChapter,
      currentChapter,
      plannedTotalChapters
    );

    const isOptimal = urgency === 'high' || urgency === 'medium';
    const isUrgent = urgency === 'critical';

    let suggestion = '';
    switch (urgency) {
      case 'critical':
        suggestion = '⚠️ 紧急：必须在本章或下章揭示';
        break;
      case 'high':
        suggestion = '📌 建议：接下来2-3章内揭示';
        break;
      case 'medium':
        suggestion = '✅ 合适：可以安排揭示时机';
        break;
      case 'low':
        suggestion = '📝 正常：按计划推进即可';
        break;
    }

    return { isOptimal, isUrgent, suggestion };
  }
}

/**
 * 创建伏笔追踪器
 */
export function createForeshadowTracker(
  project: Project,
  currentChapter: number,
  foreshadows?: EnhancedForeshadow[],
  plannedTotalChapters?: number
): ForeshadowTracker {
  // 如果没有提供增强伏笔，从项目伏笔转换
  let enhancedForeshadows = foreshadows;
  if (!enhancedForeshadows && project.foreshadows) {
    const total = plannedTotalChapters || 
      project.metadata?.plannedChapterCount || 100;
    enhancedForeshadows = project.foreshadows.map(f => 
      ForeshadowTracker.createEnhancedForeshadow(f, currentChapter, total)
    );
  }

  return new ForeshadowTracker(
    project,
    currentChapter,
    enhancedForeshadows || [],
    plannedTotalChapters
  );
}

/**
 * 批量创建揭示任务
 */
export function batchCreatePayoffMissions(
  foreshadows: Foreshadow[],
  currentChapter: number,
  plannedTotalChapters: number
): PayoffMission[] {
  const tracker = createForeshadowTracker(
    { foreshadows } as Project,
    currentChapter,
    foreshadows.map(f => 
      ForeshadowTracker.createEnhancedForeshadow(f, currentChapter, plannedTotalChapters)
    ),
    plannedTotalChapters
  );

  return tracker.generatePayoffMissions();
}

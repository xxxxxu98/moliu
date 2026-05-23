/**
 * 完结感知引擎
 * 综合判断小说是否接近完结，参考 oh-story-claudecode 和 webnovel-writer 的设计
 */

import type { 
  Project, 
  ChapterMemory, 
  Foreshadow,
  PlotNode 
} from '@/types/project';
import type {
  EndingReadiness,
  UnresolvedForeshadow,
  EndingSignal,
  EndingPhase,
  ProjectEndingMeta,
  ChapterNode,
  ChapterNodeType,
  FiveLevelStoryline,
  StorylineProgress,
  StorylineProgressReport,
  PlotPhase,
  PlotPhaseInfo,
  EndingGuidance,
  EndingType,
  PayoffMission,
  WritingStrategyAdjustment,
} from '@/types/ending-perception';

/**
 * 完结感知引擎
 */
export class EndingPerceptionEngine {
  private project: Project;
  private currentChapterIndex: number;
  private memories: ChapterMemory[];
  private foreshadows: Foreshadow[];
  private plotOutline: PlotNode[];

  constructor(
    project: Project,
    currentChapterIndex: number,
    memories: ChapterMemory[],
    foreshadows: Foreshadow[],
    plotOutline: PlotNode[]
  ) {
    this.project = project;
    this.currentChapterIndex = currentChapterIndex;
    this.memories = memories;
    this.foreshadows = foreshadows;
    this.plotOutline = plotOutline;
  }

  /**
   * 分析完结准备度
   */
  analyzeEndingReadiness(): EndingReadiness {
    const meta = this.project.metadata;
    
    // 1. 计算大纲进度
    const outlineProgress = this.calculateOutlineProgress();
    
    // 2. 计算章节进度
    const plannedChapterCount = meta?.plannedChapterCount || this.estimatePlannedChapterCount();
    const chapterProgress = this.calculateChapterProgress(plannedChapterCount);
    
    // 3. 计算伏笔完成率
    const foreshadowCompletionRate = this.calculateForeshadowCompletionRate();
    
    // 4. 获取未解决伏笔
    const unresolvedForeshadows = this.getUnresolvedForeshadows();
    
    // 5. 判断高潮是否临近
    const climaxApproaching = this.isClimaxApproaching(meta?.climaxChapterIndex);
    
    // 6. 检测完结信号
    const endingSignals = this.detectEndingSignals();
    
    // 7. 判断当前阶段
    const { phase, phaseName } = this.determineEndingPhase(
      outlineProgress,
      chapterProgress,
      foreshadowCompletionRate
    );
    
    // 8. 计算剩余章节数
    const remainingChapters = this.calculateRemainingChapters(
      plannedChapterCount,
      foreshadowCompletionRate,
      unresolvedForeshadows
    );
    
    // 9. 生成完结建议
    const recommendation = this.generateEndingRecommendation(
      phase,
      outlineProgress,
      foreshadowCompletionRate,
      unresolvedForeshadows,
      climaxApproaching
    );
    
    // 10. 计算整体进度
    const overallProgress = Math.round(
      (outlineProgress * 0.4 + chapterProgress * 0.4 + foreshadowCompletionRate * 0.2)
    );

    return {
      isInEndingPhase: phase,
      phaseName,
      remainingChapters,
      unresolvedForeshadows,
      climaxApproaching,
      endingSignals,
      recommendation,
      overallProgress,
      outlineProgress,
      foreshadowCompletionRate,
      chapterProgress: Math.round(chapterProgress * 100),
    };
  }

  /**
   * 计算大纲完成度
   */
  private calculateOutlineProgress(): number {
    if (!this.plotOutline || this.plotOutline.length === 0) {
      return 0;
    }

    // 获取关键节点（高潮、结局等）
    const criticalNodes = this.plotOutline.filter(node => 
      node.isClimax || 
      node.chapterType === 'climax' ||
      node.chapterType === 'ending' ||
      node.chapterType === 'resolution'
    );

    if (criticalNodes.length === 0) {
      // 没有关键节点标记，按章节比例估算
      const plannedCount = this.project.metadata?.plannedChapterCount || 100;
      return Math.round((this.currentChapterIndex / plannedCount) * 100);
    }

    // 统计已过节点
    const passedNodes = criticalNodes.filter(node => {
      if (node.chapterRange) {
        return node.chapterRange[1] <= this.currentChapterIndex;
      }
      return node.orderIndex <= this.currentChapterIndex;
    });

    return Math.round((passedNodes.length / criticalNodes.length) * 100);
  }

  /**
   * 计算章节进度
   */
  private calculateChapterProgress(plannedCount: number): number {
    return this.currentChapterIndex / plannedCount;
  }

  /**
   * 计算伏笔完成率
   */
  private calculateForeshadowCompletionRate(): number {
    if (!this.foreshadows || this.foreshadows.length === 0) {
      return 100;
    }

    const resolved = this.foreshadows.filter(f => f.status === 'resolved').length;
    return Math.round((resolved / this.foreshadows.length) * 100);
  }

  /**
   * 获取未解决伏笔
   */
  private getUnresolvedForeshadows(): UnresolvedForeshadow[] {
    return this.foreshadows
      .filter(f => f.status !== 'resolved' && f.status !== 'abandoned')
      .map(f => ({
        id: f.id,
        hint: f.hint,
        plantedChapter: f.createdChapter,
        urgency: this.calculateForeshadowUrgency(f),
        difficulty: this.estimatePayoffDifficulty(f),
        reason: this.getUrgencyReason(f),
      }))
      .sort((a, b) => {
        const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      });
  }

  /**
   * 计算伏笔紧急度
   */
  private calculateForeshadowUrgency(foreshadow: Foreshadow): 'critical' | 'high' | 'medium' | 'low' {
    const planted = foreshadow.createdChapter;
    const expected = foreshadow.suggestedResolutionChapter;
    const plannedCount = this.project.metadata?.plannedChapterCount || 100;

    // 如果有期望揭示章节
    if (expected) {
      const remaining = expected - this.currentChapterIndex;
      if (remaining <= 0) return 'critical';
      if (remaining <= 3) return 'high';
      if (remaining <= 5) return 'medium';
      return 'low';
    }

    // 按总进度推算
    const plantedProgress = planted / plannedCount;
    const currentProgress = this.currentChapterIndex / plannedCount;

    if (plantedProgress > 0.8 && currentProgress > 0.9) return 'critical';
    if (plantedProgress > 0.6 && currentProgress > 0.75) return 'high';
    if (plantedProgress > 0.4 && currentProgress > 0.5) return 'medium';
    return 'low';
  }

  /**
   * 估算揭示难度
   */
  private estimatePayoffDifficulty(foreshadow: Foreshadow): 'easy' | 'medium' | 'hard' {
    const unresolvedCount = this.foreshadows.filter(f => f.status !== 'resolved').length;
    
    // 伏笔太多，揭示可能较难
    if (unresolvedCount > 10) return 'hard';
    if (unresolvedCount > 5) return 'medium';
    return 'easy';
  }

  /**
   * 获取紧急度原因
   */
  private getUrgencyReason(foreshadow: Foreshadow): string {
    const urgency = this.calculateForeshadowUrgency(foreshadow);
    const plannedCount = this.project.metadata?.plannedChapterCount || 100;
    const progress = this.currentChapterIndex / plannedCount;

    if (urgency === 'critical') {
      return `伏笔已埋设 ${this.currentChapterIndex - foreshadow.createdChapter} 章，仍未揭示`;
    }
    if (urgency === 'high') {
      return `伏笔埋设位置较深，需尽快揭示`;
    }
    if (progress > 0.8) {
      return `接近尾声，建议本章或下章揭示`;
    }
    return `按计划揭示`;
  }

  /**
   * 判断高潮是否临近
   */
  private isClimaxApproaching(climaxChapterIndex?: number): boolean {
    if (climaxChapterIndex) {
      return this.currentChapterIndex >= climaxChapterIndex - 5;
    }

    // 按大纲推算
    const climaxNodes = this.plotOutline.filter(n => n.isClimax || n.chapterType === 'climax');
    if (climaxNodes.length > 0) {
      const nearestClimax = climaxNodes.reduce((nearest, node) => {
        const range = node.chapterRange;
        if (range) {
          return range[0] <= this.currentChapterIndex ? node : nearest;
        }
        return nearest;
      });
      
      if (nearestClimax?.chapterRange) {
        return this.currentChapterIndex >= nearestClimax.chapterRange[0] - 5;
      }
    }

    // 按进度推算（假设高潮在 70-80% 处）
    const progress = this.currentChapterIndex / (this.project.metadata?.plannedChapterCount || 100);
    return progress >= 0.65 && progress <= 0.85;
  }

  /**
   * 检测完结信号
   */
  private detectEndingSignals(): EndingSignal[] {
    const signals: EndingSignal[] = [];
    const plannedCount = this.project.metadata?.plannedChapterCount || 100;
    const progress = this.currentChapterIndex / plannedCount;

    // 检查最近的记忆
    const recentMemories = this.memories.slice(-5);

    // 1. 情感信号
    const emotionalSignals = this.detectEmotionalSignals(recentMemories);
    signals.push(...emotionalSignals);

    // 2. 伏笔回收信号
    if (this.foreshadows.filter(f => f.status === 'resolved').length > this.foreshadows.length * 0.7) {
      signals.push({
        type: 'foreshadow',
        title: '伏笔大量回收',
        description: '超过70%的伏笔已揭示，接近尾声',
        chapter: this.currentChapterIndex,
      });
    }

    // 3. 进度信号
    if (progress >= 0.9) {
      signals.push({
        type: 'plot',
        title: '章节进度超90%',
        description: '按计划即将完结',
        chapter: this.currentChapterIndex,
      });
    }

    return signals;
  }

  /**
   * 检测情感信号
   */
  private detectEmotionalSignals(memories: ChapterMemory[]): EndingSignal[] {
    const signals: EndingSignal[] = [];
    
    const emotionalTones = memories
      .map(m => m.emotionalTone)
      .filter(Boolean);

    // 检测情感收束趋势
    if (emotionalTones.includes('释然') || emotionalTones.includes('温馨')) {
      signals.push({
        type: 'emotional',
        title: '情感开始收束',
        description: '出现温馨/释然情感，可能接近尾声',
        chapter: this.currentChapterIndex,
      });
    }

    // 检测情感高潮趋势
    const climaxCount = emotionalTones.filter(t => 
      t?.includes('紧张') || t?.includes('激烈') || t?.includes('高潮')
    ).length;

    if (climaxCount >= 3) {
      signals.push({
        type: 'emotional',
        title: '情感持续高潮',
        description: '连续多章情感紧张，即将迎来释放',
        chapter: this.currentChapterIndex,
      });
    }

    return signals;
  }

  /**
   * 判断当前阶段
   */
  private determineEndingPhase(
    outlineProgress: number,
    chapterProgress: number,
    foreshadowCompletion: number
  ): { phase: EndingPhase; phaseName: string } {
    const progress = Math.max(outlineProgress, chapterProgress * 100);

    if (progress >= 90 || foreshadowCompletion >= 95) {
      return { phase: 'conclusion', phaseName: '收束阶段' };
    }
    if (progress >= 75) {
      return { phase: 'ending', phaseName: '结局阶段' };
    }
    if (progress >= 60) {
      return { phase: 'pre_ending', phaseName: '完结准备' };
    }
    return { phase: 'normal', phaseName: '正常写作' };
  }

  /**
   * 计算剩余章节数
   */
  private calculateRemainingChapters(
    plannedCount: number,
    foreshadowCompletion: number,
    unresolvedForeshadows: UnresolvedForeshadow[]
  ): number {
    const planned = plannedCount - this.currentChapterIndex - 1;
    
    // 伏笔完成度越低，额外需要的章节越多
    const foreshadowBuffer = Math.ceil((100 - foreshadowCompletion) / 15);
    
    // 紧急伏笔需要额外章节
    const urgentBuffer = unresolvedForeshadows.filter(f => 
      f.urgency === 'critical' || f.urgency === 'high'
    ).length * 2;

    return Math.max(3, planned + foreshadowBuffer + urgentBuffer);
  }

  /**
   * 生成完结建议
   */
  private generateEndingRecommendation(
    phase: EndingPhase,
    outlineProgress: number,
    foreshadowCompletion: number,
    unresolvedForeshadows: UnresolvedForeshadow[],
    climaxApproaching: boolean
  ): string {
    // 紧急伏笔处理
    const criticalForeshadows = unresolvedForeshadows.filter(f => f.urgency === 'critical');
    if (criticalForeshadows.length > 0) {
      return `⚠️ 有 ${criticalForeshadows.length} 个紧急伏笔需要立即处理：${criticalForeshadows[0].hint.slice(0, 20)}...`;
    }

    // 完结阶段建议
    if (phase === 'conclusion') {
      return '✅ 可以开始写完结章节，注意情感收束和留白';
    }

    if (phase === 'ending') {
      return '📖 处于结局阶段，开始收束支线，为完结做准备';
    }

    if (phase === 'pre_ending') {
      return '📝 接近尾声，加快节奏，推进主线剧情';
    }

    // 高潮临近
    if (climaxApproaching) {
      return '🎯 高潮即将到来，建议增加冲突密度，准备大场面';
    }

    // 伏笔未完成
    if (foreshadowCompletion < 80) {
      return `📌 还有 ${100 - foreshadowCompletion}% 的伏笔未揭示，建议优先处理`;
    }

    return '✍️ 正常写作中，保持当前节奏';
  }

  /**
   * 估算计划章节数
   */
  private estimatePlannedChapterCount(): number {
    // 如果有目标字数和平均章节字数，估算
    if (this.project.targetWordCount) {
      const avgWordsPerChapter = 3000; // 默认平均每章3000字
      return Math.ceil(this.project.targetWordCount / avgWordsPerChapter);
    }

    // 如果有大纲节点，按节点估算
    if (this.plotOutline.length > 0) {
      return Math.max(this.plotOutline.length * 3, 30); // 每节点约3章
    }

    // 默认100章
    return 100;
  }

  /**
   * 生成项目完结元数据
   */
  generateProjectEndingMeta(): ProjectEndingMeta {
    const plannedChapterCount = this.project.metadata?.plannedChapterCount || this.estimatePlannedChapterCount();
    const chapterNodes = this.extractChapterNodes();

    return {
      plannedChapterCount,
      plannedWordCount: this.project.targetWordCount || plannedChapterCount * 3000,
      climaxChapterIndex: this.findClimaxChapterIndex(),
      endingChapterIndex: this.findEndingChapterIndex(),
      outlineProgress: this.calculateOutlineProgress(),
      chapterNodes,
      isConfigured: !!this.project.metadata?.plannedChapterCount,
    };
  }

  /**
   * 提取章节节点
   */
  private extractChapterNodes(): ChapterNode[] {
    return this.plotOutline
      .filter(node => node.type === 'chapter' || node.chapterType)
      .map((node, index) => ({
        id: node.id,
        title: node.title,
        nodeType: this.mapChapterType(node.chapterType),
        chapterRange: node.chapterRange,
        estimatedChapterIndex: node.chapterRange?.[0] || index * 5,
        importance: node.isClimax ? 'critical' : 'major',
        description: node.description,
      }));
  }

  /**
   * 映射章节类型
   */
  private mapChapterType(type?: string): ChapterNodeType {
    switch (type) {
      case 'climax':
        return 'climax';
      case 'ending':
      case 'resolution':
        return 'ending';
      default:
        return 'development';
    }
  }

  /**
   * 查找高潮章节索引
   */
  private findClimaxChapterIndex(): number | undefined {
    // 从元数据
    if (this.project.metadata?.climaxChapterIndex) {
      return this.project.metadata.climaxChapterIndex;
    }

    // 从大纲节点
    const climaxNode = this.plotOutline.find(n => n.isClimax || n.chapterType === 'climax');
    if (climaxNode?.chapterRange) {
      return climaxNode.chapterRange[0];
    }

    // 按进度估算（假设高潮在70-80%处）
    const plannedCount = this.project.metadata?.plannedChapterCount || 100;
    return Math.floor(plannedCount * 0.75);
  }

  /**
   * 查找结局章节索引
   */
  private findEndingChapterIndex(): number | undefined {
    // 从元数据
    if (this.project.metadata?.endingChapterIndex) {
      return this.project.metadata.endingChapterIndex;
    }

    // 从大纲节点
    const endingNode = this.plotOutline.find(n => 
      n.chapterType === 'ending' || n.chapterType === 'resolution'
    );
    if (endingNode?.chapterRange) {
      return endingNode.chapterRange[0];
    }

    // 按进度估算（假设结局在90-95%处）
    const plannedCount = this.project.metadata?.plannedChapterCount || 100;
    return Math.floor(plannedCount * 0.92);
  }
}

/**
 * 生成章节情节阶段信息
 */
export function generatePlotPhaseInfo(chapterIndex: number, totalChapters: number): PlotPhaseInfo {
  const progress = chapterIndex / totalChapters;

  if (progress < 0.1) {
    return {
      phase: 'setup',
      phaseName: '开篇阶段',
      description: '建立世界观、介绍人物、铺设主线',
      recommendedStrategy: '节奏稍缓，注重代入感和期待建立',
    };
  }

  if (progress < 0.5) {
    return {
      phase: 'rising',
      phaseName: '上升阶段',
      description: '推进主线、展开冲突、角色成长',
      recommendedStrategy: '保持节奏紧凑，持续制造爽点和期待',
    };
  }

  if (progress < 0.7) {
    return {
      phase: 'climax',
      phaseName: '高潮阶段',
      description: '矛盾激化、决战临近',
      recommendedStrategy: '增加冲突密度，拉高情绪张力',
    };
  }

  if (progress < 0.9) {
    return {
      phase: 'falling',
      phaseName: '下落阶段',
      description: '高潮后的收束、问题解决',
      recommendedStrategy: '节奏放缓，收束情节，给读者满足感',
    };
  }

  return {
    phase: 'resolution',
    phaseName: '结局阶段',
    description: '情感收束、悬念解答',
    recommendedStrategy: '注重情感落点，留有余韵',
  };
}

/**
 * 生成完结指引
 */
export function generateEndingGuidance(
  endingPhase: EndingPhase,
  unresolvedForeshadows: UnresolvedForeshadow[],
  unresolvedConflicts: string[],
  endingType?: EndingType
): EndingGuidance {
  const mustResolve = unresolvedForeshadows
    .filter(f => f.urgency === 'critical' || f.urgency === 'high')
    .slice(0, 5)
    .map(f => f.hint);

  return {
    isFinalChapter: endingPhase === 'conclusion',
    endingType: endingType || 'bittersweet',
    mustResolveForeshadows: mustResolve,
    mustResolveConflicts: unresolvedConflicts.slice(0, 3),
    emotionalClosure: [
      '给主角一个情感落点',
      '回应开篇的期待',
      '给读者满足感',
    ],
    sequelHints: endingPhase === 'conclusion' ? ['可以留下彩蛋提示续集'] : undefined,
    chapterSuggestion: endingPhase === 'conclusion'
      ? '这是完结章，注重收束，可以稍长一些'
      : '继续推进主线，为完结做准备',
  };
}

/**
 * 生成伏笔揭示任务
 */
export function generatePayoffMissions(
  foreshadows: Foreshadow[],
  currentChapter: number,
  plannedTotalChapters: number
): PayoffMission[] {
  return foreshadows
    .filter(f => f.status !== 'resolved' && f.status !== 'abandoned')
    .map(f => {
      const expected = f.suggestedResolutionChapter || 
        Math.min(f.createdChapter + 10, plannedTotalChapters);

      return {
        foreshadowId: f.id,
        hint: f.hint,
        urgency: calculateUrgency(f, currentChapter, plannedTotalChapters),
        suggestedChapter: expected,
        difficulty: estimateDifficulty(f, foreshadows.length),
        compatibleStoryCards: getCompatibleStoryCards(f),
        relatedConflicts: [],
        payoffMethod: getPayoffMethod(f),
      };
    })
    .sort((a, b) => {
      const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    });
}

/**
 * 计算紧急度
 */
function calculateUrgency(
  foreshadow: Foreshadow,
  currentChapter: number,
  totalChapters: number
): 'critical' | 'high' | 'medium' | 'low' {
  const planted = foreshadow.createdChapter;
  const expected = foreshadow.suggestedResolutionChapter;

  if (expected) {
    const remaining = expected - currentChapter;
    if (remaining <= 0) return 'critical';
    if (remaining <= 3) return 'high';
    if (remaining <= 5) return 'medium';
    return 'low';
  }

  const plantedProgress = planted / totalChapters;
  const currentProgress = currentChapter / totalChapters;

  if (plantedProgress > 0.8 && currentProgress > 0.9) return 'critical';
  if (plantedProgress > 0.6 && currentProgress > 0.75) return 'high';
  if (plantedProgress > 0.4 && currentProgress > 0.5) return 'medium';
  return 'low';
}

/**
 * 估算揭示难度
 */
function estimateDifficulty(foreshadow: Foreshadow, totalUnresolved: number): 'easy' | 'medium' | 'hard' {
  if (totalUnresolved > 10) return 'hard';
  if (totalUnresolved > 5) return 'medium';
  return 'easy';
}

/**
 * 获取兼容的故事卡
 */
function getCompatibleStoryCards(foreshadow: Foreshadow): string[] {
  switch (foreshadow.type) {
    case 'item':
      return ['点石成金', '慧眼识真', '装逼打脸'];
    case 'dialogue':
      return ['英雄救美', '真相揭晓', '误会解除'];
    case 'event':
      return ['临危受命', '少年热血', '反转再反转'];
    case 'mystery':
      return ['悬疑揭秘', '身份揭露', '反转'];
    default:
      return ['装逼打脸', '真相揭晓'];
  }
}

/**
 * 获取揭示方式建议
 */
function getPayoffMethod(foreshadow: Foreshadow): string {
  switch (foreshadow.type) {
    case 'item':
      return '在战斗/交易/探险中自然揭示';
    case 'dialogue':
      return '通过对话、回忆或对峙场景揭示';
    case 'event':
      return '通过关键事件、冲突爆发时揭示';
    case 'mystery':
      return '通过层层铺垫，在高潮时刻揭晓真相';
    default:
      return '选择合适的剧情节点自然揭示';
  }
}

/**
 * 生成写作策略调整
 */
export function generateWritingStrategyAdjustment(
  endingPhase: EndingPhase,
  climaxApproaching: boolean
): WritingStrategyAdjustment {
  const baseStrategy: WritingStrategyAdjustment = {
    currentPhase: endingPhase,
    pacingStrategy: '正常节奏',
    conflictDensity: 'medium',
    coolPointDensity: 'medium',
    emotionalToneSuggestion: '保持当前基调',
    endingSuggestion: '继续推进剧情',
    foreshadowPriority: [],
  };

  switch (endingPhase) {
    case 'conclusion':
      return {
        ...baseStrategy,
        pacingStrategy: '慢节奏、情感细腻',
        conflictDensity: 'low',
        coolPointDensity: 'low',
        emotionalToneSuggestion: '温馨、释然、满足',
        endingSuggestion: '收束所有情节线，注重情感落点',
      };

    case 'ending':
      return {
        ...baseStrategy,
        pacingStrategy: '逐渐加快、推向高潮',
        conflictDensity: 'high',
        coolPointDensity: 'high',
        emotionalToneSuggestion: '紧张、高昂、期待',
        endingSuggestion: '开始收束支线，为完结做准备',
      };

    case 'pre_ending':
      return {
        ...baseStrategy,
        pacingStrategy: '紧凑、有力',
        conflictDensity: 'medium',
        coolPointDensity: 'medium',
        emotionalToneSuggestion: '紧张但有希望',
        endingSuggestion: '加快主线推进',
      };

    default:
      if (climaxApproaching) {
        return {
          ...baseStrategy,
          pacingStrategy: '加快节奏、推向高潮',
          conflictDensity: 'high',
          coolPointDensity: 'high',
          emotionalToneSuggestion: '紧张、期待',
          endingSuggestion: '为即将到来的高潮蓄力',
        };
      }
      return baseStrategy;
  }
}

/**
 * 创建完结感知引擎实例
 */
export function createEndingPerceptionEngine(
  project: Project,
  currentChapterIndex: number,
  memories: ChapterMemory[],
  foreshadows: Foreshadow[],
  plotOutline: PlotNode[]
): EndingPerceptionEngine {
  return new EndingPerceptionEngine(
    project,
    currentChapterIndex,
    memories,
    foreshadows,
    plotOutline
  );
}

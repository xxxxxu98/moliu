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

  // ============================================
  // Phase 1: 完结触发器 - 明确判断是否可以完结
  // ============================================

  /**
   * 判断故事是否准备好完结
   * 参考 oh-story-claudecode 的高潮倒推法
   */
  isReadyToEnd(): boolean {
    const trigger = this.evaluateEndingTrigger();
    return this.evaluateTrigger(trigger);
  }

  /**
   * 评估完结触发器
   */
  evaluateEndingTrigger(): EndingTrigger {
    const plannedCount = this.project.metadata?.plannedChapterCount || this.estimatePlannedChapterCount();
    const progress = this.currentChapterIndex / plannedCount;

    return {
      // 所有伏笔已揭示（允许少量低优先伏笔未揭示）
      allForeshadowsResolved: this.checkAllForeshadowsResolved(),
      // 所有核心冲突已解决
      allConflictsResolved: this.checkAllConflictsResolved(),
      // 所有故事线已收束
      allStorylinesConverged: this.checkAllStorylinesConverged(),
      // 高潮已完成
      climaxCompleted: this.checkClimaxCompleted(),
      // 情感弧线完整
      emotionalArcComplete: this.checkEmotionalArcComplete(),
      // 主角目标已达成
      protagonistGoalAchieved: this.checkProtagonistGoalAchieved(),
      // 章节数达到计划（允许±10%误差）
      chapterCountReached: progress >= 0.9 && progress <= 1.1,
    };
  }

  /**
   * 评估触发器是否全部满足
   */
  private evaluateTrigger(trigger: EndingTrigger): boolean {
    // 核心条件：高潮完成 + 主角目标达成 + 章节数接近计划
    const coreConditions = 
      trigger.climaxCompleted &&
      trigger.protagonistGoalAchieved &&
      trigger.chapterCountReached;

    // 次要条件：伏笔和冲突（允许少量例外）
    const secondaryConditions =
      (trigger.allForeshadowsResolved || this.hasOnlyMinorForeshadows()) &&
      (trigger.allConflictsResolved || this.hasOnlyMinorConflicts());

    // 情感弧线必须完整
    const emotionalCondition = trigger.emotionalArcComplete;

    return coreConditions && secondaryConditions && emotionalCondition;
  }

  /**
   * 检查所有伏笔是否已揭示
   */
  private checkAllForeshadowsResolved(): boolean {
    if (!this.foreshadows || this.foreshadows.length === 0) return true;
    
    const unresolved = this.foreshadows.filter(
      f => f.status !== 'resolved' && f.status !== 'abandoned'
    );
    
    // 允许少量低优先伏笔未揭示
    const criticalUnresolved = unresolved.filter(f => {
      const urgency = this.calculateForeshadowUrgency(f);
      return urgency === 'critical' || urgency === 'high';
    });
    
    return criticalUnresolved.length === 0;
  }

  /**
   * 是否有仅剩少量低优先伏笔
   */
  private hasOnlyMinorForeshadows(): boolean {
    const unresolved = this.foreshadows.filter(
      f => f.status !== 'resolved' && f.status !== 'abandoned'
    );
    return unresolved.length <= 3;
  }

  /**
   * 检查所有冲突是否已解决
   */
  private checkAllConflictsResolved(): boolean {
    // 从项目元数据获取冲突设计
    const conflictDesign = this.project.conflictDesign;
    if (!conflictDesign?.majorConflicts) return true;

    // 检查核心冲突是否已解决
    const unresolvedConflicts = conflictDesign.majorConflicts.filter(
      c => c.status === 'pending' || c.status === 'active'
    );

    // 允许少量次要冲突未解决
    return unresolvedConflicts.length <= 2;
  }

  /**
   * 是否有仅剩少量次要冲突
   */
  private hasOnlyMinorConflicts(): boolean {
    const conflictDesign = this.project.conflictDesign;
    if (!conflictDesign?.majorConflicts) return true;

    const unresolved = conflictDesign.majorConflicts.filter(
      c => c.status === 'pending' || c.status === 'active'
    );
    return unresolved.length <= 2;
  }

  /**
   * 检查所有故事线是否已收束
   * 参考 oh-story-claudecode 的八条故事线设计
   */
  private checkAllStorylinesConverged(): boolean {
    const plannedCount = this.project.metadata?.plannedChapterCount || 100;
    const progress = this.currentChapterIndex / plannedCount;

    // 接近结尾时（90%+），故事线应该开始收束
    if (progress < 0.9) return true;

    // 检查大纲节点是否都已覆盖
    const unconvergedNodes = this.plotOutline.filter(node => {
      if (!node.chapterRange) return false;
      return node.chapterRange[1] > this.currentChapterIndex;
    });

    // 允许少量节点未收束
    return unconvergedNodes.length <= 5;
  }

  /**
   * 检查高潮是否已完成
   */
  private checkClimaxCompleted(): boolean {
    const climaxChapter = this.findClimaxChapterIndex();
    if (!climaxChapter) return true; // 没有高潮标记，默认通过

    return this.currentChapterIndex >= climaxChapter;
  }

  /**
   * 检查情感弧线是否完整
   */
  private checkEmotionalArcComplete(): boolean {
    const recentMemories = this.memories.slice(-3);
    if (recentMemories.length < 3) return true; // 数据不足，默认通过

    // 检查最近的情感基调
    const recentTones = recentMemories
      .map(m => m.emotionalTone)
      .filter(Boolean);

    // 应该有收束趋势（温馨、释然、满足等）
    const hasClosureTrend = recentTones.some(tone =>
      tone?.includes('释然') ||
      tone?.includes('温馨') ||
      tone?.includes('满足') ||
      tone?.includes('圆满')
    );

    // 或者已经是结局阶段
    const progress = this.currentChapterIndex / 
      (this.project.metadata?.plannedChapterCount || 100);
    const isEndingPhase = progress >= 0.9;

    return hasClosureTrend || isEndingPhase;
  }

  /**
   * 检查主角目标是否已达成
   */
  private checkProtagonistGoalAchieved(): boolean {
    // 从大纲推断主角目标达成情况
    const endingNodes = this.plotOutline.filter(
      n => n.chapterType === 'ending' || n.chapterType === 'resolution'
    );

    // 如果有结局节点，检查是否已过
    if (endingNodes.length > 0) {
      const latestEnding = Math.max(
        ...endingNodes.map(n => n.chapterRange?.[0] || 0)
      );
      return this.currentChapterIndex >= latestEnding;
    }

    // 没有明确结局节点，检查进度
    const progress = this.currentChapterIndex / 
      (this.project.metadata?.plannedChapterCount || 100);
    return progress >= 0.95;
  }

  // ============================================
  // Phase 2: 完结完整性验证
  // ============================================

  /**
   * 验证完结完整性
   * 参考 webnovel-writer 的自检清单
   */
  validateEndingIntegrity(): EndingIntegrityReport {
    const trigger = this.evaluateEndingTrigger();
    const checkItems = this.generateCheckItems(trigger);
    const unresolvedForeshadows = this.getUnresolvedForeshadows();
    const unconvergedStorylines = this.checkStorylineConvergence();
    const emotionalArcStatus = this.trackEmotionalArc();
    const unresolvedConflicts = this.extractUnresolvedConflicts();

    // 计算完整性评分
    const integrityScore = this.calculateIntegrityScore(checkItems);

    // 估算缺少的章节数
    const missingChapters = this.estimateMissingChapters(
      trigger,
      unresolvedForeshadows,
      unconvergedStorylines
    );

    // 生成建议
    const suggestions = this.generateIntegritySuggestions(
      trigger,
      checkItems,
      unresolvedForeshadows,
      unconvergedStorylines,
      emotionalArcStatus
    );

    return {
      canEnd: this.evaluateTrigger(trigger),
      trigger,
      checkItems,
      unresolvedForeshadows,
      unresolvedConflicts,
      unconvergedStorylines,
      emotionalArcStatus,
      missingChapters,
      suggestions,
      integrityScore,
    };
  }

  /**
   * 生成完整性检查项
   */
  private generateCheckItems(trigger: EndingTrigger): EndingTriggerCheckItem[] {
    const items: EndingTriggerCheckItem[] = [];

    // 伏笔检查
    items.push({
      name: '伏笔完整性',
      description: '所有重要伏笔已揭示',
      passed: trigger.allForeshadowsResolved || this.hasOnlyMinorForeshadows(),
      detail: trigger.allForeshadowsResolved
        ? '所有伏笔已揭示'
        : '存在少量低优先伏笔未揭示',
      priority: 'high',
    });

    // 冲突检查
    items.push({
      name: '冲突解决',
      description: '核心冲突已解决',
      passed: trigger.allConflictsResolved || this.hasOnlyMinorConflicts(),
      detail: trigger.allConflictsResolved
        ? '所有核心冲突已解决'
        : '存在少量次要冲突未解决',
      priority: 'high',
    });

    // 故事线收束检查
    items.push({
      name: '故事线收束',
      description: '所有故事线已收束',
      passed: trigger.allStorylinesConverged,
      detail: trigger.allStorylinesConverged
        ? '所有故事线已收束'
        : '部分故事线仍在发展中',
      priority: 'medium',
    });

    // 高潮检查
    items.push({
      name: '高潮完成',
      description: '核心高潮已发生',
      passed: trigger.climaxCompleted,
      detail: trigger.climaxCompleted
        ? '高潮已完成'
        : '高潮尚未到达',
      relatedChapters: [this.findClimaxChapterIndex()].filter(Boolean) as number[],
      priority: 'critical',
    });

    // 情感弧线检查
    items.push({
      name: '情感弧线',
      description: '情感弧线完整',
      passed: trigger.emotionalArcComplete,
      detail: trigger.emotionalArcComplete
        ? '情感弧线完整'
        : '情感弧线尚未收束',
      priority: 'high',
    });

    // 主角目标检查
    items.push({
      name: '主角目标',
      description: '主角核心目标已达成',
      passed: trigger.protagonistGoalAchieved,
      detail: trigger.protagonistGoalAchieved
        ? '主角目标已达成'
        : '主角目标尚未完全实现',
      priority: 'critical',
    });

    // 章节数检查
    items.push({
      name: '章节规模',
      description: '章节数达到预期规模',
      passed: trigger.chapterCountReached,
      detail: trigger.chapterCountReached
        ? '章节数符合预期'
        : '章节数尚未达到预期',
      priority: 'medium',
    });

    return items;
  }

  /**
   * 提取未解决的冲突
   */
  private extractUnresolvedConflicts(): string[] {
    const conflictDesign = this.project.conflictDesign;
    if (!conflictDesign?.majorConflicts) return [];

    return conflictDesign.majorConflicts
      .filter(c => c.status === 'pending' || c.status === 'active')
      .map(c => c.title);
  }

  /**
   * 检查故事线收束情况
   */
  checkStorylineConvergence(): StorylineConvergence[] {
    const convergences: StorylineConvergence[] = [];
    const plannedCount = this.project.metadata?.plannedChapterCount || 100;

    // 地图线
    convergences.push({
      type: 'map',
      name: '地图线',
      converged: this.checkMapLineConverged(),
      completion: this.calculateMapLineCompletion(),
    });

    // 阵营线
    convergences.push({
      type: 'faction',
      name: '阵营线',
      converged: this.checkFactionLineConverged(),
      completion: this.calculateFactionLineCompletion(),
    });

    // 感情线
    convergences.push({
      type: 'romance',
      name: '感情线',
      converged: this.checkRomanceLineConverged(),
      completion: this.calculateRomanceLineCompletion(),
    });

    // 金手指线
    convergences.push({
      type: 'goldenfinger',
      name: '金手指线',
      converged: this.checkGoldenFingerLineConverged(),
      completion: this.calculateGoldenFingerLineCompletion(),
    });

    return convergences;
  }

  private checkMapLineConverged(): boolean {
    const progress = this.currentChapterIndex / 
      (this.project.metadata?.plannedChapterCount || 100);
    return progress >= 0.85;
  }

  private calculateMapLineCompletion(): number {
    const progress = this.currentChapterIndex / 
      (this.project.metadata?.plannedChapterCount || 100);
    return Math.round(progress * 100);
  }

  private checkFactionLineConverged(): boolean {
    const conflictDesign = this.project.conflictDesign;
    if (!conflictDesign?.majorConflicts) return true;
    
    const resolvedCount = conflictDesign.majorConflicts.filter(
      c => c.status === 'resolved'
    ).length;
    
    return resolvedCount >= conflictDesign.majorConflicts.length * 0.7;
  }

  private calculateFactionLineCompletion(): number {
    const conflictDesign = this.project.conflictDesign;
    if (!conflictDesign?.majorConflicts || conflictDesign.majorConflicts.length === 0) {
      return 100;
    }
    
    const resolvedCount = conflictDesign.majorConflicts.filter(
      c => c.status === 'resolved'
    ).length;
    
    return Math.round((resolvedCount / conflictDesign.majorConflicts.length) * 100);
  }

  private checkRomanceLineConverged(): boolean {
    const recentMemories = this.memories.slice(-5);
    const hasRomanceResolution = recentMemories.some(m =>
      m.emotionalTone?.includes('温馨') ||
      m.emotionalTone?.includes('圆满') ||
      m.keyEvents.some(e => e.includes('在一起') || e.includes('表白'))
    );

    const progress = this.currentChapterIndex / 
      (this.project.metadata?.plannedChapterCount || 100);
    
    return hasRomanceResolution || progress >= 0.9;
  }

  private calculateRomanceLineCompletion(): number {
    const progress = this.currentChapterIndex / 
      (this.project.metadata?.plannedChapterCount || 100);
    
    // 感情线通常在60%-90%达到高潮
    if (progress < 0.3) return Math.round(progress * 100);
    if (progress < 0.7) return 30 + Math.round((progress - 0.3) * 175);
    return Math.min(95, Math.round(progress * 100));
  }

  private checkGoldenFingerLineConverged(): boolean {
    const storyLines = this.project.metadata?.storyLines;
    if (!storyLines?.goldenfinger) return true;
    
    // 金手指通常在70%处达到顶峰
    const progress = this.currentChapterIndex / 
      (this.project.metadata?.plannedChapterCount || 100);
    
    return progress >= 0.7;
  }

  private calculateGoldenFingerLineCompletion(): number {
    const progress = this.currentChapterIndex / 
      (this.project.metadata?.plannedChapterCount || 100);
    return Math.round(progress * 100);
  }

  /**
   * 计算完整性评分
   */
  private calculateIntegrityScore(items: EndingTriggerCheckItem[]): number {
    const weights: Record<string, number> = {
      critical: 20,
      high: 15,
      medium: 10,
      low: 5,
    };

    let totalScore = 0;
    let totalWeight = 0;

    for (const item of items) {
      const weight = weights[item.priority];
      totalWeight += weight;
      totalScore += item.passed ? weight : 0;
    }

    return Math.round((totalScore / totalWeight) * 100);
  }

  /**
   * 估算缺少的章节数
   */
  private estimateMissingChapters(
    trigger: EndingTrigger,
    unresolvedForeshadows: UnresolvedForeshadow[],
    unconvergedStorylines: StorylineConvergence[]
  ): number {
    let missing = 0;

    // 紧急伏笔需要章节
    const criticalForeshadows = unresolvedForeshadows.filter(
      f => f.urgency === 'critical' || f.urgency === 'high'
    );
    missing += criticalForeshadows.length * 2;

    // 未收束的故事线需要章节
    const unconverged = unconvergedStorylines.filter(s => !s.converged);
    missing += unconverged.length * 3;

    // 高潮未完成
    if (!trigger.climaxCompleted) {
      missing += 5;
    }

    // 情感弧线未完整
    if (!trigger.emotionalArcComplete) {
      missing += 3;
    }

    return Math.max(0, missing);
  }

  /**
   * 生成完整性建议
   */
  private generateIntegritySuggestions(
    trigger: EndingTrigger,
    checkItems: EndingTriggerCheckItem[],
    unresolvedForeshadows: UnresolvedForeshadow[],
    unconvergedStorylines: StorylineConvergence[],
    emotionalArcStatus: EmotionalArcStatus
  ): string[] {
    const suggestions: string[] = [];

    // 检查未通过项
    const failedItems = checkItems.filter(item => !item.passed);
    for (const item of failedItems) {
      if (item.priority === 'critical') {
        suggestions.push(`🚨 [必须解决] ${item.name}: ${item.detail}`);
      } else if (item.priority === 'high') {
        suggestions.push(`⚠️ [建议解决] ${item.name}: ${item.detail}`);
      }
    }

    // 紧急伏笔
    const criticalFs = unresolvedForeshadows.filter(f => f.urgency === 'critical');
    if (criticalFs.length > 0) {
      suggestions.push(`📌 优先处理 ${criticalFs.length} 个紧急伏笔`);
    }

    // 未收束的故事线
    const unconverged = unconvergedStorylines.filter(s => !s.converged);
    if (unconverged.length > 0) {
      suggestions.push(`🧵 需要收束的故事线: ${unconverged.map(s => s.name).join(', ')}`);
    }

    // 情感弧线
    if (!emotionalArcStatus.matchesExpectation) {
      suggestions.push(`💭 情感弧线需要调整: ${emotionalArcStatus.issue}`);
    }

    // 如果可以完结
    if (suggestions.length === 0) {
      suggestions.push('✅ 故事已准备好完结，可以开始写结局章');
    }

    return suggestions;
  }

  // ============================================
  // Phase 3: 情绪弧线追踪
  // 参考 oh-story-claudecode 的情绪五折线设计
  // ============================================

  /**
   * 追踪情感弧线
   */
  trackEmotionalArc(): EmotionalArcStatus {
    const targetArcType = this.inferTargetArcType();
    const currentArcType = this.analyzeCurrentArcType();
    const stages = this.extractEmotionalStages();
    const peaks = this.identifyEmotionalPeaks();
    const currentStage = this.determineCurrentStage(stages);
    const completion = this.calculateArcCompletion(stages);

    return {
      arcType: currentArcType,
      targetArcType,
      isComplete: completion >= 90,
      currentStage,
      stages,
      peaks,
      completion,
      remainingPeaks: this.estimateRemainingPeaks(peaks, completion),
      matchesExpectation: this.checkArcMatchesExpectation(currentArcType, targetArcType),
      issue: this.getArcIssue(currentArcType, targetArcType),
    };
  }

  /**
   * 推断目标情感弧线类型
   */
  private inferTargetArcType(): EmotionalArcType {
    // 从项目元数据推断
    const emotionGoal = this.project.metadata?.emotionGoal;
    if (emotionGoal?.arc) {
      const arcMap: Record<string, EmotionalArcType> = {
        'rising': 'rising',
        'falling': 'falling',
        'wave': 'wave',
        'mixed': 'mixed',
      };
      return arcMap[emotionGoal.arc] || 'wave';
    }

    // 根据题材推断默认弧线
    const genres = this.project.genre?.map(g => g.name).join('');
    if (genres?.includes('爽文') || genres?.includes('逆袭')) {
      return 'rising'; // 上升型
    }
    if (genres?.includes('虐文')) {
      return 'falling'; // 下降型
    }

    return 'wave'; // 默认波浪型
  }

  /**
   * 分析当前情感弧线类型
   */
  private analyzeCurrentArcType(): EmotionalArcType {
    if (this.memories.length < 5) return 'wave';

    const tones = this.memories
      .map(m => m.emotionalTone)
      .filter(Boolean) as string[];

    if (tones.length < 3) return 'wave';

    // 检查情感趋势
    const positiveCount = tones.filter(t =>
      t.includes('温馨') || t.includes('满足') || t.includes('高潮')
    ).length;
    const negativeCount = tones.filter(t =>
      t.includes('紧张') || t.includes('压抑') || t.includes('危机')
    ).length;

    if (positiveCount > negativeCount * 1.5) return 'rising';
    if (negativeCount > positiveCount * 1.5) return 'falling';

    return 'wave';
  }

  /**
   * 提取情感阶段
   */
  private extractEmotionalStages(): EmotionalArcStage[] {
    const stages: EmotionalArcStage[] = [];
    const plannedCount = this.project.metadata?.plannedChapterCount || 100;

    // 五折线阶段
    const folds = [
      { name: '铺垫', type: 'setup' as const, range: [0, 0.2] as [number, number], emotion: '平稳' },
      { name: '上升', type: 'rising' as const, range: [0.2, 0.5] as [number, number], emotion: '期待' },
      { name: '高潮', type: 'climax' as const, range: [0.5, 0.7] as [number, number], emotion: '紧张' },
      { name: '下落', type: 'falling' as const, range: [0.7, 0.85] as [number, number], emotion: '释放' },
      { name: '收束', type: 'resolution' as const, range: [0.85, 1.0] as [number, number], emotion: '满足' },
    ];

    for (const fold of folds) {
      const startChapter = Math.floor(fold.range[0] * plannedCount);
      const endChapter = Math.floor(fold.range[1] * plannedCount);

      stages.push({
        name: fold.name,
        type: fold.type,
        startChapter,
        endChapter,
        intensity: this.calculateStageIntensity(fold.type),
        primaryEmotions: [fold.emotion],
        isClimax: fold.type === 'climax',
        description: `${fold.name}阶段的情感应该${fold.emotion}`,
      });
    }

    return stages;
  }

  /**
   * 计算阶段情绪强度
   */
  private calculateStageIntensity(type: string): number {
    const intensityMap: Record<string, number> = {
      setup: 3,
      rising: 5,
      climax: 9,
      falling: 6,
      resolution: 4,
    };
    return intensityMap[type] || 5;
  }

  /**
   * 识别情绪峰值
   */
  private identifyEmotionalPeaks(): EmotionalPeak[] {
    const peaks: EmotionalPeak[] = [];

    // 从记忆中识别峰值
    for (let i = 0; i < this.memories.length; i++) {
      const memory = this.memories[i];
      const tone = memory.emotionalTone;

      if (tone?.includes('高潮') || tone?.includes('爆发')) {
        peaks.push({
          chapter: memory.chapterIndex,
          intensity: 9,
          type: 'climax',
          description: '核心高潮',
        });
      } else if (tone?.includes('紧张') || tone?.includes('危机')) {
        peaks.push({
          chapter: memory.chapterIndex,
          intensity: 7,
          type: 'subclimax',
          description: '次级紧张',
        });
      } else if (tone?.includes('转折') || tone?.includes('反转')) {
        peaks.push({
          chapter: memory.chapterIndex,
          intensity: 8,
          type: 'twist',
          description: '剧情反转',
        });
      }
    }

    return peaks;
  }

  /**
   * 确定当前阶段
   */
  private determineCurrentStage(stages: EmotionalArcStage[]): EmotionalArcStage | null {
    const current = this.currentChapterIndex;

    for (const stage of stages) {
      if (current >= stage.startChapter && current <= stage.endChapter) {
        return stage;
      }
    }

    return stages[stages.length - 1] || null;
  }

  /**
   * 计算弧线完成度
   */
  private calculateArcCompletion(stages: EmotionalArcStage[]): number {
    const current = this.currentChapterIndex;
    const plannedCount = this.project.metadata?.plannedChapterCount || 100;
    const progress = current / plannedCount;

    // 根据当前进度估算完成度
    let completion = progress * 100;

    // 检查峰值是否按预期出现
    const expectedPeaks = Math.floor(plannedCount / 20); // 每20章一个峰值
    const actualPeaks = this.memories.filter(m =>
      m.emotionalTone?.includes('高潮') || m.emotionalTone?.includes('紧张')
    ).length;

    if (actualPeaks < expectedPeaks * 0.5) {
      completion *= 0.8; // 峰值不足，降低完成度
    }

    return Math.round(Math.min(100, completion));
  }

  /**
   * 估算剩余峰值数
   */
  private estimateRemainingPeaks(peaks: EmotionalPeak[], completion: number): number {
    const plannedCount = this.project.metadata?.plannedChapterCount || 100;
    const expectedTotalPeaks = Math.floor(plannedCount / 20);
    const remainingPercentage = (100 - completion) / 100;
    const remainingPeaks = Math.floor(expectedTotalPeaks * remainingPercentage);

    return Math.max(0, remainingPeaks - peaks.length);
  }

  /**
   * 检查弧线是否符合预期
   */
  private checkArcMatchesExpectation(
    current: EmotionalArcType,
    target: EmotionalArcType
  ): boolean {
    // 完全匹配
    if (current === target) return true;

    // 相邻类型可接受
    const acceptableCombinations: Record<string, string[]> = {
      wave: ['rising', 'falling', 'mixed'],
      rising: ['wave', 'mixed'],
      falling: ['wave', 'mixed'],
      climax: ['rising', 'wave'],
      plateau: ['falling', 'wave'],
    };

    return acceptableCombinations[target]?.includes(current) || false;
  }

  /**
   * 获取弧线问题
   */
  private getArcIssue(current: EmotionalArcType, target: EmotionalArcType): string | undefined {
    if (this.checkArcMatchesExpectation(current, target)) {
      return undefined;
    }

    const issues: Record<string, string> = {
      'rising_climax': '情感弧线过于平坦，缺少渐进式上升',
      'falling_rising': '情感弧线突然转向，与预期不符',
      'wave_plateau': '缺少高潮起伏',
    };

    return issues[`${current}_${target}`] || `当前弧线(${current})与预期(${target})不匹配`;
  }

  /**
   * 分析单章情绪
   */
  analyzeChapterEmotion(chapterIndex: number): ChapterEmotionalAnalysis | null {
    const memory = this.memories.find(m => m.chapterIndex === chapterIndex);
    if (!memory) return null;

    return {
      chapter: chapterIndex,
      primaryEmotion: memory.emotionalTone || '未知',
      secondaryEmotions: [],
      intensity: this.estimateEmotionIntensity(memory.emotionalTone),
      tensionLevel: this.estimateTensionLevel(memory),
      turnPoints: this.detectTurnPoints(chapterIndex),
      emotionWordFrequency: this.countEmotionWords(memory.corePlot),
      emotionDelta: this.calculateEmotionDelta(chapterIndex),
      confidence: 0.7,
    };
  }

  /**
   * 估算情绪强度
   */
  private estimateEmotionIntensity(tone?: string): number {
    if (!tone) return 5;

    const highIntensity = ['高潮', '爆发', '紧张', '激烈', '危机'];
    const mediumIntensity = ['期待', '转折', '冲突'];
    const lowIntensity = ['温馨', '平静', '日常'];

    if (highIntensity.some(e => tone.includes(e))) return 8;
    if (mediumIntensity.some(e => tone.includes(e))) return 6;
    if (lowIntensity.some(e => tone.includes(e))) return 4;
    return 5;
  }

  /**
   * 估算悬念强度
   */
  private estimateTensionLevel(memory: ChapterMemory): number {
    let level = 5;

    // 根据事件数量估算
    if (memory.keyEvents.length > 3) level += 1;
    if (memory.keyEvents.some(e => e.includes('危机') || e.includes('冲突'))) level += 2;

    // 根据新伏笔估算
    if (memory.newForeshadows.length > 0) level += 1;

    return Math.min(10, level);
  }

  /**
   * 检测情绪转折点
   */
  private detectTurnPoints(chapterIndex: number): number[] {
    const turnPoints: number[] = [];
    const memory = this.memories.find(m => m.chapterIndex === chapterIndex);

    if (!memory) return turnPoints;

    // 检测转折性事件
    const turnKeywords = ['转折', '反转', '意外', '发现', '揭示'];
    for (const event of memory.keyEvents) {
      if (turnKeywords.some(k => event.includes(k))) {
        turnPoints.push(chapterIndex);
        break;
      }
    }

    return turnPoints;
  }

  /**
   * 统计情绪词频
   */
  private countEmotionWords(text: string): Record<string, number> {
    const emotionWords: Record<string, string[]> = {
      紧张: ['紧张', '心跳', '屏息', '冷汗'],
      温馨: ['温馨', '微笑', '欢笑', '温暖'],
      悲伤: ['悲伤', '眼泪', '叹息', '哀伤'],
      愤怒: ['愤怒', '怒火', '怨恨'],
      喜悦: ['喜悦', '高兴', '兴奋', '开心'],
    };

    const frequency: Record<string, number> = {};

    for (const [emotion, words] of Object.entries(emotionWords)) {
      frequency[emotion] = 0;
      for (const word of words) {
        if (text.includes(word)) {
          frequency[emotion]++;
        }
      }
    }

    return frequency;
  }

  /**
   * 计算与上一章的情绪差值
   */
  private calculateEmotionDelta(chapterIndex: number): number {
    if (chapterIndex === 0) return 0;

    const current = this.memories.find(m => m.chapterIndex === chapterIndex);
    const previous = this.memories.find(m => m.chapterIndex === chapterIndex - 1);

    if (!current || !previous) return 0;

    const currentIntensity = this.estimateEmotionIntensity(current.emotionalTone);
    const previousIntensity = this.estimateEmotionIntensity(previous.emotionalTone);

    return currentIntensity - previousIntensity;
  }

  // ============================================
  // 原有方法保持不变
  // ============================================

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

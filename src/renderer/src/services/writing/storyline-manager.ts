/**
 * 五级主线竹子法管理器
 * 参考 oh-story-claudecode 的大纲排布方法论
 * 
 * 核心概念：
 * - 第1级主线 = 竹身（全书级）
 * - 第2级主线 = 竹节（卷级）
 * - 第3级主线 = 竹色（桥段级）
 * - 第4级主线 = 单元剧情
 * - 第5级主线 = 场景
 */

import type {
  Project,
  PlotNode,
  Chapter,
  Foreshadow,
} from '@/types/project';
import type {
  FiveLevelStoryline,
  Level1Storyline,
  Level2Storyline,
  Level3Storyline,
  Level4Storyline,
  Level5Storyline,
  ChapterNode,
  StorylineProgress,
  StorylineProgressReport,
  ProjectEndingMeta,
  EndingReadiness,
} from '@/types/ending-perception';
import { createEndingPerceptionEngine } from './ending-perception-engine';

/**
 * 五级主线竹子法管理器
 */
export class StorylineManager {
  private project: Project;
  private plotOutline: PlotNode[];
  private chapters: Chapter[];
  private foreshadows: Foreshadow[];
  private fiveLevelStoryline: FiveLevelStoryline;

  constructor(project: Project) {
    this.project = project;
    this.plotOutline = project.plotOutline || [];
    this.chapters = project.chapters || [];
    this.foreshadows = project.foreshadows || [];
    this.fiveLevelStoryline = this.initializeFiveLevelStoryline();
  }

  /**
   * 初始化五级主线
   */
  private initializeFiveLevelStoryline(): FiveLevelStoryline {
    return {
      level1: this.extractLevel1(),
      level2: this.extractLevel2(),
      level3: this.extractLevel3(),
      level4: [],
      level5: [],
    };
  }

  /**
   * 提取第1级主线（竹身）
   */
  private extractLevel1(): Level1Storyline {
    // 从项目描述和大纲推断
    const outline = this.plotOutline.find(p => p.type === 'act');
    
    return {
      name: this.project.name,
      startState: this.extractStartState(),
      endState: this.extractEndState(),
      coreGoal: outline?.description || this.project.description || '主角成长与冒险',
      description: `《${this.project.name}》的故事主线`,
    };
  }

  /**
   * 提取起始状态
   */
  private extractStartState(): string {
    // 从第一章大纲推断
    const firstChapter = this.chapters.find(c => c.orderIndex === 0);
    if (firstChapter?.plotSummary) {
      return firstChapter.plotSummary.slice(0, 100);
    }

    // 从大纲节点推断
    const openingNode = this.plotOutline.find(
      n => n.type === 'chapter' && n.orderIndex === 0
    );
    if (openingNode?.description) {
      return openingNode.description.slice(0, 100);
    }

    return '故事开始，主角处于初始状态';
  }

  /**
   * 提取终点状态
   */
  private extractEndState(): string {
    // 从结局节点推断
    const endingNode = this.plotOutline.find(
      n => n.chapterType === 'ending' || n.chapterType === 'resolution'
    );
    if (endingNode?.description) {
      return endingNode.description.slice(0, 100);
    }

    return '故事完结，主角达成目标';
  }

  /**
   * 提取第2级主线（竹节）
   */
  private extractLevel2(): Level2Storyline[] {
    const volumes = this.project.volumes || [];
    
    // 按卷分组
    const volumeNodes: Level2Storyline[] = volumes.map((volume, volumeIndex) => {
      const volumeChapters = this.chapters.filter(c => c.volumeId === volume.id);
      const volumeNodes = this.plotOutline.filter(
        n => n.parentId === volume.id
      );

      const startChapter = Math.min(...volumeChapters.map(c => c.orderIndex));
      const endChapter = Math.max(...volumeChapters.map(c => c.orderIndex));

      // 查找高潮节点
      const climaxNode = volumeNodes.find(n => n.isClimax || n.chapterType === 'climax');

      return {
        id: volume.id,
        name: volume.name,
        chapterRange: [startChapter, endChapter],
        goals: volume.summary ? [volume.summary] : [],
        coreConflict: this.extractVolumeConflict(volumeNodes),
        involvedCharacters: this.extractVolumeCharacters(volumeNodes),
        climaxChapterIndex: climaxNode?.chapterRange?.[0],
        isCompleted: volumeChapters.every(c => c.content && c.content.length > 0),
      };
    });

    // 如果没有卷，按阶段分组
    if (volumeNodes.length === 0) {
      const outlineChapters = this.plotOutline.filter(n => n.type === 'chapter');
      const totalChapters = outlineChapters.length;
      const chaptersPerVolume = Math.ceil(totalChapters / 5); // 默认5卷

      for (let i = 0; i < 5; i++) {
        const start = i * chaptersPerVolume;
        const end = Math.min((i + 1) * chaptersPerVolume - 1, totalChapters - 1);
        
        if (start >= totalChapters) break;

        volumeNodes.push({
          id: `volume-${i}`,
          name: `第${this.toChineseNumber(i + 1)}卷`,
          chapterRange: [start, end],
          goals: [],
          coreConflict: `第${i + 1}卷核心冲突`,
          involvedCharacters: [],
          isCompleted: false,
        });
      }
    }

    return volumeNodes;
  }

  /**
   * 提取第3级主线（竹色）
   */
  private extractLevel3(): Level3Storyline[] {
    const segments: Level3Storyline[] = [];

    // 从 plotOutline 中提取桥段节点
    const segmentNodes = this.plotOutline.filter(
      n => n.type === 'subplot' || n.type === 'chapter'
    );

    for (let i = 0; i < segmentNodes.length; i++) {
      const node = segmentNodes[i];
      const nextNode = segmentNodes[i + 1];

      segments.push({
        id: node.id || `segment-${i}`,
        name: node.title || `桥段${i + 1}`,
        chapterRange: node.chapterRange || [i * 5, (i + 1) * 5 - 1],
        foreshadow: node.description,
        payoff: nextNode?.description,
        storyCards: this.extractStoryCards(node),
        emotionalTone: this.inferEmotionalTone(node),
      });
    }

    // 如果没有细分，自动生成分段
    if (segments.length === 0 && this.plotOutline.length > 0) {
      const totalChapters = this.project.metadata?.plannedChapterCount || 100;
      const segmentSize = 10; // 每段10章

      for (let i = 0; i < Math.ceil(totalChapters / segmentSize); i++) {
        segments.push({
          id: `segment-${i}`,
          name: `第${i + 1}桥段`,
          chapterRange: [i * segmentSize, Math.min((i + 1) * segmentSize - 1, totalChapters - 1)],
          storyCards: [],
          emotionalTone: this.inferSegmentTone(i, Math.ceil(totalChapters / segmentSize)),
        });
      }
    }

    return segments;
  }

  /**
   * 提取故事卡
   */
  private extractStoryCards(node: PlotNode): string[] {
    const cards: string[] = [];
    
    if (node.description?.includes('冲突')) {
      cards.push('冲突爆发');
    }
    if (node.description?.includes('成长') || node.description?.includes('升级')) {
      cards.push('成长突破');
    }
    if (node.description?.includes('感情') || node.description?.includes('爱')) {
      cards.push('感情升温');
    }
    if (node.description?.includes('揭秘') || node.description?.includes('揭示')) {
      cards.push('身份揭秘');
    }

    return cards;
  }

  /**
   * 推断情感基调
   */
  private inferEmotionalTone(node: PlotNode): string {
    if (node.isClimax || node.chapterType === 'climax') {
      return '紧张、高潮';
    }
    if (node.chapterType === 'transitional') {
      return '平缓、过渡';
    }
    if (node.chapterType === 'ending') {
      return '温馨、收束';
    }
    return '正常叙事';
  }

  /**
   * 推断分段基调
   */
  private inferSegmentTone(index: number, total: number): string {
    const progress = index / total;
    
    if (progress < 0.2) return '铺垫、期待';
    if (progress < 0.5) return '发展、成长';
    if (progress < 0.8) return '冲突、高潮';
    return '收束、结局';
  }

  /**
   * 提取卷冲突
   */
  private extractVolumeConflict(nodes: PlotNode[]): string {
    const climaxNode = nodes.find(n => n.isClimax);
    return climaxNode?.description || '核心冲突';
  }

  /**
   * 提取卷角色
   */
  private extractVolumeCharacters(nodes: PlotNode[]): string[] {
    return nodes
      .flatMap(n => n.relatedCharacters || [])
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 5);
  }

  /**
   * 数字转中文
   */
  private toChineseNumber(num: number): string {
    const chinese = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    if (num <= 10) return chinese[num];
    if (num < 20) return '十' + chinese[num - 10];
    return num.toString();
  }

  /**
   * 获取当前卷
   */
  getCurrentVolume(chapterIndex: number): Level2Storyline | undefined {
    return this.fiveLevelStoryline.level2.find(
      v => chapterIndex >= v.chapterRange[0] && chapterIndex <= v.chapterRange[1]
    );
  }

  /**
   * 获取当前桥段
   */
  getCurrentSegment(chapterIndex: number): Level3Storyline | undefined {
    return this.fiveLevelStoryline.level3.find(
      s => chapterIndex >= s.chapterRange[0] && chapterIndex <= s.chapterRange[1]
    );
  }

  /**
   * 获取五级主线
   */
  getFiveLevelStoryline(): FiveLevelStoryline {
    return this.fiveLevelStoryline;
  }

  /**
   * 生成章节节点标记
   */
  generateChapterNodes(): ChapterNode[] {
    const nodes: ChapterNode[] = [];

    // 添加卷节点
    for (const volume of this.fiveLevelStoryline.level2) {
      nodes.push({
        id: volume.id,
        title: volume.name,
        nodeType: 'development',
        chapterRange: volume.chapterRange,
        importance: 'major',
        description: volume.coreConflict,
      });

      // 添加高潮节点
      if (volume.climaxChapterIndex !== undefined) {
        nodes.push({
          id: `${volume.id}-climax`,
          title: `${volume.name}高潮`,
          nodeType: 'climax',
          estimatedChapterIndex: volume.climaxChapterIndex,
          importance: 'critical',
        });
      }
    }

    // 添加桥段节点
    for (const segment of this.fiveLevelStoryline.level3) {
      nodes.push({
        id: segment.id,
        title: segment.name,
        nodeType: 'development',
        chapterRange: segment.chapterRange,
        importance: 'minor',
        description: segment.foreshadow,
      });
    }

    return nodes;
  }

  /**
   * 生成故事线进度报告
   */
  generateProgressReport(currentChapterIndex: number): StorylineProgressReport {
    const progress: StorylineProgress[] = [];

    // 地图线
    progress.push({
      type: 'map',
      current: this.getCurrentMap(currentChapterIndex),
      completion: this.calculateMapCompletion(currentChapterIndex),
      relatedChapters: this.getRelatedChapters('map'),
    });

    // 阵营线
    progress.push({
      type: 'faction',
      current: this.getCurrentFaction(currentChapterIndex),
      completion: this.calculateFactionCompletion(currentChapterIndex),
      relatedChapters: this.getRelatedChapters('faction'),
    });

    // 金手指线
    progress.push({
      type: 'goldenfinger',
      current: this.getCurrentGoldenFinger(currentChapterIndex),
      completion: this.calculateGoldenFingerCompletion(currentChapterIndex),
      relatedChapters: this.getRelatedChapters('goldenfinger'),
    });

    // 感情线
    progress.push({
      type: 'romance',
      current: this.getCurrentRomance(currentChapterIndex),
      completion: this.calculateRomanceCompletion(currentChapterIndex),
      relatedChapters: this.getRelatedChapters('romance'),
    });

    // 计算主线和支线完成度
    const mainLineCompletion = Math.round(
      progress
        .filter(p => ['map', 'faction', 'goldenfinger'].includes(p.type))
        .reduce((sum, p) => sum + p.completion, 0) / 3
    );

    const subplotCompletion = Math.round(
      progress
        .filter(p => ['romance'].includes(p.type))
        .reduce((sum, p) => sum + p.completion, 0)
    );

    return {
      progress,
      mainLineCompletion,
      subplotCompletion,
      overallCompletion: Math.round((mainLineCompletion * 0.6 + subplotCompletion * 0.4)),
      suggestions: this.generateProgressSuggestions(progress, currentChapterIndex),
    };
  }

  /**
   * 获取当前地图
   */
  private getCurrentMap(chapterIndex: number): string {
    const storyLines = this.project.metadata?.storyLines;
    if (storyLines?.map) {
      return storyLines.map;
    }
    return '当前地图';
  }

  /**
   * 计算地图完成度
   */
  private calculateMapCompletion(chapterIndex: number): number {
    const total = this.project.metadata?.plannedChapterCount || 100;
    return Math.round((chapterIndex / total) * 100);
  }

  /**
   * 获取当前阵营
   */
  private getCurrentFaction(chapterIndex: number): string {
    const storyLines = this.project.metadata?.storyLines;
    if (storyLines?.faction) {
      return storyLines.faction;
    }
    return '当前阵营';
  }

  /**
   * 计算阵营完成度
   */
  private calculateFactionCompletion(chapterIndex: number): number {
    // 根据高潮节点判断
    const climaxChapters = this.fiveLevelStoryline.level2
      .filter(v => v.climaxChapterIndex !== undefined)
      .map(v => v.climaxChapterIndex!);
    
    const pastClimaxes = climaxChapters.filter(c => c <= chapterIndex).length;
    return Math.round((pastClimaxes / Math.max(climaxChapters.length, 1)) * 100);
  }

  /**
   * 获取当前金手指状态
   */
  private getCurrentGoldenFinger(chapterIndex: number): string {
    const storyLines = this.project.metadata?.storyLines;
    if (storyLines?.goldenfinger) {
      return storyLines.goldenfinger;
    }
    return '金手指状态';
  }

  /**
   * 计算金手指完成度
   */
  private calculateGoldenFingerCompletion(chapterIndex: number): number {
    // 根据章节进度估算
    const total = this.project.metadata?.plannedChapterCount || 100;
    return Math.round((chapterIndex / total) * 100);
  }

  /**
   * 获取当前感情状态
   */
  private getCurrentRomance(chapterIndex: number): string {
    const storyLines = this.project.metadata?.storyLines;
    if (storyLines?.romance) {
      return storyLines.romance;
    }
    return '感情线';
  }

  /**
   * 计算感情线完成度
   */
  private calculateRomanceCompletion(chapterIndex: number): number {
    const total = this.project.metadata?.plannedChapterCount || 100;
    const progress = chapterIndex / total;
    
    // 感情线通常在60%-90%达到高潮
    if (progress < 0.3) return Math.round(progress * 100);
    if (progress < 0.7) return 30 + Math.round((progress - 0.3) * 175);
    return Math.min(95, Math.round(progress * 100));
  }

  /**
   * 获取相关章节
   */
  private getRelatedChapters(type: string): number[] {
    // 根据类型返回相关章节
    const volume = this.getCurrentVolume(this.chapters.length);
    if (!volume) return [];
    return volume.chapterRange;
  }

  /**
   * 生成进度建议
   */
  private generateProgressSuggestions(
    progress: StorylineProgress[],
    chapterIndex: number
  ): string[] {
    const suggestions: string[] = [];

    // 检查落后线
    const laggingLines = progress.filter(p => p.completion < 30);
    if (laggingLines.length > 0) {
      suggestions.push(`⚠️ ${laggingLines[0].type}线进度较慢，建议加强`);
    }

    // 检查即将完成线
    const completingLines = progress.filter(p => p.completion >= 80);
    if (completingLines.length > 0) {
      suggestions.push(`✅ ${completingLines[0].type}线即将完成`);
    }

    return suggestions;
  }

  /**
   * 生成完结感知
   */
  generateEndingPerception(currentChapterIndex: number): EndingReadiness {
    const engine = createEndingPerceptionEngine(
      this.project,
      currentChapterIndex,
      this.project.chapterMemories || [],
      this.foreshadows,
      this.plotOutline
    );
    return engine.analyzeEndingReadiness();
  }

  /**
   * 生成项目完结元数据
   */
  generateProjectEndingMeta(): ProjectEndingMeta {
    const engine = createEndingPerceptionEngine(
      this.project,
      this.chapters.length,
      this.project.chapterMemories || [],
      this.foreshadows,
      this.plotOutline
    );
    return engine.generateProjectEndingMeta();
  }

  /**
   * 获取章节类型建议
   */
  getChapterTypeSuggestion(chapterIndex: number): string {
    const segment = this.getCurrentSegment(chapterIndex);
    if (segment) {
      return segment.emotionalTone;
    }

    const volume = this.getCurrentVolume(chapterIndex);
    if (volume?.climaxChapterIndex === chapterIndex) {
      return '高潮章节 - 需要高强度冲突和情绪爆发';
    }

    return '正常章节 - 推进剧情';
  }

  /**
   * 更新项目元数据
   */
  updateProjectMetadata(meta: Partial<ProjectEndingMeta>): void {
    this.project.metadata = {
      ...this.project.metadata,
      plannedChapterCount: meta.plannedChapterCount,
      plannedWordCount: meta.plannedWordCount,
      climaxChapterIndex: meta.climaxChapterIndex,
      endingChapterIndex: meta.endingChapterIndex,
    };
  }
}

/**
 * 创建故事线管理器
 */
export function createStorylineManager(project: Project): StorylineManager {
  return new StorylineManager(project);
}

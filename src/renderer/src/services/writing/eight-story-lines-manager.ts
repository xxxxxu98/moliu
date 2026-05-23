/**
 * 八条故事线管理系统
 * 参考 oh-story-claudecode 和 webnovel-writer 的故事线设计
 * 
 * 八条故事线：
 * 1. 地图线 - 世界观拓展、地图探索
 * 2. 阵营线 - 势力消长、派系纷争
 * 3. 人物线 - 角色登场、关系变化
 * 4. 金手指线 - 主角优势来源
 * 5. 世界观线 - 规则揭示、能力体系
 * 6. 矛盾线 - 核心冲突演进
 * 7. 收集线 - 物品、功法、资源收集
 * 8. 感情线 - 爱情、亲情、友情
 */

import type {
  Project,
  StoryLines,
  MapLine,
  FactionLine,
  CharacterLine,
  GoldenFingerLine,
  WorldRulesLine,
  StoryConflictLine,
  CollectionLine,
  RomanceLine,
  RomanceStageType,
  Foreshadow,
  ChapterMemory,
} from '@/types/project';
import type {
  StorylineProgress,
  StorylineProgressReport,
  StorylineType,
} from '@/types/ending-perception';

/**
 * 故事线管理器
 */
export class EightStoryLinesManager {
  private project: Project;
  private storyLines: StoryLines;

  constructor(project: Project) {
    this.project = project;
    this.storyLines = this.initializeStoryLines();
  }

  /**
   * 初始化八条故事线
   */
  private initializeStoryLines(): StoryLines {
    const existing = this.project.metadata?.storyLines;
    return {
      id: existing?.id || `storylines-${Date.now()}`,
      map: this.initializeMapLine(existing?.map),
      faction: this.initializeFactionLine(existing?.faction),
      character: this.initializeCharacterLine(existing?.character),
      goldenfinger: this.initializeGoldenFingerLine(existing?.goldenfinger),
      worldRules: this.initializeWorldRulesLine(existing?.worldRules),
      conflict: this.initializeConflictLine(existing?.conflict),
      collection: this.initializeCollectionLine(existing?.collection),
      romance: this.initializeRomanceLine(existing?.romance),
    };
  }

  /**
   * 初始化地图线
   */
  private initializeMapLine(existing?: any): MapLine {
    return {
      planned: existing?.planned || [],
      introduced: existing?.introduced || [],
      current: existing?.current || '故事起点',
      chaptersPerLocation: existing?.chaptersPerLocation || 10,
    };
  }

  /**
   * 初始化阵营线
   */
  private initializeFactionLine(existing?: any): FactionLine {
    return {
      planned: existing?.planned || [],
      introduced: existing?.introduced || [],
      currentLevel: existing?.currentLevel || 1,
      escalationChapters: existing?.escalationChapters || [],
    };
  }

  /**
   * 初始化人物线
   */
  private initializeCharacterLine(existing?: any): CharacterLine {
    return {
      planned: existing?.planned || [],
      introduced: existing?.introduced || [],
      keyRelationships: existing?.keyRelationships || [],
    };
  }

  /**
   * 初始化金手指线
   */
  private initializeGoldenFingerLine(existing?: any): GoldenFingerLine {
    return {
      type: existing?.type || 'unknown',
      currentStage: existing?.currentStage || 1,
      upgrades: existing?.upgrades || [],
      nextUpgrade: existing?.nextUpgrade,
    };
  }

  /**
   * 初始化世界观线
   */
  private initializeWorldRulesLine(existing?: any): WorldRulesLine {
    return {
      revealed: existing?.revealed || [],
      pending: existing?.pending || [],
      nextReveal: existing?.nextReveal,
    };
  }

  /**
   * 初始化矛盾线
   */
  private initializeConflictLine(existing?: any): StoryConflictLine {
    return {
      chains: existing?.chains || [],
      activeConflict: existing?.activeConflict,
    };
  }

  /**
   * 初始化收集线
   */
  private initializeCollectionLine(existing?: any): CollectionLine {
    return {
      target: existing?.target || [],
      progress: existing?.progress || [],
    };
  }

  /**
   * 初始化感情线
   */
  private initializeRomanceLine(existing?: any): RomanceLine {
    return {
      currentStage: existing?.currentStage || 'cold',
      progression: existing?.progression || [],
    };
  }

  // ========== 地图线操作 ==========

  /**
   * 添加规划地点
   */
  addPlannedLocation(location: string): void {
    if (!this.storyLines.map.planned.includes(location)) {
      this.storyLines.map.planned.push(location);
    }
  }

  /**
   * 引入地点
   */
  introduceLocation(location: string, chapter: number): void {
    if (!this.storyLines.map.introduced.includes(location)) {
      this.storyLines.map.introduced.push(location);
      this.storyLines.map.current = location;
    }
  }

  /**
   * 获取当前地图进度
   */
  getMapProgress(): StorylineProgress {
    const total = this.storyLines.map.planned.length;
    const introduced = this.storyLines.map.introduced.length;
    return {
      type: 'map',
      current: this.storyLines.map.current,
      completion: total > 0 ? Math.round((introduced / total) * 100) : 0,
      relatedChapters: this.calculateMapChapters(),
    };
  }

  private calculateMapChapters(): number[] {
    // 简单估算：每个引入的地点约10章
    return this.storyLines.map.introduced.map((_, idx) => 
      (idx + 1) * this.storyLines.map.chaptersPerLocation
    );
  }

  // ========== 阵营线操作 ==========

  /**
   * 添加规划势力
   */
  addPlannedFaction(faction: string): void {
    if (!this.storyLines.faction.planned.includes(faction)) {
      this.storyLines.faction.planned.push(faction);
    }
  }

  /**
   * 引入势力
   */
  introduceFaction(faction: string, chapter: number): void {
    if (!this.storyLines.faction.introduced.includes(faction)) {
      this.storyLines.faction.introduced.push(faction);
    }
  }

  /**
   * 势力升级
   */
  escalateFaction(chapter: number): void {
    if (!this.storyLines.faction.escalationChapters.includes(chapter)) {
      this.storyLines.faction.escalationChapters.push(chapter);
      this.storyLines.faction.currentLevel++;
    }
  }

  /**
   * 获取阵营线进度
   */
  getFactionProgress(): StorylineProgress {
    const total = this.storyLines.faction.planned.length;
    const introduced = this.storyLines.faction.introduced.length;
    return {
      type: 'faction',
      current: `等级 ${this.storyLines.faction.currentLevel}`,
      next: this.storyLines.faction.planned[this.storyLines.faction.currentLevel],
      completion: total > 0 ? Math.round((introduced / total) * 100) : 0,
      relatedChapters: this.storyLines.faction.escalationChapters,
    };
  }

  // ========== 人物线操作 ==========

  /**
   * 添加规划角色
   */
  addPlannedCharacter(id: string, role: string): void {
    if (!this.storyLines.character.planned.find(p => p.id === id)) {
      this.storyLines.character.planned.push({ id, role });
    }
  }

  /**
   * 引入角色
   */
  introduceCharacter(name: string): void {
    if (!this.storyLines.character.introduced.includes(name)) {
      this.storyLines.character.introduced.push(name);
    }
  }

  /**
   * 添加关键关系
   */
  addKeyRelationship(from: string, to: string, type: string): void {
    this.storyLines.character.keyRelationships.push({ from, to, type });
  }

  /**
   * 获取人物线进度
   */
  getCharacterProgress(): StorylineProgress {
    const total = this.storyLines.character.planned.length;
    const introduced = this.storyLines.character.introduced.length;
    return {
      type: 'character',
      current: `${introduced}个角色已登场`,
      completion: total > 0 ? Math.round((introduced / total) * 100) : 0,
      relatedChapters: [],
    };
  }

  // ========== 金手指线操作 ==========

  /**
   * 设置金手指类型
   */
  setGoldenFingerType(type: string): void {
    this.storyLines.goldenfinger.type = type;
  }

  /**
   * 添加金手指升级
   */
  addGoldenFingerUpgrade(chapter: number, description: string): void {
    // 移除之前的 nextUpgrade
    if (this.storyLines.goldenfinger.nextUpgrade) {
      this.storyLines.goldenfinger.upgrades.push({
        chapter: this.storyLines.goldenfinger.nextUpgrade.chapter,
        description: this.storyLines.goldenfinger.nextUpgrade.description,
      });
    }
    
    this.storyLines.goldenfinger.currentStage++;
    this.storyLines.goldenfinger.nextUpgrade = { chapter, description };
  }

  /**
   * 获取金手指线进度
   */
  getGoldenFingerProgress(): StorylineProgress {
    const totalUpgrades = this.storyLines.goldenfinger.upgrades.length + 
      (this.storyLines.goldenfinger.nextUpgrade ? 1 : 0);
    return {
      type: 'goldenfinger',
      current: `第${this.storyLines.goldenfinger.currentStage}阶段：${this.storyLines.goldenfinger.type}`,
      next: this.storyLines.goldenfinger.nextUpgrade?.description,
      completion: Math.min(100, totalUpgrades * 20), // 假设共5个阶段
      relatedChapters: [
        ...this.storyLines.goldenfinger.upgrades.map(u => u.chapter),
        this.storyLines.goldenfinger.nextUpgrade?.chapter,
      ].filter(Boolean) as number[],
    };
  }

  // ========== 世界观线操作 ==========

  /**
   * 添加待揭示规则
   */
  addPendingRule(rule: string): void {
    if (!this.storyLines.worldRules.pending.includes(rule)) {
      this.storyLines.worldRules.pending.push(rule);
    }
  }

  /**
   * 揭示规则
   */
  revealRule(rule: string, chapter: number): void {
    const idx = this.storyLines.worldRules.pending.indexOf(rule);
    if (idx !== -1) {
      this.storyLines.worldRules.pending.splice(idx, 1);
      this.storyLines.worldRules.revealed.push(rule);
      this.storyLines.worldRules.nextReveal = { chapter, rule };
    }
  }

  /**
   * 获取世界观线进度
   */
  getWorldRulesProgress(): StorylineProgress {
    const total = this.storyLines.worldRules.revealed.length + 
      this.storyLines.worldRules.pending.length;
    const revealed = this.storyLines.worldRules.revealed.length;
    return {
      type: 'worldRules',
      current: `${revealed}条规则已揭示`,
      next: this.storyLines.worldRules.nextReveal?.rule,
      completion: total > 0 ? Math.round((revealed / total) * 100) : 100,
      relatedChapters: this.storyLines.worldRules.revealed.map((_, idx) => (idx + 1) * 10),
    };
  }

  // ========== 矛盾线操作 ==========

  /**
   * 添加冲突链
   */
  addConflictChain(level: number, name: string, description: string): void {
    this.storyLines.conflict.chains.push({
      level,
      name,
      description,
      chapters: [],
      status: 'pending',
    });
  }

  /**
   * 激活冲突
   */
  activateConflict(conflictName: string, chapter: number): void {
    const conflict = this.storyLines.conflict.chains.find(c => c.name === conflictName);
    if (conflict) {
      conflict.status = 'active';
      this.storyLines.conflict.activeConflict = conflictName;
      if (!conflict.chapters.includes(chapter)) {
        conflict.chapters.push(chapter);
      }
    }
  }

  /**
   * 解决冲突
   */
  resolveConflict(conflictName: string): void {
    const conflict = this.storyLines.conflict.chains.find(c => c.name === conflictName);
    if (conflict) {
      conflict.status = 'resolved';
      if (this.storyLines.conflict.activeConflict === conflictName) {
        this.storyLines.conflict.activeConflict = undefined;
      }
    }
  }

  /**
   * 获取矛盾线进度
   */
  getConflictProgress(): StorylineProgress {
    const total = this.storyLines.conflict.chains.length;
    const resolved = this.storyLines.conflict.chains.filter(c => c.status === 'resolved').length;
    return {
      type: 'conflict',
      current: this.storyLines.conflict.activeConflict || '无活跃冲突',
      completion: total > 0 ? Math.round((resolved / total) * 100) : 0,
      relatedChapters: this.storyLines.conflict.chains.flatMap(c => c.chapters),
    };
  }

  // ========== 收集线操作 ==========

  /**
   * 添加收集目标
   */
  addCollectionTarget(item: string): void {
    if (!this.storyLines.collection.target.includes(item)) {
      this.storyLines.collection.target.push(item);
      this.storyLines.collection.progress.push({ item, acquired: false });
    }
  }

  /**
   * 获得物品
   */
  acquireItem(item: string, chapter: number): void {
    const progress = this.storyLines.collection.progress.find(p => p.item === item);
    if (progress && !progress.acquired) {
      progress.acquired = true;
      progress.chapter = chapter;
    }
  }

  /**
   * 获取收集线进度
   */
  getCollectionProgress(): StorylineProgress {
    const total = this.storyLines.collection.target.length;
    const acquired = this.storyLines.collection.progress.filter(p => p.acquired).length;
    return {
      type: 'collection',
      current: `${acquired}/${total}件物品`,
      completion: total > 0 ? Math.round((acquired / total) * 100) : 100,
      relatedChapters: this.storyLines.collection.progress
        .filter(p => p.acquired && p.chapter)
        .map(p => p.chapter!),
    };
  }

  // ========== 感情线操作 ==========

  /**
   * 推进感情阶段
   */
  progressRomance(chapter: number, stage: RomanceStageType, description: string): void {
    this.storyLines.romance.currentStage = stage;
    this.storyLines.romance.progression.push({ chapter, stage, description });
  }

  /**
   * 获取感情线进度
   */
  getRomanceProgress(): StorylineProgress {
    const stages: RomanceStageType[] = ['cold', 'warm', 'hot', 'climax'];
    const currentIndex = stages.indexOf(this.storyLines.romance.currentStage);
    return {
      type: 'romance',
      current: this.getRomanceStageName(this.storyLines.romance.currentStage),
      next: stages[currentIndex + 1] ? this.getRomanceStageName(stages[currentIndex + 1]) : undefined,
      completion: Math.round(((currentIndex + 1) / stages.length) * 100),
      relatedChapters: this.storyLines.romance.progression.map(p => p.chapter),
    };
  }

  private getRomanceStageName(stage: RomanceStageType): string {
    const names: Record<RomanceStageType, string> = {
      cold: '冷淡期',
      warm: '暧昧期',
      hot: '热恋期',
      climax: '高潮期',
    };
    return names[stage];
  }

  // ========== 综合操作 ==========

  /**
   * 获取所有故事线
   */
  getAllStoryLines(): StoryLines {
    return { ...this.storyLines };
  }

  /**
   * 生成故事线进度报告
   */
  generateProgressReport(): StorylineProgressReport {
    const progress: StorylineProgress[] = [
      this.getMapProgress(),
      this.getFactionProgress(),
      this.getCharacterProgress(),
      this.getGoldenFingerProgress(),
      this.getWorldRulesProgress(),
      this.getConflictProgress(),
      this.getCollectionProgress(),
      this.getRomanceProgress(),
    ];

    const mainLineTypes: StorylineType[] = ['map', 'faction', 'goldenfinger', 'worldRules', 'conflict'];
    const subplotTypes: StorylineType[] = ['character', 'collection', 'romance'];

    const mainLineProgress = progress.filter(p => mainLineTypes.includes(p.type));
    const subplotProgress = progress.filter(p => subplotTypes.includes(p.type));

    const mainLineCompletion = mainLineProgress.length > 0
      ? Math.round(mainLineProgress.reduce((sum, p) => sum + p.completion, 0) / mainLineProgress.length)
      : 0;
    const subplotCompletion = subplotProgress.length > 0
      ? Math.round(subplotProgress.reduce((sum, p) => sum + p.completion, 0) / subplotProgress.length)
      : 0;

    return {
      progress,
      mainLineCompletion,
      subplotCompletion,
      overallCompletion: Math.round(mainLineCompletion * 0.6 + subplotCompletion * 0.4),
      suggestions: this.generateSuggestions(progress),
    };
  }

  /**
   * 生成建议
   */
  private generateSuggestions(progress: StorylineProgress[]): string[] {
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
   * 从章节记忆更新故事线
   */
  updateFromChapterMemory(memory: ChapterMemory): void {
    // 更新引入的地点
    for (const location of memory.locations) {
      this.introduceLocation(location, memory.chapterIndex);
    }

    // 更新揭示的伏笔（世界观相关）
    for (const foreshadow of memory.revealedForeshadows) {
      // 简单处理：如果有pending规则，可能需要揭示
    }
  }

  /**
   * 从伏笔更新故事线
   */
  updateFromForeshadows(foreshadows: Foreshadow[]): void {
    // 根据伏笔类型更新对应故事线
    for (const fs of foreshadows) {
      if (fs.status === 'resolved') {
        // 已揭示的伏笔可能影响矛盾线或收集线
        this.resolveConflict(fs.hint);
      }
    }
  }

  /**
   * 导出为项目元数据格式
   */
  exportToMetadata(): Record<string, any> {
    return {
      storyLines: {
        map: this.storyLines.map.current,
        faction: this.storyLines.faction.currentLevel.toString(),
        character: `${this.storyLines.character.introduced.length}人`,
        goldenfinger: this.storyLines.goldenfinger.type,
        worldRules: `${this.storyLines.worldRules.revealed.length}规则`,
        conflict: this.storyLines.conflict.activeConflict || '无',
        collection: `${this.storyLines.collection.progress.filter(p => p.acquired).length}件`,
        romance: this.getRomanceStageName(this.storyLines.romance.currentStage),
      },
    };
  }
}

/**
 * 创建八条故事线管理器
 */
export function createEightStoryLinesManager(project: Project): EightStoryLinesManager {
  return new EightStoryLinesManager(project);
}

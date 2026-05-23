/**
 * 写作任务书构建器
 * 参考 webnovel-writer 的 Context Agent 设计
 * 
 * 核心职责：
 * 1. 按需读取上下文（章纲、合同、记忆等）
 * 2. 组装五段式写作任务书
 * 3. 提供写作铁律提醒
 */

import type { Project, Chapter, Character, Foreshadow, WorldSchema, ChapterMemory } from '@/types/project';
import type { WritingTaskBook, CharacterConstraint, StyleGuidance, ChapterStructureNodes } from '@/types/writing-task';
import type { WritingStyle } from '@/types/writing';
import { ContextManager } from './context-manager';
import { getMemoryManager } from './memory-manager';
import { createEndingPerceptionEngine, generateWritingStrategyAdjustment } from './ending-perception-engine';
import type { EndingPhase, EndingReadiness, UnresolvedForeshadow } from '@/types/ending-perception';

// 写作铁律常量
const WRITING_IRON_LAWS = {
  THREE_LAWS: [
    '大纲即法律 - 遵循大纲，不擅自发挥',
    '设定即物理 - 遵守设定，不自相矛盾',
    '发明需识别 - 新实体必须入库管理'
  ],
  HARD_CONSTRAINTS: [
    '每章必须有推进（目标/代价/关系变化至少一项）',
    '上章有钩子本章必须回应',
    '禁止占位正文'
  ],
  ANTI_AI_REMINDERS: [
    '删段末感悟句，留余味——倾向写闭环',
    '删万能副词（缓缓/淡淡/微微），换具体动作',
    '情绪用生理反应+微动作，禁止"他感到X"',
    '对话带潜台词和意图冲突，有抢话、沉默、答非所问',
    '制造节奏疏密对比，有的段落只一句话',
    '章末禁止安全着陆，留未解决的问题',
    '展示后不解释'
  ]
};

export interface TaskBookBuildOptions {
  /** 项目数据 */
  project: Project;
  /** 章节索引 */
  chapterIndex: number;
  /** 章节大纲（可选，如果已有的话）*/
  chapterOutline?: string;
  /** 写作风格 */
  writingStyle: WritingStyle;
  /** 目标字数 */
  targetWordCount: number;
  /** 最近章节数 */
  recentChapterCount?: number;
  /** 是否启用追读力数据 */
  includeReaderSignals?: boolean;
  /** 是否包含完结感知调整 */
  includeEndingPerception?: boolean;
}

/**
 * 写作任务书构建器
 */
export class WritingTaskBuilder {
  private contextManager: ContextManager;
  private project: Project;
  private chapterIndex: number;
  private chapterOutline?: string;
  private writingStyle: WritingStyle;
  private targetWordCount: number;
  private endingPerception?: EndingReadiness;
  private includeEndingPerception: boolean = true;

  constructor(options: TaskBookBuildOptions) {
    this.contextManager = new ContextManager();
    this.project = options.project;
    this.chapterIndex = options.chapterIndex;
    this.chapterOutline = options.chapterOutline;
    this.writingStyle = options.writingStyle;
    this.targetWordCount = options.targetWordCount;
    this.includeEndingPerception = options.includeEndingPerception ?? true;
  }

  /**
   * 构建写作任务书
   * 
   * 执行流程：
   * A: 基础包（load-context + Read 章纲）
   * B: 按需深查（配角细节/特定规则/时间跨度）
   * C: 补充（追读力/伏笔）
   * D: 组装五段任务书
   * E: 完结感知调整（可选）
   */
  async buildTaskBook(): Promise<WritingTaskBook> {
    // 1. 加载基础包
    const baseContext = await this.loadBaseContext();

    // 2. 按需深查
    const deepContext = await this.loadDeepContext(baseContext);

    // 3. 补充数据
    const supplementData = await this.loadSupplementData(deepContext);

    // 4. 组装任务书
    let taskBook = this.assembleTaskBook(baseContext, deepContext, supplementData);

    // 5. 验证任务书
    this.validateTaskBook(taskBook);

    // 6. 完结感知调整（可选）
    if (this.includeEndingPerception) {
      taskBook = await this.adjustTaskBookForEndingPhase(taskBook);
    }

    return taskBook;
  }

  /**
   * 根据完结阶段调整任务书
   * 
   * 这是完结感知系统的核心集成点：
   * - 分析当前故事的完结准备度
   * - 根据阶段调整节奏、冲突密度、伏笔处理等
   * - 确保临近完结时，AI 的写作策略会发生相应变化
   */
  private async adjustTaskBookForEndingPhase(taskBook: WritingTaskBook): Promise<WritingTaskBook> {
    // 创建完结感知引擎
    const engine = createEndingPerceptionEngine(
      this.project,
      this.chapterIndex,
      this.project.chapterMemories || [],
      this.project.foreshadows || [],
      this.project.plotOutline || []
    );

    // 分析完结准备度
    const endingReadiness = engine.analyzeEndingReadiness();
    this.endingPerception = endingReadiness;

    // 生成写作策略调整
    const strategy = generateWritingStrategyAdjustment(
      endingReadiness.isInEndingPhase,
      endingReadiness.climaxApproaching
    );

    // 更新章节类型
    if (endingReadiness.climaxApproaching) {
      taskBook.chapterType = 'climax';
    } else if (endingReadiness.isInEndingPhase === 'ending' || endingReadiness.isInEndingPhase === 'conclusion') {
      taskBook.chapterType = 'resolution';
    }

    // 更新节奏策略
    taskBook.styleGuidance.pacingStrategy = strategy.pacingStrategy;

    // 添加完结感知约束
    const endingConstraints = this.generateEndingConstraints(endingReadiness, strategy);
    taskBook.crossChapterConstraints = [
      ...(taskBook.crossChapterConstraints || []),
      ...endingConstraints
    ];

    // 添加伏笔处理指引
    if (endingReadiness.unresolvedForeshadows.length > 0) {
      taskBook.ragClues = [
        ...(taskBook.ragClues || []),
        ...this.generateForeshadowGuidance(endingReadiness.unresolvedForeshadows)
      ];
    }

    // 添加未完感指引
    taskBook.openQuestion = this.generateOpenQuestionGuidance(endingReadiness);

    return taskBook;
  }

  /**
   * 生成完结约束
   */
  private generateEndingConstraints(
    endingReadiness: EndingReadiness,
    strategy: any
  ): string[] {
    const constraints: string[] = [];

    // 添加阶段指引
    constraints.push(`📊 当前完结进度：${endingReadiness.overallProgress}%`);
    
    if (endingReadiness.isInEndingPhase !== 'normal') {
      constraints.push(`📍 当前阶段：${endingReadiness.phaseName}`);
    }

    // 添加剩余章节提示
    if (endingReadiness.remainingChapters <= 10) {
      constraints.push(`⚠️ 剩余章节较少（${endingReadiness.remainingChapters}章），注意加快节奏`);
    }

    // 添加伏笔提示
    if (endingReadiness.unresolvedForeshadows.length > 0) {
      const critical = endingReadiness.unresolvedForeshadows.filter(f => f.urgency === 'critical');
      if (critical.length > 0) {
        constraints.push(`🚨 有${critical.length}个紧急伏笔需处理`);
      }
    }

    // 添加高潮提示
    if (endingReadiness.climaxApproaching) {
      constraints.push('🎯 高潮即将到来，增加冲突密度');
    }

    // 冲突密度指引
    if (strategy.conflictDensity === 'high') {
      constraints.push('💥 高冲突密度：增加对抗、矛盾、压力');
    } else if (strategy.conflictDensity === 'low') {
      constraints.push('📖 低冲突密度：注重情感收束和情节完结');
    }

    return constraints;
  }

  /**
   * 生成伏笔处理指引
   */
  private generateForeshadowGuidance(unresolved: UnresolvedForeshadow[]): string[] {
    const guidance: string[] = [];

    // 紧急伏笔
    const critical = unresolved.filter(f => f.urgency === 'critical');
    if (critical.length > 0) {
      guidance.push(`🚨 紧急伏笔：${critical[0].hint.slice(0, 30)}...（必须在本章揭示）`);
    }

    // 高优先伏笔
    const high = unresolved.filter(f => f.urgency === 'high');
    if (high.length > 0) {
      guidance.push(`📌 高优先伏笔：${high[0].hint.slice(0, 30)}...（建议本章揭示）`);
    }

    return guidance;
  }

  /**
   * 生成开放性问题指引
   */
  private generateOpenQuestionGuidance(endingReadiness: EndingReadiness): string {
    // 如果接近完结，调整开放性问题的写法
    if (endingReadiness.isInEndingPhase === 'conclusion') {
      return '完结章的悬念应与全书核心问题呼应，为读者留下回味空间';
    }

    if (endingReadiness.isInEndingPhase === 'ending') {
      return '结局阶段的悬念应服务于主线收束，为最终结局做铺垫';
    }

    // 正常情况
    return endingReadiness.unresolvedForeshadows.length > 0
      ? `伏笔"${endingReadiness.unresolvedForeshadows[0].hint.slice(0, 20)}..."将被如何揭示？`
      : '留下悬念，引发读者期待下一章';
  }

  /**
   * 获取当前完结感知
   */
  getCurrentEndingPerception(): EndingReadiness | undefined {
    return this.endingPerception;
  }

  /**
   * 判断章节节点类型
   * 
   * 根据完结感知确定当前章节的重要性和类型
   */
  determineChapterNodeType(): 'opening' | 'development' | 'climax' | 'resolution' | 'ending' {
    if (!this.endingPerception) {
      // 未进行完结感知，使用默认逻辑
      const plannedCount = this.project.metadata?.plannedChapterCount || 100;
      const progress = this.chapterIndex / plannedCount;

      if (progress < 0.1) return 'opening';
      if (this.project.plotOutline.find(n => n.chapterRange && 
        this.chapterIndex >= n.chapterRange[0] && this.chapterIndex <= n.chapterRange[1] && n.isClimax)) {
        return 'climax';
      }
      if (progress >= 0.9) return 'ending';
      return 'development';
    }

    // 使用完结感知结果
    const { isInEndingPhase, climaxApproaching } = this.endingPerception;

    if (isInEndingPhase === 'conclusion') return 'ending';
    if (isInEndingPhase === 'ending') return 'resolution';
    if (isInEndingPhase === 'pre_ending' || climaxApproaching) return 'climax';
    return 'development';
  }

  /**
   * 加载基础上下文
   */
  private async loadBaseContext(): Promise<BaseContext> {
    const chapters = this.project.chapters.sort((a, b) => a.orderIndex - b.orderIndex);
    const currentChapter = chapters[this.chapterIndex];
    const prevChapter = this.chapterIndex > 0 ? chapters[this.chapterIndex - 1] : null;
    const nextChapter = this.chapterIndex < chapters.length - 1 ? chapters[this.chapterIndex + 1] : null;

    // 获取前几章摘要
    const recentMemories = await this.getRecentMemories();

    // 提取前情摘要
    let previousSummary = '';
    let previousChapterEnding = '';
    if (prevChapter?.content) {
      previousSummary = this.contextManager.extractPreviousChapterSummary(prevChapter.content, 300);
      previousChapterEnding = this.contextManager.extractChapterEnding(prevChapter.content);
    }

    // 获取活跃伏笔
    const activeForeshadows = this.project.foreshadows.filter(
      f => f.status !== 'resolved'
    ).slice(0, 10);

    // 角色数据
    const characters = this.project.characters.slice(0, 10);

    return {
      currentChapter,
      prevChapter,
      nextChapter,
      previousSummary,
      previousChapterEnding,
      recentMemories,
      activeForeshadows,
      characters,
      worldSchema: this.project.worldSchema
    };
  }

  /**
   * 加载深度上下文
   */
  private async loadDeepContext(baseContext: BaseContext): Promise<DeepContext> {
    const deepContext: DeepContext = {
      chapterStructure: await this.extractChapterStructure(baseContext),
      characterStates: await this.extractCharacterStates(baseContext),
      activeRules: await this.extractActiveRules(baseContext),
      crossChapterConstraints: await this.extractCrossChapterConstraints(baseContext)
    };

    return deepContext;
  }

  /**
   * 加载补充数据
   */
  private async loadSupplementData(deepContext: DeepContext): Promise<SupplementData> {
    // 获取记忆中的追读力数据
    const readerSignals = await this.extractReaderSignals();
    
    // 筛选紧迫伏笔（剩余≤5章或超期的）
    const urgentForeshadows = deepContext.chapterStructure.activeForeshadows.filter(
      f => f.status === 'hinted' || f.status === 'foreshadowed'
    ).slice(0, 5);

    return {
      readerSignals,
      urgentForeshadows,
      optionalForeshadows: deepContext.chapterStructure.activeForeshadows.slice(5, 10)
    };
  }

  /**
   * 提取章节结构
   */
  private async extractChapterStructure(baseContext: BaseContext): Promise<ChapterStructure> {
    const { currentChapter, prevChapter, nextChapter, previousSummary, activeForeshadows } = baseContext;

    // 确定章节类型
    const chapterType = this.determineChapterType(currentChapter);

    // 提取章纲中的结构化节点（如果有）
    const nodes = this.extractStructureNodesFromOutline(currentChapter.plotSummary || this.chapterOutline);

    // 构建 CBN/CPNs/CEN
    const cbn = nodes?.CBN || this.inferCBN(prevChapter, previousSummary);
    const cpns = nodes?.CPNs || this.inferCPNs(nodes?.mustCover || []);
    const cen = nodes?.CEN || this.inferCEN(nextChapter);

    return {
      chapterType,
      cbn,
      cpns,
      cen,
      mustCover: nodes?.mustCover || [],
      forbiddenZones: nodes?.forbiddenZones || [],
      activeForeshadows
    };
  }

  /**
   * 提取角色状态
   */
  private async extractCharacterStates(baseContext: BaseContext): Promise<CharacterConstraint[]> {
    const { characters, recentMemories } = baseContext;

    return characters.map(char => this.buildCharacterConstraint(char, recentMemories));
  }

  /**
   * 构建角色约束
   */
  private buildCharacterConstraint(char: Character, recentMemories: ChapterMemory[]): CharacterConstraint {
    // 从记忆中查找角色最新状态
    const latestState = recentMemories
      .flatMap(m => m.characterStateChanges)
      .filter(c => c.characterName === char.name)
      .pop();

    // 从关系中推断说话倾向
    const relationships = char.profile?.relationships || [];
    const dialogueTendency = this.inferDialogueTendency(char, relationships);

    return {
      name: char.name,
      state: latestState?.state || char.profile?.background || '状态未知',
      motivation: this.inferCharacterMotivation(char),
      role: char.role || '角色',
      dialogueTendency
    };
  }

  /**
   * 提取活跃规则
   */
  private async extractActiveRules(baseContext: BaseContext): Promise<string[]> {
    const rules = baseContext.worldSchema?.rules || [];
    return rules.slice(0, 5).map(r => `${r.name}：${r.description}`);
  }

  /**
   * 提取跨章约束
   */
  private async extractCrossChapterConstraints(baseContext: BaseContext): Promise<string[]> {
    const constraints: string[] = [];

    // 检查是否有跨章伏笔需要呼应
    const { prevChapter, nextChapter, activeForeshadows } = baseContext;

    // 上章钩子约束
    if (prevChapter && prevChapter.content) {
      const ending = this.contextManager.extractChapterEnding(prevChapter.content);
      if (ending.includes('？') || ending.includes('……') || ending.includes('悬念')) {
        constraints.push(`上章结尾留有悬念："${ending.slice(-30)}"，本章需回应`);
      }
    }

    // 伏笔约束
    for (const fs of activeForeshadows.slice(0, 3)) {
      constraints.push(`伏笔[${fs.hint}]状态：${fs.status}`);
    }

    return constraints;
  }

  /**
   * 提取追读力数据
   */
  private async extractReaderSignals(): Promise<string | undefined> {
    // 从记忆系统获取追读力数据
    const memoryManager = getMemoryManager();
    if (!memoryManager.isInitialized()) {
      return undefined;
    }

    // 获取最近几章的情感基调
    const recentMemories = memoryManager.getAllMemories().slice(-5);
    if (recentMemories.length === 0) {
      return undefined;
    }

    const emotionalTones = recentMemories
      .filter(m => m.emotionalTone)
      .map(m => `第${m.chapterIndex + 1}章: ${m.emotionalTone}`)
      .join(' → ');

    return emotionalTones ? `近期情感节奏：${emotionalTones}` : undefined;
  }

  /**
   * 组装任务书
   */
  private assembleTaskBook(
    baseContext: BaseContext,
    deepContext: DeepContext,
    supplementData: SupplementData
  ): WritingTaskBook {
    const { currentChapter, previousSummary, characters } = baseContext;
    const { chapterStructure, characterStates, activeRules, crossChapterConstraints } = deepContext;
    const { readerSignals, urgentForeshadows } = supplementData;

    // 推断动机
    const motivation = this.inferMotivation(chapterStructure, previousSummary);

    // 构建风格指引
    const styleGuidance = this.buildStyleGuidance(
      chapterStructure,
      characterStates,
      supplementData
    );

    // 构建章节目标
    const chapterGoal = this.buildChapterGoal(chapterStructure);

    // 构建阻力
    const obstacles = this.buildObstacles(chapterStructure, activeRules);

    // 构建章节节点类型
    const nodeType = this.determineChapterNodeType();

    return {
      // 1. 开篇委托
      bookTitle: this.project.name,
      chapterNumber: this.chapterIndex + 1,
      chapterTitle: currentChapter?.title || `第${this.chapterIndex + 1}章`,
      oneLinerGoal: this.buildOneLinerGoal(chapterStructure),

      // 2. 这章的故事
      previousSummary,
      chapterGoal,
      obstacles,
      CBN: chapterStructure.cbn,
      CPNs: chapterStructure.cpns,
      CEN: chapterStructure.cen,
      mustCover: chapterStructure.mustCover,
      forbiddenZones: chapterStructure.forbiddenZones,
      crossChapterConstraints,
      ragClues: urgentForeshadows.map(f => f.hint),

      // 3. 这章的人物
      characters: characterStates,

      // 4. 怎么写更顺
      styleGuidance,

      // 5. 收在哪里
      endingSensation: this.buildEndingSensation(chapterStructure),
      openQuestion: this.buildOpenQuestion(chapterStructure),
      hookHint: urgentForeshadows[0]?.hint,

      // 元数据
      chapterType: this.mapNodeTypeToChapterType(nodeType),
      timeAnchor: deepContext.chapterStructure.cbn.split('→')[0],
      countdownStatus: undefined,
      strandDistribution: { quest: 60, fire: 20, constellation: 20 }
    };
  }

  /**
   * 映射节点类型到章节类型
   */
  private mapNodeTypeToChapterType(nodeType: string): string {
    switch (nodeType) {
      case 'climax':
        return 'climax';
      case 'resolution':
      case 'ending':
        return 'resolution';
      default:
        return 'normal';
    }
  }

  /**
   * 确定章节类型
   */
  private determineChapterType(chapter: Chapter): string {
    const outline = (chapter.plotSummary || this.chapterOutline || '').toLowerCase();
    const title = chapter.title.toLowerCase();

    if (outline.includes('高潮') || outline.includes('决战') || 
        outline.includes('对决') || title.includes('决战')) {
      return 'climax';
    }
    if (outline.includes('解决') || outline.includes('结束') || 
        outline.includes('落幕') || title.includes('结局')) {
      return 'resolution';
    }
    if (outline.includes('终章') || outline.includes('尾声') || title.includes('完结')) {
      return 'ending';
    }
    if (this.chapterIndex === 0) {
      return 'world_intro';
    }

    return 'normal';
  }

  /**
   * 从大纲提取结构化节点
   */
  private extractStructureNodesFromOutline(outline?: string): ChapterStructureNodes | undefined {
    if (!outline) return undefined;

    // 尝试从大纲中解析 CBN/CPNs/CEN
    // 格式：主体 | 动作/变化 | 对象/结果
    const lines = outline.split('\n').filter(l => l.trim());
    
    const nodes: ChapterStructureNodes = {
      CBN: '',
      CPNs: [],
      CEN: '',
      mustCover: [],
      forbiddenZones: []
    };

    for (const line of lines) {
      if (line.includes('CBN') || line.includes('起点') || line.includes('开始')) {
        nodes.CBN = line.replace(/^.*?[:：]/, '').trim();
      } else if (line.includes('CPN') || line.includes('推进') || line.includes('发展')) {
        nodes.CPNs.push(line.replace(/^.*?[:：]/, '').trim());
      } else if (line.includes('CEN') || line.includes('终点') || line.includes('结束')) {
        nodes.CEN = line.replace(/^.*?[:：]/, '').trim();
      } else if (line.includes('必须') || line.includes('覆盖')) {
        nodes.mustCover.push(line.replace(/^.*?[:：]/, '').trim());
      } else if (line.includes('禁止') || line.includes('禁区')) {
        nodes.forbiddenZones.push(line.replace(/^.*?[:：]/, '').trim());
      }
    }

    // 如果没有解析到，使用默认值
    if (!nodes.CBN && !nodes.CEN) {
      return undefined;
    }

    return nodes;
  }

  /**
   * 推断 CBN
   */
  private inferCBN(prevChapter: Chapter | null, previousSummary: string): string {
    if (prevChapter?.content) {
      const ending = this.contextManager.extractChapterEnding(prevChapter.content);
      return `承接上文："${ending.slice(-50)}"`;
    }
    return '新章节开始，设定场景';
  }

  /**
   * 推断 CPNs
   */
  private inferCPNs(mustCover: string[]): string[] {
    if (mustCover.length > 0) {
      return mustCover.slice(0, 3);
    }
    return ['推进核心冲突', '角色互动', '情节发展'];
  }

  /**
   * 推断 CEN
   */
  private inferCEN(nextChapter: Chapter | null): string {
    if (nextChapter) {
      return `为下一章"${nextChapter.title}"做铺垫`;
    }
    return '留下悬念或开放性问题';
  }

  /**
   * 推断角色动机
   */
  private inferCharacterMotivation(char: Character): string {
    const relationships = char.profile?.relationships || [];
    const goals: string[] = [];

    for (const rel of relationships) {
      if (rel.type === 'mentor') {
        goals.push('寻求指导');
      }
      if (rel.type === 'enemy') {
        goals.push('对抗或复仇');
      }
      if (rel.type === 'rival') {
        goals.push('竞争或超越');
      }
    }

    return goals.length > 0 ? goals.join('、') : '推进剧情';
  }

  /**
   * 推断对话倾向
   */
  private inferDialogueTendency(char: Character, relationships: any[]): string {
    const personality = char.profile?.personality || [];
    
    if (personality.includes('冷静') || personality.includes('内敛')) {
      return '简短有力，少说多听';
    }
    if (personality.includes('活泼') || personality.includes('开朗')) {
      return '话语较多，善于调节气氛';
    }
    if (personality.includes('傲慢') || personality.includes('高傲')) {
      return '语气强势，不轻易妥协';
    }

    return '正常对话，符合角色性格';
  }

  /**
   * 推断动机
   */
  private inferMotivation(structure: ChapterStructure, previousSummary: string): string {
    return `${structure.mustCover[0] || '核心目标'} + ${structure.cbn.split('→')[0] || '当前处境'}`;
  }

  /**
   * 构建风格指引
   */
  private buildStyleGuidance(
    structure: ChapterStructure,
    characters: CharacterConstraint[],
    supplementData: SupplementData
  ): StyleGuidance {
    const stylePriority = this.getStylePriority();
    const pacingStrategy = this.getPacingStrategy(structure.chapterType);
    const genreTone = this.getGenreTone();

    // 从 AI 味规则中提取 anti_patterns
    const antiPatterns = [
      '避免使用"缓缓"、"淡淡"、"微微"等万能副词',
      '避免"他感到X"式情绪描写，改用动作和生理反应',
      '避免段末感悟句和总结升华',
      '对话要带潜台词，避免信息宣讲',
      '节奏要有疏密对比'
    ];

    return {
      stylePriority,
      pacingStrategy,
      genreTone,
      antiPatterns,
      reviewScoreTrend: supplementData.readerSignals
    };
  }

  /**
   * 获取风格优先级
   */
  private getStylePriority(): string {
    switch (this.writingStyle) {
      case 'concise':
        return '简洁有力 > 情节紧凑 > 细节丰富';
      case 'elegant':
        return '文笔华丽 > 意象生动 > 情感细腻';
      case 'humorous':
        return '幽默风趣 > 节奏明快 > 人物鲜活';
      case 'ancient':
        return '古风典雅 > 用词典雅 > 意境悠远';
      default:
        return '叙事清晰 > 情节紧凑 > 人物立体';
    }
  }

  /**
   * 获取节奏策略
   */
  private getPacingStrategy(chapterType: string): string {
    switch (chapterType) {
      case 'climax':
        return '快节奏、高张力、冲突激烈';
      case 'resolution':
        return '节奏放缓、情感释放、问题解决';
      case 'transitional':
        return '中慢节奏、铺垫蓄力、信息传递';
      default:
        return '正常节奏、张弛有度、推进剧情';
    }
  }

  /**
   * 获取题材基调
   */
  private getGenreTone(): string {
    const genres = this.project.genre || [];
    const genreNames = genres.map(g => g.name).join('/');
    
    // 根据题材返回基调
    if (genreNames.includes('仙侠')) {
      return '仙气飘渺、意境悠远、修炼与红尘交织';
    }
    if (genreNames.includes('武侠')) {
      return '刀光剑影、快意恩仇、江湖义气';
    }
    if (genreNames.includes('言情')) {
      return '情感细腻、爱恨纠葛、心动与心痛';
    }

    return '叙事流畅、情节生动、人物鲜活';
  }

  /**
   * 构建章节目标
   */
  private buildChapterGoal(structure: ChapterStructure): string {
    const parts: string[] = [];
    
    if (structure.mustCover.length > 0) {
      parts.push(`完成：${structure.mustCover.join('、')}`);
    }
    if (structure.cpns.length > 0) {
      parts.push(`推进：${structure.cpns.join(' → ')}`);
    }
    
    return parts.join('；') || '推进主线剧情';
  }

  /**
   * 构建阻力
   */
  private buildObstacles(structure: ChapterStructure, activeRules: string[]): string[] {
    const obstacles: string[] = [];

    // 从大纲推断阻力
    if (structure.cbn.includes('遭遇') || structure.cbn.includes('面临')) {
      obstacles.push('角色面临困境或挑战');
    }

    // 从规则推断限制
    for (const rule of activeRules.slice(0, 2)) {
      obstacles.push(`遵守规则：${rule}`);
    }

    // 默认阻力
    if (obstacles.length === 0) {
      obstacles.push('角色面临内心或外部挑战');
    }

    return obstacles;
  }

  /**
   * 构建一句话目标
   */
  private buildOneLinerGoal(structure: ChapterStructure): string {
    return `通过${structure.cpns[0] || '核心情节推进'}达成${structure.mustCover[0] || '本章目标'}`;
  }

  /**
   * 构建结尾感觉
   */
  private buildEndingSensation(structure: ChapterStructure): string {
    if (structure.chapterType === 'climax') {
      return '高潮余韵、情绪释放、留有期待';
    }
    if (structure.chapterType === 'resolution') {
      return '问题解决、情感满足、开启新章';
    }
    return '悬念留存、引人入胜、欲罢不能';
  }

  /**
   * 构建开放性问题
   */
  private buildOpenQuestion(structure: ChapterStructure): string {
    // 根据伏笔推断开放性问题
    for (const fs of structure.activeForeshadows.slice(0, 2)) {
      if (fs.hint.length > 5) {
        return `伏笔"${fs.hint.slice(0, 20)}..."将被如何揭示？`;
      }
    }

    return '留下悬念，引发读者期待下一章';
  }

  /**
   * 获取近期记忆
   */
  private async getRecentMemories(): Promise<ChapterMemory[]> {
    const memoryManager = getMemoryManager();
    if (!memoryManager.isInitialized()) {
      return [];
    }
    return memoryManager.getRecentMemories(5, this.chapterIndex);
  }

  /**
   * 验证任务书
   */
  private validateTaskBook(taskBook: WritingTaskBook): void {
    const errors: string[] = [];

    if (!taskBook.CBN) {
      errors.push('CBN 不能为空');
    }
    if (!taskBook.CEN) {
      errors.push('CEN 不能为空');
    }
    if (taskBook.mustCover.length > 4) {
      errors.push('必须覆盖节点不超过 4 个');
    }
    if (taskBook.forbiddenZones.length > 5) {
      errors.push('本章禁区不超过 5 条');
    }

    if (errors.length > 0) {
      console.warn('[WritingTaskBuilder] 任务书验证警告:', errors);
    }
  }

  /**
   * 导出任务书为 Prompt 格式
   */
  exportToPrompt(taskBook: WritingTaskBook): string {
    const sections: string[] = [];

    // 1. 开篇委托
    sections.push(`# ${taskBook.bookTitle} 第${taskBook.chapterNumber}章：${taskBook.chapterTitle}`);
    sections.push(`\n**一句话目标**：${taskBook.oneLinerGoal}`);

    // 2. 这章的故事
    sections.push('\n## 本章核心');
    sections.push(`**前情摘要**：${taskBook.previousSummary || '（无前文）'}`);
    sections.push(`\n**本章目标**：${taskBook.chapterGoal}`);
    sections.push(`\n**阻力**：\n${taskBook.obstacles.map(o => `- ${o}`).join('\n')}`);
    sections.push(`\n**章节起点 (CBN)**：${taskBook.CBN}`);
    sections.push(`\n**推进节点 (CPNs)**：\n${taskBook.CPNs.map((p, i) => `${i + 1}. ${p}`).join('\n')}`);
    sections.push(`\n**章节终点 (CEN)**：${taskBook.CEN}`);
    
    if (taskBook.mustCover.length > 0) {
      sections.push(`\n**必须覆盖**：\n${taskBook.mustCover.map(m => `- ${m}`).join('\n')}`);
    }
    if (taskBook.forbiddenZones.length > 0) {
      sections.push(`\n**本章禁区**：\n${taskBook.forbiddenZones.map(f => `- ${f}`).join('\n')}`);
    }

    // 2.5 完结感知信息
    if (this.endingPerception) {
      sections.push('\n## 📊 完结感知');
      sections.push(`**当前阶段**：${this.endingPerception.phaseName}`);
      sections.push(`**整体进度**：${this.endingPerception.overallProgress}%`);
      sections.push(`**大纲进度**：${this.endingPerception.outlineProgress}%`);
      sections.push(`**章节进度**：${this.endingPerception.chapterProgress}%`);
      sections.push(`**伏笔完成率**：${this.endingPerception.foreshadowCompletionRate}%`);
      sections.push(`**剩余章节**：约 ${this.endingPerception.remainingChapters} 章`);
      
      if (this.endingPerception.climaxApproaching) {
        sections.push('\n⚠️ **高潮临近**：增加冲突密度，准备大场面');
      }
      
      if (this.endingPerception.unresolvedForeshadows.length > 0) {
        sections.push('\n### 待处理伏笔');
        for (const fs of this.endingPerception.unresolvedForeshadows.slice(0, 3)) {
          const urgencyIcon = fs.urgency === 'critical' ? '🚨' : 
                            fs.urgency === 'high' ? '📌' : '📝';
          sections.push(`- ${urgencyIcon} ${fs.hint.slice(0, 40)}... (${fs.urgency})`);
        }
      }
      
      sections.push('\n### 完结建议');
      sections.push(`> ${this.endingPerception.recommendation}`);
    }

    // 3. 这章的人物
    sections.push('\n## 人物约束');
    for (const char of taskBook.characters.slice(0, 5)) {
      sections.push(`\n### ${char.name}`);
      sections.push(`- 状态：${char.state}`);
      sections.push(`- 动机：${char.motivation}`);
      sections.push(`- 说话倾向：${char.dialogueTendency}`);
    }

    // 4. 怎么写更顺
    sections.push('\n## 风格指引');
    sections.push(`**风格优先级**：${taskBook.styleGuidance.stylePriority}`);
    sections.push(`**节奏策略**：${taskBook.styleGuidance.pacingStrategy}`);
    sections.push(`**题材基调**：${taskBook.styleGuidance.genreTone}`);
    sections.push(`\n**Anti-AI 提醒**：\n${taskBook.styleGuidance.antiPatterns.map(a => `- ${a}`).join('\n')}`);

    // 5. 收在哪里
    sections.push('\n## 结尾指引');
    sections.push(`**结尾感觉**：${taskBook.endingSensation}`);
    sections.push(`**留什么未完感**：${taskBook.openQuestion}`);

    // 写作铁律
    sections.push('\n---\n**写作铁律**：');
    sections.push(...WRITING_IRON_LAWS.THREE_LAWS.map(l => `- ${l}`));
    sections.push(...WRITING_IRON_LAWS.HARD_CONSTRAINTS.map(c => `- ${c}`));

    return sections.join('\n');
  }
}

// ============================================
// 辅助类型
// ============================================

interface BaseContext {
  currentChapter: Chapter | undefined;
  prevChapter: Chapter | null;
  nextChapter: Chapter | null;
  previousSummary: string;
  previousChapterEnding: string;
  recentMemories: ChapterMemory[];
  activeForeshadows: Foreshadow[];
  characters: Character[];
  worldSchema: WorldSchema;
}

interface DeepContext {
  chapterStructure: ChapterStructure;
  characterStates: CharacterConstraint[];
  activeRules: string[];
  crossChapterConstraints: string[];
}

interface SupplementData {
  readerSignals?: string;
  urgentForeshadows: Foreshadow[];
  optionalForeshadows: Foreshadow[];
}

interface ChapterStructure {
  chapterType: string;
  cbn: string;
  cpns: string[];
  cen: string;
  mustCover: string[];
  forbiddenZones: string[];
  activeForeshadows: Foreshadow[];
}

// ============================================
// 工厂函数
// ============================================

/**
 * 创建写作任务书构建器
 */
export function createTaskBookBuilder(options: TaskBookBuildOptions): WritingTaskBuilder {
  return new WritingTaskBuilder(options);
}

/**
 * 构建任务书并导出为 Prompt
 */
export async function buildAndExportTaskBook(
  options: TaskBookBuildOptions
): Promise<{ taskBook: WritingTaskBook; prompt: string }> {
  const builder = createTaskBookBuilder(options);
  const taskBook = await builder.buildTaskBook();
  const prompt = builder.exportToPrompt(taskBook);
  return { taskBook, prompt };
}

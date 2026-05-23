/**
 * 任务书构建器
 * 基于 webnovel-writer 架构的五段式任务书
 * 
 * 五段结构：
 * 1. 开篇委托（书名、章号、标题、一句话目标）
 * 2. 这章的故事（目标、障碍、节点、必须覆盖、禁区）
 * 3. 这章的人物（状态、驱动力、说话倾向）
 * 4. 怎么写更顺（风格、节奏、钩子、Anti-AI）
 * 5. 收在哪里（结尾感觉、未完感）
 */

import type {
  TaskBook,
  TaskBookOpening,
  TaskBookStory,
  TaskBookCharacter,
  TaskBookWritingGuidance,
  TaskBookEnding,
  HookStrategy,
  ChapterHookType,
} from './types';
import { CHAPTER_END_HOOKS, CHAPTER_START_HOOKS } from '@/config/writing-knowledge';
import { useProjectStore } from '@/stores/project.store';
import { useMemorySystem } from './memory/MemorySystem';
import { useReaderSignals } from './memory/ReaderSignals';
import type { MemoryPack } from './memory/types';
import type { ReaderSignals } from './memory/types';

// ============================================================
// 钩子选择策略
// ============================================================

const CHAPTER_END_HOOK_TYPES: ChapterHookType[] = [
  'sudden_reveal',
  'urgent_crisis',
  'unfinished_action',
  'identity_reveal',
  'tough_choice',
  'mysterious_item',
  'countdown',
  'promise_threat',
  'strange_disappear',
  'hidden_meaning',
  'imagery',
  'echo',
  'blank',
];

export class TaskBookBuilder {
  private projectStore = useProjectStore();
  
  /**
   * 构建任务书
   */
  async build(
    chapterNumber: number,
    context: {
      project: any;
      memoryPack: MemoryPack;
      readerSignals: ReaderSignals;
      previousChapter?: any;
      contract?: any;
    }
  ): Promise<TaskBook> {
    const { project, memoryPack, readerSignals, previousChapter, contract } = context;
    
    // 1. 构建开篇委托
    const opening = this.buildOpening(project, chapterNumber);
    
    // 2. 构建故事部分
    const story = await this.buildStory(
      chapterNumber,
      project,
      memoryPack,
      previousChapter,
      contract
    );
    
    // 3. 构建人物部分
    const characters = this.buildCharacters(project, chapterNumber);
    
    // 4. 构建怎么写
    const writingGuidance = this.buildWritingGuidance(
      project,
      chapterNumber,
      readerSignals,
      contract
    );
    
    // 5. 构建结尾设计
    const ending = this.buildEnding(chapterNumber, contract);
    
    // 6. Anti-AI 提醒
    const antiAIReminders = this.buildAntiAIReminders();
    
    return {
      opening,
      story,
      characters,
      writingGuidance,
      ending,
      antiAIReminders,
      meta: {
        chapterNumber,
        genre: project.genre || '通用',
        createdAt: new Date().toISOString(),
        source: contract ? 'contract' : 'outline',
      },
    };
  }
  
  // ============================================================
  // 第一段：开篇委托
  // ============================================================
  
  private buildOpening(
    project: any,
    chapterNumber: number
  ): TaskBookOpening {
    const chapter = this.getChapter(project, chapterNumber);
    
    return {
      bookTitle: project.title || '未命名小说',
      chapterNumber,
      chapterTitle: chapter?.title || `第${chapterNumber}章`,
      oneLineGoal: chapter?.plotSummary || this.inferOneLineGoal(chapterNumber),
    };
  }
  
  // ============================================================
  // 第二段：这章的故事
  // ============================================================
  
  private async buildStory(
    chapterNumber: number,
    project: any,
    memoryPack: MemoryPack,
    previousChapter: any,
    contract: any
  ): Promise<TaskBookStory> {
    const chapter = this.getChapter(project, chapterNumber);
    const previousChapterSummary = this.buildPreviousSummary(previousChapter);
    
    // 解析章纲中的节点
    const nodes = this.parsePlotNodes(chapter?.plotSummary || '');
    
    // 推断障碍
    const obstacles = this.inferObstacles(chapter, chapterNumber);
    
    // 跨章线索
    const crossChapterClues = this.extractCrossChapterClues(
      project,
      chapterNumber,
      memoryPack
    );
    
    // 时间信息
    const { timeAnchor, chapterSpan } = this.extractTimeInfo(chapter, chapterNumber);
    
    return {
      previousSummary: previousChapterSummary.summary,
      previousChapterEnding: previousChapterSummary.ending,
      goal: chapter?.plotSummary || nodes.cbn || `推进情节到第${chapterNumber}章`,
      obstacles,
      cbn: nodes.cbn,
      cpns: nodes.cpns,
      cen: nodes.cen,
      mustCover: contract?.mustCover || this.inferMustCover(chapter, nodes),
      forbiddenZones: contract?.forbiddenZones || this.inferForbiddenZones(project),
      crossChapterClues,
      timeAnchor,
      chapterSpan,
    };
  }
  
  // ============================================================
  // 第三段：人物
  // ============================================================
  
  private buildCharacters(
    project: any,
    chapterNumber: number
  ): TaskBookCharacter[] {
    const characters: TaskBookCharacter[] = [];
    
    // 主角
    const protagonist = project.characters?.find(
      (c: any) => c.role === '主角' || c.role?.includes('主角')
    );
    
    if (protagonist) {
      characters.push({
        name: protagonist.name,
        role: '主角',
        state: this.inferCharacterState(protagonist, chapterNumber),
        motivation: protagonist.motivation || this.inferMotivation(protagonist),
        chapterRole: '推动本章情节发展',
        speakingStyle: protagonist.speakingStyle || this.inferSpeakingStyle(protagonist),
        appearance: protagonist.profile?.appearance,
      });
    }
    
    // 本章涉及的其他角色
    const relatedCharacters = project.characters?.slice(0, 5) || [];
    for (const char of relatedCharacters) {
      if (char.name === protagonist?.name) continue;
      
      characters.push({
        name: char.name,
        role: char.role || '角色',
        state: this.inferCharacterState(char, chapterNumber),
        motivation: char.motivation || '未知',
        chapterRole: this.inferChapterRole(char, chapterNumber),
        speakingStyle: char.speakingStyle || this.inferSpeakingStyle(char),
        appearance: char.profile?.appearance,
      });
    }
    
    return characters;
  }
  
  // ============================================================
  // 第四段：怎么写更顺
  // ============================================================
  
  private buildWritingGuidance(
    project: any,
    chapterNumber: number,
    readerSignals: ReaderSignals,
    contract: any
  ): TaskBookWritingGuidance {
    // 风格优先级
    const stylePriority = this.inferStylePriority(project);
    
    // 节奏策略
    const pacingStrategy = this.determinePacingStrategy(chapterNumber);
    
    // 题材提示
    const genreHint = this.getGenreHint(project.genre);
    
    // 反面教材
    const antiPatterns = this.getAntiPatterns(project.genre);
    
    // 钩子策略
    const hookStrategy = this.buildHookStrategy(readerSignals, chapterNumber);
    
    // 爽点密度
    const coolPointDensity = this.getCoolPointDensity(chapterNumber);
    
    // 情绪波浪
    const emotionWavePattern = this.getEmotionWavePattern(chapterNumber);
    
    // 写作铁律
    const writingRules = this.buildWritingRules();
    
    return {
      stylePriority,
      pacingStrategy,
      genreHint,
      antiPatterns,
      hookStrategy,
      shockLayers: true,
      coolPointDensity,
      emotionWavePattern,
      writingRules,
    };
  }
  
  // ============================================================
  // 第五段：收在哪里
  // ============================================================
  
  private buildEnding(
    chapterNumber: number,
    contract: any
  ): TaskBookEnding {
    // 选择章尾钩子
    const hookType = this.selectChapterEndHook();
    
    // 推断未完问题
    const unfinishedQuestions = this.inferUnfinishedQuestions(chapterNumber);
    
    // 张力等级
    const tensionLevel = this.determineTensionLevel(chapterNumber);
    
    return {
      target: contract?.chapterEnd || '留下悬念，勾起读者翻页欲望',
      unfinishedQuestions,
      hookType,
      tensionLevel,
    };
  }
  
  // ============================================================
  // Anti-AI 提醒
  // ============================================================
  
  private buildAntiAIReminders(): string[] {
    return [
      '删段末感悟句，留余味——你倾向写闭环',
      '删万能副词（缓缓/淡淡/微微），换具体动作',
      '情绪用生理反应+微动作，禁止"他感到X"',
      '对话带潜台词，有抢话、沉默、答非所问',
      '制造节奏疏密对比，有的段落只一句话',
      '章末禁止安全着陆，留未解决的问题',
      '展示后不解释',
      '掐断升华——禁止"这就是人生/成长"',
    ];
  }
  
  // ============================================================
  // 辅助方法
  // ============================================================
  
  private getChapter(project: any, chapterNumber: number): any {
    return project.chapters?.find(
      (c: any) => c.orderIndex + 1 === chapterNumber
    ) || project.plotOutline?.find(
      (p: any) => p.chapterNumber === chapterNumber
    );
  }
  
  private buildPreviousSummary(previousChapter: any): { summary: string; ending: string } {
    if (!previousChapter?.content) {
      return {
        summary: '（暂无前章内容）',
        ending: '（暂无前章结尾）',
      };
    }
    
    // 提取最后 500 字作为摘要
    const content = previousChapter.content;
    const summary = content.slice(-500);
    
    // 提取最后一段的最后一句作为结尾
    const paragraphs = content.split('\n\n');
    const lastParagraph = paragraphs[paragraphs.length - 1] || '';
    const sentences = lastParagraph.split(/[。！？]/);
    const ending = sentences[sentences.length - 2]?.trim() + '。' || lastParagraph.slice(-100);
    
    return { summary, ending };
  }
  
  private parsePlotNodes(plotSummary: string): { cbn: string; cpns: string[]; cen: string } {
    // 简单的节点解析，实际应该从章纲结构化数据中获取
    const lines = plotSummary.split('\n').filter(Boolean);
    
    if (lines.length === 0) {
      return {
        cbn: '续写当前情节',
        cpns: [],
        cen: '留下悬念',
      };
    }
    
    return {
      cbn: lines[0] || '续写当前情节',
      cpns: lines.slice(1, -1),
      cen: lines[lines.length - 1] || '留下悬念',
    };
  }
  
  private inferObstacles(chapter: any, chapterNumber: number): string[] {
    const obstacles: string[] = [];
    
    // 根据章节位置推断
    if (chapterNumber <= 5) {
      obstacles.push('主角刚起步，资源/能力有限');
    } else if (chapterNumber % 10 === 0) {
      obstacles.push('大情节转折点，矛盾激化');
    }
    
    // 从章纲中提取
    if (chapter?.plotSummary) {
      // 简单关键词检测
      const summary = chapter.plotSummary;
      if (summary.includes('困难') || summary.includes('危机')) {
        obstacles.push('面临重重困难');
      }
      if (summary.includes('敌人') || summary.includes('对手')) {
        obstacles.push('有强敌环伺');
      }
      if (summary.includes('时间') || summary.includes('限时')) {
        obstacles.push('时间紧迫');
      }
    }
    
    return obstacles.length > 0 ? obstacles : ['推进情节发展'];
  }
  
  private extractCrossChapterClues(
    project: any,
    chapterNumber: number,
    memoryPack: MemoryPack
  ): string[] {
    const clues: string[] = [];
    
    // 从伏笔中提取
    const activeForeshadows = project.foreshadows?.filter(
      (f: any) => f.status !== 'resolved'
    ) || [];
    
    for (const foreshadow of activeForeshadows.slice(0, 3)) {
      clues.push(foreshadow.hint);
    }
    
    // 从记忆中提取
    if (memoryPack?.workingMemory) {
      const workingItems = memoryPack.workingMemory.slice(0, 2);
      for (const item of workingItems) {
        if (item.content) {
          clues.push(typeof item.content === 'string' 
            ? item.content.slice(0, 50) 
            : JSON.stringify(item.content).slice(0, 50)
          );
        }
      }
    }
    
    return clues;
  }
  
  private extractTimeInfo(chapter: any, chapterNumber: number): { timeAnchor: string; chapterSpan: string } {
    // 默认值
    let timeAnchor = '继续上文';
    let chapterSpan = '正常时间流逝';
    
    // 从章纲中提取时间信息
    const summary = chapter?.plotSummary || '';
    if (summary.includes('第二天') || summary.includes('次日')) {
      timeAnchor = '第二天';
      chapterSpan = '一天内';
    } else if (summary.includes('一月') || summary.includes('一个月')) {
      timeAnchor = '一个月后';
      chapterSpan = '一个月';
    } else if (summary.includes('当晚') || summary.includes('当晚')) {
      timeAnchor = '当晚';
      chapterSpan = '当天晚上';
    }
    
    return { timeAnchor, chapterSpan };
  }
  
  private inferOneLineGoal(chapterNumber: number): string {
    if (chapterNumber === 1) {
      return '介绍世界观和主角，开启主线';
    } else if (chapterNumber <= 3) {
      return '展示金手指，建立读者期待';
    } else {
      return '推进主线情节';
    }
  }
  
  private inferMustCover(chapter: any, nodes: { cbn: string; cpns: string[]; cen: string }): string[] {
    const mustCover: string[] = [];
    
    if (nodes.cpns.length > 0) {
      mustCover.push(...nodes.cpns);
    }
    
    return mustCover;
  }
  
  private inferForbiddenZones(project: any): string[] {
    const zones: string[] = [];
    
    // 从项目设定中推断禁区
    if (project.antiPatterns) {
      zones.push(...project.antiPatterns);
    }
    
    // 默认禁区
    zones.push('主角死亡', '主角无敌', '剧情逻辑漏洞');
    
    return [...new Set(zones)];
  }
  
  private inferCharacterState(char: any, chapterNumber: number): string {
    // 从角色状态追踪中获取
    if (char.state) {
      return char.state;
    }
    
    // 默认状态
    return char.profile?.personality?.join('、') || '正常状态';
  }
  
  private inferMotivation(char: any): string {
    return char.motivation || char.goal || '追求目标';
  }
  
  private inferSpeakingStyle(char: any): string {
    if (char.speakingStyle) {
      return char.speakingStyle;
    }
    
    // 根据性格推断说话风格
    const personality = char.profile?.personality?.[0] || '';
    if (personality.includes('冷静')) {
      return '话少、简短、直接';
    }
    if (personality.includes('活泼')) {
      return '话多、爱开玩笑、口语化';
    }
    if (personality.includes('腹黑')) {
      return '表面客气、话里有话';
    }
    
    return '正常口语化';
  }
  
  private inferChapterRole(char: any, chapterNumber: number): string {
    // 根据章节上下文推断
    if (chapterNumber <= 5 && char.role === '主角') {
      return '展现主角性格，建立读者代入感';
    }
    
    return '配合推进本章情节';
  }
  
  private inferStylePriority(project: any): string[] {
    const genre = project.genre || '通用';
    
    const styleMap: Record<string, string[]> = {
      '玄幻': ['热血', '爽', '节奏快'],
      '都市': ['现实感', '代入感', '爽'],
      '仙侠': ['飘逸', '意境', '修为递进'],
      '悬疑': ['紧张', '悬念', '逻辑严密'],
      '轻小说': ['轻松', '有趣', '人物鲜明'],
      '通用': ['情节紧凑', '人物鲜活', '有爽点'],
    };
    
    return styleMap[genre] || styleMap['通用'];
  }
  
  private determinePacingStrategy(chapterNumber: number): 'build_up' | 'confront' | 'release' | 'normal' {
    // 根据章节位置判断节奏
    if (chapterNumber % 7 === 0 || chapterNumber % 10 === 0) {
      return 'release';  // 高潮后的释放
    }
    if (chapterNumber % 5 === 0) {
      return 'confront';  // 对抗
    }
    if (chapterNumber <= 10) {
      return 'build_up';  // 铺陈
    }
    return 'normal';
  }
  
  private getGenreHint(genre?: string): string {
    const hints: Record<string, string> = {
      '玄幻': '修仙升级，境界分明，装逼打脸',
      '都市': '贴近生活，社会现实，打脸逆袭',
      '仙侠': '仙风道骨，奇遇连连，道法自然',
      '悬疑': '环环相扣，悬念迭起，真相难料',
      '轻小说': '轻松有趣，人物讨喜，日常展开',
    };
    
    return hints[genre || '通用'] || '情节紧凑，人物鲜明';
  }
  
  private getAntiPatterns(genre?: string): string[] {
    const patterns: Record<string, string[]> = {
      '玄幻': ['境界崩塌', '升级太容易', '女主工具人'],
      '都市': ['过于YY', '脱离现实', '配角降智'],
      '通用': ['主角圣母', '剧情拖沓', '人设崩塌'],
    };
    
    return patterns[genre || '通用'] || patterns['通用'];
  }
  
  private buildHookStrategy(
    readerSignals: ReaderSignals,
    chapterNumber: number
  ): HookStrategy {
    // 选择章首钩子
    const chapterStartHooks = this.selectChapterStartHooks(chapterNumber);
    
    // 选择章尾钩子
    const chapterEndHook = this.selectChapterEndHook();
    
    // 多样化策略：避免重复使用同类型钩子
    const hookUsage = readerSignals?.hookTypeUsage || {};
    const diversifyFrom = this.getMostUsed(hookUsage);
    
    // 张力等级
    const tensionLevel = this.determineTensionLevel(chapterNumber);
    
    return {
      chapterStartHooks,
      chapterEndHook,
      diversifyFrom,
      tensionLevel,
    };
  }
  
  private selectChapterStartHooks(chapterNumber: number): ChapterHookType[] {
    // 第一章优先使用强钩子
    if (chapterNumber === 1) {
      return ['sudden_reveal', 'urgent_crisis'];
    }
    
    // 随机选择
    const count = chapterNumber <= 5 ? 2 : 1;
    const selected: ChapterHookType[] = [];
    
    while (selected.length < count) {
      const hook = CHAPTER_START_HOOKS[Math.floor(Math.random() * CHAPTER_START_HOOKS.length)];
      if (!selected.includes(hook)) {
        selected.push(hook);
      }
    }
    
    return selected;
  }
  
  private selectChapterEndHook(): ChapterHookType {
    return CHAPTER_END_HOOK_TYPES[Math.floor(Math.random() * CHAPTER_END_HOOK_TYPES.length)];
  }
  
  private getMostUsed(hookUsage: Record<string, number>): string | undefined {
    const entries = Object.entries(hookUsage);
    if (entries.length === 0) return undefined;
    
    return entries.sort((a, b) => b[1] - a[1])[0][0];
  }
  
  private determineTensionLevel(chapterNumber: number): 'low' | 'medium' | 'high' {
    if (chapterNumber % 5 === 0) {
      return 'high';
    }
    if (chapterNumber % 3 === 0) {
      return 'medium';
    }
    return 'low';
  }
  
  private getCoolPointDensity(chapterNumber: number): number {
    // 根据章节位置调整爽点密度
    if (chapterNumber <= 10) {
      return 2500;  // 前十章高密度
    }
    return 3000;
  }
  
  private getEmotionWavePattern(chapterNumber: number): string {
    return `
↓ 低落现状（共情建立）
↑ 给出希望（期待感1）
↓ 强调困难（期待感放大）
↑ 给出新希望（期待感2）
↓ 情况恶化（情绪谷底）
↑↑ 达成期待（小高潮）
↓ 戛然而止，给出新困境
`.trim();
  }
  
  private buildWritingRules(): string[] {
    return [
      '章首300字内给出冲突触发',
      '每600-900字给一次微兑现',
      '章末必须留钩',
      '禁止占位正文',
    ];
  }
  
  private inferUnfinishedQuestions(chapterNumber: number): string[] {
    const questions: string[] = [];
    
    // 根据章节节奏推断
    if (chapterNumber % 3 === 0) {
      questions.push('主角能否突破困境？');
    }
    if (chapterNumber % 5 === 0) {
      questions.push('背后隐藏着什么秘密？');
    }
    
    return questions.length > 0 ? questions : ['接下来会发生什么？'];
  }
}

// 导出 Hook 类型常量
const CHAPTER_START_HOOKS: ChapterHookType[] = [
  'sudden_reveal',
  'urgent_crisis',
  'unfinished_action',
  'identity_reveal',
  'hidden_meaning',
  'countdown',
  'imagery',
];

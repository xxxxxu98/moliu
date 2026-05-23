/**
 * 增强版任务书构建器
 * 集成情绪波浪线和题材专属公式
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
import type { EmotionWave, ChapterType } from '../emotion-wave/EmotionWaveQuantifier';
import { EmotionWaveQuantifier } from '../emotion-wave/EmotionWaveQuantifier';
import { getGenreFormula, getGenreWritingPrompt } from '../genre-formulas/GenreWritingFormulas';
import type { GenreWritingFormula } from '../genre-formulas/GenreWritingFormulas';
import type { MemoryPack } from '../memory/types';
import type { ReaderSignals } from '../memory/types';

// 钩子常量
const CHAPTER_END_HOOK_TYPES: ChapterHookType[] = [
  'sudden_reveal', 'urgent_crisis', 'unfinished_action',
  'identity_reveal', 'tough_choice', 'mysterious_item',
  'countdown', 'promise_threat', 'strange_disappear',
  'hidden_meaning', 'imagery', 'echo', 'blank',
];

const CHAPTER_START_HOOKS: ChapterHookType[] = [
  'sudden_reveal', 'urgent_crisis', 'unfinished_action',
  'identity_reveal', 'hidden_meaning', 'countdown', 'imagery',
];

export interface EnhancedTaskBookContext {
  project: any;
  memoryPack: MemoryPack;
  readerSignals: ReaderSignals;
  previousChapter?: any;
  contract?: any;
  currentChapter: number;
}

export class EnhancedTaskBookBuilder {
  /**
   * 构建增强版任务书
   */
  async build(context: EnhancedTaskBookContext): Promise<TaskBook> {
    const { project, memoryPack, readerSignals, previousChapter, contract, currentChapter } = context;

    // 1. 获取题材公式
    const genreFormula = getGenreFormula(project.genre) || getGenreFormula('urban-cultivation');

    // 2. 生成情绪波浪线
    const emotionWave = this.generateEmotionWave(currentChapter, project.genre, genreFormula);

    // 3. 构建开篇委托
    const opening = this.buildOpening(project, currentChapter, genreFormula);

    // 4. 构建故事部分
    const story = await this.buildStory(
      currentChapter,
      project,
      memoryPack,
      previousChapter,
      contract,
      genreFormula
    );

    // 5. 构建人物部分
    const characters = this.buildCharacters(project, currentChapter, genreFormula);

    // 6. 构建怎么写（增强版）
    const writingGuidance = this.buildWritingGuidance(
      project,
      currentChapter,
      readerSignals,
      contract,
      emotionWave,
      genreFormula
    );

    // 7. 构建结尾设计
    const ending = this.buildEnding(currentChapter, contract, emotionWave, genreFormula);

    // 8. Anti-AI 提醒
    const antiAIReminders = this.buildAntiAIReminders();

    return {
      opening,
      story,
      characters,
      writingGuidance,
      ending,
      antiAIReminders,
      meta: {
        chapterNumber: currentChapter,
        genre: project.genre || '通用',
        createdAt: new Date().toISOString(),
        source: contract ? 'contract' : 'outline',
        emotionWave,
      },
    };
  }

  /**
   * 生成情绪波浪线
   */
  private generateEmotionWave(
    chapterNumber: number,
    genre: string,
    formula?: GenreWritingFormula
  ): EmotionWave {
    // 根据章节位置确定章节类型
    const chapterType = this.determineChapterType(chapterNumber);

    // 获取题材配置
    const genreConfig = formula?.coolPointRhythm || {
      density: { minimum: 1.5, optimal: 2.5, maximum: 4 },
    };

    return EmotionWaveQuantifier.generate({
      targetWordCount: 3000,
      chapterType,
      chapterNumber,
      genre: [genre],
      emotionDensity: genreConfig.density.optimal,
      isVolumeEnd: chapterNumber % 30 === 0,
      hasPreviousChapter: chapterNumber > 1,
    });
  }

  /**
   * 确定章节类型
   */
  private determineChapterType(chapterNumber: number): ChapterType {
    if (chapterNumber === 1) return 'setup';
    if (chapterNumber % 30 === 0) return 'climax';
    if (chapterNumber % 15 === 0) return 'conflict';
    if (chapterNumber % 10 === 0) return 'resolution';
    if (chapterNumber % 5 === 0) return 'transition';
    return 'normal';
  }

  /**
   * 构建开篇委托
   */
  private buildOpening(project: any, chapterNumber: number, formula?: GenreWritingFormula): TaskBookOpening {
    const chapter = this.getChapter(project, chapterNumber);

    return {
      bookTitle: project.title || '未命名小说',
      chapterNumber,
      chapterTitle: chapter?.title || `第${chapterNumber}章`,
      oneLineGoal: chapter?.plotSummary || this.inferOneLineGoal(chapterNumber, formula),
    };
  }

  /**
   * 构建故事部分
   */
  private async buildStory(
    chapterNumber: number,
    project: any,
    memoryPack: MemoryPack,
    previousChapter: any,
    contract: any,
    formula?: GenreWritingFormula
  ): Promise<TaskBookStory> {
    const chapter = this.getChapter(project, chapterNumber);
    const previousSummary = this.buildPreviousSummary(previousChapter);

    // 解析章纲节点
    const nodes = this.parsePlotNodes(chapter?.plotSummary || '');

    // 推断障碍
    const obstacles = this.inferObstacles(chapter, chapterNumber, formula);

    // 跨章线索
    const crossChapterClues = this.extractCrossChapterClues(project, chapterNumber, memoryPack);

    // 时间信息
    const { timeAnchor, chapterSpan } = this.extractTimeInfo(chapter, chapterNumber);

    return {
      previousSummary: previousSummary.summary,
      previousChapterEnding: previousSummary.ending,
      goal: chapter?.plotSummary || nodes.cbn || `推进情节到第${chapterNumber}章`,
      obstacles,
      cbn: nodes.cbn,
      cpns: nodes.cpns,
      cen: nodes.cen,
      mustCover: contract?.mustCover || this.inferMustCover(chapter, nodes),
      forbiddenZones: contract?.forbiddenZones || this.inferForbiddenZones(project, formula),
      crossChapterClues,
      timeAnchor,
      chapterSpan,
    };
  }

  /**
   * 构建人物部分
   */
  private buildCharacters(project: any, chapterNumber: number, formula?: GenreWritingFormula): TaskBookCharacter[] {
    const characters: TaskBookCharacter[] = [];

    const protagonist = project.characters?.find(
      (c: any) => c.role === '主角' || c.role?.includes('主角')
    );

    if (protagonist) {
      const template = formula?.characterTemplates?.protagonist;
      characters.push({
        name: protagonist.name,
        role: '主角',
        state: this.inferCharacterState(protagonist, chapterNumber),
        motivation: protagonist.motivation || this.inferMotivation(protagonist),
        chapterRole: template?.description || '推动本章情节发展',
        speakingStyle: protagonist.speakingStyle || template?.speechStyle || this.inferSpeakingStyle(protagonist),
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

  /**
   * 构建写作指导（增强版）
   */
  private buildWritingGuidance(
    project: any,
    chapterNumber: number,
    readerSignals: ReaderSignals,
    contract: any,
    emotionWave: EmotionWave,
    formula?: GenreWritingFormula
  ): TaskBookWritingGuidance {
    // 风格优先级
    const stylePriority = this.inferStylePriority(project, formula);

    // 节奏策略
    const pacingStrategy = this.determinePacingStrategy(chapterNumber, formula);

    // 题材提示
    const genreHint = formula ? `${formula.displayName}专属：${formula.description}` : this.getGenreHint(project.genre);

    // 反面教材
    const antiPatterns = this.getAntiPatterns(project.genre, formula);

    // 钩子策略
    const hookStrategy = this.buildHookStrategy(readerSignals, chapterNumber);

    // 爽点密度
    const coolPointDensity = formula?.coolPointRhythm?.density?.optimal || 2.5;

    // 情绪波浪模式
    const emotionWavePattern = this.buildEmotionWaveGuidance(emotionWave);

    // 写作铁律
    const writingRules = this.buildWritingRules(formula);

    // 题材专属提示
    const genreSpecificGuidance = formula ? this.buildGenreSpecificGuidance(formula) : '';

    return {
      stylePriority,
      pacingStrategy,
      genreHint: genreHint + (genreSpecificGuidance ? '\n\n' + genreSpecificGuidance : ''),
      antiPatterns,
      hookStrategy,
      shockLayers: true,
      coolPointDensity,
      emotionWavePattern,
      writingRules,
    };
  }

  /**
   * 构建情绪波浪线指导
   */
  private buildEmotionWaveGuidance(wave: EmotionWave): string {
    const lines: string[] = [];

    lines.push('【情绪波浪线】');
    lines.push(`基调：${wave.baseEmotion === 'tension' ? '紧张' : wave.baseEmotion === 'excitement' ? '兴奋' : wave.baseEmotion === 'relaxation' ? '放松' : '平静'}`);
    lines.push(`情绪变化：${wave.emotionChangeCount}次`);
    lines.push(`高潮点：第${Math.round(wave.peakPosition * 100)}%，强度${wave.peakIntensity}/10`);
    lines.push(`低谷点：第${Math.round(wave.valleyPosition * 100)}%，强度${wave.valleyIntensity}/10`);
    lines.push(`章尾悬念：${wave.chapterEndDescription}（${wave.chapterEndIntensity}/10）`);

    return lines.join('\n');
  }

  /**
   * 构建题材专属指导
   */
  private buildGenreSpecificGuidance(formula: GenreWritingFormula): string {
    const lines: string[] = [];

    lines.push('【题材专属要求】');
    lines.push(`爽点类型：${formula.coreCoolPoints.join('、')}`);
    lines.push(`节奏：${formula.chapterStructure.middle.pacing === 'fast' ? '快节奏' : formula.chapterStructure.middle.pacing === 'slow' ? '慢节奏' : '中等节奏'}`);
    lines.push(`对话比例：${formula.chapterStructure.middle.dialogueRatio[0] * 100}%-${formula.chapterStructure.middle.dialogueRatio[1] * 100}%`);

    if (formula.taboos.avoidPlots.length > 0) {
      lines.push(`禁忌：${formula.taboos.avoidPlots.slice(0, 3).join('、')}`);
    }

    return lines.join('\n');
  }

  /**
   * 构建结尾设计
   */
  private buildEnding(
    chapterNumber: number,
    contract: any,
    emotionWave: EmotionWave,
    formula?: GenreWritingFormula
  ): TaskBookEnding {
    // 选择章尾钩子
    const hookType = this.selectChapterEndHook(formula);

    // 推断未完问题
    const unfinishedQuestions = this.inferUnfinishedQuestions(chapterNumber, emotionWave);

    // 张力等级
    const tensionLevel = this.determineTensionLevel(chapterNumber, emotionWave);

    return {
      target: contract?.chapterEnd || `留下${emotionWave.chapterEndEmotion === 'cliffhanger' ? '悬念' : '情绪余韵'}`,
      unfinishedQuestions,
      hookType,
      tensionLevel,
    };
  }

  /**
   * 选择章尾钩子
   */
  private selectChapterEndHook(formula?: GenreWritingFormula): ChapterHookType {
    const hooks = formula?.chapterStructure.ending.hookType as ChapterHookType[] || CHAPTER_END_HOOK_TYPES;
    return hooks[Math.floor(Math.random() * hooks.length)];
  }

  /**
   * 推断未完问题
   */
  private inferUnfinishedQuestions(chapterNumber: number, emotionWave: EmotionWave): string[] {
    const questions: string[] = [];

    if (chapterNumber % 3 === 0) {
      questions.push('主角能否突破困境？');
    }
    if (chapterNumber % 5 === 0) {
      questions.push('背后隐藏着什么秘密？');
    }

    // 来自情绪波浪线
    if (emotionWave.chapterEndEmotion === 'question') {
      questions.push('这个问题怎么解决？');
    } else if (emotionWave.chapterEndEmotion === 'cliffhanger') {
      questions.push('接下来会发生什么？');
    }

    return questions.length > 0 ? questions : ['接下来会发生什么？'];
  }

  /**
   * 确定张力等级
   */
  private determineTensionLevel(chapterNumber: number, emotionWave: EmotionWave): 'low' | 'medium' | 'high' {
    if (emotionWave.chapterEndIntensity >= 8) return 'high';
    if (emotionWave.chapterEndIntensity >= 5) return 'medium';
    return 'low';
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  private getChapter(project: any, chapterNumber: number): any {
    return project.chapters?.find((c: any) => c.orderIndex + 1 === chapterNumber) ||
      project.plotOutline?.find((p: any) => p.chapterNumber === chapterNumber);
  }

  private buildPreviousSummary(previousChapter: any): { summary: string; ending: string } {
    if (!previousChapter?.content) {
      return { summary: '（暂无前章内容）', ending: '（暂无前章结尾）' };
    }

    const content = previousChapter.content;
    const summary = content.slice(-500);

    const paragraphs = content.split('\n\n');
    const lastParagraph = paragraphs[paragraphs.length - 1] || '';
    const sentences = lastParagraph.split(/[。！？]/);
    const ending = sentences[sentences.length - 2]?.trim() + '。' || lastParagraph.slice(-100);

    return { summary, ending };
  }

  private parsePlotNodes(plotSummary: string): { cbn: string; cpns: string[]; cen: string } {
    const lines = plotSummary.split('\n').filter(Boolean);

    if (lines.length === 0) {
      return { cbn: '续写当前情节', cpns: [], cen: '留下悬念' };
    }

    return {
      cbn: lines[0] || '续写当前情节',
      cpns: lines.slice(1, -1),
      cen: lines[lines.length - 1] || '留下悬念',
    };
  }

  private inferObstacles(chapter: any, chapterNumber: number, formula?: GenreWritingFormula): string[] {
    const obstacles: string[] = [];

    if (chapterNumber <= 5) {
      obstacles.push('主角刚起步，资源/能力有限');
    } else if (chapterNumber % 10 === 0) {
      obstacles.push('大情节转折点，矛盾激化');
    }

    if (chapter?.plotSummary) {
      const summary = chapter.plotSummary;
      if (summary.includes('困难') || summary.includes('危机')) {
        obstacles.push('面临重重困难');
      }
      if (summary.includes('敌人') || summary.includes('对手')) {
        obstacles.push('有强敌环伺');
      }
    }

    return obstacles.length > 0 ? obstacles : ['推进情节发展'];
  }

  private extractCrossChapterClues(project: any, chapterNumber: number, memoryPack: MemoryPack): string[] {
    const clues: string[] = [];

    const activeForeshadows = project.foreshadows?.filter((f: any) => f.status !== 'resolved') || [];
    for (const foreshadow of activeForeshadows.slice(0, 3)) {
      clues.push(foreshadow.hint);
    }

    if (memoryPack?.workingMemory) {
      for (const item of memoryPack.workingMemory.slice(0, 2)) {
        if (item.content) {
          clues.push(typeof item.content === 'string' ? item.content.slice(0, 50) : JSON.stringify(item.content).slice(0, 50));
        }
      }
    }

    return clues;
  }

  private extractTimeInfo(chapter: any, chapterNumber: number): { timeAnchor: string; chapterSpan: string } {
    let timeAnchor = '继续上文';
    let chapterSpan = '正常时间流逝';

    const summary = chapter?.plotSummary || '';
    if (summary.includes('第二天') || summary.includes('次日')) {
      timeAnchor = '第二天';
      chapterSpan = '一天内';
    } else if (summary.includes('一月') || summary.includes('一个月')) {
      timeAnchor = '一个月后';
      chapterSpan = '一个月';
    }

    return { timeAnchor, chapterSpan };
  }

  private inferOneLineGoal(chapterNumber: number, formula?: GenreWritingFormula): string {
    if (chapterNumber === 1) {
      return '介绍世界观和主角，开启主线';
    } else if (chapterNumber <= 3) {
      return '展示金手指，建立读者期待';
    } else if (formula?.coolPointRhythm?.climaxChapterRatio) {
      if (chapterNumber % Math.round(1 / formula.coolPointRhythm.climaxChapterRatio) === 0) {
        return '高潮章节，全力推进情节';
      }
    }
    return '推进主线情节';
  }

  private inferMustCover(chapter: any, nodes: { cbn: string; cpns: string[]; cen: string }): string[] {
    const mustCover: string[] = [];
    if (nodes.cpns.length > 0) {
      mustCover.push(...nodes.cpns);
    }
    return mustCover;
  }

  private inferForbiddenZones(project: any, formula?: GenreWritingFormula): string[] {
    const zones: string[] = formula?.taboos.avoidPlots || [];

    if (project.antiPatterns) {
      zones.push(...project.antiPatterns);
    }

    zones.push('主角死亡', '主角无敌', '剧情逻辑漏洞');

    return [...new Set(zones)];
  }

  private inferCharacterState(char: any, chapterNumber: number): string {
    return char.state || char.profile?.personality?.join('、') || '正常状态';
  }

  private inferMotivation(char: any): string {
    return char.motivation || char.goal || '追求目标';
  }

  private inferSpeakingStyle(char: any): string {
    if (char.speakingStyle) return char.speakingStyle;

    const personality = char.profile?.personality?.[0] || '';
    if (personality.includes('冷静')) return '话少、简短、直接';
    if (personality.includes('活泼')) return '话多、爱开玩笑、口语化';
    if (personality.includes('腹黑')) return '表面客气、话里有话';

    return '正常口语化';
  }

  private inferChapterRole(char: any, chapterNumber: number): string {
    if (chapterNumber <= 5 && char.role === '主角') {
      return '展现主角性格，建立读者代入感';
    }
    return '配合推进本章情节';
  }

  private inferStylePriority(project: any, formula?: GenreWritingFormula): string[] {
    if (formula) {
      return formula.successPatterns.slice(0, 3);
    }

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

  private determinePacingStrategy(chapterNumber: number, formula?: GenreWritingFormula): 'build_up' | 'confront' | 'release' | 'normal' {
    if (chapterNumber % 7 === 0 || chapterNumber % 10 === 0) return 'release';
    if (chapterNumber % 5 === 0) return 'confront';
    if (chapterNumber <= 10) return 'build_up';
    return formula?.chapterStructure?.middle?.pacing === 'fast' ? 'confront' : 'normal';
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

  private getAntiPatterns(genre?: string, formula?: GenreWritingFormula): string[] {
    if (formula) {
      return formula.taboos.avoidPlots.slice(0, 5);
    }

    const patterns: Record<string, string[]> = {
      '玄幻': ['境界崩塌', '升级太容易', '女主工具人'],
      '都市': ['过于YY', '脱离现实', '配角降智'],
      '通用': ['主角圣母', '剧情拖沓', '人设崩塌'],
    };

    return patterns[genre || '通用'] || patterns['通用'];
  }

  private buildHookStrategy(readerSignals: ReaderSignals, chapterNumber: number): HookStrategy {
    const chapterStartHooks = this.selectChapterStartHooks(chapterNumber);
    const chapterEndHook = this.selectChapterEndHook();
    const hookUsage = readerSignals?.hookTypeUsage || {};
    const diversifyFrom = this.getMostUsed(hookUsage);
    const tensionLevel = this.determineTensionLevel(chapterNumber, { chapterEndIntensity: chapterNumber % 5 === 0 ? 8 : 6 } as any);

    return { chapterStartHooks, chapterEndHook, diversifyFrom, tensionLevel };
  }

  private selectChapterStartHooks(chapterNumber: number): ChapterHookType[] {
    if (chapterNumber === 1) {
      return ['sudden_reveal', 'urgent_crisis'];
    }

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

  private getMostUsed(hookUsage: Record<string, number>): string | undefined {
    const entries = Object.entries(hookUsage);
    if (entries.length === 0) return undefined;
    return entries.sort((a, b) => b[1] - a[1])[0][0];
  }

  private buildWritingRules(formula?: GenreWritingFormula): string[] {
    const rules = [
      '章首300字内给出冲突触发',
      '每600-900字给一次微兑现',
      '章末必须留钩',
      '禁止占位正文',
    ];

    if (formula) {
      // 添加题材特定规则
      if (formula.chapterStructure.opening.requiredElements.length > 0) {
        rules.push(`开局必须包含：${formula.chapterStructure.opening.requiredElements.slice(0, 2).join('、')}`);
      }
    }

    return rules;
  }
}

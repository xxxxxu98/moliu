/**
 * 追读力分析系统
 * 参考 oh-story-claudecode 的读者留存分析理念
 * - 钩子密度分析：评估章节中钩子的分布密度
 * - 爽点密度分析：评估章节中爽点的分布密度
 * - 节奏评估：综合评估章节节奏是否紧凑
 * - 追读力评分：计算章节对读者的吸引力评分
 */

import type { GeneratedChapter } from '@/composables/useChapterOutlineGenerator';

// ============================================
// 钩子类型定义
// ============================================

/**
 * 钩子类型
 */
export enum HookType {
  /** 悬念钩子 - 未解之谜 */
  SUSPENSE = 'suspense',
  /** 冲突钩子 - 紧张对峙 */
  CONFLICT = 'conflict',
  /** 情感钩子 - 强烈情感 */
  EMOTION = 'emotion',
  /** 行动钩子 - 动作场面 */
  ACTION = 'action',
  /** 氛围钩子 - 独特氛围 */
  ATMOSPHERE = 'atmosphere',
  /** 意外钩子 - 出人意料 */
  TWIST = 'twist',
  /** 选择钩子 - 艰难抉择 */
  CHOICE = 'choice',
  /** 揭示钩子 - 关键信息 */
  REVELATION = 'revelation',
}

/**
 * 钩子强度
 */
export enum HookStrength {
  WEAK = 'weak',
  MEDIUM = 'medium',
  STRONG = 'strong',
}

/**
 * 钩子条目
 */
export interface HookEntry {
  type: HookType;
  strength: HookStrength;
  position: number; // 在章节中的位置 0-1
  content: string;
  description: string;
}

/**
 * 钩子密度分析结果
 */
export interface HookDensityAnalysis {
  totalHooks: number;
  hookTypes: Record<HookType, number>;
  averageStrength: number; // 0-1
  density: number; // 每千字的钩子数量
  distribution: {
    beginning: number; // 0-0.25
    middle: number; // 0.25-0.75
    end: number; // 0.75-1.0
  };
  strongestSection: {
    position: number;
    hooks: HookEntry[];
  };
  recommendations: string[];
}

// ============================================
// 爽点类型定义
// ============================================

/**
 * 爽点类型
 */
export enum CoolPointType {
  /** 战斗爽 - 战胜强敌 */
  BATTLE = 'battle',
  /** 情感爽 - 感情突破 */
  EMOTIONAL = 'emotional',
  /** 身份爽 - 地位提升 */
  STATUS = 'status',
  /** 揭秘爽 - 真相大白 */
  REVELATION = 'revelation',
  /** 复仇爽 - 讨回公道 */
  REVENGE = 'revenge',
  /** 收获爽 - 获得宝物 */
  GAIN = 'gain',
  /** 碾压爽 - 实力展示 */
  OVERWHELMING = 'overwhelming',
  /** 打脸爽 - 反击嘲讽 */
  SLAP_FACE = 'slap_face',
}

/**
 * 爽点强度
 */
export enum CoolPointStrength {
  MICRO = 'micro', // 微爽
  SMALL = 'small', // 小爽
  MEDIUM = 'medium', // 中爽
  LARGE = 'large', // 大爽
  CLIMAX = 'climax', // 高潮爽
}

/**
 * 爽点条目
 */
export interface CoolPointEntry {
  type: CoolPointType;
  strength: CoolPointStrength;
  position: number;
  content: string;
  buildupChapters: number; // 铺垫章节数
}

/**
 * 爽点密度分析结果
 */
export interface CoolPointDensityAnalysis {
  totalCoolPoints: number;
  coolPointTypes: Record<CoolPointType, number>;
  averageStrength: number; // 0-1
  density: number; // 每千字的爽点数量
  distribution: {
    beginning: number;
    middle: number;
    end: number;
  };
  buildupRatio: number; // 铺垫爽比
  climaxChapters: number;
  recommendations: string[];
}

// ============================================
// 节奏评估
// ============================================

/**
 * 节奏状态
 */
export enum PacingState {
  TOO_SLOW = 'too_slow',
  SLOW = 'slow',
  NORMAL = 'normal',
  FAST = 'fast',
  TOO_FAST = 'too_fast',
}

/**
 * 节奏分析结果
 */
export interface PacingAnalysis {
  state: PacingState;
  score: number; // 0-100
  conflictDensity: number;
  dialogueRatio: number;
  actionRatio: number;
  descriptionRatio: number;
  issues: string[];
  suggestions: string[];
}

// ============================================
// 追读力综合评估
// ============================================

/**
 * 追读力评分
 */
export interface ReadingRetentionScore {
  overallScore: number; // 0-100
  hookScore: number;
  coolPointScore: number;
  pacingScore: number;
  grades: {
    hookGrade: 'A' | 'B' | 'C' | 'D' | 'F';
    coolPointGrade: 'A' | 'B' | 'C' | 'D' | 'F';
    pacingGrade: 'A' | 'B' | 'C' | 'D' | 'F';
    overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  };
  retentionPrediction: {
    score: number; // 预估留存率 0-1
    description: string;
  };
  detailedAnalysis: {
    hookAnalysis: HookDensityAnalysis;
    coolPointAnalysis: CoolPointDensityAnalysis;
    pacingAnalysis: PacingAnalysis;
  };
  recommendations: string[];
}

/**
 * 章节追读力分析结果
 */
export interface ChapterRetentionAnalysis {
  chapterIndex: number;
  chapterTitle: string;
  wordCount: number;
  score: ReadingRetentionScore;
  createdAt: Date;
}

// ============================================
// 追读力分析器
// ============================================

/**
 * 追读力分析器
 * 分析章节的追读力指标
 */
export class RetentionAnalyzer {
  /**
   * 分析章节追读力
   */
  analyzeChapter(chapter: GeneratedChapter, content?: string): ChapterRetentionAnalysis {
    // 提取钩子
    const hooks = this.extractHooks(chapter, content);
    
    // 提取爽点
    const coolPoints = this.extractCoolPoints(chapter, content);

    // 分析钩子密度
    const hookAnalysis = this.analyzeHookDensity(hooks, chapter);

    // 分析爽点密度
    const coolPointAnalysis = this.analyzeCoolPointDensity(coolPoints, chapter);

    // 分析节奏
    const pacingAnalysis = this.analyzePacing(chapter, content);

    // 计算追读力评分
    const score = this.calculateRetentionScore(hookAnalysis, coolPointAnalysis, pacingAnalysis);

    return {
      chapterIndex: chapter.orderIndex,
      chapterTitle: chapter.title,
      wordCount: chapter.outline.length * 10, // 估算
      score,
      createdAt: new Date(),
    };
  }

  /**
   * 提取钩子
   */
  private extractHooks(chapter: GeneratedChapter, content?: string): HookEntry[] {
    const hooks: HookEntry[] = [];

    // 从章节结构中提取钩子
    if (chapter.CBN) {
      hooks.push({
        type: HookType.SUSPENSE,
        strength: HookStrength.MEDIUM,
        position: 0,
        content: chapter.CBN,
        description: '章节起点钩子',
      });
    }

    if (chapter.CPNs && chapter.CPNs.length > 0) {
      chapter.CPNs.forEach((cpn, index) => {
        hooks.push({
          type: HookType.CONFLICT,
          strength: index === 0 ? HookStrength.STRONG : HookStrength.MEDIUM,
          position: (index + 1) / (chapter.CPNs!.length + 1),
          content: cpn,
          description: '推进节点钩子',
        });
      });
    }

    // 从章首/章尾钩子提取
    if ((chapter as any).openingHook) {
      hooks.push({
        type: this.getHookTypeFromString((chapter as any).openingHook.type),
        strength: HookStrength.MEDIUM,
        position: 0.05,
        content: (chapter as any).openingHook.content,
        description: (chapter as any).openingHook.description,
      });
    }

    if ((chapter as any).endingHook) {
      hooks.push({
        type: this.getHookTypeFromString((chapter as any).endingHook.type),
        strength: this.getStrengthFromString((chapter as any).endingHook.tension),
        position: 0.95,
        content: (chapter as any).endingHook.content,
        description: (chapter as any).endingHook.description,
      });
    }

    // 估算内容中的钩子（如果提供了内容）
    if (content) {
      const contentHooks = this.extractHooksFromContent(content);
      hooks.push(...contentHooks);
    }

    return hooks;
  }

  /**
   * 从内容中提取钩子
   */
  private extractHooksFromContent(content: string): HookEntry[] {
    const hooks: HookEntry[] = [];
    const paragraphs = content.split('\n\n');
    
    // 简化的钩子检测模式
    const hookPatterns = [
      { pattern: /突然|没想到|万万没想到|出人意料/, type: HookType.TWIST },
      { pattern: /就在此时|就在这千钧一发之际|危机/, type: HookType.CONFLICT },
      { pattern: /就在这时|忽然|猛然/, type: HookType.ACTION },
      { pattern: /他（她）竟然是|原来|真相是/, type: HookType.REVELATION },
      { pattern: /她（他）会怎么选择|最终/, type: HookType.CHOICE },
    ];

    paragraphs.forEach((para, index) => {
      const position = index / paragraphs.length;
      for (const { pattern, type } of hookPatterns) {
        if (pattern.test(para)) {
          hooks.push({
            type,
            strength: HookStrength.MEDIUM,
            position,
            content: para.slice(0, 50),
            description: `段落 ${index + 1} 中的${type}钩子`,
          });
          break;
        }
      }
    });

    return hooks;
  }

  /**
   * 提取爽点
   */
  private extractCoolPoints(chapter: GeneratedChapter, content?: string): CoolPointEntry[] {
    const coolPoints: CoolPointEntry[] = [];

    // 从章节信息中提取爽点
    if ((chapter as any).coolPoint) {
      const cp = (chapter as any).coolPoint;
      coolPoints.push({
        type: this.getCoolPointTypeFromString(cp.coolPointType),
        strength: cp.isClimax ? CoolPointStrength.CLIMAX : CoolPointStrength.MICRO,
        position: 0.7, // 通常在中后期
        content: cp.microCoolPoint,
        buildupChapters: 3, // 估算
      });
    }

    // 从关键事件提取爽点
    for (const event of chapter.keyEvents) {
      const cpType = this.inferCoolPointType(event);
      if (cpType) {
        coolPoints.push({
          type: cpType,
          strength: CoolPointStrength.SMALL,
          position: 0.6,
          content: event,
          buildupChapters: 2,
        });
      }
    }

    // 估算内容中的爽点
    if (content) {
      const contentCoolPoints = this.extractCoolPointsFromContent(content);
      coolPoints.push(...contentCoolPoints);
    }

    return coolPoints;
  }

  /**
   * 从内容中提取爽点
   */
  private extractCoolPointsFromContent(content: string): CoolPointEntry[] {
    const coolPoints: CoolPointEntry[] = [];
    const paragraphs = content.split('\n\n');

    const coolPointPatterns = [
      { pattern: /战胜|击败|打败/, type: CoolPointType.BATTLE },
      { pattern: /表白|亲吻|拥抱|原谅|和解/, type: CoolPointType.EMOTIONAL },
      { pattern: /升职|夺冠|获得认可|地位提升/, type: CoolPointType.STATUS },
      { pattern: /真相大白|揭开|揭秘/, type: CoolPointType.REVELATION },
      { pattern: /复仇|讨回公道|一雪前耻/, type: CoolPointType.REVENGE },
      { pattern: /获得|收获|得到/, type: CoolPointType.GAIN },
      { pattern: /碾压|秒杀|完胜/, type: CoolPointType.OVERWHELMING },
      { pattern: /打脸|狠狠教训|当众出丑/, type: CoolPointType.SLAP_FACE },
    ];

    paragraphs.forEach((para, index) => {
      const position = index / paragraphs.length;
      for (const { pattern, type } of coolPointPatterns) {
        if (pattern.test(para)) {
          coolPoints.push({
            type,
            strength: CoolPointStrength.SMALL,
            position,
            content: para.slice(0, 50),
            buildupChapters: 2,
          });
          break;
        }
      }
    });

    return coolPoints;
  }

  /**
   * 分析钩子密度
   */
  private analyzeHookDensity(hooks: HookEntry[], chapter: GeneratedChapter): HookDensityAnalysis {
    const wordCount = chapter.outline.length * 10; // 估算
    
    // 统计钩子类型
    const hookTypes: Record<HookType, number> = {
      [HookType.SUSPENSE]: 0,
      [HookType.CONFLICT]: 0,
      [HookType.EMOTION]: 0,
      [HookType.ACTION]: 0,
      [HookType.ATMOSPHERE]: 0,
      [HookType.TWIST]: 0,
      [HookType.CHOICE]: 0,
      [HookType.REVELATION]: 0,
    };

    let totalStrength = 0;
    const distribution = { beginning: 0, middle: 0, end: 0 };

    for (const hook of hooks) {
      hookTypes[hook.type]++;
      totalStrength += this.getStrengthValue(hook.strength);

      if (hook.position <= 0.25) distribution.beginning++;
      else if (hook.position <= 0.75) distribution.middle++;
      else distribution.end++;
    }

    const density = wordCount > 0 ? (hooks.length / wordCount) * 1000 : 0;
    const averageStrength = hooks.length > 0 ? totalStrength / hooks.length : 0;

    // 找出最强章节段
    const strongestSection = this.findStrongestSection(hooks);

    // 生成建议
    const recommendations: string[] = [];
    if (distribution.beginning < 1) {
      recommendations.push('章首钩子较弱，建议增加悬念或冲突开篇');
    }
    if (distribution.end < 1) {
      recommendations.push('章尾钩子较弱，建议增加选择困境或意外转折');
    }
    if (hooks.length < 3) {
      recommendations.push('整体钩子密度偏低，建议增加更多悬念点');
    }

    return {
      totalHooks: hooks.length,
      hookTypes,
      averageStrength,
      density,
      distribution,
      strongestSection,
      recommendations,
    };
  }

  /**
   * 分析爽点密度
   */
  private analyzeCoolPointDensity(coolPoints: CoolPointEntry[], chapter: GeneratedChapter): CoolPointDensityAnalysis {
    const wordCount = chapter.outline.length * 10;

    const coolPointTypes: Record<CoolPointType, number> = {
      [CoolPointType.BATTLE]: 0,
      [CoolPointType.EMOTIONAL]: 0,
      [CoolPointType.STATUS]: 0,
      [CoolPointType.REVELATION]: 0,
      [CoolPointType.REVENGE]: 0,
      [CoolPointType.GAIN]: 0,
      [CoolPointType.OVERWHELMING]: 0,
      [CoolPointType.SLAP_FACE]: 0,
    };

    let totalStrength = 0;
    const distribution = { beginning: 0, middle: 0, end: 0 };
    let climaxCount = 0;

    for (const cp of coolPoints) {
      coolPointTypes[cp.type]++;
      totalStrength += this.getCoolPointStrengthValue(cp.strength);

      if (cp.position <= 0.25) distribution.beginning++;
      else if (cp.position <= 0.75) distribution.middle++;
      else distribution.end++;

      if (cp.strength === CoolPointStrength.CLIMAX) climaxCount++;
    }

    const density = wordCount > 0 ? (coolPoints.length / wordCount) * 1000 : 0;
    const averageStrength = coolPoints.length > 0 ? totalStrength / coolPoints.length : 0;

    // 计算铺垫爽比
    const buildupRatio = this.calculateBuildupRatio(coolPoints);

    const recommendations: string[] = [];
    if (distribution.end === 0) {
      recommendations.push('建议在章尾设置一个爽点作为结尾');
    }
    if (coolPoints.length < 2) {
      recommendations.push('爽点密度偏低，建议增加微爽点');
    }

    return {
      totalCoolPoints: coolPoints.length,
      coolPointTypes,
      averageStrength,
      density,
      distribution,
      buildupRatio,
      climaxChapters: climaxCount,
      recommendations,
    };
  }

  /**
   * 分析节奏
   */
  private analyzePacing(chapter: GeneratedChapter, content?: string): PacingAnalysis {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // 基础评估
    let state = PacingState.NORMAL;
    let score = 70;

    // 检查章节结构
    if (!chapter.CBN || !chapter.CEN) {
      issues.push('缺少结构化节点');
      score -= 10;
    }

    if (chapter.CPNs && chapter.CPNs.length < 2) {
      issues.push('推进节点不足');
      score -= 5;
    }

    // 估算内容比例（如果有内容）
    if (content) {
      const wordCount = content.length;
      const dialogueRatio = (content.match(/["""''「」『』]/g)?.length || 0) / wordCount;
      const actionRatio = (content.match(/[跑跳打杀冲飞]/g)?.length || 0) / wordCount;

      if (dialogueRatio > 0.5) {
        issues.push('对话比例过高，节奏偏慢');
        state = PacingState.SLOW;
        score -= 10;
      }

      if (actionRatio < 0.02) {
        issues.push('动作描写偏少');
        suggestions.push('增加一些动作场面来提升节奏');
      }
    }

    // 根据问题调整状态
    if (score < 50) state = PacingState.TOO_SLOW;
    else if (score < 60) state = PacingState.SLOW;
    else if (score > 85) state = PacingState.FAST;
    else if (score > 95) state = PacingState.TOO_FAST;

    return {
      state,
      score,
      conflictDensity: chapter.CPNs?.length || 0,
      dialogueRatio: 0.3, // 估算
      actionRatio: 0.1, // 估算
      descriptionRatio: 0.6, // 估算
      issues,
      suggestions,
    };
  }

  /**
   * 计算追读力评分
   */
  private calculateRetentionScore(
    hookAnalysis: HookDensityAnalysis,
    coolPointAnalysis: CoolPointDensityAnalysis,
    pacingAnalysis: PacingAnalysis
  ): ReadingRetentionScore {
    // 计算各项分数 (0-100)
    const hookScore = Math.min(100, hookAnalysis.totalHooks * 20 + hookAnalysis.averageStrength * 40);
    const coolPointScore = Math.min(100, coolPointAnalysis.totalCoolPoints * 15 + coolPointAnalysis.averageStrength * 50);
    const pacingScore = pacingAnalysis.score;

    // 综合分数（加权平均）
    const overallScore = Math.round(hookScore * 0.35 + coolPointScore * 0.35 + pacingScore * 0.3);

    // 计算等级
    const getGrade = (score: number): 'A' | 'B' | 'C' | 'D' | 'F' => {
      if (score >= 90) return 'A';
      if (score >= 80) return 'B';
      if (score >= 70) return 'C';
      if (score >= 60) return 'D';
      return 'F';
    };

    // 预估留存率
    const retentionPrediction = {
      score: overallScore / 100,
      description: this.getRetentionDescription(overallScore),
    };

    // 生成建议
    const recommendations: string[] = [];
    recommendations.push(...hookAnalysis.recommendations);
    recommendations.push(...coolPointAnalysis.recommendations);
    recommendations.push(...pacingAnalysis.suggestions);

    return {
      overallScore,
      hookScore: Math.round(hookScore),
      coolPointScore: Math.round(coolPointScore),
      pacingScore: Math.round(pacingScore),
      grades: {
        hookGrade: getGrade(hookScore),
        coolPointGrade: getGrade(coolPointScore),
        pacingGrade: getGrade(pacingScore),
        overallGrade: getGrade(overallScore),
      },
      retentionPrediction,
      detailedAnalysis: {
        hookAnalysis,
        coolPointAnalysis,
        pacingAnalysis,
      },
      recommendations,
    };
  }

  /**
   * 找出最强章节段
   */
  private findStrongestSection(hooks: HookEntry[]): { position: number; hooks: HookEntry[] } {
    if (hooks.length === 0) {
      return { position: 0, hooks: [] };
    }

    // 按位置分组
    const sections = [
      { position: 0.125, hooks: hooks.filter(h => h.position <= 0.25) },
      { position: 0.5, hooks: hooks.filter(h => h.position > 0.25 && h.position <= 0.75) },
      { position: 0.875, hooks: hooks.filter(h => h.position > 0.75) },
    ];

    let strongest = sections[0];
    let maxStrength = 0;

    for (const section of sections) {
      const strength = section.hooks.reduce((sum, h) => sum + this.getStrengthValue(h.strength), 0);
      if (strength > maxStrength) {
        maxStrength = strength;
        strongest = section;
      }
    }

    return strongest;
  }

  /**
   * 计算铺垫爽比
   */
  private calculateBuildupRatio(coolPoints: CoolPointEntry[]): number {
    if (coolPoints.length === 0) return 0;

    const totalBuildup = coolPoints.reduce((sum, cp) => sum + cp.buildupChapters, 0);
    return totalBuildup / coolPoints.length;
  }

  /**
   * 获取钩子类型
   */
  private getHookTypeFromString(type: string): HookType {
    const typeMap: Record<string, HookType> = {
      '悬念钩子': HookType.SUSPENSE,
      '冲突钩子': HookType.CONFLICT,
      '情感钩子': HookType.EMOTION,
      '行动钩子': HookType.ACTION,
      '氛围钩子': HookType.ATMOSPHERE,
      '意外转折': HookType.TWIST,
      '选择困境': HookType.CHOICE,
      '重大揭示': HookType.REVELATION,
    };
    return typeMap[type] || HookType.SUSPENSE;
  }

  /**
   * 获取钩子强度
   */
  private getStrengthFromString(strength: string): HookStrength {
    const strengthMap: Record<string, HookStrength> = {
      'strong': HookStrength.STRONG,
      'medium': HookStrength.MEDIUM,
      'weak': HookStrength.WEAK,
    };
    return strengthMap[strength] || HookStrength.MEDIUM;
  }

  /**
   * 获取爽点类型
   */
  private getCoolPointTypeFromString(type: string): CoolPointType {
    const typeMap: Record<string, CoolPointType> = {
      'battle': CoolPointType.BATTLE,
      'emotional': CoolPointType.EMOTIONAL,
      'status': CoolPointType.STATUS,
      'revelation': CoolPointType.REVELATION,
      'revenge': CoolPointType.REVENGE,
    };
    return typeMap[type] || CoolPointType.BATTLE;
  }

  /**
   * 推断爽点类型
   */
  private inferCoolPointType(event: string): CoolPointType | null {
    const lowerEvent = event.toLowerCase();
    
    if (/战胜|击败|打败|击退/.test(lowerEvent)) return CoolPointType.BATTLE;
    if (/表白|亲吻|和好|原谅/.test(lowerEvent)) return CoolPointType.EMOTIONAL;
    if (/升职|夺冠|获得/.test(lowerEvent)) return CoolPointType.STATUS;
    if (/真相|揭秘|揭开/.test(lowerEvent)) return CoolPointType.REVELATION;
    if (/复仇|讨回|一雪/.test(lowerEvent)) return CoolPointType.REVENGE;
    
    return null;
  }

  /**
   * 获取强度值
   */
  private getStrengthValue(strength: HookStrength): number {
    const values: Record<HookStrength, number> = {
      [HookStrength.WEAK]: 0.3,
      [HookStrength.MEDIUM]: 0.6,
      [HookStrength.STRONG]: 1.0,
    };
    return values[strength];
  }

  /**
   * 获取爽点强度值
   */
  private getCoolPointStrengthValue(strength: CoolPointStrength): number {
    const values: Record<CoolPointStrength, number> = {
      [CoolPointStrength.MICRO]: 0.2,
      [CoolPointStrength.SMALL]: 0.4,
      [CoolPointStrength.MEDIUM]: 0.6,
      [CoolPointStrength.LARGE]: 0.8,
      [CoolPointStrength.CLIMAX]: 1.0,
    };
    return values[strength];
  }

  /**
   * 获取留存描述
   */
  private getRetentionDescription(score: number): string {
    if (score >= 90) return '优秀 - 预计读者留存率极高';
    if (score >= 80) return '良好 - 预计读者留存率较高';
    if (score >= 70) return '中等 - 预计读者留存率一般';
    if (score >= 60) return '及格 - 预计部分读者可能流失';
    return '需改进 - 预计读者流失风险较高';
  }
}

// ============================================
// 单例导出
// ============================================

let analyzer: RetentionAnalyzer | null = null;

/**
 * 获取追读力分析器
 */
export function getRetentionAnalyzer(): RetentionAnalyzer {
  if (!analyzer) {
    analyzer = new RetentionAnalyzer();
  }
  return analyzer;
}

/**
 * 分析章节追读力
 */
export function analyzeChapterRetention(chapter: GeneratedChapter, content?: string): ChapterRetentionAnalysis {
  return getRetentionAnalyzer().analyzeChapter(chapter, content);
}

/**
 * 批量分析章节追读力
 */
export function analyzeMultipleChapters(
  chapters: GeneratedChapter[],
  contents?: Map<string, string>
): ChapterRetentionAnalysis[] {
  return chapters.map(chapter => 
    analyzeChapterRetention(chapter, contents?.get(chapter.orderIndex.toString()))
  );
}

/**
 * 去AI味服务 v2
 * Moliu v2.0 - 基于 useAntiAI composable 的去AI味服务
 * 
 * 核心思路：改变"风味"而非修改"错误"
 * AI味本质：过度工整、过度解释、缺乏生活感
 */

import { useAntiAI } from "@/composables/new/useAntiAI";
import { BANNED_WORDS } from "@/data/banned-words";

// ============================================================
// Types
// ============================================================

export interface AntiAIDetectionResult {
  /** AI味等级：none/mild/moderate/severe */
  level: "none" | "mild" | "moderate" | "severe";
  /** 总评分 0-100 */
  score: number;
  /** 主要问题类型统计 */
  issueStats: {
    bannedWords: number;
    aiPatterns: number;
    overExplanation: number;
    uniformRhythm: number;
    hedging: number;
    listFormat: number;
  };
  /** 具体问题列表 */
  issues: {
    type: string;
    severity: "low" | "medium" | "high";
    position: string;
    original: string;
    suggestion: string;
  }[];
  /** 改进建议 */
  suggestions: string[];
}

export interface AntiAIFixResult {
  /** 修复后的内容 */
  content: string;
  /** 提取的章节标题（如果有） */
  title?: string | null;
  /** 修复的问题数量 */
  fixedCount: number;
  /** 修复详情 */
  fixes: {
    original: string;
    replacement: string;
    reason: string;
  }[];
  /** AI味等级变化 */
  levelChange: {
    before: string;
    after: string;
    improvement: number;
  };
}

export interface AntiAIConfig {
  /** 是否检测禁用词 */
  checkBannedWords: boolean;
  /** 是否检测AI模式 */
  checkAIPatterns: boolean;
  /** 是否优化过渡句 */
  optimizeTransitions: boolean;
  /** 是否修复过度解释 */
  fixOverExplanation: boolean;
  /** 是否统一节奏 */
  uniformRhythm: boolean;
  /** 强度级别: gentle/moderate/aggressive */
  intensity: "gentle" | "moderate" | "aggressive";
}

// ============================================================
// Service
// ============================================================

export class AntiAIServiceV2 {
  private antiAI: ReturnType<typeof useAntiAI>;
  private config: AntiAIConfig;

  constructor(config?: Partial<AntiAIConfig>) {
    this.antiAI = useAntiAI();
    this.config = {
      checkBannedWords: true,
      checkAIPatterns: true,
      optimizeTransitions: true,
      fixOverExplanation: true,
      uniformRhythm: true,
      intensity: "moderate",
      ...config,
    };
  }

  /**
   * 检测文本的AI味
   */
  async detect(text: string): Promise<AntiAIDetectionResult> {
    // 使用 composable 分析
    const analysis = this.antiAI.analyzeContent(text);

    // 统计禁用词
    let bannedWordsCount = 0;
    const bannedWordIssues: AntiAIDetectionResult["issues"] = [];

    if (this.config.checkBannedWords) {
      for (const word of BANNED_WORDS) {
        const regex = new RegExp(word.word, "gi");
        const matches = text.match(regex);
        if (matches) {
          bannedWordsCount++;
          bannedWordIssues.push({
            type: "banned_word",
            severity: word.category === "politics" ? "high" : "medium",
            position: `全文出现 ${matches.length} 次`,
            original: word.word,
            suggestion: word.suggestion || `建议替换"${word.word}"为更自然的表达`,
          });
        }
      }
    }

    // 统计AI模式
    let aiPatternsCount = 0;
    const aiPatternIssues: AntiAIDetectionResult["issues"] = [];

    if (this.config.checkAIPatterns) {
      for (const [patternType, info] of Object.entries(analysis.patterns)) {
        if (info.count > 0) {
          aiPatternsCount += info.count;
          aiPatternIssues.push({
            type: patternType,
            severity: this.getSeverityForPattern(patternType),
            position: `全文出现 ${info.count} 次`,
            original: `${info.examples.slice(0, 2).join(", ")}...`,
            suggestion: this.getSuggestionForPattern(patternType),
          });
        }
      }
    }

    // 计算总体评分
    const totalIssues = bannedWordsCount + aiPatternsCount + analysis.issues.length;
    let score = 100;

    if (totalIssues > 50) score = Math.max(0, score - 50);
    else if (totalIssues > 20) score = Math.max(0, score - 30);
    else if (totalIssues > 5) score = Math.max(0, score - 15);
    else if (totalIssues > 0) score = Math.max(0, score - 5);

    // 调整分数：AI分数越高，AI味越重
    const adjustedScore = Math.min(100, score + analysis.aiScore);

    // 确定AI味等级
    const level = this.calculateLevel(adjustedScore, analysis.aiScore);

    const issues = [...bannedWordIssues, ...aiPatternIssues];
    const suggestions = this.generateSuggestions(analysis, bannedWordsCount, aiPatternsCount);

    return {
      level,
      score: Math.round(100 - adjustedScore),
      issueStats: {
        bannedWords: bannedWordsCount,
        aiPatterns: aiPatternsCount,
        overExplanation: analysis.issues.filter(i => i.includes("解释")).length,
        uniformRhythm: analysis.issues.filter(i => i.includes("节奏")).length,
        hedging: analysis.patterns.hedging?.count || 0,
        listFormat: analysis.patterns.listFormat?.count || 0,
      },
      issues,
      suggestions,
    };
  }

  /**
   * 优化文本去AI味
   */
  async optimize(text: string): Promise<AntiAIFixResult> {
    // 先分析
    const detection = await this.detect(text);

    let optimizedText = text;
    const fixes: AntiAIFixResult["fixes"] = [];

    // 1. 优化过渡句
    if (this.config.optimizeTransitions) {
      const optimized = this.antiAI.optimizeTransitions(optimizedText);
      if (optimized !== optimizedText) {
        fixes.push({
          original: "使用机械过渡句",
          replacement: "自然过渡",
          reason: "替换AI惯用过渡句为更自然的表达",
        });
        optimizedText = optimized;
      }
    }

    // 2. 替换AI惯用词
    if (this.config.checkAIPatterns) {
      const optimized = this.antiAI.replaceAIPatterns(optimizedText);
      if (optimized !== optimizedText) {
        fixes.push({
          original: "使用AI惯用表达",
          replacement: "自然表达",
          reason: "替换检测到的AI惯用词",
        });
        optimizedText = optimized;
      }
    }

    // 3. 增加节奏变化
    if (this.config.uniformRhythm) {
      const optimized = this.antiAI.addRhythmVariation(optimizedText);
      if (optimized !== optimizedText) {
        fixes.push({
          original: "节奏过于均匀",
          replacement: "变化节奏",
          reason: "增加句子长短变化，避免机械节奏",
        });
        optimizedText = optimized;
      }
    }

    // 4. 移除过度解释
    if (this.config.fixOverExplanation) {
      const optimized = this.removeOverExplanation(optimizedText);
      if (optimized !== optimizedText) {
        fixes.push({
          original: "过度解释",
          replacement: "简洁表达",
          reason: "移除不必要的解释性文字",
        });
        optimizedText = optimized;
      }
    }

    // 5. 提取标题
    const title = this.extractTitle(optimizedText);

    // 计算修复后等级
    const afterDetection = await this.detect(optimizedText);

    return {
      content: optimizedText,
      title,
      fixedCount: fixes.length,
      fixes,
      levelChange: {
        before: detection.level,
        after: afterDetection.level,
        improvement: detection.score - afterDetection.score,
      },
    };
  }

  /**
   * 批量处理多个文本
   */
  async batchOptimize(texts: string[]): Promise<AntiAIFixResult[]> {
    return Promise.all(texts.map(text => this.optimize(text)));
  }

  /**
   * 获取配置
   */
  getConfig(): AntiAIConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AntiAIConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  private calculateLevel(score: number, aiScore: number): "none" | "mild" | "moderate" | "severe" {
    const effectiveScore = (score + aiScore) / 2;

    if (effectiveScore >= 70) return "severe";
    if (effectiveScore >= 40) return "moderate";
    if (effectiveScore >= 20) return "mild";
    return "none";
  }

  private getSeverityForPattern(pattern: string): "low" | "medium" | "high" {
    const severityMap: Record<string, "low" | "medium" | "high"> = {
      transition: "medium",
      formalPhrase: "low",
      hedging: "low",
      listFormat: "medium",
      firstPerson: "low",
      structural: "high",
    };
    return severityMap[pattern] || "medium";
  }

  private getSuggestionForPattern(pattern: string): string {
    const suggestionMap: Record<string, string> = {
      transition: "使用更自然的过渡方式",
      formalPhrase: "用更口语化的表达替换",
      hedging: "减少模糊表达，直接陈述",
      listFormat: "避免机械列举，用叙述代替",
      firstPerson: "增加叙事距离感",
      structural: "打破过于工整的结构",
    };
    return suggestionMap[pattern] || "优化表达方式";
  }

  private generateSuggestions(
    analysis: ReturnType<typeof useAntiAI>["analyzeContent"],
    bannedWordsCount: number,
    aiPatternsCount: number
  ): string[] {
    const suggestions: string[] = [];

    if (bannedWordsCount > 0) {
      suggestions.push("检测到禁用词，建议替换为更合适的表达");
    }

    if (analysis.patterns.transition?.count && analysis.patterns.transition.count > 3) {
      suggestions.push("过渡句使用过于频繁，建议使用更自然的叙事转折");
    }

    if (analysis.patterns.formalPhrase?.count && analysis.patterns.formalPhrase.count > 5) {
      suggestions.push("使用了较多书面语表达，可适当加入口语化表达增加生活感");
    }

    if (analysis.patterns.hedging?.count && analysis.patterns.hedging.count > 3) {
      suggestions.push("存在较多模糊表达，建议更直接地陈述事实");
    }

    if (analysis.patterns.listFormat?.count && analysis.patterns.listFormat.count > 2) {
      suggestions.push("检测到机械列举，建议用叙述性语言替代");
    }

    if (analysis.patterns.structural?.count && analysis.patterns.structural.count > 2) {
      suggestions.push("段落结构过于规整，建议增加变化");
    }

    if (suggestions.length === 0) {
      suggestions.push("整体表达较为自然，可适当调整节奏");
    }

    return suggestions;
  }

  private removeOverExplanation(text: string): string {
    // 移除常见的过度解释模式
    const patterns = [
      /\(他\/她\)\s*/g, // 移除动作解释括号
      /（他\/她）\s*/g,
      /解释道：/g,
      /解释道，/g,
      /解释道。/g,
      /补充道：/g,
      /说明道：/g,
    ];

    let result = text;
    for (const pattern of patterns) {
      result = result.replace(pattern, "");
    }

    // 简化"这是因为"等解释性表达
    result = result.replace(/这是因为/g, "因为");
    result = result.replace(/也就是说/g, "即");

    return result;
  }

  private extractTitle(text: string): string | null {
    // 尝试从文本中提取章节标题
    const lines = text.split("\n").filter(l => l.trim());

    // 常见标题模式
    const patterns = [
      /第[一二三四五六七八九十百千万\d]+章[：:]\s*(.+)/,
      /Chapter\s*\d+[：:]\s*(.+)/,
      /^#\s*(.+)/,
      /^(【[^】]+】)/,
    ];

    for (const line of lines.slice(0, 10)) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          return match[1].trim();
        }
      }
    }

    return null;
  }
}

// ============================================================
// Export singleton factory
// ============================================================

let antiAIServiceInstance: AntiAIServiceV2 | null = null;

export function createAntiAIService(config?: Partial<AntiAIConfig>): AntiAIServiceV2 {
  if (!antiAIServiceInstance) {
    antiAIServiceInstance = new AntiAIServiceV2(config);
  }
  return antiAIServiceInstance;
}

export function getAntiAIService(): AntiAIServiceV2 {
  return createAntiAIService();
}

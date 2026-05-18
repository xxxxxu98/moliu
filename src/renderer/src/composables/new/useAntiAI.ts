/**
 * 去AI味处理器
 * 基于 webnovel-writer-master 的AI内容优化系统
 * 
 * 去AI味处理器负责：
 * - 检测AI写作特征
 * - 优化内容去除AI痕迹
 * - 提供写作风格建议
 */

import { ref, computed } from 'vue';

// ============================================================
// 类型定义
// ============================================================

export interface AntiAIConfig {
  // 检测设置
  checkFirstPerson: boolean;
  checkTransitions: boolean;
  checkListPatterns: boolean;
  checkHedging: boolean;
  checkFormalPhrases: boolean;
  // 优化设置
  replaceFirstPerson: boolean;
  enhanceTransitions: boolean;
  breakListPatterns: boolean;
  removeHedging: boolean;
  simplifyFormal: boolean;
  // 阈值
  aiDetectionThreshold: number;
}

export interface AIAnalysisResult {
  isSuspicious: boolean;
  confidence: number; // 0-100
  patterns: AIPattern[];
  suggestions: string[];
  score: number;
}

export interface AIPattern {
  type: AIPatternType;
  description: string;
  matches: AIPatternMatch[];
  severity: 'low' | 'medium' | 'high';
}

export type AIPatternType = 
  | 'first_person'
  | 'transition'
  | 'list_format'
  | 'hedging'
  | 'formal_phrase'
  | 'repetition'
  | 'structure';

export interface AIPatternMatch {
  text: string;
  position: number;
  line: number;
  suggestion?: string;
}

export interface OptimizationResult {
  original: string;
  optimized: string;
  changes: OptimizationChange[];
  estimatedAIConfidence: number;
}

export interface OptimizationChange {
  type: string;
  original: string;
  replacement: string;
  reason: string;
  line: number;
}

// ============================================================
// 默认配置
// ============================================================

const DEFAULT_PATTERNS = {
  // 过渡词
  transitions: [
    '首先', '其次', '最后',
    '首先需要', '其次要', '最后要',
    '第一', '第二', '第三',
    '一方面', '另一方面',
    '综上所述', '总的来说',
    '值得注意的是', '尤其重要的是',
    '一般来说', '通常情况下',
  ],
  
  // 正式短语
  formalPhrases: [
    '从...角度来看',
    '从这个意义上说',
    '就...而言',
    '在...方面',
    '就...而言',
    '对于...来说',
    '通过...可以发现',
    '研究表明',
    '实践证明',
    '不难发现',
  ],
  
  // 模糊词
  hedgingWords: [
    '可能', '也许', '大概',
    '似乎', '好像', '仿佛',
    '基本上', '大体上',
    '通常', '往往',
    '在一定程度上',
    '相对而言',
  ],
  
  // 列表格式关键词
  listKeywords: [
    '有以下几点',
    '主要包括',
    '具体如下',
    '包括以下几个方面',
    '有以下特征',
  ],
  
  // 第一人称
  firstPersonPatterns: [
    '我认为', '我觉得',
    '在我看来',
    '我的看法是',
    '我相信',
  ],
};

// ============================================================
// Composable 定义
// ============================================================

export function useAntiAI() {
  // 配置
  const config = ref<AntiAIConfig>({
    checkFirstPerson: true,
    checkTransitions: true,
    checkListPatterns: true,
    checkHedging: true,
    checkFormalPhrases: true,
    replaceFirstPerson: true,
    enhanceTransitions: true,
    breakListPatterns: true,
    removeHedging: true,
    simplifyFormal: true,
    aiDetectionThreshold: 50,
  });

  // 状态
  const isAnalyzing = ref(false);
  const lastResult = ref<AIAnalysisResult | null>(null);

  // ============================================================
  // AI 分析
  // ============================================================

  /**
   * 分析内容是否为AI生成
   */
  function analyze(content: string): AIAnalysisResult {
    isAnalyzing.value = true;

    const patterns: AIPattern[] = [];
    const suggestions: string[] = [];
    let totalSeverity = 0;

    // 检查过渡词
    if (config.value.checkTransitions) {
      const transitionPattern = detectTransitionPattern(content);
      if (transitionPattern) {
        patterns.push(transitionPattern);
        totalSeverity += getSeverityScore(transitionPattern.severity);
      }
    }

    // 检查正式短语
    if (config.value.checkFormalPhrases) {
      const formalPattern = detectFormalPhrases(content);
      if (formalPattern) {
        patterns.push(formalPattern);
        totalSeverity += getSeverityScore(formalPattern.severity);
      }
    }

    // 检查模糊词
    if (config.value.checkHedging) {
      const hedgingPattern = detectHedging(content);
      if (hedgingPattern) {
        patterns.push(hedgingPattern);
        totalSeverity += getSeverityScore(hedgingPattern.severity);
      }
    }

    // 检查列表格式
    if (config.value.checkListPatterns) {
      const listPattern = detectListPattern(content);
      if (listPattern) {
        patterns.push(listPattern);
        totalSeverity += getSeverityScore(listPattern.severity);
      }
    }

    // 检查第一人称
    if (config.value.checkFirstPerson) {
      const firstPersonPattern = detectFirstPersonPattern(content);
      if (firstPersonPattern) {
        patterns.push(firstPersonPattern);
        totalSeverity += getSeverityScore(firstPersonPattern.severity);
      }
    }

    // 检查结构特征
    const structurePattern = detectStructurePattern(content);
    if (structurePattern) {
      patterns.push(structurePattern);
      totalSeverity += getSeverityScore(structurePattern.severity);
    }

    // 生成建议
    for (const pattern of patterns) {
      if (pattern.severity === 'high') {
        suggestions.push(...getSuggestionsForPattern(pattern.type));
      }
    }

    // 计算置信度
    const confidence = Math.min(100, Math.round(totalSeverity / patterns.length * 10));
    const isSuspicious = confidence >= config.value.aiDetectionThreshold;

    const result: AIAnalysisResult = {
      isSuspicious,
      confidence,
      patterns,
      suggestions,
      score: Math.max(0, 100 - confidence),
    };

    lastResult.value = result;
    isAnalyzing.value = false;

    return result;
  }

  // ============================================================
  // 模式检测
  // ============================================================

  function detectTransitionPattern(content: string): AIPattern | null {
    const matches: AIPatternMatch[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const transition of DEFAULT_PATTERNS.transitions) {
        if (line.includes(transition)) {
          matches.push({
            text: line.trim(),
            position: line.indexOf(transition),
            line: i + 1,
            suggestion: `考虑使用更自然的过渡方式`,
          });
          break;
        }
      }
    }

    if (matches.length >= 3) {
      return {
        type: 'transition',
        description: `检测到${matches.length}处AI风格的过渡词`,
        matches,
        severity: matches.length >= 5 ? 'high' : 'medium',
      };
    }

    return null;
  }

  function detectFormalPhrases(content: string): AIPattern | null {
    const matches: AIPatternMatch[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const phrase of DEFAULT_PATTERNS.formalPhrases) {
        if (line.includes(phrase)) {
          matches.push({
            text: phrase,
            position: line.indexOf(phrase),
            line: i + 1,
            suggestion: `考虑使用更口语化的表达`,
          });
          break;
        }
      }
    }

    if (matches.length >= 2) {
      return {
        type: 'formal_phrase',
        description: `检测到${matches.length}处过于正式的表达`,
        matches,
        severity: matches.length >= 4 ? 'high' : 'medium',
      };
    }

    return null;
  }

  function detectHedging(content: string): AIPattern | null {
    const matches: AIPatternMatch[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const word of DEFAULT_PATTERNS.hedgingWords) {
        if (line.includes(word)) {
          matches.push({
            text: word,
            position: line.indexOf(word),
            line: i + 1,
            suggestion: `考虑使用更确定的表达`,
          });
          break;
        }
      }
    }

    if (matches.length >= 5) {
      return {
        type: 'hedging',
        description: `检测到${matches.length}处模糊表达`,
        matches,
        severity: matches.length >= 8 ? 'high' : 'medium',
      };
    }

    return null;
  }

  function detectListPattern(content: string): AIPattern | null {
    const matches: AIPatternMatch[] = [];
    const lines = content.split('\n');

    let inList = false;
    let listStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isListItem = /^[①②③④]|^[0-9]+[.、，]/.test(line.trim());

      if (!inList && isListItem) {
        inList = true;
        listStart = i;
        matches.push({
          text: line.trim(),
          position: 0,
          line: i + 1,
        });
      } else if (inList && isListItem) {
        matches.push({
          text: line.trim(),
          position: 0,
          line: i + 1,
        });
      } else if (inList && !isListItem) {
        inList = false;
      }
    }

    if (matches.length >= 3) {
      return {
        type: 'list_format',
        description: `检测到${matches.length}处列表格式`,
        matches,
        severity: matches.length >= 5 ? 'high' : 'medium',
      };
    }

    return null;
  }

  function detectFirstPersonPattern(content: string): AIPattern | null {
    const matches: AIPatternMatch[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of DEFAULT_PATTERNS.firstPersonPatterns) {
        if (line.includes(pattern)) {
          matches.push({
            text: pattern,
            position: line.indexOf(pattern),
            line: i + 1,
          });
          break;
        }
      }
    }

    if (matches.length >= 3) {
      return {
        type: 'first_person',
        description: `检测到${matches.length}处第一人称叙述`,
        matches,
        severity: 'low',
      };
    }

    return null;
  }

  function detectStructurePattern(content: string): AIPattern | null {
    const matches: AIPatternMatch[] = [];
    const lines = content.split('\n');

    // 检测过于规整的段落长度
    const paragraphLengths: number[] = [];
    let currentParaLength = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '') {
        if (currentParaLength > 0) {
          paragraphLengths.push(currentParaLength);
          currentParaLength = 0;
        }
      } else {
        currentParaLength += line.length;
      }
    }

    if (paragraphLengths.length > 3) {
      // 检查长度是否过于一致
      const avg = paragraphLengths.reduce((a, b) => a + b, 0) / paragraphLengths.length;
      const variance = paragraphLengths.reduce((sum, len) => 
        sum + Math.pow(len - avg, 2), 0) / paragraphLengths.length;
      
      if (variance < 100) { // 方差太小
        matches.push({
          text: '段落长度过于一致',
          position: 0,
          line: 0,
          suggestion: '考虑让段落长度更有变化',
        });
      }
    }

    if (matches.length > 0) {
      return {
        type: 'structure',
        description: '检测到过于规整的文章结构',
        matches,
        severity: 'medium',
      };
    }

    return null;
  }

  // ============================================================
  // 内容优化
  // ============================================================

  /**
   * 优化内容去除AI特征
   */
  function optimize(content: string): OptimizationResult {
    let optimized = content;
    const changes: OptimizationChange[] = [];
    const lines = content.split('\n');

    // 替换过渡词
    if (config.value.enhanceTransitions) {
      const transitionReplacements: Record<string, string> = {
        '首先': '一开始',
        '其次': '接着',
        '最后': '之后',
        '第一': '先是',
        '第二': '然后',
        '第三': '再后来',
        '综上所述': '',
        '总的来说': '',
        '值得注意的是': '',
      };

      for (const [from, to] of Object.entries(transitionReplacements)) {
        if (to === '') {
          // 完全删除
          const regex = new RegExp(`[，,]*${from}[，,]*`, 'g');
          const newContent = optimized.replace(regex, ',');
          if (newContent !== optimized) {
            changes.push({
              type: 'transition',
              original: from,
              replacement: '',
              reason: '删除AI风格的过渡词',
              line: findLineNumber(optimized, from),
            });
            optimized = newContent;
          }
        } else {
          const newContent = optimized.replace(new RegExp(from, 'g'), to);
          if (newContent !== optimized) {
            changes.push({
              type: 'transition',
              original: from,
              replacement: to,
              reason: '替换为更自然的表达',
              line: findLineNumber(optimized, from),
            });
            optimized = newContent;
          }
        }
      }
    }

    // 简化正式短语
    if (config.value.simplifyFormal) {
      const formalReplacements: Record<string, string> = {
        '从...角度来看': '看',
        '从这个意义上说': '所以',
        '就...而言': '对',
        '在...方面': '',
        '对于...来说': '',
        '通过...可以发现': '发现',
      };

      for (const [from, to] of Object.entries(formalReplacements)) {
        const newContent = optimized.replace(new RegExp(from.replace(/\.\.\./g, '.*'), 'g'), to);
        if (newContent !== optimized) {
          changes.push({
            type: 'formal_phrase',
            original: from,
            replacement: to,
            reason: '简化为更口语的表达',
            line: findLineNumber(optimized, from.split('...')[0]),
          });
          optimized = newContent;
        }
      }
    }

    // 移除模糊词
    if (config.value.removeHedging) {
      for (const word of DEFAULT_PATTERNS.hedgingWords) {
        const regex = new RegExp(`[,，]*${word}[,，]*`, 'g');
        const newContent = optimized.replace(regex, '');
        if (newContent !== optimized) {
          changes.push({
            type: 'hedging',
            original: word,
            replacement: '',
            reason: '删除不必要的模糊词',
            line: findLineNumber(optimized, word),
          });
          optimized = newContent;
        }
      }
    }

    // 打破列表格式
    if (config.value.breakListPatterns) {
      for (const keyword of DEFAULT_PATTERNS.listKeywords) {
        const newContent = optimized.replace(new RegExp(keyword, 'g'), '');
        if (newContent !== optimized) {
          changes.push({
            type: 'list_format',
            original: keyword,
            replacement: '',
            reason: '删除列表引导词',
            line: findLineNumber(optimized, keyword),
          });
          optimized = newContent;
        }
      }
    }

    // 分析优化后的AI置信度
    const finalAnalysis = analyze(optimized);

    return {
      original: content,
      optimized: optimized.trim(),
      changes,
      estimatedAIConfidence: finalAnalysis.confidence,
    };
  }

  // ============================================================
  // 辅助函数
  // ============================================================

  function getSeverityScore(severity: 'low' | 'medium' | 'high'): number {
    return severity === 'high' ? 30 : severity === 'medium' ? 20 : 10;
  }

  function getSuggestionsForPattern(type: AIPatternType): string[] {
    switch (type) {
      case 'transition':
        return [
          '使用更自然的过渡词，如"接着"、"然后"、"没想到"',
          '用场景描写代替过渡词',
          '用对话或行动推进剧情',
        ];
      case 'formal_phrase':
        return [
          '使用更口语化的表达',
          '减少书面语的使用',
        ];
      case 'hedging':
        return [
          '使用更确定的表达',
          '直接陈述事实或观点',
        ];
      case 'list_format':
        return [
          '将列表改为自然段落叙述',
          '用具体场景代替罗列',
        ];
      case 'first_person':
        return [
          '减少第一人称叙述',
          '使用更客观的第三人称',
        ];
      default:
        return [];
    }
  }

  function findLineNumber(content: string, searchText: string): number {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(searchText)) {
        return i + 1;
      }
    }
    return 0;
  }

  // ============================================================
  // 快速检查
  // ============================================================

  /**
   * 快速检查（简化版）
   */
  function quickCheck(content: string): boolean {
    const analysis = analyze(content);
    return !analysis.isSuspicious;
  }

  /**
   * 获取AI置信度
   */
  function getConfidence(content: string): number {
    const analysis = analyze(content);
    return analysis.confidence;
  }

  // ============================================================
  // 配置
  // ============================================================

  /**
   * 更新配置
   */
  function updateConfig(updates: Partial<AntiAIConfig>): void {
    config.value = { ...config.value, ...updates };
  }

  /**
   * 启用所有检查
   */
  function enableAllChecks(): void {
    config.value.checkFirstPerson = true;
    config.value.checkTransitions = true;
    config.value.checkListPatterns = true;
    config.value.checkHedging = true;
    config.value.checkFormalPhrases = true;
  }

  /**
   * 禁用所有检查
   */
  function disableAllChecks(): void {
    config.value.checkFirstPerson = false;
    config.value.checkTransitions = false;
    config.value.checkListPatterns = false;
    config.value.checkHedging = false;
    config.value.checkFormalPhrases = false;
  }

  // ============================================================
  // 返回
  // ============================================================

  return {
    // 配置
    config,
    updateConfig,
    enableAllChecks,
    disableAllChecks,

    // 状态
    isAnalyzing,
    lastResult,

    // 分析
    analyze,
    quickCheck,
    getConfidence,

    // 优化
    optimize,

    // 辅助
    getSuggestionsForPattern,
  };
}

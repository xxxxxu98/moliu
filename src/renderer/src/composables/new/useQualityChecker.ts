/**
 * 质量检查器
 * 基于 webnovel-writer-master 的质量保证系统
 * 
 * 质量检查器负责：
 * - 检查内容质量
 * - 验证合同合规性
 * - 检查角色一致性
 * - 验证节奏和爽点分布
 */

import { ref, computed } from 'vue';
import type { ReadRetentionScore, HookType, CoolPointType } from '@/types/evaluation';
import type { ChapterContract } from '@/types/contract';

// ============================================================
// 类型定义
// ============================================================

export interface QualityCheckResult {
  passed: boolean;
  score: number;
  issues: QualityIssue[];
  suggestions: string[];
  details: QualityDetails;
}

export interface QualityIssue {
  type: 'error' | 'warning' | 'info';
  category: 'hook' | 'coolpoint' | 'rhythm' | 'contract' | 'character' | 'style';
  message: string;
  severity: number; // 1-10
  location?: {
    chapter?: number;
    paragraph?: number;
    line?: number;
  };
}

export interface QualityDetails {
  hookScore: number;
  coolpointScore: number;
  rhythmScore: number;
  contractScore: number;
  characterScore: number;
  styleScore: number;
}

export interface QualityConfig {
  // 各项权重
  weights: {
    hook: number;
    coolpoint: number;
    rhythm: number;
    contract: number;
    character: number;
    style: number;
  };
  // 阈值
  thresholds: {
    minScore: number;
    maxIssueSeverity: number;
  };
  // 检查项
  checks: {
    checkHook: boolean;
    checkCoolpoint: boolean;
    checkRhythm: boolean;
    checkContract: boolean;
    checkCharacter: boolean;
    checkStyle: boolean;
  };
}

// ============================================================
// Composable 定义
// ============================================================

export function useQualityChecker() {
  // 配置
  const config = ref<QualityConfig>({
    weights: {
      hook: 0.2,
      coolpoint: 0.2,
      rhythm: 0.2,
      contract: 0.2,
      character: 0.1,
      style: 0.1,
    },
    thresholds: {
      minScore: 60,
      maxIssueSeverity: 5,
    },
    checks: {
      checkHook: true,
      checkCoolpoint: true,
      checkRhythm: true,
      checkContract: true,
      checkCharacter: true,
      checkStyle: true,
    },
  });

  // 状态
  const lastCheck = ref<QualityCheckResult | null>(null);
  const isChecking = ref(false);
  const checkHistory = ref<QualityCheckResult[]>([]);

  // ============================================================
  // 质量检查
  // ============================================================

  /**
   * 执行完整质量检查
   */
  async function checkQuality(params: {
    content: string;
    chapterNumber: number;
    contract?: ChapterContract | null;
    previousContent?: string;
    previousContract?: ChapterContract | null;
  }): Promise<QualityCheckResult> {
    isChecking.value = true;

    const { content, chapterNumber, contract, previousContent } = params;

    const issues: QualityIssue[] = [];
    const details: QualityDetails = {
      hookScore: 0,
      coolpointScore: 0,
      rhythmScore: 0,
      contractScore: 0,
      characterScore: 0,
      styleScore: 0,
    };

    try {
      // Hook 检查
      if (config.value.checks.checkHook) {
        const hookResult = checkHookQuality(content, contract);
        details.hookScore = hookResult.score;
        issues.push(...hookResult.issues);
      }

      // 爽点检查
      if (config.value.checks.checkCoolpoint) {
        const coolpointResult = checkCoolpointQuality(content, contract);
        details.coolpointScore = coolpointResult.score;
        issues.push(...coolpointResult.issues);
      }

      // 节奏检查
      if (config.value.checks.checkRhythm) {
        const rhythmResult = checkRhythmQuality(content, previousContent, contract);
        details.rhythmScore = rhythmResult.score;
        issues.push(...rhythmResult.issues);
      }

      // 合同合规性检查
      if (config.value.checks.checkContract && contract) {
        const contractResult = checkContractCompliance(content, contract);
        details.contractScore = contractResult.score;
        issues.push(...contractResult.issues);
      }

      // 角色一致性检查
      if (config.value.checks.checkCharacter) {
        const characterResult = checkCharacterConsistency(content, contract);
        details.characterScore = characterResult.score;
        issues.push(...characterResult.issues);
      }

      // 风格检查
      if (config.value.checks.checkStyle) {
        const styleResult = checkStyleQuality(content);
        details.styleScore = styleResult.score;
        issues.push(...styleResult.issues);
      }

      // 计算总分
      const score = calculateTotalScore(details);

      // 生成建议
      const suggestions = generateSuggestions(issues, details);

      const result: QualityCheckResult = {
        passed: score >= config.value.thresholds.minScore && 
                !issues.some(i => i.severity >= config.value.thresholds.maxIssueSeverity),
        score,
        issues,
        suggestions,
        details,
      };

      lastCheck.value = result;
      checkHistory.value.push(result);

      return result;
    } finally {
      isChecking.value = false;
    }
  }

  // ============================================================
  // Hook 检查
  // ============================================================

  function checkHookQuality(content: string, contract?: ChapterContract | null): {
    score: number;
    issues: QualityIssue[];
  } {
    const issues: QualityIssue[] = [];
    let score = 70;

    const paragraphs = content.split('\n\n');
    
    // 检查开篇钩子
    const firstPara = paragraphs[0] || '';
    if (!hasOpeningHook(firstPara)) {
      issues.push({
        type: 'warning',
        category: 'hook',
        message: '开篇缺少有效的钩子',
        severity: 7,
      });
      score -= 15;
    } else {
      score += 10;
    }

    // 检查结尾钩子
    const lastPara = paragraphs[paragraphs.length - 1] || '';
    if (!hasEndingHook(lastPara)) {
      issues.push({
        type: 'warning',
        category: 'hook',
        message: '章节结尾缺少悬念或钩子',
        severity: 8,
      });
      score -= 20;
    } else {
      score += 15;
    }

    // 检查章节内钩子
    const middleHookCount = countMiddleHooks(paragraphs);
    if (middleHookCount === 0) {
      issues.push({
        type: 'info',
        category: 'hook',
        message: '章节中间缺少小高潮或转折',
        severity: 4,
      });
      score -= 5;
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      issues,
    };
  }

  function hasOpeningHook(text: string): boolean {
    const hookIndicators = [
      '突然', '就在此时', '就在这时', '刹那间',
      '没想到', '谁知', '竟然', '原来',
      '叮', '系统提示', '叮咚', '一声'
    ];
    
    return hookIndicators.some(indicator => text.includes(indicator)) ||
           text.length > 0 && /[！？。]/.test(text);
  }

  function hasEndingHook(text: string): boolean {
    const hookIndicators = [
      '？', '...', '！', '未完待续', '本章完',
      '究竟', '到底', '竟然', '出乎意料',
      '就在这', '正当', '眼看', '就在此时'
    ];
    
    return hookIndicators.some(indicator => text.includes(indicator));
  }

  function countMiddleHooks(paragraphs: string[]): number {
    const hookIndicators = [
      '突然', '就在这时', '然而', '没想到',
      '但是', '与此同时', '更没想到',
      '情况突变', '出人意料', '反转'
    ];
    
    let count = 0;
    for (let i = 1; i < paragraphs.length - 1; i++) {
      if (hookIndicators.some(indicator => paragraphs[i].includes(indicator))) {
        count++;
      }
    }
    
    return count;
  }

  // ============================================================
  // 爽点检查
  // ============================================================

  function checkCoolpointQuality(content: string, contract?: ChapterContract | null): {
    score: number;
    issues: QualityIssue[];
  } {
    const issues: QualityIssue[] = [];
    let score = 60;

    const coolpointPatterns = {
      'face-slapping': ['打脸', '被震惊', '目瞪口呆', '不敢相信'],
      'show-off': ['装逼', '炫耀', '展示', '展露'],
      'growth': ['突破', '提升', '成长', '变强'],
      'identity-reveal': ['原来', '竟然是他', '身份', '真实身份'],
      'rescue': ['英雄救美', '危机时刻', '出手相助'],
      'treasure': ['获得', '得到', '宝物', '宝贝'],
      'breakthrough': ['突破', '升级', '晋升'],
      'romance': ['心动', '脸红', '好感', '喜欢'],
    };

    let totalMatches = 0;
    const matchedTypes: string[] = [];

    for (const [type, patterns] of Object.entries(coolpointPatterns)) {
      const matches = patterns.filter(p => content.includes(p)).length;
      if (matches > 0) {
        totalMatches += matches;
        matchedTypes.push(type);
      }
    }

    // 评分
    if (totalMatches === 0) {
      issues.push({
        type: 'warning',
        category: 'coolpoint',
        message: '章节缺少明显爽点',
        severity: 8,
      });
      score -= 20;
    } else if (totalMatches >= 3) {
      score += 15;
    } else if (totalMatches >= 1) {
      score += 5;
    }

    // 多样性
    const variety = matchedTypes.length;
    if (variety >= 3) {
      score += 10;
    } else if (variety >= 2) {
      score += 5;
    } else if (variety === 1) {
      issues.push({
        type: 'info',
        category: 'coolpoint',
        message: '爽点类型较单一，建议增加多样性',
        severity: 3,
      });
    }

    // 检查合同要求的爽点
    if (contract && matchedTypes.length === 0) {
      issues.push({
        type: 'warning',
        category: 'coolpoint',
        message: '未达到合同要求的爽点密度',
        severity: 6,
      });
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      issues,
    };
  }

  // ============================================================
  // 节奏检查
  // ============================================================

  function checkRhythmQuality(
    content: string,
    previousContent?: string,
    contract?: ChapterContract | null
  ): {
    score: number;
    issues: QualityIssue[];
  } {
    const issues: QualityIssue[] = [];
    let score = 70;

    const paragraphs = content.split('\n\n');
    
    // 节奏评估
    const avgParaLength = paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length;
    
    if (avgParaLength < 50) {
      issues.push({
        type: 'info',
        category: 'rhythm',
        message: '段落过短，可能影响阅读流畅性',
        severity: 3,
      });
      score -= 5;
    } else if (avgParaLength > 300) {
      issues.push({
        type: 'warning',
        category: 'rhythm',
        message: '段落过长，可能影响阅读节奏',
        severity: 4,
      });
      score -= 5;
    }

    // 过渡检查
    if (!previousContent && paragraphs.length > 5) {
      // 检查是否有承接前文的表述
      const hasTransition = paragraphs[0].match(/[此时|这|那|正当]/);
      if (!hasTransition) {
        issues.push({
          type: 'info',
          category: 'rhythm',
          message: '开篇缺少过渡衔接',
          severity: 2,
        });
      }
    }

    // 章节长度
    const wordCount = content.replace(/[#\n\s]/g, '').length;
    if (wordCount < 1500) {
      issues.push({
        type: 'warning',
        category: 'rhythm',
        message: `章节字数较少（${wordCount}字），可能影响更新体验`,
        severity: 5,
      });
      score -= 10;
    } else if (wordCount > 4000) {
      issues.push({
        type: 'info',
        category: 'rhythm',
        message: `章节字数较多（${wordCount}字），建议拆分`,
        severity: 3,
      });
      score -= 5;
    } else {
      score += 10;
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      issues,
    };
  }

  // ============================================================
  // 合同合规性检查
  // ============================================================

  function checkContractCompliance(content: string, contract: ChapterContract): {
    score: number;
    issues: QualityIssue[];
  } {
    const issues: QualityIssue[] = [];
    let score = 100;

    // 检查必须包含
    for (const mustInclude of contract.constraints.mustInclude) {
      if (!content.includes(mustInclude)) {
        issues.push({
          type: 'error',
          category: 'contract',
          message: `合同要求必须包含"${mustInclude}"但未找到`,
          severity: 9,
        });
        score -= 15;
      }
    }

    // 检查禁止包含
    for (const mustNotInclude of contract.constraints.mustNotInclude) {
      if (content.includes(mustNotInclude)) {
        issues.push({
          type: 'error',
          category: 'contract',
          message: `合同禁止包含"${mustNotInclude}"但实际存在`,
          severity: 10,
        });
        score -= 20;
      }
    }

    // 检查 CBN 遵循
    if (contract.cbn.situation) {
      const cbnKeywords = contract.cbn.situation.split(/[,，、]/).filter(Boolean);
      const matchCount = cbnKeywords.filter(k => content.includes(k.trim())).length;
      if (matchCount < cbnKeywords.length * 0.3) {
        issues.push({
          type: 'warning',
          category: 'contract',
          message: '章节起点与合同要求偏差较大',
          severity: 6,
        });
        score -= 10;
      }
    }

    // 检查角色出场
    for (const charName of contract.charactersPresent) {
      if (!content.includes(charName)) {
        issues.push({
          type: 'warning',
          category: 'contract',
          message: `合同要求角色"${charName}"出场但未找到`,
          severity: 5,
        });
        score -= 5;
      }
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      issues,
    };
  }

  // ============================================================
  // 角色一致性检查
  // ============================================================

  function checkCharacterConsistency(content: string, contract?: ChapterContract | null): {
    score: number;
    issues: QualityIssue[];
  } {
    const issues: QualityIssue[] = [];
    let score = 80;

    // 简化版角色一致性检查
    // 实际实现需要更复杂的NLP分析

    // 检查称呼一致性
    const characterMentions = content.match(/[A-Za-z\u4e00-\u9fa5]{2,4}(?:说|道|问|答|称)/g);
    if (characterMentions && characterMentions.length > 20) {
      const uniqueMentions = new Set(characterMentions);
      if (uniqueMentions.size < 3) {
        issues.push({
          type: 'info',
          category: 'character',
          message: '角色称呼方式单一',
          severity: 2,
        });
      }
    }

    // 检查对话比例
    const dialogueCount = (content.match(/[""''『』]/g) || []).length;
    const totalLength = content.length;
    const dialogueRatio = dialogueCount / totalLength;

    if (dialogueRatio > 0.5) {
      issues.push({
        type: 'info',
        category: 'character',
        message: '对话占比过高，可能影响叙述',
        severity: 3,
      });
      score -= 5;
    } else if (dialogueRatio < 0.1 && totalLength > 2000) {
      issues.push({
        type: 'info',
        category: 'character',
        message: '对话较少，可能影响角色塑造',
        severity: 2,
      });
      score -= 3;
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      issues,
    };
  }

  // ============================================================
  // 风格检查
  // ============================================================

  function checkStyleQuality(content: string): {
    score: number;
    issues: QualityIssue[];
  } {
    const issues: QualityIssue[] = [];
    let score = 75;

    // 检查 AI 味特征
    const aiPatterns = [
      '首先', '其次', '最后', '综上所述',
      '值得注意的是', '一般来说', '通常情况下',
      '从...角度来看', '从这个意义上说'
    ];

    let aiPatternCount = 0;
    for (const pattern of aiPatterns) {
      if (content.includes(pattern)) {
        aiPatternCount++;
      }
    }

    if (aiPatternCount >= 3) {
      issues.push({
        type: 'warning',
        category: 'style',
        message: '存在AI写作特征，建议优化',
        severity: 6,
      });
      score -= 15;
    } else if (aiPatternCount >= 1) {
      issues.push({
        type: 'info',
        category: 'style',
        message: '存在少量AI写作特征',
        severity: 3,
      });
      score -= 5;
    }

    // 检查重复句式
    const sentences = content.split(/[。！？]/);
    const shortSentences = sentences.filter(s => s.length < 10 && s.length > 0);
    if (shortSentences.length > sentences.length * 0.3) {
      issues.push({
        type: 'info',
        category: 'style',
        message: '短句使用较多，可能影响阅读节奏',
        severity: 2,
      });
      score -= 5;
    }

    // 检查感叹号使用
    const exclamationCount = (content.match(/！/g) || []).length;
    if (exclamationCount > 15) {
      issues.push({
        type: 'info',
        category: 'style',
        message: '感叹号使用过多',
        severity: 3,
      });
      score -= 5;
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      issues,
    };
  }

  // ============================================================
  // 辅助函数
  // ============================================================

  function calculateTotalScore(details: QualityDetails): number {
    const { weights } = config.value;
    
    return Math.round(
      details.hookScore * weights.hook +
      details.coolpointScore * weights.coolpoint +
      details.rhythmScore * weights.rhythm +
      details.contractScore * weights.contract +
      details.characterScore * weights.character +
      details.styleScore * weights.style
    );
  }

  function generateSuggestions(issues: QualityIssue[], details: QualityDetails): string[] {
    const suggestions: string[] = [];

    // 按类别汇总建议
    const byCategory = new Map<string, QualityIssue[]>();
    for (const issue of issues) {
      const existing = byCategory.get(issue.category) || [];
      existing.push(issue);
      byCategory.set(issue.category, existing);
    }

    // Hook 建议
    if (details.hookScore < 70) {
      suggestions.push('增加开篇和结尾的钩子设计');
    }

    // 爽点建议
    if (details.coolpointScore < 70) {
      suggestions.push('增加打脸、装逼等爽点元素');
    }

    // 节奏建议
    if (details.rhythmScore < 70) {
      suggestions.push('调整段落长度，保持节奏紧凑');
    }

    // 合同建议
    if (details.contractScore < 80) {
      const contractIssues = byCategory.get('contract');
      if (contractIssues && contractIssues.length > 0) {
        suggestions.push('注意合同约束，确保合规');
      }
    }

    // 风格建议
    if (details.styleScore < 70) {
      suggestions.push('优化句式，避免AI写作特征');
    }

    // 高严重度问题
    const highSeverity = issues.filter(i => i.severity >= 7);
    if (highSeverity.length > 0) {
      suggestions.push(`存在${highSeverity.length}个需要优先处理的问题`);
    }

    return suggestions;
  }

  // ============================================================
  // 快速检查
  // ============================================================

  /**
   * 快速质量检查（简化版）
   */
  function quickCheck(content: string): boolean {
    const paragraphs = content.split('\n\n');
    const firstPara = paragraphs[0] || '';
    const lastPara = paragraphs[paragraphs.length - 1] || '';

    // 基本检查
    const hasHook = hasOpeningHook(firstPara) || hasEndingHook(lastPara);
    const hasContent = content.length > 1000;
    const hasEnding = content.includes('本章完') || content.includes('【') && content.includes('完】');

    return hasHook && hasContent && hasEnding;
  }

  // ============================================================
  // 配置
  // ============================================================

  function updateConfig(updates: Partial<QualityConfig>): void {
    config.value = { ...config.value, ...updates };
  }

  function resetConfig(): void {
    config.value = {
      weights: { hook: 0.2, coolpoint: 0.2, rhythm: 0.2, contract: 0.2, character: 0.1, style: 0.1 },
      thresholds: { minScore: 60, maxIssueSeverity: 5 },
      checks: {
        checkHook: true,
        checkCoolpoint: true,
        checkRhythm: true,
        checkContract: true,
        checkCharacter: true,
        checkStyle: true,
      },
    };
  }

  // ============================================================
  // 返回
  // ============================================================

  return {
    // 配置
    config,
    updateConfig,
    resetConfig,

    // 状态
    lastCheck,
    isChecking,
    checkHistory,

    // 检查方法
    checkQuality,
    quickCheck,
  };
}

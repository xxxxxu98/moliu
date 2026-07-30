/**
 * 审查 Agent
 * 基于 webnovel-writer 架构
 * 
 * 职责：
 * - 执行六维审查
 * - 检查合同符合度
 * - 识别阻断问题
 * - 提供修改建议
 */

import { ref } from 'vue';
import type {
  ReviewResult,
  ReviewDimensions,
  ReviewDimension,
  ReviewIssue,
  ReviewSuggestion,
} from './types';
import { useContractManager } from '../contract/ContractManager';
import type { ChapterContract } from '../contract/types';
import { MAX_PARAGRAPH_CHARS, isLongParagraph } from '../typesetting';

export class ReviewAgent {
  private contractManager = useContractManager();
  
  /**
   * 执行审查
   */
  async review(
    chapterNumber: number,
    content: string
  ): Promise<ReviewResult> {
    // 1. 加载章节合同
    const contract = await this.contractManager.loadChapterContract(chapterNumber);
    
    // 2. 执行六维审查
    const dimensions = await this.performSixDimensionReview(content, chapterNumber, contract);
    
    // 3. 检查合同符合度
    const contractScore = await this.checkContractCompliance(content, contract);
    dimensions.contractScore = contractScore;
    
    // 4. 汇总结果
    const allIssues: ReviewIssue[] = [];
    const allWarnings: ReviewIssue[] = [];
    let blockingCount = 0;
    
    for (const dim of Object.values(dimensions)) {
      allIssues.push(...dim.issues);
      allWarnings.push(...dim.warnings);
      if (dim.isBlocking) blockingCount++;
    }
    
    // 计算总分
    const dimensionScores = Object.values(dimensions).map(d => d.score);
    const overallScore = dimensionScores.reduce((a, b) => a + b, 0) / dimensionScores.length;
    
    // 生成建议
    const suggestions = this.generateSuggestions(dimensions);
    
    return {
      overall: {
        pass: blockingCount === 0 && overallScore >= 70,
        blockingCount,
        warningCount: allWarnings.length,
        score: overallScore,
        summary: this.generateSummary(blockingCount, overallScore),
      },
      dimensions,
      blockingIssues: allIssues.filter(i => i.severity === 'critical'),
      warnings: allWarnings,
      suggestions,
    };
  }
  
  /**
   * 执行六维审查
   */
  private async performSixDimensionReview(
    content: string,
    chapterNumber: number,
    contract?: ChapterContract
  ): Promise<ReviewDimensions> {
    const [
      continuity,
      hookScore,
      coolpointScore,
      paceScore,
      antiAIScore,
    ] = await Promise.all([
      this.checkContinuity(content, contract),
      this.checkHookScore(content, chapterNumber),
      this.checkCoolPointScore(content),
      this.checkPaceScore(content),
      this.checkAntiAI(content),
    ]);
    
    return {
      continuity,
      hookScore,
      coolpointScore,
      paceScore,
      antiAIScore,
      contractScore: { score: 100, issues: [], warnings: [], isBlocking: false },
    };
  }
  
  /**
   * 一致性检查
   */
  private async checkContinuity(
    content: string,
    contract?: ChapterContract
  ): Promise<ReviewDimension> {
    const issues: ReviewIssue[] = [];
    const warnings: ReviewIssue[] = [];
    let score = 100;
    
    // 检查前章结尾锚定
    if (contract?.directive.previousChapterEnding) {
      const previousEnding = contract.directive.previousChapterEnding;
      const hasAnchor = this.checkTextAnchor(content, previousEnding);
      
      if (!hasAnchor) {
        warnings.push({
          type: 'continuity_anchor',
          severity: 'warning',
          location: '开头',
          description: '未明确衔接前章结尾',
          suggestion: `建议在前300字内回应或衔接：${previousEnding.slice(0, 50)}`,
        });
        score -= 5;
      }
    }
    
    // 检查时间线一致性
    const timeMentions = content.match(/(刚才|此时|当天|次日|一月后|一年后)/g);
    if (timeMentions && timeMentions.length > 5) {
      warnings.push({
        type: 'timeline_inconsistency',
        severity: 'warning',
        location: '全文',
        description: '时间描述过于混乱',
        suggestion: '统一时间线，避免时间跳跃混乱',
      });
      score -= 10;
    }
    
    // 检查人物出场一致性
    const quoteCount = (content.match(/[""]/g) || []).length;
    if (quoteCount > 0) {
      const estimatedSpeakers = Math.ceil(quoteCount / 5);
      if (estimatedSpeakers > 5) {
        warnings.push({
          type: 'too_many_speakers',
          severity: 'info',
          location: '对话部分',
          description: `预估出场角色超过${estimatedSpeakers}个，注意清晰区分`,
          suggestion: '每段对话前加上说话者标识',
        });
      }
    }
    
    return {
      score: Math.max(0, score),
      issues,
      warnings,
      isBlocking: score < 60,
    };
  }
  
  /**
   * 钩子得分检查
   */
  private async checkHookScore(
    content: string,
    chapterNumber: number
  ): Promise<ReviewDimension> {
    const issues: ReviewIssue[] = [];
    const warnings: ReviewIssue[] = [];
    let score = 80;
    
    // 检查章首钩子
    const firstParagraph = content.split('\n\n')[0] || '';
    const hasHook = this.checkChapterStartHook(firstParagraph);
    
    if (!hasHook) {
      issues.push({
        type: 'missing_chapter_start_hook',
        severity: 'critical',
        location: '开头',
        description: '章首缺少有效钩子',
        suggestion: '建议在前100字内设置冲突/悬念/吸引点',
      });
      score -= 20;
    }
    
    // 检查章尾钩子
    const paragraphs = content.split('\n\n');
    const lastParagraph = paragraphs[paragraphs.length - 1] || '';
    const hasEndHook = this.checkChapterEndHook(lastParagraph);
    
    if (!hasEndHook) {
      issues.push({
        type: 'missing_chapter_end_hook',
        severity: 'critical',
        location: '结尾',
        description: '章尾缺少悬念或钩子',
        suggestion: '建议在结尾留问题/悬念/未完成动作',
      });
      score -= 20;
    }
    
    // 检查结尾是否安全着陆
    const safeEndings = ['这就是', '这就是成长', '故事还在继续', '未完待续', '总的来说'];
    for (const safeEnd of safeEndings) {
      if (lastParagraph.includes(safeEnd)) {
        issues.push({
          type: 'safe_landing',
          severity: 'critical',
          location: '结尾',
          description: `结尾包含安全着陆表述"${safeEnd}"`,
          suggestion: '删除总结性表述，改用悬念/问题/未完成动作结尾',
        });
        score -= 15;
      }
    }
    
    return {
      score: Math.max(0, score),
      issues,
      warnings,
      isBlocking: score < 60,
    };
  }
  
  /**
   * 爽点得分检查
   */
  private async checkCoolPointScore(content: string): Promise<ReviewDimension> {
    const issues: ReviewIssue[] = [];
    const warnings: ReviewIssue[] = [];
    let score = 80;
    
    // 统计字数
    const wordCount = this.countWords(content);
    const expectedCoolPoints = Math.floor(wordCount / 3000);
    
    // 检查常见的爽点模式
    const coolPointPatterns = [
      { pattern: /(打脸|翻盘|逆袭|装逼|打脸)/, weight: 1 },
      { pattern: /(突破|升级|提升|进化)/, weight: 0.8 },
      { pattern: /(发现|揭露|揭开)/, weight: 0.6 },
      { pattern: /(获得|得到|收获)/, weight: 0.7 },
      { pattern: /(战胜|击败|打败)/, weight: 0.9 },
      { pattern: /(承诺|答应|发誓)/, weight: 0.5 },
    ];
    
    let foundCoolPoints = 0;
    for (const { pattern, weight } of coolPointPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        foundCoolPoints += matches.length * weight;
      }
    }
    
    if (foundCoolPoints < expectedCoolPoints) {
      warnings.push({
        type: 'insufficient_cool_points',
        severity: 'warning',
        location: '全文',
        description: `爽点密度偏低：期望约${expectedCoolPoints}个，实际约${Math.floor(foundCoolPoints)}个`,
        suggestion: '每3000字建议设置1-2个爽点',
      });
      score -= 10;
    }
    
    // 检查是否有实质进展
    const progressIndicators = ['终于', '成功', '完成', '实现', '得到'];
    const hasProgress = progressIndicators.some(p => content.includes(p));
    
    if (!hasProgress && wordCount > 2000) {
      warnings.push({
        type: 'no_progress',
        severity: 'warning',
        location: '全文',
        description: '章节缺少实质进展或收获',
        suggestion: '确保本章有明确的进展或收获',
      });
      score -= 10;
    }
    
    return {
      score: Math.max(0, score),
      issues,
      warnings,
      isBlocking: score < 50,
    };
  }
  
  /**
   * 节奏得分检查
   */
  private async checkPaceScore(content: string): Promise<ReviewDimension> {
    const issues: ReviewIssue[] = [];
    const warnings: ReviewIssue[] = [];
    let score = 80;
    
    // 检查段落长度（与 typesetting 舒适段长对齐）
    const paragraphs = content.split('\n\n').filter(p => p.trim());
    const longParagraphs = paragraphs.filter(p => isLongParagraph(p));
    
    if (longParagraphs.length > paragraphs.length * 0.3) {
      warnings.push({
        type: 'long_paragraphs',
        severity: 'warning',
        location: '全文',
        description: `长段落过多(${longParagraphs.length}/${paragraphs.length})`,
        suggestion: `单段尽量不超过约 ${MAX_PARAGRAPH_CHARS} 字，适当拆分真正偏长的段`,
      });
      score -= 10;
    }
    
    // 检查对话比例
    const quoteContent = content.match(/[""][^""]+[""]/g) || [];
    const quoteRatio = quoteContent.join('').length / content.length;
    
    if (quoteRatio < 0.2) {
      warnings.push({
        type: 'low_dialogue_ratio',
        severity: 'warning',
        location: '全文',
        description: `对话比例偏低(${quoteRatio.toFixed(0)}%)`,
        suggestion: '对话建议占30%-50%',
      });
      score -= 10;
    }
    
    // 检查是否有节奏高峰
    const shortParagraphs = paragraphs.filter(p => p.length < 50);
    if (shortParagraphs.length < 3) {
      warnings.push({
        type: 'monotonous_pacing',
        severity: 'warning',
        location: '全文',
        description: '缺少短段落制造的节奏高峰',
        suggestion: '紧张场景建议用短句和短段落',
      });
      score -= 5;
    }
    
    return {
      score: Math.max(0, score),
      issues,
      warnings,
      isBlocking: score < 50,
    };
  }
  
  /**
   * Anti-AI 检查
   */
  private async checkAntiAI(content: string): Promise<ReviewDimension> {
    const issues: ReviewIssue[] = [];
    const warnings: ReviewIssue[] = [];
    let score = 100;
    
    // AI 常见模式
    const aiPatterns = [
      // 情绪词模式
      { pattern: /(他感到|她感到|他觉得|她觉得)[^，。]*[。]/g, severity: 'critical' as const },
      // 总结句模式
      { pattern: /(这就是|这说明|这表明|这意味着)/g, severity: 'critical' as const },
      // 被动句过多
      { pattern: /被/g, severity: 'warning' as const },
      // 形容词过多
      { pattern: /(非常|十分|特别|极其)[^，。]*/g, severity: 'warning' as const },
      // AI惯用连接词
      { pattern: /(就在此时|就在这一刻|众所周知)/g, severity: 'warning' as const },
      // 连续排比
      { pattern: /[，][^，]+[，][^，]+[，][^，]+[，。]/g, severity: 'warning' as const },
    ];
    
    for (const { pattern, severity } of aiPatterns) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        const issue: ReviewIssue = {
          type: 'ai_pattern',
          severity,
          location: '全文',
          description: `发现AI常用模式：${matches.slice(0, 2).join('、')}${matches.length > 2 ? '...' : ''}`,
          suggestion: severity === 'critical' 
            ? '必须修改为具体动作/对话'
            : '建议改为更自然的表达',
        };
        
        if (severity === 'critical') {
          issues.push(issue);
          score -= 10;
        } else {
          warnings.push(issue);
          score -= 5;
        }
      }
    }
    
    // 检查错别字风险
    const commonErrors = ['的/地/得', '在/再', '那/哪'];
    // 简化检查
    if (content.includes('的的') || content.includes('地地') || content.includes('得得')) {
      warnings.push({
        type: 'typo_risk',
        severity: 'info',
        location: '全文',
        description: '发现"的的"/"地地"/"得得"等连用',
        suggestion: '检查"的/地/得"使用是否正确',
      });
      score -= 3;
    }
    
    return {
      score: Math.max(0, score),
      issues,
      warnings,
      isBlocking: score < 60,
    };
  }
  
  /**
   * 检查合同符合度
   */
  private async checkContractCompliance(
    content: string,
    contract?: ChapterContract
  ): Promise<ReviewDimension> {
    if (!contract) {
      return { score: 100, issues: [], warnings: [], isBlocking: false };
    }
    
    const issues: ReviewIssue[] = [];
    const warnings: ReviewIssue[] = [];
    let score = 100;
    
    // 检查必须覆盖
    for (const mustCover of contract.constraints.mustCover) {
      if (!content.includes(mustCover)) {
        issues.push({
          type: 'must_cover',
          severity: 'critical',
          location: '全文',
          description: `未包含必须内容：${mustCover}`,
          suggestion: '必须在正文中覆盖此内容',
        });
        score -= 15;
      }
    }
    
    // 检查禁区
    for (const forbidden of contract.constraints.forbiddenZones) {
      if (content.includes(forbidden)) {
        issues.push({
          type: 'forbidden_zone',
          severity: 'critical',
          location: '全文',
          description: `包含禁止内容：${forbidden}`,
          suggestion: '必须删除此内容',
        });
        score -= 20;
      }
    }
    
    // 检查情节节点
    if (contract.nodes.cen) {
      const hasEnd = this.containsNode(content, contract.nodes.cen);
      if (!hasEnd) {
        warnings.push({
          type: 'node_missing',
          severity: 'warning',
          location: '结尾',
          description: `未明确包含结束节点：${contract.nodes.cen}`,
          suggestion: '确保章末体现结束节点',
        });
        score -= 10;
      }
    }
    
    return {
      score: Math.max(0, score),
      issues,
      warnings,
      isBlocking: score < 70,
    };
  }
  
  // ============================================================
  // 辅助方法
  // ============================================================
  
  private checkTextAnchor(content: string, anchor: string): boolean {
    if (!anchor || anchor.length < 10) return true;
    
    // 提取锚点关键词
    const keywords = anchor.split(/[，。、；]/).filter(w => w.length >= 2);
    
    // 检查是否有至少一个关键词出现在开头
    const firstPart = content.slice(0, 500);
    return keywords.some(k => firstPart.includes(k));
  }
  
  private checkChapterStartHook(paragraph: string): boolean {
    if (!paragraph || paragraph.length < 50) return false;
    
    const hookIndicators = [
      /^(忽然|突然|就在这时|就在这时刻)/,
      /[？?]/,
      /[""]/,
      /^(只见|只见得)/,
      /^(谁知|谁知道|没想到|没料到)/,
    ];
    
    return hookIndicators.some(pattern => pattern.test(paragraph));
  }
  
  private checkChapterEndHook(paragraph: string): boolean {
    if (!paragraph || paragraph.length < 20) return false;
    
    const hookIndicators = [
      /[？?]$/,
      /[。]$/,
      /[""]/,
      /[…——]$/,
      /(未完|待续)/,
      /(究竟|到底|如何|怎么办)$/,
    ];
    
    // 检查是否安全着陆
    const safeEndings = ['这就是', '这就是成长', '故事还在继续'];
    if (safeEndings.some(e => paragraph.includes(e))) {
      return false;
    }
    
    return hookIndicators.some(pattern => pattern.test(paragraph));
  }
  
  private containsNode(content: string, node: string): boolean {
    if (!node || node.length < 5) return true;
    
    const keywords = node.split(/[|]/).filter(Boolean);
    const contentLower = content.toLowerCase();
    
    return keywords.some(k => contentLower.includes(k.toLowerCase()));
  }
  
  private countWords(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    return chineseChars + englishWords;
  }
  
  private generateSuggestions(dimensions: ReviewDimensions): ReviewSuggestion[] {
    const suggestions: ReviewSuggestion[] = [];
    
    // 从各维度生成建议
    for (const [dim, result] of Object.entries(dimensions)) {
      if (result.score < 80) {
        suggestions.push({
          dimension: dim,
          type: 'improvement',
          description: `${dim}维度得分偏低(${result.score}分)`,
          priority: result.score < 60 ? 'high' : 'medium',
        });
      }
      
      // 从警告生成建议
      for (const warning of result.warnings) {
        suggestions.push({
          dimension: dim,
          type: 'warning',
          description: warning.suggestion,
          priority: 'low',
        });
      }
    }
    
    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }
  
  private generateSummary(blockingCount: number, overallScore: number): string {
    if (blockingCount > 0) {
      return `存在${blockingCount}个阻断问题，需要修改`;
    }
    if (overallScore >= 85) {
      return '质量优秀';
    }
    if (overallScore >= 70) {
      return '质量合格，可小幅优化';
    }
    return '质量偏低，建议修改';
  }
}

// ============================================================
// Composable 导出
// ============================================================

export function useReviewAgent() {
  const agent = new ReviewAgent();
  
  return {
    agent,
    review: (chapterNumber: number, content: string) => 
      agent.review(chapterNumber, content),
  };
}

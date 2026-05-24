/**
 * 增强审查 Agent (Enhanced Reviewer Agent)
 * 
 * 职责：
 * 1. 执行六维审查
 * 2. 检测 AI 味问题
 * 3. 输出结构化审查结果
 * 4. 支持 blocking 判定
 */

import type {
  ReviewerOutput,
  ReviewIssue,
  ReviewMetrics,
  AntiPatternIssue,
  ChapterContract,
  ReviewDimension,
} from '@/types/writing-v2';
import { DeAIService } from '@/services/writing/de-ai-service';
import type { DeAIDetectionResult } from '@/services/writing/de-ai-service';

// 审查配置
export interface ReviewerConfig {
  strictMode: boolean;
  blockingThreshold: number;
  passThreshold: number;
  depth: 'quick' | 'normal' | 'deep';
}

// 审查上下文
export interface ReviewContext {
  projectRoot: string;
  chapterNumber: number;
  chapterContent: string;
  previousChapterContent?: string;
  contract?: ChapterContract;
  antiPatterns?: string[];
}

const DEFAULT_CONFIG: ReviewerConfig = {
  strictMode: false,
  blockingThreshold: 0,
  passThreshold: 70,
  depth: 'normal',
};

// 审查维度权重
const DIMENSION_WEIGHTS: Record<ReviewDimension, number> = {
  continuity: 0.20,
  contract: 0.25,
  anti_ai: 0.20,
  logic: 0.15,
  pace: 0.10,
  hook: 0.10,
};

export class EnhancedReviewerAgent {
  private readonly config: Required<ReviewerConfig>;
  private readonly deAIService: DeAIService;

  constructor(config?: Partial<ReviewerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.deAIService = new DeAIService();
  }

  /**
   * 执行审查
   */
  async review(context: ReviewContext): Promise<ReviewerOutput> {
    const {
      chapterContent,
      contract,
      previousChapterContent,
      antiPatterns,
    } = context;

    console.log('[ReviewerAgent] 开始审查:', {
      chapter: context.chapterNumber,
      contentLength: chapterContent.length,
      depth: this.config.depth,
    });

    // 1. 执行各维度审查
    const [continuityResult, contractResult, antiAIResult, logicResult, paceResult, hookResult] =
      await Promise.all([
        this.checkContinuity(chapterContent, contract, previousChapterContent),
        this.checkContractCompliance(chapterContent, contract),
        this.checkAntiAI(chapterContent, antiPatterns),
        this.checkLogic(chapterContent),
        this.checkPace(chapterContent),
        this.checkHook(chapterContent, context.chapterNumber),
      ]);

    // 2. 汇总问题
    const allIssues = [
      ...continuityResult.issues,
      ...contractResult.issues,
      ...antiAIResult.issues,
      ...logicResult.issues,
      ...paceResult.issues,
      ...hookResult.issues,
    ];

    const allWarnings = [
      ...continuityResult.warnings,
      ...contractResult.warnings,
      ...antiAIResult.warnings,
      ...logicResult.warnings,
      ...paceResult.warnings,
      ...hookResult.warnings,
    ];

    // 3. 收集反模式问题
    const antiPatternIssues = this.collectAntiPatternIssues(
      antiAIResult,
      continuityResult,
      paceResult
    );

    // 4. 计算指标
    const metrics = this.calculateMetrics(chapterContent, antiAIResult, hookResult, paceResult);

    // 5. 判定 blocking
    const blockingCount = this.countBlockingIssues(allIssues);
    const blocking = blockingCount > this.config.blockingThreshold;

    console.log('[ReviewerAgent] 审查完成:', {
      blocking,
      blockingCount,
      totalIssues: allIssues.length,
      totalWarnings: allWarnings.length,
      score: this.calculateOverallScore(continuityResult, contractResult, antiAIResult, logicResult, paceResult, hookResult),
    });

    return {
      blocking,
      issues: allIssues,
      metrics,
      antiPatternIssues,
    };
  }

  /**
   * 检查连续性
   */
  private async checkContinuity(
    content: string,
    contract?: ChapterContract,
    previousChapterContent?: string
  ): Promise<{ issues: ReviewIssue[]; warnings: ReviewIssue[]; score: number }> {
    const issues: ReviewIssue[] = [];
    const warnings: ReviewIssue[] = [];
    let score = 100;

    // 1. 检查前章衔接
    if (contract?.directive?.goal && previousChapterContent) {
      const previousEnding = this.extractEnding(previousChapterContent);
      if (previousEnding && !this.checkContinuityAnchor(content, previousEnding)) {
        issues.push({
          type: 'continuity',
          severity: 'high',
          location: '开头300字',
          description: '未明确衔接前章结尾',
          evidence: previousEnding.slice(0, 100),
          suggestion: '建议在开头呼应前章结尾内容',
        });
        score -= 15;
      }
    }

    // 2. 检查角色出场
    const expectedCharacters = contract?.characters?.map((c) => c.name) || [];
    const appearedCharacters = this.extractCharacterMentions(content);

    for (const expected of expectedCharacters) {
      if (!appearedCharacters.includes(expected)) {
        warnings.push({
          type: 'continuity',
          severity: 'low',
          location: '全文',
          description: `预期出场角色"${expected}"未在本章出现`,
          evidence: '',
          suggestion: '如非刻意缺席，建议补充出场',
        });
        score -= 5;
      }
    }

    // 3. 检查时间线
    const timelineIssues = this.checkTimeline(content);
    if (timelineIssues.length > 0) {
      warnings.push({
        type: 'continuity',
        severity: 'medium',
        location: '时间描述',
        description: '发现时间线矛盾',
        evidence: timelineIssues.join('; '),
        suggestion: '统一时间线，确保时间流逝合理',
      });
      score -= 10;
    }

    return {
      issues,
      warnings,
      score: Math.max(0, score),
    };
  }

  /**
   * 检查合同符合度
   */
  private async checkContractCompliance(
    content: string,
    contract?: ChapterContract
  ): Promise<{ issues: ReviewIssue[]; warnings: ReviewIssue[]; score: number }> {
    const issues: ReviewIssue[] = [];
    const warnings: ReviewIssue[] = [];
    let score = 100;

    if (!contract) {
      return { issues, warnings, score };
    }

    const directive = contract.directive;

    // 1. 检查 mustCover
    const mustCover = directive.mustCoverNodes || [];
    for (const node of mustCover) {
      if (!this.checkNodeCovered(content, node)) {
        issues.push({
          type: 'contract',
          severity: 'critical',
          location: '全文',
          description: `必须覆盖节点未找到: "${node.slice(0, 50)}"`,
          evidence: node,
          suggestion: '本章必须包含此内容',
        });
        score -= 15;
      }
    }

    // 2. 检查 forbiddenZones
    const forbiddenZones = directive.forbiddenZones || [];
    for (const zone of forbiddenZones) {
      if (this.checkForbiddenZone(content, zone)) {
        issues.push({
          type: 'contract',
          severity: 'critical',
          location: '全文',
          description: `违反禁区: "${zone.slice(0, 50)}"`,
          evidence: zone,
          suggestion: '必须避免此内容',
        });
        score -= 20;
      }
    }

    // 3. 检查结构化节点
    if (directive.CBN && !this.checkNodeCovered(content, directive.CBN)) {
      warnings.push({
        type: 'contract',
        severity: 'medium',
        location: '开头',
        description: '章节开始节点 (CBN) 可能未覆盖',
        evidence: directive.CBN,
        suggestion: '确保章节从 CBN 开始',
      });
      score -= 5;
    }

    if (directive.CEN && !this.checkNodeCovered(content, directive.CEN)) {
      warnings.push({
        type: 'contract',
        severity: 'medium',
        location: '结尾',
        description: '章节结束节点 (CEN) 可能未覆盖',
        evidence: directive.CEN,
        suggestion: '确保章节以 CEN 结束',
      });
      score -= 5;
    }

    return {
      issues,
      warnings,
      score: Math.max(0, score),
    };
  }

  /**
   * 检查 AI 味
   */
  private async checkAntiAI(
    content: string,
    antiPatterns?: string[]
  ): Promise<{ issues: ReviewIssue[]; warnings: ReviewIssue[]; score: number; detection: DeAIDetectionResult }> {
    const issues: ReviewIssue[] = [];
    const warnings: ReviewIssue[] = [];

    // 使用 DeAIService 检测
    const detection = await this.deAIService.detect(content);

    // 1. 处理禁用词问题
    for (const issue of detection.issues.filter((i) => i.severity === 'high')) {
      issues.push({
        type: 'anti_ai',
        severity: 'high',
        location: issue.position,
        description: `发现AI味: ${issue.suggestion}`,
        evidence: issue.original,
        suggestion: issue.suggestion,
      });
    }

    // 2. 处理中等问题
    for (const issue of detection.issues.filter((i) => i.severity === 'medium')) {
      warnings.push({
        type: 'anti_ai',
        severity: 'medium',
        location: issue.position,
        description: `可能存在AI味: ${issue.suggestion}`,
        evidence: issue.original,
        suggestion: issue.suggestion,
      });
    }

    // 3. 处理反模式
    if (antiPatterns && antiPatterns.length > 0) {
      for (const pattern of antiPatterns) {
        const matches = content.match(new RegExp(pattern, 'g'));
        if (matches && matches.length > 0) {
          issues.push({
            type: 'anti_ai',
            severity: 'high',
            location: '全文',
            description: `发现项目避雷模式: ${pattern}`,
            evidence: matches[0],
            suggestion: '修改或替换此表达',
          });
        }
      }
    }

    // 计算分数
    let score = 100;
    score -= issues.filter((i) => i.severity === 'critical').length * 20;
    score -= issues.filter((i) => i.severity === 'high').length * 10;
    score -= warnings.length * 3;

    return {
      issues,
      warnings,
      score: Math.max(0, score),
      detection,
    };
  }

  /**
   * 检查逻辑一致性
   */
  private async checkLogic(content: string): Promise<{ issues: ReviewIssue[]; warnings: ReviewIssue[]; score: number }> {
    const issues: ReviewIssue[] = [];
    const warnings: ReviewIssue[] = [];
    let score = 100;

    // 1. 检测因果矛盾
    const contradictions = this.detectContradictions(content);
    if (contradictions.length > 0) {
      issues.push({
        type: 'logic',
        severity: 'high',
        location: '全文',
        description: '发现逻辑矛盾',
        evidence: contradictions.slice(0, 2).join('; '),
        suggestion: '修正逻辑矛盾',
      });
      score -= 15;
    }

    // 2. 检测角色行为矛盾
    const behaviorIssues = this.detectBehaviorContradictions(content);
    if (behaviorIssues.length > 0) {
      warnings.push({
        type: 'logic',
        severity: 'medium',
        location: '全文',
        description: '可能存在角色行为矛盾',
        evidence: behaviorIssues[0] || '',
        suggestion: '检查角色行为是否一致',
      });
      score -= 10;
    }

    // 3. 检测知识范围问题（角色知道不该知道的）
    const knowledgeIssues = this.detectKnowledgeRangeIssues(content);
    if (knowledgeIssues.length > 0) {
      warnings.push({
        type: 'logic',
        severity: 'low',
        location: '全文',
        description: '可能存在角色知识范围问题',
        evidence: knowledgeIssues[0] || '',
        suggestion: '确保角色只知道应该知道的信息',
      });
      score -= 5;
    }

    return {
      issues,
      warnings,
      score: Math.max(0, score),
    };
  }

  /**
   * 检查节奏
   */
  private async checkPace(content: string): Promise<{ issues: ReviewIssue[]; warnings: ReviewIssue[]; score: number }> {
    const issues: ReviewIssue[] = [];
    const warnings: ReviewIssue[] = [];
    let score = 100;

    // 1. 检测长段落
    const paragraphs = content.split(/\n\s*\n/);
    const longParagraphs = paragraphs.filter((p) => p.length > 300);

    if (longParagraphs.length > paragraphs.length * 0.3) {
      warnings.push({
        type: 'pace',
        severity: 'medium',
        location: '全文',
        description: `长段落占比过高 (${Math.round((longParagraphs.length / paragraphs.length) * 100)}%)`,
        evidence: longParagraphs[0]?.slice(0, 100) || '',
        suggestion: '拆分长段落，增加可读性',
      });
      score -= 10;
    }

    // 2. 检测对话比例
    const dialogueRatio = this.calculateDialogueRatio(content);
    if (dialogueRatio < 0.2) {
      warnings.push({
        type: 'pace',
        severity: 'low',
        location: '全文',
        description: `对话比例偏低 (${Math.round(dialogueRatio * 100)}%)`,
        evidence: '',
        suggestion: '建议增加对话，目标30%-50%',
      });
      score -= 5;
    } else if (dialogueRatio > 0.6) {
      warnings.push({
        type: 'pace',
        severity: 'low',
        location: '全文',
        description: `对话比例偏高 (${Math.round(dialogueRatio * 100)}%)`,
        evidence: '',
        suggestion: '对话过多可能导致叙述不足',
      });
      score -= 5;
    }

    // 3. 检测节奏平坦
    const paceFlat = this.analyzePaceVariation(content);
    if (paceFlat > 0.7) {
      issues.push({
        type: 'pace',
        severity: 'high',
        location: '全文',
        description: '节奏过于平淡，缺乏起伏',
        evidence: '平缓段落占比过高',
        suggestion: '增加节奏变化：紧张-放松-紧张',
      });
      score -= 15;
    }

    return {
      issues,
      warnings,
      score: Math.max(0, score),
    };
  }

  /**
   * 检查钩子
   */
  private async checkHook(content: string, chapterNumber: number): Promise<{ issues: ReviewIssue[]; warnings: ReviewIssue[]; score: number }> {
    const issues: ReviewIssue[] = [];
    const warnings: ReviewIssue[] = [];
    let score = 100;

    // 1. 检查章首钩子
    const startHook = this.analyzeChapterStartHook(content.slice(0, 400));
    if (!startHook.valid) {
      issues.push({
        type: 'hook',
        severity: 'high',
        location: '开头400字',
        description: '章首缺少有效钩子',
        evidence: content.slice(0, 100),
        suggestion: startHook.suggestion,
      });
      score -= 20;
    } else {
      score += startHook.quality * 5;
    }

    // 2. 检查章尾钩子
    const endHook = this.analyzeChapterEndHook(this.extractLastParagraph(content));
    if (!endHook.valid) {
      issues.push({
        type: 'hook',
        severity: 'critical',
        location: '结尾',
        description: '章尾缺少悬念/钩子',
        evidence: content.slice(-100),
        suggestion: endHook.suggestion,
      });
      score -= 25;
    } else {
      score += endHook.quality * 5;
    }

    // 3. 检查中段脉冲
    const middlePulse = this.checkMiddlePulse(content);
    if (!middlePulse.has) {
      warnings.push({
        type: 'hook',
        severity: 'low',
        location: '800-1500字区间',
        description: '章节中段缺少节奏脉冲',
        evidence: '',
        suggestion: '建议在800-1500字区间增加小高潮或转折',
      });
      score -= 10;
    }

    return {
      issues,
      warnings,
      score: Math.max(0, Math.min(100, score)),
    };
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  private extractEnding(content: string): string {
    return content.slice(-500).trim();
  }

  private extractLastParagraph(content: string): string {
    const paragraphs = content.split(/\n\s*\n/);
    return paragraphs[paragraphs.length - 1] || '';
  }

  private checkContinuityAnchor(content: string, anchor: string): boolean {
    const anchorKeywords = anchor.match(/[\u4e00-\u9fa5]{2,}/g) || [];
    return anchorKeywords.some((keyword) => content.includes(keyword));
  }

  private extractCharacterMentions(content: string): string[] {
    const mentions = content.match(/[\u4e00-\u9fa5]{2,4}(?:说|道|问|答|喊|叫|看|想)/g) || [];
    return [...new Set(mentions.map((m) => m.replace(/(?:说|道|问|答|喊|叫|看|想)$/, '')))];
  }

  private checkTimeline(content: string): string[] {
    const issues: string[] = [];
    // 检测时间矛盾
    const conflictingTimes = content.match(/(?:已经|还没|尚未)[^。]*?(?:刚才|此时)/g);
    if (conflictingTimes) {
      issues.push(...conflictingTimes);
    }
    return issues;
  }

  private checkNodeCovered(content: string, node: string): boolean {
    const keywords = node.match(/[\u4e00-\u9fa5]{2,}/g) || [];
    return keywords.length === 0 || keywords.some((k) => content.includes(k));
  }

  private checkForbiddenZone(content: string, zone: string): boolean {
    return content.includes(zone);
  }

  private detectContradictions(content: string): string[] {
    const contradictions: string[] = [];
    // 简单检测：同一事件的不同描述
    // TODO: 增强检测逻辑
    return contradictions;
  }

  private detectBehaviorContradictions(content: string): string[] {
    const issues: string[] = [];
    // 检测角色行为的突然转变
    // TODO: 增强检测逻辑
    return issues;
  }

  private detectKnowledgeRangeIssues(content: string): string[] {
    const issues: string[] = [];
    // 检测角色知道不该知道的信息
    // TODO: 增强检测逻辑
    return issues;
  }

  private calculateDialogueRatio(content: string): number {
    const dialogues = content.match(/[""][^""]+[""]/g) || [];
    const dialogueLength = dialogues.join('').length;
    return dialogueLength / content.length;
  }

  private analyzePaceVariation(content: string): number {
    const paragraphs = content.split(/\n\s*\n/);
    const lengths = paragraphs.map((p) => p.length);
    if (lengths.length === 0) return 0;

    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const flatCount = lengths.filter((len) => Math.abs(len - avg) < avg * 0.2).length;
    return flatCount / paragraphs.length;
  }

  private analyzeChapterStartHook(text: string): { valid: boolean; quality: number; suggestion: string } {
    const hooks = [
      { pattern: /[？?!。].{0,50}$/s, weight: 0.3 },
      { pattern: /突然|蓦然|赫然/g, weight: 0.2 },
      { pattern: /[""][^""]+[""]/g, weight: 0.2 },
      { pattern: /[他她]{2,}/g, weight: 0.15 },
      { pattern: /【[^】]+】/g, weight: 0.15 },
    ];

    let totalWeight = 0;
    let valid = false;

    for (const hook of hooks) {
      if (hook.pattern.test(text)) {
        totalWeight += hook.weight;
        valid = true;
      }
    }

    return {
      valid,
      quality: totalWeight,
      suggestion: '建议在前100字内设置冲突、悬念或吸引点',
    };
  }

  private analyzeChapterEndHook(text: string): { valid: boolean; quality: number; suggestion: string } {
    const hooks = [
      { pattern: /[？!]{2,}/, weight: 0.3 },
      { pattern: /但|却|然而/, weight: 0.2 },
      { pattern: /不知道|难道|难道说/, weight: 0.2 },
      { pattern: /[：:]\s*[""][^""]+[""]\s*$/, weight: 0.2 },
      { pattern: /……|\.\.\./, weight: 0.1 },
    ];

    let totalWeight = 0;
    let valid = false;

    for (const hook of hooks) {
      if (hook.pattern.test(text)) {
        totalWeight += hook.weight;
        valid = true;
      }
    }

    return {
      valid,
      quality: totalWeight,
      suggestion: '建议在结尾设置悬念、转折或未完成动作',
    };
  }

  private checkMiddlePulse(content: string): { has: boolean; location?: string } {
    const middleSection = content.slice(800, 1500);
    if (!middleSection) return { has: true };

    const hasSuspense = /(?:突然|蓦然|就在此时)/.test(middleSection);
    const hasDialogue = /[""][^""]+[""]/.test(middleSection);
    const hasAction = /(?:动手|出手|转身|站起|躺下)/.test(middleSection);

    if (hasSuspense || (hasDialogue && hasAction)) {
      return { has: true };
    }

    return { has: false, location: '800-1500字区间' };
  }

  private countBlockingIssues(issues: ReviewIssue[]): number {
    return issues.filter(
      (i) =>
        i.severity === 'critical' ||
        (i.severity === 'high' && (i.type === 'contract' || i.type === 'anti_ai'))
    ).length;
  }

  private calculateOverallScore(
    continuity: { score: number },
    contract: { score: number },
    antiAI: { score: number },
    logic: { score: number },
    pace: { score: number },
    hook: { score: number }
  ): number {
    const scores = {
      continuity: continuity.score,
      contract: contract.score,
      anti_ai: antiAI.score,
      logic: logic.score,
      pace: pace.score,
      hook: hook.score,
    };

    let total = 0;
    for (const [dim, weight] of Object.entries(DIMENSION_WEIGHTS)) {
      total += scores[dim as ReviewDimension] * weight;
    }

    return Math.round(total);
  }

  private collectAntiPatternIssues(
    antiAI: { detection: DeAIDetectionResult },
    continuity: { issues: ReviewIssue[] },
    pace: { issues: ReviewIssue[] }
  ): AntiPatternIssue[] {
    const issues: AntiPatternIssue[] = [];

    // 从检测结果收集反模式
    const detection = antiAI.detection;
    if (detection.patternResults) {
      const patterns = detection.patternResults;

      if (patterns.highFrequency > 0) {
        issues.push({
          pattern: 'AI高频词',
          count: patterns.highFrequency,
          severity: 'high',
        });
      }

      if (patterns.tripleParallelism > 0) {
        issues.push({
          pattern: '三连排比',
          count: patterns.tripleParallelism,
          severity: 'medium',
        });
      }

      if (patterns.academicStyle > 0) {
        issues.push({
          pattern: '论文体',
          count: patterns.academicStyle,
          severity: 'high',
        });
      }
    }

    return issues;
  }

  private calculateMetrics(
    content: string,
    antiAI: { detection: DeAIDetectionResult },
    hook: { score: number },
    pace: { score: number }
  ): ReviewMetrics {
    return {
      wordCount: this.countChineseWords(content),
      dialogueRatio: Math.round(this.calculateDialogueRatio(content) * 100) / 100,
      antiAIFix: antiAI.detection.issueStats?.bannedWords || 0,
      hookQuality: hook.score,
      coolPointDensity: this.estimateCoolPointDensity(content),
    };
  }

  private countChineseWords(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    return chineseChars + englishWords;
  }

  private estimateCoolPointDensity(content: string): number {
    const patterns = [
      /(?:打脸|扬眉吐气|一雪前耻)/g,
      /(?:突破|晋升|升级)/g,
      /(?:原来|真相|揭秘)/g,
      /(?:反击|反杀|逆转)/g,
    ];

    let count = 0;
    for (const pattern of patterns) {
      const matches = content.match(pattern);
      count += matches?.length || 0;
    }

    const wordCount = this.countChineseWords(content);
    return wordCount > 0 ? Math.round(wordCount / Math.max(count, 1)) : 0;
  }
}

// ============================================================
// Composable 导出
// ============================================================

let reviewerAgentInstance: EnhancedReviewerAgent | null = null;

export function useEnhancedReviewerAgent(
  config?: Partial<ReviewerConfig>
): EnhancedReviewerAgent {
  if (!reviewerAgentInstance) {
    reviewerAgentInstance = new EnhancedReviewerAgent(config);
  }
  return reviewerAgentInstance;
}

export default EnhancedReviewerAgent;

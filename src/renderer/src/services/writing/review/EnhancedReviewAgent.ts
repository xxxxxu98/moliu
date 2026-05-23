/**
 * 增强版审查 Agent
 * 基于 webnovel-writer 架构
 * 
 * 增强内容：
 * 1. 六维审查增强（新增子维度）
 * 2. 阻断问题自动修复建议
 * 3. 多轮审查支持
 * 4. 审查历史追踪
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
import { AntiAIEnhancedService } from '../anti-ai-enhanced';
import type { AntiAIEnhancedResult } from '../anti-ai-enhanced';

// ============================================================
// 类型定义
// ============================================================

export interface EnhancedReviewConfig {
  /** 是否启用严格模式 */
  strictMode: boolean;
  /** 阻断阈值 */
  blockingThreshold: number;
  /** 通过阈值 */
  passThreshold: number;
  /** 是否自动修复 */
  autoFix: boolean;
  /** 审查深度 */
  depth: 'quick' | 'normal' | 'deep';
}

export interface ReviewCheckpoint {
  chapter: number;
  timestamp: string;
  result: ReviewResult;
  fixes: string[];
}

const DEFAULT_CONFIG: EnhancedReviewConfig = {
  strictMode: false,
  blockingThreshold: 0,
  passThreshold: 70,
  autoFix: false,
  depth: 'normal',
};

// ============================================================
// 审查 Agent 实现
// ============================================================

export class EnhancedReviewAgent {
  private contractManager = useContractManager();
  private config: EnhancedReviewConfig;
  private antiAI: AntiAIEnhancedService;
  private reviewHistory = ref<ReviewCheckpoint[]>([]);
  
  constructor(config?: Partial<EnhancedReviewConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.antiAI = new AntiAIEnhancedService();
  }
  
  /**
   * 执行增强审查
   */
  async review(
    chapterNumber: number,
    content: string,
    options?: {
      previousChapterContent?: string;
      contract?: ChapterContract;
    }
  ): Promise<ReviewResult> {
    // 1. 获取合同
    const contract = options?.contract || 
      await this.contractManager.loadChapterContract(chapterNumber);
    
    // 2. 执行六维审查
    const dimensions = await this.performEnhancedReview(
      content, 
      chapterNumber, 
      contract,
      options?.previousChapterContent
    );
    
    // 3. 检查合同符合度
    const contractScore = await this.checkContractCompliance(content, contract);
    dimensions.contractScore = contractScore;
    
    // 4. Anti-AI 检测
    const antiAIResult = await this.performAntiAIReview(content);
    
    // 5. 汇总问题
    const { allIssues, allWarnings, blockingCount } = this.aggregateIssues(dimensions);
    
    // 6. 计算总分
    const overallScore = this.calculateOverallScore(dimensions);
    
    // 7. 生成建议
    const suggestions = this.generateEnhancedSuggestions(dimensions, antiAIResult);
    
    // 8. 保存审查历史
    this.saveReviewHistory(chapterNumber, {
      overall: {
        pass: blockingCount === this.config.blockingThreshold && overallScore >= this.config.passThreshold,
        blockingCount,
        warningCount: allWarnings.length,
        score: overallScore,
        summary: '',
      },
      dimensions,
      blockingIssues: allIssues.filter(i => i.severity === 'critical'),
      warnings: allWarnings,
      suggestions,
    });
    
    return {
      overall: {
        pass: blockingCount === this.config.blockingThreshold && overallScore >= this.config.passThreshold,
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
   * 执行增强的六维审查
   */
  private async performEnhancedReview(
    content: string,
    chapterNumber: number,
    contract?: ChapterContract,
    previousChapterContent?: string
  ): Promise<ReviewDimensions> {
    const [
      continuity,
      hookScore,
      coolpointScore,
      paceScore,
      antiAI,
    ] = await Promise.all([
      this.checkContinuityEnhanced(content, contract, previousChapterContent),
      this.checkHookScoreEnhanced(content, chapterNumber),
      this.checkCoolPointScoreEnhanced(content),
      this.checkPaceScoreEnhanced(content),
      this.checkAntiAIEnhanced(content),
    ]);
    
    return {
      continuity,
      hookScore,
      coolpointScore,
      paceScore,
      antiAIScore: antiAI,
      contractScore: { score: 100, issues: [], warnings: [], isBlocking: false },
    };
  }
  
  // ============================================================
  // 增强的一致性检查
  // ============================================================
  
  private async checkContinuityEnhanced(
    content: string,
    contract?: ChapterContract,
    previousChapterContent?: string
  ): Promise<ReviewDimension> {
    const issues: ReviewIssue[] = [];
    const warnings: ReviewIssue[] = [];
    let score = 100;
    
    // 1. 前章结尾锚定检查
    if (contract?.directive.previousChapterEnding) {
      const anchor = contract.directive.previousChapterEnding;
      if (!this.checkTextAnchor(content, anchor)) {
        issues.push({
          type: 'continuity_anchor',
          severity: 'critical',
          location: '开头300字',
          description: '未明确衔接前章结尾',
          suggestion: `建议衔接：${anchor.slice(0, 50)}...`,
          evidence: anchor,
        });
        score -= 15;
      }
    }
    
    // 2. 人物一致性检查
    const characterMentions = this.extractCharacterMentions(content);
    const expectedCharacters = this.getExpectedCharacters(contract);
    
    for (const expected of expectedCharacters) {
      if (!characterMentions.includes(expected)) {
        warnings.push({
          type: 'character_missing',
          severity: 'warning',
          location: '全文',
          description: `预期出场角色"${expected}"未在本章出现`,
          suggestion: '如非刻意缺席，建议补充',
        });
        score -= 5;
      }
    }
    
    // 3. 地点一致性检查
    const locations = this.extractLocations(content);
    const expectedLocation = contract?.directive.locationAnchor;
    
    if (expectedLocation && locations.length > 0) {
      if (!locations.some(l => l.includes(expectedLocation))) {
        warnings.push({
          type: 'location_mismatch',
          severity: 'warning',
          location: '场景',
          description: `预期场景"${expectedLocation}"未找到`,
          suggestion: '检查场景转换是否正确',
        });
        score -= 5;
      }
    }
    
    // 4. 时间线检查
    const timeInconsistencies = this.checkTimeline(content);
    if (timeInconsistencies.length > 0) {
      warnings.push({
        type: 'timeline_issue',
        severity: 'warning',
        location: timeInconsistencies.map(t => t.location).join(', '),
        description: `发现${timeInconsistencies.length}处时间线问题`,
        suggestion: '统一时间线，确保时间流逝合理',
      });
      score -= 10;
    }
    
    return {
      score: Math.max(0, score),
      issues,
      warnings,
      isBlocking: score < 60,
    };
  }
  
  // ============================================================
  // 增强的钩子检查
  // ============================================================
  
  private async checkHookScoreEnhanced(
    content: string,
    chapterNumber: number
  ): Promise<ReviewDimension> {
    const issues: ReviewIssue[] = [];
    const warnings: ReviewIssue[] = [];
    let score = 80;
    
    // 1. 章首钩子检查
    const firstParagraph = content.slice(0, 400);
    const startHook = this.analyzeChapterStartHook(firstParagraph);
    
    if (!startHook.valid) {
      issues.push({
        type: 'weak_chapter_start',
        severity: 'critical',
        location: '开头400字',
        description: '章首缺少有效钩子',
        suggestion: startHook.suggestion,
        evidence: firstParagraph.slice(0, 100),
      });
      score -= 20;
    } else {
      score += startHook.quality * 5; // 最高加5分
    }
    
    // 2. 章尾钩子检查
    const lastParagraph = this.extractLastParagraph(content);
    const endHook = this.analyzeChapterEndHook(lastParagraph);
    
    if (!endHook.valid) {
      issues.push({
        type: 'weak_chapter_end',
        severity: 'high',
        location: '结尾',
        description: '章尾缺少悬念/钩子',
        suggestion: endHook.suggestion,
        evidence: lastParagraph.slice(-100),
      });
      score -= 15;
    } else {
      score += endHook.quality * 5;
    }
    
    // 3. 中间节奏检查
    const middlePulse = this.checkMiddlePulse(content);
    if (!middlePulse.hasPulse) {
      warnings.push({
        type: 'flat_middle',
        severity: 'warning',
        location: '800-1500字区间',
        description: '章节中段缺少节奏脉冲',
        suggestion: '建议在800-1500字区间增加一个小高潮或转折',
      });
      score -= 10;
    }
    
    return {
      score: Math.max(0, Math.min(100, score)),
      issues,
      warnings,
      isBlocking: score < 60,
    };
  }
  
  // ============================================================
  // 增强的爽点检查
  // ============================================================
  
  private async checkCoolPointScoreEnhanced(
    content: string
  ): Promise<ReviewDimension> {
    const issues: ReviewIssue[] = [];
    const warnings: ReviewIssue[] = [];
    let score = 75;
    
    const wordCount = content.length;
    const coolPoints = this.extractCoolPoints(content);
    const expectedDensity = 3000; // 每3000字一个爽点
    
    // 1. 爽点密度检查
    const actualDensity = wordCount / Math.max(coolPoints.length, 1);
    
    if (actualDensity > expectedDensity * 1.5) {
      warnings.push({
        type: 'low_coolpoint_density',
        severity: 'warning',
        location: '全文',
        description: `爽点密度偏低（约${Math.round(actualDensity)}字/爽点）`,
        suggestion: '建议增加爽点密度，目标3000字/爽点',
      });
      score -= 10;
    } else if (actualDensity < expectedDensity * 0.5) {
      warnings.push({
        type: 'high_coolpoint_density',
        severity: 'info',
        location: '全文',
        description: `爽点密度偏高（约${Math.round(actualDensity)}字/爽点）`,
        suggestion: '爽点过密可能导致读者疲劳',
      });
    }
    
    // 2. 爽点类型多样性检查
    const coolPointTypes = new Set(coolPoints.map(c => c.type));
    if (coolPointTypes.size < 2 && coolPoints.length >= 3) {
      warnings.push({
        type: 'monotonous_coolpoints',
        severity: 'warning',
        location: '全文',
        description: '爽点类型单一',
        suggestion: '建议增加爽点类型多样性（打脸、逆袭、揭秘等）',
      });
      score -= 5;
    }
    
    return {
      score: Math.max(0, Math.min(100, score)),
      issues,
      warnings,
      isBlocking: score < 50,
    };
  }
  
  // ============================================================
  // 增强的节奏检查
  // ============================================================
  
  private async checkPaceScoreEnhanced(
    content: string
  ): Promise<ReviewDimension> {
    const issues: ReviewIssue[] = [];
    const warnings: ReviewIssue[] = [];
    let score = 75;
    
    // 1. 段落长度检查
    const paragraphs = content.split(/\n\s*\n/);
    const longParagraphs = paragraphs.filter(p => p.length > 300);
    
    if (longParagraphs.length > paragraphs.length * 0.3) {
      warnings.push({
        type: 'long_paragraphs',
        severity: 'warning',
        location: '全文',
        description: `长段落占比过高（${Math.round(longParagraphs.length / paragraphs.length * 100)}%）`,
        suggestion: '建议拆分长段落，增加可读性',
      });
      score -= 10;
    }
    
    // 2. 节奏变化检查
    const paceProfile = this.analyzePaceProfile(content);
    
    if (paceProfile.flatRatio > 0.7) {
      issues.push({
        type: 'flat_pacing',
        severity: 'high',
        location: '全文',
        description: '节奏过于平淡，缺乏起伏',
        suggestion: '建议增加节奏变化：紧张-放松-紧张',
        evidence: `平缓段落占比${Math.round(paceProfile.flatRatio * 100)}%`,
      });
      score -= 15;
    }
    
    // 3. 对话比例检查
    const dialogueRatio = this.calculateDialogueRatio(content);
    if (dialogueRatio < 0.2) {
      warnings.push({
        type: 'low_dialogue_ratio',
        severity: 'warning',
        location: '全文',
        description: `对话比例偏低（${Math.round(dialogueRatio * 100)}%）`,
        suggestion: '建议增加对话比例，目标30%-50%',
      });
      score -= 5;
    } else if (dialogueRatio > 0.6) {
      warnings.push({
        type: 'high_dialogue_ratio',
        severity: 'info',
        location: '全文',
        description: `对话比例偏高（${Math.round(dialogueRatio * 100)}%）`,
        suggestion: '对话过多可能导致叙述不足',
      });
    }
    
    return {
      score: Math.max(0, Math.min(100, score)),
      issues,
      warnings,
      isBlocking: score < 50,
    };
  }
  
  // ============================================================
  // 增强的 Anti-AI 检查
  // ============================================================
  
  private async checkAntiAIEnhanced(
    content: string
  ): Promise<ReviewDimension> {
    const result = await this.antiAI.fix(content);
    const issues: ReviewIssue[] = [];
    const warnings: ReviewIssue[] = [];
    
    // 根据7层规则统计问题
    const { layerStats } = result;
    
    if (layerStats.layer1_banned > 0) {
      issues.push({
        type: 'banned_content',
        severity: 'critical',
        location: '全文',
        description: `发现${layerStats.layer1_banned}处禁用内容`,
        suggestion: '必须替换所有禁用内容',
      });
    }
    
    if (layerStats.layer2_highRisk > 0) {
      warnings.push({
        type: 'high_risk_patterns',
        severity: 'high',
        location: '全文',
        description: `发现${layerStats.layer2_highRisk}处高风险模式`,
        suggestion: '建议修改三段式枚举、AI惯用词等',
      });
    }
    
    if (layerStats.layer3_sentence > 0) {
      warnings.push({
        type: 'ai_sentence_patterns',
        severity: 'medium',
        location: '全文',
        description: `发现${layerStats.layer3_sentence}处AI句式模式`,
        suggestion: '建议拆分长句、增加句式变化',
      });
    }
    
    // 计算分数
    let score = 100;
    score -= layerStats.layer1_banned * 20;
    score -= layerStats.layer2_highRisk * 5;
    score -= layerStats.layer3_sentence * 3;
    score -= layerStats.layer4_dialogue * 2;
    score -= layerStats.layer5_paragraph * 2;
    score -= layerStats.layer6_punctuation * 1;
    score -= layerStats.layer7_rewrite * 5;
    
    return {
      score: Math.max(0, Math.min(100, score)),
      issues,
      warnings,
      isBlocking: score < 60,
    };
  }
  
  // ============================================================
  // 合同符合度检查
  // ============================================================
  
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
    
    // 1. 必须覆盖节点检查
    const mustCover = contract.directive.mustCover || [];
    for (const node of mustCover) {
      if (!this.checkNodeCovered(content, node)) {
        issues.push({
          type: 'missing_must_cover',
          severity: 'critical',
          location: '全文',
          description: `必须覆盖节点"${node.slice(0, 30)}..."未找到`,
          suggestion: '本章必须包含此内容',
        });
        score -= 10;
      }
    }
    
    // 2. 禁区检查
    const forbiddenZones = contract.directive.forbiddenZones || [];
    for (const zone of forbiddenZones) {
      if (this.checkForbiddenZone(content, zone)) {
        issues.push({
          type: 'forbidden_zone_violated',
          severity: 'critical',
          location: '全文',
          description: `违反禁区："${zone.slice(0, 30)}..."`,
          suggestion: '必须避免此内容',
        });
        score -= 15;
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
  // Anti-AI 审查
  // ============================================================
  
  private async performAntiAIReview(
    content: string
  ): Promise<AntiAIEnhancedResult> {
    return await this.antiAI.fix(content);
  }
  
  // ============================================================
  // 辅助方法
  // ============================================================
  
  private checkTextAnchor(content: string, anchor: string): boolean {
    const anchorKeywords = anchor.match(/[\u4e00-\u9fa5]{2,}/g) || [];
    return anchorKeywords.some(keyword => content.includes(keyword));
  }
  
  private extractCharacterMentions(content: string): string[] {
    const mentions = content.match(/[\u4e00-\u9fa5]{2,4}(?:说|道|问|答|喊|叫|看|想)/g) || [];
    return [...new Set(mentions.map(m => m.replace(/(?:说|道|问|答|喊|叫|看|想)$/, '')))];
  }
  
  private getExpectedCharacters(contract?: ChapterContract): string[] {
    return contract?.characters?.map(c => c.name) || [];
  }
  
  private extractLocations(content: string): string[] {
    const locationPatterns = [
      /(?:在|来到|走进|位于|处于)([^，。,]+?)(?:，|。|$)/g,
      /【([^】]+)】/g,
    ];
    
    const locations: string[] = [];
    for (const pattern of locationPatterns) {
      const matches = content.match(pattern) || [];
      locations.push(...matches.map(m => m.replace(/^[^【在来到位于处于]+/, '').replace(/[【】]/g, '')));
    }
    
    return [...new Set(locations)];
  }
  
  private checkTimeline(content: string): Array<{ location: string; issue: string }> {
    const issues: Array<{ location: string; issue: string }> = [];
    
    // 检测时间矛盾
    const timeMentions = content.match(/(?:刚才|此时|当时|而后|之后|很快)/g) || [];
    const conflictingTimes = content.match(/(?:已经|还没|尚未)[^。]*?(?:刚才|此时)/g);
    
    if (conflictingTimes && conflictingTimes.length > 0) {
      issues.push({
        location: '时间描述',
        issue: '存在时间矛盾',
      });
    }
    
    return issues;
  }
  
  private analyzeChapterStartHook(text: string): { valid: boolean; quality: number; suggestion: string } {
    const hooks = [
      { pattern: /[？?!。].{0,50}$/s, weight: 0.3 }, // 疑问/感叹结尾
      { pattern: /突然|蓦然|赫然/g, weight: 0.2 }, // 突然性
      { pattern: /["""][^"""]+["""]/g, weight: 0.2 }, // 对话开头
      { pattern: /[他她]/{2,}/g, weight: 0.15 }, // 动作开头
      { pattern: /【[^】]+】/g, weight: 0.15 }, // 场景标记
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
      { pattern: /[？!]{2,}/, weight: 0.3 }, // 连续标点
      { pattern: /但|却|然而/, weight: 0.2 }, // 转折
      { pattern: /不知道|难道|难道说/, weight: 0.2 }, // 疑问
      { pattern: /[：:]\s*["""][^"""]+["""]\s*$/, weight: 0.2 }, // 未完成对话
      { pattern: /……|\.\.\./, weight: 0.1 }, // 省略号
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
  
  private checkMiddlePulse(content: string): { hasPulse: boolean; location?: string } {
    const middleSection = content.slice(800, 1500);
    
    // 检测是否有节奏变化
    const hasSuspense = /(?:突然|蓦然|就在此时)/.test(middleSection);
    const hasDialogue = /["""][^"""]+["""]/.test(middleSection);
    const hasAction = /(?:动手|出手|转身|站起|躺下)/.test(middleSection);
    
    if (hasSuspense || (hasDialogue && hasAction)) {
      return { hasPulse: true };
    }
    
    return { hasPulse: false, location: '800-1500字区间' };
  }
  
  private extractCoolPoints(content: string): Array<{ type: string; location: number }> {
    const patterns = [
      { type: 'slap_face', pattern: /(?:打脸|扬眉吐气|一雪前耻)/g },
      { type: 'breakthrough', pattern: /(?:突破|晋升|升级)/g },
      { type: 'revelation', pattern: /(?:原来|真相|揭秘)/g },
      { type: 'counterattack', pattern: /(?:反击|反杀|逆转)/g },
    ];
    
    const coolPoints: Array<{ type: string; location: number }> = [];
    
    for (const { type, pattern } of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        coolPoints.push({ type, location: match.index });
      }
    }
    
    return coolPoints;
  }
  
  private analyzePaceProfile(content: string): { flatRatio: number; variation: number } {
    const paragraphs = content.split(/\n\s*\n/);
    const lengths = paragraphs.map(p => p.length);
    
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, len) => sum + Math.pow(len - avg, 2), 0) / lengths.length;
    
    // 计算平缓段落比例（长度接近平均值的段落）
    const flatCount = lengths.filter(len => Math.abs(len - avg) < avg * 0.2).length;
    
    return {
      flatRatio: flatCount / paragraphs.length,
      variation: Math.sqrt(variance),
    };
  }
  
  private calculateDialogueRatio(content: string): number {
    const dialogues = content.match(/["""][^"""]+["""]/g) || [];
    const dialogueLength = dialogues.join('').length;
    return dialogueLength / content.length;
  }
  
  private extractLastParagraph(content: string): string {
    const paragraphs = content.split(/\n\s*\n/);
    return paragraphs[paragraphs.length - 1] || '';
  }
  
  private checkNodeCovered(content: string, node: string): boolean {
    const keywords = node.match(/[\u4e00-\u9fa5]{2,}/g) || [];
    return keywords.length > 0 && keywords.some(k => content.includes(k));
  }
  
  private checkForbiddenZone(content: string, zone: string): boolean {
    return content.includes(zone);
  }
  
  // ============================================================
  // 结果汇总
  // ============================================================
  
  private aggregateIssues(dimensions: ReviewDimensions): {
    allIssues: ReviewIssue[];
    allWarnings: ReviewIssue[];
    blockingCount: number;
  } {
    const allIssues: ReviewIssue[] = [];
    const allWarnings: ReviewIssue[] = [];
    let blockingCount = 0;
    
    for (const dim of Object.values(dimensions)) {
      allIssues.push(...dim.issues);
      allWarnings.push(...dim.warnings);
      if (dim.isBlocking) blockingCount++;
    }
    
    return { allIssues, allWarnings, blockingCount };
  }
  
  private calculateOverallScore(dimensions: ReviewDimensions): number {
    const dimensionScores = Object.values(dimensions).map(d => d.score);
    return Math.round(dimensionScores.reduce((a, b) => a + b, 0) / dimensionScores.length);
  }
  
  private generateSummary(blockingCount: number, score: number): string {
    if (blockingCount > 0) {
      return `审查未通过：发现${blockingCount}个阻断问题`;
    }
    if (score >= 85) {
      return '审查通过：优秀';
    }
    if (score >= 70) {
      return '审查通过：合格';
    }
    return `审查未通过：总分${score}分，低于70分阈值`;
  }
  
  private generateEnhancedSuggestions(
    dimensions: ReviewDimensions,
    antiAIResult: AntiAIEnhancedResult
  ): ReviewSuggestion[] {
    const suggestions: ReviewSuggestion[] = [];
    
    // 从各维度生成建议
    for (const [dimName, dim] of Object.entries(dimensions)) {
      if (dim.score < 75) {
        suggestions.push({
          dimension: dimName,
          type: 'improvement',
          description: `${dimName}维度得分偏低（${dim.score}分）`,
          priority: dim.score < 60 ? 'high' : 'medium',
        });
      }
      
      for (const issue of dim.issues) {
        suggestions.push({
          dimension: dimName,
          type: issue.type,
          description: issue.suggestion,
          priority: issue.severity === 'critical' ? 'high' : 'medium',
        });
      }
    }
    
    // Anti-AI 建议
    if (!antiAIResult.pass) {
      suggestions.push({
        dimension: 'antiAI',
        type: 'anti_ai_check',
        description: '去AI味检查未通过，建议修改高风险表达',
        priority: 'high',
      });
    }
    
    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }
  
  private saveReviewHistory(chapter: number, result: ReviewResult): void {
    this.reviewHistory.value.push({
      chapter,
      timestamp: new Date().toISOString(),
      result,
      fixes: [],
    });
    
    // 限制历史长度
    if (this.reviewHistory.value.length > 100) {
      this.reviewHistory.value = this.reviewHistory.value.slice(-100);
    }
  }
  
  /**
   * 获取审查历史
   */
  getReviewHistory(): ReviewCheckpoint[] {
    return [...this.reviewHistory.value];
  }
  
  /**
   * 更新配置
   */
  updateConfig(config: Partial<EnhancedReviewConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================
// 导出
// ============================================================

export { EnhancedReviewAgent };
export type { EnhancedReviewConfig, ReviewCheckpoint };

// Composable 导出
export { useEnhancedReviewAgent };

/**
 * 写作流水线
 * 基于 webnovel-writer 架构的重构
 * 
 * 六步流程：TaskBook → Draft → Review → Polish → Commit → Backup
 * 
 * 核心改进：
 * 1. 智能重试循环 - 审查失败携带建议重新起草
 * 2. 分级降级机制 - 根据问题类型启用不同策略
 * 3. 自动修复 - 可自动修复的问题自动处理
 */

import { ref, computed } from 'vue';
import type {
  PipelineConfig,
  PipelineResult,
  PipelineEvent,
  PipelineListener,
  WritingStep,
  PipelineStatus,
  TaskBook,
  ReviewResult,
  PolishResult,
  CommitResult,
  StepResult,
} from './types';
import { DEFAULT_PIPELINE_CONFIG, WritingStep as Step } from './types';
import { TaskBookBuilder } from '../taskbook/TaskBookBuilder';
import { DraftAgent } from './DraftAgent';
import { ReviewAgent } from '../review/ReviewAgent';
import { PolishAgent } from '../polish/PolishAgent';
import { ChapterCommitManager } from '../commit/ChapterCommitManager';
import { GitBackupManager } from '../backup/GitBackupManager';
import { RevisionHintBuilder, type RevisionHints, type RevisionContext } from '../review/RevisionHintBuilder';
import { AntiAIService } from '../anti-ai-enhanced';

// ============================================================
// 退出条件配置
// ============================================================

export interface ExitCondition {
  /** 最大重试次数 */
  maxRetries: number;
  /** 最低分数阈值 */
  minScore: number;
  /** 时间限制（毫秒） */
  timeLimit: number;
  /** 允许 AI 味问题降级通过 */
  allowAIFlavorDegradedPass: boolean;
  /** 允许中等严重度问题降级通过 */
  allowMediumDegradedPass: boolean;
}

export const DEFAULT_EXIT_CONDITION: ExitCondition = {
  maxRetries: 3,
  minScore: 70,
  timeLimit: 5 * 60 * 1000,  // 5 分钟
  allowAIFlavorDegradedPass: true,
  allowMediumDegradedPass: false,
};

// ============================================================
// 流水线状态
// ============================================================

interface PipelineState {
  /** 当前状态 */
  status: PipelineStatus;
  /** 当前步骤 */
  currentStep: WritingStep | null;
  /** 当前章节 */
  currentChapter: number;
  /** 重试次数 */
  retryCount: number;
  /** 开始时间 */
  startTime: number;
  /** 审查历史 */
  reviewHistory: ReviewResult[];
  /** 最终草稿 */
  finalDraft: string;
}

// ============================================================
// 流水线
// ============================================================

export class WritingPipeline {
  // 配置
  private config: PipelineConfig;
  private exitCondition: ExitCondition;
  
  // 状态
  private state = ref<PipelineState>({
    status: PipelineStatus.IDLE,
    currentStep: null,
    currentChapter: 0,
    retryCount: 0,
    startTime: 0,
    reviewHistory: [],
    finalDraft: '',
  });
  private listeners = new Set<PipelineListener>();
  
  // 子系统
  private taskBookBuilder: TaskBookBuilder;
  private draftAgent: DraftAgent;
  private reviewAgent: ReviewAgent;
  private polishAgent: PolishAgent;
  private commitManager: ChapterCommitManager;
  private backupManager: GitBackupManager;
  private revisionHintBuilder: RevisionHintBuilder;
  private antiAIService: AntiAIService;
  
  // 内部状态
  private abortController: AbortController | null = null;
  
  constructor(config: Partial<PipelineConfig> = {}, exitCondition?: Partial<ExitCondition>) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
    this.exitCondition = { ...DEFAULT_EXIT_CONDITION, ...exitCondition };
    
    // 初始化子系统
    this.taskBookBuilder = new TaskBookBuilder();
    this.draftAgent = new DraftAgent();
    this.reviewAgent = new ReviewAgent();
    this.polishAgent = new PolishAgent();
    this.commitManager = new ChapterCommitManager();
    this.backupManager = new GitBackupManager();
    this.revisionHintBuilder = new RevisionHintBuilder();
    this.antiAIService = new AntiAIService({ intensity: 'moderate' });
  }
  
  // ============================================================
  // 公开 API
  // ============================================================
  
  /**
   * 执行流水线（智能重试版）
   */
  async execute(
    chapterNumber: number,
    context: any,
    overrideConfig?: Partial<PipelineConfig>
  ): Promise<PipelineResult> {
    const cfg = { ...this.config, ...overrideConfig };
    const startTime = Date.now();
    const steps: StepResult[] = [];
    
    // 重置状态
    this.state.value = {
      status: PipelineStatus.RUNNING,
      currentStep: null,
      currentChapter: chapterNumber,
      retryCount: 0,
      startTime,
      reviewHistory: [],
      finalDraft: '',
    };
    this.abortController = new AbortController();
    
    this.emit({
      type: 'step_start',
      chapterNumber,
      step: null,
      timestamp: new Date().toISOString(),
    });
    
    try {
      let taskBook: TaskBook | undefined;
      let draft = '';
      let wordCount = 0;
      let reviewResult: ReviewResult | undefined;
      let revisionHints: RevisionHints | undefined;
      
      // ============================================================
      // Step 1: 生成任务书
      // ============================================================
      if (cfg.enableTaskBook) {
        const stepResult = await this.executeStep(
          Step.TASK_BOOK,
          async () => {
            taskBook = await this.taskBookBuilder.build(chapterNumber, context);
            return { taskBook };
          }
        );
        steps.push(stepResult);
        
        if (!stepResult.success) {
          throw new Error(`任务书生成失败: ${stepResult.error}`);
        }
      }
      
      // ============================================================
      // Step 2: 起草（支持智能重试）
      // ============================================================
      const draftResult = await this.executeDraftWithRetry(
        chapterNumber,
        taskBook!,
        context,
        cfg
      );
      draft = draftResult.content;
      wordCount = draftResult.wordCount;
      
      steps.push({
        step: Step.DRAFT,
        success: true,
        data: { content: draft, wordCount, retryCount: this.state.value.retryCount },
        duration: draftResult.duration,
      });
      
      // ============================================================
      // Step 3: 审查（包含在起草流程中）
      // ============================================================
      // 审查已经在重试循环中完成，这里记录最终结果
      if (this.state.value.reviewHistory.length > 0) {
        reviewResult = this.state.value.reviewHistory[this.state.value.reviewHistory.length - 1];
        revisionHints = this.state.value.reviewHistory[0] ? 
          this.revisionHintBuilder.build({
            reviewResult: this.state.value.reviewHistory[0],
            chapterNumber,
            contract: context.contract,
            attemptNumber: 1,
          }) : undefined;
      }
      
      // ============================================================
      // Step 4: 润色
      // ============================================================
      if (cfg.enablePolish) {
        const step4Result = await this.executeStep(
          Step.POLISH,
          async () => {
            // 使用最终审查结果进行润色
            const polishResult = await this.polishAgent.polish(draft, taskBook!, {
              reviewResult,
              revisionHints,
            });
            draft = polishResult.polishedContent;
            
            return { polishResult };
          }
        );
        steps.push(step4Result);
        
        if (!step4Result.success) {
          console.warn('[Pipeline] 润色失败，继续流程');
        }
      }
      
      // ============================================================
      // Step 5: 提交
      // ============================================================
      let commitResult: CommitResult | undefined;
      if (cfg.enableCommit) {
        const step5Result = await this.executeStep(
          Step.COMMIT,
          async () => {
            commitResult = await this.commitManager.commit(
              chapterNumber,
              reviewResult!,
              draft
            );
            return { commitResult };
          }
        );
        steps.push(step5Result);
        
        if (!step5Result.success) {
          console.warn('Commit 失败:', step5Result.error);
        }
      }
      
      // ============================================================
      // Step 6: 备份
      // ============================================================
      if (cfg.enableBackup) {
        const step6Result = await this.executeStep(
          Step.BACKUP,
          async () => {
            const backupResult = await this.backupManager.backup(
              chapterNumber,
              draft,
              taskBook?.opening.chapterTitle || `第${chapterNumber}章`
            );
            return backupResult;
          }
        );
        steps.push(step6Result);
      }
      
      // 保存最终草稿
      this.state.value.finalDraft = draft;
      
      // 完成
      this.state.value.status = PipelineStatus.COMPLETED;
      
      this.emit({
        type: 'pipeline_complete',
        chapterNumber,
        data: { steps },
        timestamp: new Date().toISOString(),
      });
      
      return {
        chapterNumber,
        status: this.state.value.status,
        steps,
        finalContent: draft,
        finalWordCount: wordCount,
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
      };
      
    } catch (error) {
      this.state.value.status = PipelineStatus.FAILED;
      
      this.emit({
        type: 'pipeline_error',
        chapterNumber,
        error: String(error),
        timestamp: new Date().toISOString(),
      });
      
      return {
        chapterNumber,
        status: this.state.value.status,
        steps,
        finalContent: this.state.value.finalDraft || '',
        finalWordCount: this.state.value.finalDraft.length,
        error: String(error),
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * 智能重试循环
   * 
   * 核心逻辑：
   * 1. 起草 → 审查
   * 2. 审查通过？ → 通过
   * 3. 审查失败？ → 分析问题类型
   *    - 可自动修复 → 自动修复 → 重新审查
   *    - 需要重新起草 → 携带建议重新起草
   *    - 超出重试限制 → 降级处理或终止
   */
  private async executeDraftWithRetry(
    chapterNumber: number,
    taskBook: TaskBook,
    context: any,
    cfg: PipelineConfig
  ): Promise<{ content: string; wordCount: number; duration: number }> {
    const startTime = Date.now();
    let draft = '';
    let bestDraft = '';
    let bestReviewResult: ReviewResult | null = null;
    let revisionHints: RevisionHints | undefined;
    
    for (let attempt = 1; attempt <= this.exitCondition.maxRetries; attempt++) {
      this.state.value.retryCount = attempt - 1;
      const attemptStartTime = Date.now();
      
      console.log(`[Pipeline] 第 ${attempt} 次起草开始`);
      
      // 1. 起草（携带审查反馈）
      const draftResult = await this.draftAgent.draftWithHints(taskBook, context, revisionHints);
      draft = draftResult.content;
      
      // 2. 审查
      const reviewResult = await this.reviewAgent.review(chapterNumber, draft, {
        previousChapterContent: context.previousChapter?.content,
        contract: context.contract,
      });
      
      // 记录审查历史
      this.state.value.reviewHistory.push(reviewResult);
      
      console.log(`[Pipeline] 第 ${attempt} 次审查完成:`, {
        pass: reviewResult.overall.pass,
        score: reviewResult.overall.score,
        blockingCount: reviewResult.overall.blockingCount,
      });
      
      // 3. 检查是否通过
      if (reviewResult.overall.pass) {
        console.log(`[Pipeline] 第 ${attempt} 次审查通过`);
        bestDraft = draft;
        bestReviewResult = reviewResult;
        break;
      }
      
      // 4. 审查失败，分析问题
      const analysis = this.analyzeReviewFailure(reviewResult);
      
      // 5. 检查是否应该继续重试
      if (!this.shouldContinueRetry(attempt, analysis, reviewResult)) {
        console.log(`[Pipeline] 达到退出条件，停止重试`);
        break;
      }
      
      // 6. 构建下次起草的反馈提示
      revisionHints = this.revisionHintBuilder.build({
        reviewResult,
        chapterNumber,
        contract: context.contract,
        currentDraft: draft,
        attemptNumber: attempt,
      });
      
      // 7. 尝试自动修复（如果可能）
      if (analysis.canAutoFix) {
        draft = await this.autoFixDraft(draft, reviewResult);
        console.log(`[Pipeline] 自动修复完成`);
      }
      
      // 8. 记录最佳结果
      if (!bestReviewResult || reviewResult.overall.score > bestReviewResult.overall.score) {
        bestDraft = draft;
        bestReviewResult = reviewResult;
      }
      
      const attemptDuration = Date.now() - attemptStartTime;
      console.log(`[Pipeline] 第 ${attempt} 次尝试耗时: ${attemptDuration}ms`);
      
      // 9. 检查时间限制
      if (Date.now() - this.state.value.startTime > this.exitCondition.timeLimit) {
        console.log(`[Pipeline] 达到时间限制，停止重试`);
        break;
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`[Pipeline] 起草阶段完成:`, {
      totalAttempts: this.state.value.retryCount + 1,
      totalDuration: duration,
      finalScore: bestReviewResult?.overall.score,
    });
    
    return {
      content: bestDraft || draft,
      wordCount: (bestDraft || draft).length,
      duration,
    };
  }

  /**
   * 分析审查失败
   */
  private analyzeReviewFailure(reviewResult: ReviewResult): ReviewFailureAnalysis {
    const analysis: ReviewFailureAnalysis = {
      blockingCount: reviewResult.overall.blockingCount,
      score: reviewResult.overall.score,
      blockingIssues: reviewResult.blockingIssues,
      highPriorityIssues: reviewResult.warnings.filter(w => 
        w.severity === 'high' || w.severity === 'critical'
      ),
      canAutoFix: false,
      shouldRewrite: false,
      isAIFlavorOnly: false,
      allIssues: [...reviewResult.blockingIssues, ...reviewResult.warnings],
    };
    
    // 判断是否全为 AI 味问题
    const aiFlavorTypes = ['ai_sentence_patterns', 'high_risk_patterns', 'banned_content', 
      'ai_pattern', 'anti_ai_check', 'ai_flavor', 'banned_content'];
    analysis.isAIFlavorOnly = analysis.allIssues.every(i => 
      aiFlavorTypes.includes(i.type)
    );
    
    // 判断是否可自动修复
    const autoFixableTypes = ['ai_sentence_patterns', 'high_risk_patterns', 
      'banned_content', 'long_paragraphs'];
    analysis.canAutoFix = analysis.allIssues.every(i => 
      autoFixableTypes.includes(i.type)
    );
    
    // 判断是否应该重新起草
    const rewriteTriggerTypes = ['missing_must_cover', 'forbidden_zone_violated', 
      'continuity_anchor', 'weak_chapter_end', 'flat_pacing', 'weak_chapter_start'];
    analysis.shouldRewrite = analysis.blockingIssues.some(i => 
      rewriteTriggerTypes.includes(i.type)
    ) || analysis.blockingCount > 3;
    
    return analysis;
  }

  /**
   * 判断是否应该继续重试
   */
  private shouldContinueRetry(
    attempt: number,
    analysis: ReviewFailureAnalysis,
    reviewResult: ReviewResult
  ): boolean {
    // 已经到达最大次数
    if (attempt >= this.exitCondition.maxRetries) {
      return false;
    }
    
    // 分数低于阈值
    if (reviewResult.overall.score < this.exitCondition.minScore) {
      // 如果允许 AI 味问题降级通过，且问题全是 AI 味的
      if (this.exitCondition.allowAIFlavorDegradedPass && analysis.isAIFlavorOnly) {
        console.log(`[Pipeline] AI 味问题，允许降级通过`);
        return false;
      }
    }
    
    // 无阻断问题
    if (analysis.blockingCount === 0) {
      return false;
    }
    
    // AI 味问题且允许降级
    if (analysis.isAIFlavorOnly && this.exitCondition.allowAIFlavorDegradedPass) {
      return false;
    }
    
    return true;
  }

  /**
   * 自动修复草稿
   */
  private async autoFixDraft(draft: string, reviewResult: ReviewResult): Promise<string> {
    let fixed = draft;
    
    // 使用 Anti-AI 服务修复
    const antiAIResult = await this.antiAIService.fix(fixed);
    if (antiAIResult.content !== fixed) {
      fixed = antiAIResult.content;
      console.log(`[Pipeline] Anti-AI 修复: ${antiAIResult.totalIssues} 处问题`);
    }
    
    return fixed;
  }
  
  /**
   * 暂停流水线
   */
  pause(): void {
    if (this.state.value.status === PipelineStatus.RUNNING) {
      this.state.value.status = PipelineStatus.PAUSED;
      this.abortController?.abort();
    }
  }
  
  /**
   * 恢复流水线
   */
  resume(): void {
    if (this.state.value.status === PipelineStatus.PAUSED) {
      this.state.value.status = PipelineStatus.RUNNING;
      this.abortController = new AbortController();
    }
  }
  
  /**
   * 停止流水线
   */
  stop(): void {
    this.state.value.status = PipelineStatus.IDLE;
    this.abortController?.abort();
  }
  
  /**
   * 添加事件监听器
   */
  addEventListener(listener: PipelineListener): void {
    this.listeners.add(listener);
  }
  
  /**
   * 移除事件监听器
   */
  removeEventListener(listener: PipelineListener): void {
    this.listeners.delete(listener);
  }
  
  /**
   * 更新配置
   */
  updateConfig(updates: Partial<PipelineConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * 更新退出条件
   */
  updateExitCondition(updates: Partial<ExitCondition>): void {
    this.exitCondition = { ...this.exitCondition, ...updates };
  }
  
  // ============================================================
  // 计算属性
  // ============================================================
  
  get statusValue() {
    return computed(() => this.state.value.status);
  }
  
  get currentStepValue() {
    return computed(() => this.state.value.currentStep);
  }
  
  get currentChapterValue() {
    return computed(() => this.state.value.currentChapter);
  }

  get retryCount() {
    return computed(() => this.state.value.retryCount);
  }

  get reviewHistory() {
    return computed(() => this.state.value.reviewHistory);
  }
  
  // ============================================================
  // 私有方法
  // ============================================================
  
  /**
   * 执行单个步骤
   */
  private async executeStep(
    step: WritingStep,
    fn: () => Promise<any>
  ): Promise<StepResult> {
    const startTime = Date.now();
    this.state.value.currentStep = step;
    
    this.emit({
      type: 'step_start',
      chapterNumber: this.state.value.currentChapter,
      step,
      timestamp: new Date().toISOString(),
    });
    
    try {
      const data = await fn();
      
      const result: StepResult = {
        step,
        success: true,
        data,
        duration: Date.now() - startTime,
      };
      
      this.emit({
        type: 'step_complete',
        chapterNumber: this.state.value.currentChapter,
        step,
        data: result,
        timestamp: new Date().toISOString(),
      });
      
      return result;
      
    } catch (error) {
      const result: StepResult = {
        step,
        success: false,
        error: String(error),
        duration: Date.now() - startTime,
      };
      
      this.emit({
        type: 'step_error',
        chapterNumber: this.state.value.currentChapter,
        step,
        error: String(error),
        timestamp: new Date().toISOString(),
      });
      
      return result;
    }
  }
  
  /**
   * 发送事件
   */
  private emit(event: PipelineEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[Pipeline] Listener error:', error);
      }
    }
  }
}

// ============================================================
// 审查失败分析
// ============================================================

interface ReviewFailureAnalysis {
  /** 阻断问题数量 */
  blockingCount: number;
  /** 总分 */
  score: number;
  /** 阻断问题列表 */
  blockingIssues: any[];
  /** 高优先级问题列表 */
  highPriorityIssues: any[];
  /** 是否可自动修复 */
  canAutoFix: boolean;
  /** 是否应该重新起草 */
  shouldRewrite: boolean;
  /** 是否全为 AI 味问题 */
  isAIFlavorOnly: boolean;
  /** 所有问题 */
  allIssues: any[];
}

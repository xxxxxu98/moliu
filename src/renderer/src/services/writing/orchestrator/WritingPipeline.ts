/**
 * 写作流水线
 * 基于 webnovel-writer 架构的重构
 * 
 * 六步流程：TaskBook → Draft → Review → Polish → Commit → Backup
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

export class WritingPipeline {
  // 配置
  private config: PipelineConfig;
  
  // 状态
  private status = ref<PipelineStatus>(PipelineStatus.IDLE);
  private currentStep = ref<WritingStep | null>(null);
  private currentChapter = ref<number>(0);
  private stepResults = ref<StepResult[]>([]);
  private listeners = new Set<PipelineListener>();
  
  // 子系统
  private taskBookBuilder: TaskBookBuilder;
  private draftAgent: DraftAgent;
  private reviewAgent: ReviewAgent;
  private polishAgent: PolishAgent;
  private commitManager: ChapterCommitManager;
  private backupManager: GitBackupManager;
  
  // 内部状态
  private privateConfig: PipelineConfig;
  private abortController: AbortController | null = null;
  
  constructor(config: Partial<PipelineConfig> = {}) {
    this.privateConfig = { ...DEFAULT_PIPELINE_CONFIG, ...config };
    this.config = this.privateConfig;
    
    // 初始化子系统
    this.taskBookBuilder = new TaskBookBuilder();
    this.draftAgent = new DraftAgent();
    this.reviewAgent = new ReviewAgent();
    this.polishAgent = new PolishAgent();
    this.commitManager = new ChapterCommitManager();
    this.backupManager = new GitBackupManager();
  }
  
  // ============================================================
  // 公开 API
  // ============================================================
  
  /**
   * 执行流水线
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
    this.status.value = PipelineStatus.RUNNING;
    this.currentChapter.value = chapterNumber;
    this.stepResults.value = [];
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
      // Step 2: 起草
      // ============================================================
      const step2Result = await this.executeStep(
        Step.DRAFT,
        async () => {
          const result = await this.draftAgent.draft(taskBook!, context);
          draft = result.content;
          wordCount = result.wordCount;
          return { content: draft, wordCount };
        }
      );
      steps.push(step2Result);
      
      if (!step2Result.success) {
        throw new Error(`起草失败: ${step2Result.error}`);
      }
      
      // ============================================================
      // Step 3: 审查
      // ============================================================
      if (cfg.enableReview) {
        const step3Result = await this.executeStep(
          Step.REVIEW,
          async () => {
            reviewResult = await this.reviewAgent.review(chapterNumber, draft);
            return { reviewResult };
          }
        );
        steps.push(step3Result);
        
        // 检查阻断问题
        if (reviewResult!.overall.blockingCount > 0) {
          // 有阻断问题，尝试修复
          await this.handleBlockingIssues(reviewResult!, draft, taskBook!);
          
          // 重新审查
          const retryResult = await this.reviewAgent.review(chapterNumber, draft);
          reviewResult = retryResult;
          
          if (reviewResult.overall.blockingCount > 0) {
            // 仍然有阻断问题，停在 Step 3
            this.status.value = PipelineStatus.FAILED;
            return {
              success: false,
              error: '阻断问题未能解决',
              reviewResult,
            };
          }
        }
      }
      
      // ============================================================
      // Step 4: 润色
      // ============================================================
      if (cfg.enablePolish) {
        const step4Result = await this.executeStep(
          Step.POLISH,
          async () => {
            const polishResult = await this.polishAgent.polish(draft, taskBook!);
            draft = polishResult.polishedContent;
            
            // Anti-AI 终检
            if (!polishResult.antiAIResult.pass) {
              console.warn('Anti-AI 检测问题:', polishResult.antiAIResult.issues);
            }
            
            return { polishResult };
          }
        );
        steps.push(step4Result);
        
        if (!step4Result.success) {
          throw new Error(`润色失败: ${step4Result.error}`);
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
      
      // 完成
      this.status.value = PipelineStatus.COMPLETED;
      
      this.emit({
        type: 'pipeline_complete',
        chapterNumber,
        data: { steps },
        timestamp: new Date().toISOString(),
      });
      
      return {
        chapterNumber,
        status: this.status.value,
        steps,
        finalContent: draft,
        finalWordCount: wordCount,
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
      };
      
    } catch (error) {
      this.status.value = PipelineStatus.FAILED;
      
      this.emit({
        type: 'pipeline_error',
        chapterNumber,
        error: String(error),
        timestamp: new Date().toISOString(),
      });
      
      return {
        chapterNumber,
        status: this.status.value,
        steps,
        finalWordCount: 0,
        error: String(error),
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
      };
    }
  }
  
  /**
   * 暂停流水线
   */
  pause(): void {
    if (this.status.value === PipelineStatus.RUNNING) {
      this.status.value = PipelineStatus.PAUSED;
      this.abortController?.abort();
    }
  }
  
  /**
   * 恢复流水线
   */
  resume(): void {
    if (this.status.value === PipelineStatus.PAUSED) {
      this.status.value = PipelineStatus.RUNNING;
      this.abortController = new AbortController();
    }
  }
  
  /**
   * 停止流水线
   */
  stop(): void {
    this.status.value = PipelineStatus.IDLE;
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
  
  // ============================================================
  // 计算属性
  // ============================================================
  
  get statusValue() {
    return this.status;
  }
  
  get currentStepValue() {
    return this.currentStep;
  }
  
  get currentChapterValue() {
    return this.currentChapter;
  }
  
  get stepResultsValue() {
    return this.stepResults;
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
    this.currentStep.value = step;
    
    this.emit({
      type: 'step_start',
      chapterNumber: this.currentChapter.value,
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
        chapterNumber: this.currentChapter.value,
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
        chapterNumber: this.currentChapter.value,
        step,
        error: String(error),
        timestamp: new Date().toISOString(),
      });
      
      return result;
    }
  }
  
  /**
   * 处理阻断问题
   */
  private async handleBlockingIssues(
    reviewResult: ReviewResult,
    draft: string,
    taskBook: TaskBook
  ): Promise<void> {
    // 1. 尝试自动修复可修复的问题
    let fixed = draft;
    
    for (const issue of reviewResult.blockingIssues) {
      if (issue.type === 'ai_pattern' && issue.suggestion) {
        fixed = fixed.replace(new RegExp(issue.description, 'g'), issue.suggestion);
      }
    }
    
    // 2. 记录修复历史
    if (fixed !== draft) {
      console.log('[Pipeline] 自动修复了部分问题');
    }
    
    // 3. 保留阻断问题供人工审查
    console.warn('[Pipeline] 阻断问题:', reviewResult.blockingIssues);
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

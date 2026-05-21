/**
 * Confirm-Execute Workflow System
 * 确认-执行工作流 - 逐步确认后执行的生成流程
 * 从 webnovel-writer 借鉴的确认-执行模式
 */

import type { StoryContract, VolumeContract, ChapterCommit } from '../contracts';

/**
 * 工作流步骤类型
 */
export type WorkflowStepType = 
  | 'master_outline'   // 总纲生成
  | 'volume_outline'   // 卷纲生成
  | 'beat_table'       // 节拍表生成
  | 'timeline'         // 时间线生成
  | 'chapter_outline'   // 章纲生成
  | 'chapter_writing';  // 正文写作

/**
 * 工作流步骤状态
 */
export type WorkflowStepStatus = 
  | 'pending'    // 待执行
  | 'generating' // 生成中
  | 'pending_confirm' // 待确认
  | 'confirmed'   // 已确认
  | 'rejected'   // 已拒绝
  | 'completed'   // 已完成
  | 'failed';     // 失败

/**
 * 工作流步骤
 */
export interface WorkflowStep {
  id: string;
  type: WorkflowStepType;
  title: string;
  description: string;
  status: WorkflowStepStatus;
  generatedContent?: any;
  warnings: string[];
  blockers: WorkflowBlocker[];
  confirmedAt?: string;
  completedAt?: string;
}

/**
 * 工作流阻断项
 */
export interface WorkflowBlocker {
  id: string;
  type: 'error' | 'conflict' | 'incomplete';
  message: string;
  field?: string;
  suggestion?: string;
}

/**
 * 工作流执行结果
 */
export interface WorkflowExecutionResult {
  success: boolean;
  stepId: string;
  content?: any;
  error?: string;
  blockers: WorkflowBlocker[];
  warnings: string[];
}

/**
 * 工作流配置
 */
export interface WorkflowConfig {
  autoAdvance: boolean;
  confirmBeforeExecute: boolean;
  strictMode: boolean;
  maxRetries: number;
}

/**
 * 工作流状态
 */
export interface WorkflowState {
  id: string;
  projectId?: string;
  currentStepIndex: number;
  steps: WorkflowStep[];
  config: WorkflowConfig;
  startedAt: string;
  completedAt?: string;
  metadata?: Record<string, any>;
}

/**
 * 工作流监听器
 */
export type WorkflowListener = (
  event: WorkflowEvent,
  state: WorkflowState
) => void;

/**
 * 工作流事件
 */
export type WorkflowEvent = 
  | { type: 'step_started'; stepId: string }
  | { type: 'step_generated'; stepId: string; content: any }
  | { type: 'step_confirmed'; stepId: string }
  | { type: 'step_rejected'; stepId: string; reason?: string }
  | { type: 'step_completed'; stepId: string }
  | { type: 'step_failed'; stepId: string; error: string }
  | { type: 'workflow_started' }
  | { type: 'workflow_completed' }
  | { type: 'blocker_detected'; stepId: string; blocker: WorkflowBlocker };

/**
 * 确认-执行工作流管理器
 */
export class ConfirmExecuteWorkflow {
  private state: WorkflowState | null = null;
  private listeners: WorkflowListener[] = [];
  private generators: Map<WorkflowStepType, (context: any) => Promise<any>> = new Map();

  /**
   * 初始化工作流
   */
  initialize(config: Partial<WorkflowConfig> = {}): WorkflowState {
    const defaultConfig: WorkflowConfig = {
      autoAdvance: false,
      confirmBeforeExecute: true,
      strictMode: true,
      maxRetries: 3,
    };

    this.state = {
      id: `workflow-${Date.now()}`,
      currentStepIndex: 0,
      steps: [],
      config: { ...defaultConfig, ...config },
      startedAt: new Date().toISOString(),
    };

    this.emit({ type: 'workflow_started' });
    return this.state;
  }

  /**
   * 添加步骤
   */
  addStep(step: Omit<WorkflowStep, 'status' | 'warnings' | 'blockers'>): WorkflowStep {
    if (!this.state) {
      throw new Error('工作流未初始化');
    }

    const newStep: WorkflowStep = {
      ...step,
      status: 'pending',
      warnings: [],
      blockers: [],
    };

    this.state.steps.push(newStep);
    return newStep;
  }

  /**
   * 注册生成器
   */
  registerGenerator(
    type: WorkflowStepType,
    generator: (context: any) => Promise<any>
  ): void {
    this.generators.set(type, generator);
  }

  /**
   * 执行当前步骤
   */
  async executeCurrentStep(context?: any): Promise<WorkflowExecutionResult> {
    if (!this.state) {
      return { success: false, stepId: '', error: '工作流未初始化', blockers: [], warnings: [] };
    }

    const currentStep = this.state.steps[this.state.currentStepIndex];
    if (!currentStep) {
      return { success: false, stepId: '', error: '没有更多步骤', blockers: [], warnings: [] };
    }

    // 更新状态
    currentStep.status = 'generating';
    this.emit({ type: 'step_started', stepId: currentStep.id });

    try {
      // 获取生成器
      const generator = this.generators.get(currentStep.type);
      if (!generator) {
        throw new Error(`未找到 ${currentStep.type} 的生成器`);
      }

      // 执行生成
      const content = await generator(context || { state: this.state, step: currentStep });

      // 检查阻断
      const blockers = this.detectBlockers(content, currentStep);

      currentStep.generatedContent = content;
      currentStep.blockers = blockers;
      currentStep.warnings = this.detectWarnings(content);

      if (blockers.length > 0) {
        currentStep.status = 'pending_confirm';
        this.emit({ type: 'blocker_detected', stepId: currentStep.id, blocker: blockers[0] });
        return { success: false, stepId: currentStep.id, blockers, warnings: currentStep.warnings };
      }

      // 生成成功
      currentStep.status = 'pending_confirm';
      this.emit({ type: 'step_generated', stepId: currentStep.id, content });

      return { success: true, stepId: currentStep.id, content, blockers: [], warnings: currentStep.warnings };

    } catch (error) {
      currentStep.status = 'failed';
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      this.emit({ type: 'step_failed', stepId: currentStep.id, error: errorMessage });
      return { 
        success: false, 
        stepId: currentStep.id, 
        error: errorMessage, 
        blockers: [], 
        warnings: [] 
      };
    }
  }

  /**
   * 确认当前步骤
   */
  confirmCurrentStep(): boolean {
    if (!this.state) return false;

    const currentStep = this.state.steps[this.state.currentStepIndex];
    if (!currentStep || currentStep.status !== 'pending_confirm') return false;

    currentStep.status = 'confirmed';
    currentStep.confirmedAt = new Date().toISOString();
    this.emit({ type: 'step_confirmed', stepId: currentStep.id });

    return true;
  }

  /**
   * 拒绝当前步骤
   */
  rejectCurrentStep(reason?: string): boolean {
    if (!this.state) return false;

    const currentStep = this.state.steps[this.state.currentStepIndex];
    if (!currentStep) return false;

    currentStep.status = 'rejected';
    this.emit({ type: 'step_rejected', stepId: currentStep.id, reason });

    return true;
  }

  /**
   * 完成当前步骤并前进
   */
  async completeCurrentStep(): Promise<boolean> {
    if (!this.state) return false;

    const currentStep = this.state.steps[this.state.currentStepIndex];
    if (!currentStep || currentStep.status !== 'confirmed') return false;

    currentStep.status = 'completed';
    currentStep.completedAt = new Date().toISOString();
    this.emit({ type: 'step_completed', stepId: currentStep.id });

    // 前进到下一步
    if (this.state.currentStepIndex < this.state.steps.length - 1) {
      this.state.currentStepIndex++;
      return true;
    }

    // 工作流完成
    this.state.completedAt = new Date().toISOString();
    this.emit({ type: 'workflow_completed' });
    return true;
  }

  /**
   * 重做当前步骤
   */
  async redoCurrentStep(context?: any): Promise<WorkflowExecutionResult> {
    if (!this.state) {
      return { success: false, stepId: '', error: '工作流未初始化', blockers: [], warnings: [] };
    }

    const currentStep = this.state.steps[this.state.currentStepIndex];
    if (!currentStep) {
      return { success: false, stepId: '', error: '没有当前步骤', blockers: [], warnings: [] };
    }

    // 重置状态
    currentStep.status = 'pending';
    currentStep.generatedContent = undefined;
    currentStep.blockers = [];
    currentStep.warnings = [];

    // 重新执行
    return this.executeCurrentStep(context);
  }

  /**
   * 获取当前步骤
   */
  getCurrentStep(): WorkflowStep | null {
    if (!this.state) return null;
    return this.state.steps[this.state.currentStepIndex] || null;
  }

  /**
   * 获取工作流状态
   */
  getState(): WorkflowState | null {
    return this.state;
  }

  /**
   * 添加监听器
   */
  addListener(listener: WorkflowListener): void {
    this.listeners.push(listener);
  }

  /**
   * 移除监听器
   */
  removeListener(listener: WorkflowListener): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * 发送事件
   */
  private emit(event: WorkflowEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event, this.state!);
      } catch (e) {
        console.error('工作流监听器错误:', e);
      }
    }
  }

  /**
   * 检测阻断项
   */
  private detectBlockers(content: any, step: WorkflowStep): WorkflowBlocker[] {
    const blockers: WorkflowBlocker[] = [];

    // 检测占位符
    if (this.containsPlaceholder(content)) {
      blockers.push({
        id: 'placeholder',
        type: 'incomplete',
        message: '内容包含未填充的占位符',
        suggestion: '请补充完整所有占位符',
      });
    }

    // 检测空内容
    if (this.isEmpty(content)) {
      blockers.push({
        id: 'empty',
        type: 'incomplete',
        message: '内容为空',
        suggestion: '请生成有效内容',
      });
    }

    // 步骤特定的阻断检测
    switch (step.type) {
      case 'master_outline':
        blockers.push(...this.checkMasterOutlineBlockers(content));
        break;
      case 'volume_outline':
        blockers.push(...this.checkVolumeOutlineBlockers(content));
        break;
      case 'chapter_outline':
        blockers.push(...this.checkChapterOutlineBlockers(content));
        break;
    }

    return blockers;
  }

  /**
   * 检测警告
   */
  private detectWarnings(content: any): string[] {
    const warnings: string[] = [];

    // 缺少爽点
    if (content?.coolPoint === '待设定') {
      warnings.push('缺少爽点设计');
    }

    // 缺少悬念
    if (content?.cen?.悬念 === '待设定') {
      warnings.push('缺少章末悬念');
    }

    return warnings;
  }

  /**
   * 检测占位符
   */
  private containsPlaceholder(content: any): boolean {
    const str = JSON.stringify(content);
    return /\[待.*\]|\{占位\}|暂定|待填充/.test(str);
  }

  /**
   * 检测空内容
   */
  private isEmpty(content: any): boolean {
    if (!content) return true;
    if (typeof content === 'string') return content.trim().length === 0;
    if (typeof content === 'object') return Object.keys(content).length === 0;
    return false;
  }

  /**
   * 检查总纲阻断
   */
  private checkMasterOutlineBlockers(content: any): WorkflowBlocker[] {
    const blockers: WorkflowBlocker[] = [];

    if (!content?.basic?.title) {
      blockers.push({
        id: 'missing_title',
        type: 'incomplete',
        message: '缺少书名',
        field: 'basic.title',
        suggestion: '请输入书名',
      });
    }

    if (!content?.basic?.genre) {
      blockers.push({
        id: 'missing_genre',
        type: 'incomplete',
        message: '缺少题材',
        field: 'basic.genre',
        suggestion: '请选择题材',
      });
    }

    if (!content?.emotionGoal?.primary) {
      blockers.push({
        id: 'missing_emotion',
        type: 'incomplete',
        message: '缺少情绪目标',
        field: 'emotionGoal.primary',
        suggestion: '请设定核心情绪',
      });
    }

    return blockers;
  }

  /**
   * 检查卷纲阻断
   */
  private checkVolumeOutlineBlockers(content: any): WorkflowBlocker[] {
    const blockers: WorkflowBlocker[] = [];

    if (!content?.beats || content.beats.length === 0) {
      blockers.push({
        id: 'missing_beats',
        type: 'incomplete',
        message: '缺少节拍表',
        field: 'beats',
        suggestion: '请生成节拍表',
      });
    }

    if (!content?.timeline) {
      blockers.push({
        id: 'missing_timeline',
        type: 'incomplete',
        message: '缺少时间线',
        field: 'timeline',
        suggestion: '请生成时间线',
      });
    }

    return blockers;
  }

  /**
   * 检查章纲阻断
   */
  private checkChapterOutlineBlockers(content: any): WorkflowBlocker[] {
    const blockers: WorkflowBlocker[] = [];

    if (!content?.nodes?.cbn) {
      blockers.push({
        id: 'missing_cbn',
        type: 'incomplete',
        message: '缺少 CBN（章节起点）',
        field: 'nodes.cbn',
      });
    }

    if (!content?.nodes?.cen) {
      blockers.push({
        id: 'missing_cen',
        type: 'incomplete',
        message: '缺少 CEN（章节终点）',
        field: 'nodes.cen',
      });
    }

    if (!content?.requirements?.coolPoint) {
      blockers.push({
        id: 'missing_coolpoint',
        type: 'incomplete',
        message: '缺少爽点设计',
        field: 'requirements.coolPoint',
        suggestion: '每章必须有爽点',
      });
    }

    return blockers;
  }

  /**
   * 创建标准工作流
   */
  createStandardWorkflow(): void {
    if (!this.state) return;

    // 步骤1：生成总纲
    this.addStep({
      id: 'step-master',
      type: 'master_outline',
      title: '生成总纲',
      description: '基于创意种子生成故事总纲',
    });

    // 步骤2：生成卷节拍表
    this.addStep({
      id: 'step-beats',
      type: 'beat_table',
      title: '生成节拍表',
      description: '为第一卷生成八节点节拍表',
    });

    // 步骤3：生成时间线
    this.addStep({
      id: 'step-timeline',
      type: 'timeline',
      title: '生成时间线',
      description: '为第一卷生成时间线',
    });

    // 步骤4：生成章纲
    this.addStep({
      id: 'step-chapters',
      type: 'chapter_outline',
      title: '生成章纲',
      description: '批量生成章纲',
    });
  }

  /**
   * 生成进度报告
   */
  generateProgressReport(): string {
    if (!this.state) return '工作流未初始化';

    const lines: string[] = [];
    lines.push('# 工作流执行报告');
    lines.push('');
    lines.push(`**开始时间**：${this.state.startedAt}`);
    if (this.state.completedAt) {
      lines.push(`**完成时间**：${this.state.completedAt}`);
    }
    lines.push('');
    lines.push('## 步骤进度');
    lines.push('');

    for (let i = 0; i < this.state.steps.length; i++) {
      const step = this.state.steps[i];
      const marker = i === this.state.currentStepIndex ? '👉' : 
                   step.status === 'completed' ? '✅' :
                   step.status === 'failed' ? '❌' : '⬜';
      lines.push(`${marker} ${step.title} (${step.status})`);
      
      if (step.blockers.length > 0) {
        for (const blocker of step.blockers) {
          lines.push(`   - ❌ ${blocker.message}`);
        }
      }
      
      if (step.warnings.length > 0) {
        for (const warning of step.warnings) {
          lines.push(`   - ⚠️ ${warning}`);
        }
      }
    }

    lines.push('');
    lines.push(`**当前步骤**：${this.state.currentStepIndex + 1}/${this.state.steps.length}`);

    return lines.join('\n');
  }
}

// 导出单例
export const confirmExecuteWorkflow = new ConfirmExecuteWorkflow();

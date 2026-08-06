/**
 * Writing Store v2
 * Moliu v2.0 - 写作状态管理
 * 
 * 职责：
 * 1. 管理当前写作会话
 * 2. 管理写作配置和选项
 * 3. 管理生成状态
 * 4. 管理输出内容
 */

import { defineStore } from "pinia";
import { ref, computed, shallowRef } from "vue";
import { countWords as countWordsShared } from "@/services/writing/utils";

// ============================================================
// Types (内联定义避免循环依赖)
// ============================================================

export interface WritingSession {
  id: string;
  projectId: string;
  chapterNumber: number;
  status: "active" | "completed" | "cancelled" | "failed";
  startTime: number;
  endTime?: number;
  retryCount: number;
  generatedContent: string;
}

export interface WritingTask {
  projectId: string;
  chapterNumber: number;
  title?: string;
  prompt?: string;
}

export interface WritingResult {
  chapterNumber: number;
  success: boolean;
  content?: string;
  wordCount?: number;
  error?: string;
  recoverable?: boolean;
  coolPoints?: string[];
  foreshadowUpdates?: string[];
  qualityScore?: number;
  timestamp: string;
}

export interface WritingOptions {
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  enableQualityCheck: boolean;
  enableDeAI: boolean;
  retryOnFailure: boolean;
  maxRetries: number;
}

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
  severity: number;
}

export interface QualityDetails {
  hookScore: number;
  coolpointScore: number;
  rhythmScore: number;
  contractScore: number;
  characterScore: number;
  styleScore: number;
}

// ============================================================
// Store
// ============================================================

export const useWritingStore = defineStore("writing-v2", () => {
  // Session State
  const currentSession = shallowRef<WritingSession | null>(null);
  const sessionHistory = shallowRef<WritingSession[]>([]);

  // Task State
  const currentTask = shallowRef<WritingTask | null>(null);
  const taskQueue = shallowRef<WritingTask[]>([]);

  // Result State
  const currentResult = shallowRef<WritingResult | null>(null);
  const resultHistory = shallowRef<WritingResult[]>([]);

  // Quality State
  const lastQualityCheck = shallowRef<QualityCheckResult | null>(null);

  // Options
  const options = ref<WritingOptions>({
    temperature: 0.7,
    maxTokens: 2000,
    topP: 0.9,
    frequencyPenalty: 0.0,
    presencePenalty: 0.0,
    enableQualityCheck: true,
    enableDeAI: false,
    retryOnFailure: true,
    maxRetries: 3,
  });

  // UI State
  const isWriting = ref(false);
  const isChecking = ref(false);
  const progress = ref(0);
  const error = ref<string | null>(null);

  // Getters
  const hasActiveSession = computed(() => currentSession.value !== null);

  const canStartWriting = computed(() => {
    return currentTask.value !== null && !isWriting.value;
  });

  const hasQueuedTasks = computed(() => taskQueue.value.length > 0);

  const sessionDuration = computed(() => {
    if (!currentSession.value) return 0;
    const end = currentSession.value.endTime || Date.now();
    return end - currentSession.value.startTime;
  });

  const qualityPassed = computed(() => {
    if (!lastQualityCheck.value) return true;
    return lastQualityCheck.value.passed;
  });

  const qualityScore = computed(() => {
    if (!lastQualityCheck.value) return 0;
    return lastQualityCheck.value.score;
  });

  // ============================================================
  // 辅助方法
  // ============================================================

  function countWords(text: string): number {
    return countWordsShared(text);
  }

  async function simulateWriting(task: WritingTask): Promise<WritingResult> {
    // 模拟 AI 写作延迟
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

    const title = task.title || `第${task.chapterNumber}章 新的开始`;
    const content = `# ${title}\n\n阳光透过窗户洒进房间，新的一天开始了。\n\n主角站在窗前，回想着最近的经历。\n\n就在这时，一阵急促的敲门声打断了他的思绪。\n\n"谁？"主角警觉地问道。\n\n门外传来一个熟悉的声音："是我，有紧急情况！"\n\n主角立刻打开了门，看到好友一脸焦急的样子。\n\n"出事了！"好友气喘吁吁地说道，"他们发现了我们的计划！"\n\n主角的脸色瞬间变得凝重。\n\n正当他准备采取行动时，一个意想不到的人出现了。\n\n"好久不见。"来人的嘴角带着一丝意味深长的笑容。\n\n主角的瞳孔猛地收缩——这个人，竟然是他以为已经死去的人！\n\n【本章完】`;

    return {
      chapterNumber: task.chapterNumber,
      success: true,
      content,
      wordCount: countWords(content),
      coolPoints: ['突破', '成长'],
      foreshadowUpdates: ['伏笔'],
      qualityScore: 75,
      timestamp: new Date().toISOString(),
    };
  }

  async function quickQualityCheck(content: string): Promise<QualityCheckResult> {
    const paragraphs = content.split('\n\n');
    const firstPara = paragraphs[0] || '';
    const lastPara = paragraphs[paragraphs.length - 1] || '';

    const hookIndicators = ['突然', '就在此时', '没想到', '叮'];
    const hasHook = hookIndicators.some(ind => firstPara.includes(ind) || lastPara.includes(ind));

    const issues: QualityIssue[] = [];
    if (!hasHook) {
      issues.push({
        type: 'warning',
        category: 'hook',
        message: '章节可能缺少有效的钩子',
        severity: 5,
      });
    }

    return {
      passed: true,
      score: hasHook ? 75 : 65,
      issues,
      suggestions: hasHook ? [] : ['建议增加开篇钩子'],
      details: {
        hookScore: hasHook ? 75 : 55,
        coolpointScore: 70,
        rhythmScore: 75,
        contractScore: 80,
        characterScore: 75,
        styleScore: 70,
      },
    };
  }

  // ============================================================
  // Actions
  // ============================================================

  function startSession(projectId: string, chapterNumber: number) {
    const session: WritingSession = {
      id: `session-${Date.now()}`,
      projectId,
      chapterNumber,
      status: "active",
      startTime: Date.now(),
      retryCount: 0,
      generatedContent: "",
    };

    currentSession.value = session;
    return session;
  }

  function endSession() {
    if (currentSession.value) {
      currentSession.value.endTime = Date.now();
      currentSession.value.status = "completed";
      sessionHistory.value = [currentSession.value, ...sessionHistory.value.slice(0, 49)];
    }
    currentSession.value = null;
  }

  function cancelSession() {
    if (currentSession.value) {
      currentSession.value.endTime = Date.now();
      currentSession.value.status = "cancelled";
      sessionHistory.value = [currentSession.value, ...sessionHistory.value.slice(0, 49)];
    }
    currentSession.value = null;
    isWriting.value = false;
    progress.value = 0;
  }

  function setTask(task: WritingTask) {
    currentTask.value = task;
    error.value = null;
  }

  function addToQueue(task: WritingTask) {
    taskQueue.value = [...taskQueue.value, task];
  }

  function clearQueue() {
    taskQueue.value = [];
  }

  async function processQueue(onProgress?: (completed: number, total: number) => void) {
    const total = taskQueue.value.length;
    let completed = 0;

    while (taskQueue.value.length > 0) {
      const task = taskQueue.value[0];
      taskQueue.value = taskQueue.value.slice(1);
      setTask(task);
      await executeWriting();
      completed++;
      onProgress?.(completed, total);
    }
  }

  async function executeWriting(): Promise<WritingResult | null> {
    if (!currentTask.value) {
      error.value = "No task to execute";
      return null;
    }

    isWriting.value = true;
    progress.value = 0;
    error.value = null;

    try {
      // 开始会话
      startSession(
        currentTask.value.projectId,
        currentTask.value.chapterNumber
      );

      progress.value = 20;

      // 执行写作
      const result = await simulateWriting(currentTask.value);
      currentResult.value = result;
      resultHistory.value = [result, ...resultHistory.value.slice(0, 99)];

      progress.value = 50;

      // 质量检查
      if (options.value.enableQualityCheck && result.content) {
        const checkResult = await quickQualityCheck(result.content);
        lastQualityCheck.value = checkResult;

        if (!checkResult.passed && options.value.enableDeAI) {
          // TODO: 实现去AI味功能
        }
      }

      progress.value = 100;
      endSession();
      return result;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Unknown error";
      if (currentSession.value) {
        currentSession.value.retryCount++;
        currentSession.value.status = "failed";
      }
      return null;
    } finally {
      isWriting.value = false;
    }
  }

  async function retryWriting(): Promise<WritingResult | null> {
    if (!currentTask.value) return null;

    if (currentSession.value) {
      currentSession.value.retryCount++;
    }

    return executeWriting();
  }

  async function checkQuality(content: string): Promise<QualityCheckResult> {
    isChecking.value = true;
    try {
      const result = await quickQualityCheck(content);
      lastQualityCheck.value = result;
      return result;
    } finally {
      isChecking.value = false;
    }
  }

  function updateOptions(updates: Partial<WritingOptions>) {
    options.value = { ...options.value, ...updates };
  }

  function clearResults() {
    currentResult.value = null;
    lastQualityCheck.value = null;
    error.value = null;
    progress.value = 0;
  }

  function clearHistory() {
    sessionHistory.value = [];
    resultHistory.value = [];
  }

  return {
    // State
    currentSession,
    sessionHistory,
    currentTask,
    taskQueue,
    currentResult,
    resultHistory,
    lastQualityCheck,
    options,
    isWriting,
    isChecking,
    progress,
    error,

    // Getters
    hasActiveSession,
    canStartWriting,
    hasQueuedTasks,
    sessionDuration,
    qualityPassed,
    qualityScore,

    // Actions
    startSession,
    endSession,
    cancelSession,
    setTask,
    addToQueue,
    clearQueue,
    processQueue,
    executeWriting,
    retryWriting,
    checkQuality,
    updateOptions,
    clearResults,
    clearHistory,

    // Utilities
    countWords,
  };
});

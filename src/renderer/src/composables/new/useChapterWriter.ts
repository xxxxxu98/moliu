/**
 * 章节写作器
 * 基于 webnovel-writer-master 的 AI 写作系统
 * 
 * 章节写作器负责：
 * - 生成章节内容
 * - 管理写作任务
 * - 处理写作结果
 */

import { ref, shallowRef } from 'vue';
import type { UseContextManagerReturn } from './useContextManager';
import type { UseMemorySystemReturn } from './useMemorySystem';
import type { ChapterContract } from '@/types/contract';

// ============================================================
// 类型定义
// ============================================================

export interface WritingTask {
  chapterNumber: number;
  contract: ChapterContract | null;
  previousChapter: ChapterContract | null;
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
  // 是否启用自动优化
  autoOptimize: boolean;
  // 最大字数
  maxWords: number;
  // 最小字数
  minWords: number;
  // 生成温度
  temperature: number;
  // 是否包含章节标题
  includeTitle: boolean;
}

// ============================================================
// Composable 定义
// ============================================================

export function useChapterWriter(options: {
  projectId: string;
  contextManager: UseContextManagerReturn;
  memorySystem: UseMemorySystemReturn;
}) {
  const { projectId, contextManager, memorySystem } = options;

  // 状态
  const isWriting = ref(false);
  const currentTask = shallowRef<WritingTask | null>(null);
  const lastResult = shallowRef<WritingResult | null>(null);
  const writingHistory = shallowRef<WritingResult[]>([]);

  // 配置
  const defaultOptions: WritingOptions = {
    autoOptimize: true,
    maxWords: 5000,
    minWords: 2000,
    temperature: 0.7,
    includeTitle: true,
  };

  const options_ = ref<WritingOptions>({ ...defaultOptions });

  // ============================================================
  // 写作流程
  // ============================================================

  /**
   * 执行写作任务
   */
  async function write(task: WritingTask): Promise<WritingResult> {
    if (isWriting.value) {
      return {
        chapterNumber: task.chapterNumber,
        success: false,
        error: '已经有写作任务在进行中',
        recoverable: false,
        timestamp: new Date().toISOString(),
      };
    }

    isWriting.value = true;
    currentTask.value = task;

    try {
      // 1. 获取上下文
      const context = buildWritingContext(task);

      // 2. 构建 Prompt
      const prompt = buildPrompt(task, context);

      // 3. 调用 AI 生成
      const content = await generateContent(prompt, task.chapterNumber);

      // 4. 后处理
      const processed = postProcess(content, task);

      // 5. 提取信息
      const coolPoints = extractCoolPoints(processed);
      const foreshadowUpdates = extractForeshadowUpdates(processed);

      // 6. 计算质量分数
      const qualityScore = calculateQualityScore(processed, task);

      // 7. 构建结果
      const result: WritingResult = {
        chapterNumber: task.chapterNumber,
        success: true,
        content: processed,
        wordCount: countWords(processed),
        coolPoints,
        foreshadowUpdates,
        qualityScore,
        timestamp: new Date().toISOString(),
      };

      lastResult.value = result;
      writingHistory.value.push(result);

      return result;
    } catch (error) {
      const result: WritingResult = {
        chapterNumber: task.chapterNumber,
        success: false,
        error: String(error),
        recoverable: true,
        timestamp: new Date().toISOString(),
      };

      lastResult.value = result;
      return result;
    } finally {
      isWriting.value = false;
      currentTask.value = null;
    }
  }

  // ============================================================
  // 上下文构建
  // ============================================================

  /**
   * 构建写作上下文
   */
  function buildWritingContext(task: WritingTask): string {
    const contextParts: string[] = [];

    // 项目上下文
    contextParts.push(contextManager.getChapterStartContext(task.chapterNumber));

    // 记忆摘要
    const memorySummary = memorySystem.getMemorySummary(
      Array.from({ length: 5 }, (_, i) => task.chapterNumber - 5 + i)
    );
    if (memorySummary) {
      contextParts.push('【近期记忆】');
      contextParts.push(memorySummary);
    }

    return contextParts.join('\n\n');
  }

  // ============================================================
  // Prompt 构建
  // ============================================================

  /**
   * 构建写作 Prompt
   */
  function buildPrompt(task: WritingTask, context: string): string {
    const lines: string[] = [];

    lines.push('你是专业的小说作家，擅长写网文。');
    lines.push('');

    // 上下文
    lines.push('【写作上下文】');
    lines.push(context);
    lines.push('');

    // 合同约束
    if (task.contract) {
      lines.push('【章节合同】');
      
      // 起点
      if (task.contract.cbn.situation) {
        lines.push(`起始情境：${task.contract.cbn.situation}`);
      }
      if (task.contract.cbn.characterStatus) {
        lines.push(`角色状态：${task.contract.cbn.characterStatus}`);
      }
      if (task.contract.cbn.hook.description) {
        lines.push(`章节钩子：${task.contract.cbn.hook.description}`);
      }

      // 推进节点
      if (task.contract.cpns.length > 0) {
        lines.push('推进节点：');
        for (const cpn of task.contract.cpns) {
          lines.push(`- ${cpn.description}`);
        }
      }

      // 终点
      if (task.contract.cen.resolution) {
        lines.push(`解决：${task.contract.cen.resolution}`);
      }
      if (task.contract.cen.newHook.description) {
        lines.push(`新钩子：${task.contract.cen.newHook.description}`);
      }
      if (task.contract.cen.cliffhanger) {
        lines.push(`悬念：${task.contract.cen.cliffhanger.description}`);
      }

      // 约束
      if (task.contract.constraints.mustInclude.length > 0) {
        lines.push(`必须包含：${task.contract.constraints.mustInclude.join('、')}`);
      }
      if (task.contract.constraints.mustNotInclude.length > 0) {
        lines.push(`禁止包含：${task.contract.constraints.mustNotInclude.join('、')}`);
      }

      lines.push('');
    }

    // 写作要求
    lines.push('【写作要求】');
    lines.push(`- 字数：${options_.value.minWords}-${options_.value.maxWords}字`);
    lines.push('- 风格：流畅、生动、有画面感');
    lines.push('- 节奏：紧凑、有张力');
    lines.push('- 结尾：留下悬念，吸引读者继续阅读');
    lines.push('');

    lines.push('请开始写作：');

    return lines.join('\n');
  }

  // ============================================================
  // 内容生成
  // ============================================================

  /**
   * 生成内容（模拟 AI 调用）
   */
  async function generateContent(prompt: string, chapterNumber: number): Promise<string> {
    // 实际使用时，这里应该调用 AI API
    // 目前使用模拟实现

    const contract = currentTask.value?.contract;
    const title = contract?.meta.title || `第${chapterNumber}章`;

    // 模拟生成内容
    const mockContent = generateMockContent(chapterNumber, contract);

    // 模拟 API 延迟
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

    return mockContent;
  }

  /**
   * 生成模拟内容
   */
  function generateMockContent(chapterNumber: number, contract: ChapterContract | null): string {
    const title = contract?.meta.title || `第${chapterNumber}章 新的开始`;
    
    const lines: string[] = [];
    
    lines.push(`# ${title}`);
    lines.push('');
    
    // 开头
    if (contract?.cbn.situation) {
      lines.push(contract.cbn.situation);
    } else {
      lines.push('阳光透过窗户洒进房间，新的一天开始了。');
    }
    
    lines.push('');
    lines.push('主角站在窗前，回想着最近的经历。');
    lines.push('');
    
    // 中间内容（模拟）
    lines.push('就在这时，一阵急促的敲门声打断了他的思绪。');
    lines.push('');
    lines.push('"谁？"主角警觉地问道。');
    lines.push('');
    lines.push('门外传来一个熟悉的声音："是我，有紧急情况！"');
    lines.push('');
    lines.push('主角立刻打开了门，看到好友一脸焦急的样子。');
    lines.push('');
    lines.push('"出事了！"好友气喘吁吁地说道，"他们发现了我们的计划！"');
    lines.push('');
    lines.push('主角的脸色瞬间变得凝重。');
    lines.push('');
    
    // 推进节点
    if (contract?.cpns) {
      for (const cpn of contract.cpns.slice(0, 2)) {
        lines.push('');
        lines.push(`就在这时，${cpn.description}`);
      }
    }
    
    lines.push('');
    lines.push('情况比他想象的要复杂得多。');
    lines.push('');
    
    // 结尾钩子
    lines.push('正当他准备采取行动时，一个意想不到的人出现了。');
    lines.push('');
    lines.push('"好久不见。"来人的嘴角带着一丝意味深长的笑容。');
    lines.push('');
    lines.push('主角的瞳孔猛地收缩——这个人，竟然是他以为已经死去的人！');
    lines.push('');
    lines.push('【本章完】');
    
    return lines.join('\n');
  }

  // ============================================================
  // 后处理
  // ============================================================

  /**
   * 后处理生成的内容
   */
  function postProcess(content: string, task: WritingTask): string {
    let processed = content;

    // 移除多余的空行
    processed = processed.replace(/\n{3,}/g, '\n\n');

    // 规范化标点
    processed = processed.replace(/([。！？])\s*/g, '$1');

    // 确保章节标题格式
    if (options_.value.includeTitle) {
      const titleMatch = processed.match(/^#\s*(.+)$/m);
      if (!titleMatch) {
        processed = `# ${task.contract?.meta.title || `第${task.chapterNumber}章`}\n\n${processed}`;
      }
    }

    // 质量优化
    if (options_.value.autoOptimize) {
      processed = optimizeQuality(processed);
    }

    return processed;
  }

  /**
   * 优化内容质量
   */
  function optimizeQuality(content: string): string {
    let optimized = content;

    // 检查字数
    const wordCount = countWords(optimized);
    
    if (wordCount < options_.value.minWords) {
      // 内容太少，添加更多细节
      optimized = enhanceContent(optimized, options_.value.minWords - wordCount);
    }

    return optimized;
  }

  /**
   * 增强内容
   */
  function enhanceContent(content: string, targetAdd: number): string {
    // 简单的增强策略
    const paragraphs = content.split('\n\n');
    
    // 在中间段落添加细节
    const insertIndex = Math.floor(paragraphs.length / 2);
    const insertContent = '\n\n这其中蕴含着许多细节，每一个都值得深入探索。\n\n';
    
    paragraphs.splice(insertIndex, 0, insertContent);
    
    return paragraphs.join('\n\n');
  }

  // ============================================================
  // 信息提取
  // ============================================================

  /**
   * 提取爽点
   */
  function extractCoolPoints(content: string): string[] {
    const coolPointKeywords = [
      '打脸', '装逼', '突破', '成长', '逆袭',
      '震惊', '惊叹', '不敢相信', '目瞪口呆',
      '反转', '揭示', '身份', '原来如此'
    ];

    const points: string[] = [];
    
    for (const keyword of coolPointKeywords) {
      if (content.includes(keyword)) {
        points.push(keyword);
      }
    }

    return [...new Set(points)];
  }

  /**
   * 提取伏笔更新
   */
  function extractForeshadowUpdates(content: string): string[] {
    const foreshadowKeywords = [
      '伏笔', '暗示', '预示', '将来', '未来',
      '埋下', '隐藏', '秘密', '真相'
    ];

    const updates: string[] = [];
    
    for (const keyword of foreshadowKeywords) {
      if (content.includes(keyword)) {
        updates.push(keyword);
      }
    }

    return [...new Set(updates)];
  }

  // ============================================================
  // 质量评估
  // ============================================================

  /**
   * 计算质量分数
   */
  function calculateQualityScore(content: string, task: WritingTask): number {
    let score = 70; // 基础分

    // 字数检查
    const wordCount = countWords(content);
    if (wordCount >= options_.value.minWords) {
      score += 10;
    } else {
      score -= 10;
    }

    // 钩子检查
    if (task.contract?.cen.cliffhanger) {
      if (content.includes('！') || content.includes('？') || content.includes('...')) {
        score += 5;
      }
    }

    // 节奏检查（简化版）
    const paragraphs = content.split('\n\n').length;
    if (paragraphs >= 10) {
      score += 5;
    }

    // 结尾检查
    if (content.includes('本章完') || content.includes('【') && content.includes('完】')) {
      score += 5;
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * 统计字数
   */
  function countWords(text: string): number {
    // 去除标题和标记
    let cleaned = text.replace(/^#.*$/gm, '');
    cleaned = cleaned.replace(/【.*?】/g, '');
    cleaned = cleaned.replace(/\n/g, '');
    
    // 中文字符 + 英文单词
    const chineseChars = (cleaned.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (cleaned.match(/[a-zA-Z]+/g) || []).length;
    
    return chineseChars + englishWords;
  }

  // ============================================================
  // 配置
  // ============================================================

  /**
   * 更新配置
   */
  function updateOptions(updates: Partial<WritingOptions>): void {
    options_.value = { ...options_.value, ...updates };
  }

  /**
   * 重置配置
   */
  function resetOptions(): void {
    options_.value = { ...defaultOptions };
  }

  // ============================================================
  // 历史管理
  // ============================================================

  /**
   * 获取写作历史
   */
  function getHistory(chapterNumber?: number): WritingResult[] {
    if (chapterNumber !== undefined) {
      return writingHistory.value.filter(r => r.chapterNumber === chapterNumber);
    }
    return writingHistory.value;
  }

  /**
   * 清除历史
   */
  function clearHistory(): void {
    writingHistory.value = [];
  }

  // ============================================================
  // 返回
  // ============================================================

  return {
    // 状态
    isWriting,
    currentTask,
    lastResult,
    writingHistory,

    // 配置
    options: options_,
    updateOptions,
    resetOptions,

    // 写作
    write,

    // 历史
    getHistory,
    clearHistory,

    // 工具
    countWords,
    buildPrompt,
    buildWritingContext,
  };
}

// ============================================================
// 类型导出（必须在函数定义之后）
// ============================================================

export type UseContextManagerReturn = ReturnType<typeof useContextManager>;

export interface ContextManagerInterface {
  getChapterStartContext: (chapter: number) => string;
  getChapterEndContext: (chapter: number) => string;
  initialize: () => void;
  updateContext: () => void;
}

/**
 * 写作上下文构建器
 * 基于 webnovel-writer 架构
 * 
 * 职责：
 * - 整合项目、记忆、合同、追读力信号等上下文
 * - 为 TaskBookBuilder、DraftAgent、ReviewAgent 提供统一上下文
 */

import { ref, computed } from 'vue';
import { useProjectStore } from '@/stores/project.store';
import { useActiveAIProvider } from './useActiveAIProvider';
import { MemoryOrchestrator } from '@/services/writing/memory/MemoryOrchestrator';
import { ContractManager } from '@/services/writing/contract/ContractManager';
import { useReaderSignals } from '@/services/writing/memory/ReaderSignals';
import type { MemoryPack } from '@/services/writing/memory/types';
import type { ReaderSignals as ReaderSignalsType } from '@/services/writing/memory/types';
import type { ChapterContract } from '@/services/writing/contract/types';
import type { CharacterConstraint, ChapterType } from '@/types/writing-task';

// ============================================================
// 类型定义
// ============================================================

export interface WritingContextOptions {
  chapterId?: string;
  targetWordCount?: number;
  writingStyle?: 'concise' | 'elegant' | 'humorous' | 'ancient';
  includePreviousChapter?: boolean;
}

export interface WritingContext {
  // 基础信息
  chapterId: string;
  chapterIndex: number;
  chapterTitle: string;
  chapterOutline: string;
  chapterType: ChapterType;
  existingContent: string;
  
  // 项目信息
  project: {
    id: string;
    name: string;
    description: string;
    genre: string[];
  };
  
  // 记忆包
  memoryPack: MemoryPack;
  
  // 追读力信号
  readerSignals: ReaderSignalsType;
  
  // 合同
  contract: ChapterContract | null;
  
  // 前文摘要
  previousChapter: {
    title: string;
    content: string;
    summary: string;
    ending: string;
  } | null;
  
  // 写作参数
  writingStyle: 'concise' | 'elegant' | 'humorous' | 'ancient';
  targetWordCount: number;
  
  // 角色信息
  characters: CharacterConstraint[];
  
  // 活跃伏笔
  activeForeshadows: Array<{
    id: string;
    hint: string;
    status: string;
  }>;
  
  // 完整大纲
  fullOutline: string | null;
  
  // 时间戳
  builtAt: string;
}

// ============================================================
// Composable 实现
// ============================================================

export function useWritingContext() {
  const projectStore = useProjectStore();
  const { requireAIService } = useActiveAIProvider();
  
  // 子系统实例（单例）
  const memoryOrchestrator = new MemoryOrchestrator();
  const contractManager = new ContractManager();
  const readerSignalsManager = useReaderSignals();
  
  // 缓存的上下文
  const cachedContext = ref<WritingContext | null>(null);
  const cacheTimestamp = ref<number>(0);
  const CACHE_TTL = 30000; // 30秒缓存
  
  // ============================================================
  // 核心方法
  // ============================================================
  
  /**
   * 构建写作上下文
   */
  function buildContext(options: WritingContextOptions = {}): WritingContext | null {
    const project = projectStore.currentProject;
    const currentChapter = projectStore.currentChapter;
    
    if (!project) {
      console.warn('[useWritingContext] 未找到当前项目');
      return null;
    }
    
    const chapterId = options.chapterId || currentChapter?.id;
    if (!chapterId) {
      console.warn('[useWritingContext] 未指定章节ID');
      return null;
    }
    
    // 检查缓存
    const now = Date.now();
    if (cachedContext.value && 
        cachedContext.value.chapterId === chapterId &&
        now - cacheTimestamp.value < CACHE_TTL) {
      console.log('[useWritingContext] 使用缓存的上下文');
      return cachedContext.value;
    }
    
    // 计算章节索引
    const chapterIndex = projectStore.sortedChapters.findIndex(c => c.id === chapterId);
    const chapter = projectStore.sortedChapters[chapterIndex];
    
    if (!chapter) {
      console.warn('[useWritingContext] 未找到章节:', chapterId);
      return null;
    }
    
    // 获取前章
    const prevChapter = options.includePreviousChapter !== false && chapterIndex > 0
      ? projectStore.sortedChapters[chapterIndex - 1]
      : null;
    
    // 构建上下文
    const context: WritingContext = {
      // 基础信息
      chapterId: chapter.id,
      chapterIndex,
      chapterTitle: chapter.title,
      chapterOutline: chapter.plotSummary || extractOutlineFromPlot(project.plotOutline, chapter.id),
      chapterType: determineChapterType(chapter.plotSummary, chapterIndex),
      existingContent: chapter.content || '',
      
      // 项目信息
      project: {
        id: project.id,
        name: project.name,
        description: project.description || '',
        genre: project.genre?.map(g => g.name || g) || [],
      },
      
      // 记忆包（同步构建）
      memoryPack: buildMemoryPackSync(chapterIndex),
      
      // 追读力信号
      readerSignals: readerSignalsManager.getSignals(),
      
      // 合同
      contract: loadChapterContract(chapterIndex),
      
      // 前文摘要
      previousChapter: prevChapter ? {
        title: prevChapter.title,
        content: prevChapter.content || '',
        summary: extractSummary(prevChapter.content),
        ending: extractEnding(prevChapter.content),
      } : null,
      
      // 写作参数
      writingStyle: options.writingStyle || 'concise',
      targetWordCount: options.targetWordCount || 3000,
      
      // 角色信息
      characters: buildCharacterConstraints(project.characters || []),
      
      // 活跃伏笔
      activeForeshadows: (project.foreshadows || [])
        .filter((f: any) => f.status !== 'resolved')
        .slice(0, 5)
        .map((f: any) => ({
          id: f.id,
          hint: f.hint,
          status: f.status,
        })),
      
      // 完整大纲
      fullOutline: buildFullOutlineString(project.plotOutline),
      
      // 时间戳
      builtAt: new Date().toISOString(),
    };
    
    // 缓存
    cachedContext.value = context;
    cacheTimestamp.value = now;
    
    return context;
  }
  
  /**
   * 异步构建上下文（包含AI增强）
   */
  async function buildContextAsync(options: WritingContextOptions = {}): Promise<WritingContext | null> {
    const context = buildContext(options);
    if (!context) return null;
    
    // 可以在这里添加AI增强的记忆提取等异步操作
    // 目前暂时保持同步
    
    return context;
  }
  
  /**
   * 清除缓存
   */
  function clearCache(): void {
    cachedContext.value = null;
    cacheTimestamp.value = 0;
  }
  
  /**
   * 获取上下文摘要（用于日志/调试）
   */
  function getContextSummary(): string {
    const ctx = cachedContext.value;
    if (!ctx) return '无上下文';
    
    return [
      `章节: 第${ctx.chapterIndex + 1}章 ${ctx.chapterTitle}`,
      `类型: ${ctx.chapterType}`,
      `字数: ${ctx.targetWordCount}`,
      `风格: ${ctx.writingStyle}`,
      `记忆: ${ctx.memoryPack.workingMemory.length}条工作记忆`,
      `角色: ${ctx.characters.length}个`,
      `伏笔: ${ctx.activeForeshadows.length}个活跃`,
    ].join('\n');
  }
  
  // ============================================================
  // 私有方法
  // ============================================================
  
  /**
   * 同步构建记忆包（简化版）
   */
  function buildMemoryPackSync(chapterIndex: number): MemoryPack {
    // 返回基本结构，实际的记忆包由 MemoryOrchestrator 异步构建
    return {
      workingMemory: [],
      episodicMemory: [],
      semanticMemory: [],
      activeConstraints: [],
      recentChanges: [],
      warnings: [],
      stats: {
        total: 0,
        workingTotal: 0,
        episodicTotal: 0,
        semanticTotal: 0,
        injected: 0,
        layeredTotalInjected: 0,
        filtered: 0,
        conflicts: 0,
      },
    };
  }
  
  /**
   * 加载章节合同
   */
  function loadChapterContract(chapterIndex: number): ChapterContract | null {
    try {
      return contractManager.loadChapterContract(chapterIndex);
    } catch (error) {
      console.warn('[useWritingContext] 加载合同失败:', error);
      return null;
    }
  }
  
  /**
   * 提取章节摘要
   */
  function extractSummary(content: string): string {
    if (!content) return '';
    // 简单实现：取前300字
    return content.slice(0, 300);
  }
  
  /**
   * 提取章节结尾
   */
  function extractEnding(content: string): string {
    if (!content) return '';
    // 简单实现：取最后200字
    return content.slice(-200);
  }
  
  /**
   * 从大纲中提取章节大纲
   */
  function extractOutlineFromPlot(plotOutline: any[], chapterId: string): string {
    const chapter = plotOutline?.find((p: any) => p.chapterId === chapterId);
    return chapter?.description || chapter?.plotSummary || '';
  }
  
  /**
   * 确定章节类型
   */
  function determineChapterType(outline: string | undefined, index: number): ChapterType {
    if (!outline) {
      if (index === 0) return 'world_intro';
      return 'normal';
    }
    
    const lowerOutline = outline.toLowerCase();
    
    if (lowerOutline.includes('世界观') || lowerOutline.includes('背景')) return 'world_intro';
    if (lowerOutline.includes('登场') || lowerOutline.includes('出场')) return 'character_intro';
    if (lowerOutline.includes('开端') || lowerOutline.includes('开始')) return 'plot_setup';
    if (lowerOutline.includes('高潮') || lowerOutline.includes('决战')) return 'climax';
    if (lowerOutline.includes('解决') || lowerOutline.includes('结束')) return 'resolution';
    if (lowerOutline.includes('过渡') || lowerOutline.includes('间章')) return 'transitional';
    if (lowerOutline.includes('终章') || lowerOutline.includes('尾声')) return 'ending';
    
    return 'normal';
  }
  
  /**
   * 构建角色约束
   */
  function buildCharacterConstraints(characters: any[]): CharacterConstraint[] {
    return (characters || []).slice(0, 10).map((char: any) => ({
      name: char.name,
      state: char.profile?.background || '状态未知',
      motivation: inferMotivation(char),
      role: char.role || '角色',
      dialogueTendency: inferDialogueTendency(char),
    }));
  }
  
  /**
   * 推断角色动机
   */
  function inferMotivation(char: any): string {
    const relationships = char.profile?.relationships || [];
    const goals: string[] = [];
    
    for (const rel of relationships) {
      if (rel.type === 'mentor') goals.push('寻求指导');
      if (rel.type === 'enemy') goals.push('对抗或复仇');
      if (rel.type === 'rival') goals.push('竞争或超越');
    }
    
    return goals.length > 0 ? goals.join('、') : '推进剧情';
  }
  
  /**
   * 推断对话倾向
   */
  function inferDialogueTendency(char: any): string {
    const personality = char.profile?.personality || [];
    
    if (personality.includes('冷静') || personality.includes('内敛')) {
      return '简短有力，少说多听';
    }
    if (personality.includes('活泼') || personality.includes('开朗')) {
      return '话语较多，善于调节气氛';
    }
    if (personality.includes('傲慢') || personality.includes('高傲')) {
      return '语气强势，不轻易妥协';
    }
    
    return '正常对话，符合角色性格';
  }
  
  /**
   * 构建完整大纲字符串
   */
  function buildFullOutlineString(plotOutline: any[]): string | null {
    if (!plotOutline || plotOutline.length === 0) return null;
    
    const chapterNodes = plotOutline
      .filter((p: any) => p.type === 'chapter')
      .sort((a: any, b: any) => a.orderIndex - b.orderIndex);
    
    if (chapterNodes.length === 0) return null;
    
    return chapterNodes
      .map((node: any, index: number) => {
        const chapterNum = index + 1;
        const title = node.title || `第${chapterNum}章`;
        const description = node.description || node.plotSummary || '（暂无大纲）';
        return `【第${chapterNum}章】${title}\n${description}`;
      })
      .join('\n\n');
  }
  
  // ============================================================
  // 导出
  // ============================================================
  
  return {
    // 状态
    cachedContext,
    
    // 方法
    buildContext,
    buildContextAsync,
    clearCache,
    getContextSummary,
    
    // 子系统访问
    memoryOrchestrator,
    contractManager,
    readerSignalsManager,
  };
}

// ============================================================
// 类型导出
// ============================================================

export type { WritingContext, WritingContextOptions };

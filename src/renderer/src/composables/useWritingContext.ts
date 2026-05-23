/**
 * 写作上下文 Composable
 * 构建和管理写作所需的上下文信息
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
  writingStyle?: WritingStyle;
  includePreviousChapter?: boolean;
}

export type WritingStyle = 'concise' | 'elegant' | 'humorous' | 'ancient';

export interface WritingContext {
  chapterId: string;
  chapterIndex: number;
  chapterTitle: string;
  chapterOutline: string;
  chapterType: ChapterType;
  existingContent: string;

  project: ProjectInfo;

  memoryPack: MemoryPack;

  readerSignals: ReaderSignalsType;

  contract: ChapterContract | null;

  previousChapter: PreviousChapter | null;

  writingStyle: WritingStyle;
  targetWordCount: number;

  characters: CharacterConstraint[];

  activeForeshadows: ForeshadowInfo[];

  fullOutline: string | null;

  builtAt: string;
}

export interface ProjectInfo {
  id: string;
  name: string;
  description: string;
  genre: string[];
}

export interface PreviousChapter {
  title: string;
  content: string;
  summary: string;
  ending: string;
}

export interface ForeshadowInfo {
  id: string;
  hint: string;
  status: string;
}

// ============================================================
// Composable 实现
// ============================================================

export function useWritingContext() {
  const projectStore = useProjectStore();
  const { requireAIService } = useActiveAIProvider();

  // 子系统实例
  const memoryOrchestrator = new MemoryOrchestrator();
  const contractManager = new ContractManager();
  const readerSignalsManager = useReaderSignals();

  // 缓存
  const cachedContext = ref<WritingContext | null>(null);
  const cacheTimestamp = ref(0);
  const CACHE_TTL_MS = 30_000; // 30秒

  // ============================================================
  // 公开 API
  // ============================================================

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
    if (
      cachedContext.value &&
      cachedContext.value.chapterId === chapterId &&
      now - cacheTimestamp.value < CACHE_TTL_MS
    ) {
      return cachedContext.value;
    }

    // 获取章节索引
    const chapterIndex = projectStore.sortedChapters.findIndex((c) => c.id === chapterId);
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
      chapterId: chapter.id,
      chapterIndex,
      chapterTitle: chapter.title,
      chapterOutline: chapter.plotSummary || extractOutlineFromPlot(project.plotOutline, chapterId),
      chapterType: determineChapterType(chapter.plotSummary, chapterIndex),
      existingContent: chapter.content || '',

      project: {
        id: project.id,
        name: project.name,
        description: project.description || '',
        genre: project.genre?.map((g) => (typeof g === 'string' ? g : g.name)) || [],
      },

      memoryPack: buildMemoryPackSync(chapterIndex),

      readerSignals: readerSignalsManager.getSignals(),

      contract: loadChapterContract(chapterIndex),

      previousChapter: prevChapter
        ? {
          title: prevChapter.title,
          content: prevChapter.content || '',
          summary: extractSummary(prevChapter.content),
          ending: extractEnding(prevChapter.content),
        }
        : null,

      writingStyle: options.writingStyle || 'concise',
      targetWordCount: options.targetWordCount || 3000,

      characters: buildCharacterConstraints(project.characters || []),

      activeForeshadows: (project.foreshadows || [])
        .filter((f) => f.status !== 'resolved')
        .slice(0, 5)
        .map((f) => ({
          id: f.id,
          hint: f.hint,
          status: f.status,
        })),

      fullOutline: buildFullOutlineString(project.plotOutline),

      builtAt: new Date().toISOString(),
    };

    cachedContext.value = context;
    cacheTimestamp.value = now;

    return context;
  }

  async function buildContextAsync(options: WritingContextOptions = {}): Promise<WritingContext | null> {
    const context = buildContext(options);
    return context;
  }

  function clearCache(): void {
    cachedContext.value = null;
    cacheTimestamp.value = 0;
  }

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

  function buildMemoryPackSync(chapterIndex: number): MemoryPack {
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

  function loadChapterContract(chapterIndex: number): ChapterContract | null {
    try {
      return contractManager.loadChapterContract(chapterIndex);
    } catch (err) {
      console.warn('[useWritingContext] 加载合同失败:', err);
      return null;
    }
  }

  function extractSummary(content: string): string {
    if (!content) return '';
    return content.slice(0, 300);
  }

  function extractEnding(content: string): string {
    if (!content) return '';
    return content.slice(-200);
  }

  function extractOutlineFromPlot(plotOutline: unknown, chapterId: string): string {
    if (!plotOutline || !Array.isArray(plotOutline)) return '';
    const chapter = plotOutline.find((p: { chapterId?: string }) => p.chapterId === chapterId);
    return chapter?.description || chapter?.plotSummary || '';
  }

  function determineChapterType(outline: string | undefined, index: number): ChapterType {
    if (!outline) {
      return index === 0 ? 'world_intro' : 'normal';
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

  function buildCharacterConstraints(characters: unknown[]): CharacterConstraint[] {
    return (characters || []).slice(0, 10).map((char: unknown) => {
      const c = char as {
        name?: string;
        role?: string;
        profile?: {
          background?: string;
          relationships?: Array<{ type?: string }>;
          personality?: string[];
        };
      };
      return {
        name: c.name || '未知',
        state: c.profile?.background || '状态未知',
        motivation: inferMotivation(c.profile?.relationships || []),
        role: c.role || '角色',
        dialogueTendency: inferDialogueTendency(c.profile?.personality || []),
      };
    });
  }

  function inferMotivation(relationships: Array<{ type?: string }>): string {
    const goals: string[] = [];

    for (const rel of relationships) {
      if (rel.type === 'mentor') goals.push('寻求指导');
      else if (rel.type === 'enemy') goals.push('对抗或复仇');
      else if (rel.type === 'rival') goals.push('竞争或超越');
    }

    return goals.length > 0 ? goals.join('、') : '推进剧情';
  }

  function inferDialogueTendency(personality: string[]): string {
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

  function buildFullOutlineString(plotOutline: unknown): string | null {
    if (!plotOutline || !Array.isArray(plotOutline) || plotOutline.length === 0) {
      return null;
    }

    const chapterNodes = plotOutline
      .filter((p: { type?: string }) => p.type === 'chapter')
      .sort((a: { orderIndex?: number }, b: { orderIndex?: number }) => (a.orderIndex || 0) - (b.orderIndex || 0));

    if (chapterNodes.length === 0) return null;

    return chapterNodes
      .map((node: { title?: string; description?: string; plotSummary?: string }, index: number) => {
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
    cachedContext,

    buildContext,
    buildContextAsync,
    clearCache,
    getContextSummary,

    memoryOrchestrator,
    contractManager,
    readerSignalsManager,
  };
}

export type { WritingContext, WritingContextOptions };

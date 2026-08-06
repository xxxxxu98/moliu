/**
 * 章节目录生成 Composable
 * 封装从大纲自动生成章节目录的业务逻辑
 * 整合 oh-story-claudecode 和 webnovel-writer 的增强方法论
 */

import { ref, readonly } from 'vue';
import { useProjectStore } from '@/stores/project.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useActiveAIProvider } from './useActiveAIProvider';
import type { WritingStyle, GenerateChapterResponse } from '@/types/writing';
import type { PlotNode, Character } from '@/types/project';
import { PromptBuilder } from '@/services/writing/prompt-builder';

/**
 * 章节结构化节点
 * 参考 webnovel-writer 的 CBN/CPNs/CEN 设计
 * 节点格式：主体 | 动作/变化 | 对象/结果
 */
export interface ChapterStructureNodes {
  /** 章节起点 (CBN) - 本章开始时的具体情境 */
  CBN: string;
  /** 推进节点 (CPNs) - 2-4个核心情节推进，按时间顺序排列 */
  CPNs: string[];
  /** 章节终点 (CEN) - 本章结束时的状态/结果 */
  CEN: string;
  /** 必须覆盖节点 - 最多4个本章必须完成的关键点 */
  mustCover: string[];
  /** 本章禁区 - 最多5条本章绝对不能发生的内容 */
  forbiddenZones: string[];
}

/**
 * 章节钩子设计
 */
export interface ChapterHookDesign {
  /** 章首钩子类型 */
  openingHook: {
    type: string;
    description: string;
    content: string;
  };
  /** 章尾钩子类型 */
  endingHook: {
    type: string;
    description: string;
    tension: 'strong' | 'medium' | 'weak';
    content: string;
  };
}

/**
 * 章节爽点设计
 */
export interface ChapterCoolPointDesign {
  /** 本章微爽点 */
  microCoolPoint: string;
  /** 铺垫内容（为后续爽点做准备） */
  foreshadowing: string[];
  /** 是否为高潮章节 */
  isClimax: boolean;
  /** 爽点类型 */
  coolPointType: 'battle' | 'emotional' | 'status' | 'revelation' | 'revenge';
}

/**
 * 章节时间线设计
 */
export interface ChapterTimelineDesign {
  /** 本章时间跨度 */
  timeSpan: string;
  /** 与上一章的时间差 */
  timeFromPrevious: string;
  /** 时间线状态 */
  timelineStatus: 'normal' | 'flashback' | 'timejump';
  /** 倒计时状态（如果有） */
  countdown?: {
    event: string;
    remaining: string;
    chaptersUntil: number;
  };
}

/**
 * 增强版章节生成结果
 * 包含完整的细纲信息
 */
export interface EnhancedChapter extends GeneratedChapter {
  // ========== 原有字段 ==========
  title: string;
  outline: string;
  orderIndex: number;
  keyEvents: string[];
  foreshadows: string[];
  chapterType?: string;
  
  // ========== 结构化节点 (CBN/CPNs/CEN) ==========
  CBN?: string;
  CPNs?: string[];
  CEN?: string;
  mustCover?: string[];
  forbiddenZones?: string[];
  
  // ========== 钩子设计 (新增) ==========
  openingHook?: {
    type: string;
    description: string;
    content: string;
  };
  endingHook?: {
    type: string;
    description: string;
    tension: 'strong' | 'medium' | 'weak';
    content: string;
  };
  
  // ========== 爽点设计 (新增) ==========
  coolPoint?: {
    microCoolPoint: string;
    foreshadowing: string[];
    isClimax: boolean;
    coolPointType: string;
  };
  
  // ========== 时间线设计 (新增) ==========
  timeline?: {
    timeSpan: string;
    timeFromPrevious: string;
    timelineStatus: 'normal' | 'flashback' | 'timejump';
    countdown?: {
      event: string;
      remaining: string;
      chaptersUntil: number;
    };
  };
  
  // ========== 涉及角色 (新增) ==========
  involvedCharacters?: string[];
  
  // ========== 写作要求 (新增) ==========
  writingRequirements?: {
    pace: 'fast' | 'normal' | 'slow';
    tension: 'high' | 'medium' | 'low';
    dialogueRatio: number; // 对话占比 0.3-0.5
  };
}

/**
 * 章节预览信息
 * 用于UI展示
 */
export interface ChapterPreview {
  id: string;
  orderIndex: number;
  title: string;
  summary: string;
  chapterType: string;
  isClimax: boolean;
  hasHook: boolean;
  hasCoolPoint: boolean;
  timeSpan?: string;
}

export interface GeneratedChapter {
  title: string;
  outline: string;
  orderIndex: number;
  keyEvents: string[];
  foreshadows: string[];
  chapterType?: string;

  // ========== 新增：结构化节点 ==========
  /** 章节起点 (CBN) */
  CBN?: string;
  /** 推进节点 (CPNs) */
  CPNs?: string[];
  /** 章节终点 (CEN) */
  CEN?: string;
  /** 必须覆盖节点（≤4个）*/
  mustCover?: string[];
  /** 本章禁区（≤5条）*/
  forbiddenZones?: string[];
  /** 章节时长 */
  timeSpan?: string;
  /** 涉及角色 */
  involvedCharacters?: string[];

  // ========== 写作策略（与 PlotNode 对齐）==========
  /** 章尾钩子类型 */
  hookType?: string;
  /** 节奏策略 */
  pacingStrategy?: string;
  /** 是否为高潮章节 */
  isClimax?: boolean;
  /** 预期爽点数 */
  expectedCoolPoints?: number;
}

export interface UseChapterOutlineGeneratorReturn {
  // 状态
  isGenerating: typeof isGenerating;
  error: typeof error;
  generatedChapters: typeof generatedChapters;

  // 方法
  generateOutlines: (options?: {
    chapterCount?: number;
    wordsPerChapter?: number;
    style?: WritingStyle;
    // 新增选项
    generateEnhanced?: boolean; // 是否生成增强版细纲
    outlineFramework?: any; // 五步大纲框架
  }) => Promise<GeneratedChapter[] | null>;
  applyOutlines: (chapters: GeneratedChapter[]) => Promise<boolean>;
  createChapters: (chapters: GeneratedChapter[]) => Promise<string[]>;
  
  // 辅助方法
  getChapterPreviews: (chapters: GeneratedChapter[]) => ChapterPreview[];
  validateChapterStructure: (chapter: GeneratedChapter) => { isValid: boolean; issues: string[] };
}

const isGenerating = ref(false);
const error = ref<string | null>(null);
const generatedChapters = ref<GeneratedChapter[]>([]);

export function useChapterOutlineGenerator(): UseChapterOutlineGeneratorReturn {
  const projectStore = useProjectStore();
  const settingsStore = useSettingsStore();
  const { requireAIService } = useActiveAIProvider();

  /**
   * 获取 AI 客户端
   * 使用统一的 AI Provider 获取逻辑
   */
  function getAIClient() {
    return requireAIService();
  }

  /**
   * 从大纲生成章节目录
   */
  async function generateOutlines(options?: {
    chapterCount?: number;
    wordsPerChapter?: number;
    style?: WritingStyle;
  }): Promise<GeneratedChapter[] | null> {
    const project = projectStore.currentProject;
    if (!project) {
      error.value = '请先选择一个项目';
      return null;
    }

    const chapterCount = options?.chapterCount || Math.ceil(
      (project.targetWordCount || 800000) / (options?.wordsPerChapter || 4000)
    );
    const wordsPerChapter = options?.wordsPerChapter || 4000;
    const style = options?.style || 'concise';

    isGenerating.value = true;
    error.value = null;
    generatedChapters.value = [];

    try {
      // 构建 prompt
      const worldSchema = project.worldSchema;
      const characters = project.characters?.slice(0, 5) || [];

      const prompt = PromptBuilder.buildChapterOutlinePrompt(
        project.name,
        project.description || '',
        chapterCount,
        wordsPerChapter,
        style,
        worldSchema ? {
          locations: (worldSchema.locations || []).map(l => ({
            name: l.name,
            description: l.description || '',
            level: l.level || 'other',
          })),
          rules: (worldSchema.rules || []).map(r => ({
            name: r.name,
            description: r.description,
          })),
          factions: (worldSchema.factions || []).map(f => ({
            name: f.name,
            description: f.description || '',
          })),
        } : undefined,
        characters.map(c => ({
          id: c.id,
          name: c.name,
          role: c.role || '',
          description: c.description || '',
          personality: c.profile?.personality || [],
        }))
      );

      // 生成内容
      const aiClient = getAIClient() as any;
      const result = await aiClient.continueWriting(
        {
          project,
          currentChapterId: '',
          currentChapterIndex: 0,
          currentChapterTitle: project.name,
          currentChapterContent: '',
          currentChapterOutline: prompt,
        },
        'smartContinue',
        4000,
        undefined,
        // 章节目录期望 JSON（{"chapters":[]}）：按 provider 能力启用 JSON 强制
        true
      );

      if (!result?.content) {
        error.value = 'AI 返回内容为空';
        return null;
      }

      // 解析 JSON
      const chapters = parseChaptersFromResult(result.content, chapterCount);
      generatedChapters.value = chapters;

      return chapters;

    } catch (err) {
      error.value = err instanceof Error ? err.message : '生成失败';
      return null;
    } finally {
      isGenerating.value = false;
    }
  }

  /**
   * 解析 AI 返回的章节数据
   */
  function parseChaptersFromResult(result: string, chapterCount: number): GeneratedChapter[] {
    try {
      // 尝试提取 JSON
      const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || 
                         result.match(/\{[\s\S]*"chapters"[\s\S]*\}/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);

        if (parsed.chapters && Array.isArray(parsed.chapters)) {
          return parsed.chapters.map((c: any, i: number) => ({
            title: c.title || `第${i + 1}章`,
            outline: c.outline || '',
            orderIndex: i,
            keyEvents: Array.isArray(c.keyEvents) ? c.keyEvents : [],
            foreshadows: Array.isArray(c.foreshadows) ? c.foreshadows : [],
            chapterType: c.chapterType || (i === 0 ? 'world_intro' : 'normal'),
            // 结构化节点
            CBN: c.CBN || undefined,
            CPNs: Array.isArray(c.CPNs) ? c.CPNs : undefined,
            CEN: c.CEN || undefined,
            mustCover: Array.isArray(c.mustCover) ? c.mustCover : undefined,
            forbiddenZones: Array.isArray(c.forbiddenZones) ? c.forbiddenZones : undefined,
            timeSpan: c.timeSpan || undefined,
            involvedCharacters: Array.isArray(c.involvedCharacters) ? c.involvedCharacters : undefined,
            // 写作策略（部分 AI 会输出这些字段，没有则保持 undefined）
            hookType: c.hookType || c.endingHook?.type || undefined,
            pacingStrategy: c.pacingStrategy || c.writingRequirements?.pace || undefined,
            isClimax: typeof c.isClimax === 'boolean' ? c.isClimax : undefined,
            expectedCoolPoints: typeof c.expectedCoolPoints === 'number' ? c.expectedCoolPoints : undefined,
          }));
        }
      }

      // 如果解析失败，尝试按行解析
      return parseChaptersFromText(result, chapterCount);

    } catch (err) {
      console.error('[ChapterOutlineGenerator] Parse error:', err);
      return parseChaptersFromText(result, chapterCount);
    }
  }

  /**
   * 从文本解析章节（备用方案）
   */
  function parseChaptersFromText(text: string, chapterCount: number): GeneratedChapter[] {
    const chapters: GeneratedChapter[] = [];
    const lines = text.split('\n');

    let currentChapter: Partial<GeneratedChapter> = {};
    let inChapter = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // 检测章节标题
      const chapterMatch = trimmed.match(/^(第[一二三四五六七八九十百千万\d]+章|Chapter\s+\d+)/i);
      if (chapterMatch) {
        // 保存之前的章节
        if (currentChapter.title && currentChapter.outline) {
          chapters.push(currentChapter as GeneratedChapter);
        }

        inChapter = true;
        currentChapter = {
          title: trimmed.replace(/^#+\s*/, ''),
          outline: '',
          orderIndex: chapters.length,
          keyEvents: [],
          foreshadows: [],
          chapterType: chapters.length === 0 ? 'world_intro' : 'normal',
        };
      } else if (inChapter && trimmed) {
        // 累积大纲内容
        currentChapter.outline = (currentChapter.outline || '') + trimmed + '\n';
      }
    }

    // 保存最后一个章节
    if (currentChapter.title) {
      chapters.push(currentChapter as GeneratedChapter);
    }

    // 如果解析出的章节数量不够，使用占位符补充
    while (chapters.length < chapterCount) {
      chapters.push({
        title: `第${chapters.length + 1}章`,
        outline: '（待补充）',
        orderIndex: chapters.length,
        keyEvents: [],
        foreshadows: [],
        chapterType: chapters.length === 0 ? 'world_intro' : 'normal',
      });
    }

    return chapters.slice(0, chapterCount);
  }

  /**
   * 应用生成的章节大纲到项目
   * 
   * 修复：保存完整的结构化节点数据（CBN, CPNs, CEN, mustCover, forbiddenZones 等）
   */
  async function applyOutlines(chapters: GeneratedChapter[]): Promise<boolean> {
    try {
      // 合并式更新：保留现有 plotOutline 中所有非 chapter 节点（act/subplot/foreshadow 等），
      // 仅替换/更新 type==='chapter' 的节点。
      // 历史实现是覆盖式赋值，会把 useProjectCreator 写入的 act/subplot 节点全清掉。
      const existing = projectStore.plotOutline ?? [];
      const nonChapterNodes = existing.filter(node => node.type !== 'chapter');
      const existingChapterByOrder = new Map<number, PlotNode>();
      for (const node of existing) {
        if (node.type === 'chapter') {
          existingChapterByOrder.set(node.orderIndex, node);
        }
      }

      const chapterNodes: PlotNode[] = chapters.map((chapter, index) => {
        const prev = existingChapterByOrder.get(index);
        // 复用既有 id/chapterId/parentId（编辑器可能已绑定），仅更新大纲字段
        const base = prev
          ? {
              id: prev.id,
              chapterId: prev.chapterId,
              parentId: prev.parentId,
            }
          : {
              id: `plot-chapter-${index}-${Date.now()}`,
              chapterId: undefined,
              parentId: undefined,
            };
        return {
          ...base,
          title: chapter.title,
          description: chapter.outline,
          type: 'chapter' as const,
          orderIndex: index,
          // 原有字段
          keyEvents: chapter.keyEvents,
          relatedCharacters: chapter.involvedCharacters || [],
          // ========== 结构化节点（完整保存）==========
          CBN: chapter.CBN,
          CPNs: chapter.CPNs,
          CEN: chapter.CEN,
          mustCover: chapter.mustCover,
          forbiddenZones: chapter.forbiddenZones,
          timeSpan: chapter.timeSpan,
          // ========== 写作策略（完整保存，续写端会读这些字段）==========
          chapterType: chapter.chapterType as PlotNode['chapterType'],
          hookType: chapter.hookType as PlotNode['hookType'],
          pacingStrategy: chapter.pacingStrategy as PlotNode['pacingStrategy'],
          isClimax: chapter.isClimax,
          expectedCoolPoints: chapter.expectedCoolPoints,
          purpose: chapter.CBN ? `CBN: ${chapter.CBN}\nCEN: ${chapter.CEN || '待定'}` : undefined,
        } as PlotNode;
      });

      projectStore.plotOutline = [...nonChapterNodes, ...chapterNodes];
      await projectStore.saveCurrentProject();

      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '应用大纲失败';
      return false;
    }
  }

  /**
   * 创建章节
   */
  async function createChapters(chapters: GeneratedChapter[]): Promise<string[]> {
    const project = projectStore.currentProject;
    if (!project) {
      error.value = '请先选择一个项目';
      return [];
    }

    const createdChapterIds: string[] = [];

    try {
      // 获取第一个卷
      const firstVolume = projectStore.sortedVolumes[0];
      if (!firstVolume) {
        // 创建默认卷
        projectStore.addVolume({
          id: `vol-${Date.now()}`,
          name: '第一卷',
          orderIndex: 0,
        });
      }

      const volumeId = projectStore.sortedVolumes[0]?.id;
      if (!volumeId) {
        throw new Error('无法创建卷');
      }

      // 创建章节
      for (const chapter of chapters) {
        const newChapter = await projectStore.createChapter(volumeId);

        if (newChapter) {
          const chapterId = newChapter.id;
          // 构建扩展大纲（包含结构化节点）
          let extendedOutline = chapter.outline || '';
          if (chapter.CBN || chapter.CPNs || chapter.CEN) {
            const structureSection = [
              '\n\n--- 结构化节点 ---',
              chapter.CBN ? `【CBN】${chapter.CBN}` : '',
              chapter.CPNs?.length ? `【CPNs】${chapter.CPNs.join('\n')}` : '',
              chapter.CEN ? `【CEN】${chapter.CEN}` : '',
              chapter.mustCover?.length ? `【必须覆盖】${chapter.mustCover.join('、')}` : '',
              chapter.forbiddenZones?.length ? `【禁区】${chapter.forbiddenZones.join('、')}` : '',
            ].filter(Boolean).join('\n');
            extendedOutline += structureSection;
          }

          await projectStore.updateChapter(chapterId, {
            title: chapter.title,
            outline: extendedOutline,
            plotSummary: chapter.CBN ? `CBN: ${chapter.CBN}\nCEN: ${chapter.CEN}` : undefined,
          });
          createdChapterIds.push(chapterId);
        }
      }

      return createdChapterIds;

    } catch (err) {
      error.value = err instanceof Error ? err.message : '创建章节失败';
      return createdChapterIds;
    }
  }

  return {
    // 状态
    isGenerating: readonly(isGenerating),
    error: readonly(error),
    generatedChapters,

    // 方法
    generateOutlines,
    applyOutlines,
    createChapters,
    
    // 辅助方法
    getChapterPreviews,
    validateChapterStructure,
  };
}

/**
 * 获取章节预览列表
 */
function getChapterPreviews(chapters: GeneratedChapter[]): ChapterPreview[] {
  return chapters.map((chapter, index) => ({
    id: `chapter-preview-${index}`,
    orderIndex: chapter.orderIndex,
    title: chapter.title,
    summary: chapter.outline?.substring(0, 100) || '',
    chapterType: chapter.chapterType || 'normal',
    isClimax: chapter.chapterType === 'climax',
    hasHook: !!chapter.CBN && !!chapter.CEN,
    hasCoolPoint: chapter.keyEvents?.length > 0,
    timeSpan: chapter.timeSpan,
  }));
}

/**
 * 验证章节结构完整性
 */
function validateChapterStructure(chapter: GeneratedChapter): { isValid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // 检查标题
  if (!chapter.title) {
    issues.push('缺少章节标题');
  }
  
  // 检查结构化节点
  if (chapter.CBN && chapter.CBN.split('|').length !== 3) {
    issues.push('CBN格式错误，应为：主体 | 动作 | 对象');
  }
  
  if (chapter.CEN && chapter.CEN.split('|').length !== 3) {
    issues.push('CEN格式错误，应为：主体 | 动作 | 对象');
  }
  
  if (chapter.CPNs && chapter.CPNs.length > 4) {
    issues.push('CPNs数量不应超过4个');
  }
  
  if (chapter.mustCover && chapter.mustCover.length > 4) {
    issues.push('必须覆盖节点不应超过4个');
  }
  
  if (chapter.forbiddenZones && chapter.forbiddenZones.length > 5) {
    issues.push('本章禁区不应超过5条');
  }
  
  // 检查CEN与下一章CBN的承接
  // （需要在上下文中检查，这里只做基础验证）
  
  return {
    isValid: issues.length === 0,
    issues,
  };
}

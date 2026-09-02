/**
 * Projection Writers (投影写入器)
 * 
 * 职责：
 * 1. State Writer - 更新项目状态
 * 2. Index Writer - 更新索引
 * 3. Summary Writer - 更新摘要
 * 4. Memory Writer - 更新记忆
 * 5. Vector Writer - 更新向量存储
 */

import { useProjectStore } from '@/stores/project.store';
import { mergeCharacterStateChanges } from '@/services/writing/extract-plot-memory';
import { sanitizeUnconfirmedDeathDeltas } from '@/services/story-runtime/FactExtractor';
import type {
  ExtractionResult,
  DisambiguationResult,
  StateDelta,
  ProjectionStatus,
  ChapterMemory,
  CharacterArc,
  PlotThread,
} from '@/types/writing-v2';

// 投影写入器接口
export interface ProjectionWriters {
  state: StateWriter;
  index: IndexWriter;
  summary: SummaryWriter;
  memory: MemoryWriter;
  vector: VectorWriter;
}

export interface StateWriter {
  updateChapterStatus(chapter: number, status: string): Promise<void>;
  updateCharacterStates(deltas: StateDelta[]): Promise<void>;
  updatePlotProgress(progress: PlotProgress): Promise<void>;
}

export interface IndexWriter {
  updateChapterIndex(chapter: number, metadata: ChapterMetadata): Promise<void>;
  updateWordCount(total: number): Promise<void>;
  updateCoolPointIndex(points: CoolPoint[]): Promise<void>;
}

export interface SummaryWriter {
  updateChapterSummary(chapter: number, summary: string): Promise<void>;
  updateVolumeSummary(volume: number, summary: string): Promise<void>;
}

export interface MemoryWriter {
  addChapterMemory(memory: ChapterMemory): Promise<void>;
  updateCharacterArc(arc: CharacterArc): Promise<void>;
  updatePlotThread(thread: PlotThread): Promise<void>;
}

export interface VectorWriter {
  embedChapter(chapter: number, content: string): Promise<void>;
}

// 辅助类型
export interface PlotProgress {
  currentChapter: number;
  totalChapters: number;
  mainPlotProgress: number;
  subplotProgress: Record<string, number>;
}

export interface ChapterMetadata {
  title: string;
  wordCount: number;
  status: string;
  coolPoints: number;
  foreshadows: number;
}

export interface CoolPoint {
  chapter: number;
  type: string;
  description: string;
  location: number;
}

// ============================================================
// State Writer
// ============================================================

class StateWriterImpl implements StateWriter {
  private projectStore = useProjectStore();

  async updateChapterStatus(chapter: number, status: string): Promise<void> {
    const chapterId = this.getChapterId(chapter);
    if (chapterId) {
      await this.projectStore.updateChapter(chapterId, {
        status: status as any,
        updatedAt: new Date().toISOString(),
      });
      console.log('[Projection:State] 章节状态更新:', { chapter, status });
    }
  }

  async updateCharacterStates(deltas: StateDelta[]): Promise<void> {
    for (const delta of deltas) {
      // 根据 entity_id 查找角色并更新状态
      const characters = this.projectStore.characters;
      const character = characters.find(
        (c) => c.id === delta.entity_id || c.name === delta.entity_id
      );

      if (character) {
        // 更新角色状态
        if (delta.field === 'relationship') {
          // 关系变化
          await this.projectStore.updateCharacter(character.id, {
            profile: {
              ...character.profile,
              relationships: [
                ...(character.profile?.relationships || []),
                { type: 'change', targetName: delta.to, description: delta.to },
              ],
            },
          });
        } else if (delta.field === 'ability') {
          // 能力变化
          await this.projectStore.updateCharacter(character.id, {
            profile: {
              ...character.profile,
              abilities: [
                ...(character.profile?.abilities || []),
                { name: delta.to, level: 'unknown' },
              ],
            },
          });
        } else if (delta.field === 'status') {
          // 状态变化
          await this.projectStore.updateCharacter(character.id, {
            profile: {
              ...character.profile,
              status: delta.to,
            },
          });
        }
      }
    }
    console.log('[Projection:State] 角色状态更新:', { deltaCount: deltas.length });
  }

  async updatePlotProgress(progress: PlotProgress): Promise<void> {
    const project = this.projectStore.currentProject;
    if (project) {
      // 更新项目进度
      await this.projectStore.updateProjectInfo(project.id, {
        progress: {
          currentChapter: progress.currentChapter,
          totalChapters: progress.totalChapters,
          percentage: Math.round((progress.currentChapter / progress.totalChapters) * 100),
        },
      } as any);
      console.log('[Projection:State] 情节进度更新:', progress);
    }
  }

  private getChapterId(chapterNumber: number): string | null {
    const chapters = this.projectStore.sortedChapters;
    const chapter = chapters.find((c) => c.orderIndex === chapterNumber - 1);
    return chapter?.id || null;
  }
}

// ============================================================
// Index Writer
// ============================================================

class IndexWriterImpl implements IndexWriter {
  private projectStore = useProjectStore();

  async updateChapterIndex(chapter: number, metadata: ChapterMetadata): Promise<void> {
    const chapterId = this.getChapterId(chapter);
    if (chapterId) {
      await this.projectStore.updateChapter(chapterId, {
        title: metadata.title,
        wordCount: metadata.wordCount,
        status: metadata.status as any,
      });
      console.log('[Projection:Index] 章节索引更新:', { chapter, metadata });
    }
  }

  async updateWordCount(total: number): Promise<void> {
    const project = this.projectStore.currentProject;
    if (project) {
      await this.projectStore.updateProjectInfo(project.id, {
        wordCount: total,
      });
      console.log('[Projection:Index] 总字数更新:', { total });
    }
  }

  async updateCoolPointIndex(points: CoolPoint[]): Promise<void> {
    // 更新项目中的爽点索引
    console.log('[Projection:Index] 爽点索引更新:', { count: points.length });
  }

  private getChapterId(chapterNumber: number): string | null {
    const chapters = this.projectStore.sortedChapters;
    const chapter = chapters.find((c) => c.orderIndex === chapterNumber - 1);
    return chapter?.id || null;
  }
}

// ============================================================
// Summary Writer
// ============================================================

class SummaryWriterImpl implements SummaryWriter {
  private projectStore = useProjectStore();

  async updateChapterSummary(chapter: number, summary: string): Promise<void> {
    const chapterId = this.getChapterId(chapter);
    if (chapterId) {
      // 查找或创建章节摘要
      const existingSummary = this.projectStore.chapterMemories.find(
        (m) => m.chapterId === chapterId
      );

      if (existingSummary) {
        // 更新现有摘要
        existingSummary.summary = summary;
        existingSummary.corePlot = summary.slice(0, 200);
      }
      // 如果没有现有摘要，会在 MemoryWriter 中创建
      console.log('[Projection:Summary] 章节摘要更新:', { chapter });
    }
  }

  async updateVolumeSummary(volume: number, summary: string): Promise<void> {
    const volumeId = this.getVolumeId(volume);
    if (volumeId) {
      await this.projectStore.updateVolume(volumeId, {
        description: summary,
      });
      console.log('[Projection:Summary] 卷摘要更新:', { volume });
    }
  }

  private getChapterId(chapterNumber: number): string | null {
    const chapters = this.projectStore.sortedChapters;
    const chapter = chapters.find((c) => c.orderIndex === chapterNumber - 1);
    return chapter?.id || null;
  }

  private getVolumeId(volumeNumber: number): string | null {
    const volumes = this.projectStore.sortedVolumes;
    const volume = volumes.find((v) => v.orderIndex === volumeNumber - 1);
    return volume?.id || null;
  }
}

// ============================================================
// Memory Writer
// ============================================================

class MemoryWriterImpl implements MemoryWriter {
  private projectStore = useProjectStore();

  async addChapterMemory(memory: ChapterMemory): Promise<void> {
    this.projectStore.addChapterMemory(memory);
    await this.projectStore.saveCurrentProject();
    console.log('[Projection:Memory] 章节记忆添加:', {
      chapter: memory.chapterIndex,
      corePlot: memory.corePlot.slice(0, 50),
    });
  }

  async updateCharacterArc(arc: CharacterArc): Promise<void> {
    this.projectStore.updateCharacterArc(arc);
    await this.projectStore.saveCurrentProject();
    console.log('[Projection:Memory] 角色弧线更新:', {
      character: arc.characterName,
      currentStage: arc.currentStage,
    });
  }

  async updatePlotThread(thread: PlotThread): Promise<void> {
    this.projectStore.updatePlotThread(thread);
    await this.projectStore.saveCurrentProject();
    console.log('[Projection:Memory] 情节线更新:', {
      name: thread.name,
      status: thread.status,
    });
  }
}

// ============================================================
// Vector Writer (可选)
// ============================================================

class VectorWriterImpl implements VectorWriter {
  async embedChapter(chapter: number, content: string): Promise<void> {
    // TODO: 实现向量嵌入
    // 1. 调用 embedding API
    // 2. 存储到向量数据库
    console.log('[Projection:Vector] 章节向量生成:', { chapter, length: content.length });
  }
}

// ============================================================
// Projection Orchestrator
// ============================================================

export class ProjectionOrchestrator {
  private readonly writers: ProjectionWriters;
  private readonly status: ProjectionStatus;

  constructor() {
    this.writers = {
      state: new StateWriterImpl(),
      index: new IndexWriterImpl(),
      summary: new SummaryWriterImpl(),
      memory: new MemoryWriterImpl(),
      vector: new VectorWriterImpl(),
    };

    this.status = {
      state: 'pending',
      index: 'pending',
      summary: 'pending',
      memory: 'pending',
      vector: 'pending',
    };
  }

  /**
   * 执行所有投影
   */
  async runAll(
    chapterNumber: number,
    context: {
      extraction: ExtractionResult;
      disambiguation: DisambiguationResult;
      metadata: ChapterMetadata;
    }
  ): Promise<ProjectionStatus> {
    console.log('[ProjectionOrchestrator] 开始执行投影:', { chapter: chapterNumber });

    // 重置状态
    this.status.state = 'pending';
    this.status.index = 'pending';
    this.status.summary = 'pending';
    this.status.memory = 'pending';
    this.status.vector = 'pending';

    // 并行执行所有投影
    const results = await Promise.allSettled([
      // State Writer
      this.runWithErrorHandling('state', async () => {
        await this.writers.state.updateChapterStatus(chapterNumber, 'committed');
        await this.writers.state.updateCharacterStates(context.extraction.stateDeltas);
      }),

      // Index Writer
      this.runWithErrorHandling('index', async () => {
        await this.writers.index.updateChapterIndex(chapterNumber, context.metadata);
        await this.writers.index.updateWordCount(
          this.calculateTotalWordCount(chapterNumber, context.metadata.wordCount)
        );
      }),

      // Summary Writer
      this.runWithErrorHandling('summary', async () => {
        await this.writers.summary.updateChapterSummary(
          chapterNumber,
          context.extraction.summaryText
        );
      }),

      // Memory Writer
      this.runWithErrorHandling('memory', async () => {
        const memory = this.buildChapterMemory(chapterNumber, context);
        await this.writers.memory.addChapterMemory(memory);
      }),

      // Vector Writer (可选)
      this.runWithErrorHandling('vector', async () => {
        // 延迟执行，避免阻塞主流程
        await new Promise((resolve) => setTimeout(resolve, 100));
        // await this.writers.vector.embedChapter(chapterNumber, content);
      }),
    ]);

    console.log('[ProjectionOrchestrator] 投影执行完成:', this.status);

    return { ...this.status };
  }

  /**
   * 执行单个投影（带错误处理）
   */
  private async runWithErrorHandling(
    name: keyof ProjectionStatus,
    fn: () => Promise<void>
  ): Promise<void> {
    try {
      await fn();
      this.status[name] = 'done';
    } catch (error) {
      console.error(`[ProjectionOrchestrator] ${name} 投影失败:`, error);
      this.status[name] = 'failed';
    }
  }

  /**
   * 构建章节记忆
   */
  private buildChapterMemory(
    chapterNumber: number,
    context: {
      extraction: ExtractionResult;
      disambiguation: DisambiguationResult;
    }
  ): ChapterMemory {
    const extraction = context.extraction;

    // AI 状态提取（stateDeltas）会漏掉处决/枭首这类情节性死亡——100 章矩阵实测
    // 第 60 章公开斩立决未产出任何状态变更，后续章节禁入名单空转，死人复活重启
    // 审判线。此处用确定性死亡谓词补扫兜底，与 AI 提取按 名字+状态 去重合并。
    const projectStore = useProjectStore();
    const chapterMeta = (projectStore.sortedChapters || []).find(
      (c) => c.orderIndex === chapterNumber - 1
    );
    const roster = (projectStore.characters || [])
      .map((c) => c.name)
      .filter((n): n is string => !!n);
    const idToName = new Map(
      roster.flatMap((name) => {
        const hit = (projectStore.characters || []).find((c) => c.name === name);
        return hit?.id ? [[hit.id, name] as const] : [];
      })
    );
    // AI 提取的死亡 status 同样过「结果完成体」闸：判词/威胁（替死鬼开局、
    // 「给我杀了X」）不是事实——两轮回归实测主角因此被状态摘要误判死亡。
    const entityMapForSanitize = Object.fromEntries(
      (projectStore.characters || [])
        .filter((c) => c.id && c.name)
        .map((c) => [c.id!, { id: c.id!, name: c.name! }])
    );
    const sanitizedDeltaBag = sanitizeUnconfirmedDeathDeltas(
      {
        events: [],
        deltas: extraction.stateDeltas as never[],
        evidence: [],
      } as never,
      entityMapForSanitize as never
    );
    const aiChanges = (sanitizedDeltaBag.deltas as unknown as typeof extraction.stateDeltas).map(
      (d) => ({
        characterName: idToName.get(d.entity_id) || d.entity_id,
        stateType: 'status' as const,
        state: String(d.to ?? d.field ?? '').trim(),
        detail: `${d.field}: ${d.from} → ${d.to}`,
      })
    );
    // 角色状态变化全权来自 AI 提取（sanitized），不再叠加正文规则扫描
    // （2026-09-02 agent 化重构：命运词表塔退役，见 FactExtractor 契约 7-10）
    const characterStateChanges = mergeCharacterStateChanges(aiChanges);

    return {
      chapterId: `chapter-${chapterNumber}`,
      chapterIndex: chapterNumber - 1,
      chapterTitle: chapterMeta?.title || `第${chapterNumber}章`,
      corePlot: extraction.summaryText.slice(0, 200),
      summary: extraction.summaryText,
      keyEvents: extraction.acceptedEvents.map((e) => e.payload.result as string),
      coolPoints: [],
      foreshadows: [],
      newForeshadows: [],
      characterStateChanges,
      locations: [...new Set(extraction.scenes.map((s) => s.location))],
      timelineMark: extraction.scenes[0]?.time || '',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * 计算总字数
   */
  private calculateTotalWordCount(currentChapter: number, currentWordCount: number): number {
    const chapters = useProjectStore().sortedChapters;
    let total = 0;

    for (let i = 0; i < chapters.length; i++) {
      if (i === currentChapter - 1) {
        total += currentWordCount;
      } else {
        total += chapters[i].wordCount || 0;
      }
    }

    return total;
  }

  /**
   * 获取投影状态
   */
  getStatus(): ProjectionStatus {
    return { ...this.status };
  }

  /**
   * 检查是否全部成功
   */
  isAllSuccess(): boolean {
    return (
      this.status.state === 'done' &&
      this.status.index === 'done' &&
      this.status.summary === 'done' &&
      this.status.memory === 'done'
    );
  }
}

// ============================================================
// Composable 导出
// ============================================================

let orchestratorInstance: ProjectionOrchestrator | null = null;

export function useProjectionOrchestrator(): ProjectionOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new ProjectionOrchestrator();
  }
  return orchestratorInstance;
}

export default ProjectionOrchestrator;

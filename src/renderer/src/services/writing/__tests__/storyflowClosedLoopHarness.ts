/**
 * Storyflow 闭环 harness：开题中心大纲生成 → 应用大纲 → 批量续写
 *
 * 与真实环境完全对齐（真实 AI 请求）：
 * 1. 大纲生成：UnifiedOutlineGenerator.generateDirections → expandDirection
 *    （与开题中心 TopicDiscoveryBoard 的 prompt 玩法同路径，真实 fetch AI）
 * 2. 应用大纲：mapExecutableOutlineToGeneratedOutline → useProjectCreator.createProject
 *    （真实执行 buildPlotOutline/buildCharacters/buildVolumes 等全部纯函数）
 * 3. 建章：由 createProject 内联执行 useChapterOutlineGenerator.createChapters（含结构化节点落库）
 * 4. 批量续写：runContinueWriteChapters（mode:'batch' = BATCH_CONTINUE_PRESET，
 *    与 useBatchWriter / 批量 UI 同路径，指数退避重试 + 门禁）
 * 5. MOLIU_RESUME_STORYFLOW=1：项目库与 StoryRuntime 落在 temp/storyflow-checkpoints/，
 *    墙钟杀进程后从第一篇空章接上。这是同一次生成的续跑，不调用 storyflow-repair-empty。
 *
 * 测试环境桩（仅替换环境副作用，业务代码全部真实）：
 * - window.electronAPI：文件实现（模拟主进程 moliu-projects.json，并执行冷读取）
 * - vue-router：由测试文件 vi.mock（useProjectCreator 依赖 useRouter）
 *
 * 覆盖范围：续写阶段固定 forceStoryRuntime=true → LongFormWritingEngine 正式长篇路径
 * （生产唯一执行路径；无 storyRuntime 时管道显式失败，不存在其他分支）。
 */

import { createPinia, getActivePinia, setActivePinia } from 'pinia';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';

import { UnifiedOutlineGenerator } from '@/services/outline/generators/unified-generator';
import {
  mapExecutableOutlineToGeneratedOutline,
  detectDuplicateChapterCbn,
} from '@/services/outline/adapters/executable-outline-adapter';
import { inspectOutlineCompleteness } from '@/services/outline/validation/outlineCompleteness';
import { volumeAssignmentSourceFromProject, volumeIdForChapter } from '@/services/outline/volumeAssignment';
import {
  rollOutlineForward,
  type RollCaller,
} from '@/services/outline/rolling/outline-roller';
import { blueprintToChapterUpdate } from '@/services/outline/rolling/chapter-blueprint-regenerator';
import type { ChapterBlueprint } from '@/services/outline/types/executable-outline';
import type { ExecutableOutline } from '@/services/outline/types/executable-outline';
import type { OutlineDirection } from '@/services/outline/types/direction';
import type { GeneratedOutline } from '@/types/inspiration';
import type { PlotNode, Project } from '@/types/project';
import type { WriterRunSummary } from '@/types/story-runtime';
import type { ProviderType } from '@/config/ai-providers';
import { useProjectCreator } from '@/composables/useProjectCreator';
import { useSettingsStore } from '@/stores/settings.store';
import { useProjectStore } from '@/stores/project.store';
import {
  resolveContinueWriteRealConfig,
  type ResolvedRealAiConfig,
} from './continueWriteRealConfig';

import {
  runContinueWriteChapters,
  type ContinueWriteChapterRunResult,
  type HarnessRuntimeBackend,
  type StoryRuntimeVerification,
} from './continueWriteHarness';
import { createRealStructuredAI, isRealAiEnabled } from './realStructuredAI';

/** 真实 Storyflow 冒烟默认连续续写章数；环境变量仍可用于快速回归缩短批次。 */
export const DEFAULT_STORYFLOW_CHAPTER_COUNT = 80;

export interface StoryflowClosedLoopOptions {
  /** 开题提示（默认：一个可写 30 万字长篇的起点） */
  prompt?: string;
  wordCountRange?: string;
  /** 批量续写章数（默认 80，覆盖更长连续正文以检验跨章合同去重/状态衔接） */
  chapterCount?: number;
  /** 每章目标字数（真实 AI 冒烟建议 1500-2500） */
  targetWordCount?: number;
  runIdPrefix?: string;
}

export interface StoryflowClosedLoopResult {
  cfg: ResolvedRealAiConfig;
  /** 复用 MOLIU_OUTLINE_CACHE 缓存大纲时不会跑方向生成，此处为 null */
  direction: OutlineDirection | null;
  executableOutline: ExecutableOutline;
  generatedOutline: GeneratedOutline;
  project: Project;
  chapterRunResults: ContinueWriteChapterRunResult[];
  runtimeBackend: HarnessRuntimeBackend;
  runtimeVerification: StoryRuntimeVerification;
  projectStorageVerification: ProjectStorageVerification;
  /** 批量续写结束后的冷读取复核：大纲阶段的关键数据不得被写作链路覆盖 */
  postWritePersistence: PostWritePersistenceVerification;
  /** 建章后、续写前的章节 ID（大纲应用产物） */
  createdChapterIds: string[];
  /**
   * 大纲阶段 warnings（expandDirection 原样透传）：reviewer 回退/补全失败等软质量信号，
   * 不代表失败，但冒烟报告必须可见——否则网关抖动被静默吞掉（实测 524 跳过 review
   * 在 summary 里隐形，只能翻 trace 才能发现）。
   */
  outlineWarnings: string[];
  /** 分阶段耗时（ms）：定位慢环节用（大纲生成/滚动续纲/应用/批量续写各占多久） */
  phaseTimings: {
    outlineDirectionsMs: number;
    outlineExpandMs: number;
    outlineRollMs: number;
    applyOutlineMs: number;
    continueWriteMs: number;
    totalMs: number;
  };
  /** 滚动续纲报告（仅当长跑超出启动包细纲时存在）：真滚/占位占比与警告 */
  outlineRoll?: StoryflowOutlineRollReport;
}

export interface ProjectStorageVerification {
  chapterCount: number;
  plotChapterCount: number;
  linkedPlotChapterCount: number;
  structuredPlotChapterCount: number;
  characterCount: number;
  foreshadowCount: number;
  volumeCount: number;
  chapterOutlineTextCount: number;
  coldReloadVerified: boolean;
  criticalDataHash: string;
  completeCharacterProfileCount: number;
  positioningPersisted: boolean;
}

export interface PostWritePersistenceVerification {
  characterCount: number;
  foreshadowCount: number;
  volumeCount: number;
  plotChapterCount: number;
  writtenChapterCount: number;
}

/**
 * 并发矩阵冒烟（smoke:storyflow:real:multi）的产物路径隔离：设 MOLIU_RUN_SUFFIX 后
 * summary/outline/prose 及 trace/project-store 文件名均带后缀，多轮并发互不覆盖，
 * 跑前清理也只清自己的后缀。单跑不设此变量，路径与既有固定名完全一致。
 * 命名约定镜像 scripts/storyflow-run-suffix.mjs（TS 无法直接 import scripts 的 .mjs，
 * 两边必须同步改）。
 */
export function resolveStoryflowRunSuffix(): string {
  return (process.env.MOLIU_RUN_SUFFIX || '').trim().replace(/[^a-zA-Z0-9_-]/gu, '');
}

export interface StoryflowArtifactPaths {
  summaryPath: string;
  outlinePath: string;
  proseDir: string;
  resumeOutlinePath: string;
  /** 续写项目库。放在检查点目录内，冒烟跑前按 storyflow- 前缀清 temp 顶层时不会被删。 */
  resumeStorePath: string;
  /** 续写 StoryRuntime 目录，与项目库同一检查点，进程被杀后仍可打开。 */
  resumeRuntimePath: string;
}

export function resolveStoryflowArtifactPaths(): StoryflowArtifactPaths {
  const suffix = resolveStoryflowRunSuffix();
  const tempDir = join(process.cwd(), 'temp');
  const names = suffix
    ? {
        summary: `storyflow.closed-loop.${suffix}.summary.json`,
        outline: `storyflow.closed-loop.${suffix}.outline.json`,
        proseDir: `storyflow.closed-loop.${suffix}.prose`,
      }
    : {
        summary: 'storyflow.closed-loop.summary.json',
        outline: 'storyflow.closed-loop.outline.json',
        proseDir: 'storyflow.closed-loop.prose',
      };
  return {
    summaryPath: join(tempDir, names.summary),
    outlinePath: join(tempDir, names.outline),
    proseDir: join(tempDir, names.proseDir),
    resumeOutlinePath: join(
      tempDir,
      'storyflow-checkpoints',
      `${suffix || 'default'}.outline.json`
    ),
    resumeStorePath: join(
      tempDir,
      'storyflow-checkpoints',
      `${suffix || 'default'}.project-store.json`
    ),
    resumeRuntimePath: join(
      tempDir,
      'storyflow-checkpoints',
      `${suffix || 'default'}.story-runtime`
    ),
  };
}

/**
 * 第一篇尚未落正文的章节号（1-based）。
 * 只看 content trim 后是否为空，不判断正文写得好不好。
 * 章节按 orderIndex 排序；全部已有正文时返回「章数 + 1」。
 */
export function firstUnwrittenChapterNumber(
  chapters: ReadonlyArray<{ orderIndex: number; content?: string | null }>,
): number {
  const ordered = [...chapters].sort((left, right) => left.orderIndex - right.orderIndex);
  for (const chapter of ordered) {
    if ((chapter.content ?? '').trim().length === 0) {
      return chapter.orderIndex + 1;
    }
  }
  return ordered.length + 1;
}

/**
 * 项目库里是否已经有至少一章正文。空章节不算，避免半成品建章被当成可续写的书。
 */
export function storyflowStoreHasWrittenProse(
  projects: ReadonlyArray<{
    chapters?: ReadonlyArray<{ orderIndex: number; content?: string | null }>;
  }>,
): boolean {
  return projects.some(project => firstUnwrittenChapterNumber(project.chapters ?? []) > 1);
}

/**
 * 续写开关打开且库内已有正文时才保留项目库；否则清空，让新开书走原来的建章路径。
 */
export function shouldKeepStoryflowStore(
  resumeRequested: boolean,
  projects: ReadonlyArray<{
    chapters?: ReadonlyArray<{ orderIndex: number; content?: string | null }>;
  }>,
): boolean {
  return resumeRequested && storyflowStoreHasWrittenProse(projects);
}

/**
 * 从 fromChapter 写到 requestedTotal（含）还要写几章。结果 ≤0 表示请求范围内已经没有空章。
 */
export function storyflowChaptersRemaining(requestedTotal: number, fromChapter: number): number {
  return requestedTotal - fromChapter + 1;
}

/**
 * 解析 MOLIU_OUTLINE_CACHE。
 * 支持裸 ExecutableOutline，或检查点包 `{version,prompt,…,outline}`。
 * 旧 GeneratedOutline（title/volumes/chapters、无 storyEngine）必须拒绝：
 * 适配器会读 `storyEngine.coreConflict`，形状不对会直接 TypeError。
 */
export function parseExecutableOutlineCache(raw: unknown, sourcePath: string): ExecutableOutline {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`MOLIU_OUTLINE_CACHE 不是 JSON 对象：${sourcePath}`);
  }
  const record = raw as Record<string, unknown>;
  const nested = record.outline;
  const candidate = (
    nested && typeof nested === 'object' && !Array.isArray(nested) ? nested : record
  ) as ExecutableOutline;
  if (!candidate.storyEngine || !Array.isArray(candidate.volumePlan) || !candidate.startupPack30) {
    const keys = Object.keys(record).slice(0, 12).join(',');
    throw new Error(
      `MOLIU_OUTLINE_CACHE 必须是裸 ExecutableOutline（含 storyEngine/volumePlan/startupPack30），` +
        `或检查点包 {version,prompt,outline}。当前文件不是可执行大纲（keys=${keys}）：${sourcePath}`
    );
  }
  const completeness = inspectOutlineCompleteness(candidate);
  if (!completeness.canApply) {
    const reasons = completeness.blockers
      .slice(0, 3)
      .map(blocker => blocker.message)
      .join('；');
    throw new Error(`MOLIU_OUTLINE_CACHE 未通过完整性门禁，拒绝复用：${reasons}（${sourcePath}）`);
  }
  return candidate;
}

/** 改稿 agent 回合落盘字段（初稿即通过为 null；供 A/B 脚本按 writer 维度统计） */
export interface StoryflowWriterSummary {
  finishReason: WriterRunSummary['finishReason'];
  checksUsed: number;
  revertedUnchecked: boolean;
  rounds: number;
  toolCalls: number;
  byTool: Record<string, number>;
  ms: number;
}

/**
 * 从 LongForm 结果抽出 writer 摘要。初稿即过 / 未注入 writerAgent 时返回 null。
 * 终态 summary 与中途 checkpoint 必须走同一函数，避免测试落盘把 writer 字段覆盖掉。
 */
export function summarizeWriterRun(
  result: { writer?: WriterRunSummary } | undefined | null,
): StoryflowWriterSummary | null {
  const writer = result?.writer;
  if (!writer) return null;
  return {
    finishReason: writer.finishReason,
    checksUsed: writer.checksUsed,
    revertedUnchecked: writer.revertedUnchecked,
    rounds: writer.rounds,
    toolCalls: writer.toolCalls,
    byTool: writer.byTool,
    ms: writer.ms,
  };
}

function cloneProject(project: Project): Project {
  return JSON.parse(JSON.stringify(project)) as Project;
}

interface FileProjectStorage {
  get(id: string): Project | undefined;
  coldReload(id: string): Project | undefined;
  save(project: Project): void;
  list(): Project[];
}

/**
 * 文件版 electronAPI：每次读写都经过 JSON 序列化，支持销毁 renderer 状态后的冷读取。
 * preserveExisting 只在库内已有正文时跳过清空；普通冒烟仍用带时间戳的新文件并清空。
 */
function installFileElectronAPI(
  runId: string,
  options?: { preserveExisting?: boolean; storePath?: string },
): FileProjectStorage {
  const tempDir = join(process.cwd(), 'temp');
  mkdirSync(tempDir, { recursive: true });
  const storePath = options?.storePath ?? join(tempDir, `${runId}.project-store.json`);
  mkdirSync(dirname(storePath), { recursive: true });
  const readProjects = (): Project[] => {
    if (!existsSync(storePath)) return [];
    const payload = JSON.parse(readFileSync(storePath, 'utf8')) as { projects?: Project[] };
    return payload.projects ?? [];
  };
  const writeProjects = (projects: Project[]): void => {
    writeFileSync(storePath, JSON.stringify({ projects }, null, 2), 'utf8');
  };
  const keepStore = shouldKeepStoryflowStore(options?.preserveExisting === true, readProjects());
  if (!keepStore) {
    writeProjects([]);
  }
  // 记忆文件存储：projectId -> (filePath -> content)，支持 save/load/list/delete 往返。
  // 续写时落到项目库旁的侧车：进程内 Map 会随墙钟一起消失，下一轮必须还能读到。
  // 只有沿用已有正文时才读侧车；空库重开时不能把上一本书的记忆灌进新项目。
  const memorySidecarPath = `${storePath}.memory.json`;
  const persistMemory = options?.preserveExisting === true;
  const memoryStore = new Map<string, Map<string, string>>();
  if (persistMemory && keepStore && existsSync(memorySidecarPath)) {
    try {
      const raw = JSON.parse(readFileSync(memorySidecarPath, 'utf8')) as Record<
        string,
        Record<string, string>
      >;
      for (const [projectId, files] of Object.entries(raw)) {
        if (!files || typeof files !== 'object') continue;
        memoryStore.set(projectId, new Map(Object.entries(files)));
      }
    } catch {
      // 侧车损坏不阻断续写；章节记忆仍在项目 JSON 上。
    }
  }
  const flushMemory = (): void => {
    if (!persistMemory) return;
    const payload: Record<string, Record<string, string>> = {};
    for (const [projectId, files] of memoryStore) {
      payload[projectId] = Object.fromEntries(files);
    }
    writeFileSync(memorySidecarPath, JSON.stringify(payload), 'utf8');
  };
  const api = {
    listProjects: async (): Promise<Project[]> => readProjects().map(cloneProject),
    getProject: async (id: string): Promise<Project | null> => {
      const project = readProjects().find(item => item.id === id);
      return project ? cloneProject(project) : null;
    },
    createProject: async (data: Project): Promise<Project> => {
      const snapshot = cloneProject(data);
      writeProjects([...readProjects().filter(item => item.id !== data.id), snapshot]);
      return cloneProject(snapshot);
    },
    updateProject: async (id: string, updates: Partial<Project>): Promise<Project | null> => {
      const projects = readProjects();
      const current = projects.find(item => item.id === id);
      if (!current) return null;
      const merged: Project = {
        ...current,
        ...updates,
        metadata: { ...(current.metadata ?? {}), ...(updates.metadata ?? {}) },
      };
      const snapshot = cloneProject(merged);
      writeProjects(projects.map(item => (item.id === id ? snapshot : item)));
      return cloneProject(snapshot);
    },
    saveProject: async (project: Project): Promise<void> => {
      const projects = readProjects();
      const snapshot = cloneProject(project);
      writeProjects([...projects.filter(item => item.id !== project.id), snapshot]);
    },
    deleteProject: async (id: string): Promise<void> => {
      writeProjects(readProjects().filter(item => item.id !== id));
    },
    // 记忆文件 IPC（签名对齐 src/preload.ts:40-43 的真实 preload）
    saveMemoryFile: async (data: {
      projectId: string;
      filePath: string;
      content: string;
    }): Promise<{ success: boolean; error?: string }> => {
      let proj = memoryStore.get(data.projectId);
      if (!proj) {
        proj = new Map<string, string>();
        memoryStore.set(data.projectId, proj);
      }
      proj.set(data.filePath, data.content);
      flushMemory();
      return { success: true };
    },
    loadMemoryFile: async (data: { projectId: string; filePath: string }): Promise<string | null> =>
      memoryStore.get(data.projectId)?.get(data.filePath) ?? null,
    listMemoryFiles: async (data: { projectId: string; basePath: string }): Promise<string[]> => {
      const proj = memoryStore.get(data.projectId);
      if (!proj) return [];
      const prefix = data.basePath.endsWith('/') ? data.basePath : data.basePath + '/';
      return Array.from(proj.keys()).filter(
        f => f.startsWith(prefix) || f.startsWith(data.basePath)
      );
    },
    deleteMemoryFile: async (data: {
      projectId: string;
      filePath: string;
    }): Promise<{ success: boolean; error?: string }> => {
      memoryStore.get(data.projectId)?.delete(data.filePath);
      flushMemory();
      return { success: true };
    },
  };
  (window as unknown as { electronAPI: unknown }).electronAPI = api;
  return {
    get: id => readProjects().find(item => item.id === id),
    // 新一轮 readFileSync + JSON.parse，不复用任何对象或 Map，模拟应用冷启动。
    coldReload: id => readProjects().find(item => item.id === id),
    save: project => {
      const projects = readProjects();
      const snapshot = cloneProject(project);
      writeProjects([...projects.filter(item => item.id !== project.id), snapshot]);
    },
    list: () => readProjects().map(cloneProject),
  };
}

/**
 * 启动包只保证首批结构化章纲；长跑冒烟可能要求写得更远。
 * 真实对齐：优先走生产同款滚动续纲（rollOutlineForward + UnifiedOutlineGenerator），
 * 补不出的章（模型失败/网关抖动）才落最小占位槽兜底——占位不伪造 CBN/CPNs/mustCover，
 * 避免把测试占位描述误当成质量合同。冒烟报告通过 outlineRoll 记录两条路径的占比。
 */
export async function ensureStoryflowWritingCapacity(
  project: Project,
  minCount: number,
  rollOptions?: {
    callStructuredText: RollCaller;
    signal?: AbortSignal;
    onProgress?: (message: string) => void;
  }
): Promise<Project & { outlineRoll?: StoryflowOutlineRollReport }> {
  const needed = Math.max(1, Math.floor(minCount));
  let expanded = cloneProject(project);
  const rollReport: StoryflowOutlineRollReport = {
    requestedChapters: needed,
    rolledFromChapter: 0,
    rolledToChapter: 0,
    rolledCount: 0,
    placeholderCount: 0,
    warnings: [],
  };

  if (rollOptions) {
    const beforeNodes = expanded.plotOutline.filter(node => node.type === 'chapter').length;
    const beforeWritten = (expanded.chapters ?? []).filter(
      chapter => (chapter.content ?? '').trim().length > 0
    ).length;
    const rollFrom = Math.max(beforeNodes, beforeWritten) + 1;
    if (rollFrom <= needed) {
      // 循环滚动直到补满目标章数：rollOutlineForward 单次只滚一批（OUTLINE_ROLL_BATCH_CHAPTERS，
      // 默认 50 章），长跑请求远超一批时旧逻辑只滚一批就停，剩余章节全部落占位槽——
      // 500 章实测 101-500 章无章纲约束，跨章连贯性崩坏。逐批循环、每批 persist 后
      // 用最新项目状态计算下一批起点；单批失败（appendedCount=0）立即止损，
      // 余下章节走占位兜底，不让网关抖动卡死整个冒烟。
      let nextFrom = rollFrom;
      let lastFromChapter = 0;
      let lastToChapter = 0;
      while (nextFrom <= needed) {
        const result = await rollOutlineForward({
          project: expanded,
          callStructuredText: rollOptions.callStructuredText,
          signal: rollOptions.signal,
          onProgress: rollOptions.onProgress,
          maxChapters: needed,
          persist: (nodes, plannedChapterCount) => {
            expanded.plotOutline.push(...nodes);
            syncRolledBlueprintsToChapters(expanded, nodes);
            expanded.metadata = {
              ...expanded.metadata,
              plannedChapterCount: Math.max(expanded.metadata?.plannedChapterCount ?? 0, plannedChapterCount),
            };
          },
        });
        rollReport.warnings.push(...result.warnings);
        lastFromChapter = lastFromChapter === 0 ? result.fromChapter : lastFromChapter;
        lastToChapter = Math.max(lastToChapter, result.toChapter);
        if (result.appendedCount > 0) {
          rollReport.rolledCount += result.appendedCount;
        }
        if (rollOptions.signal?.aborted) break;
        if (result.appendedCount === 0) {
          if (result.skippedReason) {
            // 计划章数上限被 plannedChapterCount 压住：抬到请求章数后重试一次，
            // 仍不动说明是其它原因（返回 0 且无 skippedReason 时下面统一止损）
            if (
              expanded.metadata?.plannedChapterCount &&
              expanded.metadata.plannedChapterCount < needed
            ) {
              expanded.metadata = {
                ...expanded.metadata,
                plannedChapterCount: needed,
              };
              continue;
            }
          }
          rollReport.warnings.push(
            `滚动续纲第 ${nextFrom} 章起连续失败，剩余 ${needed - nextFrom + 1} 章走占位兜底`
          );
          break;
        }
        nextFrom = result.toChapter + 1;
      }
      rollReport.rolledFromChapter = lastFromChapter;
      rollReport.rolledToChapter = lastToChapter;
      // 占位兜底只补滚动没补到的章
      expanded = ensurePlaceholderCapacity(expanded, needed, rollReport);
      return Object.assign(expanded, { outlineRoll: rollReport });
    }
    rollReport.warnings.push(
      `滚动续纲未触发：细纲槽 ${beforeNodes} 已满足目标 ${needed} 章`,
    );
    return Object.assign(expanded, { outlineRoll: rollReport });
  }

  // 未提供真实 AI 调用器（非真实冒烟路径）：全部占位兜底
  expanded = ensurePlaceholderCapacity(expanded, needed, rollReport);
  return Object.assign(expanded, { outlineRoll: rollReport });
}

/**
 * 滚纲产出的真蓝图同步回章节表 outline/plotSummary（数据双源统一的滚纲侧闭环）。
 * 章节表字段在批量续写链路里是「初版快照+占位槽」——reg20 实证初版适配层的
 * 块内同款 CBN 污染 18-50 章 outline，而滚纲只更新 plotOutline 节点、章节表
 * 永远停留在脏快照，书审导出/合同兜底读到的全是旧文本。只覆盖节点带 CBN 的
 * 真蓝图（占位节点无 CBN 不动章节表）；折算格式与 blueprintToChapterUpdate 一致。
 */
function syncRolledBlueprintsToChapters(project: Project, nodes: PlotNode[]): number {
  const byOrder = new Map((project.chapters ?? []).map(chapter => [chapter.orderIndex, chapter]));
  let synced = 0;
  for (const node of nodes) {
    if (node.type !== 'chapter' || !node.CBN?.trim()) continue;
    const chapter = byOrder.get(node.orderIndex);
    if (!chapter) continue;
    const blueprint: ChapterBlueprint = {
      orderIndex: node.orderIndex + 1,
      title: node.title,
      summary: node.description ?? node.title,
      CBN: node.CBN,
      CPNs: node.CPNs ?? [],
      CEN: node.CEN ?? '',
      mustCover: node.mustCover ?? [],
      forbiddenZones: [],
      hookText: '',
      hookType: '',
    };
    const update = blueprintToChapterUpdate(blueprint);
    chapter.outline = update.outline;
    chapter.plotSummary = update.plotSummary;
    synced += 1;
  }
  return synced;
}

function ensurePlaceholderCapacity(
  project: Project,
  needed: number,
  rollReport: StoryflowOutlineRollReport
): Project {
  const expanded = cloneProject(project);
  const now = new Date().toISOString();
  const chapters = [...(expanded.chapters ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const chapterNodes = (expanded.plotOutline ?? [])
    .filter(node => node.type === 'chapter')
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const sortedVolumes = [...(expanded.volumes ?? [])]
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const lastVolume = sortedVolumes.at(-1);
  const assignmentSource = volumeAssignmentSourceFromProject(expanded);

  for (let index = chapters.length; index < needed; index += 1) {
    const chapterNumber = index + 1;
    const title = `第${chapterNumber}章`;
    const description = `滚动续写槽位：承接第${chapterNumber - 1}章既有状态，由续写引擎根据当前合同推进主线。`;
    // 卷区间存在时按章号挂对应卷；区间外/无区间回退最后一卷（与生产口径一致）
    chapters.push({
      id: `chapter-storyflow-${expanded.id}-${chapterNumber}`,
      volumeId: volumeIdForChapter(chapterNumber, assignmentSource) ?? lastVolume?.id,
      title,
      content: '',
      wordCount: 0,
      orderIndex: index,
      version: 1,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      plotSummary: description,
      outline: description,
      isGenerated: false,
      writeStatus: 'pending',
    });
  }

  const existingNodeIndexes = new Set(chapterNodes.map(node => node.orderIndex));
  for (let index = 0; index < needed; index += 1) {
    if (existingNodeIndexes.has(index)) continue;
    const chapter = chapters[index];
    const chapterNumber = index + 1;
    rollReport.placeholderCount += 1;
    expanded.plotOutline.push({
      id: `plot-storyflow-${expanded.id}-${chapterNumber}`,
      title: chapter?.title || `第${chapterNumber}章`,
      description: `滚动续写槽位：承接第${chapterNumber - 1}章既有状态，由续写引擎根据当前合同推进主线。`,
      type: 'chapter',
      orderIndex: index,
      chapterId: chapter?.id,
    });
  }

  expanded.chapters = chapters;
  expanded.metadata = {
    ...(expanded.metadata ?? {}),
    plannedChapterCount: Math.max(expanded.metadata?.plannedChapterCount ?? 0, needed),
  };
  return expanded;
}

/** 滚动续纲在冒烟报告中的落点：真滚了多少章、占位兜底多少章、警告透传 */
export interface StoryflowOutlineRollReport {
  requestedChapters: number;
  rolledFromChapter: number;
  rolledToChapter: number;
  rolledCount: number;
  placeholderCount: number;
  warnings: string[];
}

/**
 * mid 模式容量：只建空章（无大纲节点），大纲槽由写作中途的 onRunwayLow 滚动补齐。
 * 章节实体必须预建——harness 的 runChapter 按 orderIndex 定位章节，不预建会「缺少第 N 章」。
 */
export async function ensureStoryflowChapterCapacity(
  project: Project,
  minCount: number
): Promise<Project> {
  const expanded = cloneProject(project);
  const now = new Date().toISOString();
  const chapters = [...(expanded.chapters ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const lastVolume = [...(expanded.volumes ?? [])]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .at(-1);
  const assignmentSource = volumeAssignmentSourceFromProject(expanded);
  for (let index = chapters.length; index < minCount; index += 1) {
    const chapterNumber = index + 1;
    chapters.push({
      id: `chapter-storyflow-${expanded.id}-${chapterNumber}`,
      // 卷区间存在时按章号挂对应卷；区间外/无区间回退最后一卷（与生产口径一致）
      volumeId: volumeIdForChapter(chapterNumber, assignmentSource) ?? lastVolume?.id,
      title: `第${chapterNumber}章`,
      content: '',
      wordCount: 0,
      orderIndex: index,
      version: 1,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      isGenerated: false,
      writeStatus: 'pending',
    });
  }
  expanded.chapters = chapters;
  expanded.metadata = {
    ...(expanded.metadata ?? {}),
    plannedChapterCount: Math.max(expanded.metadata?.plannedChapterCount ?? 0, minCount),
  };
  return expanded;
}

function buildCriticalProjectHash(project: Project): string {
  const chapterNodes = project.plotOutline
    .filter(node => node.type === 'chapter')
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const critical = {
    id: project.id,
    genre: project.genre,
    metadata: project.metadata,
    volumes: project.volumes,
    characters: project.characters,
    foreshadows: project.foreshadows,
    chapters: project.chapters.map(chapter => ({ id: chapter.id, orderIndex: chapter.orderIndex })),
    chapterNodes,
  };
  return createHash('sha256').update(JSON.stringify(critical)).digest('hex');
}

/** 冷读项目库，确认关键字段在序列化往返后不变。 */
function verifyPersistedProject(
  storage: FileProjectStorage,
  projectId: string,
): ProjectStorageVerification {
  const persistedProject = storage.get(projectId);
  if (!persistedProject) {
    throw new Error('storyflow 闭环失败：建章后项目未写入主进程存储');
  }
  const persistedChapterNodes = persistedProject.plotOutline.filter(node => node.type === 'chapter');
  const firstHash = buildCriticalProjectHash(persistedProject);
  const coldReloadedProject = storage.coldReload(projectId);
  if (!coldReloadedProject) {
    throw new Error('storyflow 闭环失败：冷启动后无法重新读取项目');
  }
  const coldHash = buildCriticalProjectHash(coldReloadedProject);
  if (firstHash !== coldHash) {
    throw new Error(
      `storyflow 闭环失败：冷启动前后关键数据哈希不一致（${firstHash} != ${coldHash}）`,
    );
  }
  return {
    chapterCount: persistedProject.chapters.length,
    plotChapterCount: persistedChapterNodes.length,
    linkedPlotChapterCount: persistedChapterNodes.filter(node => Boolean(node.chapterId)).length,
    structuredPlotChapterCount: persistedChapterNodes.filter(node =>
      Boolean(node.CBN && node.CPNs?.length && node.CEN && node.mustCover?.length),
    ).length,
    characterCount: persistedProject.characters.length,
    foreshadowCount: persistedProject.foreshadows.length,
    volumeCount: persistedProject.volumes.length,
    // 章纲正文（结构化节点块之外的描述文本）：建章时只读 chapter.outline 而大纲链路
    // 用的是 chapter.summary，会让每章只剩 CBN/CPNs/CEN，续写合同拿不到章纲描述。
    chapterOutlineTextCount: persistedProject.chapters.filter(
      chapter => (chapter.outline ?? '').split('--- 结构化节点 ---')[0].trim().length > 0,
    ).length,
    coldReloadVerified: true,
    criticalDataHash: coldHash,
    completeCharacterProfileCount: persistedProject.characters.filter(character =>
      Boolean(
        character.profile &&
          Array.isArray(character.profile.personality) &&
          Array.isArray(character.profile.relationships),
      ),
    ).length,
    positioningPersisted: Boolean(persistedProject.metadata?.outlinePositioning),
  };
}

/** 注入真实 AI 配置到 settingsStore（UnifiedOutlineGenerator.getAIConfig 依赖它） */
export function injectSettingsStore(cfg: ResolvedRealAiConfig): void {
  // 复用当前 active Pinia（每章 hydrate 后已 setActivePinia）；
  // 仅在完全没有 active Pinia 时（如开题中心首次调用）才新建。
  // 此前无条件 createPinia() 会把 hydrate 刚设好的 chapters store 冲掉，
  // 导致 createChapterPersistenceClient 捕获空 store → syncProjectFromStore 清空 chapters →
  // 第 2 章「缺少第 2 章」（chapters 闭包变量被同步成空数组）。
  if (!getActivePinia()) {
    setActivePinia(createPinia());
  }
  const settings = useSettingsStore();
  settings.aiProviders = [
    {
      id: cfg.providerId ?? 'storyflow-provider',
      name: 'storyflow-real-ai',
      provider: cfg.provider as ProviderType,
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl,
      modelName: cfg.model ?? '',
      enabled: true,
      // 冒烟也支持厂商级输出上限（MOLIU_AI_MAX_TOKENS）：推理型模型撞默认输出上限时按需下发
      generationConfig: cfg.maxTokens
        ? {
            temperature: 0.7,
            topP: 0.9,
            frequencyPenalty: 0,
            presencePenalty: 0,
            maxTokens: cfg.maxTokens,
          }
        : undefined,
    },
  ];
  settings.defaultModel = {
    providerId: cfg.providerId ?? 'storyflow-provider',
    modelName: cfg.model ?? '',
  };
}

/**
 * 闭环：大纲生成 → 应用 → 建章 → 批量续写（全部真实代码 + 真实 AI）
 */
export async function runStoryflowClosedLoop(
  options: StoryflowClosedLoopOptions = {}
): Promise<StoryflowClosedLoopResult> {
  const prompt =
    options.prompt ?? '一个现代社畜穿越到古代朝堂，凭借现代知识在官场步步高升，卷入皇权之争';
  const wordCountRange = options.wordCountRange ?? '30万-60万';
  const chapterCount = options.chapterCount ?? DEFAULT_STORYFLOW_CHAPTER_COUNT;
  const targetWordCount = options.targetWordCount ?? 2000;
  // 并发矩阵时带后缀（storyflow-<suffix>），project-store 与 trace 文件名随之隔离
  const suffix = resolveStoryflowRunSuffix();
  const runIdPrefix = options.runIdPrefix ?? (suffix ? `storyflow-${suffix}` : 'storyflow');

  // ---------- 0. 配置与测试环境桩 ----------
  const cfg = resolveContinueWriteRealConfig();
  injectSettingsStore(cfg);
  const artifactPaths = resolveStoryflowArtifactPaths();
  const resumeRequested = /^(?:1|true|yes)$/iu.test(
    process.env.MOLIU_RESUME_STORYFLOW?.trim() ?? ''
  );
  // 续写用稳定检查点库：冒烟脚本按 storyflow- 前缀清 temp 顶层，检查点目录在白名单里。
  // 未开续写仍用时间戳文件并清空，避免测试互相踩到上一轮正文。
  const projectStorage = installFileElectronAPI(
    resumeRequested ? `${runIdPrefix}-resume` : `${runIdPrefix}-${Date.now()}`,
    {
      preserveExisting: resumeRequested,
      storePath: resumeRequested ? artifactPaths.resumeStorePath : undefined,
    },
  );

  // ---------- 1. 开题中心大纲生成（真实 AI fetch，与 TopicDiscoveryBoard prompt 玩法同路径） ----------
  // 传 trace.runId 让大纲阶段的 prompt/响应落盘 temp/ai-traces/，便于人工评估单章蓝图产出质量。
  // MOLIU_OUTLINE_CACHE：调试续写阶段时复用上一轮 ExecutableOutline，跳过 30-40 分钟的
  // 大纲生成。默认不开启，完整冒烟仍然全程真实生成。
  const outlineCachePath = process.env.MOLIU_OUTLINE_CACHE?.trim();
  let direction: OutlineDirection | null = null;
  const outlineWarnings: string[] = [];
  const phaseTimings = {
    outlineDirectionsMs: 0,
    outlineExpandMs: 0,
    outlineRollMs: 0,
    applyOutlineMs: 0,
    continueWriteMs: 0,
    totalMs: 0,
  };
  const generateExecutableOutline = async (): Promise<ExecutableOutline> => {
    const generator = new UnifiedOutlineGenerator();
    const outlineTraceRunId = `${runIdPrefix}-outline-${Date.now()}`;
    const directionsStartedAt = Date.now();
    const dirResult = await generator.generateDirections(prompt, {
      wordCountRange,
      trace: { runId: outlineTraceRunId, model: cfg.model, provider: cfg.provider },
    });
    phaseTimings.outlineDirectionsMs += Date.now() - directionsStartedAt;
    if (!dirResult.directions || dirResult.directions.length === 0) {
      throw new Error(
        `storyflow 闭环失败：大纲方向生成为空（generateDirections 未返回任何方向，${dirResult.warnings?.[0] ?? ''}）`
      );
    }
    direction = [...dirResult.directions].sort(
      (a, b) => b.recommendationScore - a.recommendationScore
    )[0];

    const expandStartedAt = Date.now();
    const expandedResult = await generator.expandDirection(prompt, direction, {
      wordCountRange,
      trace: { runId: outlineTraceRunId, model: cfg.model, provider: cfg.provider },
    });
    phaseTimings.outlineExpandMs += Date.now() - expandStartedAt;
    const expanded = expandedResult.outline;
    outlineWarnings.push(...(expandedResult.warnings ?? []));
    if (!expanded) {
      const failureDetails = expandedResult.blockers?.length
        ? expandedResult.blockers.join('；')
        : expandedResult.warnings?.join('；') || '未提供失败详情';
      throw new Error(
        `storyflow 闭环失败：大纲展开为空（expandDirection 返回 null，${failureDetails}）`
      );
    }
    if (outlineCachePath) {
      mkdirSync(join(outlineCachePath, '..'), { recursive: true });
      writeFileSync(outlineCachePath, JSON.stringify(expanded, null, 2), 'utf-8');
    }
    mkdirSync(join(artifactPaths.resumeOutlinePath, '..'), { recursive: true });
    writeFileSync(
      artifactPaths.resumeOutlinePath,
      JSON.stringify(
        {
          version: 1,
          prompt,
          wordCountRange,
          provider: cfg.provider,
          model: cfg.model,
          outline: expanded,
        },
        null,
        2
      ),
      'utf-8'
    );
    return expanded;
  };

  const explicitCachedOutline =
    outlineCachePath && existsSync(outlineCachePath)
      ? parseExecutableOutlineCache(
          JSON.parse(readFileSync(outlineCachePath, 'utf-8')) as unknown,
          outlineCachePath,
        )
      : null;
  let resumableOutline: ExecutableOutline | null = null;
  if (!explicitCachedOutline && resumeRequested && existsSync(artifactPaths.resumeOutlinePath)) {
    try {
      const checkpoint = JSON.parse(readFileSync(artifactPaths.resumeOutlinePath, 'utf-8')) as {
        version?: number;
        prompt?: string;
        wordCountRange?: string;
        provider?: string;
        model?: string;
        outline?: ExecutableOutline;
      };
      const matchesRun =
        checkpoint.version === 1 &&
        checkpoint.prompt === prompt &&
        checkpoint.wordCountRange === wordCountRange &&
        checkpoint.provider === cfg.provider &&
        checkpoint.model === cfg.model;
      if (
        matchesRun &&
        checkpoint.outline &&
        inspectOutlineCompleteness(checkpoint.outline).canApply
      ) {
        resumableOutline = checkpoint.outline;
      }
    } catch {
      // 检查点损坏时按未命中处理并重新生成；不能让可选加速能力阻断真实 smoke。
    }
  }
  const writingProject = resumeRequested
    ? projectStorage.list().find(item => firstUnwrittenChapterNumber(item.chapters ?? []) > 1)
    : undefined;
  let executableOutline = explicitCachedOutline ?? resumableOutline ?? null;
  if (writingProject) {
    // 已有正文时禁止重新拆章：generateExecutableOutline 会覆盖检查点，续写合同就和已写章节对不上。
    if (!executableOutline) {
      const writtenThrough = firstUnwrittenChapterNumber(writingProject.chapters ?? []) - 1;
      throw new Error(
        `storyflow 续写失败：项目 ${writingProject.id} 已写到第 ${writtenThrough} 章，但大纲检查点不可用（${artifactPaths.resumeOutlinePath}）。检查点需存在，且提示词、字数区间、厂商和模型与本次一致。已有正文保留在检查点目录，不会重建项目。`,
      );
    }
    outlineWarnings.push(
      `[续写] 复用项目 ${writingProject.id}，从第 ${firstUnwrittenChapterNumber(writingProject.chapters ?? [])} 章继续，不重建大纲与项目`,
    );
  } else {
    if (!executableOutline) {
      executableOutline = await generateExecutableOutline();
    }
    // 拆章同文终检：AI 拆章偶发整块复制（reg20 实证 ch18-50 同文 33 章），适配层是
    // 纯映射修不了内容，唯一治本是重新拆章——含缓存/续跑大纲（脏缓存不值得省一次拆章）。
    // 只重试一次：再失败说明模型当前拆章能力异常，带着警告放行让书审/裁判暴露问题。
    const duplicateScan = detectDuplicateChapterCbn(
      mapExecutableOutlineToGeneratedOutline(executableOutline).chapters
    );
    const duplicateCovered = duplicateScan.reduce((sum, g) => sum + g.chapters.length, 0);
    if (duplicateCovered >= 3) {
      outlineWarnings.push(
        `[拆章同文] 初版蓝图 ${duplicateCovered} 章 CBN 同文（最大组 ${duplicateScan[0].chapters.length} 章），重新拆章一次`
      );
      executableOutline = await generateExecutableOutline();
      const rescan = detectDuplicateChapterCbn(
        mapExecutableOutlineToGeneratedOutline(executableOutline).chapters
      );
      const rescanCovered = rescan.reduce((sum, g) => sum + g.chapters.length, 0);
      if (rescanCovered > 0) {
        outlineWarnings.push(
          `[拆章同文] 重新拆章后仍有 ${rescanCovered} 章 CBN 同文，模型拆章质量异常，需人工核查`
        );
      }
    }
  }
  if (!executableOutline) {
    throw new Error('storyflow 闭环失败：大纲为空');
  }

  const generatedOutline = mapExecutableOutlineToGeneratedOutline(executableOutline);
  const outlineChapters = generatedOutline.chapters;
  if (!outlineChapters || outlineChapters.length < 2) {
    throw new Error(
      `storyflow 闭环失败：大纲章节过少（${outlineChapters?.length ?? 0} < 2），无法支撑批量续写`
    );
  }

  // ---------- 2. 应用大纲（真实 useProjectCreator.createProject 链路） ----------
  // 已有正文的续写跳过 createProject：那会在检查点库里再塞一本空书，并从第 1 章重写。
  const applyStartedAt = Date.now();
  const projectStore = useProjectStore();
  let projectId: string;
  let createdChapterIds: string[];
  let project: Project;
  if (writingProject) {
    projectId = writingProject.id;
    const loaded = await projectStore.loadProject(projectId);
    if (!loaded) {
      throw new Error(`storyflow 续写失败：无法载入已有项目 ${projectId}`);
    }
    createdChapterIds = projectStore.chapters.map(chapter => chapter.id);
  } else {
    const projectCreator = useProjectCreator();
    const createdId = await projectCreator.createProject(generatedOutline, {});
    if (!createdId) {
      throw new Error(
        `storyflow 闭环失败：应用大纲失败（createProject 返回 null，${projectCreator.error.value}）`
      );
    }
    projectId = createdId;
    // 建章已并入 createProject（首页各入口只调 createProject，冒烟必须走同一条路径，
    // 这里再补一次就会把每章建两遍，反而测不出真实链路）。
    createdChapterIds = projectStore.chapters.map(chapter => chapter.id);
    if (createdChapterIds.length !== outlineChapters.length) {
      throw new Error(
        `storyflow 闭环失败：建章数量不符（期望 ${outlineChapters.length}，实际 ${createdChapterIds.length}）`
      );
    }
  }
  phaseTimings.applyOutlineMs = Date.now() - applyStartedAt;

  const rawProject = projectStore.currentProject;
  if (!rawProject) {
    throw new Error('storyflow 闭环失败：currentProject 为空');
  }
  // 深拷贝去 Vue 响应式代理（与 useProjectCreator 内做法一致）。
  // 用独立 refs 覆盖一次，保证传给续写层的是保存成功后的完整项目快照。
  project = JSON.parse(
    JSON.stringify({
      ...rawProject,
      chapters: projectStore.chapters,
      volumes: projectStore.sortedVolumes,
    })
  ) as Project;
  if (!project.chapters || project.chapters.length === 0) {
    throw new Error(
      `storyflow 闭环失败：建章后 project.chapters 仍为空（createChapters 未写入 store chapters ref）`
    );
  }

  // 从模拟主进程存储重新读取序列化快照，不能用 renderer 当前对象自证持久化成功。
  const projectStorageVerification = verifyPersistedProject(projectStorage, projectId);

  // 启动包当前为 50 章；80 章长跑必须在正式续写前补齐后续槽位并写入文件存储。
  // 滚动模式（MOLIU_STORYFLOW_ROLL_MODE，默认 pre）：
  // - pre：开跑前一次性滚动补齐（快，占位兜底；中段触发的质量路径不覆盖）
  // - mid：开跑前只建空章不建大纲节点，细纲全部由 onRunwayLow 中段触发补——
  //   与生产 useBatchWriter.ensureOutlineRunwayAsync（写到 40 章跑道<10 时带着
  //   40 章 digest 滚动）完全同构，覆盖「承接已写状态滚动续纲」的核心质量路径。
  const rollMode = (process.env.MOLIU_STORYFLOW_ROLL_MODE?.trim() || 'pre') as 'pre' | 'mid';
  const chapterNodesBeforeRoll = project.plotOutline.filter(node => node.type === 'chapter').length;
  const rollNeeded = chapterCount > chapterNodesBeforeRoll;
  let outlineRoll: StoryflowOutlineRollReport | undefined;
  if (rollNeeded && isRealAiEnabled() && rollMode === 'pre') {
    const rollStartedAt = Date.now();
    const rollGenerator = new UnifiedOutlineGenerator();
    const rollTraceRunId = `${runIdPrefix}-outline-roll-${Date.now()}`;
    const rolled = await ensureStoryflowWritingCapacity(project, chapterCount, {
      callStructuredText: (system, user, temperature) =>
        rollGenerator.callStructuredTextForRoll(system, user, {
          temperature,
          trace: { runId: rollTraceRunId, model: cfg.model, provider: cfg.provider },
        }),
      onProgress: message => console.log(`[storyflow:roll] ${message}`),
    });
    outlineRoll = rolled.outlineRoll;
    project = rolled;
    phaseTimings.outlineRollMs = Date.now() - rollStartedAt;
    console.log(
      `[storyflow:roll] 滚动续纲完成：真滚 ${outlineRoll.rolledCount} 章` +
        `（第 ${outlineRoll.rolledFromChapter}-${outlineRoll.rolledToChapter} 章），` +
        `占位兜底 ${outlineRoll.placeholderCount} 章` +
        (outlineRoll.warnings.length > 0 ? `，警告 ${outlineRoll.warnings.length} 条` : '')
    );
    if (outlineRoll.warnings.length > 0) {
      outlineWarnings.push(...outlineRoll.warnings.map(w => `[滚动续纲] ${w}`));
    }
  } else if (rollNeeded) {
    // mid 模式（或非真实 AI）：只建空章占位（无大纲节点），大纲槽由中段滚动补。
    // 非 mid 的非真实 AI 场景仍需完整占位（无 AI 可滚）。
    if (rollMode === 'mid' && isRealAiEnabled()) {
      project = await ensureStoryflowChapterCapacity(project, chapterCount);
      outlineRoll = {
        requestedChapters: chapterCount,
        rolledFromChapter: 0,
        rolledToChapter: 0,
        rolledCount: 0,
        placeholderCount: 0,
        warnings: ['mid 模式：细纲由中段滚动触发补齐（与生产 ensureOutlineRunwayAsync 同构）'],
      };
    } else {
      project = await ensureStoryflowWritingCapacity(project, chapterCount);
      outlineRoll = project.outlineRoll;
    }
  }
  projectStorage.save(project);
  const capacitySnapshot = projectStorage.coldReload(projectId);
  if (
    !capacitySnapshot ||
    capacitySnapshot.chapters.length < chapterCount ||
    (rollMode !== 'mid' &&
      (capacitySnapshot.plotOutline.filter(node => node.type === 'chapter')?.length ?? 0) < chapterCount)
  ) {
    throw new Error(
      `storyflow 闭环失败：续写容量补齐失败（章节 ${capacitySnapshot?.chapters.length ?? 0}/${chapterCount}，` +
        `大纲槽 ${capacitySnapshot?.plotOutline.filter(node => node.type === 'chapter')?.length ?? 0}/${chapterCount}）`
    );
  }

  // 建章后立即落盘大纲产物：真实 AI 续写阶段耗时长、可能超时，提前留存大纲数据供质量评估
  // （并发矩阵时带后缀路径，见 resolveStoryflowArtifactPaths）
  writeFileSync(
    artifactPaths.outlinePath,
    JSON.stringify(
      {
        title: generatedOutline.title,
        genres: generatedOutline.genres,
        synopsis: generatedOutline.synopsis,
        openingHook: executableOutline.startupPack30.openingHook,
        volumes: project.volumes.map(v => ({
          name: v.name,
          summary: v.summary,
        })),
        characters: project.characters.map(c => ({
          name: c.name,
          role: c.role,
        })),
        chapters: outlineChapters.map(ch => ({
          title: ch.title,
          CBN: ch.CBN,
          CPNs: ch.CPNs,
          CEN: ch.CEN,
          mustCover: ch.mustCover,
          forbiddenZones: ch.forbiddenZones,
        })),
        // plotOutline 章节节点（建章后初始状态，续写后会被 chapterTitle 回写更新）
        plotOutlineChapters: (project.plotOutline ?? [])
          .filter(n => n.type === 'chapter')
          .map(n => ({ orderIndex: n.orderIndex, title: n.title })),
      },
      null,
      2
    ),
    'utf8'
  );

  const checkpointResults: ContinueWriteChapterRunResult[] = [];
  const persistProgress = (): void => {
    mkdirSync(artifactPaths.proseDir, { recursive: true });
    for (const chapter of checkpointResults) {
      writeFileSync(
        join(artifactPaths.proseDir, `ch${String(chapter.chapterNumber).padStart(2, '0')}.txt`),
        chapter.output.prose,
        'utf8'
      );
    }
    writeFileSync(
      artifactPaths.summaryPath,
      JSON.stringify(
        {
          book: project.name,
          mode: 'storyflow-closed-loop',
          status: 'in-progress',
          requestedChapterCount: chapterCount,
          completedChapters: checkpointResults.length,
          chapters: outlineChapters.length,
          outlinePath: artifactPaths.outlinePath,
          proseDir: artifactPaths.proseDir,
          batch: checkpointResults.map(chapter => ({
            ch: chapter.chapterNumber,
            accepted: chapter.output.success,
            title: chapter.output.title,
            words: chapter.output.prose.length,
            attempts: chapter.output.attempts,
            rewriteRounds: chapter.output.longFormResult?.rewriteRounds ?? 0,
            writer: summarizeWriterRun(chapter.output.longFormResult),
            gateIssues: (chapter.output.gateResult?.allIssues ?? []).map(issue => ({
              category: issue.category,
              severity: issue.severity,
              location: issue.location,
              description: issue.description,
              evidence: issue.evidence,
            })),
            head: chapter.output.prose.slice(0, 120),
            tail: chapter.output.prose.slice(-80),
            error: chapter.output.error ?? null,
          })),
          projectStorageVerification,
          outlineWarnings,
          outlineRoll: outlineRoll
            ? {
                requestedChapters: outlineRoll.requestedChapters,
                rolledFromChapter: outlineRoll.rolledFromChapter,
                rolledToChapter: outlineRoll.rolledToChapter,
                rolledCount: outlineRoll.rolledCount,
                placeholderCount: outlineRoll.placeholderCount,
                warnings: outlineRoll.warnings,
              }
            : null,
          provider: cfg.provider,
          model: cfg.model,
          phaseTimings: {
            outlineDirectionsMs: phaseTimings.outlineDirectionsMs,
            outlineExpandMs: phaseTimings.outlineExpandMs,
            outlineRollMs: phaseTimings.outlineRollMs,
            applyOutlineMs: phaseTimings.applyOutlineMs,
            continueWriteMs: phaseTimings.continueWriteMs,
            totalMs: phaseTimings.totalMs,
          },
          updatedAt: new Date().toISOString(),
          warnings: ['任务尚未完成；本摘要为阶段性检查点，进程超时或中断后仍可用于诊断。'],
        },
        null,
        2
      ),
      'utf8'
    );
  };
  persistProgress();

  // ---------- 4. 批量续写（真实 BATCH_CONTINUE 路径，与 useBatchWriter 对齐） ----------
  // 真实模式注入真实 StructuredAI（此前缺省导致内部回落 ContinueWriteFakeAI，冒烟失真）
  const continueWriteStartedAt = Date.now();
  const ai = isRealAiEnabled()
    ? createRealStructuredAI({
        provider: cfg.provider,
        apiKey: cfg.apiKey,
        model: cfg.model,
        baseUrl: cfg.baseUrl,
      })
    : undefined;
  // 内存版 plotOutlineClient：续写 AI 产出的短标题回写到 project 副本的 plotOutline，
  // 让最终 summary 能反映目录页真实标题（而非永远「第N章」）。
  // forceStoryRuntime 模式下 pipeline 不走 store 默认实现，必须显式注入。
  const plotOutlineClient = {
    updateChapterTitle: async (input: {
      chapterId: string;
      chapterNumber: number;
      title: string;
    }): Promise<void> => {
      const chapterNodes = project.plotOutline?.filter(n => n.type === 'chapter') ?? [];
      const node =
        chapterNodes.find(n => n.chapterId === input.chapterId) ??
        chapterNodes.find(n => n.orderIndex === input.chapterNumber - 1) ??
        chapterNodes[input.chapterNumber - 1];
      if (node) {
        node.title = input.title;
      }
    },
  };
  const writeFromChapter = writingProject
    ? firstUnwrittenChapterNumber(project.chapters ?? [])
    : 1;
  const chaptersToWrite = storyflowChaptersRemaining(chapterCount, writeFromChapter);
  if (chaptersToWrite <= 0) {
    throw new Error(
      `storyflow 续写失败：请求写到第 ${chapterCount} 章，已有正文写到第 ${writeFromChapter - 1} 章，没有剩余章节`,
    );
  }
  if (writingProject) {
    console.log(
      `[storyflow:resume] 从第 ${writeFromChapter} 章续写，本轮再写 ${chaptersToWrite} 章（目标第 ${chapterCount} 章）`,
    );
  }
  const result = await runContinueWriteChapters({
    project,
    fromChapter: writeFromChapter,
    chapterCount: chaptersToWrite,
    targetWordCount,
    persistTrace: true,
    // 蓝图再生调用器（2026-09-13 r4 ch187 齐王命运冲突五连拒成洞补齐）：
    // 履约域/命运禁区连续失败时以已写状态+命运锁为基底重写本章合同
    ...(isRealAiEnabled()
      ? {
          repairBlueprint: (system: string, user: string, temperature?: number) =>
            new UnifiedOutlineGenerator().callStructuredTextForRoll(system, user, {
              temperature,
              trace: { runId: `${runIdPrefix}-bp-regen-${Date.now()}`, model: cfg.model, provider: cfg.provider },
            }),
        }
      : {}),
    runIdPrefix,
    mode: 'batch',
    ai,
    plotOutlineClient,
    // 续写从第一轮就用稳定 runtime 目录：墙钟杀掉进程时 dispose 不会跑，库还在；
    // 下一轮打开同一目录。普通冒烟仍用临时目录，结束即删，避免测试互相污染。
    ...(resumeRequested
      ? {
          runtimeUserDataPath: artifactPaths.resumeRuntimePath,
          preserveRuntimeOnDispose: true,
        }
      : {}),
    // 每章 hydrate 会重置 Pinia（setActivePinia(createPinia())），导致开头的
    // injectSettingsStore(cfg) 注入的 AI 配置失活。此处通过回调在每章 hydrate 后重新注入，
    // 让记忆提取（enhanceWithAI → useAIService → useSettingsStore）能读到 provider，
    // 避免「请先配置 AI 服务」导致记忆 AI 增强静默失败。
    onChapterHydrated: () => injectSettingsStore(cfg),
    onChapterSettled: ({ result: chapterResult }) => {
      checkpointResults.push(chapterResult);
      persistProgress();
      // 伏笔回收流转已下沉到 pipeline 提交阶段（foreshadowClient.markResolved，
      // 与生产 useBatchWriter 同源），此处不再手动消费 resolvedForeshadowIds。
    },
    // mid 模式：细纲跑道不足时中段滚动续纲（与生产 ensureOutlineRunwayAsync 同构——
    // 带着已写章节 digest 滚，这是「承接实写状态」的核心质量路径）。
    // 直调 rollOutlineForward 并原地变更 liveProject（session 内部引用）：
    // ensureStoryflowWritingCapacity 会 clone 后再滚，产物回不到 session 的章节定位闭包。
    ...(rollMode === 'mid' && isRealAiEnabled()
      ? {
          onRunwayLow: async ({ runway, writtenThrough, nextChapterNumber, project: liveProject }) => {
            const rollStartedAt = Date.now();
            const rollGenerator = new UnifiedOutlineGenerator();
            const rollTraceRunId = `${runIdPrefix}-outline-roll-mid-${Date.now()}`;
            console.log(
              `[storyflow:roll] 跑道不足（还有 ${runway} 章有细纲待写，已写到第 ${writtenThrough} 章），中段滚动补第 ${nextChapterNumber} 章起细纲...`
            );
            const rollResult = await rollOutlineForward({
              project: liveProject,
              callStructuredText: (system, user, temperature) =>
                rollGenerator.callStructuredTextForRoll(system, user, {
                  temperature,
                  trace: { runId: rollTraceRunId, model: cfg.model, provider: cfg.provider },
                }),
              maxChapters: chapterCount,
              persist: (nodes, plannedChapterCount) => {
                liveProject.plotOutline.push(...nodes);
                liveProject.metadata = {
                  ...liveProject.metadata,
                  plannedChapterCount: Math.max(
                    liveProject.metadata?.plannedChapterCount ?? 0,
                    plannedChapterCount
                  ),
                };
              },
            });
            phaseTimings.outlineRollMs += Date.now() - rollStartedAt;

            // 滚动没补到的章（模型失败/前缀截断）落占位节点兜底：mid 模式只预建了空章，
            // 这些章若无节点，位置兜底取不到 → 无细纲降级（诚实但浪费了本轮已建章位）。
            let placeholderFilled = 0;
            const nodeIndexes = new Set(
              liveProject.plotOutline
                .filter(node => node.type === 'chapter')
                .map(node => node.orderIndex)
            );
            for (let index = 0; index < chapterCount; index += 1) {
              if (nodeIndexes.has(index)) continue;
              const chapter = liveProject.chapters[index];
              liveProject.plotOutline.push({
                id: `plot-storyflow-mid-${projectId}-${index}`,
                title: chapter?.title || `第${index + 1}章`,
                description: `滚动续写槽位：承接第${index}章既有状态，由续写引擎根据当前合同推进主线。`,
                type: 'chapter',
                orderIndex: index,
                chapterId: chapter?.id,
              });
              placeholderFilled += 1;
            }

            if (outlineRoll) {
              outlineRoll.rolledCount += rollResult.appendedCount;
              outlineRoll.rolledToChapter = Math.max(
                outlineRoll.rolledToChapter,
                rollResult.toChapter
              );
              outlineRoll.placeholderCount += placeholderFilled;
              outlineRoll.warnings.push(...rollResult.warnings);
            } else {
              outlineRoll = {
                requestedChapters: chapterCount,
                rolledFromChapter: rollResult.fromChapter,
                rolledToChapter: rollResult.toChapter,
                rolledCount: rollResult.appendedCount,
                placeholderCount: placeholderFilled,
                warnings: [...rollResult.warnings],
              };
            }
            console.log(
              `[storyflow:roll] 中段滚动落地：真滚 ${rollResult.appendedCount} 章` +
                `（第 ${rollResult.fromChapter}-${rollResult.toChapter} 章），占位兜底 ${placeholderFilled} 章`
            );
            outlineWarnings.push(
              ...rollResult.warnings.map(w => `[中段滚动@${writtenThrough}章] ${w}`)
            );
          },
        }
      : {}),
  });
  phaseTimings.continueWriteMs = Date.now() - continueWriteStartedAt;
  phaseTimings.totalMs =
    phaseTimings.outlineDirectionsMs +
    phaseTimings.outlineExpandMs +
    phaseTimings.outlineRollMs +
    phaseTimings.applyOutlineMs +
    phaseTimings.continueWriteMs;

  // 续写全程都在往同一个项目里存章节；批量结束后必须再冷读一次，确认大纲阶段落盘的
  // 角色/伏笔/卷没有被写作链路的保存覆盖掉（真实回归：saveCurrentProject 以 store 的
  // 独立 ref 为准，store 未灌角色时会把 characters/foreshadows 覆盖成空数组）。
  const afterWriteProject = projectStorage.coldReload(projectId);
  if (!afterWriteProject) {
    throw new Error('storyflow 闭环失败：批量续写后无法冷读取项目');
  }
  const postWritePersistence: PostWritePersistenceVerification = {
    characterCount: afterWriteProject.characters.length,
    foreshadowCount: afterWriteProject.foreshadows.length,
    volumeCount: afterWriteProject.volumes.length,
    plotChapterCount: afterWriteProject.plotOutline.filter(node => node.type === 'chapter').length,
    writtenChapterCount: afterWriteProject.chapters.filter(
      chapter => (chapter.content ?? '').length > 300
    ).length,
  };

  return {
    cfg,
    direction,
    executableOutline,
    generatedOutline,
    project: result.project,
    chapterRunResults: result.chapters,
    runtimeBackend: result.runtimeBackend,
    runtimeVerification: result.runtimeVerification,
    projectStorageVerification,
    postWritePersistence,
    createdChapterIds,
    outlineWarnings,
    phaseTimings,
    outlineRoll,
  };
}

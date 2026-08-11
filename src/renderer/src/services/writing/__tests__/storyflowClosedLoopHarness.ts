/**
 * Storyflow 闭环 harness：开题中心大纲生成 → 应用大纲 → 批量续写
 *
 * 与真实环境完全对齐（真实 AI 请求）：
 * 1. 大纲生成：UnifiedOutlineGenerator.generateDirections → expandDirection
 *    （与开题中心 TopicDiscoveryBoard 的 prompt 玩法同路径，真实 fetch AI）
 * 2. 应用大纲：mapExecutableOutlineToGeneratedOutline → useProjectCreator.createProject
 *    （真实执行 buildPlotOutline/buildCharacters/buildVolumes 等全部纯函数）
 * 3. 建章：useChapterOutlineGenerator.createChapters（真实执行，含结构化节点落库）
 * 4. 批量续写：runContinueWriteChapters（mode:'batch' = BATCH_CONTINUE_PRESET，
 *    与 useBatchWriter / 批量 UI 同路径，指数退避重试 + 门禁）
 *
 * 测试环境桩（仅替换环境副作用，业务代码全部真实）：
 * - window.electronAPI：内存实现（模拟主进程 moliu-projects.json 存储）
 * - vue-router：由测试文件 vi.mock（useProjectCreator 依赖 useRouter）
 *
 * 覆盖范围：续写阶段固定 forceStoryRuntime=true → 仅覆盖 LongFormWritingEngine 正式长篇
 * 分支。StateDriven orchestrator 分支在生产 Electron 中因 preload（src/preload.ts）无条件
 * 注册 storyRuntime 而 hasStoryRuntime() 恒真、永不触发，属兜底死路径，故不纳入闭环冒烟。
 */

import { createPinia, getActivePinia, setActivePinia } from 'pinia';

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { UnifiedOutlineGenerator } from '@/services/outline/generators/unified-generator';
import { mapExecutableOutlineToGeneratedOutline } from '@/services/outline/adapters/executable-outline-adapter';
import type { ExecutableOutline } from '@/services/outline/types/executable-outline';
import type { OutlineDirection } from '@/services/outline/types/direction';
import type { GeneratedOutline } from '@/types/inspiration';
import type { Project } from '@/types/project';
import type { ProviderType } from '@/config/ai-providers';
import { useProjectCreator } from '@/composables/useProjectCreator';
import { useChapterOutlineGenerator } from '@/composables/useChapterOutlineGenerator';
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
import {
  createRealStructuredAI,
  isRealAiEnabled,
} from './realStructuredAI';

export interface StoryflowClosedLoopOptions {
  /** 开题提示（默认：一个可写 30 万字长篇的起点） */
  prompt?: string;
  wordCountRange?: string;
  /** 批量续写章数（默认 5，覆盖开篇多章以精准测试跨章合同去重/状态衔接） */
  chapterCount?: number;
  /** 每章目标字数（真实 AI 冒烟建议 1500-2500） */
  targetWordCount?: number;
  runIdPrefix?: string;
}

export interface StoryflowClosedLoopResult {
  cfg: ResolvedRealAiConfig;
  direction: OutlineDirection;
  executableOutline: ExecutableOutline;
  generatedOutline: GeneratedOutline;
  project: Project;
  chapterRunResults: ContinueWriteChapterRunResult[];
  runtimeBackend: HarnessRuntimeBackend;
  runtimeVerification: StoryRuntimeVerification;
  projectStorageVerification: ProjectStorageVerification;
  /** 建章后、续写前的章节 ID（大纲应用产物） */
  createdChapterIds: string[];
}

export interface ProjectStorageVerification {
  chapterCount: number;
  plotChapterCount: number;
  linkedPlotChapterCount: number;
  structuredPlotChapterCount: number;
  characterCount: number;
  foreshadowCount: number;
  volumeCount: number;
}

function cloneProject(project: Project): Project {
  return JSON.parse(JSON.stringify(project)) as Project;
}

/** 内存版 electronAPI：模拟主进程项目存储 + 记忆文件存储 */
function installMemoryElectronAPI(): Map<string, Project> {
  const store = new Map<string, Project>();
  // 记忆文件存储：projectId -> (filePath -> content)，支持 save/load/list/delete 往返
  const memoryStore = new Map<string, Map<string, string>>();
  const api = {
    listProjects: async (): Promise<Project[]> => Array.from(store.values()).map(cloneProject),
    getProject: async (id: string): Promise<Project | null> => {
      const project = store.get(id);
      return project ? cloneProject(project) : null;
    },
    createProject: async (data: Project): Promise<Project> => {
      const snapshot = cloneProject(data);
      store.set(data.id, snapshot);
      return cloneProject(snapshot);
    },
    updateProject: async (
      id: string,
      updates: Partial<Project>,
    ): Promise<Project | null> => {
      const current = store.get(id);
      if (!current) return null;
      const merged: Project = {
        ...current,
        ...updates,
        metadata: { ...(current.metadata ?? {}), ...(updates.metadata ?? {}) },
      };
      const snapshot = cloneProject(merged);
      store.set(id, snapshot);
      return cloneProject(snapshot);
    },
    saveProject: async (project: Project): Promise<void> => {
      store.set(project.id, cloneProject(project));
    },
    deleteProject: async (): Promise<void> => {},
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
      return { success: true };
    },
    loadMemoryFile: async (data: {
      projectId: string;
      filePath: string;
    }): Promise<string | null> =>
      memoryStore.get(data.projectId)?.get(data.filePath) ?? null,
    listMemoryFiles: async (data: {
      projectId: string;
      basePath: string;
    }): Promise<string[]> => {
      const proj = memoryStore.get(data.projectId);
      if (!proj) return [];
      const prefix = data.basePath.endsWith('/')
        ? data.basePath
        : data.basePath + '/';
      return Array.from(proj.keys()).filter(
        f => f.startsWith(prefix) || f.startsWith(data.basePath),
      );
    },
    deleteMemoryFile: async (data: {
      projectId: string;
      filePath: string;
    }): Promise<{ success: boolean; error?: string }> => {
      memoryStore.get(data.projectId)?.delete(data.filePath);
      return { success: true };
    },
  };
  (window as unknown as { electronAPI: unknown }).electronAPI = api;
  return store;
}

/** 注入真实 AI 配置到 settingsStore（UnifiedOutlineGenerator.getAIConfig 依赖它） */
function injectSettingsStore(cfg: ResolvedRealAiConfig): void {
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
  options: StoryflowClosedLoopOptions = {},
): Promise<StoryflowClosedLoopResult> {
  const prompt = options.prompt ?? '一个现代社畜穿越到古代朝堂，凭借现代知识在官场步步高升，卷入皇权之争';
  const wordCountRange = options.wordCountRange ?? '30万-60万';
  const chapterCount = options.chapterCount ?? 5;
  const targetWordCount = options.targetWordCount ?? 2000;
  const runIdPrefix = options.runIdPrefix ?? 'storyflow';

  // ---------- 0. 配置与测试环境桩 ----------
  const cfg = resolveContinueWriteRealConfig();
  injectSettingsStore(cfg);
  const projectStorage = installMemoryElectronAPI();

  // ---------- 1. 开题中心大纲生成（真实 AI fetch，与 TopicDiscoveryBoard prompt 玩法同路径） ----------
  // 传 trace.runId 让大纲阶段的 prompt/响应落盘 temp/ai-traces/，便于人工评估单章蓝图产出质量。
  const generator = new UnifiedOutlineGenerator();
  const outlineTraceRunId = `${runIdPrefix}-outline-${Date.now()}`;
  const dirResult = await generator.generateDirections(prompt, {
    wordCountRange,
    trace: { runId: outlineTraceRunId, model: cfg.model, provider: cfg.provider },
  });
  if (!dirResult.directions || dirResult.directions.length === 0) {
    throw new Error(
      `storyflow 闭环失败：大纲方向生成为空（generateDirections 未返回任何方向，${dirResult.warnings?.[0] ?? ''}）`,
    );
  }
  const direction = dirResult.directions[0];

  const expandedResult = await generator.expandDirection(prompt, direction, {
    wordCountRange,
    trace: { runId: outlineTraceRunId, model: cfg.model, provider: cfg.provider },
  });
  const expanded = expandedResult.outline;
  if (!expanded) {
    const failureDetails = expandedResult.blockers?.length
      ? expandedResult.blockers.join('；')
      : expandedResult.warnings?.join('；') || '未提供失败详情';
    throw new Error(
      `storyflow 闭环失败：大纲展开为空（expandDirection 返回 null，${failureDetails}）`,
    );
  }
  const executableOutline = expanded;

  const generatedOutline = mapExecutableOutlineToGeneratedOutline(executableOutline);
  const outlineChapters = generatedOutline.chapters;
  if (!outlineChapters || outlineChapters.length < 2) {
    throw new Error(
      `storyflow 闭环失败：大纲章节过少（${outlineChapters?.length ?? 0} < 2），无法支撑批量续写`,
    );
  }

  // ---------- 2. 应用大纲（真实 useProjectCreator.createProject 链路） ----------
  const projectCreator = useProjectCreator();
  const projectId = await projectCreator.createProject(generatedOutline, {});
  if (!projectId) {
    throw new Error(`storyflow 闭环失败：应用大纲失败（createProject 返回 null，${projectCreator.error.value}）`);
  }

  // ---------- 3. 建章（真实 useChapterOutlineGenerator.createChapters 链路） ----------
  const chapterOutlineGenerator = useChapterOutlineGenerator();
  // 类型断言：inspiration.GeneratedChapter 与 composable 自有类型字段略有差异（outline 等运行时兜底为空串）
  const createdChapterIds = await chapterOutlineGenerator.createChapters(
    outlineChapters as unknown as Parameters<typeof chapterOutlineGenerator.createChapters>[0],
  );
  if (createdChapterIds.length !== outlineChapters.length) {
    throw new Error(
      `storyflow 闭环失败：建章数量不符（期望 ${outlineChapters.length}，实际 ${createdChapterIds.length}）`,
    );
  }

  const projectStore = useProjectStore();
  const rawProject = projectStore.currentProject;
  if (!rawProject) {
    throw new Error('storyflow 闭环失败：currentProject 为空');
  }
  // 深拷贝去 Vue 响应式代理（与 useProjectCreator 内做法一致）。
  // 用独立 refs 覆盖一次，保证传给续写层的是保存成功后的完整项目快照。
  const project = JSON.parse(JSON.stringify({
    ...rawProject,
    chapters: projectStore.chapters,
    volumes: projectStore.sortedVolumes,
  })) as Project;
  if (!project.chapters || project.chapters.length === 0) {
    throw new Error(
      `storyflow 闭环失败：建章后 project.chapters 仍为空（createChapters 未写入 store chapters ref）`,
    );
  }

  // 从模拟主进程存储重新读取序列化快照，不能用 renderer 当前对象自证持久化成功。
  const persistedProject = projectStorage.get(projectId);
  if (!persistedProject) {
    throw new Error('storyflow 闭环失败：建章后项目未写入主进程存储');
  }
  const persistedChapterNodes = persistedProject.plotOutline.filter(node => node.type === 'chapter');
  const projectStorageVerification: ProjectStorageVerification = {
    chapterCount: persistedProject.chapters.length,
    plotChapterCount: persistedChapterNodes.length,
    linkedPlotChapterCount: persistedChapterNodes.filter(node => Boolean(node.chapterId)).length,
    structuredPlotChapterCount: persistedChapterNodes.filter(node =>
      Boolean(node.CBN && node.CPNs?.length && node.CEN && node.mustCover?.length),
    ).length,
    characterCount: persistedProject.characters.length,
    foreshadowCount: persistedProject.foreshadows.length,
    volumeCount: persistedProject.volumes.length,
  };

  // 建章后立即落盘大纲产物：真实 AI 续写阶段耗时长、可能超时，提前留存大纲数据供质量评估
  writeFileSync(
    join(process.cwd(), 'temp', 'storyflow.closed-loop.outline.json'),
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

  // ---------- 4. 批量续写（真实 BATCH_CONTINUE 路径，与 useBatchWriter 对齐） ----------
  // 真实模式注入真实 StructuredAI（此前缺省导致内部回落 ContinueWriteFakeAI，冒烟失真）
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
  const result = await runContinueWriteChapters({
    project,
    fromChapter: 1,
    chapterCount,
    targetWordCount,
    persistTrace: true,
    runIdPrefix,
    mode: 'batch',
    ai,
    plotOutlineClient,
    // 每章 hydrate 会重置 Pinia（setActivePinia(createPinia())），导致开头的
    // injectSettingsStore(cfg) 注入的 AI 配置失活。此处通过回调在每章 hydrate 后重新注入，
    // 让记忆提取（enhanceWithAI → useAIService → useSettingsStore）能读到 provider，
    // 避免「请先配置 AI 服务」导致记忆 AI 增强静默失败。
    onChapterHydrated: () => injectSettingsStore(cfg),
  });

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
    createdChapterIds,
  };
}

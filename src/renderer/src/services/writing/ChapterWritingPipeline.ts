/**
 * 单章写作共享管道（ChapterWritingPipeline）
 *
 * 职责：封装"单章完整执行流程"，作为智能续写（V2）和批量续写（useBatchWriter）
 * 的公共执行核心，消除两套独立的单章流水线实现。
 *
 * 流程：
 *   0. Preflight 预检（可选，见 chapterWritePresets）
 *   1. contextAgent 生成任务书（TaskBook）
 *   2. 若 storyRuntime 可用（或 forceStoryRuntime）：LongFormWritingEngine 正式长篇路径
 *      否则 StateDriven.writeChapter()（L1-L7 降级闭环）
 *   3. 字数不足时补充续写（可选；长篇路径内已由 Engine 补字）
 *   4. 结果归一化 → ChapterWriteOutput
 *
 * 测试/冒烟：注入 forceStoryRuntime + structuredAI + storyRuntimeApi，
 * 调用 execute(...SMART_CONTINUE_PRESET) 即可与正式智能续写同构。
 *
 * 设计要点：
 * - 无状态服务：依赖通过构造函数注入（drafter/gitBackup/persistence/memoryClient 适配器 +
 *   preflightService + contextAgent）。
 * - 默认创建 persistence/memoryClient（与 V2 同口径），批量不再因 null 跳过落库。
 * - 内部持有 StateDrivenWritingOrchestrator 实例（跨章节复用状态快照/检索器/检查点）。
 * - 严格门禁未通过时绝不提交；forceAccepted 仅保留为兼容字段且恒为 false。
 */

import { useProjectStore } from '@/stores/project.store';
import { useActiveAIProvider } from '@/composables/useActiveAIProvider';
import {
  StateDrivenWritingOrchestrator,
  type DrafterClient,
  type GitBackupClient,
  type ChapterPersistenceClient,
  type MemoryClient,
  type WriteChapterResult,
} from '@/services/orchestrator';
import { usePreflightService } from './preflight/PreflightService';
import { useEnhancedContextAgent } from '@/services/ai/agents/enhanced-context-agent';
import { GitBackupManager } from '@/services/writing/backup/GitBackupManager';
import {
  createChapterPersistenceClient,
  createChapterMemoryClient,
} from './chapterPersistenceAdapters';
import {
  isPlaceholderChapterTitle,
  prependTitleLineForPersist,
} from './chapterTitle';
import { runSupplementRounds } from './supplement';
import {
  AI_AUXILIARY_REQUEST_TIMEOUT_MS,
  AI_SINGLE_REQUEST_TIMEOUT_MS,
} from './chapterWritePresets';
import {
  TYPESETTING_HARD_RULES,
  buildWritingRulesWithTypesetting,
} from './typesetting';
import type { GateContext, GateIssue, GatePipelineResult } from '@/services/gates/types';
import type { WritingTaskBook } from '@/types/writing-v2';
import type { Project, Chapter, CharacterStateChange } from '@/types/project';
import type {
  ContinuityDomain,
  ContinuityReport,
  LongFormWriteResult,
  StoryState,
  StructuredAI,
  StructuredAIRequest,
} from '@/types/story-runtime';
import {
  AIChapterJudge,
  AIFactExtractor,
  AgentLoopRunner,
  BookToolkit,
  ContractPackBuilder,
  dedupProse,
  GroundedRetriever,
  LegacyProjectMigrator,
  LongFormWritingEngine,
  RecordingAgentLoopTransport,
  RecordingStructuredAI,
  sanitizeStructuredProseLeakage,
  shouldEnableAiTrace,
  StoryRuntimeClient,
  stripStateForChapterRewrite,
} from '@/services/story-runtime';
import type {
  AgentLoopTransport,
  AgentResearchStep,
} from '@/services/story-runtime';
import { readPositiveIntEnv } from '@/utils/env';
import { robustJsonParse } from '@/utils/json-parser';
import { classifyError, type ErrorKind } from '@/utils/ai-error-classify';
import { overlayCharacterFates } from '@/services/writing/extract-plot-memory';
import { stripStructuredNodeBlock } from '@/services/outline/parser/utils';
import type { SceneChunk } from '@/types/story-runtime';

/**
 * 按章数（而非场景块数）选取近期上下文场景。
 *
 * 正文段落归一化后是统一的 \n\n 间隔，SCENE_BREAK_PATTERN 的 \n{3,} 分支几乎不再命中，
 * 整章常只切成 1 个场景块（《绝症当虫治》2026-08-26 实测 10/10 章均 1 块）——
 * 旧的 slice(-4) 在该形态下只覆盖 4 个块即 1 章多一点，跨章事实（药方成分、
 * 已发生状态）在起草 prompt 里不可见。改为按 chapterIndex 去重取最近 N 章
 * 的全部场景块，一章多块形态下同样覆盖 N 章。
 */
export function selectRecentScenesByChapter(
  sceneChunks: SceneChunk[],
  chapterNumber: number,
  maxChapters: number
): SceneChunk[] {
  const chapterIndexes = [
    ...new Set(
      sceneChunks
        .map(scene => scene.chapterIndex)
        .filter(index => Number.isInteger(index) && index < chapterNumber)
    ),
  ]
    .sort((a, b) => b - a)
    .slice(0, maxChapters);
  const wanted = new Set(chapterIndexes);
  return sceneChunks.filter(scene => wanted.has(scene.chapterIndex));
}

function createStructuredAIFromActiveProvider(signal?: AbortSignal): StructuredAI {
  const inner: StructuredAI = {
    async generate<T>(request: StructuredAIRequest<T>): Promise<unknown> {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const { requireAIService } = useActiveAIProvider();
      const service = requireAIService();
      // 请求级超时护栏：scene-draft 单章需生成 2000 字以上正文，慢模型单次请求
      // 可达数分钟；不设护栏时依赖 SDK 默认超时（部分适配器仅 30s）会误杀长输出。
      // 与冒烟测试路径（realStructuredAI）共用 AI_SINGLE_REQUEST_TIMEOUT_MS，
      // 避免生产/测试行为不对称。classifyError 会把超时归为 timeout（瞬态、可重试）。
      const timeoutController = new AbortController();
      const requestTimeoutMs = request.purpose === 'scene-draft'
        ? AI_SINGLE_REQUEST_TIMEOUT_MS
        : AI_AUXILIARY_REQUEST_TIMEOUT_MS;
      const timeoutTimer = setTimeout(
        () => timeoutController.abort(),
        requestTimeoutMs,
      );
      const combined = signal
        ? AbortSignal.any([signal, timeoutController.signal])
        : timeoutController.signal;
      try {
        const raw = await service.complete(request.prompt, {
          system: [
            request.system,
            `schemaName=${request.schemaName}`,
            '只输出合法 JSON 对象，不要 Markdown 代码块，不要前后解释文字。',
          ].join('\n'),
          temperature: request.purpose === 'scene-draft' ? 0.65 : 0.2,
          signal: combined,
          // 结构化输出：按 provider 能力启用 JSON 强制（不支持的 provider 自动降级）
          jsonMode: true,
        });
        const parsed = ChapterWritingPipeline.parseStructuredJson(raw, request.schemaName);
        const result = request.parse(parsed);
        // 把模型原始文本挂在返回对象上供 RecordingStructuredAI 写入 trace.rawResponse。
        // recorder 会读取后剥离该字段，下游消费方零感知；非对象返回值（如基本类型）忽略。
        if (result && (typeof result === 'object' || typeof result === 'function')) {
          try {
            (result as Record<string, unknown>).__rawResponse = raw;
          } catch {
            /* 只读属性则忽略，不阻塞主流程 */
          }
        }
        return result;
      } finally {
        clearTimeout(timeoutTimer);
      }
    },
  };
  if (shouldEnableAiTrace()) {
    return new RecordingStructuredAI(inner, {
      runId: `longform-${Date.now()}`,
      persist: true,
    });
  }
  return inner;
}

/**
 * Agent 检索回合环境开关（docs/agent-loop-refactor.md §5.2）：
 * MOLIU_AGENT_RESEARCH=1 启用；缺省/无效时关闭（零行为变化）。
 * 渲染进程禁裸读 process.env，一律走 utils/env.ts（浏览器上下文无 process 全局）。
 */
export function isAgentResearchEnvEnabled(): boolean {
  return readPositiveIntEnv('MOLIU_AGENT_RESEARCH') !== undefined;
}

/**
 * 从 active provider 构造 agent 检索循环的多轮传输通道。
 * 与 createStructuredAIFromActiveProvider 同口径：请求级超时护栏 +
 * AbortSignal 叠加；温度用辅助档 0.2（检索判定任务，非创作）。
 */
function createAgentLoopTransportFromActiveProvider(signal?: AbortSignal): AgentLoopTransport {
  return {
    async send(messages, options) {
      if (signal?.aborted || options?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const { requireAIService } = useActiveAIProvider();
      const service = requireAIService();
      const timeoutController = new AbortController();
      const timeoutTimer = setTimeout(
        () => timeoutController.abort(),
        AI_AUXILIARY_REQUEST_TIMEOUT_MS,
      );
      const inner = options?.signal ?? signal;
      const combined = inner
        ? AbortSignal.any([inner, timeoutController.signal])
        : timeoutController.signal;
      try {
        return await service.chatComplete(messages, {
          temperature: 0.2,
          signal: combined,
          jsonMode: true,
        });
      } finally {
        clearTimeout(timeoutTimer);
      }
    },
  };
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  return false;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
}

// ============================================================
// 类型定义
// ============================================================

/** 写作风格（与 useChapterWriter / useBatchWriter 保持一致） */
export type WritingStyle = 'concise' | 'elegant' | 'humorous' | 'ancient';

/** 管道输入 */
export interface ChapterWriteInput {
  /** 项目（明确传入，不依赖 store.currentProject） */
  project: Project;
  /** 章节（明确传入，不依赖 store.currentChapter） */
  chapter: Chapter;
  /** 目标字数 */
  targetWordCount: number;
  /** 写作风格 */
  writingStyle: WritingStyle;
  /** 是否生成任务书（默认 true） */
  useTaskBook?: boolean;
  /**
   * 是否执行预检（默认 false）。
   * 调用方应优先使用 SMART_CONTINUE_PRESET / BATCH_CONTINUE_PRESET，
   * 避免魔法布尔值。
   */
  enablePreflight?: boolean;
  /**
   * 是否在字数不足时自动补写（默认 false）。
   * 预设中智能续写与批量续写均开启。
   */
  enableSupplement?: boolean;
  /** 用户自定义指令 */
  userInstructions?: string;
  /** 窗口化大纲（可选，未传则由 StateDriven 内部回退到 chapter.outline） */
  windowedOutline?: string;
  /** 前章衔接信息（可选） */
  previousChapter?: { title: string; summary: string; ending: string };
  /** 用户停止时 abort，中断在飞 AI 请求 */
  signal?: AbortSignal;
  /**
   * 批量层重试传入的「上一轮失败教训」（透传到 LongFormWritingEngine.seedRevisionHints）。
   * 让重试不是盲目重跑而是带反馈的定向重写，降低重试浪费。
   */
  seedRevisionHints?: string[];
  /**
   * 引擎内审核失败后的最大整章重写次数（不含初稿）。未传则用引擎默认值（当前 1）。
   * 重要章节可显式调高（如关键转折章 2-3），日常章节保持默认以节省 token。
   */
  maxRewriteRounds?: number;
}

/** 管道输出 */
export interface ChapterWriteOutput {
  /** 是否成功（章节已提交落库） */
  success: boolean;
  /** 最终正文（含补写增量） */
  prose: string;
  /** 提取的标题（persistence 适配器已写入 store），无则 null */
  title: string | null;
  /** 任务书（生成失败或 useTaskBook=false 时为 null） */
  taskBook: WritingTaskBook | null;
  /** 门禁结果（G1-G7） */
  gateResult: GatePipelineResult | null;
  /** 起草尝试次数 */
  attempts: number;
  /** 兼容字段；严格门禁下恒为 false */
  forceAccepted: boolean;
  /** 实际执行的补写轮次（未开启或无需补写时为 0） */
  supplementRounds: number;
  /** 错误信息（失败时） */
  error?: string;
  /**
   * 失败分类（参见 ai-error-classify.ts）。批量层据此决定是否重试整章：
   * 瞬态（network/timeout/truncated/rate_limit/server）重试，持久（schema/review/auth/...）跳过。
   */
  errorKind?: ErrorKind;
  /** 是否值得在批量层重试整章（瞬态错误为 true） */
  retryable?: boolean;
  /** story-runtime 长篇路径下的引擎原始结果；旧 StateDriven 路径为 undefined */
  longFormResult?: LongFormWriteResult;
}

type StoryRuntimeAPI = NonNullable<Window['electronAPI']['storyRuntime']>;

export interface ChapterWritingPipelineDeps {
  drafter?: DrafterClient;
  gitBackup?: GitBackupClient | null;
  persistence?: ChapterPersistenceClient | null;
  memoryClient?: MemoryClient | null;
  /**
   * 大纲章节节点标题回写客户端（可选）。
   * 续写 AI 临时起的短标题，在 persistence 成功后回写到 plotOutline 中
   * type==='chapter' 的对应节点（按 orderIndex 定位），让目录页不再永远是「第N章」。
   * 未注入时降级跳过（不影响续写主流程）。
   */
  plotOutlineClient?: {
    updateChapterTitle(input: ChapterTitleUpdate): Promise<void>;
  } | null;
  /**
   * 伏笔回收流转客户端（可选）。
   * 判官在 G5/G7 语义门确认回收的伏笔（report.resolvedForeshadowIds），
   * 提交成功后经此客户端把 buried/hinted → resolved 写回项目伏笔表，
   * 驱动进度面板与完结判断（checkEndingReadiness 读 resolved 状态）。
   * 未注入时降级跳过（不影响续写主流程）。
   */
  foreshadowClient?: {
    markResolved(ids: string[]): Promise<void>;
    /**
     * 正文确认埋设流转（可选）。
     * 本章大纲/正文命中 planned 伏笔的埋设点时，经此客户端把 planned → buried
     * 并回填 actualPlantedChapter。未实现时降级跳过（旧注入方兼容）。
     */
    markPlanted?(input: { ids: string[]; chapterNumber: number }): Promise<void>;
  } | null;
  /** 注入外部已配置好的 orchestrator（跳过内部创建） */
  orchestrator?: StateDrivenWritingOrchestrator;
  /**
   * 注入 StructuredAI。正式 App 不传，走 active provider；
   * 测试/冒烟注入 FakeAI 或 RealAI（可包 RecordingStructuredAI）。
   */
  structuredAI?: StructuredAI;
  /**
   * 注入 agent 检索循环的多轮传输通道（测试/冒烟用）。
   * 注入即启用检索回合；正式 App 靠 MOLIU_AGENT_RESEARCH 环境开关从
   * active provider 构造。未注入且开关关时零行为变化。
   */
  agentResearchTransport?: AgentLoopTransport;
  /** 注入 StoryRuntimeClient（测试用内存 IPC 客户端） */
  storyRuntimeClient?: StoryRuntimeClient;
  /** 注入 storyRuntime IPC；与 GroundedRetriever / Client 共用 */
  storyRuntimeApi?: StoryRuntimeAPI;
  /**
   * 强制走 LongFormWritingEngine 正式长篇路径。
   * 测试环境无 window.electronAPI 时必须开启，与线上 hasStoryRuntime() 分支对齐。
   */
  forceStoryRuntime?: boolean;
  preflightService?: {
    preflight: () => Promise<{ valid: boolean; errors: string[]; warnings?: string[] }>;
    getCurrentChapterContext: () => Promise<{
      previousChapterEnding?: string;
      recentChaptersFullText?: string;
    } | null>;
  };
  contextAgent?: {
    generateTaskBook: (input: {
      chapterNumber: number;
      previousChapterEnding: string;
      recentChaptersFullText: string;
      targetWordCount: number;
      writingStyle: WritingStyle;
    }) => Promise<{ success: boolean; taskBook?: WritingTaskBook | null; error?: string }>;
  };
}

export interface ChapterTitleUpdate {
  chapterId: string;
  /** 1 起的章节号，仅用于兼容尚未建立 chapterId 关联的旧项目。 */
  chapterNumber: number;
  title: string;
}

function parseNotBeforeChapter(revealTiming: string | undefined): number | null {
  if (!revealTiming) return null;
  const exact = revealTiming.match(/第\s*(\d+)\s*章/u);
  if (!exact) return null;
  const value = Number(exact[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

// ============================================================
// bootstrap 会话级缓存（批量续写性能）
// ============================================================

/** runtime 实例 → projectId → 静态设定指纹 */
const bootstrapFingerprints = new WeakMap<object, Map<string, string>>();

function computeBootstrapFingerprint(project: {
  characters?: Array<{ id: string; updatedAt?: string; aliases?: string[] }>;
  foreshadows?: Array<{ id: string; status: string; setupChapter?: number; actualPlantedChapter?: number }>;
  worldSchema?: unknown;
  plotOutline?: Array<{ id?: string; title?: string; CBN?: string; mustCover?: string[] }>;
  volumes?: unknown[];
  chapters?: unknown[];
}): string {
  const characters = (project.characters ?? [])
    .map(c => `${c.id}:${c.updatedAt ?? ''}:${(c.aliases ?? []).join(',')}`)
    .join('|');
  const foreshadows = (project.foreshadows ?? [])
    .map(f => `${f.id}:${f.status}:${f.setupChapter ?? ''}:${f.actualPlantedChapter ?? ''}`)
    .join('|');
  // outline 参与种子（master 契约 payload + plot_threads），只记长度会漏检
  // 「蓝图再生/定点修复」这类数量不变的内容改写——补 id+CBN 摘要签名。
  const outlineSignature = (project.plotOutline ?? [])
    .map(node => `${node.id ?? ''}:${(node.CBN ?? '').slice(0, 24)}`)
    .join('|');
  const outlineSize = project.plotOutline?.length ?? 0;
  const volumeSize = project.volumes?.length ?? 0;
  const chapterSize = project.chapters?.length ?? 0;
  return [characters, foreshadows, outlineSize, outlineSignature, volumeSize, chapterSize].join('~');
}

/**
 * 本章角色白名单 = 主角 + 登场时点已到的角色 + 本章合同明确提及的人物。
 * 不能把全量角色表直接当白名单，否则后期人物可以在模型自由发挥时提前登场。
 *
 * 登场时点已到的角色必须放行：合同文本常以“皇子”“狱友”等泛称指代，不写本名，
 * 若只按名字文本匹配，大纲安排在本章登场的角色反而会被审查判成 critical 违规，
 * 写作端与审查端互相打架，触发无意义的 repair 重写。
 *
 * 履约文本（fulfillmentText：CBN/CPNs/CEN/mustCover）点名的角色，其优先级高于大纲
 * 规划的登场时点：本章被要求兑现的事件里就有这个人，再禁止其出场就是自相矛盾的合同。
 */
export function resolveAllowedChapterCharacters(input: {
  project: Project;
  chapterNumber: number;
  chapterText: string;
  /**
   * 本章履约要求原文（CBN/CPNs/CEN/mustCover）。缺省时不做履约覆盖，
   * 行为与只传 chapterText 时一致。
   */
  fulfillmentText?: string;
}): { allowedNames: string[]; futureReveals: Array<{ description: string; notBeforeChapter: number }> } {
  const allowedNames = new Set<string>();
  const futureReveals: Array<{ description: string; notBeforeChapter: number }> = [];
  const fulfillmentText = input.fulfillmentText ?? '';

  for (const character of input.project.characters ?? []) {
    const notBeforeChapter = parseNotBeforeChapter(character.profile?.revealTiming);
    // 履约要求点名 → 必须放行。否则「必须写到」与「不许露面」互相打架，模型怎么写都被
    // 判 critical logic_gap，重写轮次全部空烧。
    // 真实回归：smoke:storyflow:real ch1 mustCover「当众亮证，岑述被温伯衡锁走」，
    // 而温伯衡 revealTiming=第5章 → 被排除出白名单 → 连续两轮 critical，批量卡死在第 1 章。
    const requiredByContract = Boolean(character.name) && fulfillmentText.includes(character.name);
    if (notBeforeChapter && notBeforeChapter > input.chapterNumber && !requiredByContract) {
      futureReveals.push({
        description: `角色“${character.name}”不得登场或被揭示（计划：${character.profile.revealTiming}）`,
        notBeforeChapter,
      });
      continue;
    }

    const isProtagonist = /主角|protagonist|hero/iu.test(character.role ?? '');
    const hasDebuted = notBeforeChapter !== null && notBeforeChapter <= input.chapterNumber;
    if (isProtagonist || hasDebuted || requiredByContract || input.chapterText.includes(character.name)) {
      allowedNames.add(character.name);
    }
  }

  return { allowedNames: [...allowedNames], futureReveals };
}

// ============================================================
// 单章写作管道
// ============================================================

export class ChapterWritingPipeline {
  private readonly orchestrator: StateDrivenWritingOrchestrator | null;
  private readonly preflightService: NonNullable<ChapterWritingPipelineDeps['preflightService']>;
  private readonly contextAgent: NonNullable<ChapterWritingPipelineDeps['contextAgent']>;
  private readonly persistence: ChapterPersistenceClient | null;
  private readonly memoryClient: MemoryClient | null;
  private readonly plotOutlineClient: {
    updateChapterTitle(input: ChapterTitleUpdate): Promise<void>;
  } | null;
  private readonly foreshadowClient: {
    markResolved(ids: string[]): Promise<void>;
    markPlanted?(input: { ids: string[]; chapterNumber: number }): Promise<void>;
  } | null;
  private readonly structuredAI: StructuredAI | undefined;
  private readonly agentResearchTransport: AgentLoopTransport | undefined;
  private readonly storyRuntimeClient: StoryRuntimeClient | undefined;
  private readonly storyRuntimeApi: StoryRuntimeAPI | undefined;
  private readonly forceStoryRuntime: boolean;

  constructor(deps?: ChapterWritingPipelineDeps) {    this.structuredAI = deps?.structuredAI;
    this.agentResearchTransport = deps?.agentResearchTransport;
    this.storyRuntimeClient = deps?.storyRuntimeClient;
    this.storyRuntimeApi = deps?.storyRuntimeApi;
    this.forceStoryRuntime = Boolean(deps?.forceStoryRuntime);

    // forceStoryRuntime：测试/冒烟直连长篇正式路径，跳过 Pinia / active provider 初始化
    if (this.forceStoryRuntime) {
      this.persistence =
        deps?.persistence !== undefined
          ? deps.persistence
          : {
              save: async () => ({ oldContent: '' }),
              replace: async () => ({ oldContent: '' }),
            };
      this.memoryClient =
        deps?.memoryClient !== undefined
          ? deps.memoryClient
          : {
              extractAndSave: async () => null,
            };
      this.orchestrator = deps?.orchestrator ?? null;
      this.preflightService =
        deps?.preflightService ??
        ({
          preflight: async () => ({ valid: true, errors: [], warnings: [] }),
          getCurrentChapterContext: async () => ({
            previousChapterEnding: '',
            recentChaptersFullText: '',
          }),
        } satisfies NonNullable<ChapterWritingPipelineDeps['preflightService']>);
      this.contextAgent =
        deps?.contextAgent ??
        ({
          generateTaskBook: async () => ({
            success: false,
            error: 'forceStoryRuntime 未注入 contextAgent',
          }),
        } satisfies NonNullable<ChapterWritingPipelineDeps['contextAgent']>);
      this.plotOutlineClient = deps?.plotOutlineClient ?? null;
      this.foreshadowClient = deps?.foreshadowClient ?? null;
      return;
    }

    const projectStore = useProjectStore();
    const { requireAIService, currentModel } = useActiveAIProvider();

    // ====== 适配器（默认实现，可被 deps 覆盖） ======

    // drafter：把 StateDriven L3 拼好的 prompt 传给 AI service
    const drafter: DrafterClient = deps?.drafter ?? {
      async draft(prompt, params) {
        const client = requireAIService();
        const project = projectStore.currentProject;
        const currentChapter = projectStore.currentChapter;
        if (!project || !currentChapter) {
          throw new Error('项目或章节未加载');
        }
        if (params.signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const context: Record<string, unknown> = {
          projectId: project.id,
          currentChapterId: currentChapter.id,
          currentChapterIndex: currentChapter.orderIndex,
          currentChapterTitle: currentChapter.title,
          currentChapterContent: currentChapter.content || '',
          currentChapterOutline: currentChapter.outline || currentChapter.plotSummary || undefined,
          customPrompt: prompt,
          charactersInScene: project.characters || [],
          writingStyle: 'concise',
        };
        const result = await (client as any).continueWriting(
          context,
          'smartContinue',
          params.maxTokens || 3000,
          params.signal,
        );
        return result?.content ?? result?.text ?? (typeof result === 'string' ? result : '');
      },
    };

    // gitBackup：复用 GitBackupManager
    const gitBackup: GitBackupClient | null =
      deps?.gitBackup !== undefined
        ? deps.gitBackup
        : {
            async backup(chapter, content, title) {
              try {
                const mgr = new GitBackupManager();
                await mgr.backup(chapter, content, title);
              } catch (err) {
                console.warn('[Pipeline] Git 备份失败（不影响提交）:', err);
              }
            },
          };

    // 默认创建 persistence/memory（与 V2 同口径），调用方可显式传 null 关闭
    const persistence =
      deps?.persistence !== undefined ? deps.persistence : createChapterPersistenceClient();
    const memoryClient =
      deps?.memoryClient !== undefined ? deps.memoryClient : createChapterMemoryClient();
    this.persistence = persistence;
    this.memoryClient = memoryClient;

    // 优先使用注入的 orchestrator（V2 复用自己已配置好适配器的实例）；
    // 否则用上面的适配器创建新实例。
    this.orchestrator =
      deps?.orchestrator ??
      new StateDrivenWritingOrchestrator(drafter, gitBackup, persistence, memoryClient, {
        defaultModel: currentModel.value || 'gpt-4o',
        maxRetries: 3,
        // 降级链：统一 ChapterJudge，G5/G7 共用至多 1 次语义审查
        enableSemanticGate: true,
        chapterJudge: new AIChapterJudge(createStructuredAIFromActiveProvider()),
        enableGitBackup: true,
        enableRetrieval: true,
        retrievalTopK: 8,
      });

    this.preflightService = deps?.preflightService ?? usePreflightService();
    this.contextAgent = deps?.contextAgent ?? useEnhancedContextAgent();
    // 默认 plotOutlineClient：优先按稳定 chapterId 定位，旧项目再按章节序号兼容。
    // 调用方可注入 null 关闭、或注入自定义实现（harness 内存版）。
    this.plotOutlineClient =
      deps?.plotOutlineClient !== undefined
        ? deps.plotOutlineClient
        : {
            updateChapterTitle: async ({ chapterId, chapterNumber, title }) => {
              const chapterNodes = projectStore.plotOutline.filter(n => n.type === 'chapter');
              const node =
                chapterNodes.find(n => n.chapterId === chapterId) ??
                chapterNodes.find(n => n.orderIndex === chapterNumber - 1) ??
                chapterNodes[chapterNumber - 1];
              if (node) {
                await projectStore.updatePlotNode(node.id, { title });
              }
            },
          };
    // 默认 foreshadowClient：判官证据确认的回收经 store 落库（saveCurrentProject 持久化）；
    // markPlanted 处理大纲预埋伏笔的 planned → buried 流转（回填 actualPlantedChapter）。
    this.foreshadowClient =
      deps?.foreshadowClient !== undefined
        ? deps.foreshadowClient
        : {
            markResolved: async ids => {
              for (const id of ids) {
                const target = projectStore.foreshadows.find(f => f.id === id);
                if (target && target.status !== 'resolved') {
                  await projectStore.updateForeshadow(id, { status: 'resolved' });
                }
              }
            },
            markPlanted: async ({ ids, chapterNumber }) => {
              for (const id of ids) {
                const target = projectStore.foreshadows.find(f => f.id === id);
                if (target && target.status === 'planned') {
                  await projectStore.updateForeshadow(id, {
                    status: 'buried',
                    actualPlantedChapter: chapterNumber,
                    createdChapter: chapterNumber,
                  });
                }
              }
            },
          };
  }

  /** 暴露内部 orchestrator（供需要 initialize/indexExistingChapters 的场景使用） */
  getOrchestrator(): StateDrivenWritingOrchestrator {
    if (!this.orchestrator) {
      throw new Error('当前管道未配置 StateDriven orchestrator（forceStoryRuntime 模式）');
    }
    return this.orchestrator;
  }

  /**
   * 执行单章写作。
   */
  async execute(input: ChapterWriteInput): Promise<ChapterWriteOutput> {
    const {
      project,
      chapter,
      targetWordCount,
      writingStyle,
      useTaskBook = true,
      enablePreflight = false,
      enableSupplement = false,
      userInstructions: initialUserInstructions,
      windowedOutline,
      previousChapter,
      signal,
    } = input;
    // 任务书失败降级时会把「无合同裸写」的系统提示并入写作指令（两条执行路径共用）
    let userInstructions = initialUserInstructions;

    try {
      throwIfAborted(signal);

      // ====== Step 0: 预检（可选） ======
      if (enablePreflight) {
        const result = await this.preflightService.preflight();
        if (!result.valid) {
          return this.fail(`预检失败: ${result.errors.join(', ')}`);
        }
      }

      throwIfAborted(signal);

      // ====== Step 1: 生成任务书 ======
      let taskBook: WritingTaskBook | null = null;
      if (useTaskBook) {
        const ctx = await this.preflightService.getCurrentChapterContext();
        const previousChapterEnding = previousChapter?.ending || ctx?.previousChapterEnding || '';
        const recentChaptersFullText = ctx?.recentChaptersFullText || '';

        const tbResult = await this.contextAgent.generateTaskBook({
          chapterNumber: chapter.orderIndex + 1,
          previousChapterEnding,
          recentChaptersFullText,
          targetWordCount,
          writingStyle: writingStyle as any,
        });

        if (tbResult.success && tbResult.taskBook) {
          taskBook = tbResult.taskBook;
        } else {
          // 任务书失败不中断，降级为无任务书写作；但必须把降级事实并入写作指令，
          // 让两条执行路径都看到「本章是无合同裸写」（此前只有 console.warn，
          // 履约失败归因时会误把无合同的失败当成蓝图质量问题）。
          const reason = tbResult.error ?? '未知原因';
          console.warn('[Pipeline] 任务书生成失败，降级为无任务书:', reason);
          userInstructions =
            `${userInstructions ?? ''}\n【系统提示】本章写作任务书生成失败（${reason.slice(0, 80)}），已降级为按大纲直接写作，不得臆造必出事件。`.trim();
        }
      }

      throwIfAborted(signal);

      if (this.hasStoryRuntime()) {
        return this.executeLongFormRuntime(input, taskBook);
      }

      if (!this.orchestrator) {
        return this.fail('storyRuntime 不可用，且未配置 StateDriven orchestrator');
      }

      // ====== Step 2: 任务书 → StateDriven options 转换 ======
      const currentChapterOutline = chapter.outline || chapter.plotSummary || '';
      // 始终注入排版硬约束；有任务书时追加任务书段落
      const writingRules = this.buildWritingRules(taskBook);
      const blueprint = taskBook
        ? {
            mustCover: taskBook.mustCover,
            forbiddenZones: taskBook.forbiddenZones,
            requiredCharacters: taskBook.CPNs,
            cen: taskBook.CEN,
          }
        : undefined;

      // ====== Step 3: 初始化 orchestrator（幂等） ======
      await this.orchestrator.initialize(project);

      throwIfAborted(signal);

      // ====== Step 4: 执行写作（L1-L7 闭环） ======
      const result: WriteChapterResult = await this.orchestrator.writeChapter(
        project,
        chapter,
        targetWordCount,
        {
          currentChapterOutline,
          windowedOutline,
          writingRules,
          blueprint,
          previousChapter,
          userInstructions,
          signal,
        }
      );

      if (!result.success || !result.gateResult?.passed) {
        const gateErrorMsg = result.error || '严格门禁未通过，章节未提交';
        const gateClassified = classifyError(gateErrorMsg);
        return {
          success: false,
          prose: result.prose || '',
          title: this.readBackTitle(chapter.id),
          taskBook,
          gateResult: result.gateResult,
          attempts: result.attempts,
          forceAccepted: false,
          supplementRounds: 0,
          error: gateErrorMsg,
          errorKind: gateClassified.kind,
          retryable: gateClassified.retryable,
        };
      }

      // ====== Step 5: 字数不足时补写（可选） ======
      let prose = result.prose;
      let supplementRounds = 0;

      if (enableSupplement && prose) {
        throwIfAborted(signal);
        const supplementResult = await this.runSupplementIfNeeded(
          project,
          chapter,
          prose,
          targetWordCount,
          writingStyle,
          blueprint,
          signal,
        );
        prose = supplementResult.prose;
        supplementRounds = supplementResult.rounds;
        if (supplementResult.error) {
          const supplementClassified = classifyError(supplementResult.error);
          return {
            success: false,
            prose,
            title: this.readBackTitle(chapter.id),
            taskBook,
            gateResult: result.gateResult,
            attempts: result.attempts,
            forceAccepted: false,
            supplementRounds,
            error: supplementResult.error,
            errorKind: supplementClassified.kind,
            retryable: supplementClassified.retryable,
          };
        }
      }

      // ====== Step 6: 结果归一化（剥离结构化泄漏 → 确定性去重 → 轻量排版，不改写叙述） ======
      return {
        success: true,
        prose: dedupProse(sanitizeStructuredProseLeakage(prose)),
        title: this.readBackTitle(chapter.id),
        taskBook,
        gateResult: result.gateResult,
        attempts: result.attempts,
        forceAccepted: false,
        supplementRounds,
        error: result.error,
      };
    } catch (err) {
      if (isAbortError(err) || signal?.aborted) {
        return this.fail('Generation stopped by user', { err, signal: signal ?? undefined });
      }
      throw err;
    }
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  private hasStoryRuntime(): boolean {
    if (this.forceStoryRuntime) return true;
    if (this.storyRuntimeClient || this.storyRuntimeApi) return true;
    return (
      typeof window !== 'undefined' &&
      Boolean(window.electronAPI?.storyRuntime?.bootstrap)
    );
  }

  /**
   * 带会话级缓存的幂等 bootstrap。
   * 批量写 N 章时 migrate+bootstrap 每章全量重跑，同一份近乎不变的
   * bootstrap 被序列化/IPC 传输 N 次；指纹未变时跳过重复下发。
   *
   * 缓存按 runtime 实例隔离（WeakMap）：换 runtime（测试 harness 的内存
   * 实例、应用重启）自然失效，不存在「新库没灌种子」的风险；同一实例
   * 上静态设定变化（用户改人设/伏笔/大纲）时指纹变化自动重灌。
   * 失败不记指纹，下一章重试完整 bootstrap。
   */
  private async bootstrapWithCache(
    projectId: string,
    bootstrap: Awaited<ReturnType<LegacyProjectMigrator['migrate']>>,
    runtime: StoryRuntimeClient
  ): Promise<void> {
    const fingerprint = computeBootstrapFingerprint(
      bootstrap as unknown as Parameters<typeof computeBootstrapFingerprint>[0]
    );
    let projectCache = bootstrapFingerprints.get(runtime);
    if (!projectCache) {
      projectCache = new Map();
      bootstrapFingerprints.set(runtime, projectCache);
    }
    if (projectCache.get(projectId) === fingerprint) return;
    await runtime.bootstrap(bootstrap);
    projectCache.set(projectId, fingerprint);
  }

  private resolveStoryRuntimeApi(): StoryRuntimeAPI {
    if (this.storyRuntimeApi) return this.storyRuntimeApi;
    if (typeof window !== 'undefined' && window.electronAPI?.storyRuntime) {
      return window.electronAPI.storyRuntime;
    }
    throw new Error('window.electronAPI.storyRuntime 未注册');
  }

  /**
   * 新长篇主链：迁移/幂等 bootstrap → 合同 → 场景 DAG → 独立事实提取
   * → 严格连续性校验 → SQLite accepted commit。
   */
  private async executeLongFormRuntime(
    input: ChapterWriteInput,
    taskBook: WritingTaskBook | null
  ): Promise<ChapterWriteOutput> {
    const migrator = new LegacyProjectMigrator();
    const bootstrap = migrator.migrate(
      input.project as unknown as Parameters<LegacyProjectMigrator['migrate']>[0]
    );
    const api = this.resolveStoryRuntimeApi();
    const runtime = this.storyRuntimeClient ?? new StoryRuntimeClient(api);

    try {
      await this.bootstrapWithCache(input.project.id, bootstrap, runtime);
      const loadedState = await runtime.loadState(input.project.id);
      const chapterNumber = input.chapter.orderIndex + 1;
      const isEmptyRewrite = !input.chapter.content.trim();
      // 清空正文后重写：剥离本章及之后的旧 accepted 事件，避免 stale runtime 污染起草 prompt
      let state = isEmptyRewrite
        ? stripStateForChapterRewrite(loadedState, chapterNumber)
        : loadedState;
      if (state.chapter >= chapterNumber && !isEmptyRewrite) {
        throw new Error(`第 ${chapterNumber} 章已有 accepted 状态，请使用章节重写流程`);
      }
      // 命运级状态接线（陈旧度门禁的数据源）：runtime 状态库自身从不产生
      // attributes.status，把章节记忆里收集的角色命运终态映射到实体上，
      // contractHealth.healChapterContract 的终态节点裁剪由此有据可裁。
      // 不落 SQLite（每章从记忆重推导），仅作用于本章的校验/健康度视图。
      const fateOverlay = overlayCharacterFates(
        state.entities,
        input.project.chapterMemories ?? [],
      );
      if (fateOverlay.applied > 0) state.entities = fateOverlay.entities;

      const volume = input.project.volumes.find(item => item.id === input.chapter.volumeId);
      const volumePlan = input.project.metadata?.volumePlans?.find(
        item => item.volumeIndex === (volume?.orderIndex ?? 0)
      );
      // 剥离 outline 末尾的「--- 结构化节点 ---」块：建章时把 CBN/CPNs/CEN 拼进了 outline，
      // 但结构化节点已通过 outlineNode 的独立字段传递，outline 里那份会让 goal/description
      // 变成一大段结构化节点，污染 scene-draft 合同语义。
      const cleanOutline = stripStructuredNodeBlock(input.chapter.outline || '');
      const chapterFulfillmentText = [
        taskBook?.CBN,
        ...(taskBook?.CPNs ?? []),
        taskBook?.CEN,
        ...(taskBook?.mustCover ?? []),
      ]
        .filter(Boolean)
        .join('\n');
      const chapterContractText = [cleanOutline, input.chapter.plotSummary, chapterFulfillmentText]
        .filter(Boolean)
        .join('\n');
      const characterConstraints = resolveAllowedChapterCharacters({
        project: input.project,
        chapterNumber,
        chapterText: chapterContractText,
        fulfillmentText: chapterFulfillmentText,
      });
      const outlineNode = {
        id: input.chapter.id,
        title: input.chapter.title,
        description: cleanOutline || input.chapter.plotSummary || '',
        chapterId: input.chapter.id,
        keyEvents: taskBook?.mustCover ?? [],
        CBN: taskBook?.CBN,
        CPNs: taskBook?.CPNs,
        CEN: taskBook?.CEN,
        mustCover: taskBook?.mustCover,
        forbiddenZones: taskBook?.forbiddenZones,
      };
      const contracts = new ContractPackBuilder().build({
        bootstrap,
        volume: {
          number: (volume?.orderIndex ?? 0) + 1,
          id: volume?.id,
          title: volume?.name ?? '正文卷',
          objective: volumePlan?.objective ?? volume?.summary ?? input.project.description,
          conflict: volumePlan?.coreConflict ?? input.project.conflictDesign?.source ?? '',
          requiredPayoffs: volumePlan?.payoffForeshadows ?? [],
          forbidden: taskBook?.forbiddenZones ?? [],
        },
        chapter: {
          number: chapterNumber,
          id: input.chapter.id,
          title: input.chapter.title,
          goal: cleanOutline || input.chapter.plotSummary || input.chapter.title,
          outlineNode,
          allowedCharacterNames: characterConstraints.allowedNames,
          futureReveals: [
            ...characterConstraints.futureReveals,
            ...(input.project.foreshadows ?? [])
              .map(foreshadow => ({
                // payoffChapter 是“回收时点”，不能拿来禁止伏笔在前文埋设；
                // 只有 setupChapter 才表示该线索在此之前不应出现。
                description: `伏笔尚未到埋设时点：${foreshadow.hint}`,
                notBeforeChapter: foreshadow.setupChapter ?? 0,
              }))
              .filter(item => item.notBeforeChapter > chapterNumber),
          ],
        },
        style: [
          input.writingStyle,
          `目标约 ${input.targetWordCount} 字，按场景分配篇幅`,
          TYPESETTING_HARD_RULES,
          ...(taskBook?.styleGuidance?.reasoning ?? []),
          input.userInstructions ?? '',
        ],
        forbidden: taskBook?.forbiddenZones ?? [],
      });
      const query =
        taskBook?.CPNs.join(' ') ||
        cleanOutline ||
        input.chapter.plotSummary ||
        input.chapter.title;
      const entityIds = [...bootstrap.entities, ...bootstrap.rules, ...bootstrap.foreshadows]
        .filter(entity => query.includes(entity.name) || entity.aliases.some(alias => query.includes(alias)))
        .map(entity => entity.id);
      const retrievedScenes = await new GroundedRetriever(api).retrieve({
        projectId: input.project.id,
        query,
        entityIds,
        currentChapter: chapterNumber,
        topK: 8,
      });
      const recentScenes = selectRecentScenesByChapter(
        bootstrap.sceneChunks,
        chapterNumber,
        3
      );
      const ai: StructuredAI =
        this.structuredAI ?? createStructuredAIFromActiveProvider(input.signal);
      // Agent 检索回合组装（docs/agent-loop-refactor.md §8）：注入 transport 或
      // 环境开关开启时挂上 research step；缺省完全不挂，引擎行为与旧版一致。
      const agentTransport =
        this.agentResearchTransport ??
        (isAgentResearchEnvEnabled()
          ? createAgentLoopTransportFromActiveProvider(input.signal)
          : undefined);
      let researchStep: AgentResearchStep | undefined;
      if (agentTransport) {
        const recordingTransport =
          agentTransport instanceof RecordingAgentLoopTransport
            ? agentTransport
            : shouldEnableAiTrace()
              ? new RecordingAgentLoopTransport(agentTransport, {
                  runId: `longform-agent-${Date.now()}`,
                  persist: true,
                })
              : undefined;
        const effectiveTransport = recordingTransport ?? agentTransport;
        const foreshadowCatalog = (input.project.foreshadows ?? []).map(foreshadow => ({
          id: foreshadow.id,
          hint: foreshadow.hint,
          status: foreshadow.status,
          setupChapter: foreshadow.setupChapter,
          payoffChapter: foreshadow.payoffChapter ?? foreshadow.suggestedResolutionChapter,
        }));
        const searchPort = {
          search: (query: string, limit: number, beforeChapter?: number) =>
            runtime.searchScenes(input.project.id, query, limit, beforeChapter),
        };
        researchStep = {
          async research(stepInput) {
            const toolkit = new BookToolkit({
              chapterNumber: stepInput.chapterNumber,
              contracts: stepInput.contracts,
              state: stepInput.state,
              sceneChunks: stepInput.sceneChunks,
              foreshadowCatalog,
              searchPort,
            });
            const result = await new AgentLoopRunner(effectiveTransport, toolkit).research({
              ...stepInput,
              foreshadowCatalog,
              searchPort,
            });
            recordingTransport?.recordSummary({
              chapterNumber: stepInput.chapterNumber,
              finishReason: result.finishReason,
              transcript: result.transcript,
              stats: result.dossier.stats,
            });
            return result.dossier;
          },
        };
      }
      const engine = new LongFormWritingEngine({
        ai,
        factExtractor: new AIFactExtractor(ai),
        commitPort: runtime,
        ...(researchStep ? { research: researchStep } : {}),
      });
      throwIfAborted(input.signal);
      const result = await engine.write({
        projectId: input.project.id,
        contracts,
        state,
        recentScenes,
        retrievedScenes,
        sceneChunks: bootstrap.sceneChunks,
        styleGuidance: contracts.master.style,
        maxContextTokens: 24_000,
        targetWordCount: input.targetWordCount,
        seedRevisionHints: input.seedRevisionHints,
        maxRewriteRounds: input.maxRewriteRounds,
        // 上章结尾仲裁：批量链路构造的 previousChapter.ending 此前只喂任务书生成,
        // 不进起草 prompt;CBN 与上章正文事实冲突时模型无从对照(花海怒放被回退成含苞)。
        previousChapterEnding: input.previousChapter?.ending || '',
        // 未回收伏笔的判官候选，口径见 buildPayoffCandidates（已到埋设点，非回收时点）
        payoffCandidates: buildPayoffCandidates(input.project.foreshadows, chapterNumber),
      });
      // coerce 已清洗段落；出口兜底：剥 schema 残留 → 确定性去重（治章末台词重复）→ 排版归一化
      // dedupProse 内部已含 normalizeWebnovelParagraphs，无需外层再调
      const prose = dedupProse(
        sanitizeStructuredProseLeakage(
          result.drafts.flatMap(scene => scene.paragraphs).join('\n\n')
        )
      );
      const gateResult = this.toGateResult(result.report);
      const generatedShortTitle =
        result.drafts.map(d => d.chapterTitle?.trim()).find(Boolean) ?? null;
      const shouldApplyGeneratedTitle =
        Boolean(generatedShortTitle) && isPlaceholderChapterTitle(input.chapter.title);

      if (result.commit.status !== 'accepted' || !result.receipt) {
        const commitErrorMsg = result.commit.reasons.join('；') || '严格连续性门禁未通过';
        const commitClassified = classifyError(commitErrorMsg);
        return {
          success: false,
          prose,
          title: shouldApplyGeneratedTitle
            ? `第${chapterNumber}章 ${generatedShortTitle}`
            : this.readBackTitle(input.chapter.id) ?? input.chapter.title ?? null,
          taskBook,
          gateResult,
          attempts: 1,
          forceAccepted: false,
          supplementRounds: 0,
          error: commitErrorMsg,
          errorKind: commitClassified.kind,
          retryable: commitClassified.retryable,
          longFormResult: result,
        };
      }

      // electron-store 仅作为 UI 投影；canonical commit 已由 SQLite 原子写入。
      // 字数补齐已在 LongFormWritingEngine 提交前完成。
      // 占位标题时把「第N章 短标题」拼到正文头，经 persistence 提取落库（正文不含标题行）。
      let summaryProjectionError: unknown = null;
      let memoryProjectionError: unknown = null;
      try {
        if (this.persistence?.replace) {
          const contentForPersist =
            shouldApplyGeneratedTitle && generatedShortTitle
              ? prependTitleLineForPersist(chapterNumber, generatedShortTitle, prose)
              : prose;
          await this.persistence.replace(input.chapter.id, contentForPersist);
        }
        // 回写 plotOutline 章节节点标题：落库的 Chapter.title 已是短标题，
        // 但 plotOutline 中 type==='chapter' 节点的 title 仍是创建时的占位（第N章）。
        // 同步回写让目录页显示真实标题（仅占位时改，用户手改的标题不覆盖）。
        if (shouldApplyGeneratedTitle && generatedShortTitle && this.plotOutlineClient) {
          await this.plotOutlineClient.updateChapterTitle({
            chapterId: input.chapter.id,
            chapterNumber,
            title: generatedShortTitle,
          });
        }
      } catch (error) {
        summaryProjectionError = error;
        console.warn('[Pipeline] accepted commit 的 UI 投影失败，可由 outbox 重放:', error);
      }

      // 记忆属于 accepted commit 的持久化投影，必须等待完成后再确认 outbox。
      // 它不改变 canonical commit 的成功状态；失败会留在 outbox，供健康检查和后续重试发现。
      // AI 提取的状态 delta（命运宣告必出账，契约 7-10）随投影穿透进章记忆——
      // 章记忆是状态摘要/禁入名单/台账驱动 triage 的唯一读模型，规则提取不产命运账（2026-09-02）。
      const aiStateChanges = mapStatusDeltasToStateChanges(result.facts, state);
      try {
        await this.memoryClient?.extractAndSave(input.chapter.id, chapterNumber, prose, aiStateChanges);
      } catch (error) {
        memoryProjectionError = error;
        console.warn('[Pipeline] accepted commit 的记忆投影失败，可由 outbox 重放:', error);
      }

      // 伏笔回收流转（accepted commit 的状态投影）：判官在 G5/G7 证据确认的回收
      // 落到项目伏笔表 buried/hinted → resolved。此前仅测试 harness 手动消费该字段，
      // 生产链路无消费方导致真实批量写作后伏笔永远 buried、完结判断读数恒偏高。
      // 失败只记 warning，不改变本章提交结果（下一章判官仍会带出该候选）。
      const resolvedIds = result.report.resolvedForeshadowIds ?? [];
      if (resolvedIds.length > 0 && this.foreshadowClient) {
        try {
          await this.foreshadowClient.markResolved(resolvedIds);
        } catch (error) {
          console.warn(
            `[Pipeline] 伏笔回收流转失败（${resolvedIds.length} 条，不影响本章提交）:`,
            error,
          );
        }
      }

      // 埋设流转（accepted commit 的状态投影）：大纲预埋伏笔（planned）在本章
      // 到达规划埋设点、且本章蓝图确实承载该线索（实体词共现，见
      // detectPlannedForeshadowings 标定注释）时，转 buried 并回填
      // actualPlantedChapter。确定性检测（非判官），失败只记 warning。
      const plantedIds = this.detectPlannedForeshadowings({
        foreshadows: input.project.foreshadows ?? [],
        chapterNumber,
        chapterOutline: mergeChapterBlueprintText(taskBook, input.chapter),
        characterNames: (input.project.characters ?? []).map(c => c.name),
      });
      if (plantedIds.length > 0 && this.foreshadowClient?.markPlanted) {
        try {
          await this.foreshadowClient.markPlanted({ ids: plantedIds, chapterNumber });
        } catch (error) {
          console.warn(
            `[Pipeline] 伏笔埋设流转失败（${plantedIds.length} 条，不影响本章提交）:`,
            error,
          );
        }
      }

      for (const item of result.receipt.projectionOutbox ?? []) {
        const projectionError =
          item.projectionType === 'memory' ? memoryProjectionError : summaryProjectionError;
        try {
          await api.completeOutbox({
            projectId: input.project.id,
            outboxId: item.id,
            success: projectionError === null,
            ...(projectionError === null
              ? {}
              : {
                  error:
                    projectionError instanceof Error
                      ? projectionError.message
                      : String(projectionError),
                }),
          });
        } catch (error) {
          console.warn(`[Pipeline] outbox #${item.id} 确认失败:`, error);
        }
      }
      return {
        success: true,
        prose,
        title:
          this.readBackTitle(input.chapter.id) ??
          (shouldApplyGeneratedTitle && generatedShortTitle
            ? `第${chapterNumber}章 ${generatedShortTitle}`
            : input.chapter.title ?? null),
        taskBook,
        gateResult,
        attempts: 1,
        forceAccepted: false,
        supplementRounds: 0,
        longFormResult: result,
      };
    } catch (error) {
      if (isAbortError(error) || input.signal?.aborted) {
        return {
          ...this.fail('Generation stopped by user', { err: error, signal: input.signal ?? undefined }),
          taskBook,
        };
      }
      return {
        ...this.fail(error instanceof Error ? error.message : '长篇运行时执行失败', { err: error }),
        taskBook,
      };
    }
  }

  static parseStructuredJson(raw: string, schemaName?: string): unknown {
    const trimmed = raw.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
    const parsed = robustJsonParse(trimmed, { expectedType: 'object', enableCompletion: true });
    if (parsed.success && parsed.data !== undefined) {
      return parsed.data;
    }
    const asArray = robustJsonParse(trimmed, { expectedType: 'array', enableCompletion: true });
    if (asArray.success && asArray.data !== undefined) {
      return asArray.data;
    }
    if (
      schemaName === 'SupplementParagraphs' &&
      trimmed.length >= 20 &&
      !/^[{[]/u.test(trimmed) &&
      !/^```/u.test(trimmed)
    ) {
      return {
        paragraphs: trimmed
          .split(/\n+/u)
          .map(item => item.trim())
          .filter(Boolean),
      };
    }
    const detail = parsed.warnings?.slice(-2).join('；') || asArray.warnings?.slice(-2).join('；');
    // 附上 AI 原始返回片段，便于定位补字等场景的模型输出（trace 记录 error.message）。
    // 剥离控制字符，避免模型输出中的换行/转义注入日志或 UI。
    const rawSnippet = `\n--- AI 原始返回（前 300 字）---\n${trimmed
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
      .slice(0, 300)}`;
    throw new Error(
      (detail
        ? `AI 返回的结构化 JSON 无法解析：${detail}`
        : 'AI 未返回可解析的结构化 JSON') + rawSnippet
    );
  }

  private toGateResult(report: ContinuityReport): GatePipelineResult {
    const category = (domain: ContinuityDomain): GateIssue['category'] => {
      if (domain === 'entity') return 'entity';
      if (domain === 'fulfillment') return 'blueprint';
      if (domain === 'evidence') return 'protocol';
      if (domain === 'causality') return 'semantic';
      return 'consistency';
    };
    const allIssues: GateIssue[] = report.issues.map(issue => ({
      category: category(issue.domain),
      severity: issue.severity === 'blocking' ? 'critical' : 'medium',
      location: issue.sceneId ?? '章节',
      description: issue.message,
      evidence: issue.evidence.join('；'),
      autoFixable: false,
    }));
    const blockingCount = allIssues.filter(issue => issue.severity === 'critical').length;
    const passed = report.accepted && blockingCount === 0;
    return {
      passed,
      hasBlocking: blockingCount > 0,
      blockingCount,
      highCount: 0,
      totalIssues: allIssues.length,
      gates: [
        {
          gateId: 'G7',
          gateName: 'Story Runtime 连续性门禁',
          passed,
          issues: allIssues,
          durationMs: 0,
        },
      ],
      allIssues,
      decision: {
        shouldBlock: !passed,
        reason: passed ? '全部连续性约束通过' : '存在阻断级连续性问题',
        canAutoFix: false,
        nextAction: passed ? 'accept' : 'manual_review',
      },
      totalDurationMs: 0,
    };
  }

  /**
   * 字数不足时循环补写；增量通过 persistence 追加落库（与主写同口径）。
   */
  private async runSupplementIfNeeded(
    project: Project,
    chapter: Chapter,
    prose: string,
    targetWordCount: number,
    writingStyle: WritingStyle,
    blueprint?: GateContext['blueprint'],
    signal?: AbortSignal,
  ): Promise<{ prose: string; rounds: number; error?: string }> {
    const { requireAIService } = useActiveAIProvider();

    return runSupplementRounds({
      prose,
      targetWordCount,
      chapterTitle: chapter.title,
      chapterOutline: chapter.outline || chapter.plotSummary || '',
      signal,
      drafter: {
        async draft(prompt, maxTokens) {
          throwIfAborted(signal);
          const client = requireAIService();
          // 补写必须清空 currentChapterOutline，避免走「按大纲整章重写」分支
          const context: Record<string, unknown> = {
            project,
            currentChapterId: chapter.id,
            currentChapterIndex: chapter.orderIndex,
            currentChapterTitle: chapter.title,
            currentChapterContent: '',
            currentChapterOutline: undefined,
            customPrompt: prompt,
            charactersInScene: project.characters || [],
            writingStyle,
          };
          const result = await (client as any).continueWriting(
            context,
            'smartContinue',
            maxTokens,
            signal,
          );
          return result?.content ?? result?.text ?? (typeof result === 'string' ? result : '');
        },
      },
      validateRound: async (_round, _delta, fullProse) => {
        throwIfAborted(signal);
        const orchestrator = this.orchestrator;
        if (!orchestrator) {
          return '续写校验器未初始化';
        }
        const validation = await orchestrator.validateSupplement(
          fullProse,
          chapter,
          blueprint,
        );
        const crashedGate = validation.gates.find(gate => gate.error);
        if (crashedGate) {
          return `${crashedGate.gateId} ${crashedGate.gateName}执行异常：${crashedGate.error}`;
        }
        return validation.passed ? null : validation.decision.reason;
      },
      onRound: async (_round, delta) => {
        if (!this.persistence) {
          throw new Error('未配置章节持久化，无法安全保存补写内容');
        }
        if (delta) {
          await this.persistence.save(chapter.id, delta);
        }
      },
    });
  }

  /**
   * 把任务书转换为写作规则文本（注入 prompt）。
   * 始终含排版硬约束；有任务书时追加。
   */
  private buildWritingRules(book: WritingTaskBook | null): string {
    if (!book) {
      return buildWritingRulesWithTypesetting(null);
    }
    const taskBookSection = `
=== 写作任务书 ===
【CBN】${book.CBN}
【CPNs】${book.CPNs.join(' / ')}
【CEN】${book.CEN}
【必须覆盖】${book.mustCover.join(' / ')}
【禁区】${book.forbiddenZones.join(' / ')}
【风格指引】${book.styleGuidance?.reasoning?.join(' / ') || ''}
【结尾感觉】${book.hardConstraints?.chapterEndOpenQuestion || '留下悬念'}
【开放问题】${book.hardConstraints?.chapterEndOpenQuestion || '留下悬念'}
=== 任务书结束 ===
`;
    return buildWritingRulesWithTypesetting(taskBookSection);
  }

  /**
   * 从 store 读回 persistence 适配器写入的标题。
   * persistence 适配器用 DeAIService.extractAndValidateTitle 提取标题后写入 chapter.title。
   */
  private readBackTitle(chapterId: string): string | null {
    if (this.forceStoryRuntime) return null;
    try {
      const projectStore = useProjectStore();
      const ch = projectStore.sortedChapters.find(c => c.id === chapterId);
      return ch?.title || null;
    } catch {
      return null;
    }
  }

  /**
   * 检测本章应确认埋设的 planned 伏笔。
   *
   * 规划埋设点（setupChapter）到达且本章确实承载该线索时确认：
   * 到点但正文没写 → 不确认（交给下一章重试，避免空挂 buried）；
   * 未到点但正文提前出现（模型抢跑埋设）→ 也确认，记录实际章号。
   *
   * 迹象判定用实体词共现（真实冒烟标定：hint 是整段长句，正文常换措辞，
   * 「密押暗记」写成「密押票」，整段 includes 必 miss；字符 bigram 比率
   * 又被主角名等高频词淹没）。方案：hint 的 2 字滑窗词（剔除角色名片段）
   * 与【章大纲】共现 ≥5 判定。标定数据：埋设章 8 分 vs 邻章 0-3 分，
   * 信噪比 4:1；用大纲而非正文做锚——大纲 CPN 与伏笔规划同源（拆章时
   * 从伏笔 hint 派生），换措辞率远低于正文。
   */
  private detectPlannedForeshadowings(
    input: {
      foreshadows: Array<{ id: string; hint: string; status: string; setupChapter?: number; createdChapter?: number }>;
      chapterNumber: number;
      chapterOutline: string;
      characterNames: string[];
    }
  ): string[] {
    const { foreshadows, chapterNumber, chapterOutline, characterNames } = input;
    const planned = foreshadows.filter(
      f =>
        f.status === 'planned' &&
        (f.setupChapter ?? f.createdChapter ?? 0) <= chapterNumber + 1
    );
    if (planned.length === 0 || !chapterOutline.trim()) return [];

    const nameTerms = new Set(
      characterNames.flatMap(name => {
        const chars = [...name];
        return chars.map((_, i) => name.slice(i, i + 2)).filter(t => t.length === 2);
      })
    );
    const sharedCount = (hint: string): number => {
      const chars = [...hint.matchAll(/[\u4e00-\u9fff]/gu)].map(m => m[0]).join('');
      let hits = 0;
      const seen = new Set<string>();
      for (let i = 0; i < chars.length - 1; i += 1) {
        const term = chars.slice(i, i + 2);
        if (seen.has(term)) continue;
        seen.add(term);
        if (nameTerms.has(term)) continue;
        if (chapterOutline.includes(term)) hits += 1;
      }
      return hits;
    };

    return planned.filter(f => sharedCount(f.hint) >= 5).map(f => f.id);
  }

  /**
   * 构造失败输出。可选传入原始 error / signal 以便正确识别 aborted（用户主动取消）。
   * abort 场景下 message 常为"Generation stopped by user"，不含网络关键词，
   * 需靠 signal.aborted 或原始 error 的 AbortError 类型才能正确归类。
   */
  private fail(error: string, cause?: { err?: unknown; signal?: AbortSignal }): ChapterWriteOutput {
    const classified = cause
      ? classifyError(cause.err ?? error, cause.signal)
      : classifyError(error);
    return {
      success: false,
      prose: '',
      title: null,
      taskBook: null,
      gateResult: null,
      attempts: 0,
      forceAccepted: false,
      supplementRounds: 0,
      error,
      errorKind: classified.kind,
      retryable: classified.retryable,
    };
  }
}

/**
 * 未回收伏笔的判官回收候选。口径是「已到埋设点」而非「已到回收时点」：
 * 模型会按剧情需要提前兑现线索（r9 实证：payoff=110 的锦缎密账在 ch99 被正文
 * 完整回收，回收时点过滤让判官永远看不到候选，台账永远 planned 误报烂尾）。
 * 埋设点已过的线索理论上可出现在正文任意处，回收判定交判官「宁缺勿滥」护栏兜底。
 */
export function buildPayoffCandidates(
  foreshadows:
    | Array<{ id: string; hint: string; status: string; setupChapter?: number; createdChapter?: number }>
    | undefined,
  chapterNumber: number
): Array<{ id: string; hint: string }> {
  return (foreshadows ?? [])
    .filter(
      foreshadow =>
        foreshadow.status !== 'resolved' &&
        (foreshadow.setupChapter ?? foreshadow.createdChapter ?? 0) <= chapterNumber,
    )
    .map(foreshadow => ({ id: foreshadow.id, hint: foreshadow.hint }));
}

/**
 * 埋设检测的共现文本源：taskBook 履约蓝图（CBN/CPNs/CEN/mustCover）优先，
 * 章表 outline/plotSummary 兜底。批量续写时章表 outline 是「滚动续写槽位」
 * 占位（r9 实证仅 34 字），只用它做词面共现则 planned→buried 永不触发。
 */
export function mergeChapterBlueprintText(
  taskBook: { CBN?: string; CPNs?: string[]; CEN?: string; mustCover?: string[] } | null | undefined,
  chapter: { outline?: string; plotSummary?: string } | null | undefined
): string {
  return [
    taskBook?.CBN,
    ...(taskBook?.CPNs ?? []),
    taskBook?.CEN,
    ...(taskBook?.mustCover ?? []),
    chapter?.outline ?? '',
    chapter?.plotSummary ?? '',
  ]
    .filter(Boolean)
    .join('\n');
}

// ============================================================
// 工厂（composable 友好）
// ============================================================

export function useChapterWritingPipeline(
  deps?: ConstructorParameters<typeof ChapterWritingPipeline>[0]
) {
  return new ChapterWritingPipeline(deps);
}

/**
 * AI 事实提取的 attributes.status delta → 章记忆状态变化条目。
 * 命运账的唯一来源（规则词表塔已退役）；evidence 即台账证据句。
 */
function mapStatusDeltasToStateChanges(
  facts: LongFormWriteResult['facts'],
  state: StoryState,
): CharacterStateChange[] {
  const out: CharacterStateChange[] = [];
  for (const delta of facts?.deltas ?? []) {
    const path = String(delta?.path || '');
    if (!path.endsWith('.attributes.status')) continue;
    const entityId = path.split('.')[1] ?? '';
    const entity = state?.entities?.[entityId];
    const name = String(entity?.name || entityId).trim();
    if (!name) continue;
    const value = String((delta as { value?: unknown }).value ?? '').trim();
    if (!value) continue;
    out.push({
      characterName: name,
      stateType: 'status',
      state: value,
      detail: String(
        Array.isArray((delta as { evidence?: unknown }).evidence)
          ? ((delta as { evidence?: string[] }).evidence ?? []).join(' ')
          : (delta as { evidence?: string }).evidence ?? '',
      ).slice(0, 160),
    });
  }
  return out;
}

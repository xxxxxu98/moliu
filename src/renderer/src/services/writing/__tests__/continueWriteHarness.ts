/**
 * 续写 harness：与真实 App 路径对齐（useBatchWriter / WritingOrchestratorV2）
 *
 * 对齐点（batch 多章，与 useBatchWriter.startBatchWriting 同语义）：
 * - 单章执行：ChapterWritingPipeline.execute + BATCH_CONTINUE_PRESET
 *   （useTaskBook=true / enablePreflight=false / enableSupplement=true）
 * - 正式长篇路径：forceStoryRuntime=true ↔ App hasStoryRuntime()=true → LongFormWritingEngine
 * - 前章衔接：ContextManager 提取 previousChapter（title/summary/ending）
 * - 持久化：createChapterPersistenceClient（落 Pinia store）
 * - 失败策略：错误分级重试（对齐 useBatchWriter.startBatchWriting）
 *   · 瞬态错误（网络/超时/截断/5xx/429）：maxRetries=5 次，backoffDelayMs 退避（4/8/16/30/30s）
 *   · 持久错误（schema/审核/字数/auth/4xx）：立即重试 3 次（不退避，模型带 revisionHints 换写法）
 *   · 用户停止（aborted）：立即停整批
 *   · 重试耗尽（无论持久/瞬态）：记录失败章后结束整批（质量优先，不再跳过继续）
 * - 写作风格：batch 默认 'humorous'（App 批量 UI 默认值）
 * - 停止信号：signal 透传 pipeline.execute（对齐 abortController.signal）
 * - 记忆提取：enableMemoryExtract=true 时启用 createChapterMemoryClient
 *
 * 残留差异（有意，冒烟环境约束）：
 * - 循环控制不复刻：真实从第一个空章节开始 / 跳过已有内容 / 无空章节自动建章 /
 *   完结判断 / 暂停恢复 —— 均为 UI 交互面；冒烟以「清空全部章节 + ensureLocalChapterSlots 预补槽」等价替代
 * - 每章重新 hydrate Pinia 并新建 pipeline 实例；LongForm 路径无跨章状态，行为等价
 * - AI 来自 temp 配置文件而非 active provider，且包 RecordingStructuredAI 录制轨迹
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type {
  FactExtractor,
  JsonValue,
  StructuredAI,
  StructuredAIRequest,
} from '@/types/story-runtime';
import type { Chapter, Project } from '@/types/project';
import type { WritingTaskBook } from '@/types/writing-v2';

import { ContractPackBuilder } from '@/services/story-runtime/ContractPackBuilder';
import { RecordingStructuredAI } from '@/services/story-runtime/RecordingStructuredAI';
import { StoryRuntimeClient } from '@/services/story-runtime/StoryRuntimeClient';
import {
  assertCenNotAdvancePrefix,
  assertChapterScopedCharacterTruths,
  assertContractStyleNotDuplicatedInBlocks,
  assertDraftPromptShape,
  assertPurposeSequence,
} from '@/services/story-runtime/promptInvariants';
import { makeBootstrap } from '@/services/story-runtime/__tests__/testFixtures';
import type {
  ChapterWriteOutput,
  WritingStyle,
} from '@/services/writing/ChapterWritingPipeline';
import { ChapterWritingPipeline } from '@/services/writing/ChapterWritingPipeline';
import {
  BATCH_CONTINUE_PRESET,
  type ChapterWriteOptionFlags,
} from '@/services/writing/chapterWritePresets';
import { countWords } from '@/services/writing/utils';
import { MIN_WORD_THRESHOLD } from '@/services/writing/supplement';
import { backoffDelayMs, classifyError, type ErrorKind } from '@/utils/ai-error-classify';
import {
  createChapterMemoryClient,
  createChapterPersistenceClient,
} from '@/services/writing/chapterPersistenceAdapters';
import { ContextManager } from '@/services/writing/context-manager';
import { executeSmartContinue } from '@/services/writing/smartContinue';
import { useProjectStore } from '@/stores/project.store';

import type { LocalMoliuProject } from './loadLocalMoliuProject';
import { hydrateProjectStoreForSmartContinue } from './hydrateSmartContinueStore';
import { ensurePlotOutlineForLocalProject } from './plotOutlineFromLocalProject';

type StoryRuntimeAPI = NonNullable<Window['electronAPI']['storyRuntime']>;

export type HarnessRuntimeBackend = 'sqlite' | 'memory';

function createStoryRuntimeForHarness(): {
  api: StoryRuntimeAPI;
  backend: HarnessRuntimeBackend;
  userDataPath?: string;
  dispose: () => void;
} {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'moliu-cw-runtime-'));
  try {
    // 与 App IPC 共用 StoryRuntimeRepository；Node ABI 与 Electron 预编译不一致时降级
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createNodeStoryRuntimeApi } = require('@main/services/story-runtime/nodeStoryRuntimeApi') as {
      createNodeStoryRuntimeApi: (p: string) => {
        api: StoryRuntimeAPI;
        dispose: () => void;
      };
    };
    const live = createNodeStoryRuntimeApi(userDataPath);
    // 强制触发 native open，确认 ABI 可用
    void live.api.bootstrap({ projectId: `__abi_probe_${Date.now()}` });
    return {
      api: live.api,
      backend: 'sqlite',
      userDataPath,
      dispose: () => {
        live.dispose();
        try {
          fs.rmSync(userDataPath, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      },
    };
  } catch (error) {
    try {
      fs.rmSync(userDataPath, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    const reason = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.warn(
      `[continueWriteHarness] StoryRuntime SQLite 不可用，回退内存 API（流程仍走 executeSmartContinue）：${reason.slice(0, 180)}`
    );
    return {
      api: createHarnessStoryRuntimeApi(),
      backend: 'memory',
      dispose: () => undefined,
    };
  }
}

/**
 * 与线上坏蓝图同构：CEN=推进至：+唯一 CPN，goal=第1章，空章重写需剥离旧事件。
 * 夹具使用通用主角/反派，不绑定具体书名。
 */
export function makeMalformedChapter1Contracts() {
  const bootstrap = makeBootstrap();
  for (let i = 1; i <= 8; i += 1) {
    bootstrap.entities.push({
      id: `char-extra-${i}`,
      kind: 'character',
      name: `路人${i}`,
      aliases: [],
      attributes: { role: 'support', description: `第${i}卷才出场的配角长描述`.repeat(3) },
      knownBy: [],
      sourceTrace: [],
    });
  }
  bootstrap.entities[0] = {
    ...bootstrap.entities[0],
    name: '主角',
    attributes: {
      ...bootstrap.entities[0].attributes,
      role: 'protagonist',
      description: '意外卷入命案的调查者',
    },
  };
  bootstrap.project.description = '主角在现场发现关键线索，当众指认真凶后反被诬陷入狱。';

  return new ContractPackBuilder().build({
    bootstrap,
    volume: {
      number: 1,
      title: '限期翻案',
      objective: '主角须在三天内用铁证翻案自证清白',
      conflict: 'resource',
      forbidden: ['不能揭示幕后势力网的全貌'],
    },
    chapter: {
      number: 1,
      title: '第1章',
      goal: '第1章',
      outlineNode: {
        id: 'ch1',
        title: '第1章',
        description: '第1章',
        CBN: '主角在现场发现关键线索，当众指认真凶后反被诬陷入狱，必须在三天内用铁证翻案自证清白，否则将被处斩',
        CPNs: ['主角在现场发现关键线索'],
        CEN: '推进至：主角在现场发现关键线索',
        mustCover: ['主角在现场发现关键线索'],
        forbiddenZones: ['不能揭示幕后势力网的全貌'],
      },
    },
    style: ['冷峻写实', '目标约 3000 字，按场景分配篇幅'],
    forbidden: ['不能揭示幕后势力网的全貌'],
  });
}

/** 按 purpose 返回合法 JSON，供 harness 无真 API 跑通全链路 */
export class ContinueWriteFakeAI implements StructuredAI {
  callCount = 0;

  private ensureMinWords(paragraphs: string[], minWords: number): string[] {
    const joined = paragraphs.join('\n\n');
    const current = countWords(joined);
    if (current >= minWords) return paragraphs;
    const unit =
      '现场取证与公堂压迫交替推进，他不敢漏掉任何一处痕迹、证词与证人神色。';
    const need = minWords - current + 40;
    const pad = unit.repeat(Math.max(1, Math.ceil(need / countWords(unit))));
    return [...paragraphs, pad];
  }

  private resolveTargetFromPrompt(prompt: string): number {
    try {
      const payload = JSON.parse(prompt) as {
        targetWordCount?: number | null;
        writingRules?: { targetWordCount?: number | null; minWordCount?: number | null };
      };
      const target =
        payload.targetWordCount ??
        payload.writingRules?.targetWordCount ??
        payload.writingRules?.minWordCount ??
        null;
      if (typeof target === 'number' && target > 0) return target;
    } catch {
      // 补充续写是纯文本 prompt
    }
    const match = prompt.match(/目标字数：约\s*(\d+)\s*字/u);
    if (match) return Number(match[1]);
    return 3000;
  }

  async generate<T>(request: StructuredAIRequest<T>): Promise<unknown> {
    this.callCount += 1;
    if (request.purpose === 'chapter-judge' || request.purpose === 'fulfillment-check') {
      const payload = JSON.parse(request.prompt) as {
        mustCover?: string[];
        forbiddenZones?: string[];
      };
      return {
        fulfillment: (payload.mustCover ?? []).map(node => ({
          node,
          fulfilled: true,
          evidence: ['语义履约'],
          reason: '测试放行',
        })),
        forbidden: (payload.forbiddenZones ?? []).map(zone => ({
          zone,
          violated: false,
          evidence: [],
          reason: '未触发',
        })),
        issues: [],
        results: (payload.mustCover ?? []).map(node => ({
          node,
          fulfilled: true,
          evidence: ['语义履约'],
          reason: '测试放行',
        })),
      };
    }
    if (request.purpose === 'fact-extraction') {
      return {
        events: [
          {
            id: 'event-ch1-1',
            chapter: 1,
            sceneId: 'chapter-1:CBN:scene',
            type: 'checkpoint',
            summary: '主角在现场发现关键线索',
            participants: ['hero'],
            causes: [],
            effects: ['主角在现场发现关键线索'],
            evidence: ['主角睁开眼，证物台就在面前。'],
          },
        ],
        deltas: [],
        evidence: ['主角睁开眼，证物台就在面前。'],
      };
    }

    const target = this.resolveTargetFromPrompt(request.prompt);
    const minWords = Math.floor(target * MIN_WORD_THRESHOLD);

    if (
      request.schemaName === 'SupplementParagraphs' ||
      request.prompt.trimStart().startsWith('【补充续写指令】')
    ) {
      return {
        paragraphs: this.ensureMinWords(
          [
            '堂下窃窃私语渐渐散开，主角没有抬头，只把关键痕迹与证人神色一一记在心里。',
            '他知道三天期限像刀子架在脖子上，可越是如此，越要把第一轮取证做干净——只要铁证落板，反派甲再怎么翻脸也没用。',
            '取证推进的一瞬，他忽然想起旧日训练台边的冷白灯光，唇角却没有笑：这局面不是他选的，但这门手艺还在。',
          ],
          Math.max(200, Math.ceil(minWords * 0.35))
        ),
      };
    }

    if (request.schemaName === 'CondenseParagraphs') {
      return {
        paragraphs: this.ensureMinWords(
          [
            '主角压住眩晕，把关键证据对完，当众点出反派甲。',
            '权势者变脸，三日处斩的刀落下来，章末悬在铁证与性命之间。',
          ],
          minWords
        ),
      };
    }

    const payload = JSON.parse(request.prompt) as {
      primaryBeatId?: string;
      chapterBeats?: Array<{ kind: string; summary: string }>;
      allowedCandidateEventIds?: string[];
      candidateSummaries?: Record<string, string>;
    };
    const beatId = payload.primaryBeatId ?? 'chapter-1:CBN';
    const arc =
      payload.chapterBeats?.map(beat => beat.summary).join('→') ?? '主角在现场发现关键线索';
    const ids = payload.allowedCandidateEventIds ?? [];
    const filler =
      '他指腹沿着痕迹边缘缓缓推移，脑海中把现场细节与对方说辞逐条对撞，越对越冷。';
    return {
      sceneId: `${beatId}:scene`,
      beatId,
      chapterTitle: '刚入局就被诬下狱',
      paragraphs: this.ensureMinWords(
        [
          `主角猛地睁开眼，鼻腔里全是尘土与血腥气。${arc}。${filler}${filler}`,
          `他压住眩晕，按住关键物证，指腹下的痕迹分布与对方说辞根本对不上。${filler}${filler}`,
          `堂下哄闹声起，反派甲脸色铁青。主角知道：这一指，要么翻案，要么处斩。${filler}${filler}`,
          `三日内若拿不出铁证，刀就落在他自己脖子上——可死人不会说谎，说谎的只会是活人。${filler}`,
        ],
        minWords
      ),
      candidateEvents: ids.map(id => ({
        id,
        summary: payload.candidateSummaries?.[id] ?? id,
        participants: [],
        prerequisites: [],
        effects: [],
      })),
    };
  }
}

export function makePassthroughFactExtractor(): FactExtractor {
  return {
    extract: async input => ({
      events: [
        {
          id: 'event-ch1-1',
          chapter: input.chapterNumber,
          sceneId: input.sceneDrafts[0]?.sceneId ?? 'scene',
          type: 'checkpoint',
          summary: '穿越醒来正在验尸',
          participants: ['hero'],
          causes: [],
          effects: ['穿越醒来正在验尸'],
          evidence: input.sceneDrafts[0]?.paragraphs.slice(0, 1) ?? ['证据'],
        },
      ],
      deltas: [],
      evidence: input.sceneDrafts[0]?.paragraphs.slice(0, 1) ?? ['证据'],
    }),
  };
}

/** 内存 storyRuntime IPC：与正式 bootstrap/loadState/commitAccepted 契约对齐 */
export function createHarnessStoryRuntimeApi(): StoryRuntimeAPI {
  let snapshots: Array<Record<string, unknown>> = [];

  return {
    bootstrap: async input => {
      const seed = input.seed as { snapshots?: Array<Record<string, unknown>> } | undefined;
      if (seed?.snapshots?.length) {
        snapshots = seed.snapshots;
      }
      return {
        projectId: input.projectId,
        databasePath: ':memory:',
        schemaVersion: 1,
        seededRows: snapshots.length,
      };
    },
    upsert: async () => ({ changedRows: 1 }),
    query: async input => {
      if (input.table === 'snapshots') {
        const rows = snapshots.map(row => ({
          id: String(row.id ?? 'canonical'),
          snapshot_type: String(row.snapshot_type ?? 'canonical'),
          payload_json: row.payload_json as JsonValue,
          chapter: typeof row.chapter === 'number' ? row.chapter : 0,
        }));
        return { rows, total: rows.length };
      }
      return { rows: [], total: 0 };
    },
    commitAccepted: async input => {
      const next = input.projections?.snapshots;
      if (Array.isArray(next) && next.length > 0) {
        snapshots = next as Array<Record<string, unknown>>;
      }
      return {
        commitId: input.commit.id,
        created: true,
        outboxIds: [1],
      };
    },
    readOutbox: async () => [],
    completeOutbox: async () => ({ changed: true }),
    health: async projectId => ({
      ok: true,
      projectId,
      databasePath: ':memory:',
      schemaVersion: 1,
      journalMode: 'memory',
      foreignKeys: true,
      integrity: 'ok',
      pendingOutbox: 0,
    }),
  };
}

export function toWritingTaskBook(input: {
  CBN: string;
  CPNs: string[];
  CEN: string;
  mustCover: string[];
  forbiddenZones: string[];
  goal: string;
}): WritingTaskBook {
  return {
    hardConstraints: {
      goal: input.goal,
      chapterEndOpenQuestion: input.CEN,
    },
    CBN: input.CBN,
    CPNs: input.CPNs,
    CEN: input.CEN,
    mustCover: input.mustCover,
    forbiddenZones: input.forbiddenZones,
    styleGuidance: {
      reasoning: ['冷峻写实', '目标约按场景分配篇幅'],
      antiPatterns: [],
      protagonistOOCAlert: [],
    },
  };
}

/** 把本地项目转成 Pipeline 所需 Project（空章重写时 content 已清空） */
export function toPipelineProject(local: LocalMoliuProject): Project {
  const now = new Date().toISOString();
  const chapters = (local.chapters ?? []).map(chapter => ({
    id: chapter.id,
    volumeId: chapter.volumeId,
    title: chapter.title,
    content: chapter.content ?? '',
    wordCount: 0,
    orderIndex: chapter.orderIndex,
    outline: chapter.outline,
    plotSummary: chapter.plotSummary,
    version: 1,
    status: 'draft' as const,
    createdAt: now,
    updatedAt: now,
  }));
  const plotOutline = ensurePlotOutlineForLocalProject({
    ...local,
    chapters,
  });

  return {
    id: local.id,
    name: local.name,
    description: local.description ?? '',
    genre: (local.genre ?? []) as Project['genre'],
    wordCount: 0,
    status: 'writing',
    volumes: (local.volumes ?? []).map(volume => ({
      id: volume.id,
      name: volume.name,
      orderIndex: volume.orderIndex,
      summary: volume.summary ?? '',
      createdAt: now,
      updatedAt: now,
    })),
    chapters,
    characters: (local.characters ?? []).map(character => ({
      id: character.id,
      name: character.name,
      role: (character.role as 'protagonist' | 'antagonist' | 'supporting') || 'supporting',
      description: character.description ?? '',
      profile: character.profile ?? {},
      createdAt: now,
      updatedAt: now,
    })) as Project['characters'],
    worldSchema: {
      rules: (local.worldSchema?.rules ?? []).map(rule => ({
        id: rule.id,
        name: rule.name,
        description: rule.description,
        locked: rule.locked,
        category: rule.category,
      })),
      locations: [],
      factions: [],
      items: [],
      powers: [],
    } as Project['worldSchema'],
    foreshadows: [],
    plotOutline,
    chapterMemories: [],
    conflictDesign: local.conflictDesign
      ? ({
          id: 'conflict-local',
          source: local.conflictDesign.source ?? '',
          escalation: [],
          majorConflicts: [],
        } as Project['conflictDesign'])
      : undefined,
    metadata: local.metadata as Project['metadata'],
    createdAt: now,
    updatedAt: now,
  };
}

const SYNTHETIC_CHAPTER_ARCS = [
  '主角在现场发现关键线索，当众指认真凶后反被诬陷入狱，必须在三天内用铁证翻案自证清白，否则将被处斩',
  '狱中三日，主角凭证据细节逼迫公堂公开复验，当堂证明死者系他杀，反派甲第一次当众失态',
  '复验过堂后主角暂脱死罪，却被卷入更多旧案卷宗，幕后势力的阴影压过来',
] as const;

export function makeSyntheticHarnessProject(options?: { chapterCount?: number }): {
  project: Project;
  chapter: Chapter;
  taskBook: WritingTaskBook;
} {
  const chapterCount = Math.max(1, options?.chapterCount ?? 1);
  const cbn = SYNTHETIC_CHAPTER_ARCS[0];
  const now = new Date().toISOString();
  const chapters: Chapter[] = Array.from({ length: chapterCount }, (_, index) => {
    const arc =
      SYNTHETIC_CHAPTER_ARCS[Math.min(index, SYNTHETIC_CHAPTER_ARCS.length - 1)] ?? cbn;
    return {
      id: `ch-harness-${index + 1}`,
      volumeId: 'vol-harness-1',
      title: `第${index + 1}章`,
      content: '',
      wordCount: 0,
      orderIndex: index,
      outline: arc,
      plotSummary: arc,
      version: 1,
      status: 'draft' as const,
      createdAt: now,
      updatedAt: now,
    };
  });
  const chapter = chapters[0];
  const plotOutline = chapters.map((item, index) => {
    const arc = item.outline || item.plotSummary || cbn;
    return {
      id: `plot-ch-${index + 1}`,
      title: item.title,
      description: arc,
      type: 'chapter' as const,
      orderIndex: index,
      chapterId: item.id,
      CBN: arc,
      CPNs:
        index === 0
          ? ['主角在现场发现关键线索', '当众指认真凶', '被反诬入狱']
          : [`第${index + 1}章推进节点`],
      CEN:
        index === 0
          ? '被反诬入狱，必须在三天内用铁证翻案自证清白'
          : `第${index + 1}章收束`,
      mustCover: [arc],
      forbiddenZones: ['不能揭示幕后势力网的全貌'],
    };
  });
  const project: Project = {
    id: 'project-harness-1',
    name: '通用续写-harness',
    description: cbn,
    genre: [],
    wordCount: 0,
    status: 'writing',
    volumes: [
      {
        id: 'vol-harness-1',
        name: '限期翻案',
        orderIndex: 0,
        summary: '主角须在三天内用铁证翻案自证清白',
        createdAt: now,
        updatedAt: now,
      },
    ],
    chapters,
    characters: [
      {
        id: 'hero',
        name: '主角',
        role: 'protagonist',
        description: '意外卷入命案的调查者',
        profile: {},
        createdAt: now,
        updatedAt: now,
      },
    ] as Project['characters'],
    worldSchema: {
      rules: [],
      locations: [],
      factions: [],
      items: [],
      powers: [],
    } as Project['worldSchema'],
    foreshadows: [],
    plotOutline,
    chapterMemories: [],
    conflictDesign: {
      id: 'conflict-harness',
      source: 'resource',
      escalation: [],
      majorConflicts: [],
    } as Project['conflictDesign'],
    metadata: {
      volumePlans: [
        {
          volumeIndex: 0,
          title: '限期翻案',
          objective: '主角须在三天内用铁证翻案自证清白',
          coreConflict: 'resource',
        },
      ],
    } as Project['metadata'],
    createdAt: now,
    updatedAt: now,
  };

  const taskBook = toWritingTaskBook({
    CBN: cbn,
    CPNs: plotOutline[0].CPNs ?? [],
    CEN: plotOutline[0].CEN ?? '',
    mustCover: plotOutline[0].mustCover ?? [],
    forbiddenZones: plotOutline[0].forbiddenZones ?? [],
    goal: cbn,
  });

  return { project, chapter, taskBook };
}

export interface ContinueWriteChapterRunResult {
  chapterNumber: number;
  chapter: Chapter;
  recording: RecordingStructuredAI;
  output: ChapterWriteOutput;
  taskBook: WritingTaskBook | null;
  /** smart=智能续写；batch=批量续写（与 App 预设对齐） */
  mode: ContinueWriteMode;
}

/** 与正式 App 对齐：smart → executeSmartContinue；batch → Pipeline+BATCH_CONTINUE_PRESET */
export type ContinueWriteMode = 'smart' | 'batch';

export interface ContinueWriteSession {
  readonly runtimeBackend: HarnessRuntimeBackend;
  getProject(): Project;
  runChapter(options: {
    chapterNumber: number;
    targetWordCount?: number;
    ai?: StructuredAI;
    runId?: string;
    persistTrace?: boolean;
    model?: string;
    provider?: string;
    /** 默认 smart；多章正式路径传 batch */
    mode?: ContinueWriteMode;
    /**
     * 写作风格。batch 默认 'humorous'（与 App 批量 UI 默认一致），
     * smart 默认 'concise'（历史行为）。
     */
    writingStyle?: WritingStyle;
    /** 用户停止信号（对齐 useBatchWriter 的 abortController.signal） */
    signal?: AbortSignal;
    /**
     * 启用与 App 相同的记忆提取（createChapterMemoryClient）。
     * 默认 false；vitest 环境无 electronAPI 时文件保存与 AI 增强自动降级。
     */
    enableMemoryExtract?: boolean;
    /**
     * 批量层重试传入的「上一轮失败教训」种子（透传到 pipeline.seedRevisionHints）。
     * 让重试不是盲目重跑而是带反馈的定向重写。
     */
    seedRevisionHints?: string[];
    /**
     * 每章 store hydrate 完成后的回调（batch 模式下 hydrateProjectStoreForSmartContinue
     * 会重置 Pinia，导致 settingsStore 中的 AI 配置丢失）。调用方可在此重新注入
     * AI 配置，让记忆提取等走 useAIService 的组件能读到 provider。
     */
    onChapterHydrated?: () => void;
  }): Promise<ContinueWriteChapterRunResult>;
  dispose(): void;
}

function buildBatchPreviousChapter(
  previous: Chapter | undefined
): { title: string; summary: string; ending: string } | undefined {
  if (!previous?.content?.trim()) return undefined;
  const contextManager = new ContextManager();
  return {
    title: previous.title,
    summary: contextManager.extractPreviousChapterSummary(previous.content, 300),
    ending: contextManager.extractChapterEnding(previous.content),
  };
}

/**
 * 打开可复用 session：共享 StoryRuntime，多章顺序续写时保留 accepted 状态。
 * - 单章 / 智能续写：mode=smart → executeSmartContinue（与 WritingOrchestratorV2 同入口）
 * - 多章 / 批量续写：mode=batch → ChapterWritingPipeline + BATCH_CONTINUE_PRESET（与 useBatchWriter 同路径）
 */
export function openContinueWriteSession(options: {
  project: Project;
  /** 注入续写章节标题回写客户端（forceStoryRuntime 模式下默认无） */
  plotOutlineClient?: {
    updateChapterTitle(orderIndex: number, title: string): Promise<void>;
  };
}): ContinueWriteSession {
  let project: Project = {
    ...options.project,
    chapters: [...(options.project.chapters ?? [])],
    plotOutline: [...(options.project.plotOutline ?? [])],
  };
  const runtimeHandle = createStoryRuntimeForHarness();
  const runtime = new StoryRuntimeClient(runtimeHandle.api);
  let disposed = false;

  const ensureAlive = (): void => {
    if (disposed) {
      throw new Error('ContinueWriteSession 已 dispose');
    }
  };

  const syncProjectFromStore = (): void => {
    const projectStore = useProjectStore();
    project = {
      ...project,
      chapters: projectStore.sortedChapters.map(item => ({ ...item })),
      plotOutline:
        projectStore.plotOutline && projectStore.plotOutline.length > 0
          ? [...projectStore.plotOutline]
          : project.plotOutline,
    };
  };

  return {
    runtimeBackend: runtimeHandle.backend,
    getProject: () => project,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      runtimeHandle.dispose();
    },
    async runChapter(chapterOptions) {
      ensureAlive();
      const mode: ContinueWriteMode = chapterOptions.mode ?? 'smart';
      const chapterNumber = chapterOptions.chapterNumber;
      const chapter = project.chapters.find(item => item.orderIndex + 1 === chapterNumber);
      if (!chapter) {
        throw new Error(`缺少第 ${chapterNumber} 章`);
      }

      const plotOutline =
        project.plotOutline && project.plotOutline.length > 0
          ? project.plotOutline
          : makeSyntheticHarnessProject().project.plotOutline;
      const projectWithOutline: Project = { ...project, plotOutline };

      const { preflightService, contextAgent } = hydrateProjectStoreForSmartContinue({
        project: projectWithOutline,
        chapter,
        plotOutline,
      });

      // hydrateProjectStoreForSmartContinue 内部会 setActivePinia(createPinia()) 重置 Pinia，
      // 导致 harness 先前注入到 settingsStore 的 AI 配置失活。调用方可通过此回调重新注入，
      // 让记忆提取（enhanceWithAI → useAIService）等走 settings 的组件能读到 provider。
      chapterOptions.onChapterHydrated?.();

      const inner = chapterOptions.ai ?? new ContinueWriteFakeAI();
      const recording =
        inner instanceof RecordingStructuredAI
          ? inner
          : new RecordingStructuredAI(inner, {
              runId:
                chapterOptions.runId ??
                `harness-${mode}-ch${chapterNumber}-${Date.now()}`,
              persist: chapterOptions.persistTrace !== false,
              model: chapterOptions.model,
              provider: chapterOptions.provider,
            });

      // 不在调用层 bootstrap：由 pipeline 内部 executeLongFormRuntime 单次完成
      // （migrate 同一份 project），与生产 useBatchWriter 对齐。此前在此处多调一次
      // runtime.bootstrap —— 因 StoryRuntimeClient 的 existing.total===0 守卫，commit
      // 后种子被抑制、第二次为 no-op；属冗余且依赖外部守卫保安全，故移除。

      // 与正式 App 同 persistence + memoryClient（落 Pinia + 记忆提取）。
      // 对齐 useChapterWritingPipeline()：默认创建 createChapterMemoryClient（与 App 完全一致，
      // 含 AI 增强伏笔/记忆召回链路）；enableMemoryExtract=false 时显式关闭（仅用于隔离测试）。
      // safeExtractChapterMemory 在无 electronAPI 时自动降级（fallbackToPrevious），不会抛错。
      const persistence = createChapterPersistenceClient();
      const memoryClient = chapterOptions.enableMemoryExtract === false
        ? { extractAndSave: async () => null }
        : createChapterMemoryClient();
      const pipelineDeps = {
        forceStoryRuntime: true as const,
        structuredAI: recording,
        storyRuntimeApi: runtimeHandle.api,
        storyRuntimeClient: runtime,
        preflightService,
        contextAgent,
        persistence,
        memoryClient,
        plotOutlineClient: options.plotOutlineClient ?? null,
      };

      const targetWordCount = chapterOptions.targetWordCount ?? 3000;
      // 与真实 App 对齐：batch 默认 'humorous'（批量 UI 默认），smart 保持 'concise'
      const writingStyle: WritingStyle =
        chapterOptions.writingStyle ?? (mode === 'batch' ? 'humorous' : 'concise');
      let output: ChapterWriteOutput;

      if (mode === 'smart') {
        // WritingOrchestratorV2.run：不显式传 previousChapter，由 PreflightService 上下文提供衔接
        output = await executeSmartContinue(
          {
            project: projectWithOutline,
            chapter,
            targetWordCount,
            writingStyle,
            signal: chapterOptions.signal,
          },
          pipelineDeps
        );
      } else {
        // useBatchWriter.writeSingleChapter：BATCH_CONTINUE_PRESET + 显式 previousChapter
        const previous = project.chapters.find(
          item => item.orderIndex + 1 === chapterNumber - 1
        );
        const batchFlags: ChapterWriteOptionFlags = { ...BATCH_CONTINUE_PRESET };
        const pipeline = new ChapterWritingPipeline(pipelineDeps);
        output = await pipeline.execute({
          project: projectWithOutline,
          chapter,
          targetWordCount,
          writingStyle,
          ...batchFlags,
          previousChapter: buildBatchPreviousChapter(previous),
          signal: chapterOptions.signal,
          seedRevisionHints: chapterOptions.seedRevisionHints,
        });
      }

      await recording.flush();
      syncProjectFromStore();

      // persistence 已落库；若 success 但 store 未写入，兜底同步正文
      if (output.success && output.prose.trim()) {
        const latest = project.chapters.find(item => item.id === chapter.id);
        if (!(latest?.content || '').trim()) {
          await persistence.replace(chapter.id, output.prose);
          syncProjectFromStore();
        }
      }

      return {
        chapterNumber,
        chapter: project.chapters.find(item => item.id === chapter.id) ?? chapter,
        recording,
        output,
        taskBook: output.taskBook,
        mode,
      };
    },
  };
}

/**
 * 与正式智能续写同构：executeSmartContinue（WritingOrchestratorV2 同入口）
 */
export async function runContinueWriteHarness(options?: {
  runId?: string;
  persistTrace?: boolean;
  ai?: StructuredAI;
  targetWordCount?: number;
  project?: Project;
  chapter?: Chapter;
  /** @deprecated 正式路径由 ContextAgent 生成；保留仅为兼容旧调用方 */
  taskBook?: WritingTaskBook;
  model?: string;
  provider?: string;
}): Promise<{
  recording: RecordingStructuredAI;
  output: ChapterWriteOutput;
  appliedOnce: boolean;
  runtimeBackend: HarnessRuntimeBackend;
}> {
  const synthetic = makeSyntheticHarnessProject();
  const project = options?.project ?? synthetic.project;
  const chapter = options?.chapter ?? synthetic.chapter;
  const session = openContinueWriteSession({ project });
  try {
    const result = await session.runChapter({
      chapterNumber: chapter.orderIndex + 1,
      targetWordCount: options?.targetWordCount ?? 3000,
      ai: options?.ai,
      runId: options?.runId,
      persistTrace: options?.persistTrace,
      model: options?.model,
      provider: options?.provider,
      mode: 'smart',
    });
    return {
      recording: result.recording,
      output: result.output,
      appliedOnce: result.output.success && result.output.prose.trim().length > 0,
      runtimeBackend: session.runtimeBackend,
    };
  } finally {
    session.dispose();
  }
}

/**
 * 连续多章：默认走正式批量路径（BATCH_CONTINUE_PRESET）。
 * 传 mode:'smart' 可改为连续智能续写（一般仅对照用）。
 */
export async function runContinueWriteChapters(options: {
  project: Project;
  fromChapter: number;
  chapterCount: number;
  targetWordCount: number;
  ai?: StructuredAI;
  runIdPrefix?: string;
  persistTrace?: boolean;
  model?: string;
  provider?: string;
  /** 默认 batch，与 useBatchWriter 对齐 */
  mode?: ContinueWriteMode;
  /**
   * 单章失败最大尝试次数（默认 3，与 useBatchWriter config.maxRetries 默认一致）。
   * 失败按 2^attempt 秒指数退避后重试本章，耗尽则停止整个批量（对齐 startBatchWriting）。
   */
  maxRetries?: number;
  /** 写作风格；batch 默认 'humorous'（App 批量 UI 默认），smart 默认 'concise' */
  writingStyle?: WritingStyle;
  /** 用户停止信号（对齐 useBatchWriter 的 abortController.signal） */
  signal?: AbortSignal;
  /** 记忆提取（createChapterMemoryClient）；默认开启（对齐 App），传 false 显式关闭 */
  enableMemoryExtract?: boolean;
  /**
   * 每章 store hydrate 后的回调（hydrate 会重置 Pinia）。透传到 session.runChapter，
   * 供调用方重新注入 AI 配置，避免记忆提取等走 settings 的组件读不到 provider。
   */
  onChapterHydrated?: () => void;
  /** 续写章节标题回写客户端，透传到 pipeline（harness 默认无） */
  plotOutlineClient?: {
    updateChapterTitle(orderIndex: number, title: string): Promise<void>;
  };
}): Promise<{
  runtimeBackend: HarnessRuntimeBackend;
  project: Project;
  chapters: ContinueWriteChapterRunResult[];
  mode: ContinueWriteMode;
}> {
  const fromChapter = Math.max(1, options.fromChapter);
  const chapterCount = Math.max(1, options.chapterCount);
  const mode: ContinueWriteMode = options.mode ?? 'batch';
  // 对齐 useBatchWriter：瞬态错误默认 5 次重试
  const maxRetries = Math.max(1, options.maxRetries ?? 5);
  // 持久错误（schema/审核/字数/auth/4xx）重试上限：与 useBatchWriter:1121 对齐为 3。
  // 给模型换写法的机会（配合 seedRevisionHints 反馈定向重写，重试不再是盲目重跑），
  // 但不超过瞬态上限 maxRetries。白名单注入已从源头减少这类错误。
  const persistentMaxRetries = 3;
  const session = openContinueWriteSession({
    project: options.project,
    plotOutlineClient: options.plotOutlineClient,
  });
  const chapters: ContinueWriteChapterRunResult[] = [];
  try {
    for (let offset = 0; offset < chapterCount; offset += 1) {
      if (options.signal?.aborted) break;
      const chapterNumber = fromChapter + offset;
      // 对齐 useBatchWriter：错误分级重试，耗尽即结束整批（质量优先：宁可不写也不继续产出有问题章节）
      let finalResult: ContinueWriteChapterRunResult | null = null;
      let lastError = '';
      let lastErrorKind: ErrorKind = 'unknown';
      let persistentAttempts = 0;
      let aborted = false;
      // 上一轮失败的门禁反馈：重试时作为 seedRevisionHints 传入，让重试带教训而非盲目重跑。
      // 仅 review/wordcount 类失败会产出 gateResult；网络/超时类失败 gateResult 为 null（无需 seed）。
      let seedRevisionHints: string[] | undefined;
      for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
        if (options.signal?.aborted) { aborted = true; break; }
        try {
          finalResult = await session.runChapter({
            chapterNumber,
            targetWordCount: options.targetWordCount,
            ai: options.ai,
            runId: `${options.runIdPrefix ?? `continue-write-${mode}`}-ch${chapterNumber}-${Date.now()}`,
            persistTrace: options.persistTrace,
            model: options.model,
            provider: options.provider,
            mode,
            writingStyle: options.writingStyle,
            signal: options.signal,
            enableMemoryExtract: options.enableMemoryExtract,
            seedRevisionHints,
            onChapterHydrated: options.onChapterHydrated,
          });
          lastError = finalResult.output.error ?? '';
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          finalResult = null;
        }
        if (finalResult?.output.success) break;

        // 从本轮失败的门禁结果提取 blocking 问题，作为下一轮重试的反馈种子
        if (finalResult?.output.gateResult) {
          const blocking = finalResult.output.gateResult.gates.flatMap(g => g.issues)
            .filter(issue => issue.severity === 'critical')
            .map(issue => issue.description)
            .filter((desc): desc is string => Boolean(desc))
            .slice(0, 5);
          if (blocking.length > 0) {
            seedRevisionHints = blocking;
          }
        }

        // 错误分级（对齐 useBatchWriter:1162-1164）
        const classified = classifyError(new Error(lastError), options.signal);
        lastErrorKind = classified.kind;

        // 截断/空响应（抛异常、无 gateResult）时注入固定引导种子，避免下一轮原样盲发。
        // 这类失败 finalResult 为 null，上面 if(gateResult) 提不到反馈，需单独兜底。
        if (classified.kind === 'truncated') {
          seedRevisionHints = [
            '上一轮 AI 返回了空内容或被截断的 JSON。请务必一次性输出完整的 JSON 对象，paragraphs 数组必须包含完整的正文段落，不要在中途停笔，不要返回空字符串。',
          ];
        }
        // aborted（用户停止）：立即停整批
        if (classified.kind === 'aborted') { aborted = true; break; }
        // 持久错误（schema/审核/字数/auth/4xx）：不退避，立即重试，但上限 persistentMaxRetries
        if (!classified.retryable) {
          persistentAttempts += 1;
          if (persistentAttempts >= persistentMaxRetries) {
            // eslint-disable-next-line no-console
            console.error(
              `[runContinueWriteChapters] 第${chapterNumber}章持久错误（${classified.kind}）连续 ${persistentMaxRetries} 次，结束批量：${lastError}\n` +
                `  提示：review 类错误（角色名冲突/情节未履约）重试意义有限，建议检查大纲角色设定或合同 mustCover 是否合理`
            );
            break;
          }
          // eslint-disable-next-line no-console
          console.warn(
            `[runContinueWriteChapters] 第${chapterNumber}章持久错误（${classified.kind}，第 ${persistentAttempts}/${persistentMaxRetries} 次），立即重试：${lastError}`
          );
          continue; // 不退避
        }
        // 瞬态错误（网络/超时/截断/5xx/429）：指数退避重试
        if (attempt < maxRetries) {
          const waitMs = backoffDelayMs(attempt); // 4/8/16/30/30s
          // eslint-disable-next-line no-console
          console.warn(
            `[runContinueWriteChapters] 第${chapterNumber}章瞬态失败（第 ${attempt}/${maxRetries} 次，${classified.kind}），${Math.round(waitMs / 1000)}s 后重试：${lastError}`
          );
          await new Promise(resolve => setTimeout(resolve, waitMs));
        }
      }
      // 用户停止：立即结束整批
      if (aborted || options.signal?.aborted) break;
      // 成功：保留结果，继续下一章
      if (finalResult?.output.success) {
        chapters.push(finalResult);
        continue;
      }
      // 重试耗尽（持久/瞬态）：记录失败章信息后结束整批（质量优先，不再留白补章继续）
      const failedChapter =
        options.project.chapters.find(item => item.orderIndex + 1 === chapterNumber) ?? null;
      if (failedChapter) {
        const noopAi: StructuredAI = {
          async generate() {
            throw new Error('failed-chapter placeholder: no AI available');
          },
        };
        chapters.push({
          chapterNumber,
          chapter: failedChapter,
          recording: new RecordingStructuredAI(noopAi, {
            runId: `${options.runIdPrefix ?? `continue-write-${mode}`}-ch${chapterNumber}-FAILED-${Date.now()}`,
            persist: false,
            model: options.model,
            provider: options.provider,
          }),
          output: {
            success: false,
            prose: '',
            title: failedChapter.title ?? `第${chapterNumber}章`,
            taskBook: null,
            gateResult: null,
            attempts: maxRetries,
            forceAccepted: false,
            supplementRounds: 0,
            error: lastError || `重试耗尽（${lastErrorKind}）`,
          },
          taskBook: null,
          mode,
        });
      }
      break; // 重试耗尽：结束整批，不再继续后续章（质量优先）
    }
    return {
      runtimeBackend: session.runtimeBackend,
      project: session.getProject(),
      chapters,
      mode,
    };
  } finally {
    session.dispose();
  }
}

/** 真 AI 冒烟：本地项目 → 智能续写正式路径（单章） */
export async function runContinueWritePipelineFromLocalProject(options: {
  project: LocalMoliuProject;
  chapterNumber: number;
  targetWordCount: number;
  ai: StructuredAI;
  runId?: string;
  persistTrace?: boolean;
  model?: string;
  provider?: string;
}): Promise<{
  recording: RecordingStructuredAI;
  output: ChapterWriteOutput;
  chapter: Chapter;
  taskBook: WritingTaskBook | null;
  runtimeBackend: HarnessRuntimeBackend;
  mode: ContinueWriteMode;
}> {
  const project = toPipelineProject(options.project);
  const session = openContinueWriteSession({ project });
  try {
    const first = await session.runChapter({
      chapterNumber: options.chapterNumber,
      targetWordCount: options.targetWordCount,
      ai: options.ai,
      runId: options.runId ?? `continue-write-real-${project.id}-ch${options.chapterNumber}-${Date.now()}`,
      persistTrace: options.persistTrace,
      model: options.model,
      provider: options.provider,
      mode: 'smart',
    });
    return {
      recording: first.recording,
      output: first.output,
      chapter: first.chapter,
      taskBook: first.taskBook,
      runtimeBackend: session.runtimeBackend,
      mode: first.mode,
    };
  } finally {
    session.dispose();
  }
}

export function assertHarnessInvariants(recording: RecordingStructuredAI): void {
  const draft = recording.getRecords().find(item => item.purpose === 'scene-draft');
  if (!draft) {
    throw new Error('缺少 scene-draft 记录');
  }
  assertDraftPromptShape(draft.prompt);
  assertContractStyleNotDuplicatedInBlocks(draft.prompt);
  assertChapterScopedCharacterTruths(draft.prompt, 6);

  const promptJson = JSON.parse(draft.prompt) as {
    chapterBeats: Array<{ kind: string; summary: string }>;
    context: { blocks: Array<{ kind: string; content: string }> };
  };
  const contractsBlock = promptJson.context.blocks.find(block => block.kind === 'locked-contracts');
  if (!contractsBlock) {
    throw new Error('缺少 locked-contracts');
  }
  const contracts = JSON.parse(contractsBlock.content) as {
    chapter: { CEN: string; CPNs: string[]; goal: string };
  };
  assertCenNotAdvancePrefix({
    CEN: contracts.chapter.CEN,
    CPNs: contracts.chapter.CPNs,
    chapterBeats: promptJson.chapterBeats,
  });
  if (contracts.chapter.goal === '第1章') {
    throw new Error('goal 仍为无信息量的「第1章」');
  }

  const purposes = recording.getRecords().map(item => item.purpose);
  assertPurposeSequence(purposes, ['scene-draft', 'chapter-judge']);
}

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
 *   · 分类优先级：pipeline 输出的 errorKind/retryable 结构化字段优先，缺失才回退 message
 *     文本分类（对齐 useBatchWriter details.errorKind 优先级；error 为空时按失败形态合成 message）
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
import { createNodeStoryRuntimeApi } from '@main/services/story-runtime/nodeStoryRuntimeApi';

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
import {
  ChapterWritingPipeline,
  type ChapterTitleUpdate,
} from '@/services/writing/ChapterWritingPipeline';
import {
  BATCH_CONTINUE_PRESET,
  type ChapterWriteOptionFlags,
} from '@/services/writing/chapterWritePresets';
import { countWords } from '@/services/writing/utils';
import { MIN_WORD_THRESHOLD } from '@/services/writing/supplement';
import {
  classifyError,
  retryBackoffDelayMs,
  type ClassifiedError,
  type ErrorKind,
} from '@/utils/ai-error-classify';
import {
  createChapterMemoryClient,
  createChapterPersistenceClient,
} from '@/services/writing/chapterPersistenceAdapters';
import { ContextManager } from '@/services/writing/context-manager';
import { executeSmartContinue } from '@/services/writing/smartContinue';
import {
  applyBlueprintToPlotNode,
  blueprintToChapterUpdate,
  BlueprintRepairLedger,
  isFulfillmentDomainFailure,
  regenerateChapterBlueprint,
} from '@/services/outline/rolling/chapter-blueprint-regenerator';
import {
  createRealAgentLoopTransport,
  isRealAiEnabled,
  readRealAiEnvConfig,
} from './realStructuredAI';
import { useProjectStore } from '@/stores/project.store';

import type { LocalMoliuProject } from './loadLocalMoliuProject';
import { hydrateProjectStoreForSmartContinue } from './hydrateSmartContinueStore';
import { ensurePlotOutlineForLocalProject } from './plotOutlineFromLocalProject';

type StoryRuntimeAPI = NonNullable<Window['electronAPI']['storyRuntime']>;

export type HarnessRuntimeBackend = 'sqlite' | 'memory';

export interface StoryRuntimeVerification {
  health: Awaited<ReturnType<StoryRuntimeAPI['health']>>;
  acceptedDrafts: number;
  canonicalSnapshots: number;
  latestSnapshotChapter: number | null;
  sceneChunks: number;
  events: number;
}

function createStoryRuntimeForHarness(): {
  api: StoryRuntimeAPI;
  backend: HarnessRuntimeBackend;
  userDataPath?: string;
  dispose: () => void;
} {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'moliu-cw-runtime-'));
  try {
    // 与 App IPC 共用 StoryRuntimeRepository；静态 import 交给 Vite 解析 @main 别名。
    const live = createNodeStoryRuntimeApi(userDataPath);
    // 通过同步 repository 强制触发 native open；async API 的 rejection 无法被本 try/catch 捕获。
    live.repository.health(`__abi_probe_${Date.now()}`);
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
    const repeats = Math.max(1, Math.ceil(need / countWords(unit)));
    const unitsPerParagraph = 5;
    const padding = Array.from(
      { length: Math.ceil(repeats / unitsPerParagraph) },
      (_, index) => unit.repeat(Math.min(unitsPerParagraph, repeats - index * unitsPerParagraph))
    );
    return [...paragraphs, ...padding];
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
      // evidence 必须是正文真实原句（AIChapterJudge.normalize 的逐字校验会把
      // 不在正文中的假证据推翻为未履约）；与下方 scene-draft 首段正文保持一致
      const proseQuote = '主角猛地睁开眼，鼻腔里全是尘土与血腥气';
      return {
        fulfillment: (payload.mustCover ?? []).map(node => ({
          node,
          fulfilled: true,
          evidence: [proseQuote],
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
          evidence: [proseQuote],
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
          // 注意：正文不逐字嵌入 ${arc}（节点 summary 原文）——节点照抄确定性门禁
          // （LCS≥12 blocking）会拦；这里用场景化改写承载同一情节（r8 实测 13 处
          // 蓝图 CBN/CEN 逐字漏入终稿的守卫对应物）
          `主角猛地睁开眼，鼻腔里全是尘土与血腥气，视线扫过堂上众人，先把最不对劲的几处细节捏在手里。${filler}${filler}`,
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
  verifyRuntime(projectId: string): Promise<StoryRuntimeVerification>;
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
     * 伏笔时序死锁熔断豁免（hint 前缀）：同伏笔「提前揭示」连续 ≥2 拒后由批量层
     * 注入，pipeline 从 futureReveals 移除该伏笔（透传 pipeline.foreshadowExemptions）。
     */
    foreshadowExemptions?: string[];
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
    updateChapterTitle(input: ChapterTitleUpdate): Promise<void>;
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
    async verifyRuntime(projectId: string): Promise<StoryRuntimeVerification> {
      ensureAlive();
      const [health, drafts, snapshots, sceneChunks, events] = await Promise.all([
        runtimeHandle.api.health(projectId),
        runtimeHandle.api.query({
          projectId,
          table: 'drafts',
          filters: { status: 'accepted' },
          limit: 1,
        }),
        runtimeHandle.api.query({
          projectId,
          table: 'snapshots',
          filters: { snapshot_type: 'canonical' },
          limit: 1,
        }),
        runtimeHandle.api.query({ projectId, table: 'scene_chunks', limit: 1 }),
        runtimeHandle.api.query({ projectId, table: 'events', limit: 1 }),
      ]);
      const latestChapter = snapshots.rows[0]?.chapter;
      return {
        health,
        acceptedDrafts: drafts.total,
        canonicalSnapshots: snapshots.total,
        latestSnapshotChapter: typeof latestChapter === 'number' ? latestChapter : null,
        sceneChunks: sceneChunks.total,
        events: events.total,
      };
    },
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
        // Agent 检索回合生产常开(docs/agent-architecture-refactor.md P1)：真实冒烟注入
        // 与 structuredAI 同凭证的真实多轮 transport；假 AI 单测显式传 null 跳过
        // （FakeAI 不会说 JSON 工具协议）。这是 harness 与 App 在检索回合上的唯一差异点。
        agentResearchTransport: isRealAiEnabled()
          ? createRealAgentLoopTransport(readRealAiEnvConfig(), chapterOptions.signal)
          : null,
        // 伏笔回收流转（与生产同源）：判官确认的 resolvedForeshadowIds 经 pipeline
        // 提交阶段流转到 project 副本——此前 harness 在 onChapterSettled 手动消费，
        // 生产链路却没有对应物；现在两侧都走 foreshadowClient.markResolved。
        foreshadowClient: {
          markResolved: async (ids: string[]) => {
            let touched = 0;
            for (const foreshadow of project.foreshadows ?? []) {
              if (ids.includes(foreshadow.id) && foreshadow.status !== 'resolved') {
                foreshadow.status = 'resolved';
                touched += 1;
              }
            }
            if (touched > 0) {
              console.log(
                `[continueWriteHarness] 第${chapterNumber}章判官确认回收伏笔 ${touched} 条，已流转 buried→resolved`
              );
            }
          },
        },
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
          foreshadowExemptions: chapterOptions.foreshadowExemptions,
        });
      }

      await recording.flush();
      syncProjectFromStore();

      // 持久化严格对齐生产：pipeline 内部已调一次 persistence.replace，失败只 warn 靠 outbox 重放。
      // 不再加"success 但 store 未写入则补写"的兜底——那会掩盖生产落库静默失败的 bug。

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
 * 单章失败分类：与 useBatchWriter 同优先级——pipeline 输出的结构化
 * errorKind/retryable 优先（由门禁/补写/提交阶段用原始错误对象分类得出），
 * 缺失才回退 message 文本分类。retryable 缺失时沿用生产口径：取 message
 * 分类的 retryable（useBatchWriter 先合成 details 再消费，效果等价）。
 * 此前 harness 无条件按文本重分类，未被正则覆盖的新错误文案会被 unknown
 * （不可重试）兜底吞掉重试预算，特殊情况下与真实环境分叉。
 */
export function classifyChapterRunFailure(
  output: Pick<ChapterWriteOutput, 'errorKind' | 'retryable'> | null,
  message: string,
  signal?: AbortSignal
): ClassifiedError {
  const fromMessage = classifyError(new Error(message), signal);
  const kind = output?.errorKind;
  if (kind === undefined) {
    return fromMessage;
  }
  return {
    kind,
    retryable: output.retryable ?? fromMessage.retryable,
    transient: false,
    message,
  };
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
  /** 每章成功或最终失败后回调；真实长跑冒烟用它即时落盘，避免进程超时后整轮无摘要。 */
  onChapterSettled?: (input: {
    result: ContinueWriteChapterRunResult;
    completedChapters: number;
    requestedChapters: number;
    project: Project;
  }) => void | Promise<void>;
  /** 续写章节标题回写客户端，透传到 pipeline（harness 默认无） */
  plotOutlineClient?: {
    updateChapterTitle(input: ChapterTitleUpdate): Promise<void>;
  };
  /**
   * 蓝图再生调用器（2026-09-13 r4 补齐，与生产 useBatchWriter 对齐）：
   * 履约域/命运禁区连续失败 ≥2 次时，用单章蓝图再生活重建本章合同
   * （再生提示词带命运锁与已写状态，过期节点由此改走【解除】或移除角色）。
   * 缺省不启用（旧测试路径行为不变）；真实冒烟必须传，否则命运冲突
   * 只能纯重试到耗尽成洞（r4 ch187 齐王下狱后率兵攻午门五连拒实证）。
   */
  repairBlueprint?: (
    system: string,
    user: string,
    temperature?: number
  ) => Promise<string>;
  /**
   * 细纲跑道监控（与生产 useBatchWriter.ensureOutlineRunwayAsync 同构）：
   * 每章成功后计算跑道（chapter 节点数 − 已建章节数），低于阈值时触发本回调，
   * 由调用方执行滚动续纲（rollOutlineForward）。回调返回的 Promise 会被 await——
   * 生产环境是后台异步不阻塞写作，冒烟为了确定性断言选择同步等待落地；
   * 空章用尽（跑道归零）且续纲仍在途时，生产会等待落地再建章，这里由
   * 「下一章前跑道必须 ≥1」的同步语义等价覆盖。
   */
  onRunwayLow?: (input: {
    runway: number;
    writtenThrough: number;
    nextChapterNumber: number;
    project: Project;
  }) => Promise<void>;
  /** 跑道阈值；与生产 OUTLINE_ROLL_RUNWAY_THRESHOLD 对齐（默认 10） */
  runwayThreshold?: number;
}): Promise<{
  runtimeBackend: HarnessRuntimeBackend;
  runtimeVerification: StoryRuntimeVerification;
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
  // 履约域失败记账（与生产 useBatchWriter 同构）：连续 ≥2 次触发单章蓝图再生，
  // 每章生命周期最多再生 1 次。r4 ch187 实证缺此环的下场：命运冲突五连拒成洞。
  const blueprintRepairLedger = new BlueprintRepairLedger();
  try {
    for (let offset = 0; offset < chapterCount; offset += 1) {
      if (options.signal?.aborted) break;
      const chapterNumber = fromChapter + offset;
      const chapterEntityForRepair = options.project.chapters.find(
        chapter => (chapter.orderIndex ?? 0) === chapterNumber - 1
      );
      // 对齐 useBatchWriter：错误分级重试，耗尽即跳过该章继续（失败章标记 failed，
      // 不阻断全书；此前的「耗尽即结束整批」让 fix2-final100 ch39 一章卡死 61 章）
      let finalResult: ContinueWriteChapterRunResult | null = null;
      let lastError = '';
      let lastErrorKind: ErrorKind = 'unknown';
      let persistentAttempts = 0;
      let aborted = false;
      // 上一轮失败的门禁反馈：重试时作为 seedRevisionHints 传入，让重试带教训而非盲目重跑。
      // 仅 review/wordcount 类失败会产出 gateResult；网络/超时类失败 gateResult 为 null（无需 seed）。
      let seedRevisionHints: string[] | undefined;
      // 伏笔时序死锁熔断：同一伏笔的「提前揭示」拒稿连续 ≥2 次即确认蓝图-伏笔矛盾
      // （写作端两头违约），把该伏笔加入本章豁免——pipeline 从 futureReveals 移除，
      // 让本章按蓝图履约放行。源头防线在蓝图层词面校验，这里只兜死循环
      // （2026-09-10 glm 200 章 ch20 实证：三连拒成洞）。
      const foreshadowRejectCounts = new Map<string, number>();
      const foreshadowExemptions: string[] = [];
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
            foreshadowExemptions: foreshadowExemptions.length > 0 ? [...foreshadowExemptions] : undefined,
            onChapterHydrated: options.onChapterHydrated,
          });
          lastError = finalResult.output.error ?? '';
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          finalResult = null;
        }
        if (finalResult?.output.success) {
          // 成功清账：下一章从头计（与 useBatchWriter.resetChapter 同构）
          if (chapterEntityForRepair) blueprintRepairLedger.resetChapter(chapterEntityForRepair.id);
          break;
        }

        // 从本轮失败的门禁结果提取 blocking 问题，作为下一轮重试的反馈种子。
        // 用 allIssues（扁平合并数组）而非 gates.flatMap——与生产 useBatchWriter 同写法，
        // 语义等价且对 mock/部分 gateResult 更健壮。
        if (finalResult?.output.gateResult) {
          const blocking = (finalResult.output.gateResult.allIssues ?? [])
            .filter(issue => issue.severity === 'critical')
            .map(issue => issue.description)
            .filter((desc): desc is string => Boolean(desc))
            .slice(0, 5);
          if (blocking.length > 0) {
            seedRevisionHints = blocking;
          }
        }

        // 对齐 useBatchWriter：error 为空时按失败形态合成 message，让门禁未通过类
        // 失败两侧都得到 review 标签（triage 签名可比）；抛异常路径的 lastError 原样保留
        if (finalResult && !lastError) {
          lastError =
            finalResult.output.forceAccepted || finalResult.output.gateResult?.passed === false
              ? '严格门禁未通过，章节未提交'
              : '写作失败';
        }

        // 错误分级：优先管道层透传的结构化 errorKind/retryable，缺失才回退文本分类
        // （对齐 useBatchWriter 的 details.errorKind 优先级）
        const classified = classifyChapterRunFailure(
          finalResult?.output ?? null,
          lastError,
          options.signal
        );
        lastErrorKind = classified.kind;

        // 伏笔提前揭示拒稿计数与熔断：judge 拒稿文本引伏笔 hint 的形态有
        // 「伏笔「X」notBeforeChapter=」「futureReveals 规定「X」不得早于」「伏笔『X』的埋设时点」。
        const foreshadowCite = lastError.match(/[伏笔规][」』"]?[：:]?\s*[「『"]([^「」『』"]{6,80})[」』"]/u);
        if (foreshadowCite) {
          const prefix = foreshadowCite[1].slice(0, 16);
          const count = (foreshadowRejectCounts.get(prefix) ?? 0) + 1;
          foreshadowRejectCounts.set(prefix, count);
          if (count >= 2 && !foreshadowExemptions.includes(prefix)) {
            foreshadowExemptions.push(prefix);
            // eslint-disable-next-line no-console
            console.warn(
              `[continueWrite] 第${chapterNumber}章伏笔时序熔断：伏笔「${prefix}…」连续 ${count} 次提前揭示拒稿，确认蓝图与伏笔台账矛盾，本章豁免该伏笔时点禁令（源头应修蓝图）‖`
            );
          }
        }

        // 截断/空响应（抛异常、无 gateResult）时注入固定引导种子，避免下一轮原样盲发。
        // 这类失败 finalResult 为 null，上面 if(gateResult) 提不到反馈，需单独兜底。
        if (classified.kind === 'truncated') {
          seedRevisionHints = [
            '上一轮 AI 返回了空内容或被截断的 JSON。请务必一次性输出完整的 JSON 对象，paragraphs 数组必须包含完整的正文段落，不要在中途停笔，不要返回空字符串。',
          ];
        }
        // aborted（用户停止）：立即停整批
        if (classified.kind === 'aborted') { aborted = true; break; }
        // LongFormWritingEngine 已经只重试过审查阶段；不可用时不再整章重跑。
        if (classified.kind === 'review_unavailable') break;
        // 持久错误（schema/审核/字数/auth/4xx）：不退避，立即重试，但上限 persistentMaxRetries
        if (!classified.retryable) {
          // 履约域/命运冲突失败记账：合同与（履约要求|命运台账）矛盾，纯重试修不好，
          // 达阈值触发蓝图再生（再生提示词带命运锁，过期节点改走【解除】或移除角色）
          if (chapterEntityForRepair && isFulfillmentDomainFailure(lastError)) {
            const failures = blueprintRepairLedger.recordFailure(chapterEntityForRepair.id);
            console.warn(
              `[runContinueWriteChapters] 第${chapterNumber}章履约域失败（累计 ${failures} 次），达阈值后触发蓝图体检/再生`
            );
          }
          // 单章蓝图再生（与生产 useBatchWriter 同构）：以已写状态+命运锁为基底重写本章合同
          if (
            options.repairBlueprint &&
            chapterEntityForRepair &&
            blueprintRepairLedger.shouldTrigger(chapterEntityForRepair.id)
          ) {
            blueprintRepairLedger.markRegenerated(chapterEntityForRepair.id);
            try {
              const repair = await regenerateChapterBlueprint({
                project: options.project,
                chapterNumber,
                callStructuredText: options.repairBlueprint,
              });
              if (repair.blueprint) {
                applyBlueprintToPlotNode(
                  options.project.plotOutline ?? [],
                  chapterNumber,
                  repair.blueprint
                );
                // 合同双侧同步：pipeline 的 goal/角色白名单读 chapter.outline/plotSummary，
                // 只改 plotOutline 会半新半旧（useBatchWriter 同款教训）
                const update = blueprintToChapterUpdate(repair.blueprint);
                chapterEntityForRepair.outline = update.outline;
                chapterEntityForRepair.plotSummary = update.plotSummary;
                // 蓝图换了，旧合同的失败教训作废
                seedRevisionHints = undefined;
                const defectSummary = repair.defects.length > 0
                  ? `（体检缺陷：${repair.defects.map(d => d.kind).join('、')}）`
                  : '';
                console.warn(
                  `[runContinueWriteChapters] 第${chapterNumber}章蓝图已再生${defectSummary}，继续重写正文`
                );
              } else {
                console.warn(
                  `[runContinueWriteChapters] 第${chapterNumber}章蓝图再生未成功：${repair.error}`
                );
              }
            } catch (repairError) {
              console.warn(
                `[runContinueWriteChapters] 第${chapterNumber}章蓝图再生异常（不影响原重试路径）：`,
                repairError
              );
            }
          }
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
        // 瞬态错误（网络/超时/截断/5xx/429）：指数退避重试（429 限流走 15/30/60/120s）
        if (attempt < maxRetries) {
          const waitMs = retryBackoffDelayMs(classified.kind, attempt); // 默认 4/8/16/30/30s
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
        await options.onChapterSettled?.({
          result: finalResult,
          completedChapters: chapters.length,
          requestedChapters: chapterCount,
          project: session.getProject(),
        });
        // 细纲跑道检查（与生产 ensureOutlineRunwayAsync 同构）：每章成功后看跑道，
        // 不足阈值时让调用方滚动续纲。跑道 = 细纲节点数 − 已写章数（空章不消耗跑道，
        // 与生产口径一致——否则预建空章的 mid 模式首章后就触发，状态基底只有 1 章 digest）。
        // 同步 await 保证下一章开写前细纲已就位（生产是后台异步+空章用尽时等待，语义等价）。
        if (options.onRunwayLow) {
          const currentProject = session.getProject();
          const chapterNodeCount = (currentProject.plotOutline ?? []).filter(
            node => node.type === 'chapter'
          ).length;
          const writtenThrough = (currentProject.chapters ?? []).filter(
            chapter => (chapter.content ?? '').trim().length > 0
          ).length;
          const runway = chapterNodeCount - writtenThrough;
          if (runway < (options.runwayThreshold ?? 10)) {
            await options.onRunwayLow({
              runway,
              writtenThrough,
              nextChapterNumber: chapterNumber + 1,
              project: currentProject,
            });
          }
        }
        continue;
      }
      // 重试耗尽（持久/瞬态）：标记失败章后继续下一章。
      // 此前是「结束整批（质量优先，不留白）」——fix2-final100 ch39 引号 5 连败
      // 卡死全书、61 章报废，与完本能力（north-star 验收门⑥）冲突。质量损失的
      // 正确形态是「局部失败洞可见可补」（writeStatus=failed + ending-audit holes
      // + 书审暴露），而不是一章拖垮全书；失败章可由断点续写/补写轮回收。
      const failedChapter =
        options.project.chapters.find(item => item.orderIndex + 1 === chapterNumber) ?? null;
      if (failedChapter) {
        // 对齐 useBatchWriter:1346-1355：失败章标记 writeStatus='failed' + 失败详情，
        // 供失败章节红标/断点续写跳过/重试入口消费。此处直接写 project 副本
        // （harness 无 store updateChannel），语义与 store.updateChapter 一致。
        failedChapter.writeStatus = 'failed';
        failedChapter.lastError = lastError || `重试耗尽（${lastErrorKind}）`;
        failedChapter.lastErrorKind = lastErrorKind;
        failedChapter.lastErrorAt = new Date().toISOString();
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
        await options.onChapterSettled?.({
          result: chapters.at(-1)!,
          completedChapters: chapters.length,
          requestedChapters: chapterCount,
          project: session.getProject(),
        });
      }
      // 重试耗尽：失败章已标记（writeStatus=failed + 失败详情），跳过继续写下一章
      // （abort/用户停止已在上方 break，走到这里的失败不阻断全书完本）
      continue;
    }
    const runtimeVerification = await session.verifyRuntime(options.project.id);
    return {
      runtimeBackend: session.runtimeBackend,
      runtimeVerification,
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

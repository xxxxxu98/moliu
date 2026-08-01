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
import { LegacyProjectMigrator } from '@/services/story-runtime/LegacyProjectMigrator';
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
import type { ChapterWriteOutput } from '@/services/writing/ChapterWritingPipeline';
import { ChapterWritingPipeline } from '@/services/writing/ChapterWritingPipeline';
import {
  BATCH_CONTINUE_PRESET,
  type ChapterWriteOptionFlags,
} from '@/services/writing/chapterWritePresets';
import { createChapterPersistenceClient } from '@/services/writing/chapterPersistenceAdapters';
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
    name: '宋辞',
    attributes: {
      ...bootstrap.entities[0].attributes,
      role: 'protagonist',
      description: '现代法医穿越成贱籍仵作',
    },
  };
  bootstrap.project.description =
    '现代法医宋辞穿越成贱籍仵作，开局因验尸揭露县令之子真凶，反被诬入狱。';

  return new ContractPackBuilder().build({
    bootstrap,
    volume: {
      number: 1,
      title: '清河翻案',
      objective: '主角穿越后三天内完成尸检翻案',
      conflict: 'resource',
      forbidden: ['不能揭示盐铁走私网的全貌'],
    },
    chapter: {
      number: 1,
      title: '第1章',
      goal: '第1章',
      outlineNode: {
        id: 'ch1',
        title: '第1章',
        description: '第1章',
        CBN: '现代法医宋辞穿越成贱籍仵作，正在验尸时当众指出死者系县令公子刘文韬所害，被刘文韬反诬入狱，必须在三天内用尸检铁证翻案自证清白，否则将被处斩',
        CPNs: ['穿越醒来正在验尸'],
        CEN: '推进至：穿越醒来正在验尸',
        mustCover: ['穿越醒来正在验尸'],
        forbiddenZones: ['不能揭示盐铁走私网的全貌'],
      },
    },
    style: ['冷峻写实', '目标约 3000 字，按场景分配篇幅'],
    forbidden: ['不能揭示盐铁走私网的全貌'],
  });
}

/** 按 purpose 返回合法 JSON，供 harness 无真 API 跑通全链路 */
export class ContinueWriteFakeAI implements StructuredAI {
  callCount = 0;

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
            summary: '穿越醒来正在验尸',
            participants: ['hero'],
            causes: [],
            effects: ['穿越醒来正在验尸'],
            evidence: ['宋辞睁开眼，验尸台就在面前。'],
          },
        ],
        deltas: [],
        evidence: ['宋辞睁开眼，验尸台就在面前。'],
      };
    }

    if (
      request.schemaName === 'SupplementParagraphs' ||
      request.prompt.trimStart().startsWith('【补充续写指令】')
    ) {
      return {
        paragraphs: [
          '堂下窃窃私语渐渐散开，宋辞没有抬头，只把尸斑走向、瞳孔反应与索沟深浅一一记在心里。',
          '他知道三天期限像刀子架在脖子上，可越是如此，越要把第一刀验得干净——只要铁证落板，刘文韬再怎么翻脸也没用。',
          '验尸刀落下的一瞬，他忽然想起现代解剖台边的冷白灯光，唇角却没有笑：这具身子不是他的，但这门手艺还在。',
        ],
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
      payload.chapterBeats?.map(beat => beat.summary).join('→') ?? '穿越醒来正在验尸';
    const ids = payload.allowedCandidateEventIds ?? [];
    const filler =
      '他指腹沿着尸斑边缘缓缓推移，脑海中把胃内容物消化程度、现场血点溅射方向与「自缢」说辞逐条对撞，越对越冷。';
    return {
      sceneId: `${beatId}:scene`,
      beatId,
      paragraphs: [
        `宋辞猛地睁开眼，鼻腔里全是硝石灰与血腥气。${arc}。${filler}${filler}`,
        `他压住眩晕，按住尸身腕侧，指腹下的尸斑分布与「自缢」说辞根本对不上。${filler}${filler}`,
        `堂下哄闹声起，刘文韬脸色铁青。宋辞知道：这一指，要么翻案，要么处斩。${filler}${filler}`,
        `三日内若拿不出铁证，刀就落在他自己脖子上——可死人不会说谎，说谎的只会是活人。${filler}`,
      ],
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
  '现代法医宋辞穿越成贱籍仵作，正在验尸时当众指出死者系县令公子刘文韬所害，被刘文韬反诬入狱，必须在三天内用尸检铁证翻案自证清白，否则将被处斩',
  '狱中三日，宋辞凭尸检细节逼迫县衙公开复验，当堂用尸斑与勒痕证明秋月系他杀，刘文韬第一次当众失态',
  '复验过堂后宋辞暂脱死罪，却被卷入州府十一起旧案卷宗，沈炼暗线初现，盐铁走私的阴影压过来',
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
          ? ['穿越醒来正在验尸', '现代法医宋辞穿越成贱籍仵作', '正在验尸时当众指出死者系县令公子刘文韬所害']
          : [`第${index + 1}章推进节点`],
      CEN:
        index === 0
          ? '被刘文韬反诬入狱，必须在三天内用尸检铁证翻案自证清白'
          : `第${index + 1}章收束`,
      mustCover: [arc],
      forbiddenZones: ['不能揭示盐铁走私网的全貌'],
    };
  });
  const project: Project = {
    id: 'project-harness-1',
    name: '仵作提刑官-harness',
    description: cbn,
    genre: [],
    wordCount: 0,
    status: 'writing',
    volumes: [
      {
        id: 'vol-harness-1',
        name: '清河翻案',
        orderIndex: 0,
        summary: '主角穿越后三天内完成尸检翻案',
        createdAt: now,
        updatedAt: now,
      },
    ],
    chapters,
    characters: [
      {
        id: 'hero',
        name: '宋辞',
        role: 'protagonist',
        description: '现代法医穿越成贱籍仵作',
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
          title: '清河翻案',
          objective: '主角穿越后三天内完成尸检翻案',
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

      const bootstrap = new LegacyProjectMigrator().migrate(
        projectWithOutline as unknown as Parameters<LegacyProjectMigrator['migrate']>[0]
      );
      await runtime.bootstrap(bootstrap);

      // 与正式 App 同 persistence（落 Pinia）；记忆提取在冒烟中关闭，避免额外未录制 AI 调用
      const persistence = createChapterPersistenceClient();
      const pipelineDeps = {
        forceStoryRuntime: true as const,
        structuredAI: recording,
        storyRuntimeApi: runtimeHandle.api,
        storyRuntimeClient: runtime,
        preflightService,
        contextAgent,
        persistence,
        memoryClient: {
          extractAndSave: async () => null,
        },
      };

      const targetWordCount = chapterOptions.targetWordCount ?? 3000;
      const writingStyle = 'concise' as const;
      let output: ChapterWriteOutput;

      if (mode === 'smart') {
        // WritingOrchestratorV2.run：不显式传 previousChapter，由 PreflightService 上下文提供衔接
        output = await executeSmartContinue(
          {
            project: projectWithOutline,
            chapter,
            targetWordCount,
            writingStyle,
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
}): Promise<{
  runtimeBackend: HarnessRuntimeBackend;
  project: Project;
  chapters: ContinueWriteChapterRunResult[];
  mode: ContinueWriteMode;
}> {
  const fromChapter = Math.max(1, options.fromChapter);
  const chapterCount = Math.max(1, options.chapterCount);
  const mode: ContinueWriteMode = options.mode ?? 'batch';
  const session = openContinueWriteSession({ project: options.project });
  const chapters: ContinueWriteChapterRunResult[] = [];
  try {
    for (let offset = 0; offset < chapterCount; offset += 1) {
      const chapterNumber = fromChapter + offset;
      const result = await session.runChapter({
        chapterNumber,
        targetWordCount: options.targetWordCount,
        ai: options.ai,
        runId: `${options.runIdPrefix ?? `continue-write-${mode}`}-ch${chapterNumber}-${Date.now()}`,
        persistTrace: options.persistTrace,
        model: options.model,
        provider: options.provider,
        mode,
      });
      chapters.push(result);
      if (!result.output.success) {
        break;
      }
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

import fs from 'node:fs';
import path from 'node:path';

import type { ContractPack, StoryBootstrapData, StoryState } from '@/types/story-runtime';
import { ContractPackBuilder } from '@/services/story-runtime/ContractPackBuilder';
import { LegacyProjectMigrator } from '@/services/story-runtime/LegacyProjectMigrator';
import { buildMidChapterCen, enrichThinCpns } from '@/services/story-runtime/chapterBlueprintNormalize';
import { stripStateForChapterRewrite } from '@/services/story-runtime/ContextPackBuilder';
import { TYPESETTING_HARD_RULES } from '@/services/writing/typesetting';

export interface LocalMoliuProject {
  id: string;
  name: string;
  description?: string;
  genre?: string[];
  volumes?: Array<{
    id: string;
    name: string;
    orderIndex: number;
    summary?: string;
  }>;
  chapters?: Array<{
    id: string;
    volumeId: string;
    title: string;
    content?: string;
    orderIndex: number;
    outline?: string;
    plotSummary?: string;
  }>;
  characters?: Array<{
    id: string;
    name: string;
    role?: string;
    description?: string;
    profile?: Record<string, unknown>;
  }>;
  worldSchema?: {
    rules?: Array<{
      id: string;
      name: string;
      description: string;
      locked?: boolean;
      category?: string;
    }>;
    locations?: Array<Record<string, unknown>>;
    factions?: Array<Record<string, unknown>>;
  };
  foreshadows?: Array<Record<string, unknown>>;
  conflictDesign?: { source?: string };
  /** 正式落盘的剧情大纲（含 CBN/CPN/CEN）；缺失时由 ensurePlotOutlineForLocalProject 派生 */
  plotOutline?: import('@/types/project').PlotNode[];
  metadata?: {
    startupPack?: {
      openingHook?: string;
      chapterBlocks?: Array<{
        range: string;
        objective: string;
        mustEvents: string[];
        hookRequirement?: string;
        forbiddenZones?: string[];
      }>;
    };
    volumePlans?: Array<{
      volumeIndex: number;
      title?: string;
      objective?: string;
      coreConflict?: string;
      payoffForeshadows?: string[];
    }>;
  };
}

function projectsStorePath(): string {
  return path.join(process.env.APPDATA || '', 'moliu', 'moliu-projects.json');
}

export function clearAllChapterContents(project: LocalMoliuProject): LocalMoliuProject {
  const chapters = (project.chapters ?? []).map(chapter => ({
    ...chapter,
    content: '',
    wordCount: 0,
  }));
  return { ...project, chapters };
}

/**
 * 按 plotOutline chapter 节点（或 minCount）补齐空章节槽。
 * 仅内存扩展，不写回 moliu-projects.json；供多章续写冒烟使用。
 */
export function ensureLocalChapterSlots(
  project: LocalMoliuProject,
  minCount: number
): LocalMoliuProject {
  const needed = Math.max(1, Math.floor(minCount));
  const existing = [...(project.chapters ?? [])].sort(
    (a, b) => a.orderIndex - b.orderIndex
  );
  if (existing.length >= needed) {
    return { ...project, chapters: existing };
  }

  const chapterNodes = (project.plotOutline ?? [])
    .filter(node => node && typeof node === 'object' && (node as { type?: string }).type === 'chapter')
    .sort(
      (a, b) =>
        Number((a as { orderIndex?: number }).orderIndex ?? 0) -
        Number((b as { orderIndex?: number }).orderIndex ?? 0)
    ) as Array<{
    title?: string;
    description?: string;
    CBN?: string;
    orderIndex?: number;
  }>;

  const volumes = [...(project.volumes ?? [])].sort(
    (a, b) => a.orderIndex - b.orderIndex
  );
  const fallbackVolumeId = existing[0]?.volumeId || volumes[0]?.id || `vol-harness-${Date.now()}`;
  const chapters = [...existing];

  for (let index = existing.length; index < needed; index += 1) {
    const node = chapterNodes[index];
    const volumeId =
      volumes.length > 0
        ? volumes[Math.min(Math.floor(index / 5), volumes.length - 1)]?.id || fallbackVolumeId
        : fallbackVolumeId;
    chapters.push({
      id: `chapter-harness-${project.id}-${index + 1}`,
      volumeId,
      title: node?.title || `第${index + 1}章`,
      content: '',
      orderIndex: index,
      outline: node?.CBN || node?.description || undefined,
      plotSummary: node?.description || node?.CBN || undefined,
    });
  }

  return { ...project, chapters };
}

export function loadLocalMoliuProject(options: {
  projectId?: string;
  projectName?: string;
}): LocalMoliuProject {
  const storePath = projectsStorePath();
  if (!fs.existsSync(storePath)) {
    throw new Error(`未找到本地项目库：${path.basename(storePath)}`);
  }
  const raw = JSON.parse(fs.readFileSync(storePath, 'utf8')) as {
    projects?: LocalMoliuProject[];
  };
  const projects = raw.projects ?? [];
  // 安全策略：显式指定 projectId/projectName 时未命中必须报错，
  // 禁止静默兜底 projects[0]（避免冒烟清空/外发错误项目的内容）
  const project = options.projectId
    ? projects.find(item => item.id === options.projectId)
    : options.projectName
      ? projects.find(item => item.name === options.projectName)
      : undefined;
  if (!project) {
    const wanted = options.projectId
      ? `projectId=${options.projectId}`
      : options.projectName
        ? `projectName=${options.projectName}`
        : '（未指定 projectId/projectName）';
    throw new Error(
      `本地项目库（${path.basename(storePath)}）中未找到 ${wanted}。` +
        '请检查 temp/continue-write.real.config.json 的 projectId/projectName 是否与 App 项目一致。'
    );
  }
  // id 命中后若同时指定了 name，必须与库中一致（防止 id 误填其他项目时静默错配）
  if (options.projectId && options.projectName && project.name !== options.projectName) {
    throw new Error(
      `项目 id 命中但名称不一致：projectId=${options.projectId} 对应「${project.name}」，` +
        `而 projectName 配置为「${options.projectName}」。请检查 temp/continue-write.real.config.json。`
    );
  }
  return project;
}

function parseBlockRange(range: string): { start: number; end: number } | null {
  const match = range.match(/(\d+)\s*[-~～至到]\s*(\d+)/u);
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]) };
}

/** 按 startupPack.chapterBlocks 推导第 N 章蓝图（与 adapter 同口径） */
export function deriveChapterBlueprintFromStartupPack(
  project: LocalMoliuProject,
  chapterNumber: number
): {
  CBN: string;
  CPNs: string[];
  CEN: string;
  mustCover: string[];
  forbiddenZones: string[];
  goal: string;
} {
  const pack = project.metadata?.startupPack;
  const blocks = pack?.chapterBlocks ?? [];
  const openingHook = pack?.openingHook || project.description || `第${chapterNumber}章`;

  let cursor = 0;
  for (const block of blocks) {
    const range = parseBlockRange(block.range);
    const size = range ? range.end - range.start + 1 : 5;
    const startNo = cursor + 1;
    const endNo = cursor + size;
    if (chapterNumber >= startNo && chapterNumber <= endNo) {
      const i = chapterNumber - startNo;
      const mustEvents =
        block.mustEvents.length > 0 ? block.mustEvents : ['推进本区间主线'];
      const eventStart = Math.floor((i * mustEvents.length) / size);
      const eventEnd = Math.floor(((i + 1) * mustEvents.length) / size);
      const keyEvents = mustEvents.slice(eventStart, Math.max(eventEnd, eventStart + 1));
      const isBlockLast = i === size - 1;
      const CBN =
        chapterNumber === 1
          ? openingHook
          : `承接前段：${block.objective}`;
      const CPNs = enrichThinCpns(
        keyEvents.length > 0 ? keyEvents.slice(0, 3) : [`推进 ${block.objective}`],
        CBN
      );
      const CEN = isBlockLast
        ? block.hookRequirement || `完成本区间第 ${i + 1}/${size} 段推进`
        : buildMidChapterCen(keyEvents.length > 0 ? keyEvents : CPNs, CBN);
      return {
        CBN,
        CPNs,
        CEN,
        mustCover: keyEvents,
        forbiddenZones: block.forbiddenZones ?? [],
        goal: block.objective || openingHook,
      };
    }
    cursor = endNo;
  }

  return {
    CBN: openingHook,
    CPNs: ['推进本章主线'],
    CEN: buildMidChapterCen(['推进本章主线']),
    mustCover: ['推进本章主线'],
    forbiddenZones: [],
    goal: openingHook,
  };
}

export function buildContractsFromLocalProject(
  project: LocalMoliuProject,
  chapterNumber: number,
  targetWordCount: number
): {
  contracts: ContractPack;
  bootstrap: StoryBootstrapData;
  chapter: NonNullable<LocalMoliuProject['chapters']>[number];
  emptiedChapter: NonNullable<LocalMoliuProject['chapters']>[number];
} {
  const chapter = (project.chapters ?? []).find(
    item => item.orderIndex + 1 === chapterNumber
  );
  if (!chapter) {
    throw new Error(`项目 ${project.name} 缺少第 ${chapterNumber} 章`);
  }

  const blueprint = deriveChapterBlueprintFromStartupPack(project, chapterNumber);
  const migrator = new LegacyProjectMigrator();
  const bootstrap = migrator.migrate(
    project as unknown as Parameters<LegacyProjectMigrator['migrate']>[0]
  );

  const volume = (project.volumes ?? []).find(item => item.id === chapter.volumeId);
  const volumePlan =
    project.metadata?.volumePlans?.find(
      item => item.volumeIndex === (volume?.orderIndex ?? 0) + 1
    ) ??
    project.metadata?.volumePlans?.find(
      item => item.volumeIndex === (volume?.orderIndex ?? 0)
    );

  const contracts = new ContractPackBuilder().build({
    bootstrap,
    volume: {
      number: (volume?.orderIndex ?? 0) + 1,
      id: volume?.id,
      title: volume?.name ?? '正文卷',
      objective: volumePlan?.objective ?? volume?.summary ?? project.description ?? '',
      conflict: volumePlan?.coreConflict ?? project.conflictDesign?.source ?? '',
      requiredPayoffs: volumePlan?.payoffForeshadows ?? [],
      forbidden: blueprint.forbiddenZones,
    },
    chapter: {
      number: chapterNumber,
      id: chapter.id,
      title: chapter.title,
      goal: blueprint.goal,
      outlineNode: {
        id: chapter.id,
        title: chapter.title,
        description: blueprint.goal,
        chapterId: chapter.id,
        CBN: blueprint.CBN,
        CPNs: blueprint.CPNs,
        CEN: blueprint.CEN,
        mustCover: blueprint.mustCover,
        keyEvents: blueprint.mustCover,
        forbiddenZones: blueprint.forbiddenZones,
      },
    },
    style: [
      '冷峻写实',
      `目标约 ${targetWordCount} 字，按场景分配篇幅`,
      TYPESETTING_HARD_RULES,
    ],
    forbidden: blueprint.forbiddenZones,
  });

  const emptiedChapter = { ...chapter, content: '', wordCount: 0 };
  return { contracts, bootstrap, chapter, emptiedChapter };
}

/** 从 story-runtime SQLite 尝试读取 canonical state；失败则用 bootstrap 初始态 */
export function loadStateForEmptyRewrite(
  projectId: string,
  bootstrap: StoryBootstrapData,
  chapterNumber: number
): StoryState {
  try {
    const dir = path.join(process.env.APPDATA || '', 'moliu', 'story-runtime');
    if (!fs.existsSync(dir)) {
      return stripStateForChapterRewrite(bootstrap.initialState, chapterNumber);
    }
    const file = fs
      .readdirSync(dir)
      .find(name => name.startsWith(`${projectId}-`) && name.endsWith('.db'));
    if (!file) {
      return stripStateForChapterRewrite(bootstrap.initialState, chapterNumber);
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3') as typeof import('better-sqlite3');
    const db = new Database(path.join(dir, file), { readonly: true, fileMustExist: true });
    try {
      const row = db
        .prepare(
          `SELECT payload_json FROM snapshots WHERE snapshot_type = 'canonical' ORDER BY rowid DESC LIMIT 1`
        )
        .get() as { payload_json?: string } | undefined;
      if (!row?.payload_json) {
        return stripStateForChapterRewrite(bootstrap.initialState, chapterNumber);
      }
      const parsed =
        typeof row.payload_json === 'string'
          ? (JSON.parse(row.payload_json) as StoryState)
          : (row.payload_json as unknown as StoryState);
      return stripStateForChapterRewrite(parsed, chapterNumber);
    } finally {
      db.close();
    }
  } catch {
    return stripStateForChapterRewrite(bootstrap.initialState, chapterNumber);
  }
}

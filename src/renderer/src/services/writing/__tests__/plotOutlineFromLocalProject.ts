/**
 * 从本地项目构建 plotOutline（与正式创建项目 / EnhancedContextAgent 消费口径对齐）
 */
import type { PlotNode } from '@/types/project';
import {
  buildMidChapterCen,
  enrichThinCpns,
  normalizeChapterBlueprint,
} from '@/services/story-runtime/chapterBlueprintNormalize';

import type { LocalMoliuProject } from './loadLocalMoliuProject';

function parseBlockRange(range: string): { start: number; end: number } | null {
  const match = range.match(/(\d+)\s*[-~～至到]\s*(\d+)/u);
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]) };
}

function normalizePlotChapterNode(
  node: PlotNode,
  chapterNumber: number,
  chapterId?: string,
  options?: { previousCen?: string }
): PlotNode {
  const normalized = normalizeChapterBlueprint(
    {
      title: node.title,
      goal: node.description || node.title,
      CBN: node.CBN,
      CPNs: node.CPNs,
      CEN: node.CEN,
      mustCover: node.mustCover,
      keyEvents: node.keyEvents,
      description: node.description,
    },
    chapterNumber,
    { previousCen: options?.previousCen }
  );
  return {
    ...node,
    ...(chapterId ? { chapterId } : {}),
    CBN: normalized.CBN,
    CPNs: normalized.CPNs,
    CEN: normalized.CEN,
    mustCover: normalized.mustCover,
    purpose: `CBN: ${normalized.CBN}\nCEN: ${normalized.CEN}`,
  };
}

/**
 * 优先复用落盘 plotOutline；若无章节节点则从 startupPack 按正式 adapter 同口径派生，
 * 并绑定真实 chapterId 供 ContextAgent 匹配。
 */
export function ensurePlotOutlineForLocalProject(project: LocalMoliuProject): PlotNode[] {
  const chapters = [...(project.chapters ?? [])].sort(
    (a, b) => a.orderIndex - b.orderIndex
  );
  const existing = (project.plotOutline ?? []).filter(
    (node): node is PlotNode => Boolean(node) && typeof node === 'object'
  );
  const existingChapters = existing.filter(node => node.type === 'chapter');
  if (existingChapters.length > 0) {
    let prevCen = '';
    return existing.map(node => {
      if (node.type !== 'chapter') return node;
      const matched =
        (node.chapterId
          ? chapters.find(ch => ch.id === node.chapterId)
          : undefined) ?? chapters[node.orderIndex] ?? chapters.find(
          (_ch, idx) => idx === existingChapters.indexOf(node)
        );
      const chapterNumber = (matched?.orderIndex ?? node.orderIndex ?? 0) + 1;
      const normalized = normalizePlotChapterNode(node, chapterNumber, matched?.id, {
        previousCen: prevCen || undefined,
      });
      prevCen = normalized.CEN;
      return normalized;
    });
  }

  const pack = project.metadata?.startupPack;
  const blocks = pack?.chapterBlocks ?? [];
  const openingHook = pack?.openingHook || project.description || '开篇';
  const nodes: PlotNode[] = [];
  let globalChapterNo = 0;
  let plotIndex = 0;

  if (blocks.length === 0) {
    return chapters.map((chapter, index) =>
      normalizePlotChapterNode(
        {
          id: `plot-ch-${chapter.id}`,
          title: chapter.title,
          description: chapter.outline || chapter.plotSummary || chapter.title,
          type: 'chapter' as const,
          orderIndex: index,
          chapterId: chapter.id,
          CBN: chapter.outline || openingHook,
          CPNs: ['推进本章主线'],
          CEN: buildMidChapterCen(['推进本章主线'], chapter.outline || openingHook),
          mustCover: ['推进本章主线'],
          forbiddenZones: [],
        },
        index + 1,
        chapter.id
      )
    );
  }

  for (const block of blocks) {
    const range = parseBlockRange(block.range);
    const blockSize = range ? Math.max(1, range.end - range.start + 1) : 5;
    const mustEvents =
      block.mustEvents.length > 0 ? block.mustEvents : ['推进本区间主线'];

    for (let i = 0; i < blockSize; i += 1) {
      globalChapterNo += 1;
      const chapter = chapters[globalChapterNo - 1];
      if (!chapter) break;

      const eventStart = Math.floor((i * mustEvents.length) / blockSize);
      const eventEnd = Math.floor(((i + 1) * mustEvents.length) / blockSize);
      const keyEvents = mustEvents.slice(eventStart, Math.max(eventEnd, eventStart + 1));
      const isFirstChapterOverall = globalChapterNo === 1;
      const isBlockLastChapter = i === blockSize - 1;

      const CBN = isFirstChapterOverall
        ? openingHook
        : keyEvents.length > 0
          ? keyEvents.join('，')
          : block.objective;
      const CPNs = enrichThinCpns(
        keyEvents.length > 0 ? keyEvents.slice(0, 3) : [`推进 ${block.objective}`],
        CBN
      );
      const CEN = isBlockLastChapter
        ? block.hookRequirement || `完成本区间第 ${i + 1}/${blockSize} 段推进`
        : buildMidChapterCen(keyEvents.length > 0 ? keyEvents : CPNs, CBN);

      const node = normalizePlotChapterNode(
        {
          id: `plot-${Date.now()}-${plotIndex++}`,
          title: chapter.title,
          description: block.objective || chapter.outline || chapter.title,
          type: 'chapter',
          orderIndex: chapter.orderIndex,
          chapterId: chapter.id,
          keyEvents,
          CBN,
          CPNs,
          CEN,
          mustCover: keyEvents.length > 0 ? keyEvents : ['推进本章主线'],
          forbiddenZones: block.forbiddenZones ?? [],
          purpose: `CBN: ${CBN}\nCEN: ${CEN}`,
        },
        globalChapterNo,
        chapter.id
      );
      nodes.push(node);
    }
  }

  return nodes;
}

import type { ChapterJudge, ChapterJudgeResult, ExtractedFacts } from '@/types/story-runtime';

import { fulfilledLexically } from '../story-runtime/ContinuityValidator';
import type { GateContext, GateIssue } from './types';

const EMPTY_FACTS: ExtractedFacts = { events: [], deltas: [], evidence: [] };

export function collectPendingMustCover(prose: string, mustCover: string[] | undefined): string[] {
  if (!mustCover?.length) return [];
  return mustCover.filter(node => node.trim() && !fulfilledLexically(node, prose, EMPTY_FACTS));
}

export function collectSemanticForbidden(
  prose: string,
  forbiddenZones: string[] | undefined
): string[] {
  if (!forbiddenZones?.length) return [];
  return forbiddenZones.filter(zone => zone.trim() && !prose.includes(zone));
}

/**
 * 流水线入口：在 G5/G7 之前至多跑一次统一语义审查。
 */
export async function ensureChapterJudgeResult(
  ctx: GateContext,
  chapterJudge: ChapterJudge | undefined,
  enableSemanticGate: boolean
): Promise<ChapterJudgeResult | undefined> {
  if (ctx.chapterJudgeResult) return ctx.chapterJudgeResult;
  if (!enableSemanticGate || !chapterJudge) return undefined;

  const pendingMustCover = collectPendingMustCover(ctx.prose, ctx.blueprint?.mustCover);
  const semanticForbidden = collectSemanticForbidden(ctx.prose, ctx.blueprint?.forbiddenZones);
  // 深度语义默认开：即使履约字面全过也审查连贯性（与主链一致）
  return chapterJudge.judge({
    mustCover: pendingMustCover,
    forbiddenZones: semanticForbidden,
    chapterText: ctx.prose,
    checkDeepSemantic: true,
  });
}

export function mapChapterJudgeIssuesToGateIssues(result: ChapterJudgeResult): GateIssue[] {
  const typeToCategory: Record<string, GateIssue['category']> = {
    fact_conflict: 'consistency',
    logic_gap: 'semantic',
    ooc: 'semantic',
    timeline: 'consistency',
    power: 'consistency',
    foreshadow: 'consistency',
  };

  return result.issues.map(item => ({
    category: typeToCategory[item.type] ?? 'semantic',
    severity: item.severity,
    location: item.location || '未知位置',
    description: item.description,
    evidence: item.evidence[0],
    autoFixable: false,
  }));
}

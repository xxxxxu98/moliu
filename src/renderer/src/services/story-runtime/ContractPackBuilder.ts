import type {
  ChapterContract,
  ContractPack,
  LegacyOutlineNode,
  MasterContract,
  ReviewContract,
  SourceTrace,
  StoryBootstrapData,
  VolumeContract,
} from '@/types/story-runtime';

import { normalizeChapterBlueprint } from './chapterBlueprintNormalize';
import { healChapterContract } from './contractHealth';

export interface ContractPackBuildInput {
  bootstrap: StoryBootstrapData;
  volume: {
    number: number;
    id?: string;
    title: string;
    objective: string;
    conflict: string;
    pacing?: string[];
    requiredPayoffs?: string[];
    forbidden?: string[];
  };
  chapter: {
    number: number;
    id?: string;
    title: string;
    goal?: string;
    outlineNode?: LegacyOutlineNode;
    timeAnchor?: string;
    allowedCharacterNames?: string[];
    futureReveals?: Array<{ description: string; notBeforeChapter: number }>;
  };
  style?: string[];
  forbidden?: string[];
  review?: {
    requiredEvidence?: boolean;
    maxWarnings?: number;
    mustCheck?: string[];
  };
}

function trace(source: string, sourceId?: string, chapter?: number): SourceTrace[] {
  return [{ source, sourceId, chapter }];
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

/**
 * 终态随角色真相下发到写作侧（2026-09-04 r5 ch76 实证：状态摘要只喂裁判，
 * writer 看不到实体状态，在押角色陆鸣被写成自由领兵的将领，fact_conflict
 * 三轮耗尽成书空洞）。键集与 FactExtractor 提取合同的 value 枚举一致。
 */
const TERMINAL_STATUS_TRUTHS: Record<string, string> = {
  死亡: '已死亡，不可出场，回忆或转述除外',
  驾崩: '已驾崩，不可出场，回忆或转述除外',
  下狱: '当前在押，仅可以提审、押解或狱中场景出场，不可自由活动或领兵任职',
  越狱: '已越狱在逃，可写潜逃或藏匿场景，不可以官身行事，落网前不得恢复自由官务',
  定罪: '已定罪，按判决现状描写，行刑完成前不得写已伏法',
  去职: '已去职，无官身，不得再以原官职行事，除非剧情明确交代复职',
  获释: '已获释，恢复自由身',
  复职: '已复职，恢复官身',
  平反: '已平反，恢复名誉',
};

function statusTruth(entity: { attributes?: Record<string, unknown> }): string {
  const status = String(entity.attributes?.status ?? '').trim();
  if (!status) return '';
  return TERMINAL_STATUS_TRUTHS[status] ?? `当前状态：${status}`;
}

export class ContractPackBuilder {
  build(input: ContractPackBuildInput): ContractPack {
    const { bootstrap, volume, chapter } = input;
    const node = chapter.outlineNode;
    const immutableRules = bootstrap.rules
      .filter(rule => rule.attributes.locked === true)
      .map(rule => `${rule.name}：${String(rule.attributes.description ?? '')}`);
    const characterTruths = Object.fromEntries(
      bootstrap.entities
        .filter(entity => entity.kind === 'character')
        .map(entity => [
          entity.id,
          unique([
            // 状态真相必须排首位：起草侧 compactContractsForDraft 只保留前 2 条，
            // 排末位会被截掉（2026-09-04 r6 ch66 实证）
            statusTruth(entity),
            entity.name,
            String(entity.attributes.role ?? ''),
            String(entity.attributes.description ?? ''),
          ]),
        ])
    );

    const master: MasterContract = {
      meta: {
        schemaVersion: 'story-runtime/v1',
        kind: 'master',
        id: `${bootstrap.project.id}:master`,
        projectId: bootstrap.project.id,
        sourceTrace: trace('legacy-project', bootstrap.project.id),
      },
      premise: bootstrap.project.description,
      genres: bootstrap.project.genres,
      immutableRules,
      characterTruths,
      style: unique(input.style ?? []),
      forbidden: unique(input.forbidden ?? []),
    };

    const volumeContract: VolumeContract = {
      meta: {
        schemaVersion: 'story-runtime/v1',
        kind: 'volume',
        id: volume.id ?? `${bootstrap.project.id}:volume:${volume.number}`,
        projectId: bootstrap.project.id,
        sourceTrace: trace('volume-plan', volume.id),
      },
      volumeNumber: volume.number,
      title: volume.title,
      objective: volume.objective,
      conflict: volume.conflict,
      pacing: unique(volume.pacing ?? []),
      requiredPayoffs: unique(volume.requiredPayoffs ?? []),
      forbidden: unique([...(input.forbidden ?? []), ...(volume.forbidden ?? [])]),
    };

    const normalized = normalizeChapterBlueprint(
      {
        title: chapter.title,
        goal: chapter.goal ?? node?.description ?? node?.title ?? chapter.title,
        CBN: node?.CBN ?? `承接第 ${Math.max(0, chapter.number - 1)} 章终态`,
        CPNs: node?.CPNs ?? node?.keyEvents,
        CEN: node?.CEN,
        mustCover: node?.mustCover ?? node?.keyEvents,
        keyEvents: node?.keyEvents,
        description: node?.description,
      },
      chapter.number
    );

    const chapterContract: ChapterContract = {
      meta: {
        schemaVersion: 'story-runtime/v1',
        kind: 'chapter',
        id: chapter.id ?? `${bootstrap.project.id}:chapter:${chapter.number}`,
        projectId: bootstrap.project.id,
        sourceTrace: trace('outline-node', node?.id, chapter.number),
      },
      chapterNumber: chapter.number,
      title: chapter.title,
      goal: normalized.goal,
      CBN: normalized.CBN,
      CPNs: normalized.CPNs,
      CEN: normalized.CEN,
      ...(node?.sceneBeats && node.sceneBeats.length > 0
        ? { sceneBeats: node.sceneBeats.map(item => item.trim()).filter(Boolean).slice(0, 6) }
        : {}),
      mustCover: normalized.mustCover,
      forbidden: unique([
        ...master.forbidden,
        ...volumeContract.forbidden,
        ...(node?.forbiddenZones ?? []),
      ]),
      timeAnchor: chapter.timeAnchor,
      allowedCharacterNames: unique(chapter.allowedCharacterNames ?? []),
      futureReveals: (chapter.futureReveals ?? [])
        .filter(item => item.description.trim() && item.notBeforeChapter > chapter.number)
        .map(item => ({
          description: item.description.trim(),
          notBeforeChapter: item.notBeforeChapter,
        })),
    };

    // mustCover×禁区冲突软化 + 畸形 CBN 再清洗（无 state 时不做已兑现去重）
    const { chapter: healedChapter, report: healthReport } = healChapterContract(chapterContract);
    if (healthReport.notes.length > 0) {
      console.info(
        `[ContractPackBuilder] ch${chapter.number} 合同健康度:`,
        healthReport.notes.join('；')
      );
    }

    const reviewContract: ReviewContract = {
      meta: {
        schemaVersion: 'story-runtime/v1',
        kind: 'review',
        id: `${healedChapter.meta.id}:review`,
        projectId: bootstrap.project.id,
        sourceTrace: trace('chapter-contract', healedChapter.meta.id, chapter.number),
      },
      blockingDomains: [
        'entity',
        'knowledge',
        'inventory',
        'timeline',
        'causality',
        'fulfillment',
        'evidence',
      ],
      // 默认 false：事实提取模型常返回事件但漏引证据原文，导致「事件缺证据」误杀——
      // 即使正文完美、mustCover 全兑现也会被 blocking 拒收。fulfillment 仍由 mustCover
      // 语义审查把关，fact_conflict 仍永远 blocking，质量底线不破，只是不再因证据格式不全误杀。
      requiredEvidence: input.review?.requiredEvidence ?? false,
      maxWarnings: input.review?.maxWarnings ?? 3,
      mustCheck: unique([
        ...healedChapter.mustCover,
        ...immutableRules,
        ...(input.review?.mustCheck ?? []),
      ]),
    };

    return {
      master,
      volume: volumeContract,
      chapter: healedChapter,
      review: reviewContract,
    };
  }
}

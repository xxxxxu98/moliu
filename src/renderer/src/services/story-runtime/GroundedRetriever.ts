import type { SceneChunk, SourceTrace } from '@/types/story-runtime';

type StoryRuntimeAPI = Window['electronAPI']['storyRuntime'];

export interface VectorEvidence {
  id: string;
  chapter: number;
  text: string;
  score: number;
  sourceTrace: SourceTrace[];
}

export interface OptionalVectorRetriever {
  search(input: {
    projectId: string;
    query: string;
    beforeChapter: number;
    limit: number;
  }): Promise<VectorEvidence[]>;
}

export interface GroundedRetrievalInput {
  projectId: string;
  query: string;
  entityIds: string[];
  currentChapter: number;
  topK?: number;
}

interface RankedEvidence {
  id: string;
  chapter: number;
  text: string;
  summary: string;
  sourceTrace: SourceTrace[];
}

function stringValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * SQLite 分层检索：结构化事实/实体 → FTS5 → 可选向量 → 一跳因果扩展 → RRF。
 * 向量只提供候选，不参与事实真值判定。
 */
export class GroundedRetriever {
  constructor(
    private readonly api: StoryRuntimeAPI,
    private readonly vectorRetriever?: OptionalVectorRetriever
  ) {}

  async retrieve(input: GroundedRetrievalInput): Promise<SceneChunk[]> {
    const topK = input.topK ?? 8;
    const structured = await this.retrieveStructured(input, topK);
    const fullText = await this.retrieveFullText(input, topK);
    const vector = this.vectorRetriever
      ? await this.vectorRetriever.search({
          projectId: input.projectId,
          query: input.query,
          beforeChapter: input.currentChapter,
          limit: topK,
        })
      : [];
    const causal = await this.expandCausal(input, structured, topK);
    const rankedLists: RankedEvidence[][] = [
      structured,
      fullText,
      vector.map(item => ({
        id: item.id,
        chapter: item.chapter,
        text: item.text,
        summary: item.text.slice(0, 120),
        sourceTrace: item.sourceTrace,
      })),
      causal,
    ];
    const scores = new Map<string, { score: number; evidence: RankedEvidence }>();
    for (const list of rankedLists) {
      list.forEach((evidence, rank) => {
        const previous = scores.get(evidence.id);
        scores.set(evidence.id, {
          evidence,
          score: (previous?.score ?? 0) + 1 / (60 + rank + 1),
        });
      });
    }
    return [...scores.values()]
      .filter(item => item.evidence.chapter < input.currentChapter)
      .sort((left, right) => right.score - left.score)
      .slice(0, topK)
      .map((item, order) => ({
        id: item.evidence.id,
        chapterId: `chapter:${item.evidence.chapter}`,
        chapterIndex: item.evidence.chapter,
        order,
        title: item.evidence.summary,
        text: item.evidence.text,
        summary: item.evidence.summary,
        participants: input.entityIds,
        locations: [],
        sourceTrace: item.evidence.sourceTrace,
      }));
  }

  private async retrieveStructured(
    input: GroundedRetrievalInput,
    limit: number
  ): Promise<RankedEvidence[]> {
    const result: RankedEvidence[] = [];
    for (const entityId of [...new Set(input.entityIds)]) {
      const entity = await this.api.query({
        projectId: input.projectId,
        table: 'entities',
        filters: { id: entityId },
        limit: 1,
      });
      const entityRow = entity.rows[0];
      if (entityRow) {
        result.push({
          id: `entity:${entityId}`,
          chapter: 0,
          text: `${stringValue(entityRow.canonical_name)}：${stringValue(entityRow.description)}`,
          summary: `实体 ${stringValue(entityRow.canonical_name)}`,
          sourceTrace: [{ source: 'entity', sourceId: entityId }],
        });
      }
      const facts = await this.api.query({
        projectId: input.projectId,
        table: 'temporal_facts',
        filters: { subject_id: entityId, status: 'canonical' },
        limit,
      });
      for (const row of facts.rows) {
        const chapter = typeof row.valid_from_chapter === 'number' ? row.valid_from_chapter : 0;
        if (
          chapter >= input.currentChapter ||
          (typeof row.valid_to_chapter === 'number' &&
            row.valid_to_chapter < input.currentChapter)
        ) {
          continue;
        }
        result.push({
          id: `fact:${stringValue(row.id)}`,
          chapter,
          text: `${stringValue(row.predicate)} = ${stringValue(row.object_json)}\n证据：${stringValue(row.evidence)}`,
          summary: `事实 ${stringValue(row.predicate)}`,
          sourceTrace: [
            {
              source: 'temporal_fact',
              sourceId: stringValue(row.id),
              chapter: typeof row.source_chapter === 'number' ? row.source_chapter : chapter,
            },
          ],
        });
      }
      const events = await this.api.query({
        projectId: input.projectId,
        table: 'events',
        filters: { subject_id: entityId },
        beforeChapter: input.currentChapter,
        limit,
      });
      for (const row of events.rows) {
        const chapter = typeof row.chapter === 'number' ? row.chapter : 0;
        const id = stringValue(row.id);
        result.push({
          id: `event:${id}`,
          chapter,
          text: stringValue(row.summary),
          summary: `事件 ${stringValue(row.event_type)}`,
          sourceTrace: [{ source: 'event', sourceId: id, chapter }],
        });
      }
    }
    return result;
  }

  private async retrieveFullText(
    input: GroundedRetrievalInput,
    limit: number
  ): Promise<RankedEvidence[]> {
    const rows = await this.api.query({
      projectId: input.projectId,
      table: 'scene_chunks',
      fullText: input.query,
      beforeChapter: input.currentChapter,
      limit,
    });
    return rows.rows.map(row => {
      const chapter = typeof row.chapter === 'number' ? row.chapter : 0;
      const id = stringValue(row.id);
      return {
        id: `scene:${id}`,
        chapter,
        text: stringValue(row.content),
        summary: stringValue(row.summary),
        sourceTrace: [{ source: 'fts5', sourceId: id, chapter }],
      };
    });
  }

  private async expandCausal(
    input: GroundedRetrievalInput,
    seeds: RankedEvidence[],
    limit: number
  ): Promise<RankedEvidence[]> {
    const eventIds = seeds
      .filter(seed => seed.id.startsWith('event:'))
      .map(seed => seed.id.slice('event:'.length))
      .slice(0, limit);
    const result: RankedEvidence[] = [];
    for (const eventId of eventIds) {
      const edges = await this.api.query({
        projectId: input.projectId,
        table: 'event_edges',
        filters: { from_event_id: eventId },
        limit,
      });
      for (const edge of edges.rows) {
        const targetId = stringValue(edge.to_event_id);
        const target = await this.api.query({
          projectId: input.projectId,
          table: 'events',
          filters: { id: targetId },
          beforeChapter: input.currentChapter,
          limit: 1,
        });
        const row = target.rows[0];
        if (!row) continue;
        const chapter = typeof row.chapter === 'number' ? row.chapter : 0;
        result.push({
          id: `event:${targetId}`,
          chapter,
          text: stringValue(row.summary),
          summary: `因果事件 ${stringValue(row.event_type)}`,
          sourceTrace: [{ source: 'causal_edge', sourceId: targetId, chapter }],
        });
      }
    }
    return result;
  }
}

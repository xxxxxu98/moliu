import type {
  ChapterCommit,
  ChapterCommitReceipt,
  JsonValue,
  SceneChunk,
  StoryBootstrapData,
  StoryPatch,
  StoryState,
} from '@/types/story-runtime';

import {
  bootstrapSchema,
  parseSchema,
  storyStateSchema,
} from './schemas';
import { applyProvisionalOverlay } from './stateOverlay';

type StoryRuntimeAPI = Window['electronAPI']['storyRuntime'];

function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toJsonValue);
  }
  if (typeof value === 'object') {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) result[key] = toJsonValue(item);
    }
    return result;
  }
  return String(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function resolveStoryRuntimeAPI(): StoryRuntimeAPI {
  if (!window.electronAPI.storyRuntime) {
    throw new Error('window.electronAPI.storyRuntime 未注册');
  }
  return window.electronAPI.storyRuntime;
}

export class StoryRuntimeClient {
  private readonly api: StoryRuntimeAPI;

  constructor(api?: StoryRuntimeAPI) {
    this.api = api ?? resolveStoryRuntimeAPI();
  }

  async bootstrap(data: StoryBootstrapData): Promise<void> {
    const validated = parseSchema(bootstrapSchema, data, 'bootstrap 数据');
    const allEntities = [...validated.entities, ...validated.rules, ...validated.foreshadows];
    const seed = {
        contracts: [
          {
            id: `${validated.project.id}:contract:master`,
            kind: 'master',
            scope_id: validated.project.id,
            title: validated.project.title,
            content: validated.project.description,
            payload_json: toJsonValue({
              schemaVersion: validated.schemaVersion,
              genres: validated.project.genres,
              outlineNodes: validated.outlineNodes,
              chapterMemories: validated.chapterMemories,
            }),
          },
        ],
        entities: allEntities.map(entity => ({
          id: entity.id,
          type: entity.kind,
          canonical_name: entity.name,
          description:
            typeof entity.attributes.description === 'string' ? entity.attributes.description : '',
          payload_json: toJsonValue(entity),
        })),
        aliases: allEntities.flatMap(entity =>
          entity.aliases.map(alias => ({
            alias,
            entity_id: entity.id,
            normalized_alias: alias.trim().toLocaleLowerCase(),
          }))
        ),
        temporal_facts: validated.entities
          .filter(entity => entity.kind === 'character')
          .flatMap(entity =>
            Object.entries(entity.attributes)
              .filter(([, value]) => value !== '' && value !== null)
              .map(([predicate, value]) => ({
                id: `${validated.project.id}:legacy-fact:${entity.id}:${predicate}`,
                subject_id: entity.id,
                predicate,
                object_json: value,
                valid_from_chapter: 0,
                valid_to_chapter: null,
                certainty: 1,
                source_event_id: null,
                source_chapter: 0,
                source_scene: null,
                evidence: `存量角色设定：${entity.name}`,
                status: 'canonical',
                confidence: 1,
                recorded_at: new Date().toISOString(),
                superseded_at: null,
              }))
          ),
        events: validated.chapterMemories.map((memory, index) => ({
          id: `${validated.project.id}:legacy-memory:${memory.chapterId || index + 1}`,
          chapter: memory.chapterIndex + 1,
          event_type: 'legacy_chapter_memory',
          subject_id: null,
          summary: memory.corePlot,
          payload_json: toJsonValue(memory),
          occurred_at: memory.timelineMark ?? new Date(0).toISOString(),
        })),
        plot_threads: validated.outlineNodes.map((node, index) => ({
          id: node.id || `${validated.project.id}:outline:${index + 1}`,
          title: node.title,
          status: 'open',
          opened_chapter: node.chapterRange?.[0] ?? 0,
          payload_json: toJsonValue(node),
        })),
        snapshots: [
          {
            id: `${validated.project.id}:snapshot:${validated.initialState.chapter}`,
            chapter: validated.initialState.chapter,
            snapshot_type: 'canonical',
            payload_json: toJsonValue(validated.initialState),
          },
        ],
        scene_chunks: validated.sceneChunks.map(scene => ({
          id: scene.id,
          chapter: scene.chapterIndex,
          scene_index: scene.order,
          content: scene.text,
          summary: scene.summary ?? '',
          metadata_json: toJsonValue({
            chapterId: scene.chapterId,
            title: scene.title,
            participants: scene.participants,
            locations: scene.locations,
            sourceTrace: scene.sourceTrace,
          }),
        })),
      };
    // 先只建 schema；已有 canonical snapshot 时禁止用旧 Project 投影覆盖运行时真源。
    await this.api.bootstrap({ projectId: validated.project.id });
    const existing = await this.api.query({
      projectId: validated.project.id,
      table: 'snapshots',
      filters: { snapshot_type: 'canonical' },
      limit: 1,
    });
    if (existing.total === 0) {
      await this.api.bootstrap({ projectId: validated.project.id, seed });
    }
  }

  async loadState(projectId: string): Promise<StoryState> {
    const firstPage = await this.api.query({
      projectId,
      table: 'snapshots',
      filters: { snapshot_type: 'canonical' },
      limit: 1,
    });
    if (firstPage.total === 0) {
      throw new Error(`项目 ${projectId} 尚未建立 canonical snapshot`);
    }
    return parseSchema(
      storyStateSchema,
      firstPage.rows[0]?.payload_json,
      'Story Runtime 状态'
    );
  }

  async searchScenes(
    projectId: string,
    query: string,
    limit = 8,
    beforeChapter?: number
  ): Promise<SceneChunk[]> {
    if (limit < 1) {
      throw new Error('检索数量必须大于 0');
    }
    const result = await this.api.query({
      projectId,
      table: 'scene_chunks',
      fullText: query.trim() || undefined,
      beforeChapter,
      limit,
    });
    return result.rows.map(row => {
      const metadata = asRecord(row.metadata_json);
      const chapter = typeof row.chapter === 'number' ? row.chapter : 0;
      const sceneIndex = typeof row.scene_index === 'number' ? row.scene_index : 0;
      const id = typeof row.id === 'string' ? row.id : `${projectId}:${chapter}:${sceneIndex}`;
      return {
        id,
        chapterId:
          typeof metadata.chapterId === 'string' ? metadata.chapterId : `chapter:${chapter}`,
        chapterIndex: chapter,
        order: sceneIndex,
        title: typeof metadata.title === 'string' ? metadata.title : '',
        text: typeof row.content === 'string' ? row.content : '',
        summary: typeof row.summary === 'string' ? row.summary : undefined,
        participants: asStringArray(metadata.participants),
        locations: asStringArray(metadata.locations),
        sourceTrace: Array.isArray(metadata.sourceTrace)
          ? (metadata.sourceTrace as SceneChunk['sourceTrace'])
          : [{ source: 'story-runtime', sourceId: id, chapter }],
      };
    });
  }

  async commitChapter(commit: ChapterCommit): Promise<ChapterCommitReceipt> {
    if (commit.status !== 'accepted') {
      throw new Error('rejected commit 禁止发送到 IPC');
    }
    const canonicalState = applyProvisionalOverlay(commit.baseState, commit.overlay);
    canonicalState.chapter = commit.chapterNumber;
    canonicalState.events = canonicalState.events.map(event => ({ ...event, provisional: false }));
    const content = commit.sceneDrafts.flatMap(scene => scene.paragraphs).join('\n\n');
    const temporalFacts = commit.extractedFacts.deltas.flatMap((delta, index) => {
      const segments = delta.path.split('.').filter(Boolean);
      const subjectId = segments[0] === 'entities' ? segments[1] : undefined;
      if (!subjectId || !canonicalState.entities[subjectId]) {
        return [];
      }
      return [
        {
          id: `${commit.id}:fact:${index + 1}`,
          subject_id: subjectId,
          predicate: segments.slice(2).join('.') || delta.operation,
          object_json: toJsonValue(delta.value ?? null),
          valid_from_chapter: commit.chapterNumber,
          valid_to_chapter: null,
          certainty: 1,
          source_event_id: null,
          source_chapter: commit.chapterNumber,
          source_scene: null,
          evidence: delta.evidence,
          status: 'canonical',
          confidence: 1,
          recorded_at: new Date().toISOString(),
          superseded_at: null,
        },
      ];
    });

    // 必须先投影 entities：canonicalize 会引入 char:intro:*，events/temporal_facts 有 FK 引用
    const entityRows = Object.values(canonicalState.entities).map(entity => ({
      id: entity.id,
      type: entity.kind,
      canonical_name: entity.name,
      description:
        typeof entity.attributes.description === 'string' ? entity.attributes.description : '',
      payload_json: toJsonValue(entity),
      last_chapter: commit.chapterNumber,
    }));
    const aliasRows = Object.values(canonicalState.entities).flatMap(entity =>
      entity.aliases.map(alias => ({
        alias,
        entity_id: entity.id,
        normalized_alias: alias.trim().toLocaleLowerCase(),
      }))
    );

    // 同事务写入的本章事件 ID；因果边引用的历史事件也要一并投影，避免 FK 失败
    const chapterEventIds = new Set(commit.extractedFacts.events.map(event => event.id));
    const knownEventIds = new Set([
      ...canonicalState.events.map(event => event.id),
      ...chapterEventIds,
    ]);
    const referencedCauseIds = new Set(
      commit.extractedFacts.events.flatMap(event =>
        event.causes.filter(causeId => knownEventIds.has(causeId) && !chapterEventIds.has(causeId))
      )
    );
    const historicalCauseEvents = canonicalState.events
      .filter(event => referencedCauseIds.has(event.id))
      .map(event => ({
        id: event.id,
        chapter: event.chapter,
        event_type: event.type,
        subject_id: event.participants.find(id => Boolean(canonicalState.entities[id])) ?? null,
        summary: event.summary,
        payload_json: toJsonValue(event),
        occurred_at: event.timestamp ?? new Date().toISOString(),
      }));

    const projections = {
      entities: entityRows,
      aliases: aliasRows,
      drafts: [
        {
          id: `${commit.id}:draft`,
          chapter: commit.chapterNumber,
          title: commit.contractPack.chapter.title,
          content,
          status: 'accepted',
          revision: commit.chapterNumber,
          metadata_json: toJsonValue({ validation: commit.validation }),
        },
      ],
      events: [
        ...historicalCauseEvents,
        ...commit.extractedFacts.events.map(event => ({
          id: event.id,
          chapter: commit.chapterNumber,
          event_type: event.type,
          subject_id: event.participants.find(id => Boolean(canonicalState.entities[id])) ?? null,
          summary: event.summary,
          payload_json: toJsonValue(event),
          occurred_at: event.timestamp ?? new Date().toISOString(),
        })),
      ],
      event_edges: commit.extractedFacts.events.flatMap(event =>
        event.causes
          .filter(causeId => knownEventIds.has(causeId))
          .map(causeId => ({
            from_event_id: causeId,
            to_event_id: event.id,
            edge_type: 'causes',
            payload_json: toJsonValue({ evidence: event.evidence }),
          }))
      ),
      temporal_facts: temporalFacts,
      snapshots: [
        {
          id: `${commit.projectId}:snapshot:${commit.chapterNumber}`,
          chapter: commit.chapterNumber,
          snapshot_type: 'canonical',
          payload_json: toJsonValue(canonicalState),
        },
      ],
      scene_chunks: commit.sceneDrafts.map((scene, index) => ({
        id: scene.sceneId,
        chapter: commit.chapterNumber,
        scene_index: index,
        content: scene.paragraphs.join('\n\n'),
        summary: scene.candidateEvents.map(event => event.summary).join('；'),
        metadata_json: toJsonValue({
          chapterId: `${commit.projectId}:chapter:${commit.chapterNumber}`,
          title: commit.contractPack.chapter.title,
          participants: [...new Set(scene.candidateEvents.flatMap(event => event.participants))],
          locations: scene.candidateEvents
            .map(event => event.locationId)
            .filter((id): id is string => Boolean(id)),
          sourceTrace: [
            { source: 'accepted-commit', sourceId: commit.id, chapter: commit.chapterNumber },
          ],
        }),
      })),
    };
    const raw = await this.api.commitAccepted({
      projectId: commit.projectId,
      commit: {
        id: commit.id,
        chapter: commit.chapterNumber,
        draftId: `${commit.id}:draft`,
        idempotencyKey: commit.id,
        payload: toJsonValue(commit),
      },
      projections,
      outbox: [
        { projectionType: 'summary', payload: toJsonValue({ commitId: commit.id }) },
        { projectionType: 'memory', payload: toJsonValue(commit.extractedFacts) },
        { projectionType: 'embedding', payload: toJsonValue({ commitId: commit.id }) },
      ],
    });
    return {
      commitId: raw.commitId,
      revision: commit.chapterNumber,
      acceptedAt: new Date().toISOString(),
    };
  }

  async saveRejectedDraft(commit: ChapterCommit): Promise<void> {
    if (commit.status !== 'rejected') {
      throw new Error('仅 rejected commit 可写入拒绝草稿区');
    }
    await this.api.upsert({
      projectId: commit.projectId,
      table: 'drafts',
      rows: [
        {
          id: `${commit.id}:rejected`,
          chapter: commit.chapterNumber,
          title: commit.contractPack.chapter.title,
          content: commit.sceneDrafts.flatMap(scene => scene.paragraphs).join('\n\n'),
          status: 'rejected',
          revision: commit.chapterNumber,
          metadata_json: toJsonValue({
            validation: commit.validation,
            reasons: commit.reasons,
          }),
        },
      ],
    });
  }

  async applyPatch(patch: StoryPatch): Promise<void> {
    const content =
      patch.kind === 'scene'
        ? patch.replacement.paragraphs.join('\n\n')
        : patch.replacement;
    await this.api.upsert({
      projectId: patch.projectId,
      table: 'drafts',
      rows: [
        {
          id: `${patch.projectId}:chapter:${patch.chapterNumber}:patch:${patch.sceneId}`,
          chapter: patch.chapterNumber,
          content,
          status: 'patched',
          revision: patch.expectedRevision + 1,
          metadata_json: toJsonValue(patch),
        },
      ],
    });
  }
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const STORY_RUNTIME_TABLES = [
  'contracts',
  'entities',
  'aliases',
  'temporal_facts',
  'character_knowledge',
  'object_states',
  'plot_threads',
  'events',
  'event_edges',
  'drafts',
  'snapshots',
  'scene_chunks',
] as const;

export type StoryRuntimeTable = (typeof STORY_RUNTIME_TABLES)[number];

export interface StoryRuntimeRow {
  [key: string]: JsonValue | undefined;
}

export interface StoryRuntimeBootstrapInput {
  projectId: string;
  seed?: Partial<Record<StoryRuntimeTable, StoryRuntimeRow[]>>;
}

export interface StoryRuntimeUpsertInput {
  projectId: string;
  table: StoryRuntimeTable;
  rows: StoryRuntimeRow[];
}

export interface StoryRuntimeQueryInput {
  projectId: string;
  table: StoryRuntimeTable;
  filters?: Record<string, JsonPrimitive>;
  fullText?: string;
  /** 场景检索的严格历史边界：chapter < beforeChapter。 */
  beforeChapter?: number;
  limit?: number;
  offset?: number;
}

export interface StoryRuntimeQueryResult {
  rows: StoryRuntimeRow[];
  total: number;
}

export interface AcceptedChapterCommit {
  id: string;
  chapter: number;
  draftId?: string;
  idempotencyKey: string;
  payload: JsonValue;
}

export interface ProjectionOutboxItem {
  projectionType: string;
  payload: JsonValue;
}

export interface StoryRuntimeAcceptedCommitInput {
  projectId: string;
  commit: AcceptedChapterCommit;
  /**
   * 与 accepted commit 同事务写入的 canonical/read-model 投影。
   * rejected draft 永远不会进入该接口。
   */
  projections?: Partial<Record<StoryRuntimeTable, StoryRuntimeRow[]>>;
  outbox: ProjectionOutboxItem[];
}

export interface AcceptedCommitResult {
  commitId: string;
  created: boolean;
  outboxIds: number[];
}

export interface StoryRuntimeReadOutboxInput {
  projectId: string;
  limit?: number;
}

export interface StoryRuntimeCompleteOutboxInput {
  projectId: string;
  outboxId: number;
  success: boolean;
  error?: string;
}

export interface StoryRuntimeOutboxRecord {
  id: number;
  commitId: string;
  projectionType: string;
  payload: JsonValue;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  availableAt: string;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
}

export interface StoryRuntimeBootstrapResult {
  projectId: string;
  databasePath: string;
  schemaVersion: number;
  seededRows: number;
}

export interface StoryRuntimeHealth {
  ok: boolean;
  projectId: string;
  databasePath: string;
  schemaVersion: number;
  journalMode: string;
  foreignKeys: boolean;
  integrity: string;
  pendingOutbox: number;
}

export interface StoryRuntimeAPI {
  bootstrap: (input: StoryRuntimeBootstrapInput) => Promise<StoryRuntimeBootstrapResult>;
  upsert: (input: StoryRuntimeUpsertInput) => Promise<{ changedRows: number }>;
  query: (input: StoryRuntimeQueryInput) => Promise<StoryRuntimeQueryResult>;
  commitAccepted: (input: StoryRuntimeAcceptedCommitInput) => Promise<AcceptedCommitResult>;
  readOutbox: (input: StoryRuntimeReadOutboxInput) => Promise<StoryRuntimeOutboxRecord[]>;
  completeOutbox: (input: StoryRuntimeCompleteOutboxInput) => Promise<{ changed: boolean }>;
  health: (projectId: string) => Promise<StoryRuntimeHealth>;
}

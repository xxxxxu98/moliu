import type Database from 'better-sqlite3';
import { STORY_RUNTIME_SCHEMA_VERSION } from './migrations';
import { StoryRuntimeDatabaseManager } from './database';
import { buildUpsertSql } from './upsertSql';
import type {
  AcceptedCommitResult,
  JsonPrimitive,
  JsonValue,
  StoryRuntimeAcceptedCommitInput,
  StoryRuntimeBootstrapInput,
  StoryRuntimeBootstrapResult,
  StoryRuntimeCompleteOutboxInput,
  StoryRuntimeHealth,
  StoryRuntimeOutboxRecord,
  StoryRuntimeQueryInput,
  StoryRuntimeQueryResult,
  StoryRuntimeReadOutboxInput,
  StoryRuntimeRow,
  StoryRuntimeTable,
  StoryRuntimeUpsertInput,
} from './types';
import { STORY_RUNTIME_TABLES } from './types';

interface TableDefinition {
  columns: readonly string[];
  conflictColumns: readonly string[];
  jsonColumns: readonly string[];
  fullTextTable?: string;
}

const TABLE_DEFINITIONS: Record<StoryRuntimeTable, TableDefinition> = {
  contracts: {
    columns: [
      'id',
      'kind',
      'scope_id',
      'version',
      'status',
      'title',
      'content',
      'payload_json',
      'created_at',
      'updated_at',
    ],
    conflictColumns: ['id'],
    jsonColumns: ['payload_json'],
    fullTextTable: 'contracts_fts',
  },
  entities: {
    columns: [
      'id',
      'type',
      'canonical_name',
      'description',
      'payload_json',
      'first_chapter',
      'last_chapter',
      'created_at',
      'updated_at',
    ],
    conflictColumns: ['id'],
    jsonColumns: ['payload_json'],
    fullTextTable: 'entities_fts',
  },
  aliases: {
    columns: ['alias', 'entity_id', 'normalized_alias', 'created_at'],
    conflictColumns: ['alias', 'entity_id'],
    jsonColumns: [],
  },
  temporal_facts: {
    columns: [
      'id',
      'subject_id',
      'predicate',
      'object_json',
      'valid_from_chapter',
      'valid_to_chapter',
      'certainty',
      'source_event_id',
      'source_chapter',
      'source_scene',
      'evidence',
      'status',
      'confidence',
      'recorded_at',
      'superseded_at',
      'created_at',
    ],
    conflictColumns: ['id'],
    jsonColumns: ['object_json'],
  },
  character_knowledge: {
    columns: [
      'id',
      'character_id',
      'fact_id',
      'learned_chapter',
      'forgotten_chapter',
      'certainty',
      'source_event_id',
      'created_at',
    ],
    conflictColumns: ['id'],
    jsonColumns: [],
  },
  object_states: {
    columns: [
      'id',
      'object_id',
      'state_key',
      'value_json',
      'from_chapter',
      'to_chapter',
      'source_event_id',
      'created_at',
    ],
    conflictColumns: ['id'],
    jsonColumns: ['value_json'],
  },
  plot_threads: {
    columns: [
      'id',
      'title',
      'status',
      'opened_chapter',
      'resolved_chapter',
      'payload_json',
      'created_at',
      'updated_at',
    ],
    conflictColumns: ['id'],
    jsonColumns: ['payload_json'],
  },
  events: {
    columns: [
      'id',
      'chapter',
      'event_type',
      'subject_id',
      'summary',
      'payload_json',
      'occurred_at',
      'created_at',
    ],
    conflictColumns: ['id'],
    jsonColumns: ['payload_json'],
  },
  event_edges: {
    columns: ['from_event_id', 'to_event_id', 'edge_type', 'payload_json', 'created_at'],
    conflictColumns: ['from_event_id', 'to_event_id', 'edge_type'],
    jsonColumns: ['payload_json'],
  },
  drafts: {
    columns: [
      'id',
      'chapter',
      'title',
      'content',
      'status',
      'revision',
      'metadata_json',
      'created_at',
      'updated_at',
    ],
    conflictColumns: ['id'],
    jsonColumns: ['metadata_json'],
  },
  snapshots: {
    columns: ['id', 'chapter', 'snapshot_type', 'payload_json', 'created_at'],
    conflictColumns: ['id'],
    jsonColumns: ['payload_json'],
  },
  scene_chunks: {
    columns: [
      'id',
      'chapter',
      'scene_index',
      'content',
      'summary',
      'metadata_json',
      'created_at',
      'updated_at',
    ],
    conflictColumns: ['id'],
    jsonColumns: ['metadata_json'],
    fullTextTable: 'scene_chunks_fts',
  },
};

interface CountRow {
  count: number;
}

interface ExistingCommitRow {
  id: string;
}

interface OutboxDatabaseRow {
  id: number;
  commit_id: string;
  projection_type: string;
  payload_json: string;
  status: StoryRuntimeOutboxRecord['status'];
  attempts: number;
  available_at: string;
  created_at: string;
  updated_at: string;
  last_error: string | null;
}

function bindValue(value: JsonValue | undefined, isJsonColumn: boolean): unknown {
  if (value === undefined) {
    return null;
  }
  if (isJsonColumn) {
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (typeof value === 'object' && value !== null) {
    throw new Error('非 JSON 列只接受标量值');
  }
  return value;
}

function decodeRow(row: Record<string, unknown>, jsonColumns: readonly string[]): StoryRuntimeRow {
  const decoded: StoryRuntimeRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (jsonColumns.includes(key) && typeof value === 'string') {
      decoded[key] = JSON.parse(value) as JsonValue;
    } else if (value === null || typeof value === 'string' || typeof value === 'number') {
      decoded[key] = value;
    } else {
      decoded[key] = String(value);
    }
  }
  return decoded;
}

function toOutboxRecord(row: OutboxDatabaseRow): StoryRuntimeOutboxRecord {
  return {
    id: row.id,
    commitId: row.commit_id,
    projectionType: row.projection_type,
    payload: JSON.parse(row.payload_json) as JsonValue,
    status: row.status,
    attempts: row.attempts,
    availableAt: row.available_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastError: row.last_error,
  };
}

export class StoryRuntimeRepository {
  constructor(private readonly databaseManager: StoryRuntimeDatabaseManager) {}

  bootstrap(input: StoryRuntimeBootstrapInput): StoryRuntimeBootstrapResult {
    const database = this.databaseManager.open(input.projectId);
    let seededRows = 0;

    database.transaction(() => {
      for (const table of STORY_RUNTIME_TABLES) {
        const rows = input.seed?.[table];
        if (!rows?.length) {
          continue;
        }
        seededRows += this.upsertRows(database, table, rows);
      }
    })();

    return {
      projectId: input.projectId,
      databasePath: this.databaseManager.getDatabasePath(input.projectId),
      schemaVersion: STORY_RUNTIME_SCHEMA_VERSION,
      seededRows,
    };
  }

  upsert(input: StoryRuntimeUpsertInput): { changedRows: number } {
    const database = this.databaseManager.open(input.projectId);
    const changedRows = database.transaction(() =>
      this.upsertRows(database, input.table, input.rows)
    )();
    return { changedRows };
  }

  query(input: StoryRuntimeQueryInput): StoryRuntimeQueryResult {
    const database = this.databaseManager.open(input.projectId);
    const definition = TABLE_DEFINITIONS[input.table];
    const clauses: string[] = [];
    const parameters: unknown[] = [];

    for (const [column, value] of Object.entries(input.filters ?? {})) {
      if (!definition.columns.includes(column)) {
        throw new Error(`表 ${input.table} 不允许按字段 ${column} 查询`);
      }
      if (value === null) {
        clauses.push(`source.${column} IS NULL`);
      } else {
        clauses.push(`source.${column} = ?`);
        parameters.push(typeof value === 'boolean' ? Number(value) : value);
      }
    }
    if (input.beforeChapter !== undefined) {
      if (input.table !== 'scene_chunks' && input.table !== 'events') {
        throw new Error(`表 ${input.table} 不支持 beforeChapter`);
      }
      clauses.push('source.chapter < ?');
      parameters.push(input.beforeChapter);
    }

    let fromSql = `${input.table} AS source`;
    if (input.fullText) {
      if (!definition.fullTextTable) {
        throw new Error(`表 ${input.table} 不支持全文检索`);
      }
      fromSql += ` INNER JOIN ${definition.fullTextTable} ON ${definition.fullTextTable}.id = source.id`;
      clauses.push(`${definition.fullTextTable} MATCH ?`);
      parameters.push(`"${input.fullText.replaceAll('"', '""')}"`);
    }

    const whereSql = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const count = database
      .prepare(`SELECT COUNT(*) AS count FROM ${fromSql}${whereSql}`)
      .get(...parameters) as CountRow;
    const orderSql =
      input.fullText && definition.fullTextTable
        ? `bm25(${definition.fullTextTable}), source.rowid DESC`
        : 'source.rowid DESC';
    const rows = database
      .prepare(`SELECT source.* FROM ${fromSql}${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`)
      .all(...parameters, input.limit ?? 100, input.offset ?? 0) as Record<string, unknown>[];

    return {
      rows: rows.map(row => decodeRow(row, definition.jsonColumns)),
      total: count.count,
    };
  }

  commitAccepted(input: StoryRuntimeAcceptedCommitInput): AcceptedCommitResult {
    const database = this.databaseManager.open(input.projectId);
    return database.transaction(() => {
      const existing = database
        .prepare('SELECT id FROM chapter_commits WHERE idempotency_key = ?')
        .get(input.commit.idempotencyKey) as ExistingCommitRow | undefined;

      if (existing) {
        const existingIds = database
          .prepare('SELECT id FROM projection_outbox WHERE commit_id = ? ORDER BY id')
          .all(existing.id) as Array<{ id: number }>;
        return {
          commitId: existing.id,
          created: false,
          outboxIds: existingIds.map(row => row.id),
        };
      }

      for (const table of STORY_RUNTIME_TABLES) {
        const rows = input.projections?.[table];
        if (rows?.length) {
          this.upsertRows(database, table, rows);
        }
      }

      database
        .prepare(
          `INSERT INTO chapter_commits
            (id, chapter, draft_id, status, idempotency_key, payload_json)
           VALUES (?, ?, ?, 'accepted', ?, ?)`
        )
        .run(
          input.commit.id,
          input.commit.chapter,
          input.commit.draftId ?? null,
          input.commit.idempotencyKey,
          JSON.stringify(input.commit.payload)
        );

      const insertOutbox = database.prepare(
        `INSERT INTO projection_outbox
          (commit_id, projection_type, payload_json)
         VALUES (?, ?, ?)`
      );
      const outboxIds = input.outbox.map(item =>
        Number(
          insertOutbox.run(input.commit.id, item.projectionType, JSON.stringify(item.payload))
            .lastInsertRowid
        )
      );

      return { commitId: input.commit.id, created: true, outboxIds };
    })();
  }

  readOutbox(input: StoryRuntimeReadOutboxInput): StoryRuntimeOutboxRecord[] {
    const database = this.databaseManager.open(input.projectId);
    return database.transaction(() => {
      const rows = database
        .prepare(
          `SELECT * FROM projection_outbox
           WHERE (
             status IN ('pending', 'failed') AND available_at <= CURRENT_TIMESTAMP
           ) OR (
             status = 'processing' AND updated_at <= datetime('now', '-5 minutes')
           )
           ORDER BY id
           LIMIT ?`
        )
        .all(input.limit ?? 20) as OutboxDatabaseRow[];

      if (!rows.length) {
        return [];
      }

      const claim = database.prepare(
        `UPDATE projection_outbox
         SET status = 'processing', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND (
           status IN ('pending', 'failed')
           OR (status = 'processing' AND updated_at <= datetime('now', '-5 minutes'))
         )`
      );
      const claimedIds = rows.filter(row => claim.run(row.id).changes === 1).map(row => row.id);
      if (!claimedIds.length) {
        return [];
      }

      const placeholders = claimedIds.map(() => '?').join(', ');
      const claimedRows = database
        .prepare(
          `SELECT * FROM projection_outbox
           WHERE id IN (${placeholders})
           ORDER BY id`
        )
        .all(...claimedIds) as OutboxDatabaseRow[];
      return claimedRows.map(toOutboxRecord);
    })();
  }

  completeOutbox(input: StoryRuntimeCompleteOutboxInput): { changed: boolean } {
    const database = this.databaseManager.open(input.projectId);
    const result = input.success
      ? database
          .prepare(
            `UPDATE projection_outbox
             SET status = 'completed',
                 attempts = attempts + CASE WHEN status = 'processing' THEN 0 ELSE 1 END,
                 last_error = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND status IN ('pending', 'processing', 'failed')`
          )
          .run(input.outboxId)
      : database
          .prepare(
            `UPDATE projection_outbox
             SET status = 'failed',
                 attempts = attempts + CASE WHEN status = 'processing' THEN 0 ELSE 1 END,
                 last_error = ?,
                 available_at = datetime('now', '+30 seconds'),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND status IN ('pending', 'processing', 'failed')`
          )
          .run(input.error ?? '投影处理失败', input.outboxId);
    return { changed: result.changes === 1 };
  }

  health(projectId: string): StoryRuntimeHealth {
    const database = this.databaseManager.open(projectId);
    const journalMode = String(database.pragma('journal_mode', { simple: true })).toLowerCase();
    const foreignKeys = Number(database.pragma('foreign_keys', { simple: true })) === 1;
    const integrity = String(database.pragma('quick_check', { simple: true }));
    const pending = database
      .prepare(
        `SELECT COUNT(*) AS count FROM projection_outbox
         WHERE status IN ('pending', 'processing', 'failed')`
      )
      .get() as CountRow;

    return {
      ok:
        integrity === 'ok' &&
        journalMode === 'wal' &&
        foreignKeys &&
        Number(database.pragma('user_version', { simple: true })) === STORY_RUNTIME_SCHEMA_VERSION,
      projectId,
      databasePath: this.databaseManager.getDatabasePath(projectId),
      schemaVersion: Number(database.pragma('user_version', { simple: true })),
      journalMode,
      foreignKeys,
      integrity,
      pendingOutbox: pending.count,
    };
  }

  private upsertRows(
    database: Database.Database,
    table: StoryRuntimeTable,
    rows: StoryRuntimeRow[]
  ): number {
    const definition = TABLE_DEFINITIONS[table];
    let changedRows = 0;

    for (const row of rows) {
      const columns = Object.keys(row);
      if (!columns.length) {
        throw new Error(`表 ${table} 的写入行不能为空`);
      }
      for (const column of columns) {
        if (!definition.columns.includes(column)) {
          throw new Error(`表 ${table} 不允许写入字段 ${column}`);
        }
      }
      for (const conflictColumn of definition.conflictColumns) {
        if (row[conflictColumn] === undefined) {
          throw new Error(`表 ${table} 缺少冲突键 ${conflictColumn}`);
        }
      }

      // 保留列（first_chapter 首现章）语义与 SQL 构造见 upsertSql.ts
      const { sql } = buildUpsertSql(table, columns, definition);
      const statement = database.prepare(sql);
      const values = columns.map(column =>
        bindValue(row[column], definition.jsonColumns.includes(column))
      );
      changedRows += statement.run(...values).changes;
    }

    return changedRows;
  }
}

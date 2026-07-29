import type Database from 'better-sqlite3';

interface Migration {
  version: number;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE contracts (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        scope_id TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        payload_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (json_valid(payload_json))
      );

      CREATE TABLE entities (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        canonical_name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        payload_json TEXT NOT NULL DEFAULT '{}',
        first_chapter INTEGER,
        last_chapter INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (json_valid(payload_json))
      );

      CREATE TABLE aliases (
        alias TEXT NOT NULL,
        entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        normalized_alias TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (alias, entity_id)
      );

      CREATE TABLE temporal_facts (
        id TEXT PRIMARY KEY,
        subject_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        predicate TEXT NOT NULL,
        object_json TEXT NOT NULL,
        valid_from_chapter INTEGER NOT NULL,
        valid_to_chapter INTEGER,
        certainty REAL NOT NULL DEFAULT 1 CHECK (certainty >= 0 AND certainty <= 1),
        source_event_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (json_valid(object_json)),
        CHECK (valid_to_chapter IS NULL OR valid_to_chapter >= valid_from_chapter)
      );

      CREATE TABLE character_knowledge (
        id TEXT PRIMARY KEY,
        character_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        fact_id TEXT NOT NULL REFERENCES temporal_facts(id) ON DELETE CASCADE,
        learned_chapter INTEGER NOT NULL,
        forgotten_chapter INTEGER,
        certainty REAL NOT NULL DEFAULT 1 CHECK (certainty >= 0 AND certainty <= 1),
        source_event_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (character_id, fact_id, learned_chapter)
      );

      CREATE TABLE object_states (
        id TEXT PRIMARY KEY,
        object_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        state_key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        from_chapter INTEGER NOT NULL,
        to_chapter INTEGER,
        source_event_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (json_valid(value_json)),
        CHECK (to_chapter IS NULL OR to_chapter >= from_chapter)
      );

      CREATE TABLE plot_threads (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        opened_chapter INTEGER NOT NULL,
        resolved_chapter INTEGER,
        payload_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (json_valid(payload_json))
      );

      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        chapter INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        subject_id TEXT REFERENCES entities(id) ON DELETE SET NULL,
        summary TEXT NOT NULL DEFAULT '',
        payload_json TEXT NOT NULL DEFAULT '{}',
        occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (json_valid(payload_json))
      );

      CREATE TABLE event_edges (
        from_event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        to_event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        edge_type TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (from_event_id, to_event_id, edge_type),
        CHECK (json_valid(payload_json))
      );

      CREATE TABLE drafts (
        id TEXT PRIMARY KEY,
        chapter INTEGER NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        revision INTEGER NOT NULL DEFAULT 1,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (json_valid(metadata_json))
      );

      CREATE TABLE chapter_commits (
        id TEXT PRIMARY KEY,
        chapter INTEGER NOT NULL,
        draft_id TEXT REFERENCES drafts(id) ON DELETE SET NULL,
        status TEXT NOT NULL CHECK (status = 'accepted'),
        idempotency_key TEXT NOT NULL UNIQUE,
        payload_json TEXT NOT NULL,
        accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (json_valid(payload_json))
      );

      CREATE TABLE projection_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        commit_id TEXT NOT NULL REFERENCES chapter_commits(id) ON DELETE CASCADE,
        projection_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        available_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_error TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (commit_id, projection_type),
        CHECK (json_valid(payload_json))
      );

      CREATE TABLE snapshots (
        id TEXT PRIMARY KEY,
        chapter INTEGER NOT NULL,
        snapshot_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (json_valid(payload_json))
      );

      CREATE TABLE scene_chunks (
        id TEXT PRIMARY KEY,
        chapter INTEGER NOT NULL,
        scene_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (chapter, scene_index),
        CHECK (json_valid(metadata_json))
      );

      CREATE INDEX idx_contracts_kind_scope ON contracts(kind, scope_id);
      CREATE INDEX idx_entities_type_name ON entities(type, canonical_name);
      CREATE INDEX idx_aliases_normalized ON aliases(normalized_alias);
      CREATE INDEX idx_temporal_facts_subject_chapter
        ON temporal_facts(subject_id, valid_from_chapter, valid_to_chapter);
      CREATE INDEX idx_character_knowledge_character
        ON character_knowledge(character_id, learned_chapter);
      CREATE INDEX idx_object_states_object
        ON object_states(object_id, state_key, from_chapter);
      CREATE INDEX idx_plot_threads_status ON plot_threads(status, opened_chapter);
      CREATE INDEX idx_events_chapter_type ON events(chapter, event_type);
      CREATE INDEX idx_drafts_chapter_revision ON drafts(chapter, revision);
      CREATE INDEX idx_commits_chapter ON chapter_commits(chapter);
      CREATE INDEX idx_outbox_status_available
        ON projection_outbox(status, available_at, id);
      CREATE INDEX idx_snapshots_chapter_type ON snapshots(chapter, snapshot_type);
      CREATE INDEX idx_scene_chunks_chapter ON scene_chunks(chapter, scene_index);

      CREATE VIRTUAL TABLE contracts_fts USING fts5(
        id UNINDEXED,
        title,
        content,
        tokenize = 'trigram'
      );
      CREATE VIRTUAL TABLE entities_fts USING fts5(
        id UNINDEXED,
        canonical_name,
        description,
        tokenize = 'trigram'
      );
      CREATE VIRTUAL TABLE scene_chunks_fts USING fts5(
        id UNINDEXED,
        content,
        summary,
        tokenize = 'trigram'
      );

      CREATE TRIGGER contracts_fts_insert AFTER INSERT ON contracts BEGIN
        INSERT INTO contracts_fts(id, title, content)
        VALUES (new.id, new.title, new.content);
      END;
      CREATE TRIGGER contracts_fts_update AFTER UPDATE ON contracts BEGIN
        DELETE FROM contracts_fts WHERE id = old.id;
        INSERT INTO contracts_fts(id, title, content)
        VALUES (new.id, new.title, new.content);
      END;
      CREATE TRIGGER contracts_fts_delete AFTER DELETE ON contracts BEGIN
        DELETE FROM contracts_fts WHERE id = old.id;
      END;

      CREATE TRIGGER entities_fts_insert AFTER INSERT ON entities BEGIN
        INSERT INTO entities_fts(id, canonical_name, description)
        VALUES (new.id, new.canonical_name, new.description);
      END;
      CREATE TRIGGER entities_fts_update AFTER UPDATE ON entities BEGIN
        DELETE FROM entities_fts WHERE id = old.id;
        INSERT INTO entities_fts(id, canonical_name, description)
        VALUES (new.id, new.canonical_name, new.description);
      END;
      CREATE TRIGGER entities_fts_delete AFTER DELETE ON entities BEGIN
        DELETE FROM entities_fts WHERE id = old.id;
      END;

      CREATE TRIGGER scene_chunks_fts_insert AFTER INSERT ON scene_chunks BEGIN
        INSERT INTO scene_chunks_fts(id, content, summary)
        VALUES (new.id, new.content, new.summary);
      END;
      CREATE TRIGGER scene_chunks_fts_update AFTER UPDATE ON scene_chunks BEGIN
        DELETE FROM scene_chunks_fts WHERE id = old.id;
        INSERT INTO scene_chunks_fts(id, content, summary)
        VALUES (new.id, new.content, new.summary);
      END;
      CREATE TRIGGER scene_chunks_fts_delete AFTER DELETE ON scene_chunks BEGIN
        DELETE FROM scene_chunks_fts WHERE id = old.id;
      END;
    `,
  },
  {
    version: 2,
    sql: `
      ALTER TABLE temporal_facts ADD COLUMN source_chapter INTEGER;
      ALTER TABLE temporal_facts ADD COLUMN source_scene TEXT;
      ALTER TABLE temporal_facts ADD COLUMN evidence TEXT NOT NULL DEFAULT '';
      ALTER TABLE temporal_facts ADD COLUMN status TEXT NOT NULL DEFAULT 'canonical'
        CHECK (status IN ('pending', 'canonical', 'superseded', 'rejected'));
      ALTER TABLE temporal_facts ADD COLUMN confidence REAL NOT NULL DEFAULT 1
        CHECK (confidence >= 0 AND confidence <= 1);
      ALTER TABLE temporal_facts ADD COLUMN recorded_at TEXT;
      ALTER TABLE temporal_facts ADD COLUMN superseded_at TEXT;
      CREATE INDEX idx_temporal_facts_status_time
        ON temporal_facts(status, valid_from_chapter, valid_to_chapter);
    `,
  },
];

export const STORY_RUNTIME_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

export function migrateStoryRuntime(database: Database.Database): number {
  const currentVersion = database.pragma('user_version', { simple: true }) as number;
  if (currentVersion > STORY_RUNTIME_SCHEMA_VERSION) {
    throw new Error(
      `Story Runtime 数据库版本 ${currentVersion} 高于当前支持版本 ${STORY_RUNTIME_SCHEMA_VERSION}`
    );
  }

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) {
      continue;
    }

    database.transaction(() => {
      database.exec(migration.sql);
      database.pragma(`user_version = ${migration.version}`);
    })();
  }

  return database.pragma('user_version', { simple: true }) as number;
}

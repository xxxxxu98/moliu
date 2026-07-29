import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  STORY_RUNTIME_SCHEMA_VERSION,
  StoryRuntimeDatabaseManager,
  StoryRuntimeRepository,
  sanitizeProjectId,
} from '..';

const EXPECTED_TABLES = [
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
  'chapter_commits',
  'projection_outbox',
  'snapshots',
  'scene_chunks',
  'contracts_fts',
  'entities_fts',
  'scene_chunks_fts',
];

describe('StoryRuntimeRepository', () => {
  let userDataPath: string;
  let manager: StoryRuntimeDatabaseManager;
  let repository: StoryRuntimeRepository;

  beforeEach(() => {
    userDataPath = mkdtempSync(path.join(tmpdir(), 'moliu-story-runtime-'));
    manager = new StoryRuntimeDatabaseManager(userDataPath);
    repository = new StoryRuntimeRepository(manager);
  });

  afterEach(() => {
    manager.closeAll();
    rmSync(userDataPath, { recursive: true, force: true });
  });

  it('初始化 WAL、外键、迁移和全部数据表', () => {
    const result = repository.bootstrap({ projectId: 'project-1' });
    const database = manager.open('project-1');
    const tables = database
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'`
      )
      .all()
      .map(row => (row as { name: string }).name);

    expect(result.schemaVersion).toBe(STORY_RUNTIME_SCHEMA_VERSION);
    expect(tables).toEqual(expect.arrayContaining(EXPECTED_TABLES));
    expect(repository.health('project-1')).toMatchObject({
      ok: true,
      journalMode: 'wal',
      foreignKeys: true,
      integrity: 'ok',
    });
  });

  it('安全化 projectId 且数据库路径无法越界', () => {
    const unsafeProjectId = '../../中文/novel';
    const databasePath = manager.getDatabasePath(unsafeProjectId);

    expect(sanitizeProjectId(unsafeProjectId)).not.toContain('..');
    expect(path.dirname(databasePath)).toBe(path.join(userDataPath, 'story-runtime'));
    expect(databasePath.endsWith('.db')).toBe(true);
  });

  it('事务化 bootstrap、upsert 并通过 FTS5 查询', () => {
    const result = repository.bootstrap({
      projectId: 'story',
      seed: {
        entities: [
          {
            id: 'character-1',
            type: 'character',
            canonical_name: '林渊',
            description: '背负秘密的剑客',
            payload_json: { role: 'protagonist' },
          },
        ],
        aliases: [
          {
            alias: '小林',
            entity_id: 'character-1',
            normalized_alias: '小林',
          },
        ],
      },
    });

    expect(result.seededRows).toBe(2);
    expect(
      repository.query({
        projectId: 'story',
        table: 'entities',
        fullText: '秘密的',
        limit: 10,
        offset: 0,
      })
    ).toMatchObject({
      total: 1,
      rows: [
        {
          id: 'character-1',
          payload_json: { role: 'protagonist' },
        },
      ],
    });

    expect(
      repository.upsert({
        projectId: 'story',
        table: 'entities',
        rows: [
          {
            id: 'character-1',
            type: 'character',
            canonical_name: '林渊',
            description: '已揭开秘密的剑客',
            payload_json: { role: 'protagonist', revealed: true },
          },
        ],
      }).changedRows
    ).toBe(1);
  });

  it('accepted commit 与 outbox 在同一事务中且保持幂等', () => {
    const input = {
      projectId: 'story',
      commit: {
        id: 'commit-1',
        chapter: 1,
        draftId: 'draft-1',
        idempotencyKey: 'chapter-1-revision-1',
        payload: { summary: '第一章完成' },
      },
      projections: {
        drafts: [
          {
            id: 'draft-1',
            chapter: 1,
            content: '第一章正文',
            status: 'accepted',
            revision: 1,
            metadata_json: {},
          },
        ],
        snapshots: [
          {
            id: 'snapshot-1',
            chapter: 1,
            snapshot_type: 'canonical',
            payload_json: { chapter: 1 },
          },
        ],
      },
      outbox: [
        { projectionType: 'events', payload: { chapter: 1 } },
        { projectionType: 'snapshot', payload: { chapter: 1 } },
      ],
    };

    repository.bootstrap({ projectId: 'story' });
    const first = repository.commitAccepted(input);
    const duplicate = repository.commitAccepted(input);
    const claimed = repository.readOutbox({ projectId: 'story', limit: 10 });

    expect(first).toMatchObject({ commitId: 'commit-1', created: true });
    expect(first.outboxIds).toHaveLength(2);
    expect(duplicate).toEqual({ ...first, created: false });
    expect(
      repository.query({
        projectId: 'story',
        table: 'snapshots',
        filters: { snapshot_type: 'canonical' },
        limit: 10,
      }).total
    ).toBe(1);
    expect(claimed).toHaveLength(2);
    expect(claimed.every(item => item.status === 'processing')).toBe(true);
    expect(
      repository.completeOutbox({
        projectId: 'story',
        outboxId: claimed[0].id,
        success: true,
      })
    ).toEqual({ changed: true });
    expect(repository.health('story').pendingOutbox).toBe(1);
  });

  it('bootstrap 任一外键失败时回滚全部种子', () => {
    expect(() =>
      repository.bootstrap({
        projectId: 'rollback',
        seed: {
          entities: [
            {
              id: 'character-1',
              type: 'character',
              canonical_name: '林渊',
            },
          ],
          aliases: [
            {
              alias: '不存在',
              entity_id: 'missing',
              normalized_alias: '不存在',
            },
          ],
        },
      })
    ).toThrow();

    expect(
      repository.query({
        projectId: 'rollback',
        table: 'entities',
        limit: 10,
        offset: 0,
      }).total
    ).toBe(0);
  });
});

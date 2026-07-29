import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterEach, describe, expect, it } from 'vitest';
import { StoryRuntimeDatabaseManager, StoryRuntimeRepository } from '..';

describe('Story Runtime 2000 章 SQLite 基准', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('迁移、FTS 检索和重启恢复保持可用', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'moliu-long-form-'));
    roots.push(root);
    const manager = new StoryRuntimeDatabaseManager(root);
    const repository = new StoryRuntimeRepository(manager);
    const scenes = Array.from({ length: 2_000 }, (_, index) => ({
      id: `scene-${index + 1}`,
      chapter: index + 1,
      scene_index: 0,
      content: `第${index + 1}章，林夜追查关键线索${String(index + 1).padStart(4, '0')}。`,
      summary: `关键线索${String(index + 1).padStart(4, '0')}`,
      metadata_json: { participants: ['hero'], locations: ['city'] },
    }));

    const bootstrap = repository.bootstrap({
      projectId: 'benchmark-2000',
      seed: {
        entities: [
          {
            id: 'hero',
            type: 'character',
            canonical_name: '林夜',
            description: '追查真相的主角',
            payload_json: {},
          },
        ],
        scene_chunks: scenes,
        snapshots: [
          {
            id: 'snapshot-2000',
            chapter: 2_000,
            snapshot_type: 'canonical',
            payload_json: { chapter: 2_000 },
          },
        ],
      },
    });
    expect(bootstrap.seededRows).toBe(2_002);

    const latencies: number[] = [];
    for (let index = 1; index <= 50; index += 1) {
      const startedAt = performance.now();
      const result = repository.query({
        projectId: 'benchmark-2000',
        table: 'scene_chunks',
        fullText: `线索${String(index * 40).padStart(4, '0')}`,
        beforeChapter: 2_001,
        limit: 8,
      });
      latencies.push(performance.now() - startedAt);
      expect(result.total).toBeGreaterThan(0);
    }
    latencies.sort((left, right) => left - right);
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    expect(p95).toBeLessThan(200);

    manager.closeAll();
    const reopenedManager = new StoryRuntimeDatabaseManager(root);
    const reopened = new StoryRuntimeRepository(reopenedManager);
    expect(
      reopened.query({
        projectId: 'benchmark-2000',
        table: 'snapshots',
        filters: { snapshot_type: 'canonical' },
        limit: 1,
      }).rows[0]?.chapter
    ).toBe(2_000);
    reopenedManager.closeAll();
  });
});

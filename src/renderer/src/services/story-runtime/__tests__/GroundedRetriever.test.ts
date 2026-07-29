import { describe, expect, it, vi } from 'vitest';
import { GroundedRetriever } from '../GroundedRetriever';

type StoryRuntimeAPI = Window['electronAPI']['storyRuntime'];

describe('GroundedRetriever', () => {
  it('按结构化事实→FTS→因果扩展检索并强制历史边界', async () => {
    const query = vi.fn<StoryRuntimeAPI['query']>(async input => {
      if (input.table === 'entities') {
        return {
          rows: [{ id: 'hero', canonical_name: '林夜', description: '主角' }],
          total: 1,
        };
      }
      if (input.table === 'temporal_facts') {
        return {
          rows: [
            {
              id: 'fact-1',
              subject_id: 'hero',
              predicate: 'power',
              object_json: '筑基',
              valid_from_chapter: 3,
              valid_to_chapter: null,
              source_chapter: 3,
              evidence: '第三章突破',
              status: 'canonical',
            },
          ],
          total: 1,
        };
      }
      if (input.table === 'events' && input.filters?.subject_id === 'hero') {
        return {
          rows: [
            {
              id: 'event-1',
              chapter: 4,
              event_type: 'discovery',
              summary: '发现密道',
            },
          ],
          total: 1,
        };
      }
      if (input.table === 'event_edges') {
        return {
          rows: [{ from_event_id: 'event-1', to_event_id: 'event-2', edge_type: 'causes' }],
          total: 1,
        };
      }
      if (input.table === 'events') {
        return {
          rows: [{ id: 'event-2', chapter: 5, event_type: 'escape', summary: '借密道脱身' }],
          total: 1,
        };
      }
      if (input.table === 'scene_chunks') {
        return {
          rows: [{ id: 'scene-4', chapter: 4, content: '林夜发现密道。', summary: '密道' }],
          total: 1,
        };
      }
      return { rows: [], total: 0 };
    });
    const api = {
      query,
      bootstrap: vi.fn(),
      upsert: vi.fn(),
      commitAccepted: vi.fn(),
      readOutbox: vi.fn(),
      completeOutbox: vi.fn(),
      health: vi.fn(),
    } as unknown as StoryRuntimeAPI;

    const results = await new GroundedRetriever(api).retrieve({
      projectId: 'project-1',
      query: '林夜 密道',
      entityIds: ['hero'],
      currentChapter: 6,
      topK: 8,
    });

    expect(results.some(item => item.sourceTrace[0]?.source === 'temporal_fact')).toBe(true);
    expect(results.some(item => item.sourceTrace[0]?.source === 'fts5')).toBe(true);
    expect(results.some(item => item.sourceTrace[0]?.source === 'causal_edge')).toBe(true);
    expect(results.every(item => item.chapterIndex < 6)).toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({ table: 'scene_chunks', beforeChapter: 6 })
    );
  });
});

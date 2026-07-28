/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services/inspiration/topic-discovery.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/inspiration/topic-discovery.service')
  >('@/services/inspiration/topic-discovery.service');

  return {
    ...actual,
    refreshStorySeeds: vi.fn(async (options: { excludeTitles?: string[] }) => ({
      items: [
        {
          id: 's1',
          title: `Seed-${(options.excludeTitles ?? []).length}`,
          oneLiner: 'line',
          genre: '都市',
          hook: 'h',
          coolPoint: 'c',
          audience: 'general' as const,
        },
        {
          id: 's2',
          title: `SeedB-${(options.excludeTitles ?? []).length}`,
          oneLiner: 'line2',
          genre: '玄幻',
          hook: 'h',
          coolPoint: 'c',
          audience: 'male' as const,
        },
        {
          id: 's3',
          title: `SeedC-${(options.excludeTitles ?? []).length}`,
          oneLiner: 'line3',
          genre: '言情',
          hook: 'h',
          coolPoint: 'c',
          audience: 'female' as const,
        },
      ],
      source: 'ai' as const,
      generatedAt: new Date().toISOString(),
    })),
    refreshGenreInsights: vi.fn(async () => ({
      items: [
        {
          id: 'i1',
          name: '题材甲',
          lifecycle: 'rising' as const,
          audience: 'general' as const,
          reason: 'r',
          opportunity: 'o',
          hotTags: ['a'],
          riskLevel: 'low' as const,
        },
      ],
      source: 'ai' as const,
      generatedAt: new Date().toISOString(),
    })),
  };
});

describe('useTopicDiscovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('refreshes seeds and accumulates exclude history', async () => {
    const { useTopicDiscovery } = await import('@/composables/useTopicDiscovery');
    const { refreshStorySeeds } = await import('@/services/inspiration/topic-discovery.service');

    const discovery = useTopicDiscovery();
    await discovery.refreshSeeds();

    expect(discovery.seeds.value).toHaveLength(3);
    expect(discovery.seedTitleHistory.value.length).toBeGreaterThanOrEqual(3);

    await discovery.refreshSeeds();
    expect(refreshStorySeeds).toHaveBeenCalledTimes(2);

    const secondCall = vi.mocked(refreshStorySeeds).mock.calls[1]?.[0];
    expect(secondCall?.excludeTitles?.length).toBeGreaterThanOrEqual(3);
  });

  it('persists seeds and restores without refetch', async () => {
    const { useTopicDiscovery } = await import('@/composables/useTopicDiscovery');
    const { refreshStorySeeds } = await import('@/services/inspiration/topic-discovery.service');

    const first = useTopicDiscovery();
    await first.refreshSeeds();
    expect(refreshStorySeeds).toHaveBeenCalledTimes(1);
    const savedTitles = first.seeds.value.map((s) => s.title);

    const second = useTopicDiscovery();
    expect(second.loadPersistedSeeds()).toBe(true);
    expect(second.seeds.value.map((s) => s.title)).toEqual(savedTitles);
    expect(refreshStorySeeds).toHaveBeenCalledTimes(1);
  });

  it('persists insights and restores without refetch', async () => {
    const { useTopicDiscovery } = await import('@/composables/useTopicDiscovery');
    const { refreshGenreInsights } = await import('@/services/inspiration/topic-discovery.service');

    const first = useTopicDiscovery();
    await first.refreshInsights();
    expect(refreshGenreInsights).toHaveBeenCalledTimes(1);
    const savedNames = first.insights.value.map((i) => i.name);

    const second = useTopicDiscovery();
    expect(second.loadPersistedInsights()).toBe(true);
    expect(second.insights.value.map((i) => i.name)).toEqual(savedNames);
    expect(refreshGenreInsights).toHaveBeenCalledTimes(1);
  });

  it('ignores stale refresh results (race)', async () => {
    const { refreshStorySeeds } = await import('@/services/inspiration/topic-discovery.service');
    let resolveFirst: (value: unknown) => void = () => undefined;

    vi.mocked(refreshStorySeeds)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve as (value: unknown) => void;
          }) as ReturnType<typeof refreshStorySeeds>,
      )
      .mockImplementationOnce(async () => ({
        items: [
          {
            id: 'new',
            title: '最新一批',
            oneLiner: 'x',
            genre: '都市',
            hook: 'h',
            coolPoint: 'c',
            audience: 'general',
          },
        ],
        source: 'ai',
        generatedAt: new Date().toISOString(),
      }));

    const { useTopicDiscovery } = await import('@/composables/useTopicDiscovery');
    const discovery = useTopicDiscovery();

    const firstPromise = discovery.refreshSeeds();
    const secondPromise = discovery.refreshSeeds();

    await secondPromise;
    resolveFirst({
      items: [
        {
          id: 'old',
          title: '过期一批',
          oneLiner: 'old',
          genre: '都市',
          hook: 'h',
          coolPoint: 'c',
          audience: 'general',
        },
      ],
      source: 'ai',
      generatedAt: new Date().toISOString(),
    });
    await firstPromise;

    expect(discovery.seeds.value[0]?.title).toBe('最新一批');
  });
});

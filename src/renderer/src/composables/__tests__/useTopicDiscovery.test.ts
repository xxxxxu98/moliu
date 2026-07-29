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
    refreshStorySeeds: vi.fn(async (options: { excludeTitles?: string[]; playStyle?: string }) => ({
      items: [
        {
          id: 's1',
          title: `Seed-${options.playStyle ?? 'standard'}-${(options.excludeTitles ?? []).length}`,
          oneLiner: 'line',
          genre: '都市',
          hook: 'h',
          coolPoint: 'c',
          audience: 'general' as const,
        },
        {
          id: 's2',
          title: `SeedB-${options.playStyle ?? 'standard'}-${(options.excludeTitles ?? []).length}`,
          oneLiner: 'line2',
          genre: '玄幻',
          hook: 'h',
          coolPoint: 'c',
          audience: 'male' as const,
        },
        {
          id: 's3',
          title: `SeedC-${options.playStyle ?? 'standard'}-${(options.excludeTitles ?? []).length}`,
          oneLiner: 'line3',
          genre: '言情',
          hook: 'h',
          coolPoint: 'c',
          audience: 'female' as const,
        },
        {
          id: 's4',
          title: `SeedD-${options.playStyle ?? 'standard'}-${(options.excludeTitles ?? []).length}`,
          oneLiner: 'line4',
          genre: '科幻',
          hook: 'h',
          coolPoint: 'c',
          audience: 'general' as const,
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

    expect(discovery.seeds.value).toHaveLength(4);
    expect(discovery.seedTitleHistory.value.length).toBeGreaterThanOrEqual(4);

    await discovery.refreshSeeds();
    expect(refreshStorySeeds).toHaveBeenCalledTimes(2);

    const secondCall = vi.mocked(refreshStorySeeds).mock.calls[1]?.[0];
    expect(secondCall?.excludeTitles?.length).toBeGreaterThanOrEqual(4);
  });

  it('persists seeds and restores without refetch', async () => {
    const { useTopicDiscovery } = await import('@/composables/useTopicDiscovery');
    const { refreshStorySeeds } = await import('@/services/inspiration/topic-discovery.service');

    const first = useTopicDiscovery();
    await first.refreshSeeds();
    expect(refreshStorySeeds).toHaveBeenCalledTimes(1);
    const savedTitles = first.seeds.value.map(s => s.title);

    const second = useTopicDiscovery();
    expect(second.loadPersistedSeeds()).toBe(true);
    expect(second.seeds.value.map(s => s.title)).toEqual(savedTitles);
    expect(refreshStorySeeds).toHaveBeenCalledTimes(1);
  });

  it('persists insights and restores without refetch', async () => {
    const { useTopicDiscovery } = await import('@/composables/useTopicDiscovery');
    const { refreshGenreInsights } = await import('@/services/inspiration/topic-discovery.service');

    const first = useTopicDiscovery();
    await first.refreshInsights();
    expect(refreshGenreInsights).toHaveBeenCalledTimes(1);
    const savedNames = first.insights.value.map(i => i.name);

    const second = useTopicDiscovery();
    expect(second.loadPersistedInsights()).toBe(true);
    expect(second.insights.value.map(i => i.name)).toEqual(savedNames);
    expect(refreshGenreInsights).toHaveBeenCalledTimes(1);
  });

  it('ignores stale refresh results (race)', async () => {
    const { refreshStorySeeds } = await import('@/services/inspiration/topic-discovery.service');
    let resolveFirst: (value: unknown) => void = () => undefined;

    vi.mocked(refreshStorySeeds)
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
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

  it('isolates seed data across play modes', async () => {
    const { useTopicDiscovery } = await import('@/composables/useTopicDiscovery');

    const discovery = useTopicDiscovery();
    await discovery.refreshSeeds();
    const seedTitles = discovery.seeds.value.map(s => s.title);
    expect(seedTitles.length).toBe(4);

    discovery.switchTab('mix');
    expect(discovery.seeds.value).toEqual([]);

    await discovery.refreshFromMix({ tags: ['修仙'], elements: ['系统流'] });
    const mixTitles = discovery.seeds.value.map(s => s.title);
    expect(mixTitles.length).toBe(4);
    expect(mixTitles).not.toEqual(seedTitles);

    discovery.switchTab('seeds');
    expect(discovery.seeds.value.map(s => s.title)).toEqual(seedTitles);

    discovery.switchTab('dice');
    expect(discovery.seeds.value).toEqual([]);

    discovery.switchTab('twist');
    expect(discovery.seeds.value).toEqual([]);
    await discovery.refresh('twist');
    expect(discovery.seeds.value.length).toBe(4);

    discovery.switchTab('seeds');
    expect(discovery.seeds.value.map(s => s.title)).toEqual(seedTitles);
  });

  it('mix/dice do not inherit locked genre from radar', async () => {
    const { useTopicDiscovery } = await import('@/composables/useTopicDiscovery');
    const { refreshStorySeeds } = await import('@/services/inspiration/topic-discovery.service');

    const discovery = useTopicDiscovery();
    discovery.setLockedGenre('都市爽文');
    discovery.setLockedAudience('male');

    await discovery.refreshFromMix({ tags: ['修仙'], elements: ['系统流'] });
    const mixCall = vi.mocked(refreshStorySeeds).mock.calls.at(-1)?.[0];
    expect(mixCall?.playStyle).toBe('mix');
    expect(mixCall?.mixTags).toEqual(['修仙']);
    expect(mixCall?.lockedSlots?.genre).toBeUndefined();
    expect(mixCall?.genre).toBe('修仙');
    expect(mixCall?.audience).toBe('male');

    await discovery.refreshFromDice({
      genre: '末世',
      hook: '倒计时危机',
      twist: '系统坏掉了',
    });
    const diceCall = vi.mocked(refreshStorySeeds).mock.calls.at(-1)?.[0];
    expect(diceCall?.playStyle).toBe('dice');
    expect(diceCall?.lockedSlots?.genre).toBeUndefined();
    expect(diceCall?.genre).toBe('末世');
    expect(diceCall?.diceRoll?.twist).toBe('系统坏掉了');
  });

  it('persists buckets separately and migrates legacy single-bucket cache', async () => {
    const { useTopicDiscovery } = await import('@/composables/useTopicDiscovery');

    // legacy key
    localStorage.setItem(
      'moliu:topic-discovery:seeds',
      JSON.stringify({
        seeds: [
          {
            id: 'legacy',
            title: '旧种子',
            oneLiner: 'old',
            genre: '都市',
            hook: 'h',
            coolPoint: 'c',
            audience: 'general',
          },
        ],
        source: 'fallback',
        warning: 'legacy',
        seedTitleHistory: ['旧种子'],
        lockedGenre: null,
        lockedAudience: null,
        savedAt: new Date().toISOString(),
      }),
    );

    const discovery = useTopicDiscovery();
    expect(discovery.loadPersistedSeeds()).toBe(true);
    expect(discovery.seeds.value[0]?.title).toBe('旧种子');

    discovery.switchTab('mix');
    expect(discovery.seeds.value).toEqual([]);
  });
});

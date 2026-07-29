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

  it('cancelRefresh ignores in-flight result and keeps previous seeds', async () => {
    const { refreshStorySeeds } = await import('@/services/inspiration/topic-discovery.service');
    let resolveSlow: (value: unknown) => void = () => undefined;

    const { useTopicDiscovery } = await import('@/composables/useTopicDiscovery');
    const discovery = useTopicDiscovery();
    await discovery.refreshSeeds();
    const keptTitle = discovery.seeds.value[0]?.title;
    expect(keptTitle).toBeTruthy();

    vi.mocked(refreshStorySeeds).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveSlow = resolve as (value: unknown) => void;
        }) as ReturnType<typeof refreshStorySeeds>,
    );

    const pending = discovery.refreshSeeds();
    expect(discovery.isRefreshing.value).toBe(true);

    discovery.cancelRefresh();
    expect(discovery.isRefreshing.value).toBe(false);
    expect(discovery.seeds.value[0]?.title).toBe(keptTitle);

    resolveSlow({
      items: [
        {
          id: 'should-ignore',
          title: '应被忽略',
          oneLiner: 'x',
          genre: '都市',
          hook: 'h',
          coolPoint: 'c',
          audience: 'general',
        },
      ],
      source: 'ai',
      generatedAt: new Date().toISOString(),
    });
    await pending;

    expect(discovery.seeds.value[0]?.title).toBe(keptTitle);
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

  it('passes platform/length locks into seed and radar refresh', async () => {
    const { useTopicDiscovery } = await import('@/composables/useTopicDiscovery');
    const { refreshStorySeeds, refreshGenreInsights } = await import(
      '@/services/inspiration/topic-discovery.service'
    );

    const discovery = useTopicDiscovery();
    discovery.setLockedPlatform('fanqie');
    discovery.setLockedLength('short');

    await discovery.refreshSeeds();
    const seedCall = vi.mocked(refreshStorySeeds).mock.calls.at(-1)?.[0];
    expect(seedCall?.platform).toBe('fanqie');
    expect(seedCall?.length).toBe('short');
    expect(seedCall?.lockedSlots?.platform).toBe('fanqie');
    expect(seedCall?.lockedSlots?.length).toBe('short');

    await discovery.refreshInsights();
    const radarCall = vi.mocked(refreshGenreInsights).mock.calls.at(-1)?.[0];
    expect(radarCall?.platform).toBe('fanqie');
    expect(radarCall?.length).toBe('short');
  });

  it('adopts insight with full context and keeps it on next seed refresh', async () => {
    const { useTopicDiscovery } = await import('@/composables/useTopicDiscovery');
    const { refreshStorySeeds, refreshGenreInsights } = await import(
      '@/services/inspiration/topic-discovery.service'
    );

    vi.mocked(refreshGenreInsights).mockResolvedValueOnce({
      items: [
        {
          id: 'i-radar',
          name: '规则怪谈',
          lifecycle: 'rising',
          audience: 'general',
          reason: '传播强',
          opportunity: '用职场规则做生存副本',
          hotTags: ['规则', '职场'],
          riskLevel: 'medium',
          platform: 'fanqie',
          length: 'short',
        },
      ],
      source: 'ai',
      generatedAt: new Date().toISOString(),
    });

    const discovery = useTopicDiscovery();
    await discovery.refreshInsights();
    const insight = discovery.insights.value[0];
    expect(insight).toBeTruthy();

    await discovery.adoptInsightAndRefreshSeeds(insight!);
    const adoptCall = vi.mocked(refreshStorySeeds).mock.calls.at(-1)?.[0];
    expect(adoptCall?.genre).toBe('规则怪谈');
    expect(adoptCall?.insightContext?.opportunity).toContain('职场规则');
    expect(adoptCall?.insightContext?.hotTags).toEqual(['规则', '职场']);
    expect(discovery.lockedPlatform.value).toBe('fanqie');
    expect(discovery.lockedLength.value).toBe('short');
    expect(discovery.activeInsightContext.value?.name).toBe('规则怪谈');

    await discovery.refreshSeeds();
    const nextCall = vi.mocked(refreshStorySeeds).mock.calls.at(-1)?.[0];
    expect(nextCall?.insightContext?.opportunity).toContain('职场规则');

    discovery.clearLocks();
    expect(discovery.activeInsightContext.value).toBeNull();
    expect(discovery.lockedPlatform.value).toBeNull();
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

  it('favorites persist across refresh and play-mode switches', async () => {
    const { useTopicDiscovery, favoriteSeedKey } = await import(
      '@/composables/useTopicDiscovery'
    );

    const discovery = useTopicDiscovery();
    await discovery.refreshSeeds();
    const seed = discovery.seeds.value[0]!;

    const added = discovery.toggleFavorite(seed, 'seeds');
    expect(added).toEqual({ ok: true, action: 'added' });
    expect(discovery.isFavorite(seed)).toBe(true);
    expect(discovery.favoriteCount.value).toBe(1);

    await discovery.refreshSeeds();
    // 同标题同题材仍视为已收藏（即使 id 变了）
    const sameKeySeed = discovery.seeds.value.find(
      s => favoriteSeedKey(s) === favoriteSeedKey(seed),
    );
    if (sameKeySeed) {
      expect(discovery.isFavorite(sameKeySeed)).toBe(true);
    }

    discovery.switchTab('mix');
    expect(discovery.favorites.value).toHaveLength(1);

    const second = useTopicDiscovery();
    expect(second.loadPersistedFavorites()).toBe(true);
    expect(second.favorites.value[0]?.seed.title).toBe(seed.title);

    const removed = second.toggleFavorite(second.favorites.value[0]!.seed);
    expect(removed).toEqual({ ok: true, action: 'removed' });
    expect(second.favoriteCount.value).toBe(0);
  });

  it('enforces favorites limit', async () => {
    const { useTopicDiscovery } = await import('@/composables/useTopicDiscovery');
    const discovery = useTopicDiscovery();

    for (let i = 0; i < discovery.maxFavorites; i += 1) {
      const result = discovery.toggleFavorite(
        {
          id: `id-${i}`,
          title: `标题${i}`,
          oneLiner: `line-${i}`,
          genre: '都市',
          hook: 'h',
          coolPoint: 'c',
          audience: 'general',
        },
        'seeds',
      );
      expect(result.ok).toBe(true);
    }

    const overflow = discovery.toggleFavorite(
      {
        id: 'overflow',
        title: '溢出种子',
        oneLiner: 'overflow',
        genre: '玄幻',
        hook: 'h',
        coolPoint: 'c',
        audience: 'general',
      },
      'seeds',
    );
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) {
      expect(overflow.action).toBe('limit');
    }
    expect(discovery.favoriteCount.value).toBe(discovery.maxFavorites);

    discovery.clearFavorites();
    expect(discovery.favoriteCount.value).toBe(0);
  });
});

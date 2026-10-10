/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

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
    // 每次新建 Pinia，避免 store 单例状态在测试间串扰
    setActivePinia(createPinia());
  });

  it('refreshes seeds and accumulates exclude history', async () => {
    const { useTopicDiscoveryStore: useTopicDiscovery } = await import('@/stores/topicDiscovery.store');
    const { refreshStorySeeds } = await import('@/services/inspiration/topic-discovery.service');

    const discovery = useTopicDiscovery();
    await discovery.refreshSeeds();

    expect(discovery.seeds).toHaveLength(4);
    expect(discovery.seedTitleHistory.length).toBeGreaterThanOrEqual(4);

    await discovery.refreshSeeds();
    expect(refreshStorySeeds).toHaveBeenCalledTimes(2);

    const secondCall = vi.mocked(refreshStorySeeds).mock.calls[1]?.[0];
    expect(secondCall?.excludeTitles?.length).toBeGreaterThanOrEqual(4);
  });

  it('persists seeds and restores without refetch', async () => {
    const { useTopicDiscoveryStore: useTopicDiscovery } = await import('@/stores/topicDiscovery.store');
    const { refreshStorySeeds } = await import('@/services/inspiration/topic-discovery.service');

    const first = useTopicDiscovery();
    await first.refreshSeeds();
    expect(refreshStorySeeds).toHaveBeenCalledTimes(1);
    const savedTitles = first.seeds.map(s => s.title);

    const second = useTopicDiscovery();
    expect(second.loadPersistedSeeds()).toBe(true);
    expect(second.seeds.map(s => s.title)).toEqual(savedTitles);
    expect(refreshStorySeeds).toHaveBeenCalledTimes(1);
  });

  it('persists insights and restores without refetch', async () => {
    const { useTopicDiscoveryStore: useTopicDiscovery } = await import('@/stores/topicDiscovery.store');
    const { refreshGenreInsights } = await import('@/services/inspiration/topic-discovery.service');

    const first = useTopicDiscovery();
    await first.refreshInsights();
    expect(refreshGenreInsights).toHaveBeenCalledTimes(1);
    const savedNames = first.insights.map(i => i.name);

    const second = useTopicDiscovery();
    expect(second.loadPersistedInsights()).toBe(true);
    expect(second.insights.map(i => i.name)).toEqual(savedNames);
    expect(refreshGenreInsights).toHaveBeenCalledTimes(1);
  });

  it('ignores stale refresh results (race) and aborts previous signal', async () => {
    const { refreshStorySeeds } = await import('@/services/inspiration/topic-discovery.service');
    let firstSignal: AbortSignal | undefined;
    let resolveFirst: (value: unknown) => void = () => undefined;

    vi.mocked(refreshStorySeeds)
      .mockImplementationOnce(
        (options: { signal?: AbortSignal }) =>
          new Promise(resolve => {
            firstSignal = options.signal;
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

    const { useTopicDiscoveryStore: useTopicDiscovery } = await import('@/stores/topicDiscovery.store');
    const discovery = useTopicDiscovery();

    const firstPromise = discovery.refreshSeeds();
    const secondPromise = discovery.refreshSeeds();

    expect(firstSignal?.aborted).toBe(true);

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

    expect(discovery.seeds[0]?.title).toBe('最新一批');
  });

  it('cancelRefresh aborts in-flight request and keeps previous seeds', async () => {
    const { refreshStorySeeds } = await import('@/services/inspiration/topic-discovery.service');
    let aborted = false;

    const { useTopicDiscoveryStore: useTopicDiscovery } = await import('@/stores/topicDiscovery.store');
    const discovery = useTopicDiscovery();
    await discovery.refreshSeeds();
    const keptTitle = discovery.seeds[0]?.title;
    expect(keptTitle).toBeTruthy();

    vi.mocked(refreshStorySeeds).mockImplementationOnce(
      (options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            aborted = true;
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }) as ReturnType<typeof refreshStorySeeds>,
    );

    const pending = discovery.refreshSeeds();
    expect(discovery.isRefreshing).toBe(true);

    discovery.cancelRefresh();
    expect(discovery.isRefreshing).toBe(false);
    expect(aborted).toBe(true);
    expect(discovery.seeds[0]?.title).toBe(keptTitle);

    await pending;

    expect(discovery.seeds[0]?.title).toBe(keptTitle);
    expect(discovery.error).toBeNull();
  });

  it('isolates seed data across play modes', async () => {
    const { useTopicDiscoveryStore: useTopicDiscovery } = await import('@/stores/topicDiscovery.store');

    const discovery = useTopicDiscovery();
    await discovery.refreshSeeds();
    const seedTitles = discovery.seeds.map(s => s.title);
    expect(seedTitles.length).toBe(4);

    discovery.switchTab('mix');
    expect(discovery.seeds).toEqual([]);

    await discovery.refreshFromMix({ tags: ['修仙'], elements: ['系统流'] });
    const mixTitles = discovery.seeds.map(s => s.title);
    expect(mixTitles.length).toBe(4);
    expect(mixTitles).not.toEqual(seedTitles);

    discovery.switchTab('seeds');
    expect(discovery.seeds.map(s => s.title)).toEqual(seedTitles);

    discovery.switchTab('dice');
    expect(discovery.seeds).toEqual([]);

    discovery.switchTab('twist');
    expect(discovery.seeds).toEqual([]);
    await discovery.refresh('twist');
    expect(discovery.seeds.length).toBe(4);

    discovery.switchTab('seeds');
    expect(discovery.seeds.map(s => s.title)).toEqual(seedTitles);
  });

  it('mix/dice do not inherit locked genre from radar', async () => {
    const { useTopicDiscoveryStore: useTopicDiscovery } = await import('@/stores/topicDiscovery.store');
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
    const { useTopicDiscoveryStore: useTopicDiscovery } = await import('@/stores/topicDiscovery.store');
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
    const { useTopicDiscoveryStore: useTopicDiscovery } = await import('@/stores/topicDiscovery.store');
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
    const insight = discovery.insights[0];
    expect(insight).toBeTruthy();

    await discovery.adoptInsightAndRefreshSeeds(insight!);
    const adoptCall = vi.mocked(refreshStorySeeds).mock.calls.at(-1)?.[0];
    expect(adoptCall?.genre).toBe('规则怪谈');
    expect(adoptCall?.insightContext?.opportunity).toContain('职场规则');
    expect(adoptCall?.insightContext?.hotTags).toEqual(['规则', '职场']);
    expect(discovery.lockedPlatform).toBe('fanqie');
    expect(discovery.lockedLength).toBe('short');
    expect(discovery.activeInsightContext?.name).toBe('规则怪谈');

    await discovery.refreshSeeds();
    const nextCall = vi.mocked(refreshStorySeeds).mock.calls.at(-1)?.[0];
    expect(nextCall?.insightContext?.opportunity).toContain('职场规则');

    discovery.clearLocks();
    expect(discovery.activeInsightContext).toBeNull();
    expect(discovery.lockedPlatform).toBeNull();
  });

  it('restores radar insight context on a fresh pinia', async () => {
    const { useTopicDiscoveryStore: useTopicDiscovery } = await import('@/stores/topicDiscovery.store');
    const { refreshGenreInsights } = await import('@/services/inspiration/topic-discovery.service');

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

    const first = useTopicDiscovery();
    await first.refreshInsights();
    first.selectInsight(first.insights[0]!);

    setActivePinia(createPinia());
    const second = useTopicDiscovery();
    second.hydratePersisted();

    expect(second.insights[0]?.id).toBe('i-radar');
    expect(second.selectedInsightId).toBe('i-radar');
    expect(second.activeInsightContext?.opportunity).toContain('职场规则');
    expect(second.activeInsightContext?.hotTags).toEqual(['规则', '职场']);
    expect(second.lockedGenre).toBe('规则怪谈');
  });

  it('drops malformed persisted insight context', async () => {
    const { useTopicDiscoveryStore: useTopicDiscovery } = await import('@/stores/topicDiscovery.store');

    localStorage.setItem(
      'moliu:topic-discovery:v2',
      JSON.stringify({
        version: 2,
        insights: [
          {
            id: 'i-radar',
            name: '规则怪谈',
            lifecycle: 'rising',
            audience: 'general',
            reason: '传播强',
            opportunity: '用职场规则做生存副本',
            hotTags: ['规则'],
            riskLevel: 'medium',
          },
        ],
        insightNameHistory: [],
        insightsSource: 'ai',
        insightsWarning: null,
        selectedInsightId: 'missing',
        activeInsightContext: { name: '规则怪谈', opportunity: 12 },
        savedAt: 't',
      }),
    );

    const discovery = useTopicDiscovery();
    expect(discovery.loadPersistedInsights()).toBe(true);
    expect(discovery.activeInsightContext).toBeNull();
    expect(discovery.selectedInsightId).toBeNull();
  });

  it('persists buckets separately and migrates legacy single-bucket cache', async () => {
    const { useTopicDiscoveryStore: useTopicDiscovery } = await import('@/stores/topicDiscovery.store');

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
    expect(discovery.seeds[0]?.title).toBe('旧种子');

    discovery.switchTab('mix');
    expect(discovery.seeds).toEqual([]);
  });

  it('favorites persist across refresh and play-mode switches', async () => {
    const { useTopicDiscoveryStore: useTopicDiscovery, favoriteSeedKey } = await import(
      '@/stores/topicDiscovery.store'
    );

    const discovery = useTopicDiscovery();
    await discovery.refreshSeeds();
    const seed = discovery.seeds[0]!;

    const added = discovery.toggleFavorite(seed, 'seeds');
    expect(added).toEqual({ ok: true, action: 'added' });
    expect(discovery.isFavorite(seed)).toBe(true);
    expect(discovery.favoriteCount).toBe(1);

    await discovery.refreshSeeds();
    // 同标题同题材仍视为已收藏（即使 id 变了）
    const sameKeySeed = discovery.seeds.find(
      s => favoriteSeedKey(s) === favoriteSeedKey(seed),
    );
    if (sameKeySeed) {
      expect(discovery.isFavorite(sameKeySeed)).toBe(true);
    }

    discovery.switchTab('mix');
    expect(discovery.favorites).toHaveLength(1);

    const second = useTopicDiscovery();
    expect(second.loadPersistedFavorites()).toBe(true);
    expect(second.favorites[0]?.seed.title).toBe(seed.title);

    const removed = second.toggleFavorite(second.favorites[0]!.seed);
    expect(removed).toEqual({ ok: true, action: 'removed' });
    expect(second.favoriteCount).toBe(0);
  });

  it('enforces favorites limit', async () => {
    const { useTopicDiscoveryStore: useTopicDiscovery } = await import('@/stores/topicDiscovery.store');
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
    expect(discovery.favoriteCount).toBe(discovery.maxFavorites);

    discovery.clearFavorites();
    expect(discovery.favoriteCount).toBe(0);
  });

  it('radar source/warning not polluted by seed refresh meta', async () => {
    const { useTopicDiscoveryStore: useTopicDiscovery } = await import(
      '@/stores/topicDiscovery.store'
    );
    const discovery = useTopicDiscovery();

    // 刷新种子（mock 返回 source: ai）
    await discovery.refreshSeeds();
    expect(discovery.source).toBe('ai');

    // 切到 radar：不应显示种子分桶的 source（修复前 persistSnapshot 会污染 insightsMeta）
    discovery.switchTab('radar');
    expect(discovery.source).toBeNull();

    // 刷新洞察后 radar meta 生效，且跨 tab 往返后保持
    await discovery.refreshInsights();
    expect(discovery.source).toBe('ai');
    discovery.switchTab('seeds');
    discovery.switchTab('radar');
    expect(discovery.source).toBe('ai');
  });

  it('sanitizes malformed persisted data without crashing', async () => {
    const { useTopicDiscoveryStore: useTopicDiscovery } = await import(
      '@/stores/topicDiscovery.store'
    );

    // 写入畸形 v2 数据：数字 title、非字符串 history、非法洞察、数字 title 收藏
    localStorage.setItem(
      'moliu:topic-discovery:v2',
      JSON.stringify({
        version: 2,
        buckets: {
          seeds: {
            items: [
              { id: 'ok', title: '合法种子', oneLiner: 'line', genre: '都市', hook: 'h', coolPoint: 'c', audience: 'general' },
              { id: 'bad', title: 123, oneLiner: 'x' },
              null,
            ],
            source: 'fallback',
            warning: 'w',
            titleHistory: ['合法', 42, null],
          },
        },
        insights: [
          { name: '合法洞察', lifecycle: 'rising', audience: 'general', reason: 'r', opportunity: 'o', hotTags: 42, riskLevel: 'low', namePatterns: '不是数组' },
          { name: 42 },
        ],
        favorites: [
          { seed: { id: 'f1', title: '合法收藏', oneLiner: 'l', genre: '都市', hook: 'h', coolPoint: 'c', audience: 'general' }, fromTab: 'seeds', savedAt: 't' },
          { seed: { title: 99, oneLiner: 'x' }, fromTab: 'seeds', savedAt: 't' },
          { seed: { title: '无题材', oneLiner: 'x' }, fromTab: 'seeds', savedAt: 't' },
        ],
        lockedGenre: null,
        lockedAudience: null,
        lockedPlatform: null,
        lockedLength: null,
        insightNameHistory: [1, 'ok'],
        insightsSource: null,
        insightsWarning: null,
        savedAt: 't',
      }),
    );

    const discovery = useTopicDiscovery();
    expect(discovery.loadPersistedSeeds()).toBe(true);
    expect(discovery.seeds).toHaveLength(1);
    expect(discovery.seeds[0]?.title).toBe('合法种子');
    expect(discovery.seedTitleHistory).toEqual(['合法']);

    expect(discovery.loadPersistedInsights()).toBe(true);
    expect(discovery.insights).toHaveLength(1);
    expect(discovery.insights[0]?.name).toBe('合法洞察');
    expect(discovery.insights[0]?.namePatterns).toBeUndefined();
    expect(discovery.insights[0]?.hotTags).toEqual([]);

    expect(discovery.loadPersistedFavorites()).toBe(true);
    expect(discovery.favorites).toHaveLength(1);
    expect(discovery.favorites[0]?.seed.title).toBe('合法收藏');
  });

  it('sanitizes malformed v1 legacy single-bucket data', async () => {
    const { useTopicDiscoveryStore: useTopicDiscovery } = await import(
      '@/stores/topicDiscovery.store'
    );

    localStorage.setItem(
      'moliu:topic-discovery:seeds',
      JSON.stringify({
        seeds: [
          { id: 'ok', title: '合法', oneLiner: 'l', genre: '都市', hook: 'h', coolPoint: 'c', audience: 'general' },
          { title: 5, oneLiner: 'x' },
        ],
        source: 'fallback',
        warning: 'w',
        seedTitleHistory: ['合法', 7],
        lockedGenre: null,
        lockedAudience: null,
        savedAt: 't',
      }),
    );

    const discovery = useTopicDiscovery();
    expect(discovery.loadPersistedSeeds()).toBe(true);
    expect(discovery.seeds).toHaveLength(1);
    expect(discovery.seeds[0]?.title).toBe('合法');
    expect(discovery.seedTitleHistory).toEqual(['合法']);
  });

  it('restores live rank samples with the radar insights', async () => {
    const { useTopicDiscoveryStore: useTopicDiscovery } = await import(
      '@/stores/topicDiscovery.store'
    );
    const { refreshGenreInsights } = await import('@/services/inspiration/topic-discovery.service');
    vi.mocked(refreshGenreInsights).mockResolvedValueOnce({
      items: [
        {
          id: 'i-live',
          name: '东方玄幻',
          lifecycle: 'peak',
          audience: 'male',
          reason: '月票榜重复出现',
          opportunity: '家族修仙',
          hotTags: ['东方玄幻'],
          riskLevel: 'medium',
        },
      ],
      source: 'ai',
      generatedAt: 't',
      rankScanApplied: true,
      rankScan: {
        availability: 'live',
        fetchedAt: '2026-10-10T03:28:00.000Z',
        sampleCount: 1,
        boards: [
          {
            site: 'qidian',
            boardId: 'qidian-yuepiao',
            channel: 'male',
            status: 'ok',
            entries: [
              {
                rank: 1,
                title: '夜无疆',
                author: '辰东',
                genre: '玄幻',
                tags: ['玄幻'],
                wordCount: '1万字',
                blurb: '',
              },
            ],
          },
        ],
      },
    });

    const first = useTopicDiscovery();
    await first.refreshInsights();
    expect(first.rankScanApplied).toBe(true);
    expect(first.rankScan?.sampleCount).toBe(1);

    setActivePinia(createPinia());
    const second = useTopicDiscovery();
    second.hydratePersisted();
    expect(second.rankScanApplied).toBe(true);
    expect(second.rankScan?.boards[0]?.entries[0]?.title).toBe('夜无疆');
  });
});

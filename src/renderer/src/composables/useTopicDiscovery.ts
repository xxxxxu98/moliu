/**
 * 开题中心 Composable
 * AI 刷新灵感种子 / 题材洞察，带竞态保护与历史 exclude
 * 各玩法（seeds/mix/dice/twist）种子数据彼此隔离并分别持久化
 */

import { computed, reactive, ref } from 'vue';
import {
  buildPromptFromSeed,
  insightToSeedConstraints,
  refreshGenreInsights,
  refreshStorySeeds,
} from '@/services/inspiration/topic-discovery.service';
import type {
  FavoriteSeed,
  GenreInsightCard,
  InsightSeedContext,
  RefreshGenreInsightsOptions,
  RefreshStorySeedsOptions,
  SeedPlayStyle,
  StorySeedCard,
  ToggleFavoriteResult,
  TopicAudience,
  TopicDiceRoll,
  TopicDiscoverySource,
  TopicDiscoveryTab,
  TopicLength,
  TopicPlatform,
} from '@/types/topic-discovery';

export type { TopicDiscoveryTab, FavoriteSeed };

/** 会产生灵感种子的玩法 */
export type SeedPlayTab = 'seeds' | 'mix' | 'dice' | 'twist';

const MAX_HISTORY = 40;
const MAX_FAVORITES = 50;
const SEEDS_STORAGE_KEY = 'moliu:topic-discovery:seeds';
const SEED_BUCKETS_STORAGE_KEY = 'moliu:topic-discovery:seed-buckets';
const INSIGHTS_STORAGE_KEY = 'moliu:topic-discovery:insights';
const FAVORITES_STORAGE_KEY = 'moliu:topic-discovery:favorites';

const SEED_PLAY_TABS: SeedPlayTab[] = ['seeds', 'mix', 'dice', 'twist'];

const TAB_TO_STYLE: Record<SeedPlayTab, SeedPlayStyle> = {
  seeds: 'standard',
  mix: 'mix',
  dice: 'dice',
  twist: 'twist',
};

interface SeedBucketState {
  items: StorySeedCard[];
  source: TopicDiscoverySource | null;
  warning: string | null;
  titleHistory: string[];
}

interface PersistedSeedBucket {
  items: StorySeedCard[];
  source: TopicDiscoverySource | null;
  warning: string | null;
  titleHistory: string[];
}

/** 新版：按玩法分桶持久化 */
interface PersistedSeedBucketsState {
  buckets: Partial<Record<SeedPlayTab, PersistedSeedBucket>>;
  lockedGenre: string | null;
  lockedAudience: TopicAudience | null;
  lockedPlatform: TopicPlatform | null;
  lockedLength: TopicLength | null;
  savedAt: string;
}

/** 旧版单桶（迁移用） */
interface LegacyPersistedSeedsState {
  seeds: StorySeedCard[];
  source: TopicDiscoverySource | null;
  warning: string | null;
  seedTitleHistory: string[];
  lockedGenre: string | null;
  lockedAudience: TopicAudience | null;
  lockedPlatform?: TopicPlatform | null;
  lockedLength?: TopicLength | null;
  savedAt: string;
}

interface PersistedInsightsState {
  insights: GenreInsightCard[];
  source: TopicDiscoverySource | null;
  warning: string | null;
  insightNameHistory: string[];
  savedAt: string;
}

interface PersistedFavoritesState {
  items: FavoriteSeed[];
  savedAt: string;
}

function createEmptyBucket(): SeedBucketState {
  return {
    items: [],
    source: null,
    warning: null,
    titleHistory: [],
  };
}

function isSeedPlayTab(tab: TopicDiscoveryTab): tab is SeedPlayTab {
  return (SEED_PLAY_TABS as string[]).includes(tab);
}

/** 收藏去重键：换一批后 id 会变，用标题+题材识别 */
export function favoriteSeedKey(seed: StorySeedCard): string {
  return `${seed.title.trim().toLowerCase()}::${seed.genre.trim().toLowerCase()}`;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('[useTopicDiscovery] Failed to persist:', key, err);
  }
}

function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function useTopicDiscovery() {
  const activeTab = ref<TopicDiscoveryTab>('seeds');
  const isRefreshing = ref(false);
  /** 当前正在刷新的目标，避免 A 玩法 loading 影响 B 玩法展示 */
  const refreshingTarget = ref<SeedPlayTab | 'radar' | null>(null);
  const error = ref<string | null>(null);
  const warning = ref<string | null>(null);
  const source = ref<TopicDiscoverySource | null>(null);

  const seedBuckets = reactive<Record<SeedPlayTab, SeedBucketState>>({
    seeds: createEmptyBucket(),
    mix: createEmptyBucket(),
    dice: createEmptyBucket(),
    twist: createEmptyBucket(),
  });

  const insights = ref<GenreInsightCard[]>([]);

  const lockedGenre = ref<string | null>(null);
  const lockedAudience = ref<TopicAudience | null>(null);
  /** null = 不限，提示词侧按 general 处理 */
  const lockedPlatform = ref<TopicPlatform | null>(null);
  /** null = 默认长篇 */
  const lockedLength = ref<TopicLength | null>(null);
  const selectedInsightId = ref<string | null>(null);
  /** 点雷达洞察后保留完整约束，供后续换一批种子继续下传 */
  const activeInsightContext = ref<InsightSeedContext | null>(null);

  const insightNameHistory = ref<string[]>([]);
  const favorites = ref<FavoriteSeed[]>([]);

  let insightsMeta: Pick<PersistedInsightsState, 'source' | 'warning'> = {
    source: null,
    warning: null,
  };

  let refreshId = 0;
  /** 当前在飞刷新的 AbortController；新请求 / 取消时 abort 以中断 HTTP */
  let currentAbort: AbortController | null = null;

  function abortInFlight(): void {
    if (currentAbort) {
      currentAbort.abort();
      currentAbort = null;
    }
  }

  function createSignal(): AbortSignal {
    abortInFlight();
    const controller = new AbortController();
    currentAbort = controller;
    return controller.signal;
  }

  function isAbortError(error: unknown): boolean {
    if (error instanceof DOMException && error.name === 'AbortError') return true;
    if (error instanceof Error && error.name === 'AbortError') return true;
    return false;
  }

  const activeSeedTab = computed((): SeedPlayTab | null => {
    return isSeedPlayTab(activeTab.value) ? activeTab.value : null;
  });

  /** 当前玩法下的种子列表（雷达/一句话开题为空） */
  const seeds = computed((): StorySeedCard[] => {
    const tab = activeSeedTab.value;
    return tab ? seedBuckets[tab].items : [];
  });

  /** 兼容旧 API：当前玩法的标题历史 */
  const seedTitleHistory = computed((): string[] => {
    const tab = activeSeedTab.value;
    return tab ? seedBuckets[tab].titleHistory : [];
  });

  const selectedInsight = computed(
    () => insights.value.find(item => item.id === selectedInsightId.value) ?? null,
  );

  const hasSeeds = computed(() => seeds.value.length > 0);
  const hasInsights = computed(() => insights.value.length > 0);
  const hasFavorites = computed(() => favorites.value.length > 0);
  const favoriteCount = computed(() => favorites.value.length);

  const isRefreshingCurrent = computed((): boolean => {
    if (!isRefreshing.value || !refreshingTarget.value) return false;
    if (refreshingTarget.value === 'radar') {
      return activeTab.value === 'radar';
    }
    return activeSeedTab.value === refreshingTarget.value;
  });

  function applyTabMeta(tab: TopicDiscoveryTab): void {
    if (tab === 'radar') {
      source.value = insightsMeta.source;
      warning.value = insightsMeta.warning;
      return;
    }
    if (tab === 'prompt') {
      source.value = null;
      warning.value = null;
      return;
    }
    if (isSeedPlayTab(tab)) {
      const bucket = seedBuckets[tab];
      source.value = bucket.source;
      warning.value = bucket.warning;
      return;
    }
    source.value = null;
    warning.value = null;
  }

  function persistSeedBucketsSnapshot(): void {
    const buckets: PersistedSeedBucketsState['buckets'] = {};
    for (const key of SEED_PLAY_TABS) {
      const bucket = seedBuckets[key];
      if (bucket.items.length === 0 && bucket.titleHistory.length === 0) continue;
      buckets[key] = {
        items: bucket.items,
        source: bucket.source,
        warning: bucket.warning,
        titleHistory: bucket.titleHistory,
      };
    }

    writeJson(SEED_BUCKETS_STORAGE_KEY, {
      buckets,
      lockedGenre: lockedGenre.value,
      lockedAudience: lockedAudience.value,
      lockedPlatform: lockedPlatform.value,
      lockedLength: lockedLength.value,
      savedAt: new Date().toISOString(),
    } satisfies PersistedSeedBucketsState);

    // 清理旧单桶 key，避免下次再被误读
    removeKey(SEEDS_STORAGE_KEY);
  }

  function persistInsightsSnapshot(): void {
    if (insights.value.length === 0) return;
    insightsMeta = { source: source.value, warning: warning.value };
    writeJson(INSIGHTS_STORAGE_KEY, {
      insights: insights.value,
      source: insightsMeta.source,
      warning: insightsMeta.warning,
      insightNameHistory: insightNameHistory.value,
      savedAt: new Date().toISOString(),
    } satisfies PersistedInsightsState);
  }

  function persistFavoritesSnapshot(): void {
    writeJson(FAVORITES_STORAGE_KEY, {
      items: favorites.value,
      savedAt: new Date().toISOString(),
    } satisfies PersistedFavoritesState);
  }

  function hydrateBucket(key: SeedPlayTab, data: PersistedSeedBucket | undefined): void {
    if (!data || !Array.isArray(data.items)) return;
    seedBuckets[key].items = data.items;
    seedBuckets[key].source = data.source ?? null;
    seedBuckets[key].warning = data.warning ?? null;
    seedBuckets[key].titleHistory = data.titleHistory ?? [];
  }

  /** 从本地恢复各玩法种子；无缓存时返回 false */
  function loadPersistedSeeds(): boolean {
    const modern = readJson<PersistedSeedBucketsState>(SEED_BUCKETS_STORAGE_KEY);
    if (modern?.buckets && typeof modern.buckets === 'object') {
      for (const key of SEED_PLAY_TABS) {
        hydrateBucket(key, modern.buckets[key]);
      }
      lockedGenre.value = modern.lockedGenre ?? null;
      lockedAudience.value = modern.lockedAudience ?? null;
      lockedPlatform.value = modern.lockedPlatform ?? null;
      lockedLength.value = modern.lockedLength ?? null;
      applyTabMeta(activeTab.value);
      return SEED_PLAY_TABS.some(key => seedBuckets[key].items.length > 0);
    }

    // 迁移旧版单桶 → 仅灌入 seeds 玩法
    const legacy = readJson<LegacyPersistedSeedsState>(SEEDS_STORAGE_KEY);
    if (!legacy || !Array.isArray(legacy.seeds) || legacy.seeds.length === 0) {
      return false;
    }

    seedBuckets.seeds.items = legacy.seeds;
    seedBuckets.seeds.source = legacy.source;
    seedBuckets.seeds.warning = legacy.warning;
    seedBuckets.seeds.titleHistory = legacy.seedTitleHistory ?? [];
    lockedGenre.value = legacy.lockedGenre;
    lockedAudience.value = legacy.lockedAudience;
    lockedPlatform.value = legacy.lockedPlatform ?? null;
    lockedLength.value = legacy.lockedLength ?? null;
    persistSeedBucketsSnapshot();
    applyTabMeta(activeTab.value);
    return true;
  }

  function buildInsightContext(insight: GenreInsightCard): InsightSeedContext {
    return {
      name: insight.name,
      audience: insight.audience,
      opportunity: insight.opportunity,
      reason: insight.reason,
      hotTags: [...insight.hotTags],
      riskLevel: insight.riskLevel,
      riskNote: insight.riskNote,
      lifecycle: insight.lifecycle,
      platform: insight.platform,
      length: insight.length,
      entryDifficulty: insight.entryDifficulty,
      namePatterns: insight.namePatterns ? [...insight.namePatterns] : undefined,
    };
  }

  function applyGlobalFilters(options: RefreshStorySeedsOptions): RefreshStorySeedsOptions {
    const next: RefreshStorySeedsOptions = { ...options };

    if (!next.platform && lockedPlatform.value) {
      next.platform = lockedPlatform.value;
    }
    if (!next.length && lockedLength.value) {
      next.length = lockedLength.value;
    }

    next.lockedSlots = {
      ...next.lockedSlots,
      ...(lockedPlatform.value ? { platform: lockedPlatform.value } : {}),
      ...(lockedLength.value ? { length: lockedLength.value } : {}),
    };

    if (
      !next.insightContext &&
      activeInsightContext.value &&
      (!next.genre || next.genre === activeInsightContext.value.name)
    ) {
      next.insightContext = activeInsightContext.value;
    }

    return next;
  }

  /** 从本地恢复上一批题材洞察；无缓存时返回 false */
  function loadPersistedInsights(): boolean {
    const cached = readJson<PersistedInsightsState>(INSIGHTS_STORAGE_KEY);
    if (!cached || !Array.isArray(cached.insights) || cached.insights.length === 0) {
      return false;
    }

    insights.value = cached.insights;
    insightNameHistory.value = cached.insightNameHistory ?? [];
    insightsMeta = { source: cached.source, warning: cached.warning };
    if (activeTab.value === 'radar') {
      applyTabMeta('radar');
    }
    return true;
  }

  /** 从本地恢复收藏；无缓存时返回 false */
  function loadPersistedFavorites(): boolean {
    const cached = readJson<PersistedFavoritesState>(FAVORITES_STORAGE_KEY);
    if (!cached || !Array.isArray(cached.items)) {
      return false;
    }
    favorites.value = cached.items
      .filter(item => item?.seed?.title && item?.seed?.oneLiner)
      .slice(0, MAX_FAVORITES);
    return favorites.value.length > 0;
  }

  function isFavorite(seed: StorySeedCard): boolean {
    const key = favoriteSeedKey(seed);
    return favorites.value.some(item => favoriteSeedKey(item.seed) === key);
  }

  function toggleFavorite(
    seed: StorySeedCard,
    fromTab: TopicDiscoveryTab = activeTab.value,
  ): ToggleFavoriteResult {
    const key = favoriteSeedKey(seed);
    const index = favorites.value.findIndex(item => favoriteSeedKey(item.seed) === key);

    if (index >= 0) {
      favorites.value = favorites.value.filter((_, i) => i !== index);
      persistFavoritesSnapshot();
      return { ok: true, action: 'removed' };
    }

    if (favorites.value.length >= MAX_FAVORITES) {
      return {
        ok: false,
        action: 'limit',
        reason: `收藏已达上限（${MAX_FAVORITES}），请先取消部分收藏`,
      };
    }

    const entry: FavoriteSeed = {
      seed: { ...seed },
      fromTab,
      savedAt: new Date().toISOString(),
    };
    favorites.value = [entry, ...favorites.value];
    persistFavoritesSnapshot();
    return { ok: true, action: 'added' };
  }

  function removeFavorite(seed: StorySeedCard): boolean {
    const key = favoriteSeedKey(seed);
    const before = favorites.value.length;
    favorites.value = favorites.value.filter(item => favoriteSeedKey(item.seed) !== key);
    if (favorites.value.length === before) return false;
    persistFavoritesSnapshot();
    return true;
  }

  function clearFavorites(): void {
    favorites.value = [];
    removeKey(FAVORITES_STORAGE_KEY);
  }

  function pushHistory(list: string[], values: string[]): string[] {
    const next = [...values, ...list];
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const item of next) {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
      if (deduped.length >= MAX_HISTORY) break;
    }
    return deduped;
  }

  /**
   * 刷新指定玩法的种子。
   * mix/dice 不套用雷达锁定的题材（避免覆盖用户混搭/骰子约束）；受众锁仍可生效。
   */
  async function refreshSeedsForTab(
    tab: SeedPlayTab,
    extra?: RefreshStorySeedsOptions,
  ): Promise<StorySeedCard[]> {
    const currentId = ++refreshId;
    const signal = createSignal();
    const bucket = seedBuckets[tab];
    const playStyle = extra?.playStyle ?? TAB_TO_STYLE[tab];
    const ignoreLockedGenre = playStyle === 'mix' || playStyle === 'dice';

    isRefreshing.value = true;
    refreshingTarget.value = tab;
    error.value = null;

    if (activeSeedTab.value === tab || activeTab.value === tab) {
      warning.value = null;
    }

    const options: RefreshStorySeedsOptions = applyGlobalFilters({
      count: 4,
      excludeTitles: bucket.titleHistory,
      audience: lockedAudience.value ?? undefined,
      ...extra,
      playStyle,
      signal,
    });

    if (ignoreLockedGenre) {
      // 混搭/骰子以自身约束为准，不套用雷达锁定题材；但仍保留受众/平台/篇幅
      options.lockedSlots = {
        ...(lockedAudience.value ? { audience: lockedAudience.value } : {}),
        ...(lockedPlatform.value ? { platform: lockedPlatform.value } : {}),
        ...(lockedLength.value ? { length: lockedLength.value } : {}),
      };
      // 混搭/骰子不继承雷达洞察上下文，避免干扰用户组合
      delete options.insightContext;
      if (extra?.genre) {
        options.genre = extra.genre;
      } else {
        delete options.genre;
      }
    } else {
      options.genre = extra?.genre ?? lockedGenre.value ?? undefined;
      options.lockedSlots = {
        ...(lockedGenre.value ? { genre: lockedGenre.value } : {}),
        ...(lockedAudience.value ? { audience: lockedAudience.value } : {}),
        ...(lockedPlatform.value ? { platform: lockedPlatform.value } : {}),
        ...(lockedLength.value ? { length: lockedLength.value } : {}),
        ...extra?.lockedSlots,
      };
    }

    try {
      const batch = await refreshStorySeeds(options);
      if (currentId !== refreshId) {
        return [];
      }

      bucket.items = batch.items;
      bucket.source = batch.source;
      bucket.warning = batch.warning ?? null;
      bucket.titleHistory = pushHistory(
        bucket.titleHistory,
        batch.items.map(item => item.title),
      );

      if (activeSeedTab.value === tab) {
        source.value = batch.source;
        warning.value = batch.warning ?? null;
      }

      persistSeedBucketsSnapshot();
      return batch.items;
    } catch (err) {
      if (isAbortError(err)) {
        return [];
      }
      if (currentId !== refreshId) {
        return [];
      }
      error.value = err instanceof Error ? err.message : String(err);
      return bucket.items;
    } finally {
      if (currentId === refreshId) {
        isRefreshing.value = false;
        refreshingTarget.value = null;
        currentAbort = null;
      }
    }
  }

  async function refreshSeeds(extra?: RefreshStorySeedsOptions): Promise<StorySeedCard[]> {
    const tab: SeedPlayTab =
      (extra?.playStyle &&
        (Object.entries(TAB_TO_STYLE).find(([, style]) => style === extra.playStyle)?.[0] as
          | SeedPlayTab
          | undefined)) ||
      (isSeedPlayTab(activeTab.value) ? activeTab.value : 'seeds');

    return refreshSeedsForTab(tab, extra);
  }

  async function refreshInsights(
    extra?: RefreshGenreInsightsOptions,
  ): Promise<GenreInsightCard[]> {
    const currentId = ++refreshId;
    const signal = createSignal();
    isRefreshing.value = true;
    refreshingTarget.value = 'radar';
    error.value = null;
    warning.value = null;

    const options: RefreshGenreInsightsOptions = {
      count: 4,
      excludeNames: insightNameHistory.value,
      audience: lockedAudience.value ?? undefined,
      platform: lockedPlatform.value ?? undefined,
      length: lockedLength.value ?? undefined,
      ...extra,
      signal,
    };

    try {
      const batch = await refreshGenreInsights(options);
      if (currentId !== refreshId) {
        return [];
      }

      insights.value = batch.items;
      source.value = batch.source;
      warning.value = batch.warning ?? null;
      insightNameHistory.value = pushHistory(
        insightNameHistory.value,
        batch.items.map(item => item.name),
      );
      persistInsightsSnapshot();
      return batch.items;
    } catch (err) {
      if (isAbortError(err)) {
        return [];
      }
      if (currentId !== refreshId) {
        return [];
      }
      error.value = err instanceof Error ? err.message : String(err);
      return insights.value;
    } finally {
      if (currentId === refreshId) {
        isRefreshing.value = false;
        refreshingTarget.value = null;
        currentAbort = null;
      }
    }
  }

  async function refresh(
    mode: TopicDiscoveryTab = activeTab.value,
    extra?: RefreshStorySeedsOptions,
  ): Promise<void> {
    if (mode === 'radar') {
      await refreshInsights();
      return;
    }
    if (mode === 'prompt') {
      return;
    }
    if (!isSeedPlayTab(mode)) {
      return;
    }

    await refreshSeedsForTab(mode, {
      playStyle: TAB_TO_STYLE[mode],
      ...extra,
    });
  }

  function selectInsight(insight: GenreInsightCard): void {
    selectedInsightId.value = insight.id;
    lockedGenre.value = insight.name;
    lockedAudience.value = insight.audience;
    if (insight.platform) {
      lockedPlatform.value = insight.platform;
    }
    if (insight.length) {
      lockedLength.value = insight.length;
    }
    activeInsightContext.value = buildInsightContext(insight);
    persistSeedBucketsSnapshot();
  }

  async function adoptInsightAndRefreshSeeds(insight: GenreInsightCard): Promise<StorySeedCard[]> {
    selectInsight(insight);
    activeTab.value = 'seeds';
    applyTabMeta('seeds');
    return refreshSeedsForTab('seeds', {
      ...insightToSeedConstraints(insight),
      playStyle: 'standard',
    });
  }

  /** 元素混搭开题 */
  async function refreshFromMix(input: {
    tags: string[];
    elements: string[];
  }): Promise<StorySeedCard[]> {
    return refreshSeedsForTab('mix', {
      playStyle: 'mix',
      mixTags: input.tags,
      mixElements: input.elements,
      genre: input.tags[0],
    });
  }

  /** 命运骰子开题 */
  async function refreshFromDice(diceRoll: TopicDiceRoll): Promise<StorySeedCard[]> {
    return refreshSeedsForTab('dice', {
      playStyle: 'dice',
      diceRoll,
      genre: diceRoll.genre,
    });
  }

  function setLockedGenre(genre: string | null): void {
    lockedGenre.value = genre;
    if (!genre) {
      activeInsightContext.value = null;
      selectedInsightId.value = null;
    }
    persistSeedBucketsSnapshot();
  }

  function setLockedAudience(audience: TopicAudience | null): void {
    lockedAudience.value = audience;
    persistSeedBucketsSnapshot();
  }

  function setLockedPlatform(platform: TopicPlatform | null): void {
    lockedPlatform.value = platform;
    persistSeedBucketsSnapshot();
  }

  function setLockedLength(length: TopicLength | null): void {
    lockedLength.value = length;
    persistSeedBucketsSnapshot();
  }

  function clearLocks(): void {
    lockedGenre.value = null;
    lockedAudience.value = null;
    lockedPlatform.value = null;
    lockedLength.value = null;
    selectedInsightId.value = null;
    activeInsightContext.value = null;
    persistSeedBucketsSnapshot();
  }

  function switchTab(tab: TopicDiscoveryTab): void {
    activeTab.value = tab;
    applyTabMeta(tab);
  }

  function getSeedsForTab(tab: SeedPlayTab): StorySeedCard[] {
    return seedBuckets[tab].items;
  }

  /** 取消种子/雷达刷新：abort 在飞 HTTP，忽略结果，保留已有列表 */
  function cancelRefresh(): void {
    if (!isRefreshing.value && !currentAbort) return;
    abortInFlight();
    refreshId += 1;
    isRefreshing.value = false;
    refreshingTarget.value = null;
  }

  function reset(): void {
    abortInFlight();
    refreshId += 1;
    isRefreshing.value = false;
    refreshingTarget.value = null;
    error.value = null;
    warning.value = null;
    source.value = null;
    for (const key of SEED_PLAY_TABS) {
      seedBuckets[key] = createEmptyBucket();
    }
    insights.value = [];
    lockedGenre.value = null;
    lockedAudience.value = null;
    lockedPlatform.value = null;
    lockedLength.value = null;
    selectedInsightId.value = null;
    activeInsightContext.value = null;
    insightNameHistory.value = [];
    insightsMeta = { source: null, warning: null };
    activeTab.value = 'seeds';
    removeKey(SEEDS_STORAGE_KEY);
    removeKey(SEED_BUCKETS_STORAGE_KEY);
    removeKey(INSIGHTS_STORAGE_KEY);
    // 收藏是跨会话资产，reset 会话不清理；需 clearFavorites 显式清空
  }

  return {
    activeTab,
    isRefreshing,
    isRefreshingCurrent,
    refreshingTarget,
    error,
    warning,
    source,
    seeds,
    seedBuckets,
    insights,
    favorites,
    lockedGenre,
    lockedAudience,
    lockedPlatform,
    lockedLength,
    selectedInsightId,
    selectedInsight,
    activeInsightContext,
    hasSeeds,
    hasInsights,
    hasFavorites,
    favoriteCount,
    seedTitleHistory,
    insightNameHistory,
    refresh,
    refreshSeeds,
    refreshSeedsForTab,
    refreshInsights,
    refreshFromMix,
    refreshFromDice,
    loadPersistedSeeds,
    loadPersistedInsights,
    loadPersistedFavorites,
    selectInsight,
    adoptInsightAndRefreshSeeds,
    setLockedGenre,
    setLockedAudience,
    setLockedPlatform,
    setLockedLength,
    clearLocks,
    isFavorite,
    toggleFavorite,
    removeFavorite,
    clearFavorites,
    switchTab,
    getSeedsForTab,
    cancelRefresh,
    reset,
    buildPromptFromSeed,
    maxFavorites: MAX_FAVORITES,
  };
}

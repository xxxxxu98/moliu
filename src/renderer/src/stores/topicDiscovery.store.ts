/**
 * 开题中心 Pinia Store（v2 状态收敛）
 *
 * 从 useTopicDiscovery composable 收敛而来：
 *  - 状态：种子分桶 / 洞察 / 收藏 / 锁定 / 竞态控制
 *  - 持久化：单键版本化（moliu:topic-discovery:v2），自动迁移 v1 旧键
 *  - 对外契约（refreshSeeds/toggleFavorite/loadPersisted* 等）与原 composable 保持一致
 */

import { computed, reactive, ref } from 'vue';
import { defineStore } from 'pinia';
import { getPlayMode, getPlayStyle, getSeedPlayTabs, isSeedPlayTab } from '@/services/inspiration/play-modes';
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

/** v2 持久化键（版本化，单键原子写） */
const V2_STORAGE_KEY = 'moliu:topic-discovery:v2';

/** v1 旧键（迁移用） */
const V1_BUCKETS_KEY = 'moliu:topic-discovery:seed-buckets';
const V1_SEEDS_KEY = 'moliu:topic-discovery:seeds';
const V1_INSIGHTS_KEY = 'moliu:topic-discovery:insights';
const V1_FAVORITES_KEY = 'moliu:topic-discovery:favorites';

/** 会产生种子的玩法（由 play-modes 配置派生） */
const SEED_PLAY_TABS: SeedPlayTab[] = getSeedPlayTabs() as SeedPlayTab[];

type SeedBucketTab = (typeof SEED_PLAY_TABS)[number];

type SeedBucketMap = Record<SeedBucketTab, SeedBucketState>;

function createEmptyBucket(): SeedBucketState {
  return {
    items: [],
    source: null,
    warning: null,
    titleHistory: [],
  };
}

interface PersistedV2State {
  version: 2;
  buckets: Partial<Record<SeedPlayTab, SeedBucketState>>;
  insights: GenreInsightCard[];
  favorites: FavoriteSeed[];
  lockedGenre: string | null;
  lockedAudience: TopicAudience | null;
  lockedPlatform: TopicPlatform | null;
  lockedLength: TopicLength | null;
  insightNameHistory: string[];
  insightsSource: TopicDiscoverySource | null;
  insightsWarning: string | null;
  savedAt: string;
}

/** v1 旧版单桶（迁移用） */
interface LegacyPersistedSeedsState {
  seeds: StorySeedCard[];
  source: TopicDiscoverySource | null;
  warning: string | null;
  seedTitleHistory: string[];
  lockedGenre: string | null;
  lockedAudience: TopicAudience | null;
  lockedPlatform?: TopicPlatform | null;
  lockedLength?: TopicLength | null;
}

/** v1 新版分桶（迁移用） */
interface LegacyPersistedBucketsState {
  buckets: Partial<Record<SeedPlayTab, Omit<SeedBucketState, never>>>;
  lockedGenre: string | null;
  lockedAudience: TopicAudience | null;
  lockedPlatform: TopicPlatform | null;
  lockedLength: TopicLength | null;
}

interface LegacyPersistedInsightsState {
  insights: GenreInsightCard[];
  source: TopicDiscoverySource | null;
  warning: string | null;
  insightNameHistory: string[];
}

interface LegacyPersistedFavoritesState {
  items: FavoriteSeed[];
}

interface SeedBucketState {
  items: StorySeedCard[];
  source: TopicDiscoverySource | null;
  warning: string | null;
  titleHistory: string[];
}

/** 收藏去重键：换一批后 id 会变，用标题+题材识别（防御畸形数据：字段缺失/非 string 不崩溃） */
export function favoriteSeedKey(seed: StorySeedCard): string {
  return `${String(seed.title ?? '').trim().toLowerCase()}::${String(seed.genre ?? '').trim().toLowerCase()}`;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    // 防御：限制持久化载荷大小，避免超大 JSON 同步解析冻结 UI（本地 DoS）
    if (raw.length > 2_000_000) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('[topicDiscovery.store] Failed to persist:', key, err);
  }
}

function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const useTopicDiscoveryStore = defineStore('topicDiscovery', () => {
  // ============ State ============
  const activeTab = ref<TopicDiscoveryTab>('seeds');
  const isRefreshing = ref(false);
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
  const lockedPlatform = ref<TopicPlatform | null>(null);
  const lockedLength = ref<TopicLength | null>(null);
  const selectedInsightId = ref<string | null>(null);
  const activeInsightContext = ref<InsightSeedContext | null>(null);

  const insightNameHistory = ref<string[]>([]);
  const favorites = ref<FavoriteSeed[]>([]);

  let insightsMeta: Pick<PersistedV2State, 'insightsSource' | 'insightsWarning'> = {
    insightsSource: null,
    insightsWarning: null,
  };

  // ============ 竞态控制 ============
  let refreshId = 0;
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

  // ============ Getters ============
  const activeSeedTab = computed((): SeedPlayTab | null => {
    return isSeedPlayTab(activeTab.value) ? activeTab.value : null;
  });

  const seeds = computed((): StorySeedCard[] => {
    const tab = activeSeedTab.value;
    return tab ? seedBuckets[tab].items : [];
  });

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

  // ============ 持久化 ============
  function persistSnapshot(): void {
    const buckets: PersistedV2State['buckets'] = {};
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
    // insightsMeta 只在雷达洞察刷新时更新（见 refreshInsights），此处不再从 source/warning 推断，
    // 避免非 radar tab 的持久化把种子来源元数据污染到 radar 上。
    writeJson(V2_STORAGE_KEY, {
      version: 2,
      buckets,
      insights: insights.value,
      favorites: favorites.value,
      lockedGenre: lockedGenre.value,
      lockedAudience: lockedAudience.value,
      lockedPlatform: lockedPlatform.value,
      lockedLength: lockedLength.value,
      insightNameHistory: insightNameHistory.value,
      insightsSource: insightsMeta.insightsSource,
      insightsWarning: insightsMeta.insightsWarning,
      savedAt: new Date().toISOString(),
    } satisfies PersistedV2State);
    // 清理 v1 旧键，避免被误读
    for (const oldKey of [V1_BUCKETS_KEY, V1_SEEDS_KEY, V1_INSIGHTS_KEY, V1_FAVORITES_KEY]) {
      removeKey(oldKey);
    }
  }

  function hydrateBucket(key: SeedPlayTab, data: SeedBucketState | undefined): void {
    if (!data || !Array.isArray(data.items)) return;
    // 防御：逐元素形状校验，畸形条目直接丢弃（避免渲染层 TypeError 崩溃）
    seedBuckets[key].items = data.items.filter(
      item =>
        item &&
        typeof item === 'object' &&
        typeof (item as { title?: unknown }).title === 'string' &&
        typeof (item as { oneLiner?: unknown }).oneLiner === 'string',
    ) as StorySeedCard[];
    seedBuckets[key].source = data.source ?? null;
    seedBuckets[key].warning = data.warning ?? null;
    seedBuckets[key].titleHistory = Array.isArray(data.titleHistory)
      ? data.titleHistory.filter((t): t is string => typeof t === 'string').slice(0, MAX_HISTORY)
      : [];
  }

  function applyTabMeta(tab: TopicDiscoveryTab): void {
    if (tab === 'radar') {
      source.value = insightsMeta.insightsSource;
      warning.value = insightsMeta.insightsWarning;
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

  /** 从 v1 旧键迁移（旧单桶 → seeds 桶；旧分桶 → 分桶；洞察/收藏各自迁移） */
  function migrateFromV1(): boolean {
    const legacyBuckets = readJson<LegacyPersistedBucketsState>(V1_BUCKETS_KEY);
    if (legacyBuckets?.buckets && typeof legacyBuckets.buckets === 'object') {
      for (const key of SEED_PLAY_TABS) {
        hydrateBucket(key, legacyBuckets.buckets[key] as SeedBucketState | undefined);
      }
      lockedGenre.value = legacyBuckets.lockedGenre ?? null;
      lockedAudience.value = legacyBuckets.lockedAudience ?? null;
      lockedPlatform.value = legacyBuckets.lockedPlatform ?? null;
      lockedLength.value = legacyBuckets.lockedLength ?? null;
      const anySeeds = SEED_PLAY_TABS.some(key => seedBuckets[key].items.length > 0);
      if (anySeeds) return true;
    }

    const legacy = readJson<LegacyPersistedSeedsState>(V1_SEEDS_KEY);
    if (legacy && Array.isArray(legacy.seeds) && legacy.seeds.length > 0) {
      // 复用 hydrateBucket 的元素级校验（v1 迁移不旁路防御）
      hydrateBucket('seeds', {
        items: legacy.seeds,
        source: legacy.source,
        warning: legacy.warning,
        titleHistory: legacy.seedTitleHistory ?? [],
      });
      lockedGenre.value = legacy.lockedGenre ?? null;
      lockedAudience.value = legacy.lockedAudience ?? null;
      lockedPlatform.value = legacy.lockedPlatform ?? null;
      lockedLength.value = legacy.lockedLength ?? null;
      return seedBuckets.seeds.items.length > 0;
    }
    return false;
  }

  /** 从本地恢复（v2 优先，v1 迁移兜底）；有数据返回 true */
  function loadPersistedSeeds(): boolean {
    const v2 = readJson<PersistedV2State>(V2_STORAGE_KEY);
    if (v2?.version === 2 && v2.buckets && typeof v2.buckets === 'object') {
      for (const key of SEED_PLAY_TABS) {
        hydrateBucket(key, v2.buckets[key]);
      }
      lockedGenre.value = v2.lockedGenre ?? null;
      lockedAudience.value = v2.lockedAudience ?? null;
      lockedPlatform.value = v2.lockedPlatform ?? null;
      lockedLength.value = v2.lockedLength ?? null;
      applyTabMeta(activeTab.value);
      return SEED_PLAY_TABS.some(key => seedBuckets[key].items.length > 0);
    }

    if (migrateFromV1()) {
      persistSnapshot();
      applyTabMeta(activeTab.value);
      return true;
    }
    return false;
  }

  /** 防御：过滤合法收藏条目（seed 的 title/oneLiner 必须为 string） */
  function sanitizeFavorites(list: unknown[]): FavoriteSeed[] {
    return list
      .filter((item): item is FavoriteSeed => {
        const seed = (item as FavoriteSeed | null)?.seed;
        return Boolean(
          seed &&
            typeof seed === 'object' &&
            typeof seed.title === 'string' &&
            typeof seed.oneLiner === 'string' &&
            typeof seed.genre === 'string',
        );
      })
      .slice(0, MAX_FAVORITES);
  }

  /** 防御：过滤合法洞察条目（name 必须为 string；namePatterns 强制为字符串数组） */
  function sanitizeInsights(list: unknown[]): GenreInsightCard[] {
    return list
      .filter((item): item is GenreInsightCard => {
        const row = item as GenreInsightCard | null;
        if (!row || typeof row !== 'object' || typeof row.name !== 'string') return false;
        if (row.namePatterns !== undefined && !Array.isArray(row.namePatterns)) {
          delete (row as { namePatterns?: unknown }).namePatterns;
        }
        if (row.hotTags !== undefined && !Array.isArray(row.hotTags)) {
          (row as { hotTags?: unknown }).hotTags = [];
        }
        return true;
      })
      .slice(0, 8);
  }

  function loadPersistedInsights(): boolean {
    const v2 = readJson<PersistedV2State>(V2_STORAGE_KEY);
    if (v2?.version === 2 && Array.isArray(v2.insights) && v2.insights.length > 0) {
      insights.value = sanitizeInsights(v2.insights);
      insightNameHistory.value = Array.isArray(v2.insightNameHistory)
        ? v2.insightNameHistory.filter((n): n is string => typeof n === 'string').slice(0, MAX_HISTORY)
        : [];
      insightsMeta = {
        insightsSource: v2.insightsSource ?? null,
        insightsWarning: v2.insightsWarning ?? null,
      };
      if (activeTab.value === 'radar') {
        applyTabMeta('radar');
      }
      return insights.value.length > 0;
    }

    const legacy = readJson<LegacyPersistedInsightsState>(V1_INSIGHTS_KEY);
    if (legacy && Array.isArray(legacy.insights) && legacy.insights.length > 0) {
      insights.value = sanitizeInsights(legacy.insights);
      insightNameHistory.value = Array.isArray(legacy.insightNameHistory)
        ? legacy.insightNameHistory.filter((n): n is string => typeof n === 'string').slice(0, MAX_HISTORY)
        : [];
      insightsMeta = {
        insightsSource: legacy.source ?? null,
        insightsWarning: legacy.warning ?? null,
      };
      return insights.value.length > 0;
    }
    return false;
  }

  function loadPersistedFavorites(): boolean {
    const v2 = readJson<PersistedV2State>(V2_STORAGE_KEY);
    if (v2?.version === 2 && Array.isArray(v2.favorites)) {
      favorites.value = sanitizeFavorites(v2.favorites);
      return favorites.value.length > 0;
    }

    const legacy = readJson<LegacyPersistedFavoritesState>(V1_FAVORITES_KEY);
    if (legacy && Array.isArray(legacy.items)) {
      favorites.value = sanitizeFavorites(legacy.items);
      return favorites.value.length > 0;
    }
    return false;
  }

  // ============ 收藏 ============
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
      persistSnapshot();
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
    persistSnapshot();
    return { ok: true, action: 'added' };
  }

  function removeFavorite(seed: StorySeedCard): boolean {
    const key = favoriteSeedKey(seed);
    const before = favorites.value.length;
    favorites.value = favorites.value.filter(item => favoriteSeedKey(item.seed) !== key);
    if (favorites.value.length === before) return false;
    persistSnapshot();
    return true;
  }

  function clearFavorites(): void {
    favorites.value = [];
    persistSnapshot();
  }

  // ============ 刷新 ============
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

  async function refreshSeedsForTab(
    tab: SeedPlayTab,
    extra?: RefreshStorySeedsOptions,
  ): Promise<StorySeedCard[]> {
    const currentId = ++refreshId;
    const signal = createSignal();
    const bucket = seedBuckets[tab];
    const playStyle = extra?.playStyle ?? getPlayStyle(tab) ?? 'standard';
    const ownConstraints = getPlayMode(tab).mergeRules === 'ownConstraints';

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

    if (ownConstraints) {
      options.lockedSlots = {
        ...(lockedAudience.value ? { audience: lockedAudience.value } : {}),
        ...(lockedPlatform.value ? { platform: lockedPlatform.value } : {}),
        ...(lockedLength.value ? { length: lockedLength.value } : {}),
      };
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

      persistSnapshot();
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
        (getSeedPlayTabs().find(tab => getPlayStyle(tab as SeedPlayTab) === extra.playStyle) as
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
      insightsMeta = {
        insightsSource: batch.source,
        insightsWarning: batch.warning ?? null,
      };
      insightNameHistory.value = pushHistory(
        insightNameHistory.value,
        batch.items.map(item => item.name),
      );
      persistSnapshot();
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
      playStyle: getPlayStyle(mode) ?? 'standard',
      ...extra,
    });
  }

  // ============ 玩法操作 ============
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
    persistSnapshot();
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

  async function refreshFromMix(input: { tags: string[]; elements: string[] }): Promise<StorySeedCard[]> {
    return refreshSeedsForTab('mix', {
      playStyle: 'mix',
      mixTags: input.tags,
      mixElements: input.elements,
      genre: input.tags[0],
    });
  }

  async function refreshFromDice(diceRoll: TopicDiceRoll): Promise<StorySeedCard[]> {
    return refreshSeedsForTab('dice', {
      playStyle: 'dice',
      diceRoll,
      genre: diceRoll.genre,
    });
  }

  // ============ 锁定 ============
  function setLockedGenre(genre: string | null): void {
    lockedGenre.value = genre;
    if (!genre) {
      activeInsightContext.value = null;
      selectedInsightId.value = null;
    }
    persistSnapshot();
  }

  function setLockedAudience(audience: TopicAudience | null): void {
    lockedAudience.value = audience;
    persistSnapshot();
  }

  function setLockedPlatform(platform: TopicPlatform | null): void {
    lockedPlatform.value = platform;
    persistSnapshot();
  }

  function setLockedLength(length: TopicLength | null): void {
    lockedLength.value = length;
    persistSnapshot();
  }

  function clearLocks(): void {
    lockedGenre.value = null;
    lockedAudience.value = null;
    lockedPlatform.value = null;
    lockedLength.value = null;
    selectedInsightId.value = null;
    activeInsightContext.value = null;
    persistSnapshot();
  }

  function switchTab(tab: TopicDiscoveryTab): void {
    activeTab.value = tab;
    applyTabMeta(tab);
  }

  function getSeedsForTab(tab: SeedPlayTab): StorySeedCard[] {
    return seedBuckets[tab].items;
  }

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
    insightsMeta = { insightsSource: null, insightsWarning: null };
    activeTab.value = 'seeds';
    removeKey(V2_STORAGE_KEY);
    for (const oldKey of [V1_BUCKETS_KEY, V1_SEEDS_KEY, V1_INSIGHTS_KEY, V1_FAVORITES_KEY]) {
      removeKey(oldKey);
    }
    // 收藏是跨会话资产，reset 会话不清理；需 clearFavorites 显式清空
  }

  return {
    // state
    activeTab,
    isRefreshing,
    refreshingTarget,
    error,
    warning,
    source,
    seedBuckets,
    insights,
    favorites,
    lockedGenre,
    lockedAudience,
    lockedPlatform,
    lockedLength,
    selectedInsightId,
    activeInsightContext,
    insightNameHistory,
    // getters
    activeSeedTab,
    seeds,
    seedTitleHistory,
    selectedInsight,
    hasSeeds,
    hasInsights,
    hasFavorites,
    favoriteCount,
    isRefreshingCurrent,
    // actions
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
});

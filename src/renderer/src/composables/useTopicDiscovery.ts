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
  GenreInsightCard,
  RefreshGenreInsightsOptions,
  RefreshStorySeedsOptions,
  SeedPlayStyle,
  StorySeedCard,
  TopicAudience,
  TopicDiceRoll,
  TopicDiscoverySource,
  TopicDiscoveryTab,
} from '@/types/topic-discovery';

export type { TopicDiscoveryTab };

/** 会产生灵感种子的玩法 */
export type SeedPlayTab = 'seeds' | 'mix' | 'dice' | 'twist';

const MAX_HISTORY = 40;
const SEEDS_STORAGE_KEY = 'moliu:topic-discovery:seeds';
const SEED_BUCKETS_STORAGE_KEY = 'moliu:topic-discovery:seed-buckets';
const INSIGHTS_STORAGE_KEY = 'moliu:topic-discovery:insights';

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
  savedAt: string;
}

interface PersistedInsightsState {
  insights: GenreInsightCard[];
  source: TopicDiscoverySource | null;
  warning: string | null;
  insightNameHistory: string[];
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
  const selectedInsightId = ref<string | null>(null);

  const insightNameHistory = ref<string[]>([]);

  let insightsMeta: Pick<PersistedInsightsState, 'source' | 'warning'> = {
    source: null,
    warning: null,
  };

  let refreshId = 0;

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
    persistSeedBucketsSnapshot();
    applyTabMeta(activeTab.value);
    return true;
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
    const bucket = seedBuckets[tab];
    const playStyle = extra?.playStyle ?? TAB_TO_STYLE[tab];
    const ignoreLockedGenre = playStyle === 'mix' || playStyle === 'dice';

    isRefreshing.value = true;
    refreshingTarget.value = tab;
    error.value = null;

    if (activeSeedTab.value === tab || activeTab.value === tab) {
      warning.value = null;
    }

    const options: RefreshStorySeedsOptions = {
      count: 4,
      excludeTitles: bucket.titleHistory,
      audience: lockedAudience.value ?? undefined,
      ...extra,
      playStyle,
    };

    if (ignoreLockedGenre) {
      // 混搭/骰子以自身约束为准，不套用雷达锁定题材
      options.lockedSlots = {
        ...(lockedAudience.value ? { audience: lockedAudience.value } : {}),
      };
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
      if (currentId !== refreshId) {
        return [];
      }
      error.value = err instanceof Error ? err.message : String(err);
      return bucket.items;
    } finally {
      if (currentId === refreshId) {
        isRefreshing.value = false;
        refreshingTarget.value = null;
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
    isRefreshing.value = true;
    refreshingTarget.value = 'radar';
    error.value = null;
    warning.value = null;

    const options: RefreshGenreInsightsOptions = {
      count: 4,
      excludeNames: insightNameHistory.value,
      audience: lockedAudience.value ?? undefined,
      ...extra,
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
      if (currentId !== refreshId) {
        return [];
      }
      error.value = err instanceof Error ? err.message : String(err);
      return insights.value;
    } finally {
      if (currentId === refreshId) {
        isRefreshing.value = false;
        refreshingTarget.value = null;
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
  }

  function setLockedAudience(audience: TopicAudience | null): void {
    lockedAudience.value = audience;
  }

  function clearLocks(): void {
    lockedGenre.value = null;
    lockedAudience.value = null;
    selectedInsightId.value = null;
    persistSeedBucketsSnapshot();
  }

  function switchTab(tab: TopicDiscoveryTab): void {
    activeTab.value = tab;
    applyTabMeta(tab);
  }

  function getSeedsForTab(tab: SeedPlayTab): StorySeedCard[] {
    return seedBuckets[tab].items;
  }

  function reset(): void {
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
    selectedInsightId.value = null;
    insightNameHistory.value = [];
    insightsMeta = { source: null, warning: null };
    activeTab.value = 'seeds';
    removeKey(SEEDS_STORAGE_KEY);
    removeKey(SEED_BUCKETS_STORAGE_KEY);
    removeKey(INSIGHTS_STORAGE_KEY);
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
    lockedGenre,
    lockedAudience,
    selectedInsightId,
    selectedInsight,
    hasSeeds,
    hasInsights,
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
    selectInsight,
    adoptInsightAndRefreshSeeds,
    setLockedGenre,
    setLockedAudience,
    clearLocks,
    switchTab,
    getSeedsForTab,
    reset,
    buildPromptFromSeed,
  };
}

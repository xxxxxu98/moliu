/**
 * 开题中心 Composable
 * AI 刷新灵感种子 / 题材洞察，带竞态保护与历史 exclude
 * 种子与题材雷达均持久化：进入时恢复缓存，仅手动刷新时重新拉取
 */

import { computed, ref } from 'vue';
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
  StorySeedCard,
  TopicAudience,
  TopicDiscoverySource,
} from '@/types/topic-discovery';

export type TopicDiscoveryTab = 'seeds' | 'radar' | 'prompt';

const MAX_HISTORY = 40;
const SEEDS_STORAGE_KEY = 'moliu:topic-discovery:seeds';
const INSIGHTS_STORAGE_KEY = 'moliu:topic-discovery:insights';

interface PersistedSeedsState {
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
  const error = ref<string | null>(null);
  const warning = ref<string | null>(null);
  const source = ref<TopicDiscoverySource | null>(null);

  const seeds = ref<StorySeedCard[]>([]);
  const insights = ref<GenreInsightCard[]>([]);

  const lockedGenre = ref<string | null>(null);
  const lockedAudience = ref<TopicAudience | null>(null);
  const selectedInsightId = ref<string | null>(null);

  const seedTitleHistory = ref<string[]>([]);
  const insightNameHistory = ref<string[]>([]);

  /** 分 Tab 保存的元信息，切换时恢复对应 warning/source */
  let seedsMeta: Pick<PersistedSeedsState, 'source' | 'warning'> = {
    source: null,
    warning: null,
  };
  let insightsMeta: Pick<PersistedInsightsState, 'source' | 'warning'> = {
    source: null,
    warning: null,
  };

  let refreshId = 0;

  const selectedInsight = computed(
    () => insights.value.find((item) => item.id === selectedInsightId.value) ?? null,
  );

  const hasSeeds = computed(() => seeds.value.length > 0);
  const hasInsights = computed(() => insights.value.length > 0);

  function applyTabMeta(tab: TopicDiscoveryTab): void {
    if (tab === 'radar') {
      source.value = insightsMeta.source;
      warning.value = insightsMeta.warning;
      return;
    }
    if (tab === 'seeds') {
      source.value = seedsMeta.source;
      warning.value = seedsMeta.warning;
      return;
    }
    source.value = null;
    warning.value = null;
  }

  function persistSeedsSnapshot(): void {
    if (seeds.value.length === 0) return;
    seedsMeta = { source: source.value, warning: warning.value };
    writeJson(SEEDS_STORAGE_KEY, {
      seeds: seeds.value,
      source: seedsMeta.source,
      warning: seedsMeta.warning,
      seedTitleHistory: seedTitleHistory.value,
      lockedGenre: lockedGenre.value,
      lockedAudience: lockedAudience.value,
      savedAt: new Date().toISOString(),
    } satisfies PersistedSeedsState);
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

  /** 从本地恢复上一批灵感种子；无缓存时返回 false */
  function loadPersistedSeeds(): boolean {
    const cached = readJson<PersistedSeedsState>(SEEDS_STORAGE_KEY);
    if (!cached || !Array.isArray(cached.seeds) || cached.seeds.length === 0) {
      return false;
    }

    seeds.value = cached.seeds;
    seedTitleHistory.value = cached.seedTitleHistory ?? [];
    lockedGenre.value = cached.lockedGenre;
    lockedAudience.value = cached.lockedAudience;
    seedsMeta = { source: cached.source, warning: cached.warning };
    if (activeTab.value === 'seeds') {
      applyTabMeta('seeds');
    }
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

  async function refreshSeeds(extra?: RefreshStorySeedsOptions): Promise<StorySeedCard[]> {
    const currentId = ++refreshId;
    isRefreshing.value = true;
    error.value = null;
    warning.value = null;

    const options: RefreshStorySeedsOptions = {
      count: 3,
      excludeTitles: seedTitleHistory.value,
      genre: lockedGenre.value ?? undefined,
      audience: lockedAudience.value ?? undefined,
      lockedSlots: {
        ...(lockedGenre.value ? { genre: lockedGenre.value } : {}),
        ...(lockedAudience.value ? { audience: lockedAudience.value } : {}),
      },
      ...extra,
    };

    try {
      const batch = await refreshStorySeeds(options);
      if (currentId !== refreshId) {
        return [];
      }

      seeds.value = batch.items;
      source.value = batch.source;
      warning.value = batch.warning ?? null;
      seedTitleHistory.value = pushHistory(
        seedTitleHistory.value,
        batch.items.map((item) => item.title),
      );
      persistSeedsSnapshot();
      return batch.items;
    } catch (err) {
      if (currentId !== refreshId) {
        return [];
      }
      error.value = err instanceof Error ? err.message : String(err);
      return seeds.value;
    } finally {
      if (currentId === refreshId) {
        isRefreshing.value = false;
      }
    }
  }

  async function refreshInsights(
    extra?: RefreshGenreInsightsOptions,
  ): Promise<GenreInsightCard[]> {
    const currentId = ++refreshId;
    isRefreshing.value = true;
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
        batch.items.map((item) => item.name),
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
      }
    }
  }

  async function refresh(mode: TopicDiscoveryTab = activeTab.value): Promise<void> {
    if (mode === 'radar') {
      await refreshInsights();
      return;
    }
    if (mode === 'seeds') {
      await refreshSeeds();
    }
  }

  function selectInsight(insight: GenreInsightCard): void {
    selectedInsightId.value = insight.id;
    lockedGenre.value = insight.name;
    lockedAudience.value = insight.audience;
  }

  async function adoptInsightAndRefreshSeeds(insight: GenreInsightCard): Promise<StorySeedCard[]> {
    selectInsight(insight);
    activeTab.value = 'seeds';
    return refreshSeeds(insightToSeedConstraints(insight));
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
    persistSeedsSnapshot();
  }

  function switchTab(tab: TopicDiscoveryTab): void {
    activeTab.value = tab;
    applyTabMeta(tab);
  }

  function reset(): void {
    refreshId += 1;
    isRefreshing.value = false;
    error.value = null;
    warning.value = null;
    source.value = null;
    seeds.value = [];
    insights.value = [];
    lockedGenre.value = null;
    lockedAudience.value = null;
    selectedInsightId.value = null;
    seedTitleHistory.value = [];
    insightNameHistory.value = [];
    seedsMeta = { source: null, warning: null };
    insightsMeta = { source: null, warning: null };
    activeTab.value = 'seeds';
    removeKey(SEEDS_STORAGE_KEY);
    removeKey(INSIGHTS_STORAGE_KEY);
  }

  return {
    activeTab,
    isRefreshing,
    error,
    warning,
    source,
    seeds,
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
    refreshInsights,
    loadPersistedSeeds,
    loadPersistedInsights,
    selectInsight,
    adoptInsightAndRefreshSeeds,
    setLockedGenre,
    setLockedAudience,
    clearLocks,
    switchTab,
    reset,
    buildPromptFromSeed,
  };
}

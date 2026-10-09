<script setup lang="ts">
/**
 * 开题中心页面容器（TopicDiscoveryBoard）
 * 玩法/种子/洞察/收藏状态来自 topicDiscovery.store；方向卡会话来自 directionSession.store。
 * 替代原 TopicDiscoveryPanel.vue 巨型组件。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useMessage } from 'naive-ui';
import {
  Sparkles,
  RefreshCw,
  Compass,
  PenLine,
  TrendingUp,
  Wand2,
  Rocket,
  Layers3,
  Bookmark,
  BookmarkCheck,
  Database,
  Dices,
  Shuffle,
  Puzzle,
} from 'lucide-vue-next';
import { useTopicDiscoveryStore } from '@/stores/topicDiscovery.store';
import { useDirectionSessionStore } from './directionSession.store';
import { PLAY_MODES } from '@/services/inspiration/play-modes';
import { useTopicOpeningPipeline } from '@/composables/useTopicOpeningPipeline';
import { DEFAULT_WORD_COUNT_RANGE } from '@/services/ai/unified.service';
import { mapExecutableOutlineToGeneratedOutline } from '@/services/outline/adapters/executable-outline-adapter';
import { buildDirectionScaleHint } from '@/services/outline/utils/direction-scale-hint';
import { genreTags } from '@/data/inspirations';
import { BRAIN_GENRES } from '@/services/inspiration/fallback/genre-pool';
import { OPENING_HOOKS, UNEXPECTED_TWISTS } from '@/services/inspiration/fallback/hook-twist-pool';
import type { OutlineDirection } from '@/services/outline/types/direction';
import type { GeneratedOutline } from '@/types/inspiration';
import type {
  GenreInsightCard,
  StorySeedCard,
  TopicAudience,
  TopicDiceRoll,
  TopicDiscoveryTab,
  TopicLength,
  TopicPlatform,
} from '@/types/topic-discovery';
import type { PlayModeOption } from './types';
import DirectionResultPanel from '@/components/home/DirectionResultPanel.vue';
import PlayModeSwitcher from './components/PlayModeSwitcher.vue';
import FilterBar from './components/FilterBar.vue';
import SeedGrid, { type SeedCardItem } from './components/SeedGrid.vue';
import InsightGrid from './components/InsightGrid.vue';
import MixPanel from './components/MixPanel.vue';
import DicePanel from './components/DicePanel.vue';
import PromptPanel from './components/PromptPanel.vue';
import FavoritesPanel from './components/FavoritesPanel.vue';

/** 混搭题材上限：首个为主题材，其余为副题材 */
const MAX_MIX_GENRES = 8;
const MAX_MIX_ELEMENTS = 8;

function pickRandom<T>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)] as T;
}

const { t } = useI18n();
const message = useMessage();

const discovery = useTopicDiscoveryStore();
const sessionStore = useDirectionSessionStore();
const {
  activeTab,
  isRefreshing,
  isRefreshingCurrent,
  warning,
  source,
  seeds,
  insights,
  favorites,
  favoriteCount,
  maxFavorites,
  lockedGenre,
  lockedAudience,
  lockedPlatform,
  lockedLength,
  selectedInsightId,
  activeInsightContext,
} = storeToRefs(discovery);

const selectedWordCountRange = ref(DEFAULT_WORD_COUNT_RANGE);
const opening = useTopicOpeningPipeline(selectedWordCountRange);
const { isGenerating, isProcessing, generationProgress } = opening;
const freePrompt = ref('');
const showFavorites = ref(false);

const selectedMixTags = ref<string[]>([]);
const selectedMixElements = ref<string[]>([]);

const diceRoll = ref<TopicDiceRoll | null>(null);
const isDiceRolling = ref(false);

/** 当前玩法下的方向卡会话 */
const currentSession = computed(() => sessionStore.getSession(activeTab.value));

const MODE_UI: Record<TopicDiscoveryTab, { icon: typeof Sparkles; accent: string }> = {
  seeds: { icon: Sparkles, accent: 'teal' },
  radar: { icon: TrendingUp, accent: 'amber' },
  mix: { icon: Puzzle, accent: 'indigo' },
  dice: { icon: Dices, accent: 'rose' },
  twist: { icon: Shuffle, accent: 'violet' },
  prompt: { icon: PenLine, accent: 'cyan' },
};

/** 玩法入口：由 play-modes 配置表派生（新增玩法只改配置 + 此处 UI 映射） */
const playModes: PlayModeOption[] = PLAY_MODES.map(mode => ({
  id: mode.id,
  ...MODE_UI[mode.id],
}));

const hasActiveFilters = computed(
  () =>
    !!lockedGenre.value ||
    !!lockedAudience.value ||
    !!lockedPlatform.value ||
    !!lockedLength.value ||
    !!activeInsightContext.value,
);

const isPipelineActiveOnCurrentTab = computed((): boolean => {
  return opening.isPipelineActiveOn(activeTab.value);
});

const pipelineError = computed((): string | null => {
  return opening.pipelineErrorOn(activeTab.value);
});

const showsSeedGrid = computed(
  () =>
    activeTab.value === 'seeds' ||
    activeTab.value === 'twist' ||
    activeTab.value === 'mix' ||
    activeTab.value === 'dice',
);

const canMixGenerate = computed(
  () =>
    selectedMixTags.value.length >= 1 &&
    selectedMixElements.value.length >= 1 &&
    !isRefreshing.value &&
    !isProcessing.value,
);

/** 种子卡列表（注入收藏标记） */
const seedCards = computed<SeedCardItem[]>(() =>
  seeds.value.map(seed => ({ ...seed, _favorite: discovery.isFavorite(seed) })),
);

const refreshButtonLabel = computed(() => {
  switch (activeTab.value) {
    case 'prompt':
      return t('topicDiscovery.refreshDirections');
    case 'radar':
      return t('topicDiscovery.refreshRadar');
    case 'twist':
      return t('topicDiscovery.refreshTwist');
    case 'mix':
      return t('topicDiscovery.refreshMix');
    case 'dice':
      return t('topicDiscovery.refreshDice');
    default:
      return t('topicDiscovery.refreshSeeds');
  }
});

const seedGridEmpty = computed(() => {
  if (activeTab.value === 'twist') {
    return {
      title: t('topicDiscovery.emptyTwistTitle'),
      desc: t('topicDiscovery.emptyTwistDesc'),
    };
  }
  return {
    title: t('topicDiscovery.emptySeedsTitle'),
    desc: t('topicDiscovery.emptySeedsDesc'),
  };
});

const directionCards = computed(() =>
  currentSession.value.directions.map((direction, index) => ({
    id: direction.id,
    icon: [Rocket, Layers3, Wand2][index] ?? Sparkles,
    accent:
      [
        'from-indigo-500 to-violet-600',
        'from-fuchsia-500 to-pink-600',
        'from-amber-500 to-orange-600',
      ][index] ?? 'from-slate-500 to-slate-600',
    direction,
    scaleHint: buildDirectionScaleHint(selectedWordCountRange.value, direction),
  })),
);

const previewGeneratedOutline = computed<GeneratedOutline | null>(() => {
  const session = currentSession.value;
  if (!session.expandedOutline) return null;
  return mapExecutableOutlineToGeneratedOutline(session.expandedOutline, {
    targetWordCountRange: selectedWordCountRange.value,
  });
});

const previewOutline = computed<GeneratedOutline | null>(() => {
  if (currentSession.value.selectedOutline) return currentSession.value.selectedOutline;
  return previewGeneratedOutline.value;
});

const canExpandDirection = computed((): boolean => {
  return !!currentSession.value.selectedDirection && !isPipelineActiveOnCurrentTab.value;
});

const showDirectionPanel = computed((): boolean => {
  const session = currentSession.value;
  return (
    session.directions.length > 0 ||
    isPipelineActiveOnCurrentTab.value ||
    !!pipelineError.value
  );
});

const canSubmitPrompt = computed((): boolean => {
  return freePrompt.value.trim().length >= 8 && !isProcessing.value;
});

let diceToken = 0;

onMounted(() => {
  discovery.hydratePersisted();
  window.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  diceToken += 1;
  window.removeEventListener('keydown', handleGlobalKeydown);
  discovery.cancelRefresh();
  opening.cancel();
});

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  if (isGenerating.value) {
    event.preventDefault();
    handleCancelGeneration();
    return;
  }
  if (isRefreshing.value) {
    event.preventDefault();
    handleCancelRefresh();
  }
}

function handleCancelGeneration(): void {
  if (!isGenerating.value) return;
  opening.cancel();
  message.info(t('topicDiscovery.generationCancelled'));
}

function handleCancelRefresh(): void {
  if (!isRefreshing.value) return;
  discovery.cancelRefresh();
  message.info(t('topicDiscovery.refreshCancelled'));
}

async function handleRefresh(): Promise<void> {
  if (isRefreshing.value || isProcessing.value || isDiceRolling.value) return;

  if (activeTab.value === 'prompt') {
    await handleFreePromptGenerate();
    return;
  }

  if (activeTab.value === 'mix') {
    if (!canMixGenerate.value) {
      message.warning(t('topicDiscovery.mixNeedMore'));
      return;
    }
    await discovery.refreshFromMix({
      tags: selectedMixTags.value,
      elements: selectedMixElements.value,
    });
    return;
  }

  if (activeTab.value === 'dice') {
    // 未掷过时自动先掷一次，避免用户点上方「用骰子开题」被拦
    if (!diceRoll.value) {
      await rollDice();
    }
    if (!diceRoll.value || isRefreshing.value || isProcessing.value) return;
    await discovery.refreshFromDice(diceRoll.value);
    return;
  }

  await discovery.refresh(activeTab.value);
}

async function generateFromPrompt(
  prompt: string,
  tab: TopicDiscoveryTab = activeTab.value,
): Promise<void> {
  await opening.generateFromPrompt(prompt, tab);
}

async function adoptSeed(seed: StorySeedCard, fromTab?: TopicDiscoveryTab): Promise<void> {
  if (isProcessing.value) return;
  // 从收藏开题时落到当前玩法会话；若在雷达/一句话则落到灵感种子
  const tab: TopicDiscoveryTab =
    activeTab.value === 'radar' || activeTab.value === 'prompt' ? 'seeds' : activeTab.value;
  if (showFavorites.value && (activeTab.value === 'radar' || activeTab.value === 'prompt')) {
    discovery.switchTab('seeds');
  }
  const session = sessionStore.getSession(tab);
  sessionStore.setSelectedSeed(tab, seed);
  sessionStore.setSeedSourceTab(tab, fromTab ?? activeTab.value);
  const prompt = discovery.buildPromptFromSeed(seed);
  await generateFromPrompt(prompt, tab);
}

function handleToggleFavorite(seed: StorySeedCard, fromTab?: TopicDiscoveryTab): void {
  const result = discovery.toggleFavorite(seed, fromTab ?? activeTab.value);
  if (!result.ok) {
    message.warning(result.reason);
    return;
  }
  if (result.action === 'added') {
    message.success(t('topicDiscovery.favoriteAdded'));
  } else {
    message.info(t('topicDiscovery.favoriteRemoved'));
  }
}

function handleClearFavorites(): void {
  if (favoriteCount.value === 0) return;
  discovery.clearFavorites();
  message.info(t('topicDiscovery.favoritesCleared'));
}

function toggleFavoritesPanel(): void {
  showFavorites.value = !showFavorites.value;
}

async function handleAdoptInsight(insight: GenreInsightCard): Promise<void> {
  if (isRefreshing.value || isProcessing.value) return;
  await discovery.adoptInsightAndRefreshSeeds(insight);
  message.success(t('topicDiscovery.insightApplied', { name: insight.name }));
}

function selectDirection(direction: OutlineDirection): void {
  opening.selectDirection(activeTab.value, direction);
}

async function handleExpandDirection(options?: {
  enhancementBrief?: string;
  directionId?: string;
}): Promise<void> {
  await opening.expandSelectedDirection(activeTab.value, options);
}

async function handleEnhanceDirection(
  direction: OutlineDirection,
  enhancementBrief: string,
): Promise<void> {
  selectDirection(direction);
  await handleExpandDirection({
    enhancementBrief,
    directionId: direction.id,
  });
}

async function handleFreePromptGenerate(): Promise<void> {
  if (!canSubmitPrompt.value) {
    message.warning(t('topicDiscovery.promptTooShort'));
    return;
  }
  sessionStore.setSelectedSeed('prompt', null);
  sessionStore.setSeedSourceTab('prompt', null);
  await generateFromPrompt(freePrompt.value.trim(), 'prompt');
}

async function handleCreateProject(): Promise<void> {
  await opening.createProjectFromSession(activeTab.value);
}

function onSwitchTab(tab: TopicDiscoveryTab): void {
  discovery.switchTab(tab);
}

function handleSelectOutline(outline: GeneratedOutline): void {
  sessionStore.setSelectedOutline(activeTab.value, outline);
}

function handleRegenerateDirections(): void {
  const session = sessionStore.getSession(activeTab.value);
  if (!session.prompt) return;
  void generateFromPrompt(session.prompt, activeTab.value);
}

function toggleMixTag(name: string): void {
  const list = selectedMixTags.value;
  if (list.includes(name)) {
    selectedMixTags.value = list.filter(item => item !== name);
    return;
  }
  if (list.length >= MAX_MIX_GENRES) {
    message.warning(t('topicDiscovery.mixMaxGenres', { max: MAX_MIX_GENRES }));
    return;
  }
  selectedMixTags.value = [...list, name];
}

function toggleMixElement(name: string): void {
  const list = selectedMixElements.value;
  if (list.includes(name)) {
    selectedMixElements.value = list.filter(item => item !== name);
    return;
  }
  if (list.length >= MAX_MIX_ELEMENTS) {
    message.warning(t('topicDiscovery.mixMaxElements', { max: MAX_MIX_ELEMENTS }));
    return;
  }
  selectedMixElements.value = [...list, name];
}

async function rollDice(): Promise<void> {
  if (isDiceRolling.value || isRefreshing.value || isProcessing.value) return;
  isDiceRolling.value = true;
  const token = ++diceToken;

  const diceGenres = [...BRAIN_GENRES.map(g => g.name), ...genreTags.map(tag => tag.name)];
  const frames = 8;
  for (let i = 0; i < frames; i += 1) {
    if (token !== diceToken) {
      isDiceRolling.value = false;
      return;
    }
    diceRoll.value = {
      genre: pickRandom(diceGenres),
      hook: pickRandom(OPENING_HOOKS),
      twist: pickRandom(UNEXPECTED_TWISTS),
    };
    await new Promise<void>(resolve => {
      window.setTimeout(resolve, 45 + i * 18);
    });
  }
  if (token !== diceToken) {
    isDiceRolling.value = false;
    return;
  }

  diceRoll.value = {
    genre: pickRandom(diceGenres),
    hook: pickRandom(OPENING_HOOKS),
    twist: pickRandom(UNEXPECTED_TWISTS),
  };
  isDiceRolling.value = false;
}
</script>

<template>
  <div class="w-full space-y-5">
    <!-- Header -->
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-3 min-w-0">
        <div
          class="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center flex-shrink-0"
        >
          <Compass class="w-5 h-5 text-white" />
        </div>
        <div class="min-w-0">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ t('topicDiscovery.title') }}
          </h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ t('topicDiscovery.description') }}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="
            showFavorites
              ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-700/50'
              : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          "
          @click="toggleFavoritesPanel"
        >
          <BookmarkCheck v-if="favoriteCount > 0" class="w-4 h-4" />
          <Bookmark v-else class="w-4 h-4" />
          {{ t('topicDiscovery.favorites') }}
          <span
            v-if="favoriteCount > 0"
            class="min-w-[1.25rem] h-5 px-1 rounded-full bg-amber-500 text-white text-xs inline-flex items-center justify-center"
          >
            {{ favoriteCount }}
          </span>
        </button>
        <button
          v-if="isGenerating"
          type="button"
          class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-base font-medium transition-colors bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50"
          @click="handleCancelGeneration"
        >
          {{ t('topicDiscovery.cancelGeneration') }}
        </button>
        <button
          v-else-if="isRefreshing"
          type="button"
          class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-base font-medium transition-colors bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50"
          @click="handleCancelRefresh"
        >
          {{ t('topicDiscovery.cancelRefresh') }}
        </button>
        <button
          v-else
          type="button"
          class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-base font-medium transition-colors"
          :class="
            isDiceRolling
              ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
              : 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50'
          "
          :disabled="isDiceRolling || isProcessing"
          @click="handleRefresh"
        >
          <RefreshCw
            class="w-4 h-4"
            :class="{ 'animate-spin': isDiceRolling }"
          />
          {{ refreshButtonLabel }}
        </button>
      </div>
    </div>

    <!-- Favorites panel -->
    <FavoritesPanel
      v-if="showFavorites"
      :favorites="favorites"
      :max-favorites="maxFavorites"
      @adopt="adoptSeed"
      @remove="handleToggleFavorite"
      @clear="handleClearFavorites"
    />

    <!-- Play modes：多样玩法 -->
    <PlayModeSwitcher :modes="playModes" :active-tab="activeTab" @select="onSwitchTab" />

    <!-- Locks + word count -->
    <FilterBar
      :locked-genre="lockedGenre"
      :locked-audience="lockedAudience"
      :locked-platform="lockedPlatform"
      :locked-length="lockedLength"
      :active-insight-context="activeInsightContext"
      :has-active-filters="hasActiveFilters"
      :disabled="isProcessing"
      :word-count-range="selectedWordCountRange"
      @audience="discovery.setLockedAudience"
      @platform="discovery.setLockedPlatform"
      @length="discovery.setLockedLength"
      @clear="discovery.clearLocks"
      @update:word-count-range="selectedWordCountRange = $event"
    />

    <!-- Source badge + warning -->
    <div
      v-if="warning"
      class="flex flex-wrap items-center gap-2 text-sm text-amber-600 dark:text-amber-400 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2"
    >
      <span
        v-if="source === 'fallback'"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500 text-white text-xs font-medium"
      >
        <Database class="w-3 h-3" />
        {{ t('topicDiscovery.sourceLocal') }}
      </span>
      <span
        v-else-if="source === 'ai'"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-500 text-white text-xs font-medium"
      >
        <Sparkles class="w-3 h-3" />
        {{ t('topicDiscovery.sourceAI') }}
      </span>
      <span>{{ warning }}</span>
    </div>

    <!-- Mix controls -->
    <MixPanel
      v-if="activeTab === 'mix'"
      :selected-tags="selectedMixTags"
      :selected-elements="selectedMixElements"
      :max-genre-picks="MAX_MIX_GENRES"
      :max-element-picks="MAX_MIX_ELEMENTS"
      :audience="lockedAudience"
      :disabled="isProcessing"
      @toggle-tag="toggleMixTag"
      @toggle-element="toggleMixElement"
    />

    <!-- Dice controls -->
    <DicePanel
      v-if="activeTab === 'dice'"
      :dice-roll="diceRoll"
      :is-rolling="isDiceRolling"
      :disabled="isRefreshing || isProcessing"
      @roll="rollDice"
    />

    <!-- Seeds / twist / mix / dice results（仅当前玩法自己的种子） -->
    <SeedGrid
      v-if="showsSeedGrid"
      :seeds="seedCards"
      :source="source"
      :is-refreshing="isRefreshingCurrent"
      :selected-seed-id="currentSession.selectedSeedId"
      :is-processing="isProcessing"
      :empty-title="seedGridEmpty.title"
      :empty-desc="seedGridEmpty.desc"
      :refresh-label="refreshButtonLabel"
      :show-empty-guide="activeTab === 'seeds' || activeTab === 'twist'"
      @select="adoptSeed"
      @favorite="handleToggleFavorite"
      @refresh="handleRefresh"
    />

    <!-- Radar tab -->
    <InsightGrid
      v-else-if="activeTab === 'radar'"
      :insights="insights"
      :is-refreshing="isRefreshingCurrent"
      :selected-insight-id="selectedInsightId"
      :disabled="isProcessing"
      :refresh-label="refreshButtonLabel"
      @select="handleAdoptInsight"
      @refresh="handleRefresh"
    />

    <!-- Prompt tab -->
    <PromptPanel
      v-else
      v-model="freePrompt"
      :can-submit="canSubmitPrompt"
      :disabled="isProcessing"
      @submit="handleFreePromptGenerate"
    />

    <!-- Direction pipeline -->
    <DirectionResultPanel
      :show="showDirectionPanel"
      :title="t('topicDiscovery.directionTitle')"
      :description="t('topicDiscovery.directionDesc')"
      :cards="directionCards"
      :selected-direction="currentSession.selectedDirection"
      :is-processing="isPipelineActiveOnCurrentTab"
      :progress="isPipelineActiveOnCurrentTab ? generationProgress || '' : ''"
      :error="pipelineError"
      :can-expand="canExpandDirection"
      :preview-outline="previewOutline"
      :expanded-outline="currentSession.expandedOutline"
      :empty-description="t('topicDiscovery.directionEmpty')"
      :disable-regenerate="isPipelineActiveOnCurrentTab"
      :enhancing-direction-id="currentSession.enhanceTargetDirectionId"
      @regenerate="handleRegenerateDirections"
      @select-direction="selectDirection"
      @expand="handleExpandDirection()"
      @enhance-direction="
        ({ direction, enhancementBrief }) => handleEnhanceDirection(direction, enhancementBrief)
      "
      @select-outline="handleSelectOutline"
      @create="handleCreateProject"
      @cancel="handleCancelGeneration"
    />
  </div>
</template>

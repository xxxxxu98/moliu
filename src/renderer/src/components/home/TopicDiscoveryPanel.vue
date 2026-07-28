<script setup lang="ts">
/**
 * 开题中心：题材雷达 / 灵感种子 / 一句话开题
 * AI「换一批」驱动找灵感；每个 Tab 独立保存方向卡会话
 */
import { computed, onMounted, reactive, ref } from 'vue';
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
  Lock,
  Eraser,
} from 'lucide-vue-next';
import { useTopicDiscovery, type TopicDiscoveryTab } from '@/composables/useTopicDiscovery';
import { useOutlineGenerator } from '@/composables/useOutlineGenerator';
import { useProjectCreator } from '@/composables/useProjectCreator';
import { DEFAULT_WORD_COUNT_RANGE } from '@/services/ai/unified.service';
import { buildWordCountBreakdown } from '@/services/outline/utils';
import { mapExecutableOutlineToGeneratedOutline } from '@/services/outline/adapters/executable-outline-adapter';
import type { OutlineDirection } from '@/services/outline/types/direction';
import type { ExecutableOutline } from '@/services/outline/types/executable-outline';
import type { GeneratedOutline } from '@/types/inspiration';
import type { GenreInsightCard, StorySeedCard, TopicAudience } from '@/types/topic-discovery';
import WordCountSelector from '@/components/common/WordCountSelector.vue';
import DirectionResultPanel from '@/components/home/DirectionResultPanel.vue';

interface DirectionSession {
  prompt: string;
  directions: OutlineDirection[];
  selectedDirection: OutlineDirection | null;
  expandedOutline: ExecutableOutline | null;
  selectedOutline: GeneratedOutline | null;
  enhanceTargetDirectionId: string | null;
  selectedSeedId: string | null;
}

function createEmptySession(): DirectionSession {
  return {
    prompt: '',
    directions: [],
    selectedDirection: null,
    expandedOutline: null,
    selectedOutline: null,
    enhanceTargetDirectionId: null,
    selectedSeedId: null,
  };
}

const { t } = useI18n();
const message = useMessage();

const {
  activeTab,
  isRefreshing,
  warning,
  source,
  seeds,
  insights,
  lockedGenre,
  lockedAudience,
  selectedInsightId,
  refresh,
  loadPersistedSeeds,
  loadPersistedInsights,
  adoptInsightAndRefreshSeeds,
  setLockedAudience,
  clearLocks,
  switchTab,
  buildPromptFromSeed,
} = useTopicDiscovery();

const {
  isGenerating,
  error: generationError,
  progress: generationProgress,
  generateDirections,
  expandDirection,
  reset: resetOutlineState,
} = useOutlineGenerator();

const {
  isCreating,
  error: projectCreateError,
  createProject: doCreateProject,
  reset: resetProjectState,
} = useProjectCreator();

const selectedWordCountRange = ref(DEFAULT_WORD_COUNT_RANGE);
const freePrompt = ref('');

/** 每个 Tab 独立的方向卡会话 */
const directionSessions = reactive<Record<TopicDiscoveryTab, DirectionSession>>({
  seeds: createEmptySession(),
  radar: createEmptySession(),
  prompt: createEmptySession(),
});

/** 当前正在跑方向生成/展开的 Tab */
const pipelineTab = ref<TopicDiscoveryTab | null>(null);

const audienceOptions: { id: TopicAudience; label: string }[] = [
  { id: 'general', label: '大众' },
  { id: 'male', label: '男生' },
  { id: 'female', label: '女生' },
];

const currentSession = computed(() => directionSessions[activeTab.value]);

const isProcessing = computed(() => isGenerating.value || isCreating.value);

const isPipelineActiveOnCurrentTab = computed(
  () => pipelineTab.value === activeTab.value && isProcessing.value,
);

const pipelineError = computed(() => {
  if (pipelineTab.value !== activeTab.value) return null;
  return generationError.value || projectCreateError.value || null;
});

const lifecycleLabel: Record<string, string> = {
  emerging: '萌芽',
  rising: '上升',
  peak: '高峰',
  declining: '回落',
  saturated: '饱和',
};

const riskLabel: Record<string, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
};

function buildDirectionScaleHint(wordCountRange: string, direction: OutlineDirection) {
  const breakdown = buildWordCountBreakdown(wordCountRange);
  const estimatedChapterCount = Math.max(30, Math.round(breakdown.targetWordCount / 3000));
  const suggestedVolumeCount = Math.max(3, Math.round(estimatedChapterCount / 40));
  const estimatedChaptersPerVolume = Math.round(estimatedChapterCount / suggestedVolumeCount);
  const longformText = [
    direction.premise,
    direction.coreConflict,
    direction.protagonistArc,
    direction.oneLiner,
  ].join(' ');

  const checks = [
    /地图|世界|城|域|位面|星球/,
    /反派|势力|家族|宗门|帝国|组织/,
    /关系|羁绊|爱人|师徒|兄弟|对手/,
    /悬念|秘密|身份|真相|伏笔/,
    /升级|境界|等级|成长|阶段/,
  ];
  const hit = checks.filter(re => re.test(longformText)).length;
  const longformCapacityScore = 60 + hit * 8 + Math.min(12, direction.recommendationScore);

  const longformCapacityTone =
    longformCapacityScore >= 88 ? 'strong' : longformCapacityScore >= 76 ? 'medium' : 'cautious';

  return {
    targetWordCountLabel: wordCountRange,
    estimatedChapterCount,
    suggestedVolumeCount,
    estimatedChaptersPerVolume,
    startupPhaseRatio: '约前 20% 完成开局兑现',
    longformCapacityScore,
    longformCapacityLabel:
      longformCapacityTone === 'strong'
        ? '长篇承载力强'
        : longformCapacityTone === 'medium'
          ? '长篇承载力稳'
          : '长篇承载力待加强',
    longformCapacityTone: longformCapacityTone as 'strong' | 'medium' | 'cautious',
    improvementSuggestions: [] as string[],
    enhancementBrief: '请在保持当前方向核心卖点不变的前提下，进一步放大长线升级空间与冲突层次。',
  };
}

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

const canExpandDirection = computed(
  () => !!currentSession.value.selectedDirection && !isPipelineActiveOnCurrentTab.value,
);

const showDirectionPanel = computed(() => {
  const session = currentSession.value;
  return (
    session.directions.length > 0 ||
    isPipelineActiveOnCurrentTab.value ||
    !!pipelineError.value
  );
});

const canSubmitPrompt = computed(
  () => freePrompt.value.trim().length >= 8 && !isProcessing.value,
);

onMounted(() => {
  loadPersistedSeeds();
  loadPersistedInsights();
});

async function handleRefresh(): Promise<void> {
  if (isRefreshing.value || isProcessing.value) return;
  if (activeTab.value === 'prompt') {
    if (!canSubmitPrompt.value) {
      message.warning(t('topicDiscovery.promptTooShort'));
      return;
    }
    await generateFromPrompt(freePrompt.value.trim(), 'prompt');
    return;
  }
  await refresh(activeTab.value);
}

async function generateFromPrompt(
  prompt: string,
  tab: TopicDiscoveryTab = activeTab.value,
): Promise<void> {
  const session = directionSessions[tab];
  pipelineTab.value = tab;

  session.prompt = prompt;
  session.directions = [];
  session.selectedDirection = null;
  session.expandedOutline = null;
  session.selectedOutline = null;
  session.enhanceTargetDirectionId = null;
  resetOutlineState();
  resetProjectState();

  session.directions = await generateDirections(prompt, {
    wordCountRange: selectedWordCountRange.value,
  });
  session.selectedDirection = session.directions[0] ?? null;

  if (session.directions.length === 0 && !generationError.value) {
    message.error(t('topicDiscovery.directionFailed'));
  }
}

async function adoptSeed(seed: StorySeedCard): Promise<void> {
  if (isProcessing.value) return;
  directionSessions.seeds.selectedSeedId = seed.id;
  const prompt = buildPromptFromSeed(seed);
  await generateFromPrompt(prompt, 'seeds');
}

async function handleAdoptInsight(insight: GenreInsightCard): Promise<void> {
  if (isRefreshing.value || isProcessing.value) return;
  await adoptInsightAndRefreshSeeds(insight);
  message.success(t('topicDiscovery.insightApplied', { name: insight.name }));
}

function selectDirection(direction: OutlineDirection): void {
  const session = directionSessions[activeTab.value];
  session.selectedDirection = direction;
  session.enhanceTargetDirectionId = null;
  session.expandedOutline = null;
  session.selectedOutline = null;
}

async function handleExpandDirection(options?: {
  enhancementBrief?: string;
  directionId?: string;
}): Promise<void> {
  const tab = activeTab.value;
  const session = directionSessions[tab];
  if (!session.selectedDirection || !session.prompt) return;

  pipelineTab.value = tab;
  const isEnhancing = !!options?.enhancementBrief;
  session.enhanceTargetDirectionId = isEnhancing
    ? (options?.directionId ?? session.selectedDirection.id)
    : null;

  session.expandedOutline = await expandDirection(session.prompt, session.selectedDirection, {
    wordCountRange: selectedWordCountRange.value,
    enhancementBrief: options?.enhancementBrief,
  });

  session.enhanceTargetDirectionId = null;

  if (session.expandedOutline) {
    session.selectedOutline = mapExecutableOutlineToGeneratedOutline(session.expandedOutline, {
      targetWordCountRange: selectedWordCountRange.value,
    });
  }
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

async function handleCreateProject(): Promise<void> {
  const session = directionSessions[activeTab.value];
  const outlineToCreate =
    session.selectedOutline ??
    (session.expandedOutline
      ? mapExecutableOutlineToGeneratedOutline(session.expandedOutline, {
          targetWordCountRange: selectedWordCountRange.value,
        })
      : null);
  if (!outlineToCreate) return;
  pipelineTab.value = activeTab.value;
  await doCreateProject(outlineToCreate);
}

function toggleAudienceLock(audience: TopicAudience): void {
  if (lockedAudience.value === audience) {
    setLockedAudience(null);
  } else {
    setLockedAudience(audience);
  }
}

function onSwitchTab(tab: TopicDiscoveryTab): void {
  switchTab(tab);
}

function handleSelectOutline(outline: GeneratedOutline): void {
  directionSessions[activeTab.value].selectedOutline = outline;
}

function handleRegenerateDirections(): void {
  const session = directionSessions[activeTab.value];
  if (!session.prompt) return;
  void generateFromPrompt(session.prompt, activeTab.value);
}
</script>
<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center flex-shrink-0"
        >
          <Compass class="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ t('topicDiscovery.title') }}
          </h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ t('topicDiscovery.description') }}
          </p>
        </div>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-base font-medium transition-colors"
        :class="
          isRefreshing || isProcessing
            ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
            : 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50'
        "
        :disabled="isRefreshing || isProcessing"
        @click="handleRefresh"
      >
        <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isRefreshing || isProcessing }" />
        {{
          activeTab === 'prompt'
            ? t('topicDiscovery.refreshDirections')
            : activeTab === 'radar'
              ? t('topicDiscovery.refreshRadar')
              : t('topicDiscovery.refreshSeeds')
        }}
      </button>
    </div>

    <!-- Tabs -->
    <div class="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
      <button
        type="button"
        class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
        :class="
          activeTab === 'seeds'
            ? 'bg-white dark:bg-gray-700 text-teal-600 dark:text-teal-300 shadow-sm ring-1 ring-teal-200 dark:ring-teal-600/50'
            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-gray-700/50'
        "
        @click="onSwitchTab('seeds')"
      >
        <Sparkles class="w-4 h-4" />
        {{ t('topicDiscovery.tabs.seeds') }}
      </button>
      <button
        type="button"
        class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
        :class="
          activeTab === 'radar'
            ? 'bg-white dark:bg-gray-700 text-teal-600 dark:text-teal-300 shadow-sm ring-1 ring-teal-200 dark:ring-teal-600/50'
            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-gray-700/50'
        "
        @click="onSwitchTab('radar')"
      >
        <TrendingUp class="w-4 h-4" />
        {{ t('topicDiscovery.tabs.radar') }}
      </button>
      <button
        type="button"
        class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
        :class="
          activeTab === 'prompt'
            ? 'bg-white dark:bg-gray-700 text-teal-600 dark:text-teal-300 shadow-sm ring-1 ring-teal-200 dark:ring-teal-600/50'
            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-gray-700/50'
        "
        @click="onSwitchTab('prompt')"
      >
        <PenLine class="w-4 h-4" />
        {{ t('topicDiscovery.tabs.prompt') }}
      </button>
    </div>

    <!-- Locks + word count -->
    <div class="flex flex-wrap items-center gap-2">
      <div class="flex items-center gap-1">
        <button
          v-for="opt in audienceOptions"
          :key="opt.id"
          type="button"
          class="px-2.5 py-1.5 rounded-md text-sm border transition-colors"
          :class="
            lockedAudience === opt.id
              ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300'
              : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-teal-300'
          "
          @click="toggleAudienceLock(opt.id)"
        >
          {{ opt.label }}
        </button>
      </div>
      <button
        v-if="lockedGenre || lockedAudience"
        type="button"
        class="inline-flex items-center gap-1 px-2.5 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        @click="clearLocks"
      >
        <Eraser class="w-3.5 h-3.5" />
        {{ t('topicDiscovery.clearLocks') }}
      </button>
      <div
        v-if="lockedGenre"
        class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
      >
        <Lock class="w-3.5 h-3.5" />
        {{ lockedGenre }}
      </div>
      <div class="ml-auto min-w-[160px]">
        <WordCountSelector v-model="selectedWordCountRange" :disabled="isProcessing" />
      </div>
    </div>

    <p v-if="warning" class="text-sm text-amber-600 dark:text-amber-400">
      {{ warning }}
      <span v-if="source === 'fallback'" class="opacity-70">
        · {{ t('topicDiscovery.fallbackHint') }}</span
      >
    </p>

    <!-- Seeds tab -->
    <div v-if="activeTab === 'seeds'" class="space-y-3">
      <div v-if="isRefreshing && seeds.length === 0" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <div
          v-for="n in 3"
          :key="n"
          class="h-24 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"
        />
      </div>
      <div
        v-else-if="!isRefreshing && seeds.length === 0"
        class="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 px-4 py-8 text-center"
      >
        <p class="text-base text-gray-600 dark:text-gray-300 mb-1">
          {{ t('topicDiscovery.emptySeedsTitle') }}
        </p>
        <p class="text-sm text-gray-400 mb-4">{{ t('topicDiscovery.emptySeedsDesc') }}</p>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-base font-medium text-white bg-teal-500 hover:bg-teal-600 disabled:opacity-50"
          :disabled="isRefreshing || isProcessing"
          @click="handleRefresh"
        >
          <RefreshCw class="w-4 h-4" />
          {{ t('topicDiscovery.refreshSeeds') }}
        </button>
      </div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <button
          v-for="seed in seeds"
          :key="seed.id"
          type="button"
          class="w-full text-left p-4 rounded-xl border-2 transition-all h-full"
          :class="
            currentSession.selectedSeedId === seed.id
              ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-teal-300 bg-white dark:bg-gray-800/50'
          "
          :disabled="isProcessing"
          @click="adoptSeed(seed)"
        >
          <div class="flex items-start justify-between gap-2 mb-1.5">
            <h4 class="font-semibold text-base text-gray-900 dark:text-white">{{ seed.title }}</h4>
            <span
              class="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 flex-shrink-0"
            >
              {{ seed.genre }}
            </span>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-2.5">
            {{ seed.oneLiner }}
          </p>
          <div class="flex flex-wrap gap-1.5 text-xs text-gray-500">
            <span
              class="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300"
            >
              钩子：{{ seed.hook }}
            </span>
            <span
              class="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300"
            >
              爽点：{{ seed.coolPoint }}
            </span>
          </div>
        </button>
      </div>
      <p class="text-sm text-center text-gray-400">{{ t('topicDiscovery.seedHint') }}</p>
    </div>

    <!-- Radar tab -->
    <div v-else-if="activeTab === 'radar'" class="space-y-3">
      <div
        v-if="isRefreshing && insights.length === 0"
        class="grid grid-cols-1 md:grid-cols-2 gap-3"
      >
        <div
          v-for="n in 4"
          :key="n"
          class="h-20 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"
        />
      </div>
      <div
        v-else-if="!isRefreshing && insights.length === 0"
        class="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 px-4 py-8 text-center"
      >
        <p class="text-base text-gray-600 dark:text-gray-300 mb-1">
          {{ t('topicDiscovery.emptyRadarTitle') }}
        </p>
        <p class="text-sm text-gray-400 mb-4">{{ t('topicDiscovery.emptyRadarDesc') }}</p>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-base font-medium text-white bg-teal-500 hover:bg-teal-600 disabled:opacity-50"
          :disabled="isRefreshing || isProcessing"
          @click="handleRefresh"
        >
          <RefreshCw class="w-4 h-4" />
          {{ t('topicDiscovery.refreshRadar') }}
        </button>
      </div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button
          v-for="insight in insights"
          :key="insight.id"
          type="button"
          class="w-full text-left p-4 rounded-xl border-2 transition-all h-full"
          :class="
            selectedInsightId === insight.id
              ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-amber-300 bg-white dark:bg-gray-800/50'
          "
          :disabled="isRefreshing || isProcessing"
          @click="handleAdoptInsight(insight)"
        >
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <h4 class="font-semibold text-base text-gray-900 dark:text-white">{{ insight.name }}</h4>
            <div class="flex items-center gap-1 flex-shrink-0">
              <span
                class="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500"
              >
                {{ lifecycleLabel[insight.lifecycle] || insight.lifecycle }}
              </span>
              <span
                class="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500"
              >
                {{ riskLabel[insight.riskLevel] || insight.riskLevel }}
              </span>
            </div>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-300 mb-1.5">{{ insight.reason }}</p>
          <p class="text-sm text-teal-700 dark:text-teal-300">{{ insight.opportunity }}</p>
          <div class="flex flex-wrap gap-1.5 mt-2.5">
            <span
              v-for="tag in insight.hotTags"
              :key="tag"
              class="px-1.5 py-0.5 text-xs rounded bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
            >
              #{{ tag }}
            </span>
          </div>
        </button>
      </div>
      <p class="text-sm text-center text-gray-400">{{ t('topicDiscovery.radarHint') }}</p>
    </div>

    <!-- Prompt tab -->
    <div v-else class="space-y-3">
      <textarea
        v-model="freePrompt"
        rows="5"
        class="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-3 text-base text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
        :placeholder="t('topicDiscovery.promptPlaceholder')"
        :disabled="isProcessing"
      />
      <button
        type="button"
        class="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-base font-medium text-white bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="!canSubmitPrompt"
        @click="generateFromPrompt(freePrompt.trim())"
      >
        <Wand2 class="w-5 h-5" />
        {{ t('topicDiscovery.generateDirections') }}
      </button>
    </div>

    <!-- Direction pipeline -->
    <DirectionResultPanel
      :show="showDirectionPanel"
      :title="t('topicDiscovery.directionTitle')"
      :description="t('topicDiscovery.directionDesc')"
      :cards="directionCards"
      :selected-direction="currentSession.selectedDirection"
      :is-processing="isPipelineActiveOnCurrentTab"
      :progress="isPipelineActiveOnCurrentTab ? (generationProgress || '') : ''"
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
    />
  </div>
</template>

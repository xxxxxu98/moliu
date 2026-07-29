<script setup lang="ts">
/**
 * 开题中心：灵感种子 / 题材雷达 / 元素混搭 / 命运骰子 / 反套路 / 一句话开题
 * AI「换一批」驱动找灵感；每个玩法独立保存方向卡会话
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
  Dices,
  Shuffle,
  Puzzle,
} from 'lucide-vue-next';
import { useTopicDiscovery } from '@/composables/useTopicDiscovery';
import type { TopicDiscoveryTab } from '@/types/topic-discovery';
import { useOutlineGenerator } from '@/composables/useOutlineGenerator';
import { useProjectCreator } from '@/composables/useProjectCreator';
import { DEFAULT_WORD_COUNT_RANGE } from '@/services/ai/unified.service';
import { buildWordCountBreakdown } from '@/services/outline/utils';
import { mapExecutableOutlineToGeneratedOutline } from '@/services/outline/adapters/executable-outline-adapter';
import { genreTags, settingElements } from '@/data/inspirations';
import type { OutlineDirection } from '@/services/outline/types/direction';
import type { ExecutableOutline } from '@/services/outline/types/executable-outline';
import type { GeneratedOutline } from '@/types/inspiration';
import type {
  GenreInsightCard,
  StorySeedCard,
  TopicAudience,
  TopicDiceRoll,
} from '@/types/topic-discovery';
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

interface PlayModeOption {
  id: TopicDiscoveryTab;
  icon: typeof Sparkles;
  accent: string;
}

const MAX_MIX_PICKS = 4;

const DICE_GENRES = [
  '修仙',
  '都市',
  '末世',
  '玄幻',
  '言情',
  '科幻',
  '历史',
  '悬疑',
  '游戏',
  '诸天',
  '职场',
  '灵异',
] as const;

const DICE_HOOKS = [
  '开篇打脸',
  '倒计时危机',
  '身份反转',
  '意外金手指',
  '被迫结盟',
  '死亡威胁',
  '真相碎片',
  '权力对赌',
  '公开处刑',
  '时间锁死',
] as const;

const DICE_TWISTS = [
  '反派视角',
  '系统坏掉了',
  '爽点延迟兑现',
  '主角不是天选',
  '敌人其实是盟友',
  '能力有致命代价',
  '读者以为的结局全错',
  '双线叙事',
  '金手指会背叛',
  '开局就失去最强牌',
] as const;

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

function pickRandom<T>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)] as T;
}

const { t } = useI18n();
const message = useMessage();

const {
  activeTab,
  isRefreshing,
  isRefreshingCurrent,
  warning,
  source,
  seeds,
  insights,
  lockedGenre,
  lockedAudience,
  selectedInsightId,
  refresh,
  refreshFromMix,
  refreshFromDice,
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

const selectedMixTags = ref<string[]>([]);
const selectedMixElements = ref<string[]>([]);

const diceRoll = ref<TopicDiceRoll | null>(null);
const isDiceRolling = ref(false);

/** 每个玩法独立的方向卡会话 */
const directionSessions = reactive<Record<TopicDiscoveryTab, DirectionSession>>({
  seeds: createEmptySession(),
  radar: createEmptySession(),
  mix: createEmptySession(),
  dice: createEmptySession(),
  twist: createEmptySession(),
  prompt: createEmptySession(),
});

/** 当前正在跑方向生成/展开的玩法 */
const pipelineTab = ref<TopicDiscoveryTab | null>(null);

const playModes: PlayModeOption[] = [
  { id: 'seeds', icon: Sparkles, accent: 'teal' },
  { id: 'radar', icon: TrendingUp, accent: 'amber' },
  { id: 'mix', icon: Puzzle, accent: 'indigo' },
  { id: 'dice', icon: Dices, accent: 'rose' },
  { id: 'twist', icon: Shuffle, accent: 'violet' },
  { id: 'prompt', icon: PenLine, accent: 'cyan' },
];

const audienceOptions: { id: TopicAudience; label: string }[] = [
  { id: 'general', label: '大众' },
  { id: 'male', label: '男生' },
  { id: 'female', label: '女生' },
];

/** 混搭面板只展示一部分热门标签，避免刷屏 */
const mixGenreOptions = computed(() => genreTags.slice(0, 24));
const mixElementOptions = computed(() => settingElements.slice(0, 28));

const currentSession = computed(() => directionSessions[activeTab.value]);

const isProcessing = computed((): boolean => {
  return Boolean(isGenerating.value) || Boolean(isCreating.value);
});

const isPipelineActiveOnCurrentTab = computed((): boolean => {
  return pipelineTab.value === activeTab.value && isProcessing.value;
});

const pipelineError = computed((): string | null => {
  if (pipelineTab.value !== activeTab.value) return null;
  return generationError.value || projectCreateError.value || null;
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

const canDiceGenerate = computed(
  () => !!diceRoll.value && !isRefreshing.value && !isProcessing.value && !isDiceRolling.value,
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

onMounted(() => {
  loadPersistedSeeds();
  loadPersistedInsights();
});

function modeAccentClass(mode: PlayModeOption, active: boolean): string {
  if (!active) {
    return 'border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 hover:border-teal-300 hover:bg-teal-50/40 dark:hover:bg-teal-900/10';
  }
  const map: Record<string, string> = {
    teal: 'border-teal-500 bg-teal-50 dark:bg-teal-900/25 text-teal-700 dark:text-teal-300 ring-1 ring-teal-200 dark:ring-teal-700/50',
    amber:
      'border-amber-500 bg-amber-50 dark:bg-amber-900/25 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-700/50',
    indigo:
      'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/25 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-700/50',
    rose: 'border-rose-500 bg-rose-50 dark:bg-rose-900/25 text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-700/50',
    violet:
      'border-violet-500 bg-violet-50 dark:bg-violet-900/25 text-violet-700 dark:text-violet-300 ring-1 ring-violet-200 dark:ring-violet-700/50',
    cyan: 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/25 text-cyan-700 dark:text-cyan-300 ring-1 ring-cyan-200 dark:ring-cyan-700/50',
  };
  return map[mode.accent] ?? map.teal;
}

async function handleRefresh(): Promise<void> {
  if (isRefreshing.value || isProcessing.value || isDiceRolling.value) return;

  if (activeTab.value === 'prompt') {
    if (!canSubmitPrompt.value) {
      message.warning(t('topicDiscovery.promptTooShort'));
      return;
    }
    await generateFromPrompt(freePrompt.value.trim(), 'prompt');
    return;
  }

  if (activeTab.value === 'mix') {
    if (!canMixGenerate.value) {
      message.warning(t('topicDiscovery.mixNeedMore'));
      return;
    }
    await refreshFromMix({
      tags: selectedMixTags.value,
      elements: selectedMixElements.value,
    });
    return;
  }

  if (activeTab.value === 'dice') {
    if (!canDiceGenerate.value) {
      message.warning(t('topicDiscovery.diceNeedRoll'));
      return;
    }
    if (diceRoll.value) {
      await refreshFromDice(diceRoll.value);
    }
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
  const tab = activeTab.value;
  if (tab === 'radar' || tab === 'prompt') return;
  directionSessions[tab].selectedSeedId = seed.id;
  const prompt = buildPromptFromSeed(seed);
  await generateFromPrompt(prompt, tab);
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

function toggleMixTag(name: string): void {
  const list = selectedMixTags.value;
  if (list.includes(name)) {
    selectedMixTags.value = list.filter(item => item !== name);
    return;
  }
  if (list.length >= MAX_MIX_PICKS) {
    message.warning(`题材最多选 ${MAX_MIX_PICKS} 个`);
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
  if (list.length >= MAX_MIX_PICKS) {
    message.warning(`设定最多选 ${MAX_MIX_PICKS} 个`);
    return;
  }
  selectedMixElements.value = [...list, name];
}

async function rollDice(): Promise<void> {
  if (isDiceRolling.value || isRefreshing.value || isProcessing.value) return;
  isDiceRolling.value = true;

  const frames = 8;
  for (let i = 0; i < frames; i += 1) {
    diceRoll.value = {
      genre: pickRandom(DICE_GENRES),
      hook: pickRandom(DICE_HOOKS),
      twist: pickRandom(DICE_TWISTS),
    };
    await new Promise<void>(resolve => {
      window.setTimeout(resolve, 45 + i * 18);
    });
  }

  diceRoll.value = {
    genre: pickRandom(DICE_GENRES),
    hook: pickRandom(DICE_HOOKS),
    twist: pickRandom(DICE_TWISTS),
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
      <button
        type="button"
        class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-base font-medium transition-colors flex-shrink-0"
        :class="
          isRefreshing || isProcessing || isDiceRolling
            ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
            : 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50'
        "
        :disabled="isRefreshing || isProcessing || isDiceRolling"
        @click="handleRefresh"
      >
        <RefreshCw
          class="w-4 h-4"
          :class="{ 'animate-spin': isRefreshing || isProcessing }"
        />
        {{ refreshButtonLabel }}
      </button>
    </div>

    <!-- Play modes：多样玩法 -->
    <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5 w-full">
      <button
        v-for="mode in playModes"
        :key="mode.id"
        type="button"
        class="flex flex-col items-start gap-1.5 p-3 rounded-xl border-2 text-left transition-all"
        :class="modeAccentClass(mode, activeTab === mode.id)"
        @click="onSwitchTab(mode.id)"
      >
        <span class="inline-flex items-center gap-1.5 text-sm font-semibold">
          <component :is="mode.icon" class="w-4 h-4" />
          {{ t(`topicDiscovery.tabs.${mode.id}`) }}
        </span>
        <span class="text-xs opacity-75 leading-snug">
          {{ t(`topicDiscovery.tabHints.${mode.id}`) }}
        </span>
      </button>
    </div>

    <!-- Locks + word count -->
    <div class="flex flex-wrap items-center gap-2 w-full">
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

    <!-- Mix controls -->
    <div
      v-if="activeTab === 'mix'"
      class="w-full rounded-xl border border-indigo-200/70 dark:border-indigo-800/50 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 space-y-4"
    >
      <div>
        <h4 class="text-base font-semibold text-gray-900 dark:text-white">
          {{ t('topicDiscovery.mixTitle') }}
        </h4>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {{ t('topicDiscovery.mixDesc') }}
        </p>
      </div>
      <div>
        <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {{ t('topicDiscovery.mixGenres') }}
          <span class="text-xs text-gray-400">({{ selectedMixTags.length }}/{{ MAX_MIX_PICKS }})</span>
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="tag in mixGenreOptions"
            :key="tag.id"
            type="button"
            class="px-2.5 py-1 rounded-lg text-sm border transition-colors"
            :class="
              selectedMixTags.includes(tag.name)
                ? 'border-indigo-500 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-indigo-300'
            "
            @click="toggleMixTag(tag.name)"
          >
            {{ tag.name }}
          </button>
        </div>
      </div>
      <div>
        <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {{ t('topicDiscovery.mixElements') }}
          <span class="text-xs text-gray-400"
            >({{ selectedMixElements.length }}/{{ MAX_MIX_PICKS }})</span
          >
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="el in mixElementOptions"
            :key="el.id"
            type="button"
            class="px-2.5 py-1 rounded-lg text-sm border transition-colors"
            :class="
              selectedMixElements.includes(el.name)
                ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-emerald-300'
            "
            @click="toggleMixElement(el.name)"
          >
            {{ el.name }}
          </button>
        </div>
      </div>
      <p class="text-sm text-center text-gray-400">{{ t('topicDiscovery.mixHint') }}</p>
    </div>

    <!-- Dice controls -->
    <div
      v-if="activeTab === 'dice'"
      class="w-full rounded-xl border border-rose-200/70 dark:border-rose-800/50 bg-rose-50/40 dark:bg-rose-950/20 p-4 space-y-4"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <h4 class="text-base font-semibold text-gray-900 dark:text-white">
            {{ t('topicDiscovery.diceTitle') }}
          </h4>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {{ t('topicDiscovery.diceDesc') }}
          </p>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 disabled:opacity-50"
          :disabled="isDiceRolling || isRefreshing || isProcessing"
          @click="rollDice"
        >
          <Dices class="w-4 h-4" :class="{ 'animate-spin': isDiceRolling }" />
          {{ isDiceRolling ? t('topicDiscovery.diceRolling') : t('topicDiscovery.diceRoll') }}
        </button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
        <div
          class="rounded-xl border border-white/70 dark:border-gray-700 bg-white/80 dark:bg-gray-800/70 p-4 text-center"
        >
          <p class="text-xs text-gray-400 mb-2">{{ t('topicDiscovery.diceGenre') }}</p>
          <p class="text-lg font-semibold text-rose-600 dark:text-rose-300 min-h-[1.75rem]">
            {{ diceRoll?.genre || '—' }}
          </p>
        </div>
        <div
          class="rounded-xl border border-white/70 dark:border-gray-700 bg-white/80 dark:bg-gray-800/70 p-4 text-center"
        >
          <p class="text-xs text-gray-400 mb-2">{{ t('topicDiscovery.diceHook') }}</p>
          <p class="text-lg font-semibold text-orange-600 dark:text-orange-300 min-h-[1.75rem]">
            {{ diceRoll?.hook || '—' }}
          </p>
        </div>
        <div
          class="rounded-xl border border-white/70 dark:border-gray-700 bg-white/80 dark:bg-gray-800/70 p-4 text-center"
        >
          <p class="text-xs text-gray-400 mb-2">{{ t('topicDiscovery.diceTwist') }}</p>
          <p class="text-lg font-semibold text-fuchsia-600 dark:text-fuchsia-300 min-h-[1.75rem]">
            {{ diceRoll?.twist || '—' }}
          </p>
        </div>
      </div>
      <p class="text-sm text-center text-gray-400">{{ t('topicDiscovery.diceHint') }}</p>
    </div>

    <!-- Seeds / twist / mix / dice results（仅当前玩法自己的种子） -->
    <div v-if="showsSeedGrid" class="space-y-3 w-full">
      <div
        v-if="isRefreshingCurrent && seeds.length === 0"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full"
      >
        <div
          v-for="n in 4"
          :key="n"
          class="h-28 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"
        />
      </div>
      <div
        v-else-if="!isRefreshingCurrent && seeds.length === 0 && (activeTab === 'seeds' || activeTab === 'twist')"
        class="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 px-4 py-8 text-center w-full"
      >
        <p class="text-base text-gray-600 dark:text-gray-300 mb-1">
          {{
            activeTab === 'twist'
              ? t('topicDiscovery.emptyTwistTitle')
              : t('topicDiscovery.emptySeedsTitle')
          }}
        </p>
        <p class="text-sm text-gray-400 mb-4">
          {{
            activeTab === 'twist'
              ? t('topicDiscovery.emptyTwistDesc')
              : t('topicDiscovery.emptySeedsDesc')
          }}
        </p>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-base font-medium text-white bg-teal-500 hover:bg-teal-600 disabled:opacity-50"
          :disabled="isRefreshing || isProcessing"
          @click="handleRefresh"
        >
          <RefreshCw class="w-4 h-4" />
          {{ refreshButtonLabel }}
        </button>
      </div>
      <div
        v-else-if="seeds.length > 0"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full"
      >
        <button
          v-for="seed in seeds"
          :key="`${activeTab}-${seed.id}`"
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
      <p v-if="seeds.length > 0" class="text-sm text-center text-gray-400">
        {{ t('topicDiscovery.seedHint') }}
      </p>
    </div>

    <!-- Radar tab -->
    <div v-else-if="activeTab === 'radar'" class="space-y-3 w-full">
      <div
        v-if="isRefreshingCurrent && insights.length === 0"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full"
      >
        <div
          v-for="n in 4"
          :key="n"
          class="h-24 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"
        />
      </div>
      <div
        v-else-if="!isRefreshingCurrent && insights.length === 0"
        class="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 px-4 py-8 text-center w-full"
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
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
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
    <div v-else class="space-y-3 w-full">
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
    />
  </div>
</template>

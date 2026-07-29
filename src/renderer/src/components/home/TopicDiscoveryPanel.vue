<script setup lang="ts">
/**
 * 开题中心：灵感种子 / 题材雷达 / 元素混搭 / 命运骰子 / 反套路 / 一句话开题
 * AI「换一批」驱动找灵感；每个玩法独立保存方向卡会话
 */
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
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
  Bookmark,
  BookmarkCheck,
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
  TopicLength,
  TopicPlatform,
} from '@/types/topic-discovery';
import {
  ENTRY_DIFFICULTY_LABEL,
  LENGTH_LABEL,
  PLATFORM_LABEL,
} from '@/services/inspiration/prompts/topic-discovery-prompts';
import { buildTopicDiscoveryProjectSeed } from '@/services/inspiration/topic-discovery.service';
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
  /** 开书时写入 metadata 的种子快照 */
  selectedSeedSnapshot: StorySeedCard | null;
  /** 种子来源玩法 */
  seedSourceTab: TopicDiscoveryTab | null;
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
    selectedSeedSnapshot: null,
    seedSourceTab: null,
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
  favorites,
  favoriteCount,
  maxFavorites,
  lockedGenre,
  lockedAudience,
  lockedPlatform,
  lockedLength,
  selectedInsightId,
  activeInsightContext,
  refresh,
  refreshFromMix,
  refreshFromDice,
  loadPersistedSeeds,
  loadPersistedInsights,
  loadPersistedFavorites,
  adoptInsightAndRefreshSeeds,
  setLockedAudience,
  setLockedPlatform,
  setLockedLength,
  clearLocks,
  isFavorite,
  toggleFavorite,
  clearFavorites,
  switchTab,
  buildPromptFromSeed,
  cancelRefresh,
} = useTopicDiscovery();

const {
  isGenerating,
  error: generationError,
  progress: generationProgress,
  generateDirections,
  expandDirection,
  cancel: cancelGeneration,
  wasCancelled,
} = useOutlineGenerator();

const {
  isCreating,
  error: projectCreateError,
  createProject: doCreateProject,
  reset: resetProjectState,
} = useProjectCreator();

const selectedWordCountRange = ref(DEFAULT_WORD_COUNT_RANGE);
const freePrompt = ref('');
const showFavorites = ref(false);

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

/** 筛选条用短标签，完整名称见 PLATFORM_LABEL */
const platformOptions: { id: TopicPlatform; label: string }[] = [
  { id: 'general', label: '不限平台' },
  { id: 'qidian', label: '起点' },
  { id: 'fanqie', label: '番茄' },
  { id: 'jinjiang', label: '晋江' },
  { id: 'qimao', label: '七猫' },
  { id: 'zhihu', label: '盐言' },
];

const lengthOptions: { id: TopicLength; label: string }[] = [
  { id: 'long', label: LENGTH_LABEL.long },
  { id: 'short', label: LENGTH_LABEL.short },
];

const hasActiveFilters = computed(
  () =>
    !!lockedGenre.value ||
    !!lockedAudience.value ||
    !!lockedPlatform.value ||
    !!lockedLength.value ||
    !!activeInsightContext.value,
);

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

const shortPlatformLabel: Record<string, string> = {
  general: '不限',
  qidian: '起点',
  fanqie: '番茄',
  jinjiang: '晋江',
  qimao: '七猫',
  zhihu: '盐言',
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
  loadPersistedFavorites();
  window.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
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
  cancelGeneration();
  const session = directionSessions[pipelineTab.value ?? activeTab.value];
  session.enhanceTargetDirectionId = null;
  message.info(t('topicDiscovery.generationCancelled'));
}

function handleCancelRefresh(): void {
  if (!isRefreshing.value) return;
  cancelRefresh();
  message.info(t('topicDiscovery.refreshCancelled'));
}

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
    await handleFreePromptGenerate();
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
    // 未掷过时自动先掷一次，避免用户点上方「用骰子开题」被拦
    if (!diceRoll.value) {
      await rollDice();
    }
    if (!diceRoll.value || isRefreshing.value || isProcessing.value) return;
    await refreshFromDice(diceRoll.value);
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
  // 成功前保留旧方向卡，取消/失败时不把列表清空
  session.enhanceTargetDirectionId = null;
  resetProjectState();

  const directions = await generateDirections(prompt, {
    wordCountRange: selectedWordCountRange.value,
  });

  if (wasCancelled.value) {
    return;
  }
  // 被更新的请求取代：静默退出，由新请求写结果
  if (directions.length === 0 && isGenerating.value) {
    return;
  }

  if (directions.length === 0) {
    message.error(generationError.value || t('topicDiscovery.directionFailed'));
    return;
  }

  session.directions = directions;
  session.selectedDirection = directions[0] ?? null;
  session.expandedOutline = null;
  session.selectedOutline = null;
}

async function adoptSeed(seed: StorySeedCard, fromTab?: TopicDiscoveryTab): Promise<void> {
  if (isProcessing.value) return;
  // 从收藏开题时落到当前玩法会话；若在雷达/一句话则落到灵感种子
  const tab: TopicDiscoveryTab =
    activeTab.value === 'radar' || activeTab.value === 'prompt' ? 'seeds' : activeTab.value;
  if (showFavorites.value && (activeTab.value === 'radar' || activeTab.value === 'prompt')) {
    switchTab('seeds');
  }
  const session = directionSessions[tab];
  session.selectedSeedId = seed.id;
  session.selectedSeedSnapshot = { ...seed };
  session.seedSourceTab = fromTab ?? activeTab.value;
  const prompt = buildPromptFromSeed(seed);
  await generateFromPrompt(prompt, tab);
}

function handleToggleFavorite(seed: StorySeedCard, fromTab?: TopicDiscoveryTab): void {
  const result = toggleFavorite(seed, fromTab ?? activeTab.value);
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
  clearFavorites();
  message.info(t('topicDiscovery.favoritesCleared'));
}

function toggleFavoritesPanel(): void {
  showFavorites.value = !showFavorites.value;
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

  const outline = await expandDirection(session.prompt, session.selectedDirection, {
    wordCountRange: selectedWordCountRange.value,
    enhancementBrief: options?.enhancementBrief,
  });

  session.enhanceTargetDirectionId = null;

  if (wasCancelled.value) {
    return;
  }
  if (!outline) {
    if (isGenerating.value) return;
    return;
  }

  session.expandedOutline = outline;
  session.selectedOutline = mapExecutableOutlineToGeneratedOutline(outline, {
    targetWordCountRange: selectedWordCountRange.value,
  });
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
  directionSessions.prompt.selectedSeedId = null;
  directionSessions.prompt.selectedSeedSnapshot = null;
  directionSessions.prompt.seedSourceTab = null;
  await generateFromPrompt(freePrompt.value.trim(), 'prompt');
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

  const topicDiscoverySeed = session.selectedSeedSnapshot
    ? buildTopicDiscoveryProjectSeed(
        session.selectedSeedSnapshot,
        session.seedSourceTab ?? activeTab.value,
      )
    : undefined;

  await doCreateProject(outlineToCreate, { topicDiscoverySeed });
}

function toggleAudienceLock(audience: TopicAudience): void {
  if (lockedAudience.value === audience) {
    setLockedAudience(null);
  } else {
    setLockedAudience(audience);
  }
}

function togglePlatformLock(platform: TopicPlatform): void {
  if (lockedPlatform.value === platform) {
    setLockedPlatform(null);
  } else {
    setLockedPlatform(platform);
  }
}

function toggleLengthLock(length: TopicLength): void {
  if (lockedLength.value === length) {
    setLockedLength(null);
  } else {
    setLockedLength(length);
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
    <div
      v-if="showFavorites"
      class="w-full rounded-xl border border-amber-200/80 dark:border-amber-800/50 bg-amber-50/40 dark:bg-amber-950/20 p-4 space-y-3"
    >
      <div class="flex items-center justify-between gap-2">
        <div>
          <h4 class="text-base font-semibold text-gray-900 dark:text-white">
            {{ t('topicDiscovery.favoritesTitle') }}
          </h4>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {{ t('topicDiscovery.favoritesDesc', { max: maxFavorites }) }}
          </p>
        </div>
        <button
          v-if="favoriteCount > 0"
          type="button"
          class="text-sm text-gray-500 hover:text-rose-600 dark:hover:text-rose-400"
          @click="handleClearFavorites"
        >
          {{ t('topicDiscovery.clearFavorites') }}
        </button>
      </div>

      <div
        v-if="favoriteCount === 0"
        class="rounded-lg border border-dashed border-amber-200 dark:border-amber-800 px-4 py-6 text-center text-sm text-gray-500"
      >
        {{ t('topicDiscovery.emptyFavorites') }}
      </div>
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
        <div
          v-for="item in favorites"
          :key="`fav-${item.seed.id}-${item.savedAt}`"
          class="relative w-full text-left p-4 rounded-xl border-2 border-amber-200 dark:border-amber-800/60 bg-white dark:bg-gray-800/50 hover:border-amber-400 transition-all cursor-pointer"
          @click="adoptSeed(item.seed, item.fromTab)"
        >
          <button
            type="button"
            class="absolute top-2.5 right-2.5 p-1.5 rounded-md text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/40"
            :title="t('topicDiscovery.unfavorite')"
            @click.stop="handleToggleFavorite(item.seed, item.fromTab)"
          >
            <BookmarkCheck class="w-4 h-4" />
          </button>
          <div class="pr-8 mb-1.5">
            <h4 class="font-semibold text-base text-gray-900 dark:text-white">
              {{ item.seed.title }}
            </h4>
            <p class="text-xs text-gray-400 mt-0.5">
              {{ t(`topicDiscovery.tabs.${item.fromTab}`) }} · {{ item.seed.genre }}
            </p>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-3">
            {{ item.seed.oneLiner }}
          </p>
        </div>
      </div>
      <p class="text-sm text-center text-gray-400">{{ t('topicDiscovery.favoritesHint') }}</p>
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
      <div class="w-px h-5 bg-gray-200 dark:bg-gray-700 hidden sm:block" />
      <div class="flex items-center gap-1 flex-wrap">
        <button
          v-for="opt in platformOptions"
          :key="opt.id"
          type="button"
          class="px-2.5 py-1.5 rounded-md text-sm border transition-colors"
          :class="
            lockedPlatform === opt.id
              ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
              : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-cyan-300'
          "
          @click="togglePlatformLock(opt.id)"
        >
          {{ opt.label }}
        </button>
      </div>
      <div class="w-px h-5 bg-gray-200 dark:bg-gray-700 hidden sm:block" />
      <div class="flex items-center gap-1">
        <button
          v-for="opt in lengthOptions"
          :key="opt.id"
          type="button"
          class="px-2.5 py-1.5 rounded-md text-sm border transition-colors"
          :class="
            lockedLength === opt.id
              ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
              : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-violet-300'
          "
          @click="toggleLengthLock(opt.id)"
        >
          {{ opt.label }}
        </button>
      </div>
      <button
        v-if="hasActiveFilters"
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
      <div
        v-if="activeInsightContext"
        class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm bg-amber-50/80 dark:bg-amber-900/10 text-amber-600 dark:text-amber-400 max-w-[280px] truncate"
        :title="activeInsightContext.opportunity"
      >
        {{ t('topicDiscovery.insightContextHint') }}
        · {{ activeInsightContext.hotTags.slice(0, 2).join(' / ') || activeInsightContext.name }}
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
      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div class="min-w-0 flex-1">
          <h4 class="text-base font-semibold text-gray-900 dark:text-white">
            {{ t('topicDiscovery.diceTitle') }}
          </h4>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {{ t('topicDiscovery.diceDesc') }}
          </p>
        </div>
        <button
          type="button"
          class="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold shrink-0 border border-rose-600/30 shadow-sm bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div
          v-for="seed in seeds"
          :key="`${activeTab}-${seed.id}`"
          class="relative w-full text-left p-4 rounded-xl border-2 transition-all h-full cursor-pointer"
          :class="
            currentSession.selectedSeedId === seed.id
              ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-teal-300 bg-white dark:bg-gray-800/50'
          "
          :aria-disabled="isProcessing"
          @click="!isProcessing && adoptSeed(seed)"
        >
          <button
            type="button"
            class="absolute top-2.5 right-2.5 p-1.5 rounded-md transition-colors z-10"
            :class="
              isFavorite(seed)
                ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/40 hover:bg-amber-100'
                : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30'
            "
            :title="
              isFavorite(seed) ? t('topicDiscovery.unfavorite') : t('topicDiscovery.favorite')
            "
            @click.stop="handleToggleFavorite(seed)"
          >
            <BookmarkCheck v-if="isFavorite(seed)" class="w-4 h-4" />
            <Bookmark v-else class="w-4 h-4" />
          </button>
          <div class="flex items-start justify-between gap-2 mb-1.5 pr-8">
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
              v-if="seed.platform"
              class="px-1.5 py-0.5 rounded bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300"
            >
              {{ PLATFORM_LABEL[seed.platform] }}
            </span>
            <span
              v-if="seed.length"
              class="px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
            >
              {{ LENGTH_LABEL[seed.length] }}
            </span>
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
            <span
              v-if="seed.sellPoint"
              class="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
            >
              卖点：{{ seed.sellPoint }}
            </span>
            <span
              v-if="seed.mechanism"
              class="px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300"
            >
              机制：{{ seed.mechanism }}
            </span>
            <span
              v-if="seed.brokenTrope"
              class="px-1.5 py-0.5 rounded bg-fuchsia-50 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300"
            >
              破梗：{{ seed.brokenTrope }}
            </span>
          </div>
        </div>
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
            <div class="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
              <span
                class="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500"
              >
                {{ lifecycleLabel[insight.lifecycle] || insight.lifecycle }}
              </span>
              <span
                v-if="insight.entryDifficulty"
                class="text-xs px-1.5 py-0.5 rounded"
                :class="
                  insight.entryDifficulty === 'low'
                    ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                    : insight.entryDifficulty === 'high'
                      ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
                      : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                "
              >
                {{ ENTRY_DIFFICULTY_LABEL[insight.entryDifficulty] }}
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
          <p
            v-if="insight.namePatterns?.length"
            class="text-xs text-gray-500 dark:text-gray-400 mt-1.5"
          >
            {{ t('topicDiscovery.namePatternLabel') }}：{{ insight.namePatterns.join(' · ') }}
          </p>
          <div class="flex flex-wrap gap-1.5 mt-2.5">
            <span
              v-for="p in insight.platformBias?.length ? insight.platformBias : insight.platform ? [insight.platform] : []"
              :key="`${insight.id}-${p}`"
              class="px-1.5 py-0.5 text-xs rounded bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300"
            >
              {{ shortPlatformLabel[p] || PLATFORM_LABEL[p] || p }}
            </span>
            <span
              v-if="insight.length"
              class="px-1.5 py-0.5 text-xs rounded bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
            >
              {{ LENGTH_LABEL[insight.length] }}
            </span>
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
      <p class="text-sm text-center text-gray-400">
        {{ t('topicDiscovery.radarHint') }}
        · {{ t('topicDiscovery.radarDisclaimer') }}
      </p>
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
        @click="handleFreePromptGenerate"
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
      @cancel="handleCancelGeneration"
    />
  </div>
</template>

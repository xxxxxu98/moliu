<script setup lang="ts">
/**
 * 情绪与题材选择步骤
 * Moliu v2.0 - 三步创作法的第一步
 */
import { ref, computed, watch } from "vue";
import { Sparkles, Heart } from "lucide-vue-next";
import { GENRE_PROFILES, matchGenreProfile } from "@/data/genre-profiles";
import { HOOK_TECHNIQUES } from "@/data/hook-techniques";
import { COOLPOINT_FORMULAS } from "@/data/coolpoint-formulas";

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  modelValue?: StepData;
}

interface Emits {
  (e: "update:modelValue", value: StepData): void;
  (e: "complete"): void;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => ({
    emotionGoals: [],
    genres: [],
    customPrompt: "",
  }),
});

const emit = defineEmits<Emits>();

// ============================================================
// Types
// ============================================================

interface StepData {
  emotionGoals: string[];
  genres: string[];
  customPrompt: string;
}

// ============================================================
// Data
// ============================================================

// 情绪目标选项
interface EmotionGoal {
  id: string;
  name: string;
  icon: string;
  description: string;
  gradient: string;
  example: string;
}

const emotionGoals: EmotionGoal[] = [
  {
    id: "excitement",
    name: "热血沸腾",
    icon: "🔥",
    description: "让人心跳加速、热血沸腾",
    gradient: "from-red-500 to-orange-500",
    example: "主角在绝境中爆发出惊人潜力，一招击败强敌",
  },
  {
    id: "tears",
    name: "催人泪下",
    icon: "💧",
    description: "让人感动落泪、情感共鸣",
    gradient: "from-blue-500 to-cyan-500",
    example: "为主角的不幸遭遇而心痛，为主角的坚持而流泪",
  },
  {
    id: "thrill",
    name: "紧张刺激",
    icon: "⚡",
    description: "心跳加速、欲罢不能",
    gradient: "from-purple-500 to-pink-500",
    example: "主角陷入绝境，生死只在一线之间",
  },
  {
    id: "sweet",
    name: "甜蜜心动",
    icon: "💕",
    description: "少女心爆棚、甜到齁",
    gradient: "from-pink-400 to-rose-500",
    example: "霸道总裁的宠溺情节，各种名场面",
  },
  {
    id: "laugh",
    name: "轻松搞笑",
    icon: "😂",
    description: "捧腹大笑、欢乐不断",
    gradient: "from-amber-400 to-yellow-500",
    example: "沙雕队友的逗比日常，反差萌的角色",
  },
  {
    id: "shock",
    name: "震惊反转",
    icon: "🤯",
    description: "出人意料、惊天大反转",
    gradient: "from-gray-700 to-gray-900",
    example: "原本的反派竟是主角的父亲？",
  },
  {
    id: "comfort",
    name: "治愈温暖",
    icon: "🌸",
    description: "温暖人心、被治愈",
    gradient: "from-emerald-400 to-teal-500",
    example: "主角帮助流浪猫的温馨场景",
  },
  {
    id: "anger",
    name: "义愤填膺",
    icon: "😤",
    description: "让人气愤、想打反派",
    gradient: "from-red-600 to-rose-700",
    example: "恶毒女配陷害女主，看得人牙痒痒",
  },
];

// 题材选项
const genreOptions = computed(() => {
  // Hook 翻译映射
  const hookNameMap: Record<string, string> = {};
  HOOK_TECHNIQUES.forEach((h) => {
    hookNameMap[h.type] = h.name;
  });

  // CoolPoint 翻译映射
  const coolpointNameMap: Record<string, string> = {};
  COOLPOINT_FORMULAS.forEach((cp) => {
    coolpointNameMap[cp.type] = cp.name;
  });

  return GENRE_PROFILES.slice(0, 8).map((profile) => ({
    id: profile.id,
    name: profile.name,
    description: profile.typicalPatterns[0]?.description || "",
    hooks: profile.hooks.opening.slice(0, 2).map((h) => hookNameMap[h] || h),
    coolpoints: profile.coolpoints.primary
      .slice(0, 2)
      .map((cp) => coolpointNameMap[cp] || cp),
  }));
});

// ============================================================
// State
// ============================================================

const selectedEmotions = ref<string[]>(props.modelValue.emotionGoals);
const selectedGenres = ref<string[]>(props.modelValue.genres);
const customPrompt = ref(props.modelValue.customPrompt);

// ============================================================
// Computed
// ============================================================

const selectedEmotionDetails = computed(() => {
  return selectedEmotions.value
    .map((id) => emotionGoals.find((g) => g.id === id))
    .filter(Boolean);
});

const matchedProfile = computed(() => {
  if (selectedGenres.value.length === 0) return null;
  return matchGenreProfile(selectedGenres.value);
});

// 翻译映射
const hookNameMap = computed(() => {
  const map: Record<string, string> = {};
  HOOK_TECHNIQUES.forEach((h) => {
    map[h.type] = h.name;
  });
  return map;
});

const coolpointNameMap = computed(() => {
  const map: Record<string, string> = {};
  COOLPOINT_FORMULAS.forEach((cp) => {
    map[cp.type] = cp.name;
  });
  return map;
});

// 翻译后的 hooks 和 coolpoints
const translatedHooks = computed(() => {
  if (!matchedProfile.value) return [];
  return matchedProfile.value.hooks.opening.map((h) => hookNameMap.value[h] || h);
});

const translatedCoolpoints = computed(() => {
  if (!matchedProfile.value) return [];
  return matchedProfile.value.coolpoints.primary
    .slice(0, 3)
    .map((cp) => coolpointNameMap.value[cp] || cp);
});

const canProceed = computed(() => {
  return (
    selectedEmotions.value.length > 0 ||
    selectedGenres.value.length > 0 ||
    customPrompt.value.trim().length >= 10
  );
});

// ============================================================
// Methods
// ============================================================

function toggleEmotion(id: string) {
  const index = selectedEmotions.value.indexOf(id);
  if (index === -1) {
    selectedEmotions.value.push(id);
  } else {
    selectedEmotions.value.splice(index, 1);
  }
  emitUpdate();
}

function toggleGenre(id: string) {
  const index = selectedGenres.value.indexOf(id);
  if (index === -1) {
    selectedGenres.value.push(id);
  } else {
    selectedGenres.value.splice(index, 1);
  }
  emitUpdate();
}

function emitUpdate() {
  emit("update:modelValue", {
    emotionGoals: selectedEmotions.value,
    genres: selectedGenres.value,
    customPrompt: customPrompt.value,
  });
}

function handleNext() {
  if (!canProceed.value) return;
  emitUpdate();
  emit("complete");
}

// Watch for external changes
watch(
  () => props.modelValue,
  (newVal) => {
    selectedEmotions.value = newVal.emotionGoals;
    selectedGenres.value = newVal.genres;
    customPrompt.value = newVal.customPrompt;
  },
  { deep: true },
);
</script>

<template>
  <div class="space-y-6">
    <!-- Section 1: 情绪目标 -->
    <div>
      <div class="flex items-center gap-2 mb-3">
        <div
          class="w-7 h-7 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center"
        >
          <Heart class="w-4 h-4 text-white" />
        </div>
        <div>
          <h4 class="text-sm font-medium text-gray-900 dark:text-white">
            情绪目标
          </h4>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            选择你想给读者的情感体验
          </p>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="goal in emotionGoals"
          :key="goal.id"
          class="p-3 rounded-xl text-left transition-all duration-200 relative group"
          :class="[
            selectedEmotions.includes(goal.id)
              ? `bg-gradient-to-br ${goal.gradient} text-white shadow-lg`
              : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700',
          ]"
          @click="toggleEmotion(goal.id)"
        >
          <div class="flex items-center gap-2 mb-1">
            <span class="text-lg">{{ goal.icon }}</span>
            <span class="text-sm font-medium">{{ goal.name }}</span>
          </div>
          <p
            class="text-xs line-clamp-1"
            :class="
              selectedEmotions.includes(goal.id)
                ? 'text-white/80'
                : 'text-gray-500 dark:text-gray-400'
            "
          >
            {{ goal.description }}
          </p>

          <!-- Selected indicator -->
          <div
            v-if="selectedEmotions.includes(goal.id)"
            class="absolute top-2 right-2 w-5 h-5 rounded-full bg-white/30 flex items-center justify-center"
          >
            <svg
              class="w-3 h-3 text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fill-rule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clip-rule="evenodd"
              />
            </svg>
          </div>
        </button>
      </div>

      <!-- Selected emotion examples -->
      <div
        v-if="selectedEmotionDetails.length > 0"
        class="mt-3 p-3 rounded-xl bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/20 border border-pink-200 dark:border-pink-800"
      >
        <p class="text-xs text-pink-600 dark:text-pink-400 mb-1">参考案例：</p>
        <p class="text-xs text-pink-700 dark:text-pink-300 italic">
          "{{
            selectedEmotionDetails
              .map((g) => g?.example)
              .filter(Boolean)
              .join("；")
          }}"
        </p>
      </div>
    </div>

    <!-- Section 2: 题材选择 -->
    <div>
      <div class="flex items-center gap-2 mb-3">
        <div
          class="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center"
        >
          <Sparkles class="w-4 h-4 text-white" />
        </div>
        <div>
          <h4 class="text-sm font-medium text-gray-900 dark:text-white">
            题材类型
          </h4>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            选择故事发生的背景和类型
          </p>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="genre in genreOptions"
          :key="genre.id"
          class="p-3 rounded-xl text-left transition-all duration-200 border-2"
          :class="[
            selectedGenres.includes(genre.id)
              ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 bg-white dark:bg-gray-800',
          ]"
          @click="toggleGenre(genre.id)"
        >
          <div class="flex items-center justify-between mb-1">
            <span class="text-sm font-medium text-gray-900 dark:text-white">
              {{ genre.name }}
            </span>
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
            {{ genre.description }}
          </p>
          <div class="flex flex-wrap gap-1 mt-2">
            <span
              v-for="hook in genre.hooks"
              :key="hook"
              class="px-1.5 py-0.5 text-xs rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400"
            >
              {{ hook }}
            </span>
          </div>
        </button>
      </div>
    </div>

    <!-- Matched Profile Preview -->
    <div
      v-if="matchedProfile"
      class="p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-200 dark:border-indigo-800"
    >
      <div class="flex items-center gap-2 mb-2">
        <span class="text-sm font-medium text-indigo-700 dark:text-indigo-400">
          题材 Profile
        </span>
      </div>
      <div class="grid grid-cols-2 gap-4 text-xs">
        <div>
          <span class="text-gray-500 dark:text-gray-400">推荐钩子：</span>
          <span class="text-gray-700 dark:text-gray-300">
            {{ translatedHooks.join("、") }}
          </span>
        </div>
        <div>
          <span class="text-gray-500 dark:text-gray-400">核心爽点：</span>
          <span class="text-gray-700 dark:text-gray-300">
            {{ translatedCoolpoints.join("、") }}
          </span>
        </div>
      </div>
    </div>

    <!-- Next Button -->
    <button
      class="w-full py-3 rounded-xl font-medium transition-all"
      :class="[
        canProceed
          ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg hover:shadow-xl'
          : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed',
      ]"
      :disabled="!canProceed"
      @click="handleNext"
    >
      下一步：核心设定
    </button>
  </div>
</template>

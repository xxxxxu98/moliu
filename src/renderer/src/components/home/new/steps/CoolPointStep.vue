<script setup lang="ts">
/**
 * 爽点规划步骤
 * Moliu v2.0 - 三步创作法的第三步
 */
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Flame, ChevronRight, Sparkles, ChevronLeft } from "lucide-vue-next";
import { COOLPOINT_FORMULAS, getRecommendedCoolPoints } from "@/data/coolpoint-formulas";
import { HOOK_TECHNIQUES, getRecommendedHooksForGenre } from "@/data/hook-techniques";
import type { CoolPointType, HookType } from "@/types/evaluation";

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  modelValue?: StepData;
  genres?: string[];
  isGenerating?: boolean;
}

interface Emits {
  (e: "update:modelValue", value: StepData): void;
  (e: "complete"): void;
  (e: "back"): void;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => ({
    coolPoints: [],
    hooks: [],
    rhythmType: "single",
    antiTropes: [],
    customCoolPoints: "",
  }),
  genres: () => [],
  isGenerating: false,
});

const emit = defineEmits<Emits>();

// ============================================================
// Types
// ============================================================

interface StepData {
  coolPoints: CoolPointType[];
  hooks: HookType[];
  rhythmType: "single" | "combo" | "cascade";
  antiTropes: string[];
  customCoolPoints: string;
}

// ============================================================
// Data
// ============================================================

const coolPointOptions = COOLPOINT_FORMULAS.slice(0, 8).map((cp) => ({
  type: cp.type,
  name: cp.name,
  description: cp.description,
  intensity: cp.intensity,
}));

const hookOptions = HOOK_TECHNIQUES.slice(0, 6).map((h) => ({
  type: h.type,
  name: h.name,
  description: h.description,
}));

const rhythmOptions = [
  {
    id: "single",
    name: "单点爽",
    description: "每5章左右一个大爽点",
    icon: "💎",
  },
  {
    id: "combo",
    name: "连击爽",
    description: "连续2-3章持续爽",
    icon: "🔥",
  },
  {
    id: "cascade",
    name: "瀑布爽",
    description: "小爽点不断穿插",
    icon: "🌊",
  },
];

// ============================================================
// State
// ============================================================

const selectedCoolPoints = ref<CoolPointType[]>(props.modelValue.coolPoints);
const selectedHooks = ref<HookType[]>(props.modelValue.hooks);
const rhythmType = ref<"single" | "combo" | "cascade">(
  props.modelValue.rhythmType
);
const antiTropes = ref<string[]>(props.modelValue.antiTropes);
const customCoolPoints = ref(props.modelValue.customCoolPoints);

// ============================================================
// Computed
// ============================================================

const selectedCoolPointDetails = computed(() => {
  return selectedCoolPoints.value
    .map((type) => coolPointOptions.find((cp) => cp.type === type))
    .filter(Boolean);
});

const canProceed = computed(() => {
  return selectedCoolPoints.value.length > 0;
});

// ============================================================
// Methods
// ============================================================

function toggleCoolPoint(type: CoolPointType) {
  const index = selectedCoolPoints.value.indexOf(type);
  if (index === -1) {
    selectedCoolPoints.value.push(type);
  } else {
    selectedCoolPoints.value.splice(index, 1);
  }
  emitUpdate();
}

function toggleHook(type: HookType) {
  const index = selectedHooks.value.indexOf(type);
  if (index === -1) {
    selectedHooks.value.push(type);
  } else {
    selectedHooks.value.splice(index, 1);
  }
  emitUpdate();
}

function handleBack() {
  emitUpdate();
  emit("back");
}

function handleComplete() {
  emitUpdate();
  emit("complete");
}

function emitUpdate() {
  emit("update:modelValue", {
    coolPoints: selectedCoolPoints.value,
    hooks: selectedHooks.value,
    rhythmType: rhythmType.value,
    antiTropes: antiTropes.value,
    customCoolPoints: customCoolPoints.value,
  });
}

// Watch for external changes
watch(
  () => props.modelValue,
  (newVal) => {
    selectedCoolPoints.value = newVal.coolPoints;
    selectedHooks.value = newVal.hooks;
    rhythmType.value = newVal.rhythmType;
    antiTropes.value = newVal.antiTropes;
    customCoolPoints.value = newVal.customCoolPoints;
  },
  { deep: true }
);
</script>

<template>
  <div class="space-y-6">
    <!-- Section 1: 爽点类型 -->
    <div>
      <div class="flex items-center gap-2 mb-3">
        <Flame class="w-5 h-5 text-orange-500" />
        <div>
          <h4 class="text-sm font-medium text-gray-900 dark:text-white">
            核心爽点
          </h4>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            选择故事的核心爽点类型
          </p>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="cp in coolPointOptions"
          :key="cp.type"
          class="p-3 rounded-xl text-left transition-all duration-200 border-2 relative"
          :class="[
            selectedCoolPoints.includes(cp.type)
              ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-orange-300 dark:hover:border-orange-700 bg-white dark:bg-gray-800',
          ]"
          @click="toggleCoolPoint(cp.type)"
        >
          <!-- Intensity indicator -->
          <div
            class="absolute top-2 right-2 px-1.5 py-0.5 rounded text-xs"
            :class="[
              cp.intensity === 'high' || cp.intensity === 'very-high'
                ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
            ]"
          >
            {{ cp.intensity === 'very-high' ? '爆' : cp.intensity === 'high' ? '强' : '中' }}
          </div>

          <span class="text-sm font-medium text-gray-900 dark:text-white">
            {{ cp.name }}
          </span>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
            {{ cp.description }}
          </p>
        </button>
      </div>
    </div>

    <!-- Section 2: 节奏模式 -->
    <div>
      <div class="flex items-center gap-2 mb-3">
        <Sparkles class="w-5 h-5 text-violet-500" />
        <h4 class="text-sm font-medium text-gray-900 dark:text-white">
          爽点节奏
        </h4>
      </div>

      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="rhythm in rhythmOptions"
          :key="rhythm.id"
          class="p-3 rounded-xl text-center transition-all duration-200 border-2"
          :class="[
            rhythmType === rhythm.id
              ? 'border-violet-500 bg-violet-50/50 dark:bg-violet-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-700 bg-white dark:bg-gray-800',
          ]"
          @click="rhythmType = rhythm.id as any"
        >
          <span class="text-xl mb-1 block">{{ rhythm.icon }}</span>
          <span
            class="text-sm font-medium text-gray-900 dark:text-white block"
          >
            {{ rhythm.name }}
          </span>
          <span
            class="text-xs text-gray-500 dark:text-gray-400 block mt-1"
          >
            {{ rhythm.description }}
          </span>
        </button>
      </div>
    </div>

    <!-- Section 3: 钩子类型 -->
    <div>
      <div class="flex items-center gap-2 mb-3">
        <ChevronRight class="w-5 h-5 text-cyan-500" />
        <h4 class="text-sm font-medium text-gray-900 dark:text-white">
          章节钩子
          <span class="text-xs font-normal text-gray-500 dark:text-gray-400 ml-1">
            (可选)
          </span>
        </h4>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          v-for="hook in hookOptions"
          :key="hook.type"
          class="px-3 py-2 rounded-lg text-sm transition-all duration-200 border"
          :class="[
            selectedHooks.includes(hook.type)
              ? 'bg-cyan-100 dark:bg-cyan-900/40 border-cyan-300 dark:border-cyan-700 text-cyan-700 dark:text-cyan-300'
              : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-cyan-300 dark:hover:border-cyan-700',
          ]"
          @click="toggleHook(hook.type)"
        >
          {{ hook.name }}
        </button>
      </div>
    </div>

    <!-- Selected Summary -->
    <div
      v-if="selectedCoolPoints.length > 0"
      class="p-4 rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border border-orange-200 dark:border-orange-800"
    >
      <div class="flex items-center gap-2 mb-2">
        <Flame class="w-4 h-4 text-orange-500" />
        <span class="text-sm font-medium text-orange-700 dark:text-orange-400">
          爽点配置
        </span>
      </div>
      <div class="flex flex-wrap gap-2">
        <span
          v-for="cp in selectedCoolPointDetails"
          :key="cp?.type"
          class="px-2 py-1 rounded-lg text-xs bg-white/80 dark:bg-gray-800/80 text-orange-700 dark:text-orange-300"
        >
          {{ cp?.name }}
        </span>
      </div>
    </div>

    <!-- Section 4: 自定义爽点 -->
    <div>
      <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-2">
        自定义爽点
        <span class="text-xs font-normal text-gray-500 dark:text-gray-400 ml-1">
          (可选)
        </span>
      </h4>
      <textarea
        v-model="customCoolPoints"
        class="w-full h-20 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
        placeholder="描述你想要的其他爽点，如：扮猪吃虎、系统流、迪化流..."
      ></textarea>
    </div>

    <!-- Navigation Buttons -->
    <div class="flex gap-3">
      <button
        class="flex-1 py-3 rounded-xl font-medium border-2 transition-all flex items-center justify-center gap-2"
        :class="[
          !isGenerating
            ? 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            : 'border-gray-100 dark:border-gray-800 text-gray-400 cursor-not-allowed',
        ]"
        :disabled="isGenerating"
        @click="handleBack"
      >
        <ChevronLeft v-if="!isGenerating" class="w-4 h-4" />
        <span v-if="isGenerating" class="w-4 h-4 border-2 border-gray-400/30 border-t-gray-400 rounded-full animate-spin"></span>
        {{ isGenerating ? '生成中...' : '上一步' }}
      </button>
      <button
        class="flex-1 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2"
        :class="[
          canProceed && !isGenerating
            ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg hover:shadow-xl'
            : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed',
        ]"
        :disabled="!canProceed || isGenerating"
        @click="handleComplete"
      >
        <span v-if="isGenerating" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
        <Sparkles v-else class="w-4 h-4" />
        {{ isGenerating ? '生成中...' : '生成大纲' }}
      </button>
    </div>
  </div>
</template>

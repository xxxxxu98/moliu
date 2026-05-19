<script setup lang="ts">
/**
 * 步骤向导组件
 * Moliu v2.0 - 三步创作法的主容器
 */
import { ref, computed, provide } from "vue";
import { Sparkles, RotateCcw } from "lucide-vue-next";
import EmotionGenreStep from "./steps/EmotionGenreStep.vue";
import CoreSettingStep from "./steps/CoreSettingStep.vue";
import CoolPointStep from "./steps/CoolPointStep.vue";

// ============================================================
// Types
// ============================================================

type RhythmType = "single" | "combo" | "cascade";

interface StepData {
  emotionGenre: {
    emotionGoals: string[];
    genres: string[];
    customPrompt: string;
  };
  coreSetting: {
    worldType: string;
    powerSystem: string;
    goldenFinger: string;
    mainConflict: string;
    protagonistType: string;
    antagonistType: string;
  };
  coolPoint: {
    coolPoints: any[];
    hooks: any[];
    rhythmType: RhythmType;
    antiTropes: string[];
    customCoolPoints: string;
  };
}

interface Props {
  /** 是否正在生成中 */
  isGenerating?: boolean;
}

interface Emits {
  (e: "complete", data: StepData): void;
  (e: "back"): void;
}

const props = withDefaults(defineProps<Props>(), {
  isGenerating: false,
});

const emit = defineEmits<Emits>();

// ============================================================
// State
// ============================================================

const currentStep = ref(0);
const totalSteps = 3;

const defaultStepData = (): StepData => ({
  emotionGenre: {
    emotionGoals: [],
    genres: [],
    customPrompt: "",
  },
  coreSetting: {
    worldType: "",
    powerSystem: "",
    goldenFinger: "",
    mainConflict: "",
    protagonistType: "",
    antagonistType: "",
  },
  coolPoint: {
    coolPoints: [],
    hooks: [],
    rhythmType: "single" as "single" | "combo" | "cascade",
    antiTropes: [],
    customCoolPoints: "",
  },
});

const stepData = ref<StepData>(defaultStepData());

// ============================================================
// Computed
// ============================================================

const stepTitle = computed(() => {
  const titles = ["情绪与题材", "核心设定", "爽点规划"];
  return titles[currentStep.value] || "";
});

const stepProgress = computed(() => {
  return ((currentStep.value + 1) / totalSteps) * 100;
});

const canGoBack = computed(() => currentStep.value > 0);
const canGoNext = computed(() => currentStep.value < totalSteps - 1);

const currentGenres = computed(() => stepData.value.emotionGenre.genres);

// ============================================================
// Methods
// ============================================================

function handleStepComplete() {
  if (currentStep.value < totalSteps - 1) {
    currentStep.value++;
  } else {
    // All steps completed
    emit("complete", stepData.value);
  }
}

function handleStepBack() {
  if (currentStep.value > 0) {
    currentStep.value--;
  } else {
    emit("back");
  }
}

function handleReset() {
  currentStep.value = 0;
  stepData.value = defaultStepData();
}

// Provide shared data to child components
provide("wizardData", stepData);
provide("currentGenres", currentGenres);

// Expose for parent to get full data
defineExpose({
  getData: () => stepData.value,
  reset: handleReset,
});
</script>

<template>
  <div class="space-y-4">
    <!-- Progress Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div
          class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center"
        >
          <Sparkles class="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 class="font-semibold text-gray-900 dark:text-white">
            三步创作法
          </h3>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            第 {{ currentStep + 1 }} 步：{{ stepTitle }}
          </p>
        </div>
      </div>
      <button
        class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        title="重新开始"
        @click="handleReset"
      >
        <RotateCcw class="w-4 h-4 text-gray-400" />
      </button>
    </div>

    <!-- Progress Bar -->
    <div class="relative">
      <div
        class="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"
      >
        <div
          class="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-500"
          :style="{ width: `${stepProgress}%` }"
        />
      </div>
    </div>

    <!-- Step Content -->
    <div class="min-h-[400px]">
      <Transition name="slide" mode="out-in">
        <!-- Step 1: Emotion & Genre -->
        <div v-if="currentStep === 0" :key="0">
          <EmotionGenreStep
            v-model="stepData.emotionGenre"
            :is-generating="isGenerating"
            @complete="handleStepComplete"
          />
        </div>

        <!-- Step 2: Core Setting -->
        <div v-else-if="currentStep === 1" :key="1">
          <CoreSettingStep
            v-model="stepData.coreSetting"
            :genres="currentGenres"
            :is-generating="isGenerating"
            @complete="handleStepComplete"
            @back="handleStepBack"
          />
        </div>

        <!-- Step 3: Cool Points -->
        <div v-else-if="currentStep === 2" :key="2">
          <CoolPointStep
            v-model="stepData.coolPoint"
            :genres="currentGenres"
            :is-generating="isGenerating"
            @complete="handleStepComplete"
            @back="handleStepBack"
          />
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.slide-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}
</style>

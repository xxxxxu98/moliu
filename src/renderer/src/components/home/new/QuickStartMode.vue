<script setup lang="ts">
/**
 * QuickStartMode - 快速开始模式
 * Moliu v2.0 - 三步快速创作
 */
import { ref, computed, watch } from "vue";
import {
  Sparkles,
  ArrowRight,
  CheckCircle,
  ChevronRight,
  Zap,
  BookOpen,
  Target,
  Lightbulb,
  TrendingUp,
} from "lucide-vue-next";
import StepWizard from "./StepWizard.vue";
import EmotionGenreStep from "./steps/EmotionGenreStep.vue";
import CoreSettingStep from "./steps/CoreSettingStep.vue";
import CoolPointStep from "./steps/CoolPointStep.vue";
import RetentionScoreCard from "./RetentionScoreCard.vue";
import GenerateButton from "./GenerateButton.vue";

// ============================================================
// Types
// ============================================================

interface QuickStartData {
  emotion: {
    primary: string;
    secondary: string;
    intensity: number;
  };
  genres: string[];
  settings: {
    worldType: string;
    powerSystem: string;
    socialStructure: string;
    mainCharacter: {
      type: string;
      trait: string;
      goal: string;
    };
  };
  coolpoints: {
    type: string;
    frequency: "low" | "medium" | "high";
    intensity: "mild" | "moderate" | "intense";
  }[];
}

// ============================================================
// Props & Emits
// ============================================================

interface Emits {
  (e: "complete", data: QuickStartData): void;
  (e: "back"): void;
}

const emit = defineEmits<Emits>();

// ============================================================
// State
// ============================================================

const currentStep = ref(0);
const isGenerating = ref(false);
const generationProgress = ref(0);

const data = ref<QuickStartData>({
  emotion: {
    primary: "",
    secondary: "",
    intensity: 70,
  },
  genres: [],
  settings: {
    worldType: "",
    powerSystem: "",
    socialStructure: "",
    mainCharacter: {
      type: "",
      trait: "",
      goal: "",
    },
  },
  coolpoints: [],
});

// 实时预览评分
const previewScore = computed(() => {
  const genreCount = data.value.genres.length;
  const hasSetting = data.value.settings.worldType && data.value.settings.powerSystem;
  const hasCoolpoint = data.value.coolpoints.length > 0;

  return {
    hookScore: hasSetting ? 75 : 40,
    coolpointScore: hasCoolpoint ? 60 + data.value.coolpoints.length * 10 : 30,
    microFulfillment: data.value.coolpoints.length > 0 ? 65 : 35,
    suspenseDebt: hasSetting ? 50 : 30,
    rhythmHealth: data.value.emotion.intensity > 50 ? 70 : 55,
    originality: genreCount > 0 ? 50 + genreCount * 10 : 40,
  };
});

// ============================================================
// Steps
// ============================================================

const steps = [
  { id: "emotion", name: "情绪题材", icon: Target, component: EmotionGenreStep },
  { id: "setting", name: "核心设定", icon: BookOpen, component: CoreSettingStep },
  { id: "coolpoint", name: "爽点规划", icon: Zap, component: CoolPointStep },
];

const currentStepData = computed(() => steps[currentStep.value]);

const canProceed = computed(() => {
  switch (currentStep.value) {
    case 0:
      return data.value.emotion.primary && data.value.genres.length > 0;
    case 1:
      return data.value.settings.worldType && data.value.settings.powerSystem;
    case 2:
      return data.value.coolpoints.length > 0;
    default:
      return false;
  }
});

const isComplete = computed(() => {
  return (
    canProceed.value &&
    currentStep.value === steps.length - 1
  );
});

// ============================================================
// Methods
// ============================================================

function nextStep() {
  if (currentStep.value < steps.length - 1) {
    currentStep.value++;
  }
}

function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--;
  } else {
    emit("back");
  }
}

function goToStep(index: number) {
  if (index >= 0 && index < steps.length) {
    currentStep.value = index;
  }
}

async function handleGenerate() {
  if (!canProceed.value) return;

  isGenerating.value = true;
  generationProgress.value = 0;

  // 模拟生成进度
  const interval = setInterval(() => {
    generationProgress.value += Math.random() * 15;
    if (generationProgress.value >= 100) {
      generationProgress.value = 100;
      clearInterval(interval);
    }
  }, 200);

  // 等待完成
  await new Promise((resolve) => setTimeout(resolve, 2000));

  emit("complete", data.value);
  isGenerating.value = false;
}

function handleStepDataUpdate(stepId: string, stepData: any) {
  switch (stepId) {
    case "emotion":
      data.value.emotion = stepData.emotion;
      data.value.genres = stepData.genres;
      break;
    case "setting":
      data.value.settings = stepData;
      break;
    case "coolpoint":
      data.value.coolpoints = stepData;
      break;
  }
}
</script>

<template>
  <div class="flex flex-col h-full bg-gradient-to-br from-indigo-50/50 via-white to-purple-50/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900">
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
      <div class="flex items-center gap-3">
        <div class="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
          <Sparkles class="w-5 h-5" />
        </div>
        <div>
          <h2 class="font-semibold text-gray-900 dark:text-white">快速开始</h2>
          <p class="text-xs text-gray-500 dark:text-gray-400">3步创建你的故事</p>
        </div>
      </div>

      <!-- Progress -->
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2">
          <div
            v-for="(step, index) in steps"
            :key="step.id"
            class="flex items-center"
          >
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200"
              :class="[
                index === currentStep
                  ? 'bg-indigo-500 text-white shadow-md'
                  : index < currentStep
                    ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500',
              ]"
              @click="goToStep(index)"
            >
              <component :is="step.icon" class="w-4 h-4" />
              <span class="hidden sm:inline">{{ step.name }}</span>
            </button>
            <ChevronRight
              v-if="index < steps.length - 1"
              class="w-4 h-4 text-gray-300 dark:text-gray-600 mx-1"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Main Content -->
      <div class="flex-1 flex flex-col overflow-hidden">
        <!-- Step Header -->
        <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div class="flex items-center gap-3">
            <div
              class="p-2 rounded-xl"
              :class="
                currentStep === 0
                  ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600'
                  : currentStep === 1
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'
                    : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600'
              "
            >
              <component :is="currentStepData.icon" class="w-5 h-5" />
            </div>
            <div>
              <h3 class="font-semibold text-gray-900 dark:text-white">
                步骤 {{ currentStep + 1 }}: {{ currentStepData.name }}
              </h3>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ currentStep === 0 ? "选择故事的情绪基调和题材" : currentStep === 1 ? "定义世界观和角色设定" : "规划故事中的爽点节奏" }}
              </p>
            </div>
          </div>
        </div>

        <!-- Step Content -->
        <div class="flex-1 overflow-y-auto p-6">
          <Transition name="slide-fade" mode="out-in">
            <component
              :is="currentStepData.component"
              :key="currentStep"
              :data="data"
              @update="(d) => handleStepDataUpdate(currentStepData.id, d)"
            />
          </Transition>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
          <div class="flex items-center justify-between">
            <!-- Back -->
            <button
              class="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              @click="prevStep"
            >
              <span>{{ currentStep === 0 ? "返回" : "上一步" }}</span>
            </button>

            <!-- Actions -->
            <div class="flex items-center gap-3">
              <GenerateButton
                v-if="isComplete"
                variant="primary"
                size="lg"
                :loading="isGenerating"
                :disabled="!canProceed"
                @click="handleGenerate"
              >
                <Sparkles class="w-5 h-5" />
                <span>生成大纲</span>
              </GenerateButton>
              <button
                v-else
                class="flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-600 shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="!canProceed"
                @click="nextStep"
              >
                <span>下一步</span>
                <ArrowRight class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Preview Sidebar -->
      <div class="w-80 border-l border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 overflow-y-auto p-4">
        <!-- Score Preview -->
        <div class="mb-6">
          <div class="flex items-center gap-2 mb-3">
            <TrendingUp class="w-4 h-4 text-indigo-500" />
            <h4 class="font-medium text-gray-900 dark:text-white">追读力预览</h4>
          </div>
          <RetentionScoreCard :score="previewScore" />
        </div>

        <!-- Quick Summary -->
        <div class="space-y-4">
          <!-- Emotion -->
          <div class="p-3 rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/10 dark:to-amber-900/10">
            <div class="flex items-center gap-2 mb-2">
              <Target class="w-4 h-4 text-orange-500" />
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">情绪基调</span>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ data.emotion.primary || "未选择" }}
              <span v-if="data.emotion.secondary" class="text-gray-400">
                + {{ data.emotion.secondary }}
              </span>
            </p>
          </div>

          <!-- Genres -->
          <div class="p-3 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10">
            <div class="flex items-center gap-2 mb-2">
              <BookOpen class="w-4 h-4 text-blue-500" />
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">题材</span>
            </div>
            <div class="flex flex-wrap gap-1">
              <span
                v-for="genre in data.genres.slice(0, 3)"
                :key="genre"
                class="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs"
              >
                {{ genre }}
              </span>
              <span v-if="data.genres.length > 3" class="text-xs text-gray-400">
                +{{ data.genres.length - 3 }}
              </span>
              <span v-if="data.genres.length === 0" class="text-sm text-gray-400">
                未选择
              </span>
            </div>
          </div>

          <!-- Coolpoints -->
          <div class="p-3 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/10 dark:to-orange-900/10">
            <div class="flex items-center gap-2 mb-2">
              <Zap class="w-4 h-4 text-amber-500" />
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">爽点</span>
            </div>
            <div class="space-y-1">
              <div
                v-for="(cp, index) in data.coolpoints.slice(0, 3)"
                :key="index"
                class="text-xs text-gray-600 dark:text-gray-400"
              >
                • {{ cp.type }}
              </div>
              <span v-if="data.coolpoints.length > 3" class="text-xs text-gray-400">
                +{{ data.coolpoints.length - 3 }} 更多
              </span>
              <span v-if="data.coolpoints.length === 0" class="text-sm text-gray-400">
                未规划
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.slide-fade-enter-active {
  transition: all 0.3s ease-out;
}

.slide-fade-leave-active {
  transition: all 0.2s ease-in;
}

.slide-fade-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.slide-fade-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}
</style>

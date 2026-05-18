<script setup lang="ts">
/**
 * QuickStart v2 - 新三步创作法组件
 * Moliu v2.0 - 基于三步创作法的快速开始组件
 */
import { ref, computed, watch, onMounted } from "vue";
import {
  Sparkles,
  Check,
  Wand2,
  BookOpen,
  Save,
  RotateCcw,
  ChevronDown,
  Heart,
  Zap,
} from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { useMessage } from "naive-ui";
import { NButton, NInput } from "naive-ui";
import { useSettingsStore } from "@/stores/settings.store";
import { DEFAULT_WORD_COUNT_RANGE } from "@/services/ai/unified.service";
import type { GeneratedOutline } from "@/types/inspiration";
import { useOutlineGenerator } from "@/composables/useOutlineGenerator";
import { useProjectCreator } from "@/composables/useProjectCreator";
import OutlineDisplay from "@/components/common/OutlineDisplay.vue";
import WordCountSelector from "@/components/common/WordCountSelector.vue";
import StepWizard from "./new/StepWizard.vue";
import type { HookType, CoolPointType } from "@/types/evaluation";

// ============================================================
// Types
// ============================================================

interface WizardData {
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
    coolPoints: CoolPointType[];
    hooks: HookType[];
    rhythmType: string;
    antiTropes: string[];
    customCoolPoints: string;
  };
}

// ============================================================
// Composables
// ============================================================

const { t } = useI18n();
const message = useMessage();
const settingsStore = useSettingsStore();

const {
  isGenerating,
  error: generationError,
  progress: generationProgress,
  outlines: generatedOutlines,
  generateOutlines,
  reset: resetOutlineState,
} = useOutlineGenerator();

const {
  isCreating,
  error: projectCreateError,
  createProject: doCreateProject,
  reset: resetProjectState,
} = useProjectCreator();

// ============================================================
// State
// ============================================================

type ActiveTab = "wizard" | "templates" | "custom";
const activeTab = ref<ActiveTab>("wizard");

// Wizard state
const showWizard = ref(true);
const wizardCompleted = ref(false);
const wizardData = ref<WizardData | null>(null);

// Traditional inputs
const selectedTemplate = ref<(typeof writingTemplates)[0] | null>(null);
const prompt = ref("");
const selectedWordCountRange = ref(DEFAULT_WORD_COUNT_RANGE);
const selectedOutline = ref<GeneratedOutline | null>(null);

// Draft state
const savedDraft = ref<{
  prompt: string;
  templateId: string | null;
  timestamp: number;
  wordCountRange: string;
} | null>(null);

const showDraftMenu = ref(false);

// ============================================================
// Computed
// ============================================================

const isProcessing = computed(
  () => isGenerating.value || isCreating.value
);

const combinedError = computed(
  () => generationError.value || projectCreateError.value
);

const canGenerate = computed(() => {
  if (wizardCompleted.value) return true;
  if (activeTab.value === "templates" && selectedTemplate.value) {
    return true;
  }
  if (activeTab.value === "custom") {
    return prompt.value.trim().length >= 10;
  }
  return false;
});

const MIN_PROMPT_LENGTH = 10;
const MAX_PROMPT_LENGTH = 2000;

const promptPreview = computed(() => {
  if (wizardCompleted.value && wizardData.value) {
    return buildPromptFromWizard(wizardData.value);
  }
  if (activeTab.value === "templates" && selectedTemplate.value) {
    return selectedTemplate.value.prompt;
  }
  return prompt.value;
});

const inputStatus = computed(() => {
  if (activeTab.value !== "custom") return null;
  const len = prompt.value.trim().length;
  if (len === 0) return { type: "empty", message: "" };
  if (len < MIN_PROMPT_LENGTH) {
    return {
      type: "insufficient",
      message: `还需 ${MIN_PROMPT_LENGTH - len} 个字符`,
      remaining: MIN_PROMPT_LENGTH - len,
    };
  }
  if (len >= MIN_PROMPT_LENGTH && len < 50) {
    return {
      type: "progress",
      message: "继续输入，让 AI 更好地理解你的想法",
      remaining: 0,
    };
  }
  if (len >= 50 && len < 100) {
    return { type: "good", message: "很好，已有足够信息", remaining: 0 };
  }
  return {
    type: "excellent",
    message: "非常详细，AI 将生成更精准的大纲",
    remaining: 0,
  };
});

const isPromptTooLong = computed(
  () => prompt.value.length > MAX_PROMPT_LENGTH
);

// ============================================================
// Methods
// ============================================================

function buildPromptFromWizard(data: WizardData): string {
  const parts: string[] = [];

  // Emotion and Genre
  if (data.emotionGenre.emotionGoals.length > 0) {
    parts.push(`【情绪目标】${data.emotionGenre.emotionGoals.join("、")}`);
  }
  if (data.emotionGenre.genres.length > 0) {
    parts.push(`【题材类型】${data.emotionGenre.genres.join("、")}`);
  }

  // Core Setting
  if (data.coreSetting.worldType) {
    parts.push(`【世界类型】${data.coreSetting.worldType}`);
  }
  if (data.coreSetting.powerSystem) {
    parts.push(`【力量体系】${data.coreSetting.powerSystem}`);
  }
  if (data.coreSetting.goldenFinger) {
    parts.push(`【金手指】${data.coreSetting.goldenFinger}`);
  }
  if (data.coreSetting.protagonistType) {
    parts.push(`【主角定位】${data.coreSetting.protagonistType}`);
  }
  if (data.coreSetting.mainConflict) {
    parts.push(`【核心冲突】${data.coreSetting.mainConflict}`);
  }

  // Cool Points
  if (data.coolPoint.coolPoints.length > 0) {
    parts.push(`【核心爽点】${data.coolPoint.coolPoints.join("、")}`);
  }
  if (data.coolPoint.rhythmType) {
    parts.push(`【爽点节奏】${data.coolPoint.rhythmType}`);
  }
  if (data.coolPoint.hooks.length > 0) {
    parts.push(`【章节钩子】${data.coolPoint.hooks.join("、")}`);
  }
  if (data.coolPoint.customCoolPoints) {
    parts.push(`【自定义爽点】${data.coolPoint.customCoolPoints}`);
  }

  return parts.join("\n\n");
}

function selectTemplate(template: (typeof writingTemplates)[0]) {
  selectedTemplate.value = template;
}

function switchTab(tab: ActiveTab) {
  activeTab.value = tab;
  if (tab === "wizard") {
    showWizard.value = true;
  }
}

async function handleWizardComplete(data: WizardData) {
  wizardData.value = data;
  wizardCompleted.value = true;

  // Auto-generate outlines
  await handleGenerateOutlines();
}

function handleWizardBack() {
  showWizard.value = false;
  activeTab.value = "templates";
}

async function handleGenerateOutlines() {
  if (!canGenerate.value) return;

  await generateOutlines(promptPreview.value, {
    wordCountRange: selectedWordCountRange.value,
  });

  if (generatedOutlines.value && generatedOutlines.value.length > 0) {
    clearDraft();
  }
}

function selectOutline(outline: GeneratedOutline) {
  selectedOutline.value = outline;
}

async function handleCreateProject() {
  if (!selectedOutline.value) return;
  await doCreateProject(selectedOutline.value);
}

function saveDraft() {
  const draft = {
    prompt: prompt.value,
    templateId: selectedTemplate.value?.id || null,
    timestamp: Date.now(),
    wordCountRange: selectedWordCountRange.value,
  };
  localStorage.setItem("quickStartDraft", JSON.stringify(draft));
  savedDraft.value = draft;
  showDraftMenu.value = false;
}

function loadDraft() {
  if (savedDraft.value) {
    prompt.value = savedDraft.value.prompt;
    if (savedDraft.value.templateId) {
      selectedTemplate.value =
        writingTemplates.find((t) => t.id === savedDraft.value?.templateId) ||
        null;
    }
    activeTab.value = savedDraft.value.templateId ? "templates" : "custom";
  }
  showDraftMenu.value = false;
}

function clearDraft() {
  localStorage.removeItem("quickStartDraft");
  savedDraft.value = null;
}

// ============================================================
// Lifecycle
// ============================================================

onMounted(() => {
  const draft = localStorage.getItem("quickStartDraft");
  if (draft) {
    try {
      savedDraft.value = JSON.parse(draft);
    } catch (e) {
      console.error("Failed to parse saved draft:", e);
    }
  }
});

// Writing templates (simplified)
const writingTemplates = [
  {
    id: "urban",
    name: "都市",
    icon: "🏙️",
    description: "现代都市背景的故事",
    prompt: "请生成一个都市背景的小说大纲，包含商战、职场或日常生活元素。",
  },
  {
    id: "fantasy",
    name: "玄幻",
    icon: "🐉",
    description: "异世界冒险与修炼",
    prompt: "请生成一个玄幻背景的小说大纲，包含修炼体系和异世界冒险。",
  },
  {
    id: "xianxia",
    name: "仙侠",
    icon: "☁️",
    description: "修仙问道飞升成仙",
    prompt: "请生成一个仙侠背景的小说大纲，包含修仙体系和道法神通。",
  },
];
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <div
          class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center"
        >
          <Wand2 class="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 class="font-semibold text-gray-900 dark:text-white">
            {{ t("quickStart.title") }}
          </h3>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            {{ t("quickStart.description") }}
          </p>
        </div>
      </div>
      <div class="relative">
        <NButton
          v-if="savedDraft"
          quaternary
          circle
          @click="showDraftMenu = !showDraftMenu"
        >
          <template #icon>
            <BookOpen class="w-4 h-4 text-amber-500" />
          </template>
        </NButton>
        <div
          v-if="showDraftMenu"
          class="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10"
        >
          <NButton
            quaternary
            block
            @click="loadDraft"
          >
            <template #icon>
              <BookOpen class="w-4 h-4" />
            </template>
            加载草稿
          </NButton>
          <NButton
            quaternary
            block
            @click="clearDraft"
          >
            <template #icon>
              <RotateCcw class="w-4 h-4" />
            </template>
            清除草稿
          </NButton>
        </div>
      </div>
    </div>

    <!-- Tab Switcher -->
    <div class="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
      <NButton
        class="flex-1"
        :type="activeTab === 'wizard' ? 'primary' : 'default'"
        :quaternary="activeTab !== 'wizard'"
        @click="switchTab('wizard')"
      >
        <template #icon>
          <Sparkles class="w-3.5 h-3.5" />
        </template>
        三步法
      </NButton>
      <NButton
        class="flex-1"
        :type="activeTab === 'templates' ? 'primary' : 'default'"
        :quaternary="activeTab !== 'templates'"
        @click="switchTab('templates')"
      >
        {{ t("quickStart.templateMarket") }}
      </NButton>
      <NButton
        class="flex-1"
        :type="activeTab === 'custom' ? 'primary' : 'default'"
        :quaternary="activeTab !== 'custom'"
        @click="switchTab('custom')"
      >
        {{ t("quickStart.customInput") }}
      </NButton>
    </div>

    <!-- Wizard Tab -->
    <div v-if="activeTab === 'wizard' && showWizard" class="space-y-4">
      <StepWizard
        ref="wizardRef"
        @complete="handleWizardComplete"
        @back="handleWizardBack"
      />
    </div>

    <!-- Templates Tab -->
    <div v-else-if="activeTab === 'templates'" class="space-y-3">
      <div class="grid grid-cols-2 gap-2">
        <NButton
          v-for="template in writingTemplates"
          :key="template.id"
          secondary
          block
          class="text-left h-auto py-3"
          :type="selectedTemplate?.id === template.id ? 'primary' : 'default'"
          @click="selectTemplate(template)"
        >
          <div class="flex items-center gap-2 mb-1.5 w-full">
            <span class="text-lg">{{ template.icon }}</span>
            <span class="font-medium text-sm">{{ template.name }}</span>
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 w-full text-left">
            {{ template.description }}
          </p>
        </NButton>
      </div>

      <!-- Template Detail -->
      <div
        v-if="selectedTemplate"
        class="p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
      >
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ selectedTemplate.prompt }}
        </p>
      </div>
    </div>

    <!-- Custom Input Tab -->
    <div v-else-if="activeTab === 'custom'" class="space-y-3">
      <NInput
        v-model:value="prompt"
        type="textarea"
        :placeholder="t('quickStart.placeholder')"
        :autosize="{ minRows: 4, maxRows: 8 }"
        show-count
        :status="isPromptTooLong ? 'error' : prompt.trim().length >= MIN_PROMPT_LENGTH ? 'success' : undefined"
      />
      <div class="flex items-center justify-between mt-1.5">
        <div v-if="inputStatus?.type === 'insufficient'" class="flex items-center gap-1 text-xs text-amber-500">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          {{ inputStatus.message }}
        </div>
        <div v-else-if="inputStatus?.type === 'good'" class="flex items-center gap-1 text-xs text-green-500">
          <Check class="w-3 h-3" />
          {{ inputStatus.message }}
        </div>
        <div v-else></div>
        <div class="flex items-center gap-2">
          <span class="text-xs transition-colors" :class="isPromptTooLong ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'">
            {{ prompt.length }} / {{ MAX_PROMPT_LENGTH }}
          </span>
          <NButton
            v-if="prompt.trim()"
            quaternary
            size="small"
            @click="saveDraft"
          >
            <template #icon>
              <Save class="w-3.5 h-3.5" />
            </template>
          </NButton>
        </div>
      </div>
    </div>

    <!-- Word Count Range Selector -->
    <div v-if="activeTab !== 'wizard'" class="flex items-center justify-between px-1">
      <WordCountSelector
        v-model="selectedWordCountRange"
        :disabled="isProcessing"
      />
      <span class="text-xs text-gray-400 dark:text-gray-500">字数范围</span>
    </div>

    <!-- Generate Button -->
    <div v-if="activeTab !== 'wizard'" class="relative">
      <NButton
        class="w-full"
        type="primary"
        size="large"
        :disabled="!canGenerate || isProcessing"
        :loading="isProcessing"
        @click="handleGenerateOutlines"
      >
        <template #icon>
          <Sparkles v-if="!isProcessing" class="w-4 h-4" />
        </template>
        {{ isProcessing ? t("quickStart.generating") : t("quickStart.generate") }}
      </NButton>
    </div>

    <!-- Outline Display -->
    <OutlineDisplay
      v-if="generatedOutlines && generatedOutlines.length > 0"
      :outlines="generatedOutlines"
      :selected-outline="selectedOutline ?? null"
      :is-generating="!!isProcessing"
      :progress="generationProgress || ''"
      :error="combinedError"
      :show-word-count="true"
      :show-streaming-preview="true"
      @select="selectOutline"
      @regenerate="handleGenerateOutlines"
      @create="handleCreateProject"
    />
  </div>
</template>

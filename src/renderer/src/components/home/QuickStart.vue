<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import {
  Sparkles,
  Check,
  Wand2,
  BookOpen,
  Save,
  Edit3,
  RotateCcw,
  ChevronDown,
} from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { useSettingsStore } from "@/stores/settings.store";
import { WORD_COUNT_OPTIONS, DEFAULT_WORD_COUNT_RANGE } from "@/services/ai/unified.service";
import type { GeneratedOutline } from "@/types/inspiration";
import { writingTemplates } from "@/data/inspirations";
import { useOutlineGenerator } from "@/composables/useOutlineGenerator";
import { useProjectCreator } from "@/composables/useProjectCreator";
import OutlineDisplay from "@/components/common/OutlineDisplay.vue";
import WordCountSelector from "@/components/common/WordCountSelector.vue";

const { t } = useI18n();
const settingsStore = useSettingsStore();

// 使用 Composable 封装的大纲生成和项目创建逻辑
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

// 合并处理状态
const isProcessing = computed(() => isGenerating.value || isCreating.value);

// 合并错误状态
const combinedError = computed(() => generationError.value || projectCreateError.value);

const activeTab = ref<"templates" | "custom">("templates");
const selectedTemplate = ref<(typeof writingTemplates)[0] | null>(null);
const prompt = ref("");
const storyType = ref("");
const mainCharacter = ref("");
const storyGoal = ref("");
const conflict = ref("");
const customSettings = ref("");

const showStructuredInput = ref(false);

// 字数范围选择
const selectedWordCountRange = ref(DEFAULT_WORD_COUNT_RANGE);

// 选中的大纲
const selectedOutline = ref<GeneratedOutline | null>(null);

// Draft state
const savedDraft = ref<{
  prompt: string;
  storyType: string;
  mainCharacter: string;
  storyGoal: string;
  conflict: string;
  customSettings: string;
  templateId: string | null;
  timestamp: number;
  wordCountRange: string;
} | null>(null);

const showDraftMenu = ref(false);

const canGenerate = computed(() => {
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

const isPromptTooLong = computed(() => prompt.value.length > MAX_PROMPT_LENGTH);

const promptPreview = computed(() => {
  if (activeTab.value === "templates" && selectedTemplate.value) {
    return selectedTemplate.value.prompt;
  }
  return prompt.value;
});

onMounted(() => {
  // Load saved draft from localStorage
  const draft = localStorage.getItem("quickStartDraft");
  if (draft) {
    try {
      savedDraft.value = JSON.parse(draft);
    } catch (e) {
      console.error("Failed to parse saved draft:", e);
    }
  }
});

function selectTemplate(template: (typeof writingTemplates)[0]) {
  selectedTemplate.value = template;
}

function useStructuredInput() {
  showStructuredInput.value = !showStructuredInput.value;
  if (showStructuredInput.value) {
    activeTab.value = "custom";
  }
}

function updatePromptFromStructured() {
  const parts: string[] = [];

  if (storyType.value) {
    parts.push(`题材类型：${storyType.value}`);
  }
  if (mainCharacter.value) {
    parts.push(`主角设定：${mainCharacter.value}`);
  }
  if (storyGoal.value) {
    parts.push(`故事目标：${storyGoal.value}`);
  }
  if (conflict.value) {
    parts.push(`核心冲突：${conflict.value}`);
  }
  if (customSettings.value) {
    parts.push(`其他设定：${customSettings.value}`);
  }

  prompt.value = parts.join("\n");
}

function saveDraft() {
  const draft = {
    prompt: prompt.value,
    storyType: storyType.value,
    mainCharacter: mainCharacter.value,
    storyGoal: storyGoal.value,
    conflict: conflict.value,
    customSettings: customSettings.value,
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
    storyType.value = savedDraft.value.storyType;
    mainCharacter.value = savedDraft.value.mainCharacter;
    storyGoal.value = savedDraft.value.storyGoal;
    conflict.value = savedDraft.value.conflict;
    customSettings.value = savedDraft.value.customSettings;
    if (savedDraft.value.templateId) {
      selectedTemplate.value =
        writingTemplates.find((t) => t.id === savedDraft.value?.templateId) ||
        null;
    }
    activeTab.value = savedDraft.value.templateId ? "templates" : "custom";
    showStructuredInput.value = !!(
      storyType.value ||
      mainCharacter.value ||
      storyGoal.value ||
      conflict.value ||
      customSettings.value
    );
    // 恢复字数范围
    if (savedDraft.value.wordCountRange) {
      selectedWordCountRange.value = savedDraft.value.wordCountRange;
    }
  }
  showDraftMenu.value = false;
}

function clearDraft() {
  localStorage.removeItem("quickStartDraft");
  savedDraft.value = null;
}

async function handleGenerateOutlines() {
  if (!canGenerate.value) return;

  // 使用 composable 生成大纲
  await generateOutlines(promptPreview.value, {
    wordCountRange: selectedWordCountRange.value,
  });

  // 生成成功后清除草稿
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

/**
 * 从故事简介中提取世界观设定（基础实现）
 * 后续可以增强为更智能的AI提取
 */
function extractWorldSchemaFromSynopsis(synopsis: string): { locations: any[]; rules: any[]; factions: any[] } {
  const worldSchema = { locations: [] as any[], rules: [] as any[], factions: [] as any[] };

  // 简单关键词匹配来识别世界观元素
  const locationKeywords = ['城', '镇', '村', '国', '山', '河', '海', '森林', '沙漠', '大陆', '世界'];
  const ruleKeywords = ['法则', '规则', '力量', '体系', '设定'];
  const factionKeywords = ['门派', '家族', '组织', '势力', '帮派', '宗门'];

  // 按句子分割简介
  const sentences = synopsis.split(/[。；！？]/).filter(s => s.trim());

  for (const sentence of sentences) {
    // 尝试提取地点
    for (const keyword of locationKeywords) {
      if (sentence.includes(keyword) && sentence.length < 100) {
        const locationName = extractMainEntity(sentence, keyword);
        if (locationName && !worldSchema.locations.find(l => l.name === locationName)) {
          worldSchema.locations.push({
            id: `loc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: locationName,
            description: sentence.trim(),
          });
        }
        break;
      }
    }

    // 尝试提取规则/法则
    for (const keyword of ruleKeywords) {
      if (sentence.includes(keyword) && sentence.length < 150) {
        const ruleName = extractMainEntity(sentence, keyword);
        if (ruleName && !worldSchema.rules.find(r => r.name === ruleName)) {
          worldSchema.rules.push({
            id: `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: ruleName,
            description: sentence.trim(),
            locked: false,
          });
        }
        break;
      }
    }

    // 尝试提取势力
    for (const keyword of factionKeywords) {
      if (sentence.includes(keyword) && sentence.length < 100) {
        const factionName = extractMainEntity(sentence, keyword);
        if (factionName && !worldSchema.factions.find(f => f.name === factionName)) {
          worldSchema.factions.push({
            id: `faction-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: factionName,
            description: sentence.trim(),
          });
        }
        break;
      }
    }
  }

  return worldSchema;
}

/**
 * 从句子中提取主体实体
 */
function extractMainEntity(sentence: string, keyword: string): string {
  // 找到关键词的位置
  const index = sentence.indexOf(keyword);
  if (index === -1) return '';

  // 尝试往前取实体名称（最多8个字符）
  let start = Math.max(0, index - 8);
  let entity = sentence.slice(start, index).trim();

  // 如果实体太短或包含逗号等，尝试往后取一点
  if (entity.length < 2) {
    entity = sentence.slice(index, Math.min(sentence.length, index + 10)).trim();
  }

  // 清理实体名称
  entity = entity.replace(/[，、：:]/g, '').trim();

  return entity;
}
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
        <button
          v-if="savedDraft"
          class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          @click="showDraftMenu = !showDraftMenu"
        >
          <BookOpen class="w-4 h-4 text-amber-500" />
        </button>
        <div
          v-if="showDraftMenu"
          class="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10"
        >
          <button
            class="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
            @click="loadDraft"
          >
            <BookOpen class="w-4 h-4" />
            加载草稿
          </button>
          <button
            class="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
            @click="clearDraft"
          >
            <RotateCcw class="w-4 h-4" />
            清除草稿
          </button>
        </div>
      </div>
    </div>

    <!-- Tab Switcher -->
    <div class="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
      <button
        class="flex-1 py-1.5 text-sm font-medium rounded-md transition-all"
        :class="
          activeTab === 'templates'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-500 dark:text-gray-400'
        "
        @click="activeTab = 'templates'"
      >
        {{ t("quickStart.templateMarket") }}
      </button>
      <button
        class="flex-1 py-1.5 text-sm font-medium rounded-md transition-all"
        :class="
          activeTab === 'custom'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-500 dark:text-gray-400'
        "
        @click="activeTab = 'custom'"
      >
        {{ t("quickStart.customInput") }}
      </button>
    </div>

    <!-- Templates Tab -->
    <div v-if="activeTab === 'templates'" class="space-y-3">
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="template in writingTemplates"
          :key="template.id"
          class="p-3 rounded-xl border-2 text-left transition-all duration-200"
          :class="[
            selectedTemplate?.id === template.id
              ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20'
              : 'border-gray-100 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 bg-white dark:bg-gray-800',
          ]"
          @click="selectTemplate(template)"
        >
          <div class="flex items-center gap-2 mb-1.5">
            <span class="text-lg">{{ template.icon }}</span>
            <span class="font-medium text-sm text-gray-900 dark:text-white">{{
              template.name
            }}</span>
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
            {{ template.description }}
          </p>
        </button>
      </div>

      <!-- Template Detail -->
      <div
        v-if="selectedTemplate"
        class="p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
      >
        <div class="flex items-center gap-2 mb-2">
          <Edit3 class="w-4 h-4 text-indigo-500" />
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{
            t("quickStart.templatePrompt")
          }}</span>
        </div>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ selectedTemplate.prompt }}
        </p>
      </div>
    </div>

    <!-- Custom Input Tab -->
    <div v-else class="space-y-3">
      <!-- Structured Input Toggle -->
      <button
        class="w-full flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-left transition-all hover:border-indigo-300 dark:hover:border-indigo-700"
        @click="useStructuredInput"
      >
        <div class="flex items-center gap-2">
          <Edit3 class="w-4 h-4 text-indigo-500" />
          <span class="text-sm text-gray-700 dark:text-gray-300">{{
            t("quickStart.useStructuredInput")
          }}</span>
        </div>
        <ChevronDown
          class="w-4 h-4 text-gray-400 transition-transform duration-200"
          :class="{ 'rotate-180': showStructuredInput }"
        />
      </button>

      <!-- Structured Input Fields -->
      <div
        v-if="showStructuredInput"
        class="space-y-2 p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800"
      >
        <div>
          <label class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{{
            t("quickStart.storyType")
          }}</label>
          <input
            v-model="storyType"
            class="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            :placeholder="t('quickStart.storyTypePlaceholder')"
            @input="updatePromptFromStructured"
          />
        </div>
        <div>
          <label class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{{
            t("quickStart.mainCharacter")
          }}</label>
          <input
            v-model="mainCharacter"
            class="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            :placeholder="t('quickStart.mainCharacterPlaceholder')"
            @input="updatePromptFromStructured"
          />
        </div>
        <div>
          <label class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{{
            t("quickStart.storyGoal")
          }}</label>
          <input
            v-model="storyGoal"
            class="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            :placeholder="t('quickStart.storyGoalPlaceholder')"
            @input="updatePromptFromStructured"
          />
        </div>
        <div>
          <label class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{{
            t("quickStart.conflict")
          }}</label>
          <input
            v-model="conflict"
            class="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            :placeholder="t('quickStart.conflictPlaceholder')"
            @input="updatePromptFromStructured"
          />
        </div>
        <div>
          <label class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{{
            t("quickStart.customSettings")
          }}</label>
          <textarea
            v-model="customSettings"
            class="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
            rows="2"
            :placeholder="t('quickStart.customSettingsPlaceholder')"
            @input="updatePromptFromStructured"
          ></textarea>
        </div>
      </div>

      <!-- Free-form Prompt -->
      <div>
        <textarea
          v-model="prompt"
          class="w-full h-28 p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border transition-all text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
          :class="[
            isPromptTooLong
              ? 'border-red-400 dark:border-red-500'
              : prompt.trim().length >= MIN_PROMPT_LENGTH
                ? 'border-green-400 dark:border-green-500'
                : 'border-gray-200 dark:border-gray-700',
          ]"
          :placeholder="t('quickStart.placeholder')"
        ></textarea>
        <div class="flex items-center justify-between mt-1.5">
          <!-- Input Status Message -->
          <div v-if="activeTab === 'custom'" class="flex items-center gap-1.5">
            <span
              v-if="inputStatus?.type === 'insufficient'"
              class="flex items-center gap-1 text-xs text-amber-500"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              {{ inputStatus.message }}
            </span>
            <span
              v-else-if="inputStatus?.type === 'progress'"
              class="flex items-center gap-1 text-xs text-indigo-500"
            >
              <span
                class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"
              ></span>
              {{ inputStatus.message }}
            </span>
            <span
              v-else-if="inputStatus?.type === 'good'"
              class="flex items-center gap-1 text-xs text-green-500"
            >
              <Check class="w-3 h-3" />
              {{ inputStatus.message }}
            </span>
            <span
              v-else-if="inputStatus?.type === 'excellent'"
              class="flex items-center gap-1 text-xs text-emerald-500"
            >
              <Check class="w-3 h-3" />
              {{ inputStatus.message }}
            </span>
          </div>
          <div v-else></div>

          <!-- Character Count -->
          <div class="flex items-center gap-2">
            <span
              class="text-xs transition-colors"
              :class="isPromptTooLong ? 'text-red-500' : 'text-gray-400'"
            >
              {{ prompt.length }} / {{ MAX_PROMPT_LENGTH }}
            </span>
            <button
              v-if="prompt.trim()"
              class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              @click="saveDraft"
            >
              <Save class="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Word Count Range Selector -->
    <div class="flex items-center justify-between px-1">
      <WordCountSelector
        v-model="selectedWordCountRange"
        :disabled="isProcessing"
      />
      <span class="text-xs text-gray-400 dark:text-gray-500">字数范围</span>
    </div>

    <!-- Generate Button -->
    <div class="relative">
      <button
        class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-medium shadow-lg transition-all"
        :class="[
          canGenerate && !isProcessing
            ? 'bg-gradient-to-r from-indigo-500 to-purple-600 shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30'
            : 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed',
        ]"
        :disabled="!canGenerate || isProcessing"
        @click="handleGenerateOutlines"
      >
        <Sparkles v-if="!isProcessing" class="w-4 h-4" />
        <span
          v-if="isProcessing"
          class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
        ></span>
        {{
          isProcessing ? t("quickStart.generating") : t("quickStart.generate")
        }}
      </button>

      <!-- Tooltip for disabled state -->
      <div
        v-if="
          !canGenerate &&
          !isProcessing &&
          activeTab === 'custom' &&
          prompt.trim().length > 0
        "
        class="absolute left-1/2 -translate-x-1/2 -top-8 px-2 py-1 bg-gray-800 dark:bg-gray-700 text-white text-xs rounded whitespace-nowrap pointer-events-none z-10"
      >
        <span class="flex items-center gap-1">
          <span class="text-red-400">✕</span>
          请至少输入 {{ MIN_PROMPT_LENGTH }} 个字符
        </span>
        <div
          class="absolute left-1/2 -translate-x-1/2 top-full -mt-px w-2 h-2 bg-gray-800 dark:bg-gray-700 rotate-45"
        ></div>
      </div>
    </div>

    <!-- 大纲列表展示（使用通用组件） -->
    <OutlineDisplay
      :outlines="generatedOutlines || []"
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

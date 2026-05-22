<script setup lang="ts">
/**
 * ProOutliner - 专业大纲系统
 * 整合五步大纲法、卷节拍表、卷时间线等高级功能
 */
import { ref, computed, watch, onMounted } from 'vue';
import {
  Sparkles,
  Check,
  BookOpen,
  Save,
  RotateCcw,
  ChevronRight,
  ChevronDown,
  Target,
  Layers,
  User,
  Zap,
  Clock,
  FileText,
  ArrowRight,
  ListChecks,
  TrendingUp,
  AlertCircle,
  Play,
  Eye,
} from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useMessage } from 'naive-ui';
import { NButton, NCollapse, NCollapseItem, NTag, NCard, NTabs, NTabPane } from 'naive-ui';
import { useSettingsStore } from '@/stores/settings.store';
import { useProjectStore } from '@/stores/project.store';
import {
  fiveStepOutline,
  getStepDetails,
  getEightStoryLines,
  getConflictEscalation,
  getCoolPointFormulas,
  type FiveStepProgress,
  type OutlineStep,
  isAllStepsComplete,
  getProgressPercentage,
  type OutlineFramework,
} from '@/data/five-step-outline';
import {
  buildMasterOutlinePrompt,
  buildVolumeBeatPrompt,
  buildTimelinePrompt,
  type FiveStepPromptOptions,
  type VolumeBeatPromptOptions,
  type TimelinePromptOptions,
} from '@/services/outline/prompts';
import type { StoryContract } from '@/services/outline/contracts';
import OutlineDisplay from '@/components/common/OutlineDisplay.vue';
import type { GeneratedOutline } from '@/types/inspiration';
import { useOutlineGenerator } from '@/composables/useOutlineGenerator';
import type { WritingTemplate } from './QuickStart.vue';

const props = defineProps<{
  importedTemplate?: WritingTemplate | null;
}>();

const { t } = useI18n();
const message = useMessage();
const projectStore = useProjectStore();
const settingsStore = useSettingsStore();

const {
  isGenerating,
  error: generationError,
  progress: generationProgress,
  outlines: generatedOutlines,
  generateOutlines,
  reset: resetOutlineState,
} = useOutlineGenerator();

// 激活的 Tab
const activeTab = ref<'five-step' | 'volume' | 'timeline'>('five-step');

// ============================================================
// 五步大纲法状态
// ============================================================
const currentStep = ref(1);
const showAdvanced = ref(false);
const isExpanded = ref(true);

const stepData = ref({
  emotionGoal: '',
  setting: '',
  protagonist: '',
  structure: '',
  pleasurePoints: '',
});

const storyLines = ref({
  map: '',
  faction: '',
  character: '',
  goldenfinger: '',
  worldRules: '',
  conflict: '',
  collection: '',
  romance: '',
});

const conflictDesign = ref({
  source: '',
  escalation: [] as string[],
  majorConflicts: [] as string[],
});

// 进度状态 - 使用 watch 而非 computed 来确保响应式更新
const progress = ref<FiveStepProgress>({
  step1Complete: false,
  step2Complete: false,
  step3Complete: false,
  step4Complete: false,
  step5Complete: false,
});

// Handle imported template from QuickStart
watch(
  () => props.importedTemplate,
  (template) => {
    if (template) {
      // Extract information from the template and populate the fields
      const prompt = template.prompt;

      // Try to extract core formula from prompt
      const coreFormulaMatch = prompt.match(/## 【核心公式】\s*\n([\s\S]*?)(?=## 【)/);
      if (coreFormulaMatch) {
        stepData.value.emotionGoal = `基于模板「${template.name}」的大纲创作。\n核心方向：${template.coreFormula || '根据模板特点进行创作'}`;
      }

      // Extract required elements
      if (template.requiredElements && template.requiredElements.length > 0) {
        stepData.value.setting = `类型：${template.category}\n核心元素：${template.requiredElements.join('、')}`;
      }

      // Set structure hint
      if (template.rhythmAdvice) {
        stepData.value.structure = `节奏建议：${template.rhythmAdvice}`;
      }

      // Set pleasure points hint
      if (template.structureTemplate) {
        stepData.value.pleasurePoints = `结构模板：${template.structureTemplate}`;
      }

      // If template has detailed prompt, use it as reference
      if (prompt.length > 100) {
        stepData.value.protagonist = `模板参考：${template.description}`;
      }

      // 手动更新进度状态，确保生成按钮显示
      progress.value = {
        step1Complete: stepData.value.emotionGoal.length >= 10,
        step2Complete: stepData.value.setting.length >= 10,
        step3Complete: stepData.value.protagonist.length >= 10,
        step4Complete: stepData.value.structure.length >= 10,
        step5Complete: stepData.value.pleasurePoints.length >= 10,
      };

      message.success(`已导入模板「${template.name}」到专业大纲`);
    }
  },
  { immediate: true }
);

// 监听 stepData 变化，更新进度
watch(
  () => stepData.value,
  (data) => {
    progress.value = {
      step1Complete: data.emotionGoal.length >= 10,
      step2Complete: data.setting.length >= 10,
      step3Complete: data.protagonist.length >= 10,
      step4Complete: data.structure.length >= 10,
      step5Complete: data.pleasurePoints.length >= 10,
    };
  },
  { deep: true }
);

const allComplete = computed(() => isAllStepsComplete(progress.value));

const progressPercent = computed(() => getProgressPercentage(progress.value));
const currentStepDetail = computed(() => getStepDetails(currentStep.value));
const stepsComplete = computed(() => [
  progress.value.step1Complete,
  progress.value.step2Complete,
  progress.value.step3Complete,
  progress.value.step4Complete,
  progress.value.step5Complete,
]);

const eightStoryLines = computed(() => getEightStoryLines());
const conflictEscalation = computed(() => getConflictEscalation());
const coolPointFormulas = computed(() => getCoolPointFormulas());

// 当前步骤对应的数据字段
const currentStepField = computed(() => {
  const fields: Record<number, keyof typeof stepData.value> = {
    1: 'emotionGoal',
    2: 'setting',
    3: 'protagonist',
    4: 'structure',
    5: 'pleasurePoints',
  };
  return fields[currentStep.value] || 'emotionGoal';
});

// 当前步骤的数据值
const currentStepValue = computed({
  get: () => stepData.value[currentStepField.value],
  set: (val: string) => {
    stepData.value[currentStepField.value] = val;
  }
});

// 八条故事线数据（按字段名索引）
const storyLineField = (id: string) => {
  return computed({
    get: () => storyLines.value[id as keyof typeof storyLines.value] || '',
    set: (val: string) => {
      storyLines.value[id as keyof typeof storyLines.value] = val;
    }
  });
};

// 五步大纲法数据
const fiveStepData = ref<Partial<OutlineFramework>>({});
const fiveStepPrompt = ref('');
const fiveStepResult = ref<StoryContract | null>(null);
const isGeneratingFiveStep = ref(false);

// ============================================================
// 卷节拍表状态
// ============================================================
const volumeData = ref({
  volumeId: 1,
  volumeTitle: '',
  chapterStart: 1,
  chapterEnd: 30,
  coreConflict: '',
  volumeClimax: '',
  genre: '',
  previousVolumeSummary: '',
});

const beatPrompt = ref('');
const isGeneratingBeat = ref(false);

// ============================================================
// 卷时间线状态
// ============================================================
const timelineData = ref({
  volumeId: 1,
  volumeTitle: '第一卷',
  beats: [] as any[],
  baseline: '仙历3021年春',
  hasCountdown: false,
  countdownEvents: [] as { event: string; targetChapter: number; daysRemaining: number }[],
});

const timelinePrompt = ref('');
const isGeneratingTimeline = ref(false);

// ============================================================
// 辅助函数
// ============================================================
function getStepIcon(step: OutlineStep) {
  const icons: Record<number, any> = {
    1: Target,
    2: Layers,
    3: User,
    4: BookOpen,
    5: Zap,
  };
  return icons[step.id] || Sparkles;
}

function updateData(field: keyof typeof stepData.value, value: string) {
  stepData.value[field] = value;
}

function goToStep(step: number) {
  currentStep.value = step;
}

function prevStep() {
  if (currentStep.value > 1) {
    currentStep.value--;
  }
}

function nextStep() {
  if (currentStep.value < 5) {
    currentStep.value++;
  }
}

// ============================================================
// 五步大纲法生成
// ============================================================
async function generateFiveStepOutline() {
  if (!allComplete.value) {
    message.warning('请先完成所有步骤');
    return;
  }

  isGeneratingFiveStep.value = true;

  try {
    // 构建五步大纲数据
    fiveStepData.value = {
      emotionGoal: stepData.value.emotionGoal,
      coreSetting: {
        world: stepData.value.setting,
        rules: [],
        uniqueFeature: '',
      },
      protagonist: {
        name: '',
        personality: '',
        strengths: '',
        weaknesses: '',
        growthArc: '',
      },
      structure: {
        opening: '',
        conflicts: [],
        turningPoints: [],
        climax: stepData.value.pleasurePoints,
        resolution: '',
      },
      pleasurePoints: {
        scenes: [stepData.value.pleasurePoints],
        frequency: '',
      },
      storyLines: storyLines.value,
      conflictDesign: conflictDesign.value,
    };

    // 构建提示词
    const promptOptions: FiveStepPromptOptions = {
      seed: stepData.value.emotionGoal + '\n' + stepData.value.setting + '\n' + stepData.value.protagonist,
      genre: volumeData.value.genre,
      template: undefined,
    };

    const { system, user } = buildMasterOutlinePrompt(promptOptions);
    fiveStepPrompt.value = system + '\n\n---\n\n' + user;

    // 调用 AI 生成（使用现有的生成器）
    const result = await generateOutlines(fiveStepPrompt.value, {
      temperature: 0.7,
    });

    if (result && result.length > 0) {
      fiveStepResult.value = result[0] as any;
      message.success('大纲生成成功');
    }
  } catch (error) {
    message.error('生成失败: ' + (error as Error).message);
  } finally {
    isGeneratingFiveStep.value = false;
  }
}

// ============================================================
// 卷节拍表生成
// ============================================================
async function generateVolumeBeat() {
  if (!volumeData.value.volumeTitle || !volumeData.value.coreConflict) {
    message.warning('请填写卷标题和核心冲突');
    return;
  }

  isGeneratingBeat.value = true;

  try {
    const beatOptions: VolumeBeatPromptOptions = {
      volumeId: volumeData.value.volumeId,
      volumeTitle: volumeData.value.volumeTitle,
      chapterStart: volumeData.value.chapterStart,
      chapterEnd: volumeData.value.chapterEnd,
      coreConflict: volumeData.value.coreConflict,
      volumeClimax: volumeData.value.volumeClimax,
      genre: volumeData.value.genre,
      previousVolumeSummary: volumeData.value.previousVolumeSummary,
    };

    const { system, user } = buildVolumeBeatPrompt(beatOptions);
    beatPrompt.value = system + '\n\n---\n\n' + user;

    message.info('卷节拍表提示词已生成，请在下方查看');
  } catch (error) {
    message.error('生成失败: ' + (error as Error).message);
  } finally {
    isGeneratingBeat.value = false;
  }
}

// ============================================================
// 卷时间线生成
// ============================================================
async function generateTimeline() {
  if (!timelineData.value.volumeTitle) {
    message.warning('请填写卷标题');
    return;
  }

  isGeneratingTimeline.value = true;

  try {
    const timelineOptions: TimelinePromptOptions = {
      volumeId: timelineData.value.volumeId,
      volumeTitle: timelineData.value.volumeTitle,
      beats: timelineData.value.beats,
      baseline: timelineData.value.baseline,
      hasCountdown: timelineData.value.hasCountdown,
      countdownEvents: timelineData.value.countdownEvents,
    };

    const { system, user } = buildTimelinePrompt(timelineOptions);
    timelinePrompt.value = system + '\n\n---\n\n' + user;

    message.info('卷时间线提示词已生成，请在下方查看');
  } catch (error) {
    message.error('生成失败: ' + (error as Error).message);
  } finally {
    isGeneratingTimeline.value = false;
  }
}

// ============================================================
// 重置
// ============================================================
function resetFiveStep() {
  stepData.value = {
    emotionGoal: '',
    setting: '',
    protagonist: '',
    structure: '',
    pleasurePoints: '',
  };
  storyLines.value = {
    map: '',
    faction: '',
    character: '',
    goldenfinger: '',
    worldRules: '',
    conflict: '',
    collection: '',
    romance: '',
  };
  conflictDesign.value = {
    source: '',
    escalation: [],
    majorConflicts: [],
  };
  fiveStepResult.value = null;
  fiveStepPrompt.value = '';
  currentStep.value = 1;
}

function resetVolume() {
  volumeData.value = {
    volumeId: 1,
    volumeTitle: '',
    chapterStart: 1,
    chapterEnd: 30,
    coreConflict: '',
    volumeClimax: '',
    genre: '',
    previousVolumeSummary: '',
  };
  beatPrompt.value = '';
}

function resetTimeline() {
  timelineData.value = {
    volumeId: 1,
    volumeTitle: '第一卷',
    beats: [],
    baseline: '仙历3021年春',
    hasCountdown: false,
    countdownEvents: [],
  };
  timelinePrompt.value = '';
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <ListChecks class="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 class="font-semibold text-gray-900 dark:text-white">专业大纲</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400">五步大纲法 · 卷节拍表 · 卷时间线</p>
        </div>
      </div>
    </div>

    <!-- Tab Switcher -->
    <div class="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
      <button
        class="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
        :class="activeTab === 'five-step' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
        @click="activeTab = 'five-step'"
      >
        <Target class="w-4 h-4" />
        五步法
      </button>
      <button
        class="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
        :class="activeTab === 'volume' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
        @click="activeTab = 'volume'"
      >
        <FileText class="w-4 h-4" />
        节拍表
      </button>
      <button
        class="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
        :class="activeTab === 'timeline' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
        @click="activeTab = 'timeline'"
      >
        <Clock class="w-4 h-4" />
        时间线
      </button>
    </div>

    <!-- ============================================================ -->
    <!-- 五步大纲法 -->
    <!-- ============================================================ -->
    <div v-if="activeTab === 'five-step'" class="space-y-4">
      <!-- 步骤指示器 -->
      <div class="flex items-center gap-2 flex-wrap">
        <button
          v-for="step in fiveStepOutline"
          :key="step.id"
          class="flex-1 flex items-center gap-2 p-2 rounded-lg transition-all"
          :class="[
            currentStep === step.id
              ? 'bg-violet-50 dark:bg-violet-900/30 ring-2 ring-violet-500/50'
              : stepsComplete[step.id - 1]
                ? 'bg-emerald-50 dark:bg-emerald-900/30'
                : 'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800'
          ]"
          @click="goToStep(step.id)"
        >
          <Check v-if="stepsComplete[step.id - 1]" class="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <component v-else :is="getStepIcon(step)" class="w-4 h-4 text-gray-400 flex-shrink-0" :class="{ 'text-violet-500': currentStep === step.id }" />
          <span class="text-xs font-medium truncate">{{ step.name }}</span>
        </button>
      </div>

      <!-- 当前步骤详情 -->
      <div v-if="currentStepDetail" class="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-3">
        <!-- 步骤标题 -->
        <div class="flex items-center gap-3">
          <span class="text-2xl">{{ currentStepDetail.icon }}</span>
          <div class="flex-1">
            <h4 class="font-medium text-gray-900 dark:text-white">{{ currentStepDetail.name }}</h4>
            <p class="text-xs text-gray-500 dark:text-gray-400">{{ currentStepDetail.description }}</p>
          </div>
          <button
            v-if="currentStepDetail.deepQuestions?.length"
            class="px-2 py-1 text-xs rounded-lg border transition-colors"
            :class="showAdvanced ? 'bg-purple-100 border-purple-300 text-purple-700 dark:bg-purple-900/30 dark:border-purple-700 dark:text-purple-400' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'"
            @click="showAdvanced = !showAdvanced"
          >
            {{ showAdvanced ? '收起' : '高级' }}
          </button>
        </div>

        <!-- 问题提示 -->
        <div class="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <div class="flex items-center gap-2 mb-2">
            <AlertCircle class="w-4 h-4 text-amber-500" />
            <span class="text-xs font-medium text-amber-700 dark:text-amber-400">思考这些问题</span>
          </div>
          <ul class="space-y-1">
            <li v-for="(question, index) in currentStepDetail.questions" :key="index" class="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1">
              <span class="text-amber-500">•</span>
              {{ question }}
            </li>
          </ul>
        </div>

        <!-- 输入框 -->
        <div>
          <textarea
            v-model="currentStepValue"
            class="w-full h-24 p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500"
            :placeholder="`描述你的${currentStepDetail.name}...`"
          ></textarea>
          <div class="flex items-center justify-between mt-1">
            <span class="text-xs text-gray-400">{{ currentStepValue.length }} 字</span>
          </div>
        </div>

        <!-- 高级模式：步骤4 - 八条故事线 -->
        <div v-if="showAdvanced && currentStep === 4" class="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
          <div class="flex items-center gap-2 mb-3">
            <BookOpen class="w-4 h-4 text-indigo-500" />
            <span class="text-xs font-medium text-indigo-700 dark:text-indigo-400">八条故事线规划</span>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div v-for="line in eightStoryLines" :key="line.id" class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-300">{{ line.name }}</span>
              </div>
              <input
                type="text"
                v-model="storyLines[line.id as keyof typeof storyLines]"
                :placeholder="line.description"
                class="w-full px-2 py-1 text-xs rounded border bg-white dark:bg-gray-800 border-indigo-200 dark:border-indigo-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
          </div>
        </div>

        <!-- 高级模式：步骤5 - 爽点节奏公式 -->
        <div v-if="showAdvanced && currentStep === 5" class="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
          <div class="flex items-center gap-2 mb-3">
            <Zap class="w-4 h-4 text-orange-500" />
            <span class="text-xs font-medium text-orange-700 dark:text-orange-400">爽点节奏公式</span>
          </div>
          <div class="space-y-2">
            <div class="flex items-start gap-2">
              <span class="px-2 py-0.5 rounded text-xs font-medium bg-orange-100 dark:bg-orange-800 text-orange-700 dark:text-orange-300">微</span>
              <div class="text-xs text-orange-800 dark:text-orange-200">{{ coolPointFormulas.microPerChapter }}</div>
            </div>
            <div class="flex items-start gap-2">
              <span class="px-2 py-0.5 rounded text-xs font-medium bg-orange-100 dark:bg-orange-800 text-orange-700 dark:text-orange-300">冲</span>
              <div class="text-xs text-orange-800 dark:text-orange-200">{{ coolPointFormulas.conflictPerThreeChapters }}</div>
            </div>
            <div class="flex items-start gap-2">
              <span class="px-2 py-0.5 rounded text-xs font-medium bg-orange-100 dark:bg-orange-800 text-orange-700 dark:text-orange-300">大</span>
              <div class="text-xs text-orange-800 dark:text-orange-200">{{ coolPointFormulas.climaxPerSevenChapters }}</div>
            </div>
          </div>
        </div>

        <!-- 导航按钮 -->
        <div class="flex justify-between pt-2">
          <NButton v-if="currentStep > 1" quaternary size="small" @click="prevStep">上一步</NButton>
          <div v-else></div>
          <div class="flex gap-2">
            <NButton v-if="currentStep < 5" type="primary" size="small" @click="nextStep">
              下一步
              <ChevronRight class="w-4 h-4 ml-1" />
            </NButton>
          </div>
        </div>
      </div>

      <!-- 全部完成 -->
      <div v-if="allComplete" class="p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-200 dark:border-emerald-800">
        <div class="flex items-center gap-3">
          <Check class="w-6 h-6 text-emerald-500" />
          <div class="flex-1 mb-1">
            <h4 class="font-medium text-emerald-700 dark:text-emerald-400">五步大纲已完成</h4>
            <p class="text-xs text-emerald-600 dark:text-emerald-500">点击下方按钮，AI将根据你的设定生成完整大纲</p>
          </div>
        </div>
        <NButton type="success" class="mt-3 w-full" :loading="isGeneratingFiveStep" @click="generateFiveStepOutline">
          <Sparkles class="w-4 h-4 mr-2" />
          生成大纲
        </NButton>
      </div>

      <!-- 生成结果 -->
      <div v-if="fiveStepPrompt" class="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
        <div class="flex items-center gap-2 mb-2">
          <Eye class="w-4 h-4 text-gray-500" />
          <span class="text-xs font-medium text-gray-700 dark:text-gray-300">生成的提示词</span>
          <button class="ml-auto text-xs text-violet-600 hover:underline" @click="navigator.clipboard.writeText(fiveStepPrompt)">复制</button>
        </div>
        <pre class="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap max-h-60 overflow-y-auto">{{ fiveStepPrompt }}...</pre>
      </div>

      <!-- 重置按钮 -->
      <div class="flex justify-center">
        <NButton quaternary size="small" @click="resetFiveStep">
          <RotateCcw class="w-4 h-4 mr-1" />
          重置
        </NButton>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- 卷节拍表 -->
    <!-- ============================================================ -->
    <div v-if="activeTab === 'volume'" class="space-y-4">
      <div class="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-4">
        <h4 class="font-medium text-gray-900 dark:text-white">卷基本信息</h4>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs text-gray-500 mb-1">卷ID</label>
            <input v-model.number="volumeData.volumeId" type="number" min="1" class="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm" />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">题材</label>
            <input v-model="volumeData.genre" type="text" placeholder="如：玄幻、都市" class="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm" />
          </div>
        </div>

        <div>
          <label class="block text-xs text-gray-500 mb-1">卷标题</label>
          <input v-model="volumeData.volumeTitle" type="text" placeholder="如：青云宗之变" class="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm" />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs text-gray-500 mb-1">起始章节</label>
            <input v-model.number="volumeData.chapterStart" type="number" min="1" class="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm" />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">结束章节</label>
            <input v-model.number="volumeData.chapterEnd" type="number" min="1" class="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm" />
          </div>
        </div>

        <div>
          <label class="block text-xs text-gray-500 mb-1">核心冲突</label>
          <textarea v-model="volumeData.coreConflict" rows="2" placeholder="本卷的核心矛盾是什么？" class="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm resize-none"></textarea>
        </div>

        <div>
          <label class="block text-xs text-gray-500 mb-1">卷末高潮</label>
          <textarea v-model="volumeData.volumeClimax" rows="2" placeholder="本卷结尾的高潮场景" class="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm resize-none"></textarea>
        </div>

        <div>
          <label class="block text-xs text-gray-500 mb-1">上卷回顾（可选）</label>
          <textarea v-model="volumeData.previousVolumeSummary" rows="2" placeholder="上一卷的主要情节" class="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm resize-none"></textarea>
        </div>

        <div class="flex gap-2 pt-2">
          <NButton type="primary" :loading="isGeneratingBeat" @click="generateVolumeBeat">
            <Sparkles class="w-4 h-4 mr-1" />
            生成节拍表提示词
          </NButton>
          <NButton quaternary @click="resetVolume">
            <RotateCcw class="w-4 h-4" />
          </NButton>
        </div>
      </div>

      <!-- 生成结果 -->
      <div v-if="beatPrompt" class="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
        <div class="flex items-center gap-2 mb-2">
          <Eye class="w-4 h-4 text-gray-500" />
          <span class="text-xs font-medium text-gray-700 dark:text-gray-300">生成的提示词</span>
          <button class="ml-auto text-xs text-violet-600 hover:underline" @click="navigator.clipboard.writeText(beatPrompt)">复制</button>
        </div>
        <pre class="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap max-h-60 overflow-y-auto">{{ beatPrompt }}...</pre>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- 卷时间线 -->
    <!-- ============================================================ -->
    <div v-if="activeTab === 'timeline'" class="space-y-4">
      <div class="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-4">
        <h4 class="font-medium text-gray-900 dark:text-white">卷时间线设置</h4>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs text-gray-500 mb-1">卷ID</label>
            <input v-model.number="timelineData.volumeId" type="number" min="1" class="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm" />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">卷标题</label>
            <input v-model="timelineData.volumeTitle" type="text" class="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm" />
          </div>
        </div>

        <div>
          <label class="block text-xs text-gray-500 mb-1">时间基准</label>
          <input v-model="timelineData.baseline" type="text" placeholder="如：仙历3021年春" class="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm" />
        </div>

        <div class="flex items-center gap-2">
          <input v-model="timelineData.hasCountdown" type="checkbox" id="hasCountdown" class="w-4 h-4 rounded" />
          <label for="hasCountdown" class="text-sm text-gray-700 dark:text-gray-300">启用倒计时事件</label>
        </div>

        <div v-if="timelineData.hasCountdown" class="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
          <p class="text-xs text-yellow-700 dark:text-yellow-400 mb-2">倒计时事件列表</p>
          <div v-for="(event, index) in timelineData.countdownEvents" :key="index" class="flex gap-2 mb-2">
            <input v-model="event.event" type="text" placeholder="事件名" class="flex-1 px-2 py-1 text-xs rounded border" />
            <input v-model.number="event.targetChapter" type="number" placeholder="章节" class="w-16 px-2 py-1 text-xs rounded border" />
            <input v-model.number="event.daysRemaining" type="number" placeholder="剩余天数" class="w-24 px-2 py-1 text-xs rounded border" />
            <button class="text-red-500 hover:text-red-700" @click="timelineData.countdownEvents.splice(index, 1)">×</button>
          </div>
          <NButton size="tiny" @click="timelineData.countdownEvents.push({ event: '', targetChapter: 0, daysRemaining: 0 })">
            + 添加倒计时事件
          </NButton>
        </div>

        <div class="flex gap-2 pt-2">
          <NButton type="primary" :loading="isGeneratingTimeline" @click="generateTimeline">
            <Sparkles class="w-4 h-4 mr-1" />
            生成时间线提示词
          </NButton>
          <NButton quaternary @click="resetTimeline">
            <RotateCcw class="w-4 h-4" />
          </NButton>
        </div>
      </div>

      <!-- 生成结果 -->
      <div v-if="timelinePrompt" class="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
        <div class="flex items-center gap-2 mb-2">
          <Eye class="w-4 h-4 text-gray-500" />
          <span class="text-xs font-medium text-gray-700 dark:text-gray-300">生成的提示词</span>
          <button class="ml-auto text-xs text-violet-600 hover:underline" @click="navigator.clipboard.writeText(timelinePrompt)">复制</button>
        </div>
        <pre class="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap max-h-60 overflow-y-auto">{{ timelinePrompt }}...</pre>
      </div>
    </div>
  </div>
</template>

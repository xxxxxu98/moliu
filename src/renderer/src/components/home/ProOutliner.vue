<script setup lang="ts">
/**
 * ProOutliner - 专业大纲：五步大纲法 → expandDirection（与 QuickStart 同路径）
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
} from '@/data/five-step-outline';
import type { GeneratedOutline } from '@/types/inspiration';
import { useOutlineGenerator } from '@/composables/useOutlineGenerator';
import { useProjectCreator } from '@/composables/useProjectCreator';
import { mapExecutableOutlineToGeneratedOutline } from '@/services/outline/adapters/executable-outline-adapter';
import type { OutlineDirection } from '@/services/outline/types/direction';
import type { WritingTemplate } from './QuickStart.vue';
import {
  DEFAULT_WORD_COUNT_RANGE,
  WORD_COUNT_OPTIONS,
} from '@/services/ai/unified.service';

const props = defineProps<{
  importedTemplate?: WritingTemplate | null;
}>();

const { t } = useI18n();
const message = useMessage();
const projectStore = useProjectStore();
const settingsStore = useSettingsStore();

// 只解构实际用到的：expandDirection（生成）、generationError（错误展示）、
// outlineWarnings（软质量提示）。其余状态（isGenerating/progress/reset）原本
// 从未在模板或 script 中被引用，留着会触发 noUnusedLocals。
const {
  error: generationError,
  warnings: outlineWarnings,
  expandDirection,
} = useOutlineGenerator();

// 项目创建：五步法生成的大纲此前只存到本地 fiveStepResult，没有任何"应用到项目"出口，
// OutlineDisplay 也没渲染，等于生成了无处可用。这里接上 useProjectCreator，与
// InspirationPanel / QuickStart 走同一条 createProject 路径。
const {
  isCreating,
  error: projectCreateError,
  createProject: doCreateProject,
} = useProjectCreator();

// ============================================================
// 字数范围状态
// ============================================================
const wordCountRange = ref(DEFAULT_WORD_COUNT_RANGE);

// 与全局 WordCountSelector 共用同一份选项，避免专业大纲页字数档位脱节
const wordCountOptions = WORD_COUNT_OPTIONS.map((option) => ({
  label: option.label,
  value: option.value,
}));


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

// 导入模板的元数据上下文。
// 旧实现把这些元数据直接写进 stepData 的各步骤字段（emotionGoal/setting/...），
// 再用 length>=10 判定步骤完成 —— 结果占位文案让进度条假绿，且这些"模板参考"
// 文案会被拼成创意种子送进 prompt，污染模型输入。这里改为单独存储，仅作为
// 生成时的参考附在用户真实输入之后，不参与完成度判定。
const templateContext = ref<{
  name: string;
  description: string;
  coreFormula?: string;
  requiredElements?: string[];
  category?: string;
  rhythmAdvice?: string;
  structureTemplate?: string;
} | null>(null);

// Handle imported template from QuickStart
watch(
  () => props.importedTemplate,
  (template) => {
    if (template) {
      templateContext.value = {
        name: template.name,
        description: template.description,
        coreFormula: template.coreFormula,
        requiredElements: template.requiredElements,
        category: template.category,
        rhythmAdvice: template.rhythmAdvice,
        structureTemplate: template.structureTemplate,
      };

      message.success(`已导入模板「${template.name}」，请在下方填写你的创作方向后生成`);
    } else {
      templateContext.value = null;
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
// 注意：fiveStepData 此前是构造 OutlineFramework 喂给 buildMasterOutlinePrompt 的中间结构，
// 现在五步法已切换到 expandDirection 路径（与 QuickStart 一致），不再需要它。
// fiveStepResult 类型修正为 GeneratedOutline（此前是 StoryContract 与实际赋值不匹配）。
const fiveStepPrompt = ref('');
const fiveStepResult = ref<GeneratedOutline | null>(null);
const isGeneratingFiveStep = ref(false);


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
//
// 关键修复：此前调用 generateOutlines（默认 count=3 走多候选 Markdown 解析），
// 产出的 GeneratedOutline.chapters 只有 title/summary/keyEvents，完全没有
// CBN/CPNs/CEN/chapterType/hookType 等结构化字段——续写端精心做的位置兜底、
// 窗口化、策略注入在前 30 章一概拿不到数据。
// 现在切换到与 QuickStart 一致的 expandDirection 路径：
//   1. 把 5 步真实输入（含此前被丢弃的第 4/5 步）拼成 seed
//   2. 从 seed 合成一个 OutlineDirection（跳过"方向卡"那步 AI 调用，
//      直接用用户输入构造，省一次 API 调用）
//   3. expandDirection(seed, syntheticDirection) → ExecutableOutline
//   4. mapExecutableOutlineToGeneratedOutline → 带 CBN/CPNs/CEN 的 GeneratedOutline
async function generateFiveStepOutline() {
  if (!allComplete.value) {
    message.warning('请先完成所有步骤');
    return;
  }

  isGeneratingFiveStep.value = true;
  fiveStepResult.value = null;

  try {
    // 1. seed 必须包含全部 5 步用户输入。
    //    此前只拼了 emotionGoal/setting/protagonist 三步，第 4 步（结构）和第 5 步（爽点）
    //    被 UI 强制要求填满后直接丢弃，自相矛盾。现在全部纳入，并附上八条故事线/矛盾设计
    //    （用户在"高级"里填的）和模板元数据（仅作方向参考）。
    const seedParts: string[] = [
      `【情绪目标】\n${stepData.value.emotionGoal}`,
      `【世界观/背景设定】\n${stepData.value.setting}`,
      `【主角设定】\n${stepData.value.protagonist}`,
      `【故事结构】\n${stepData.value.structure}`,
      `【爽点/高潮设计】\n${stepData.value.pleasurePoints}`,
    ];

    const filledStoryLines = Object.entries(storyLines.value)
      .filter(([, v]) => v && v.trim())
      .map(([k, v]) => `- ${k}：${v}`);
    if (filledStoryLines.length > 0) {
      seedParts.push(`【八条故事线（用户补充）】\n${filledStoryLines.join('\n')}`);
    }

    if (conflictDesign.value.source || conflictDesign.value.majorConflicts.length > 0) {
      seedParts.push(`【矛盾设计（用户补充）】\n来源：${conflictDesign.value.source || '（未指定）'}\n主要冲突：${conflictDesign.value.majorConflicts.join('、') || '（未指定）'}`);
    }

    if (templateContext.value) {
      const tc = templateContext.value;
      const tcParts = [`模板：${tc.name}`, `描述：${tc.description}`];
      if (tc.coreFormula) tcParts.push(`核心公式：${tc.coreFormula}`);
      if (tc.requiredElements?.length) tcParts.push(`核心元素：${tc.requiredElements.join('、')}`);
      if (tc.rhythmAdvice) tcParts.push(`节奏建议：${tc.rhythmAdvice}`);
      if (tc.structureTemplate) tcParts.push(`结构模板：${tc.structureTemplate}`);
      seedParts.push(`【参考模板（仅作方向参考，以用户上述意图为准）】\n${tcParts.join('\n')}`);
    }


    const seed = seedParts.join('\n\n');

    // 2. 合成 OutlineDirection：把 5 步输入映射到方向卡的 11 个字段。
    //    不调用 generateDirections（省一次 API + 不暴露方向卡 UI），直接用用户意图构造。
    const direction: OutlineDirection = {
      id: `fivestep-${Date.now()}`,
      title: stepData.value.emotionGoal.slice(0, 20) || '五步法大纲',
      oneLiner: stepData.value.emotionGoal,
      premise: stepData.value.setting,
      protagonistArc: stepData.value.protagonist,
      coreConflict: conflictDesign.value.source
        || (conflictDesign.value.majorConflicts[0] as string | undefined)
        || '见用户输入',
      coolPointStyle: stepData.value.pleasurePoints
        ? stepData.value.pleasurePoints.split(/[，,。；;\n]/).map((s) => s.trim()).filter(Boolean)
        : [],
      targetEmotions: stepData.value.emotionGoal
        ? stepData.value.emotionGoal.split(/[，,。；;\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 3)
        : [],
      riskNotes: [],
      recommendationScore: 100, // 用户自选，不参与排序
      recommendedReason: '用户通过五步大纲法手工设定',
      longformCapacityNote: stepData.value.structure || undefined,
    };

    // 展示用的合成 prompt（仅供 UI 复制/调试，不再参与生成）
    fiveStepPrompt.value = `【合成种子】\n${seed}\n\n【合成方向卡】\n${JSON.stringify(direction, null, 2)}`;

    // 3. 调用 expandDirection（与 QuickStart 同一路径）
    const executable = await expandDirection(seed, direction, {
      wordCountRange: wordCountRange.value,
      temperature: 0.7,
    });

    // 4. 转 GeneratedOutline（带 CBN/CPNs/CEN/chapterType 等结构化字段）
    if (executable) {
      fiveStepResult.value = mapExecutableOutlineToGeneratedOutline(executable, {
        targetWordCountRange: wordCountRange.value,
      });
      // 软质量警告（审查回退/补全失败等）：不阻塞应用，但让用户知道成品有已知瑕疵
      if (outlineWarnings.value.length > 0) {
        message.warning(
          `大纲已生成，但有 ${outlineWarnings.value.length} 条质量提示：${outlineWarnings.value[0].slice(0, 80)}`,
        );
      }
      message.success('大纲生成成功，可点击下方"创建项目"应用');
    } else {
      message.error(generationError.value || '大纲生成失败，请重试');
    }
  } catch (error) {
    message.error('生成失败: ' + (error as Error).message);
  } finally {
    isGeneratingFiveStep.value = false;
  }
}

// ============================================================
// 应用五步法大纲到项目
// ============================================================
async function applyFiveStepOutline() {
  if (!fiveStepResult.value) {
    message.warning('请先生成大纲');
    return;
  }

  try {
    // 类型已是 GeneratedOutline，无需强转（此前是 as GeneratedOutline，
    // 但 fiveStepResult 声明为 StoryContract，运行时其实是 GeneratedOutline，纯靠 any 凑合）。
    const projectId = await doCreateProject(fiveStepResult.value);
    if (projectId) {
      message.success('项目创建成功，正在跳转…');
    } else {
      message.error(projectCreateError.value || '项目创建失败');
    }
  } catch (error) {
    message.error('创建项目失败: ' + (error as Error).message);
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
          <p class="text-xs text-gray-500 dark:text-gray-400">五步大纲法</p>
        </div>
      </div>
    </div>


    <!-- ============================================================ -->
    <!-- 五步大纲法 -->
    <!-- ============================================================ -->
    <div class="space-y-4">
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

      <!-- 字数范围选择器 -->
      <div class="p-3 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-violet-700 dark:text-violet-400">目标字数</span>
          </div>
          <div class="flex-1">
            <select
              v-model="wordCountRange"
              class="w-full px-3 py-1.5 text-sm rounded-lg bg-white dark:bg-gray-800 border border-violet-200 dark:border-violet-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            >
              <option v-for="opt in wordCountOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
        </div>
        <p class="text-xs text-violet-600 dark:text-violet-400 mt-2">
          字数范围将影响大纲的章节规划、爽点数量和情绪高点设置
        </p>
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

      <!-- 创建项目出口：生成成功后把大纲落地为新项目（与 InspirationPanel/QuickStart 同路径） -->
      <div v-if="fiveStepResult" class="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800">
        <div class="flex items-center gap-3">
          <Check class="w-6 h-6 text-blue-500" />
          <div class="flex-1 mb-1">
            <h4 class="font-medium text-blue-700 dark:text-blue-400">大纲已就绪</h4>
            <p class="text-xs text-blue-600 dark:text-blue-500">点击下方按钮，把这份大纲应用为新项目并进入编辑器</p>
          </div>
        </div>
        <NButton type="primary" class="mt-3 w-full" :loading="isCreating" @click="applyFiveStepOutline">
          <ArrowRight class="w-4 h-4 mr-2" />
          创建项目
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

  </div>
</template>

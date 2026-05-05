<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { 
  CheckCircle, 
  Circle, 
  ChevronRight, 
  Lightbulb,
  AlertCircle,
  Sparkles,
  Target,
  BookOpen,
  User,
  Layers,
  Zap
} from 'lucide-vue-next';
import { NButton, NCollapse, NCollapseItem, NTag } from 'naive-ui';
import { 
  fiveStepOutline, 
  getStepDetails,
  getEightStoryLines,
  getConflictEscalation,
  getCoolPointFormulas,
  type FiveStepProgress,
  type OutlineStep,
  isAllStepsComplete,
  getProgressPercentage
} from '@/data/five-step-outline';

const props = defineProps<{
  modelValue: Partial<{
    emotionGoal: string;
    setting: string;
    protagonist: string;
    structure: string;
    pleasurePoints: string;
    // 扩展字段
    storyLines?: {
      map: string;
      faction: string;
      character: string;
      goldenfinger: string;
      worldRules: string;
      conflict: string;
      collection: string;
      romance: string;
    };
    conflictDesign?: {
      source: string;
      escalation: string[];
      majorConflicts: string[];
    };
  }>;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: typeof props.modelValue): void;
  (e: 'complete'): void;
}>();

// 状态
const currentStep = ref(1);
const isExpanded = ref(true);
const showAdvanced = ref(false); // 显示高级提示

// 各步骤的数据
const stepData = ref({
  emotionGoal: props.modelValue.emotionGoal || '',
  setting: props.modelValue.setting || '',
  protagonist: props.modelValue.protagonist || '',
  structure: props.modelValue.structure || '',
  pleasurePoints: props.modelValue.pleasurePoints || '',
});

// 扩展数据
const storyLines = ref(props.modelValue.storyLines || {
  map: '',
  faction: '',
  character: '',
  goldenfinger: '',
  worldRules: '',
  conflict: '',
  collection: '',
  romance: ''
});

const conflictDesign = ref(props.modelValue.conflictDesign || {
  source: '',
  escalation: [],
  majorConflicts: []
});

// 进度状态
const progress = computed<FiveStepProgress>(() => ({
  step1Complete: stepData.value.emotionGoal.length >= 10,
  step2Complete: stepData.value.setting.length >= 10,
  step3Complete: stepData.value.protagonist.length >= 10,
  step4Complete: stepData.value.structure.length >= 10,
  step5Complete: stepData.value.pleasurePoints.length >= 10,
}));

// 总进度
const progressPercent = computed(() => getProgressPercentage(progress.value));

// 是否全部完成
const allComplete = computed(() => isAllStepsComplete(progress.value));

// 当前步骤详情
const currentStepDetail = computed(() => getStepDetails(currentStep.value));

// 获取辅助数据
const eightStoryLines = computed(() => getEightStoryLines());
const conflictEscalation = computed(() => getConflictEscalation());
const coolPointFormulas = computed(() => getCoolPointFormulas());

// 步骤完成状态
const stepsComplete = computed(() => [
  progress.value.step1Complete,
  progress.value.step2Complete,
  progress.value.step3Complete,
  progress.value.step4Complete,
  progress.value.step5Complete,
]);

// 获取当前步骤的深度问题
const currentStepDeepQuestions = computed(() => {
  return currentStepDetail.value?.deepQuestions || [];
});

// 获取当前步骤的关键指标
const currentStepKeyMetrics = computed(() => {
  return currentStepDetail.value?.keyMetrics || [];
});

// 获取当前步骤的常见错误
const currentStepCommonMistakes = computed(() => {
  return currentStepDetail.value?.commonMistakes || [];
});

// 更新数据
function updateData(field: keyof typeof stepData.value, value: string) {
  stepData.value[field] = value;
  emitFullUpdate();
}

// 更新扩展数据
function updateStoryLine(key: keyof typeof storyLines.value, value: string) {
  storyLines.value[key] = value;
  emitFullUpdate();
}

function updateConflictDesign(field: keyof typeof conflictDesign.value, value: any) {
  if (field === 'escalation' || field === 'majorConflicts') {
    conflictDesign.value[field] = value;
  } else {
    conflictDesign.value[field] = value;
  }
  emitFullUpdate();
}

function emitFullUpdate() {
  emit('update:modelValue', { 
    ...stepData.value,
    storyLines: storyLines.value,
    conflictDesign: conflictDesign.value
  });
}

// 切换步骤
function goToStep(step: number) {
  currentStep.value = step;
}

// 上一步
function prevStep() {
  if (currentStep.value > 1) {
    currentStep.value--;
  }
}

// 下一步
function nextStep() {
  if (currentStep.value < 5) {
    currentStep.value++;
  }
}

// 完成
function handleComplete() {
  emitFullUpdate();
  emit('complete');
}

// 监听数据变化
watch(stepData, (newData) => {
  emitFullUpdate();
}, { deep: true });

// 获取步骤图标
function getStepIcon(step: OutlineStep) {
  const icons: Record<number, any> = {
    1: Target,    // 情绪目标
    2: Layers,     // 核心设定
    3: User,       // 主角设定
    4: BookOpen,   // 故事结构
    5: Zap         // 爽点安排
  };
  return icons[step.id] || Sparkles;
}

// 深度问题颜色映射
function getQuestionColor(index: number): string {
  const colors = ['text-amber-700', 'text-amber-600', 'text-amber-500', 'text-amber-400'];
  return colors[index % colors.length];
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
          <Sparkles class="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 class="font-semibold text-gray-900 dark:text-white">五步大纲法</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400">系统化构建小说大纲</p>
        </div>
      </div>
      
      <!-- 进度 -->
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <div class="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div 
              class="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
              :style="{ width: `${progressPercent}%` }"
            ></div>
          </div>
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ progressPercent }}%</span>
        </div>
        <button
          class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          @click="isExpanded = !isExpanded"
        >
          <ChevronRight 
            class="w-4 h-4 text-gray-400 transition-transform duration-200"
            :class="{ 'rotate-90': isExpanded }"
          />
        </button>
      </div>
    </div>

    <!-- 展开内容 -->
    <div v-if="isExpanded" class="space-y-4">
      <!-- 步骤指示器 -->
      <div class="flex items-center gap-2 flex-wrap">
        <button
          v-for="step in fiveStepOutline"
          :key="step.id"
          class="flex-1 flex items-center gap-2 p-2 rounded-lg transition-all"
          :class="[
            currentStep === step.id 
              ? 'bg-indigo-50 dark:bg-indigo-900/30 ring-2 ring-indigo-500/50' 
              : stepsComplete[step.id - 1]
                ? 'bg-emerald-50 dark:bg-emerald-900/30'
                : 'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800'
          ]"
          @click="goToStep(step.id)"
        >
          <CheckCircle 
            v-if="stepsComplete[step.id - 1]" 
            class="w-4 h-4 text-emerald-500 flex-shrink-0" 
          />
          <Circle 
            v-else 
            class="w-4 h-4 text-gray-400 flex-shrink-0" 
            :class="{ 'text-indigo-500': currentStep === step.id }"
          />
          <span 
            class="text-xs font-medium truncate"
            :class="[
              currentStep === step.id 
                ? 'text-indigo-700 dark:text-indigo-400' 
                : 'text-gray-600 dark:text-gray-400'
            ]"
          >
            {{ step.name }}
          </span>
        </button>
      </div>

      <!-- 当前步骤详情 -->
      <div 
        v-if="currentStepDetail"
        class="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-3"
      >
        <!-- 步骤标题 -->
        <div class="flex items-center gap-3">
          <span class="text-2xl">{{ currentStepDetail.icon }}</span>
          <div class="flex-1">
            <h4 class="font-medium text-gray-900 dark:text-white">{{ currentStepDetail.name }}</h4>
            <p class="text-xs text-gray-500 dark:text-gray-400">{{ currentStepDetail.description }}</p>
          </div>
          <!-- 切换高级模式 -->
          <button
            v-if="currentStepDetail.deepQuestions?.length"
            class="px-2 py-1 text-xs rounded-lg border transition-colors"
            :class="showAdvanced ? 'bg-purple-100 border-purple-300 text-purple-700 dark:bg-purple-900/30 dark:border-purple-700 dark:text-purple-400' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'"
            @click="showAdvanced = !showAdvanced"
          >
            {{ showAdvanced ? '收起高级' : '高级模式' }}
          </button>
        </div>

        <!-- 深度问题（高级模式） -->
        <div v-if="showAdvanced && currentStepDeepQuestions.length" class="p-3 rounded-lg bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800">
          <div class="flex items-center gap-2 mb-2">
            <Target class="w-4 h-4 text-purple-500" />
            <span class="text-xs font-medium text-purple-700 dark:text-purple-400">深度思考问题</span>
          </div>
          <ul class="space-y-2">
            <li 
              v-for="(question, index) in currentStepDeepQuestions" 
              :key="index"
              class="text-xs text-purple-800 dark:text-purple-300 flex items-start gap-2"
            >
              <span class="text-purple-500 font-medium">{{ index + 1 }}.</span>
              {{ question }}
            </li>
          </ul>
        </div>

        <!-- 问题提示 -->
        <div class="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <div class="flex items-center gap-2 mb-2">
            <Lightbulb class="w-4 h-4 text-amber-500" />
            <span class="text-xs font-medium text-amber-700 dark:text-amber-400">思考这些问题</span>
          </div>
          <ul class="space-y-1">
            <li 
              v-for="(question, index) in currentStepDetail.questions" 
              :key="index"
              class="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1"
            >
              <span class="text-amber-500">•</span>
              {{ question }}
            </li>
          </ul>
        </div>

        <!-- 输入框 -->
        <div>
          <textarea
            v-model="stepData[currentStep === 1 ? 'emotionGoal' : currentStep === 2 ? 'setting' : currentStep === 3 ? 'protagonist' : currentStep === 4 ? 'structure' : 'pleasurePoints']"
            class="w-full h-28 p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
            :placeholder="`描述你的${currentStepDetail.name}...`"
          ></textarea>
          <div class="flex items-center justify-between mt-1">
            <span class="text-xs text-gray-400">
              {{ (stepData[currentStep === 1 ? 'emotionGoal' : currentStep === 2 ? 'setting' : currentStep === 3 ? 'protagonist' : currentStep === 4 ? 'structure' : 'pleasurePoints'] as string).length }} 字
            </span>
            <span 
              v-if="(stepData[currentStep === 1 ? 'emotionGoal' : currentStep === 2 ? 'setting' : currentStep === 3 ? 'protagonist' : currentStep === 4 ? 'structure' : 'pleasurePoints'] as string).length < 10"
              class="text-xs text-amber-500 flex items-center gap-1"
            >
              <AlertCircle class="w-3 h-3" />
              至少10字
            </span>
          </div>
        </div>

        <!-- 高级模式：关键指标 -->
        <div v-if="showAdvanced && currentStepKeyMetrics.length" class="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <div class="flex items-center gap-2 mb-2">
            <Zap class="w-4 h-4 text-green-500" />
            <span class="text-xs font-medium text-green-700 dark:text-green-400">关键质量指标</span>
          </div>
          <div class="flex flex-wrap gap-2">
            <NTag 
              v-for="(metric, index) in currentStepKeyMetrics" 
              :key="index"
              size="small" 
              type="success"
              round
            >
              {{ metric }}
            </NTag>
          </div>
        </div>

        <!-- 小贴士 -->
        <div class="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <div class="flex items-center gap-2 mb-2">
            <Sparkles class="w-4 h-4 text-blue-500" />
            <span class="text-xs font-medium text-blue-700 dark:text-blue-400">写作小贴士</span>
          </div>
          <ul class="space-y-1">
            <li 
              v-for="(tip, index) in currentStepDetail.tips" 
              :key="index"
              class="text-xs text-blue-800 dark:text-blue-300 flex items-start gap-1"
            >
              <span class="text-blue-500">•</span>
              {{ tip }}
            </li>
          </ul>
        </div>

        <!-- 高级模式：常见错误 -->
        <div v-if="showAdvanced && currentStepCommonMistakes.length" class="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <div class="flex items-center gap-2 mb-2">
            <AlertCircle class="w-4 h-4 text-red-500" />
            <span class="text-xs font-medium text-red-700 dark:text-red-400">常见错误（避免）</span>
          </div>
          <ul class="space-y-1">
            <li 
              v-for="(mistake, index) in currentStepCommonMistakes" 
              :key="index"
              class="text-xs text-red-800 dark:text-red-300 flex items-start gap-1"
            >
              <span class="text-red-500">✗</span>
              {{ mistake }}
            </li>
          </ul>
        </div>

        <!-- 示例 -->
        <div>
          <span class="text-xs text-gray-500 dark:text-gray-400 mb-2 block">示例参考：</span>
          <div class="flex flex-wrap gap-2">
            <span 
              v-for="(example, index) in currentStepDetail.examples" 
              :key="index"
              class="px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-400"
            >
              {{ example }}
            </span>
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
                :value="storyLines[line.id as keyof typeof storyLines]"
                @input="(e) => updateStoryLine(line.id as keyof typeof storyLines, (e.target as HTMLInputElement).value)"
                :placeholder="line.description"
                class="w-full px-2 py-1 text-xs rounded border bg-white dark:bg-gray-800 border-indigo-200 dark:border-indigo-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <div class="text-xs text-indigo-600 dark:text-indigo-400">{{ line.burialTiming }}</div>
            </div>
          </div>
        </div>

        <!-- 高级模式：步骤4 - 矛盾递进 -->
        <div v-if="showAdvanced && currentStep === 4" class="p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
          <div class="flex items-center gap-2 mb-3">
            <AlertCircle class="w-4 h-4 text-rose-500" />
            <span class="text-xs font-medium text-rose-700 dark:text-rose-400">矛盾四重递进</span>
          </div>
          <div class="space-y-2">
            <div v-for="level in conflictEscalation" :key="level.level" class="flex items-start gap-2">
              <span class="px-2 py-0.5 rounded text-xs font-medium bg-rose-100 dark:bg-rose-800 text-rose-700 dark:text-rose-300 flex-shrink-0">{{ level.level }}级</span>
              <div class="flex-1">
                <div class="text-xs font-medium text-rose-800 dark:text-rose-200">{{ level.name }}</div>
                <div class="text-xs text-rose-600 dark:text-rose-400">{{ level.description }}</div>
              </div>
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
            <div class="flex items-start gap-2">
              <span class="px-2 py-0.5 rounded text-xs font-medium bg-orange-100 dark:bg-orange-800 text-orange-700 dark:text-orange-300">拉</span>
              <div class="text-xs text-orange-800 dark:text-orange-200">{{ coolPointFormulas.emotionalPull }}</div>
            </div>
            <div class="flex items-start gap-2">
              <span class="px-2 py-0.5 rounded text-xs font-medium bg-orange-100 dark:bg-orange-800 text-orange-700 dark:text-orange-300">格</span>
              <div class="text-xs text-orange-800 dark:text-orange-200">{{ coolPointFormulas.bage }}</div>
            </div>
          </div>
        </div>

        <!-- 导航按钮 -->
        <div class="flex justify-between pt-2">
          <NButton
            v-if="currentStep > 1"
            quaternary
            size="small"
            @click="prevStep"
          >
            上一步
          </NButton>
          <div v-else></div>
          
          <div class="flex gap-2">
            <NButton
              v-if="currentStep < 5"
              type="primary"
              size="small"
              @click="nextStep"
            >
              下一步
              <ChevronRight class="w-4 h-4 ml-1" />
            </NButton>
            <NButton
              v-else-if="allComplete"
              type="success"
              size="small"
              @click="handleComplete"
            >
              <Sparkles class="w-4 h-4 mr-1" />
              生成大纲
            </NButton>
          </div>
        </div>
      </div>

      <!-- 全部完成提示 -->
      <div 
        v-if="allComplete"
        class="p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-200 dark:border-emerald-800"
      >
        <div class="flex items-center gap-3">
          <CheckCircle class="w-6 h-6 text-emerald-500" />
          <div class="flex-1 mb-1">
            <h4 class="font-medium text-emerald-700 dark:text-emerald-400">五步大纲已完成</h4>
            <p class="text-xs text-emerald-600 dark:text-emerald-500">点击下方按钮，AI将根据你的设定生成完整大纲</p>
          </div>
        </div>
        <NButton
          type="success"
          class="mt-3 w-full"
          @click="handleComplete"
        >
          <Sparkles class="w-4 h-4 mr-2" />
          生成完整大纲
        </NButton>
      </div>
    </div>
  </div>
</template>

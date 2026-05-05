<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { 
  CheckCircle, 
  Circle, 
  ChevronRight, 
  Lightbulb,
  AlertCircle,
  Sparkles
} from 'lucide-vue-next';
import { NButton } from 'naive-ui';
import { 
  fiveStepOutline, 
  getStepDetails,
  type FiveStepProgress,
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
  }>;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: typeof props.modelValue): void;
  (e: 'complete'): void;
}>();

// 状态
const currentStep = ref(1);
const isExpanded = ref(true);

// 各步骤的数据
const stepData = ref({
  emotionGoal: props.modelValue.emotionGoal || '',
  setting: props.modelValue.setting || '',
  protagonist: props.modelValue.protagonist || '',
  structure: props.modelValue.structure || '',
  pleasurePoints: props.modelValue.pleasurePoints || '',
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

// 步骤完成状态
const stepsComplete = computed(() => [
  progress.value.step1Complete,
  progress.value.step2Complete,
  progress.value.step3Complete,
  progress.value.step4Complete,
  progress.value.step5Complete,
]);

// 更新数据
function updateData(field: keyof typeof stepData.value, value: string) {
  stepData.value[field] = value;
  emit('update:modelValue', { ...stepData.value });
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
  emit('update:modelValue', { ...stepData.value });
  emit('complete');
}

// 监听数据变化
watch(stepData, (newData) => {
  emit('update:modelValue', { ...newData });
}, { deep: true });
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
          <div>
            <h4 class="font-medium text-gray-900 dark:text-white">{{ currentStepDetail.name }}</h4>
            <p class="text-xs text-gray-500 dark:text-gray-400">{{ currentStepDetail.description }}</p>
          </div>
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

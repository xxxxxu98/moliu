<script setup lang="ts">
/**
 * 写作前准备向导组件
 * 引导用户在开始写作前完善设定
 */
import { ref, computed, watch } from "vue";
import {
  NModal,
  NButton,
  NSteps,
  NStep,
  NCard,
  NCheckbox,
  NCheckboxGroup,
  NInput,
  NSlider,
  useMessage,
} from "naive-ui";
import {
  Check,
  BookOpen,
  Users,
  Globe,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Wand2,
} from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { useProjectStore } from "@/stores/project.store";
import { useChapterOutlineGenerator } from "@/composables/useChapterOutlineGenerator";

const { t } = useI18n();
const message = useMessage();

// Props
const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
  (e: "complete"): void;
  (e: "skip"): void;
}>();

// 步骤
const currentStep = ref(0);
const steps = [
  { title: "角色确认", icon: Users },
  { title: "世界观确认", icon: Globe },
  { title: "写作风格", icon: Sparkles },
  { title: "目标设定", icon: BookOpen },
];

// 角色确认
const confirmedCharacters = ref<string[]>([]);
const projectStore = useProjectStore();
const project = computed(() => projectStore.currentProject);
const characters = computed(() => project.value?.characters || []);

// 世界观确认
const confirmedWorldSetting = ref(true);
const worldLocations = computed(() => project.value?.worldSchema?.locations || []);
const worldRules = computed(() => project.value?.worldSchema?.rules || []);
const worldFactions = computed(() => project.value?.worldSchema?.factions || []);

// 写作风格
const writingStyle = ref<"concise" | "elegant" | "humorous" | "ancient">("concise");
const customStyleDesc = ref("");

// 目标设定
const targetChapters = ref(50);
const wordsPerChapter = ref(3000);

// 章节目录生成
const {
  isGenerating,
  error,
  generatedChapters,
  generateOutlines,
  applyOutlines,
  createChapters,
} = useChapterOutlineGenerator();

const isGeneratingChapters = ref(false);
const showChapterPreview = ref(false);

// 计算目标
const totalTargetWords = computed(() => targetChapters.value * wordsPerChapter.value);

function formatWordCount(count: number): string {
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}万`;
  }
  return count.toLocaleString();
}

// 关闭
function handleClose() {
  emit("update:show", false);
}

// 跳过
function handleSkip() {
  emit("update:show", false);
  emit("skip");
}

// 下一步
function handleNext() {
  if (currentStep.value < steps.length - 1) {
    currentStep.value++;
  }
}

// 上一步
function handlePrev() {
  if (currentStep.value > 0) {
    currentStep.value--;
  }
}

// 生成章节目录
async function handleGenerateChapters() {
  isGeneratingChapters.value = true;
  showChapterPreview.value = true;

  try {
    const chapters = await generateOutlines({
      chapterCount: targetChapters.value,
      wordsPerChapter: wordsPerChapter.value,
      style: writingStyle.value,
    });

    if (chapters && chapters.length > 0) {
      message.success(`成功生成 ${chapters.length} 个章节大纲`);
    }
  } catch (err) {
    message.error("生成章节目录失败");
  } finally {
    isGeneratingChapters.value = false;
  }
}

// 完成
async function handleComplete() {
  if (showChapterPreview.value && generatedChapters.value.length > 0) {
    try {
      // 应用大纲
      await applyOutlines(generatedChapters.value);

      // 创建章节
      const chapterIds = await createChapters(generatedChapters.value);

      if (chapterIds.length > 0) {
        message.success(`成功创建 ${chapterIds.length} 个章节`);
      }
    } catch (err) {
      message.error("创建章节失败");
    }
  }

  emit("update:show", false);
  emit("complete");
}

// 重置向导状态
watch(() => props.show, (show) => {
  if (show) {
    currentStep.value = 0;
    showChapterPreview.value = false;
    confirmedCharacters.value = characters.value.map(c => c.id);
  }
});
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :style="{ width: '700px', maxHeight: '80vh' }"
    :mask-closable="false"
    @update:show="(val) => emit('update:show', val)"
  >
    <template #header>
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
          <Wand2 class="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 class="font-semibold text-gray-900 dark:text-white">写作前准备</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400">完善设定，让 AI 更好地理解你的小说</p>
        </div>
      </div>
    </template>

    <div class="py-4">
      <!-- 步骤指示器 -->
      <NSteps :current="currentStep" class="mb-6">
        <NStep
          v-for="(step, index) in steps"
          :key="index"
          :title="step.title"
        />
      </NSteps>

      <!-- Step 1: 角色确认 -->
      <div v-show="currentStep === 0">
        <h4 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">确认核心角色</h4>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
          请勾选将在第一章出场的角色，这有助于 AI 更好地理解人物关系和性格。
        </p>

        <div v-if="characters.length > 0" class="space-y-2">
          <div
            v-for="char in characters"
            :key="char.id"
            class="flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer"
            :class="[
              confirmedCharacters.includes(char.id)
                ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-700'
            ]"
            @click="confirmedCharacters.includes(char.id) ? confirmedCharacters = confirmedCharacters.filter(id => id !== char.id) : confirmedCharacters.push(char.id)"
          >
            <div
              class="w-5 h-5 rounded border-2 flex items-center justify-center transition-all"
              :class="[
                confirmedCharacters.includes(char.id)
                  ? 'bg-indigo-500 border-indigo-500'
                  : 'border-gray-300 dark:border-gray-600'
              ]"
            >
              <Check v-if="confirmedCharacters.includes(char.id)" class="w-3 h-3 text-white" />
            </div>
            <div class="flex-1">
              <div class="font-medium text-gray-900 dark:text-white">{{ char.name }}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">{{ char.role }}</div>
            </div>
            <NTag v-if="char.role.includes('主角') || char.role.includes('男主') || char.role.includes('女主')" type="warning" size="small">主角</NTag>
          </div>
        </div>

        <div v-else class="text-center py-8">
          <Users class="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p class="text-sm text-gray-500 dark:text-gray-400">暂无角色设定</p>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">请先在角色面板中添加角色</p>
        </div>
      </div>

      <!-- Step 2: 世界观确认 -->
      <div v-show="currentStep === 1">
        <h4 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">确认世界观设定</h4>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
          确认小说中的世界观设定是否完整，这将帮助 AI 保持写作一致性。
        </p>

        <div class="space-y-4">
          <!-- 地点 -->
          <div v-if="worldLocations.length > 0">
            <div class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">地点设定</div>
            <div class="flex flex-wrap gap-2">
              <NTag v-for="loc in worldLocations" :key="loc.id" type="info">
                {{ loc.name }}
              </NTag>
            </div>
          </div>

          <!-- 规则 -->
          <div v-if="worldRules.length > 0">
            <div class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">规则/体系</div>
            <div class="flex flex-wrap gap-2">
              <NTag v-for="rule in worldRules" :key="rule.id" type="warning">
                {{ rule.name }}
              </NTag>
            </div>
          </div>

          <!-- 势力 -->
          <div v-if="worldFactions.length > 0">
            <div class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">势力/门派</div>
            <div class="flex flex-wrap gap-2">
              <NTag v-for="faction in worldFactions" :key="faction.id" type="error">
                {{ faction.name }}
              </NTag>
            </div>
          </div>

          <!-- 全选确认 -->
          <div class="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
            <NCheckbox v-model:checked="confirmedWorldSetting">
              <span class="text-sm text-gray-700 dark:text-gray-300">世界观设定已完善，可以开始写作</span>
            </NCheckbox>
          </div>
        </div>
      </div>

      <!-- Step 3: 写作风格 -->
      <div v-show="currentStep === 2">
        <h4 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">选择写作风格</h4>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
          选择你喜欢的写作风格，这将影响 AI 生成内容的文风。
        </p>

        <div class="grid grid-cols-2 gap-3">
          <button
            v-for="style in [
              { value: 'concise', label: '简洁有力', desc: '惜字如金，描写精准' },
              { value: 'elegant', label: '文笔华丽', desc: '辞藻优美，意境深远' },
              { value: 'humorous', label: '幽默风趣', desc: '轻松诙谐，妙语连珠' },
              { value: 'ancient', label: '古风典雅', desc: '用词典雅，韵味悠长' },
            ]"
            :key="style.value"
            class="p-4 rounded-xl border-2 text-left transition-all"
            :class="[
              writingStyle === style.value
                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-700'
            ]"
            @click="writingStyle = style.value as any"
          >
            <div class="font-semibold text-gray-900 dark:text-white mb-1">{{ style.label }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">{{ style.desc }}</div>
          </button>
        </div>

        <div class="mt-4">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">自定义风格描述（可选）</label>
          <NInput
            v-model:value="customStyleDesc"
            type="textarea"
            :rows="2"
            placeholder="例如：注重心理描写，角色内心戏要多一些..."
          />
        </div>
      </div>

      <!-- Step 4: 目标设定 -->
      <div v-show="currentStep === 3">
        <h4 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">设定写作目标</h4>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
          设定你的写作目标，系统将自动生成章节目录。
        </p>

        <div class="space-y-6">
          <!-- 章节数量 -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">目标章节数</span>
              <span class="text-sm text-indigo-600 dark:text-indigo-400 font-semibold">{{ targetChapters }} 章</span>
            </div>
            <NSlider
              v-model:value="targetChapters"
              :min="10"
              :max="200"
              :step="5"
            />
          </div>

          <!-- 每章字数 -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">每章目标字数</span>
              <span class="text-sm text-indigo-600 dark:text-indigo-400 font-semibold">{{ formatWordCount(wordsPerChapter) }} 字</span>
            </div>
            <NSlider
              v-model:value="wordsPerChapter"
              :min="1000"
              :max="8000"
              :step="500"
            />
          </div>

          <!-- 总目标 -->
          <div class="p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-100 dark:border-indigo-800/50">
            <div class="text-center">
              <div class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {{ formatWordCount(totalTargetWords) }}
              </div>
              <div class="text-sm text-gray-500 dark:text-gray-400">目标总字数</div>
            </div>
          </div>

          <!-- 生成章节目录选项 -->
          <div class="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
            <NCheckbox v-model:checked="showChapterPreview">
              <span class="text-sm text-gray-700 dark:text-gray-300">生成章节目录</span>
            </NCheckbox>
            <span class="text-xs text-gray-500 dark:text-gray-400">
              自动根据你的大纲生成详细章节目录
            </span>
          </div>
        </div>
      </div>

      <!-- 章节预览 -->
      <div v-if="showChapterPreview && generatedChapters.length > 0" class="mt-6">
        <h4 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">生成的章节目录</h4>
        <div class="max-h-60 overflow-y-auto space-y-2">
          <div
            v-for="(chapter, index) in generatedChapters.slice(0, 10)"
            :key="index"
            class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
          >
            <div class="font-medium text-sm text-gray-900 dark:text-white">{{ chapter.title }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{{ chapter.outline }}</div>
          </div>
          <div v-if="generatedChapters.length > 10" class="text-center text-sm text-gray-500 dark:text-gray-400 py-2">
            还有 {{ generatedChapters.length - 10 }} 个章节...
          </div>
        </div>
      </div>

      <!-- 加载状态 -->
      <div v-if="isGeneratingChapters" class="mt-6 text-center py-4">
        <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400">
          <div class="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
          <span>正在生成章节目录...</span>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <NButton @click="handleSkip">跳过向导</NButton>
          <NButton v-if="currentStep === 3 && showChapterPreview && generatedChapters.length === 0" type="primary" :loading="isGeneratingChapters" @click="handleGenerateChapters">
            生成章节目录
          </NButton>
        </div>
        <div class="flex items-center gap-2">
          <NButton v-if="currentStep > 0" @click="handlePrev">
            <ChevronLeft class="w-4 h-4 mr-1" />
            上一步
          </NButton>
          <NButton v-if="currentStep < steps.length - 1" type="primary" @click="handleNext">
            下一步
            <ChevronRight class="w-4 h-4 ml-1" />
          </NButton>
          <NButton v-if="currentStep === steps.length - 1" type="primary" @click="handleComplete">
            {{ showChapterPreview && generatedChapters.length > 0 ? '开始写作' : '直接开始写作' }}
          </NButton>
        </div>
      </div>
    </template>
  </NModal>
</template>

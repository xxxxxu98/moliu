<script setup lang="ts">
import { ref, computed } from 'vue';
import { 
  Sparkles, 
  RefreshCw, 
  Check, 
  X, 
  AlertCircle,
  ChevronDown,
  Copy,
  Wand2,
  Loader2
} from 'lucide-vue-next';
import { NButton, NModal, useMessage } from 'naive-ui';
import { 检测AI味, 去AI味润色, 批量去AI味润色, type AI味检测报告, type AI味问题 } from '@/composables/useDeAIPolish';

const props = defineProps<{
  content: string;
}>();

const emit = defineEmits<{
  (e: 'apply', polished: string): void;
}>();

const message = useMessage();

// 检测结果
const 检测结果 = ref<AI味检测报告 | null>(null);
const is检测中 = ref(false);

// 润色结果
const 润色结果 = ref<{
  polished: string;
  changes: { type: string; original: string; replacement: string }[];
} | null>(null);
const is润色中 = ref(false);
const 润色进度 = ref(0);

// 显示模式
const showDetails = ref(false);
const showChanges = ref(false);

const 检测状态 = ref<'idle' | 'detecting' | 'polishing'>('idle');

/**
 * 检测AI味
 */
async function handle检测() {
  if (!props.content || props.content.length < 100) {
    message.warning('内容太少，请至少输入100字以上');
    return;
  }
  
  is检测中.value = true;
  检测状态.value = 'detecting';
  
  try {
    await new Promise(resolve => setTimeout(resolve, 500)); // 模拟延迟
    检测结果.value = 检测AI味(props.content);
  } catch (error) {
    message.error('检测失败');
  } finally {
    is检测中.value = false;
    检测状态.value = 'idle';
  }
}

/**
 * 执行润色
 */
async function handle润色() {
  if (!props.content || props.content.length < 100) {
    message.warning('内容太少，请至少输入100字以上');
    return;
  }
  
  is润色中.value = true;
  润色进度.value = 0;
  检测状态.value = 'polishing';
  
  try {
    const result = await 批量去AI味润色(props.content, (progress) => {
      润色进度.value = progress;
    });
    
    润色结果.value = result;
    
    if (result.changes.length === 0) {
      message.success('文本已经很自然，无需润色');
    } else {
      message.success(`润色完成，共修改 ${result.changes.length} 处`);
    }
  } catch (error) {
    message.error('润色失败');
  } finally {
    is润色中.value = false;
    检测状态.value = 'idle';
  }
}

/**
 * 应用润色结果
 */
function handle应用() {
  if (润色结果.value) {
    emit('apply', 润色结果.value.polished);
    message.success('已应用润色结果');
    // 清空结果
    润色结果.value = null;
    检测结果.value = null;
  }
}

/**
 * 复制润色结果
 */
function handle复制() {
  if (润色结果.value) {
    navigator.clipboard.writeText(润色结果.value.polished);
    message.success('已复制到剪贴板');
  }
}

/**
 * 重置
 */
function handle重置() {
  检测结果.value = null;
  润色结果.value = null;
  showDetails.value = false;
  showChanges.value = false;
}

/**
 * 获取AI味等级对应的颜色
 */
function getLevelColor(level: '轻度' | '中度' | '重度'): string {
  switch (level) {
    case '轻度': return 'bg-emerald-100 text-emerald-700';
    case '中度': return 'bg-amber-100 text-amber-700';
    case '重度': return 'bg-red-100 text-red-700';
    default: return 'bg-gray-100 text-gray-700';
  }
}

/**
 * 获取问题类型对应的颜色
 */
function getIssueTypeColor(type: string): string {
  switch (type) {
    case '禁用词': return 'bg-red-100 text-red-700';
    case '句式': return 'bg-orange-100 text-orange-700';
    case '心理描写': return 'bg-purple-100 text-purple-700';
    case '节奏': return 'bg-blue-100 text-blue-700';
    case '对话': return 'bg-teal-100 text-teal-700';
    case '结尾': return 'bg-pink-100 text-pink-700';
    case '心理外化': return 'bg-indigo-100 text-indigo-700';
    default: return 'bg-gray-100 text-gray-700';
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
        <Wand2 class="w-5 h-5 text-white" />
      </div>
      <div>
        <h3 class="font-semibold text-gray-900 dark:text-white">去AI味润色</h3>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          让AI生成的文字更自然、更有人味
        </p>
      </div>
    </div>

    <!-- 说明 -->
    <div class="p-3 rounded-xl bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 border border-violet-200 dark:border-violet-800">
      <p class="text-xs text-violet-700 dark:text-violet-400">
        <strong>AI味检测与润色</strong>可以识别并修正文本中的AI写作痕迹，
        包括：禁用词堆砌、机械句式、直接陈述情绪、长段落均匀化、结尾升华等常见问题。
      </p>
    </div>

    <!-- 操作按钮 -->
    <div class="flex gap-2">
      <button
        class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-medium shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
        :disabled="is检测中 || is润色中 || !content || content.length < 100"
        @click="handle检测"
      >
        <Loader2 v-if="is检测中" class="w-4 h-4 animate-spin" />
        <Sparkles v-else class="w-4 h-4" />
        {{ is检测中 ? '检测中...' : '检测AI味' }}
      </button>
      
      <button
        class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-medium shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
        :disabled="is检测中 || is润色中 || !content || content.length < 100"
        @click="handle润色"
      >
        <Loader2 v-if="is润色中" class="w-4 h-4 animate-spin" />
        <Wand2 v-else class="w-4 h-4" />
        {{ is润色中 ? `润色中...${润色进度}%` : '去AI味' }}
      </button>
    </div>

    <!-- 进度条 -->
    <div v-if="is润色中" class="space-y-1">
      <div class="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div 
          class="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-300"
          :style="{ width: `${润色进度}%` }"
        ></div>
      </div>
      <p class="text-xs text-gray-400 text-right">正在处理...</p>
    </div>

    <!-- 检测结果 -->
    <div v-if="检测结果 && !润色结果" class="space-y-3">
      <!-- 概览卡片 -->
      <div class="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span 
              class="px-2.5 py-1 rounded-lg text-sm font-medium"
              :class="getLevelColor(检测结果.level)"
            >
              {{ 检测结果.level }}AI味
            </span>
            <span class="text-lg font-bold text-gray-900 dark:text-white">
              {{ 检测结果.totalScore }}分
            </span>
          </div>
          <button
            class="text-xs text-violet-600 dark:text-violet-400 hover:underline"
            @click="showDetails = !showDetails"
          >
            {{ showDetails ? '收起详情' : '查看详情' }}
            <ChevronDown 
              class="w-3 h-3 inline ml-1 transition-transform"
              :class="{ 'rotate-180': showDetails }"
            />
          </button>
        </div>
        
        <!-- 建议 -->
        <div class="space-y-1">
          <p 
            v-for="(suggestion, index) in 检测结果.suggestions" 
            :key="index"
            class="text-xs text-gray-600 dark:text-gray-400"
          >
            • {{ suggestion }}
          </p>
        </div>
      </div>

      <!-- 详细问题列表 -->
      <div v-if="showDetails && 检测结果.issues.length > 0" class="space-y-2">
        <div 
          v-for="(issue, index) in 检测结果.issues" 
          :key="index"
          class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700"
        >
          <div class="flex items-start gap-2">
            <span 
              class="px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0"
              :class="getIssueTypeColor(issue.type)"
            >
              {{ issue.type }}
            </span>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-red-600 dark:text-red-400 line-through opacity-60">
                {{ issue.original }}
              </p>
              <p v-if="issue.suggestion" class="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                → {{ issue.suggestion }}
              </p>
              <p class="text-xs text-gray-400 mt-1 italic">
                {{ issue.reason }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 润色结果 -->
    <div v-if="润色结果" class="space-y-3">
      <!-- 概览 -->
      <div class="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <Check class="w-5 h-5 text-emerald-600" />
            <span class="font-medium text-emerald-700 dark:text-emerald-400">
              润色完成
            </span>
          </div>
          <span class="text-sm text-emerald-600 dark:text-emerald-400">
            修改 {{ 润色结果.changes.length }} 处
          </span>
        </div>
        
        <!-- 预览 -->
        <div class="p-3 rounded-lg bg-white dark:bg-gray-800 border border-emerald-200 dark:border-emerald-700 max-h-48 overflow-y-auto">
          <pre class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">{{ 润色结果.polished }}</pre>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="flex gap-2">
        <button
          class="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors"
          @click="handle应用"
        >
          <Check class="w-4 h-4" />
          应用到编辑器
        </button>
        <button
          class="flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          @click="handle复制"
        >
          <Copy class="w-4 h-4" />
        </button>
      </div>

      <!-- 修改详情 -->
      <button
        class="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        @click="showChanges = !showChanges"
      >
        <span>查看修改详情 ({{ 润色结果.changes.length }})</span>
        <ChevronDown 
          class="w-4 h-4 transition-transform"
          :class="{ 'rotate-180': showChanges }"
        />
      </button>

      <div v-if="showChanges" class="space-y-1.5 max-h-60 overflow-y-auto">
        <div 
          v-for="(change, index) in 润色结果.changes" 
          :key="index"
          class="p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 text-xs"
        >
          <div class="flex items-center gap-2 mb-1">
            <span 
              class="px-1.5 py-0.5 rounded text-xs font-medium"
              :class="getIssueTypeColor(change.type)"
            >
              {{ change.type }}
            </span>
          </div>
          <p class="text-red-500 line-through opacity-60">
            - {{ change.original }}
          </p>
          <p v-if="change.replacement" class="text-emerald-500">
            + {{ change.replacement }}
          </p>
        </div>
      </div>
    </div>

    <!-- 重置按钮 -->
    <button
      v-if="检测结果 || 润色结果"
      class="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg"
      @click="handle重置"
    >
      <RefreshCw class="w-4 h-4" />
      重新开始
    </button>
  </div>
</template>

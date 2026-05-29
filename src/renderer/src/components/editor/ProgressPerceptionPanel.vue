<script setup lang="ts">
/**
 * 进度感知面板组件
 * 显示故事进度、完结感知、伏笔状态等信息
 */
import { ref, computed, watch, onMounted } from 'vue';
import { NProgress, NTag, NScrollbar } from 'naive-ui';
import { 
  TrendingUp, 
  Target, 
  Layers, 
  AlertTriangle, 
  CheckCircle2,
  Clock,
  BookOpen,
  Flame,
  Sparkles,
  MapPin,
  Users,
  Heart,
  Zap,
} from 'lucide-vue-next';
import { useProjectStore } from '@/stores/project.store';
import { createEndingPerceptionEngine } from '@/services/writing/ending-perception-engine';
import { createForeshadowTracker, ForeshadowTracker } from '@/services/writing/enhanced-foreshadow-tracker';
import { createStorylineManager } from '@/services/writing/storyline-manager';
import type { EndingReadiness, UnresolvedForeshadow, PlotPhaseInfo, PlotPhase } from '@/types/ending-perception';
import { generatePlotPhaseInfo } from '@/types/ending-perception';

const projectStore = useProjectStore();

// 状态
const endingReadiness = ref<EndingReadiness | null>(null);
const foreshadowReport = ref<any>(null);
const storylineProgress = ref<any>(null);
const currentPlotPhase = ref<PlotPhaseInfo | null>(null);
const isLoading = ref(false);

// 计算属性
const currentChapterIndex = computed(() => {
  const chapters = projectStore.project?.chapters || [];
  const current = projectStore.currentChapter;
  if (!current) return 0;
  return chapters.findIndex(c => c.id === current.id) + 1;
});

const totalChapters = computed(() => {
  return projectStore.project?.metadata?.plannedChapterCount || 100;
});

const projectName = computed(() => projectStore.project?.name || '未命名项目');

// 加载数据
async function loadPerceptionData() {
  if (!projectStore.project) return;
  
  isLoading.value = true;
  
  try {
    const project = projectStore.project;
    const chapterIndex = currentChapterIndex.value;
    
    // 1. 完结感知分析
    const engine = createEndingPerceptionEngine(
      project,
      chapterIndex,
      project.chapterMemories || [],
      project.foreshadows || [],
      project.plotOutline || []
    );
    endingReadiness.value = engine.analyzeEndingReadiness();
    
    // 2. 情节阶段信息
    currentPlotPhase.value = generatePlotPhaseInfo(chapterIndex, totalChapters.value);
    
    // 3. 伏笔追踪报告
    const tracker = createForeshadowTracker(project, chapterIndex);
    foreshadowReport.value = tracker.generateReport();
    
    // 4. 故事线进度
    const storylineManager = createStorylineManager(project);
    storylineProgress.value = storylineManager.generateProgressReport(chapterIndex);
    
  } catch (error) {
    console.error('[ProgressPanel] Failed to load perception data:', error);
  } finally {
    isLoading.value = false;
  }
}

// 获取紧急度颜色
function getUrgencyColor(urgency: string): string {
  switch (urgency) {
    case 'critical': return 'error';
    case 'high': return 'warning';
    case 'medium': return 'info';
    default: return 'default';
  }
}

// 获取紧急度标签
function getUrgencyLabel(urgency: string): string {
  switch (urgency) {
    case 'critical': return '紧急';
    case 'high': return '高';
    case 'medium': return '中';
    default: return '低';
  }
}

// 获取阶段颜色
function getPhaseColor(phase: string): string {
  switch (phase) {
    case 'setup': return '#3b82f6';
    case 'rising': return '#22c55e';
    case 'climax': return '#ef4444';
    case 'falling': return '#f97316';
    case 'resolution': return '#8b5cf6';
    default: return '#6b7280';
  }
}

// 格式化信号类型
function formatSignalType(type: string): string {
  const typeMap: Record<string, string> = {
    emotional: '情感',
    plot: '剧情',
    foreshadow: '伏笔',
    character: '人物',
  };
  return typeMap[type] || type;
}

// 监听项目变化
watch(() => projectStore.project?.id, () => {
  loadPerceptionData();
}, { immediate: true });

watch(() => projectStore.currentChapterId, () => {
  loadPerceptionData();
});

// 刷新数据
function refresh() {
  loadPerceptionData();
}

// 暴露方法
defineExpose({
  refresh,
});
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- 加载状态 -->
    <div v-if="isLoading" class="flex-1 flex items-center justify-center">
      <div class="text-center text-gray-500 dark:text-gray-400">
        <div class="animate-pulse">加载进度感知数据...</div>
      </div>
    </div>

    <!-- 进度感知内容 -->
    <NScrollbar v-else class="flex-1 p-3 space-y-4">
      <!-- 项目概览 -->
      <div class="mb-3 p-3 rounded-lg bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-100 dark:border-indigo-800/50">
        <div class="flex items-center gap-2 mb-2">
          <BookOpen class="w-4 h-4 text-indigo-500" />
          <span class="font-semibold text-sm text-gray-900 dark:text-white">{{ projectName }}</span>
        </div>
        <div class="text-xs text-gray-500 dark:text-gray-400">
          第 {{ currentChapterIndex }} 章 / 约 {{ totalChapters }} 章
        </div>
      </div>

      <!-- 整体进度 -->
      <div class="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <TrendingUp class="w-4 h-4 text-indigo-500" />
            <span class="font-medium text-sm">整体进度</span>
          </div>
          <span class="text-sm font-bold text-indigo-600 dark:text-indigo-400">
            {{ endingReadiness?.overallProgress || 0 }}%
          </span>
        </div>
        <NProgress
          type="line"
          :percentage="endingReadiness?.overallProgress || 0"
          :height="8"
          :border-radius="4"
          color="linear-gradient(90deg, #6366f1, #8b5cf6)"
          rail-color="#e5e7eb"
          :show-indicator="false"
        />
        
        <!-- 阶段指示 -->
        <div v-if="currentPlotPhase" class="mt-2 flex items-center gap-2">
          <div 
            class="px-2 py-0.5 rounded text-xs font-medium text-white"
            :style="{ backgroundColor: getPhaseColor(currentPlotPhase.phase) }"
          >
            {{ currentPlotPhase.phaseName }}
          </div>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {{ currentPlotPhase.recommendedStrategy }}
          </span>
        </div>
      </div>

      <!-- 完结感知 -->
      <div v-if="endingReadiness" class="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <div class="flex items-center gap-2 mb-3">
          <Target class="w-4 h-4 text-purple-500" />
          <span class="font-medium text-sm">完结感知</span>
          <NTag 
            :type="endingReadiness.isInEndingPhase === 'normal' ? 'success' : 'warning'" 
            size="tiny"
          >
            {{ endingReadiness.phaseName }}
          </NTag>
        </div>
        
        <!-- 进度指标 -->
        <div class="grid grid-cols-2 gap-2 mb-3">
          <div class="text-center p-2 rounded bg-gray-50 dark:bg-gray-700/50">
            <div class="text-lg font-bold text-gray-900 dark:text-white">
              {{ endingReadiness.remainingChapters }}
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400">剩余章节</div>
          </div>
          <div class="text-center p-2 rounded bg-gray-50 dark:bg-gray-700/50">
            <div class="text-lg font-bold text-gray-900 dark:text-white">
              {{ endingReadiness.foreshadowCompletionRate }}%
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400">伏笔完成</div>
          </div>
        </div>

        <!-- 高潮提示 -->
        <div v-if="endingReadiness.climaxApproaching" 
          class="p-2 rounded bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 mb-2">
          <div class="flex items-center gap-2 text-orange-600 dark:text-orange-400">
            <Flame class="w-4 h-4" />
            <span class="text-xs font-medium">高潮即将到来</span>
          </div>
        </div>

        <!-- 完结建议 -->
        <div class="p-2 rounded bg-indigo-50 dark:bg-indigo-900/20">
          <div class="text-xs text-indigo-600 dark:text-indigo-400">
            {{ endingReadiness.recommendation }}
          </div>
        </div>

        <!-- 完结信号 -->
        <div v-if="endingReadiness.endingSignals.length > 0" class="mt-3">
          <div class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">完结信号</div>
          <div class="space-y-1">
            <div 
              v-for="(signal, idx) in endingReadiness.endingSignals.slice(0, 3)" 
              :key="idx"
              class="flex items-center gap-2 text-xs"
            >
              <span class="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                {{ formatSignalType(signal.type) }}
              </span>
              <span class="text-gray-600 dark:text-gray-300">{{ signal.title }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 伏笔状态 -->
      <div v-if="foreshadowReport" class="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <Layers class="w-4 h-4 text-amber-500" />
            <span class="font-medium text-sm">伏笔状态</span>
          </div>
          <div class="flex items-center gap-2">
            <NTag type="success" size="tiny">{{ foreshadowReport.stats.resolved }} 已解决</NTag>
            <NTag v-if="foreshadowReport.stats.overdue > 0" type="error" size="tiny">
              {{ foreshadowReport.stats.overdue }} 过期
            </NTag>
          </div>
        </div>

        <!-- 伏笔统计 -->
        <div class="grid grid-cols-3 gap-2 mb-3">
          <div class="text-center p-2 rounded bg-amber-50 dark:bg-amber-900/20">
            <div class="text-lg font-bold text-amber-600 dark:text-amber-400">
              {{ foreshadowReport.stats.active }}
            </div>
            <div class="text-xs text-amber-600 dark:text-amber-400">活跃</div>
          </div>
          <div class="text-center p-2 rounded bg-red-50 dark:bg-red-900/20">
            <div class="text-lg font-bold text-red-600 dark:text-red-400">
              {{ foreshadowReport.stats.urgent }}
            </div>
            <div class="text-xs text-red-600 dark:text-red-400">紧急</div>
          </div>
          <div class="text-center p-2 rounded bg-green-50 dark:bg-green-900/20">
            <div class="text-lg font-bold text-green-600 dark:text-green-400">
              {{ Math.round(foreshadowReport.payoffProgress * 100) }}%
            </div>
            <div class="text-xs text-green-600 dark:text-green-400">完成率</div>
          </div>
        </div>

        <!-- 紧急伏笔列表 -->
        <div v-if="foreshadowReport.urgentForeshadows.length > 0" class="space-y-2">
          <div class="text-xs font-medium text-gray-500 dark:text-gray-400">待处理伏笔</div>
          <div 
            v-for="fs in foreshadowReport.urgentForeshadows.slice(0, 3)" 
            :key="fs.id"
            class="p-2 rounded bg-gray-50 dark:bg-gray-700/50"
          >
            <div class="flex items-start gap-2">
              <AlertTriangle 
                v-if="fs.urgency === 'critical'" 
                class="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" 
              />
              <div class="flex-1 min-w-0">
                <div class="text-xs text-gray-700 dark:text-gray-300 line-clamp-2">
                  {{ fs.content }}
                </div>
                <div class="flex items-center gap-2 mt-1">
                  <NTag :type="getUrgencyColor(fs.urgency)" size="tiny">
                    {{ getUrgencyLabel(fs.urgency) }}
                  </NTag>
                  <span class="text-xs text-gray-400">第{{ fs.plantedChapter }}章</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 下一步建议 -->
        <div v-if="foreshadowReport.nextPayoffSuggestion" class="mt-3 p-2 rounded bg-blue-50 dark:bg-blue-900/20">
          <div class="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <Sparkles class="w-4 h-4" />
            <span class="text-xs">{{ foreshadowReport.nextPayoffSuggestion }}</span>
          </div>
        </div>
      </div>

      <!-- 故事线进度 -->
      <div v-if="storylineProgress" class="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <MapPin class="w-4 h-4 text-cyan-500" />
            <span class="font-medium text-sm">故事线进度</span>
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            主线 {{ storylineProgress.mainLineCompletion }}%
          </div>
        </div>

        <!-- 进度列表 -->
        <div class="space-y-2">
          <div 
            v-for="progress in storylineProgress.progress" 
            :key="progress.type"
            class="flex items-center gap-2"
          >
            <component 
              :is="getLineIcon(progress.type)" 
              class="w-4 h-4 text-gray-400" 
            />
            <div class="flex-1">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs text-gray-600 dark:text-gray-300">
                  {{ getLineName(progress.type) }}
                </span>
                <span class="text-xs text-gray-400">{{ progress.completion }}%</span>
              </div>
              <NProgress
                type="line"
                :percentage="progress.completion"
                :height="4"
                :border-radius="2"
                :color="getLineColor(progress.type)"
                rail-color="#e5e7eb"
                :show-indicator="false"
              />
            </div>
          </div>
        </div>

        <!-- 建议 -->
        <div v-if="storylineProgress.suggestions.length > 0" class="mt-3 space-y-1">
          <div 
            v-for="(suggestion, idx) in storylineProgress.suggestions.slice(0, 2)" 
            :key="idx"
            class="text-xs text-gray-500 dark:text-gray-400"
          >
            {{ suggestion }}
          </div>
        </div>
      </div>

      <!-- 刷新按钮 -->
      <div class="flex justify-center pt-2">
        <button
          @click="refresh"
          class="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-sm text-gray-600 dark:text-gray-300 transition-colors"
        >
          刷新数据
        </button>
      </div>
    </NScrollbar>
  </div>
</template>

<script lang="ts">
// 图标映射
function getLineIcon(type: string) {
  const iconMap: Record<string, any> = {
    map: MapPin,
    faction: Users,
    goldenfinger: Zap,
    romance: Heart,
  };
  return iconMap[type] || Layers;
}

// 名称映射
function getLineName(type: string): string {
  const nameMap: Record<string, string> = {
    map: '地图线',
    faction: '阵营线',
    goldenfinger: '金手指线',
    romance: '感情线',
  };
  return nameMap[type] || type;
}

// 颜色映射
function getLineColor(type: string): string {
  const colorMap: Record<string, string> = {
    map: '#3b82f6',
    faction: '#ef4444',
    goldenfinger: '#f59e0b',
    romance: '#ec4899',
  };
  return colorMap[type] || '#6b7280';
}
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>

<script setup lang="ts">
/**
 * AnalyzeMode - 分析模式
 * Moliu v2.0 - 分析市场趋势和内容
 */
import { ref, computed, onMounted } from "vue";
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart,
  Target,
  Zap,
  Clock,
  Eye,
  Star,
  LineChart,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Download,
  Filter,
  Search,
} from "lucide-vue-next";
import RetentionScoreCard from "./RetentionScoreCard.vue";

// ============================================================
// Types
// ============================================================

interface TrendData {
  genre: string;
  trend: number;
  avgRetention: number;
  volume: number;
  growth: number;
}

interface AnalysisResult {
  overallScore: number;
  retentionScore: {
    hookScore: number;
    coolpointScore: number;
    microFulfillment: number;
    suspenseDebt: number;
    rhythmHealth: number;
    originality: number;
  };
  recommendations: string[];
  warnings: string[];
}

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  projectData?: any;
}

interface Emits {
  (e: "export", data: AnalysisResult): void;
  (e: "apply", recommendations: string[]): void;
  (e: "back"): void;
}

const props = withDefaults(defineProps<Props>(), {
  projectData: null,
});

const emit = defineEmits<Emits>();

// ============================================================
// State
// ============================================================

const isLoading = ref(true);
const activeTab = ref<"trends" | "analysis" | "compare">("trends");
const searchQuery = ref("");
const selectedGenre = ref<string | null>(null);
const timeRange = ref<"week" | "month" | "quarter">("month");

// Mock data
const trends = ref<TrendData[]>([
  { genre: "玄幻", trend: 85, avgRetention: 72, volume: 15000, growth: 12 },
  { genre: "都市", trend: 78, avgRetention: 68, volume: 18000, growth: 5 },
  { genre: "修仙", trend: 82, avgRetention: 75, volume: 12000, growth: 18 },
  { genre: "穿越", trend: 70, avgRetention: 65, volume: 9000, growth: -3 },
  { genre: "异能", trend: 88, avgRetention: 78, volume: 11000, growth: 22 },
  { genre: "星际", trend: 75, avgRetention: 70, volume: 8000, growth: 8 },
  { genre: "游戏", trend: 80, avgRetention: 73, volume: 9500, growth: 15 },
  { genre: "悬疑", trend: 72, avgRetention: 71, volume: 7000, growth: 6 },
]);

const analysisResult = ref<AnalysisResult>({
  overallScore: 78,
  retentionScore: {
    hookScore: 75,
    coolpointScore: 80,
    microFulfillment: 72,
    suspenseDebt: 65,
    rhythmHealth: 85,
    originality: 70,
  },
  recommendations: [
    "建议在第三章增加一个反转钩子，提升留存率",
    "当前爽点密度适中，可考虑增加微成就系统",
    "节奏健康，但结尾悬念设置可加强",
  ],
  warnings: [
    "部分章节节奏偏慢，建议压缩",
    "角色动机需要更明确",
  ],
});

// ============================================================
// Computed
// ============================================================

const filteredTrends = computed(() => {
  let result = [...trends.value];

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter((t) => t.genre.toLowerCase().includes(query));
  }

  if (selectedGenre.value) {
    result = result.filter((t) => t.genre === selectedGenre.value);
  }

  // Sort by trend
  result.sort((a, b) => b.trend - a.trend);

  return result;
});

const topGenres = computed(() => {
  return [...filteredTrends.value]
    .sort((a, b) => b.trend - a.trend)
    .slice(0, 5);
});

const avgTrend = computed(() => {
  if (filteredTrends.value.length === 0) return 0;
  return Math.round(
    filteredTrends.value.reduce((sum, t) => sum + t.trend, 0) / filteredTrends.value.length
  );
});

// ============================================================
// Tabs
// ============================================================

const tabs = [
  { id: "trends", label: "市场趋势", icon: TrendingUp },
  { id: "analysis", label: "内容分析", icon: BarChart3 },
  { id: "compare", label: "对比分析", icon: PieChart },
];

// ============================================================
// Methods
// ============================================================

async function refresh() {
  isLoading.value = true;
  await new Promise((resolve) => setTimeout(resolve, 1500));
  isLoading.value = false;
}

function exportAnalysis() {
  emit("export", analysisResult.value);
}

function applyRecommendations() {
  emit("apply", analysisResult.value.recommendations);
}

function getTrendIcon(value: number) {
  if (value > 0) return ArrowUpRight;
  if (value < 0) return ArrowDownRight;
  return TrendingUp;
}

function getTrendColor(value: number) {
  if (value > 10) return "text-green-500 bg-green-100 dark:bg-green-900/30";
  if (value > 0) return "text-emerald-500 bg-emerald-100 dark:bg-emerald-900/30";
  if (value < 0) return "text-red-500 bg-red-100 dark:bg-red-900/30";
  return "text-gray-500 bg-gray-100 dark:bg-gray-700";
}

function getScoreColor(score: number) {
  if (score >= 80) return "text-green-500";
  if (score >= 60) return "text-amber-500";
  return "text-red-500";
}

// ============================================================
// Lifecycle
// ============================================================

onMounted(() => {
  refresh();
});
</script>

<template>
  <div class="flex flex-col h-full bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-900 dark:to-gray-900">
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
      <div class="flex items-center gap-3">
        <div class="p-2 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white">
          <BarChart3 class="w-5 h-5" />
        </div>
        <div>
          <h2 class="font-semibold text-gray-900 dark:text-white">数据分析</h2>
          <p class="text-xs text-gray-500 dark:text-gray-400">市场趋势与内容分析</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <select
          v-model="timeRange"
          class="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300"
        >
          <option value="week">近7天</option>
          <option value="month">近30天</option>
          <option value="quarter">近90天</option>
        </select>
        <button
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
          :disabled="isLoading"
          @click="refresh"
        >
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isLoading }" />
          <span>刷新</span>
        </button>
        <button
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
          @click="exportAnalysis"
        >
          <Download class="w-4 h-4" />
          <span>导出</span>
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="px-6 pt-4 bg-white/50 dark:bg-gray-900/50">
      <div class="flex gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-800 w-fit">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
          :class="
            activeTab === tab.id
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          "
          @click="activeTab = tab.id as any"
        >
          <component :is="tab.icon" class="w-4 h-4" />
          <span>{{ tab.label }}</span>
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-6">
      <!-- Trends Tab -->
      <div v-if="activeTab === 'trends'" class="space-y-6">
        <!-- Overview Cards -->
        <div class="grid grid-cols-4 gap-4">
          <div class="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-2 mb-2">
              <TrendingUp class="w-4 h-4 text-cyan-500" />
              <span class="text-sm text-gray-500 dark:text-gray-400">平均趋势</span>
            </div>
            <div class="text-2xl font-bold text-gray-900 dark:text-white">{{ avgTrend }}</div>
            <div class="text-xs text-gray-400 mt-1">题材热度指数</div>
          </div>

          <div class="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-2 mb-2">
              <Eye class="w-4 h-4 text-blue-500" />
              <span class="text-sm text-gray-500 dark:text-gray-400">平均追读</span>
            </div>
            <div class="text-2xl font-bold text-gray-900 dark:text-white">71%</div>
            <div class="text-xs text-gray-400 mt-1">用户追读率</div>
          </div>

          <div class="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-2 mb-2">
              <Zap class="w-4 h-4 text-amber-500" />
              <span class="text-sm text-gray-500 dark:text-gray-400">热门题材</span>
            </div>
            <div class="text-2xl font-bold text-gray-900 dark:text-white">异能</div>
            <div class="text-xs text-gray-400 mt-1">+22% 增长</div>
          </div>

          <div class="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-2 mb-2">
              <Clock class="w-4 h-4 text-violet-500" />
              <span class="text-sm text-gray-500 dark:text-gray-400">监测题材</span>
            </div>
            <div class="text-2xl font-bold text-gray-900 dark:text-white">{{ trends.length }}</div>
            <div class="text-xs text-gray-400 mt-1">持续跟踪中</div>
          </div>
        </div>

        <!-- Search & Filter -->
        <div class="flex items-center gap-4">
          <div class="relative flex-1 max-w-md">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="搜索题材..."
              class="w-full pl-10 pr-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>
          <div class="flex gap-2">
            <button
              class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              :class="selectedGenre === null ? 'bg-indigo-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'"
              @click="selectedGenre = null"
            >
              全部
            </button>
          </div>
        </div>

        <!-- Trends Table -->
        <div class="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table class="w-full">
            <thead class="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">题材</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">趋势指数</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">平均追读</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">内容量</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">增长率</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
              <tr
                v-for="trend in filteredTrends"
                :key="trend.genre"
                class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <td class="px-4 py-3">
                  <span class="font-medium text-gray-900 dark:text-white">{{ trend.genre }}</span>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <div class="w-24 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      <div
                        class="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500"
                        :style="{ width: `${trend.trend}%` }"
                      />
                    </div>
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ trend.trend }}</span>
                  </div>
                </td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ trend.avgRetention }}%</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ (trend.volume / 1000).toFixed(1) }}k</td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-1" :class="getTrendColor(trend.growth)">
                    <component :is="getTrendIcon(trend.growth)" class="w-4 h-4" />
                    <span class="text-sm font-medium">{{ trend.growth > 0 ? '+' : '' }}{{ trend.growth }}%</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Analysis Tab -->
      <div v-else-if="activeTab === 'analysis'" class="space-y-6">
        <!-- Overall Score -->
        <div class="p-6 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-sm opacity-80 mb-1">综合评分</div>
              <div class="text-4xl font-bold">{{ analysisResult.overallScore }}</div>
              <div class="text-sm opacity-80 mt-1">基于追读力六维评估</div>
            </div>
            <div class="text-right">
              <div class="text-sm opacity-80 mb-1">评级</div>
              <div class="text-2xl font-bold">B+</div>
              <div class="text-sm opacity-80 mt-1">中等偏上</div>
            </div>
          </div>
        </div>

        <!-- Retention Score -->
        <div class="p-6 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <div class="flex items-center gap-2 mb-4">
            <Target class="w-5 h-5 text-indigo-500" />
            <h3 class="font-semibold text-gray-900 dark:text-white">追读力评分</h3>
          </div>
          <RetentionScoreCard :score="analysisResult.retentionScore" />
        </div>

        <!-- Recommendations -->
        <div class="grid grid-cols-2 gap-4">
          <!-- Recommendations -->
          <div class="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-2 mb-3">
              <Star class="w-5 h-5 text-amber-500" />
              <h3 class="font-semibold text-gray-900 dark:text-white">改进建议</h3>
            </div>
            <ul class="space-y-2">
              <li
                v-for="(rec, index) in analysisResult.recommendations"
                :key="index"
                class="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400"
              >
                <span class="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                  {{ index + 1 }}
                </span>
                {{ rec }}
              </li>
            </ul>
            <button
              class="w-full mt-4 px-4 py-2 rounded-lg bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition-colors"
              @click="applyRecommendations"
            >
              应用建议
            </button>
          </div>

          <!-- Warnings -->
          <div class="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-2 mb-3">
              <AlertCircle class="w-5 h-5 text-red-500" />
              <h3 class="font-semibold text-gray-900 dark:text-white">注意事项</h3>
            </div>
            <ul class="space-y-2">
              <li
                v-for="(warning, index) in analysisResult.warnings"
                :key="index"
                class="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400"
              >
                <span class="w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                  !
                </span>
                {{ warning }}
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Compare Tab -->
      <div v-else class="space-y-6">
        <div class="p-6 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <div class="flex items-center gap-2 mb-4">
            <PieChart class="w-5 h-5 text-indigo-500" />
            <h3 class="font-semibold text-gray-900 dark:text-white">题材分布</h3>
          </div>

          <div class="flex items-center gap-8">
            <!-- Simple Bar Chart -->
            <div class="flex-1 space-y-3">
              <div
                v-for="genre in topGenres"
                :key="genre.genre"
                class="flex items-center gap-3"
              >
                <span class="w-16 text-sm text-gray-600 dark:text-gray-400">{{ genre.genre }}</span>
                <div class="flex-1 h-6 rounded-lg bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div
                    class="h-full rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-end pr-2"
                    :style="{ width: `${(genre.volume / 18000) * 100}%` }"
                  >
                    <span class="text-xs text-white font-medium">{{ (genre.volume / 1000).toFixed(1) }}k</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Legend -->
            <div class="space-y-2">
              <div
                v-for="genre in topGenres"
                :key="genre.genre"
                class="flex items-center gap-2"
              >
                <div class="w-3 h-3 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" />
                <span class="text-sm text-gray-600 dark:text-gray-400">{{ genre.genre }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Trend Chart Placeholder -->
        <div class="p-6 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <div class="flex items-center gap-2 mb-4">
            <LineChart class="w-5 h-5 text-cyan-500" />
            <h3 class="font-semibold text-gray-900 dark:text-white">趋势变化</h3>
          </div>

          <!-- Simplified Line Chart -->
          <div class="h-48 flex items-end gap-2">
            <div
              v-for="(genre, index) in topGenres.slice(0, 5)"
              :key="genre.genre"
              class="flex-1 flex flex-col items-center gap-2"
            >
              <div class="w-full flex items-end gap-1 h-36">
                <div
                  v-for="i in 7"
                  :key="i"
                  class="flex-1 rounded-t"
                  :class="index % 2 === 0 ? 'bg-indigo-300 dark:bg-indigo-600' : 'bg-purple-300 dark:bg-purple-600'"
                  :style="{ height: `${30 + Math.random() * 60}%` }"
                />
              </div>
              <span class="text-xs text-gray-500 dark:text-gray-400">{{ genre.genre }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { AlertCircle } from "lucide-vue-next";
</script>

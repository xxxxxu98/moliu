<script setup lang="ts">
/**
 * TrendingPanel v2 - 市场趋势面板
 * Moliu v2.0 - 展示当前网文市场趋势和热门题材
 */
import { ref, computed } from "vue";
import {
  TrendingUp,
  TrendingDown,
  X,
  Filter,
  Sparkles,
  Star,
  Flame,
} from "lucide-vue-next";

// ============================================================
// Types
// ============================================================

interface TrendTag {
  id: string;
  name: string;
  category: string;
  trend: "rising" | "stable" | "declining";
  hotScore: number;
  growth: number;
  description: string;
  recommended?: boolean;
}

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  selectedTags?: string[];
}

interface Emits {
  (e: "close"): void;
  (e: "select", tag: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  selectedTags: () => [],
});

const emit = defineEmits<Emits>();

// ============================================================
// State
// ============================================================

const activeFilter = ref<"all" | "rising" | "hot">("all");
const searchQuery = ref("");

// ============================================================
// Data
// ============================================================

const trendTags: TrendTag[] = [
  // 玄幻仙侠
  { id: "t1", name: "玄幻", category: "玄幻仙侠", trend: "rising", hotScore: 95, growth: 12, description: "传统玄幻持续热门", recommended: true },
  { id: "t2", name: "修仙", category: "玄幻仙侠", trend: "stable", hotScore: 88, growth: 3, description: "修炼体系成熟稳定" },
  { id: "t3", name: "洪荒", category: "玄幻仙侠", trend: "rising", hotScore: 82, growth: 18, description: "上古神话设定受追捧" },
  { id: "t4", name: "神话", category: "玄幻仙侠", trend: "rising", hotScore: 78, growth: 25, description: "国潮神话融合创新" },
  
  // 都市言情
  { id: "t5", name: "都市", category: "都市言情", trend: "stable", hotScore: 92, growth: 2, description: "都市背景刚需品类" },
  { id: "t6", name: "总裁", category: "都市言情", trend: "declining", hotScore: 65, growth: -8, description: "同质化严重，需创新" },
  { id: "t7", name: "甜宠", category: "都市言情", trend: "rising", hotScore: 90, growth: 15, description: "轻松甜蜜受年轻读者喜爱" },
  { id: "t8", name: "马甲", category: "都市言情", trend: "stable", hotScore: 85, growth: 5, description: "身份反差经久不衰" },
  { id: "t9", name: "重生", category: "都市言情", trend: "stable", hotScore: 80, growth: 0, description: "经典题材，稳中有变" },
  
  // 穿越异世
  { id: "t10", name: "穿越", category: "穿越异世", trend: "stable", hotScore: 85, growth: 2, description: "穿越设定永不过时" },
  { id: "t11", name: "种田", category: "穿越异世", trend: "rising", hotScore: 75, growth: 20, description: "慢生活节奏疗愈人心" },
  { id: "t12", name: "系统流", category: "穿越异世", trend: "stable", hotScore: 88, growth: 5, description: "金手指设定读者喜闻乐见" },
  
  // 悬疑惊悚
  { id: "t13", name: "悬疑", category: "悬疑惊悚", trend: "rising", hotScore: 82, growth: 10, description: "烧脑剧情需求增加" },
  { id: "t14", name: "灵异", category: "悬疑惊悚", trend: "stable", hotScore: 72, growth: 3, description: "恐怖元素稳定输出" },
  { id: "t15", name: "推理", category: "悬疑惊悚", trend: "rising", hotScore: 78, growth: 8, description: "逻辑推理爱好者增多" },
  
  // 科幻星际
  { id: "t16", name: "星际", category: "科幻星际", trend: "rising", hotScore: 80, growth: 22, description: "科幻热度持续上升" },
  { id: "t17", name: "赛博朋克", category: "科幻星际", trend: "rising", hotScore: 76, growth: 30, description: "科技幻想题材爆发" },
  { id: "t18", name: "末世", category: "科幻星际", trend: "stable", hotScore: 74, growth: 5, description: "废土生存稳定受众" },
  { id: "t19", name: "星际争霸", category: "科幻星际", trend: "rising", hotScore: 70, growth: 15, description: "宏大叙事受关注" },
  
  // 游戏电竞
  { id: "t20", name: "电竞", category: "游戏电竞", trend: "stable", hotScore: 75, growth: 3, description: "电竞题材稳定输出" },
  { id: "t21", name: "全息游戏", category: "游戏电竞", trend: "rising", hotScore: 82, growth: 18, description: "VR/AR设定热门" },
  { id: "t22", name: "直播", category: "游戏电竞", trend: "declining", hotScore: 60, growth: -5, description: "同质化严重" },
  
  // 历史军事
  { id: "t23", name: "历史", category: "历史军事", trend: "stable", hotScore: 70, growth: 2, description: "历史穿越稳定受众" },
  { id: "t24", name: "军旅", category: "历史军事", trend: "rising", hotScore: 78, growth: 12, description: "热血军旅题材回温" },
  { id: "t25", name: "抗战", category: "历史军事", trend: "stable", hotScore: 65, growth: 0, description: "主旋律题材稳定" },
];

// ============================================================
// Computed
// ============================================================

const categories = computed(() => {
  const cats = [...new Set(trendTags.map((t) => t.category))];
  return cats;
});

const filteredTags = computed(() => {
  let filtered = trendTags;

  // Filter by search
  if (searchQuery.value) {
    filtered = filtered.filter(
      (t) =>
        t.name.includes(searchQuery.value) ||
        t.description.includes(searchQuery.value)
    );
  }

  // Filter by active filter
  if (activeFilter.value === "rising") {
    filtered = filtered.filter((t) => t.trend === "rising");
  } else if (activeFilter.value === "hot") {
    filtered = filtered.filter((t) => t.hotScore >= 80);
  }

  return filtered;
});

const recommendedTags = computed(() => {
  return trendTags.filter((t) => t.recommended);
});

// ============================================================
// Methods
// ============================================================

function selectTag(tag: string) {
  emit("select", tag);
}

function isSelected(tag: string): boolean {
  return props.selectedTags.includes(tag);
}

function getTrendIcon(trend: "rising" | "stable" | "declining") {
  switch (trend) {
    case "rising":
      return TrendingUp;
    case "declining":
      return TrendingDown;
    default:
      return null;
  }
}

function getTrendColor(trend: "rising" | "stable" | "declining"): string {
  switch (trend) {
    case "rising":
      return "text-emerald-500";
    case "declining":
      return "text-red-500";
    default:
      return "text-gray-400";
  }
}
</script>

<template>
  <div class="h-full flex flex-col bg-white dark:bg-gray-900">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
      <div class="flex items-center gap-2">
        <Flame class="w-5 h-5 text-amber-500" />
        <h3 class="font-semibold text-gray-900 dark:text-white">市场趋势</h3>
      </div>
      <button
        class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        @click="emit('close')"
      >
        <X class="w-4 h-4 text-gray-400" />
      </button>
    </div>

    <!-- Search & Filter -->
    <div class="px-4 py-3 space-y-3 border-b border-gray-100 dark:border-gray-800">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索题材..."
        class="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
      />

      <div class="flex gap-2">
        <button
          v-for="filter in [
            { id: 'all', name: '全部' },
            { id: 'rising', name: '上升' },
            { id: 'hot', name: '热门' },
          ]"
          :key="filter.id"
          class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          :class="[
            activeFilter === filter.id
              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
          ]"
          @click="activeFilter = filter.id as any"
        >
          {{ filter.name }}
        </button>
      </div>
    </div>

    <!-- Recommended Tags -->
    <div v-if="recommendedTags.length > 0" class="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
      <div class="flex items-center gap-2 mb-2">
        <Star class="w-4 h-4 text-amber-500" />
        <span class="text-xs font-medium text-gray-700 dark:text-gray-300">编辑推荐</span>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="tag in recommendedTags"
          :key="tag.id"
          class="px-3 py-1.5 rounded-lg text-sm bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:shadow-md transition-all"
          @click="selectTag(tag.name)"
        >
          {{ tag.name }}
        </button>
      </div>
    </div>

    <!-- Tags by Category -->
    <div class="flex-1 overflow-y-auto">
      <div v-for="category in categories" :key="category" class="px-4 py-3 border-b border-gray-50 dark:border-gray-800">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {{ category }}
          </span>
          <div class="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
        </div>
        <div class="space-y-2">
          <button
            v-for="tag in filteredTags.filter(t => t.category === category)"
            :key="tag.id"
            class="w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-all"
            :class="[
              isSelected(tag.name)
                ? 'bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700'
                : 'bg-gray-50 dark:bg-gray-800/50 border border-transparent hover:border-gray-200 dark:hover:border-gray-700',
            ]"
            @click="selectTag(tag.name)"
          >
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-gray-900 dark:text-white">
                  {{ tag.name }}
                </span>
                <component
                  v-if="getTrendIcon(tag.trend)"
                  :is="getTrendIcon(tag.trend)"
                  class="w-3.5 h-3.5"
                  :class="getTrendColor(tag.trend)"
                />
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                {{ tag.description }}
              </p>
            </div>
            <div class="text-right flex-shrink-0">
              <div class="text-sm font-semibold text-gray-900 dark:text-white">
                {{ tag.hotScore }}
              </div>
              <div class="text-xs" :class="tag.growth >= 0 ? 'text-emerald-500' : 'text-red-500'">
                {{ tag.growth >= 0 ? '+' : '' }}{{ tag.growth }}%
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-800">
      <p class="text-xs text-gray-400 dark:text-gray-500 text-center">
        数据更新时间：每周一更新
      </p>
    </div>
  </div>
</template>

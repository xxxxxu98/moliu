<script setup lang="ts">
/**
 * TemplateMarket - 模板市场组件
 * Moliu v2.0 - 提供创作模板选择
 */
import { ref, computed } from "vue";
import { Search, Filter, Star, TrendingUp, Sparkles, X } from "lucide-vue-next";

// ============================================================
// Types
// ============================================================

interface WritingTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: string;
  tags: string[];
  usageCount: number;
  rating: number;
  isHot?: boolean;
  isNew?: boolean;
  prompt: string;
}

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  selectedTemplateId?: string;
}

interface Emits {
  (e: "select", template: WritingTemplate): void;
  (e: "close"): void;
}

const props = withDefaults(defineProps<Props>(), {
  selectedTemplateId: undefined,
});

const emit = defineEmits<Emits>();

// ============================================================
// State
// ============================================================

const searchQuery = ref("");
const selectedCategory = ref<string | null>(null);
const sortBy = ref<"popular" | "rating" | "newest">("popular");

// ============================================================
// Data
// ============================================================

const templates: WritingTemplate[] = [
  // 玄幻仙侠
  {
    id: "tpl-xianxia-1",
    name: "废物流逆袭",
    icon: "💫",
    description: "资质平凡的主角获得金手指，一路逆袭打脸",
    category: "玄幻仙侠",
    tags: ["废柴", "逆袭", "打脸", "升级"],
    usageCount: 12580,
    rating: 4.8,
    isHot: true,
    prompt: "请生成一个废物流逆袭的玄幻小说大纲，包含主角资质平凡、获得传承或系统、逐步升级打脸的经典情节。",
  },
  {
    id: "tpl-xianxia-2",
    name: "洪荒崛起",
    icon: "🌋",
    description: "穿越到洪荒世界，建立势力征战诸天",
    category: "玄幻仙侠",
    tags: ["洪荒", "穿越", "势力", "诸天"],
    usageCount: 8932,
    rating: 4.7,
    isHot: true,
    prompt: "请生成一个洪荒背景的小说大纲，主角穿越到上古洪荒世界，通过建立势力、收服弟子、征战诸天来崛起。",
  },
  {
    id: "tpl-xianxia-3",
    name: "剑道至尊",
    icon: "⚔️",
    description: "以剑证道，一剑破万法",
    category: "玄幻仙侠",
    tags: ["剑修", "热血", "宗门", "大比"],
    usageCount: 6543,
    rating: 4.6,
    prompt: "请生成一个剑道修仙的小说大纲，主角专精剑道，通过宗门大比、遗迹探险等方式不断提升。",
  },
  {
    id: "tpl-xianxia-4",
    name: "都市修仙",
    icon: "🌃",
    description: "灵气复苏，主角在现代都市中修仙",
    category: "玄幻仙侠",
    tags: ["都市", "灵气复苏", "修仙", "都市传说"],
    usageCount: 11234,
    rating: 4.9,
    isHot: true,
    isNew: true,
    prompt: "请生成一个都市修仙小说大纲，主角在现代都市中发现灵气复苏，通过修仙解决各种灵异事件。",
  },

  // 都市言情
  {
    id: "tpl-urban-1",
    name: "甜宠总裁",
    icon: "💕",
    description: "霸道总裁与女主甜蜜互宠",
    category: "都市言情",
    tags: ["总裁", "甜宠", "误会", "HE"],
    usageCount: 15678,
    rating: 4.9,
    isHot: true,
    prompt: "请生成一个甜宠总裁文大纲，霸道总裁与女主从误会到相爱的过程，包含各种甜蜜互动和误会解除。",
  },
  {
    id: "tpl-urban-2",
    name: "重生复仇",
    icon: "⏰",
    description: "重生回到过去，弥补遗憾复仇渣男",
    category: "都市言情",
    tags: ["重生", "复仇", "豪门", "爽文"],
    usageCount: 9876,
    rating: 4.7,
    isHot: true,
    prompt: "请生成一个重生复仇小说大纲，女主重生回到过去，弥补上一世遗憾，对付渣男绿茶。",
  },
  {
    id: "tpl-urban-3",
    name: "马甲大佬",
    icon: "🎭",
    description: "女主隐藏身份，男主追妻火葬场",
    category: "都市言情",
    tags: ["马甲", "追妻", "身份", "反转"],
    usageCount: 8234,
    rating: 4.6,
    prompt: "请生成一个马甲文大纲，女主有隐藏身份，男主发现后追妻火葬场。",
  },

  // 科幻星际
  {
    id: "tpl-scifi-1",
    name: "星际领主",
    icon: "🚀",
    description: "建立星际帝国，征服星辰大海",
    category: "科幻星际",
    tags: ["星际", "领主", "战争", "科幻"],
    usageCount: 7654,
    rating: 4.5,
    prompt: "请生成一个星际科幻小说大纲，主角在星际时代建立势力，逐步征服星辰大海。",
  },
  {
    id: "tpl-scifi-2",
    name: "赛博朋克",
    icon: "🤖",
    description: "高科技低生活的赛博世界",
    category: "科幻星际",
    tags: ["赛博", "机械", "黑客", "都市"],
    usageCount: 5432,
    rating: 4.4,
    isNew: true,
    prompt: "请生成一个赛博朋克小说大纲，高科技低生活的未来世界，主角作为黑客在夹缝中生存。",
  },

  // 悬疑推理
  {
    id: "tpl-mystery-1",
    name: "心理罪者",
    icon: "🔍",
    description: "犯罪心理学专家破解疑难案件",
    category: "悬疑推理",
    tags: ["推理", "心理", "破案", "刑侦"],
    usageCount: 6789,
    rating: 4.8,
    prompt: "请生成一个推理小说大纲，主角是犯罪心理学专家，通过心理分析破解各种疑难案件。",
  },
  {
    id: "tpl-mystery-2",
    name: "灵异事务所",
    icon: "👻",
    description: "处理各种灵异事件的特殊事务所",
    category: "悬疑推理",
    tags: ["灵异", "都市", "超自然", "探险"],
    usageCount: 6543,
    rating: 4.6,
    prompt: "请生成一个灵异小说大纲，主角经营一家处理灵异事件的事务所，遇见各种超自然事件。",
  },

  // 历史穿越
  {
    id: "tpl-historical-1",
    name: "宫墙之内",
    icon: "👑",
    description: "穿越到古代皇宫的宫斗故事",
    category: "历史穿越",
    tags: ["宫斗", "穿越", "权谋", "皇帝"],
    usageCount: 11234,
    rating: 4.7,
    isHot: true,
    prompt: "请生成一个宫斗小说大纲，女主穿越到古代皇宫，与各路妃嫔斗智斗勇，最终获得帝王宠爱。",
  },
  {
    id: "tpl-historical-2",
    name: "王爷宠妃",
    icon: "🕊️",
    description: "穿越女与王爷的甜蜜日常",
    category: "历史穿越",
    tags: ["穿越", "王爷", "甜宠", "古风"],
    usageCount: 9876,
    rating: 4.8,
    prompt: "请生成一个穿越古言小说大纲，女主穿越后与王爷相遇，从欢喜冤家到甜蜜相爱。",
  },
];

// ============================================================
// Computed
// ============================================================

const categories = computed(() => {
  const cats = [...new Set(templates.map((t) => t.category))];
  return cats;
});

const filteredTemplates = computed(() => {
  let result = templates;

  // 搜索过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }

  // 分类过滤
  if (selectedCategory.value) {
    result = result.filter((t) => t.category === selectedCategory.value);
  }

  // 排序
  switch (sortBy.value) {
    case "popular":
      result = [...result].sort((a, b) => b.usageCount - a.usageCount);
      break;
    case "rating":
      result = [...result].sort((a, b) => b.rating - a.rating);
      break;
    case "newest":
      result = [...result].sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
      break;
  }

  return result;
});

const hotTemplates = computed(() => {
  return templates.filter((t) => t.isHot).slice(0, 4);
});

// ============================================================
// Methods
// ============================================================

function selectTemplate(template: WritingTemplate) {
  emit("select", template);
}

function selectCategory(category: string | null) {
  selectedCategory.value = category;
}

function formatUsageCount(count: number): string {
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}万`;
  }
  return count.toString();
}
</script>

<template>
  <div class="h-full flex flex-col bg-white dark:bg-gray-900">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
      <div class="flex items-center gap-2">
        <Sparkles class="w-5 h-5 text-indigo-500" />
        <h3 class="font-semibold text-gray-900 dark:text-white">模板市场</h3>
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
      <div class="relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索模板..."
          class="w-full pl-10 pr-4 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
        />
      </div>

      <!-- Categories -->
      <div class="flex gap-2 overflow-x-auto pb-1">
        <button
          class="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
          :class="
            selectedCategory === null
              ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          "
          @click="selectCategory(null)"
        >
          全部
        </button>
        <button
          v-for="cat in categories"
          :key="cat"
          class="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
          :class="
            selectedCategory === cat
              ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          "
          @click="selectCategory(cat)"
        >
          {{ cat }}
        </button>
      </div>

      <!-- Sort -->
      <div class="flex items-center gap-2">
        <Filter class="w-4 h-4 text-gray-400" />
        <select
          v-model="sortBy"
          class="px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 focus:outline-none"
        >
          <option value="popular">最多使用</option>
          <option value="rating">评分最高</option>
          <option value="newest">最新</option>
        </select>
      </div>
    </div>

    <!-- Hot Templates -->
    <div v-if="!searchQuery && !selectedCategory" class="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
      <div class="flex items-center gap-2 mb-2">
        <TrendingUp class="w-4 h-4 text-orange-500" />
        <span class="text-xs font-medium text-gray-700 dark:text-gray-300">热门模板</span>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="template in hotTemplates"
          :key="template.id"
          class="p-3 rounded-xl bg-gradient-to-br text-left transition-all duration-200 relative"
          :class="[
            selectedTemplateId === template.id
              ? 'ring-2 ring-white'
              : 'hover:scale-[1.02]',
          ]"
          @click="selectTemplate(template)"
        >
          <div class="absolute top-1.5 right-1.5 flex gap-1">
            <span v-if="template.isHot" class="px-1.5 py-0.5 rounded text-xs bg-orange-500 text-white">
              热
            </span>
            <span v-if="template.isNew" class="px-1.5 py-0.5 rounded text-xs bg-green-500 text-white">
              新
            </span>
          </div>
          <span class="text-lg mb-1 block">{{ template.icon }}</span>
          <span class="text-sm font-medium text-white block">{{ template.name }}</span>
        </button>
      </div>
    </div>

    <!-- Templates List -->
    <div class="flex-1 overflow-y-auto">
      <div class="p-4 space-y-3">
        <div
          v-for="template in filteredTemplates"
          :key="template.id"
          class="p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer"
          :class="[
            selectedTemplateId === template.id
              ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20'
              : 'border-gray-100 dark:border-gray-800 hover:border-indigo-200 dark:hover:border-indigo-800',
          ]"
          @click="selectTemplate(template)"
        >
          <div class="flex items-start justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="text-2xl">{{ template.icon }}</span>
              <div>
                <h4 class="font-medium text-gray-900 dark:text-white">{{ template.name }}</h4>
                <p class="text-xs text-gray-500 dark:text-gray-400">{{ template.category }}</p>
              </div>
            </div>
            <div class="flex items-center gap-1 text-amber-500">
              <Star class="w-4 h-4 fill-current" />
              <span class="text-sm font-medium">{{ template.rating }}</span>
            </div>
          </div>

          <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
            {{ template.description }}
          </p>

          <div class="flex items-center justify-between">
            <div class="flex flex-wrap gap-1">
              <span
                v-for="tag in template.tags.slice(0, 3)"
                :key="tag"
                class="px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              >
                {{ tag }}
              </span>
            </div>
            <span class="text-xs text-gray-400">
              {{ formatUsageCount(template.usageCount) }}人使用
            </span>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="filteredTemplates.length === 0" class="text-center py-8">
          <Sparkles class="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p class="text-sm text-gray-500 dark:text-gray-400">
            未找到匹配的模板
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

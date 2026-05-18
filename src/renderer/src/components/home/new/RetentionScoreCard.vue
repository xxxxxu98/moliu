<script setup lang="ts">
/**
 * 追读力评分卡片 (RetentionScoreCard)
 * Moliu v2.0 - 六维追读力评分展示组件
 * 
 * 基于 Read Retention Score 系统的六维评估：
 * - Hook Score: 开篇钩子吸引力
 * - Coolpoint Score: 爽点密度与强度
 * - Micro-Fulfillment: 微成就满足感
 * - Suspense Debt: 悬念债务（需控制在合理范围）
 * - Rhythm Health: 节奏健康度
 * - Originality: 原创性/差异化
 */
import { computed } from "vue";
import { Flame, Zap, Trophy, Clock, Heart, Sparkles } from "lucide-vue-next";
import { GENRE_PROFILES, matchGenreProfile } from "@/data/genre-profiles";
import type { ReadRetentionScore, HookType, CoolPointType } from "@/types/evaluation";

// ============================================================
// Props
// ============================================================

interface Props {
  tags: string[];
  elements: string[];
  hooks?: HookType[];
  coolPoints?: CoolPointType[];
  compact?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  tags: () => [],
  elements: () => [],
  hooks: () => [],
  coolPoints: () => [],
  compact: false,
});

// ============================================================
// 计算追读力评分
// ============================================================

const retentionScore = computed<ReadRetentionScore>(() => {
  // 基于选中的标签和元素计算评分
  const profile = matchGenreProfile(props.tags);
  
  // Hook Score: 基于题材和钩子类型
  let hookScore = profile?.hooks.opening.length ? 3.5 : 3.0;
  if (props.hooks.includes("question") || props.hooks.includes("conflict")) {
    hookScore += 0.5;
  }
  if (props.hooks.includes("mystery") || props.hooks.includes("tension")) {
    hookScore += 0.5;
  }
  
  // Coolpoint Score: 基于爽点类型
  let coolpointScore = profile?.coolpoints.primary.length ? 3.5 : 3.0;
  if (props.coolPoints.includes("face_slapping") || props.coolPoints.includes("reversal")) {
    coolpointScore += 0.5;
  }
  if (props.coolPoints.includes("growth_breakthrough")) {
    coolpointScore += 0.3;
  }
  
  // Micro-Fulfillment: 基于元素
  let microFulfillment = 3.0;
  if (props.elements.includes("系统流") || props.elements.includes("任务")) {
    microFulfillment += 0.5;
  }
  if (props.elements.includes("升级") || props.elements.includes("成长")) {
    microFulfillment += 0.3;
  }
  
  // Suspense Debt: 反向（悬念债务越低越好）
  let suspenseDebt = 2.5; // 默认中等
  if (props.hooks.includes("mystery") || props.hooks.includes("tension")) {
    suspenseDebt += 0.5; // 高悬念 = 高债务风险
  }
  if (props.elements.includes("身世之谜") || props.elements.includes("身份伪装")) {
    suspenseDebt += 0.3;
  }
  
  // Rhythm Health: 基于元素组合
  let rhythmHealth = 3.2;
  if (props.elements.includes("节奏快") || props.elements.includes("爽文")) {
    rhythmHealth += 0.3;
  }
  
  // Originality: 基于标签组合
  let originality = 2.5;
  if (props.tags.length >= 2) {
    originality += 0.3; // 多标签组合 = 更高原创性
  }
  if (props.tags.includes("创新") || props.tags.includes("融合")) {
    originality += 0.5;
  }

  return {
    hookScore: Math.min(5, Math.max(1, hookScore)),
    coolpointScore: Math.min(5, Math.max(1, coolpointScore)),
    microFulfillment: Math.min(5, Math.max(1, microFulfillment)),
    suspenseDebt: Math.min(5, Math.max(1, suspenseDebt)),
    rhythmHealth: Math.min(5, Math.max(1, rhythmHealth)),
    originality: Math.min(5, Math.max(1, originality)),
  };
});

// ============================================================
// 计算综合追读力指数
// ============================================================

const retentionIndex = computed(() => {
  const { hookScore, coolpointScore, microFulfillment, suspenseDebt, rhythmHealth, originality } = retentionScore.value;
  
  // 综合评分 = Hook(25%) + Coolpoint(25%) + MicroFulfillment(15%) + Rhythm(15%) + Originality(15%) - SuspenseDebt(5%)
  const score = (
    hookScore * 0.25 +
    coolpointScore * 0.25 +
    microFulfillment * 0.15 +
    rhythmHealth * 0.15 +
    originality * 0.15 -
    suspenseDebt * 0.05
  );
  
  return Math.round(score * 10) / 10;
});

// ============================================================
// 评分等级
// ============================================================

const scoreLevel = computed(() => {
  const score = retentionIndex.value;
  if (score >= 4.0) return { text: "极强追读", color: "text-emerald-600", bg: "bg-emerald-100", gradient: "from-emerald-500 to-teal-600" };
  if (score >= 3.5) return { text: "强追读", color: "text-blue-600", bg: "bg-blue-100", gradient: "from-blue-500 to-indigo-600" };
  if (score >= 3.0) return { text: "中等追读", color: "text-amber-600", bg: "bg-amber-100", gradient: "from-amber-500 to-orange-600" };
  return { text: "待优化", color: "text-red-600", bg: "bg-red-100", gradient: "from-red-500 to-rose-600" };
});

// ============================================================
// 维度详情
// ============================================================

const dimensions = computed(() => [
  {
    id: "hookScore",
    name: "钩子力",
    icon: Flame,
    value: retentionScore.value.hookScore,
    max: 5,
    description: "开篇吸引读者的能力",
    color: "#ef4444",
    gradient: "from-red-500 to-orange-500",
  },
  {
    id: "coolpointScore",
    name: "爽点力",
    icon: Zap,
    value: retentionScore.value.coolpointScore,
    max: 5,
    description: "情节爽点的密度与强度",
    color: "#f59e0b",
    gradient: "from-amber-500 to-yellow-500",
  },
  {
    id: "microFulfillment",
    name: "微成就",
    icon: Trophy,
    value: retentionScore.value.microFulfillment,
    max: 5,
    description: "小目标达成的满足感",
    color: "#10b981",
    gradient: "from-emerald-500 to-teal-500",
  },
  {
    id: "suspenseDebt",
    name: "悬念债",
    icon: Clock,
    value: retentionScore.value.suspenseDebt,
    max: 5,
    description: "悬念管理（越低越好）",
    color: "#8b5cf6",
    gradient: "from-violet-500 to-purple-600",
    inverse: true,
  },
  {
    id: "rhythmHealth",
    name: "节奏感",
    icon: Heart,
    value: retentionScore.value.rhythmHealth,
    max: 5,
    description: "叙事节奏的健康程度",
    color: "#ec4899",
    gradient: "from-pink-500 to-rose-500",
  },
  {
    id: "originality",
    name: "差异化",
    icon: Sparkles,
    value: retentionScore.value.originality,
    max: 5,
    description: "与市场作品的差异化",
    color: "#3b82f6",
    gradient: "from-blue-500 to-indigo-600",
  },
]);

// ============================================================
// 方法
// ============================================================

function getBarColor(value: number, inverse?: boolean): string {
  if (inverse) {
    // 悬念债越低越好
    if (value <= 2) return "bg-emerald-500";
    if (value <= 3) return "bg-blue-500";
    if (value <= 4) return "bg-amber-500";
    return "bg-red-500";
  }
  if (value >= 4) return "bg-emerald-500";
  if (value >= 3) return "bg-blue-500";
  if (value >= 2) return "bg-amber-500";
  return "bg-red-500";
}

function getTextColor(value: number): string {
  if (value >= 4) return "text-emerald-600";
  if (value >= 3) return "text-blue-600";
  if (value >= 2) return "text-amber-600";
  return "text-red-600";
}

// ============================================================
// Suggestions
// ============================================================

const suggestions = computed(() => {
  const suggestions: string[] = [];
  const score = retentionScore.value;
  
  if (score.hookScore < 3) {
    suggestions.push("建议使用强冲突或疑问式开篇，提升钩子力");
  }
  if (score.coolpointScore < 3) {
    suggestions.push("考虑增加打脸、逆转等爽点元素");
  }
  if (score.microFulfillment < 3) {
    suggestions.push("添加系统流或任务机制增加微成就");
  }
  if (score.suspenseDebt > 4) {
    suggestions.push("悬念过多，建议适时释放部分剧情");
  }
  if (score.rhythmHealth < 3) {
    suggestions.push("注意节奏变化，避免拖沓");
  }
  if (score.originality < 3) {
    suggestions.push("尝试多标签融合增加差异化");
  }
  
  return suggestions.slice(0, 3);
});
</script>

<template>
  <div class="p-4 rounded-xl bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 border border-cyan-200 dark:border-cyan-800">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
          <Zap class="w-4 h-4 text-white" />
        </div>
        <div>
          <h4 class="text-sm font-semibold text-cyan-700 dark:text-cyan-400">追读力评估</h4>
          <p class="text-xs text-cyan-600 dark:text-cyan-500">六维追读力评分</p>
        </div>
      </div>
      <div class="text-right">
        <div class="flex items-center gap-2">
          <span class="text-2xl font-bold" :class="scoreLevel.color">{{ retentionIndex }}</span>
          <span class="text-sm text-cyan-600 dark:text-cyan-500">/5</span>
        </div>
        <span class="px-2 py-0.5 rounded text-xs font-medium" :class="[scoreLevel.color, scoreLevel.bg]">
          {{ scoreLevel.text }}
        </span>
      </div>
    </div>

    <!-- Dimensions Grid -->
    <div class="grid grid-cols-2 gap-3 mb-4">
      <div
        v-for="dim in dimensions"
        :key="dim.id"
        class="p-2.5 rounded-lg bg-white/60 dark:bg-gray-800/60 border border-cyan-100 dark:border-cyan-800"
      >
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-1.5">
            <component :is="dim.icon" class="w-3.5 h-3.5" :style="{ color: dim.color }" />
            <span class="text-xs font-medium text-gray-700 dark:text-gray-300">{{ dim.name }}</span>
          </div>
          <span class="text-sm font-semibold" :class="getTextColor(dim.value)">
            {{ dim.value.toFixed(1) }}
          </span>
        </div>
        <div class="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-500 ease-out"
            :class="getBarColor(dim.value, dim.inverse)"
            :style="{ width: `${(dim.value / dim.max) * 100}%` }"
          />
        </div>
        <p v-if="!compact" class="text-xs text-gray-400 dark:text-gray-500 mt-1">
          {{ dim.description }}
        </p>
      </div>
    </div>

    <!-- Suggestions -->
    <div v-if="!compact && suggestions.length > 0" class="pt-3 border-t border-cyan-200 dark:border-cyan-700">
      <p class="text-xs text-cyan-600 dark:text-cyan-500 mb-2 font-medium">优化建议：</p>
      <ul class="space-y-1">
        <li v-for="(suggestion, index) in suggestions" :key="index" class="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
          <span class="text-cyan-500 mt-0.5">•</span>
          {{ suggestion }}
        </li>
      </ul>
    </div>

    <!-- Compact Mode: Just show mini bars -->
    <div v-if="compact" class="flex gap-1">
      <div
        v-for="dim in dimensions"
        :key="dim.id"
        class="flex-1 flex flex-col items-center gap-0.5"
      >
        <div class="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full"
            :class="getBarColor(dim.value, dim.inverse)"
            :style="{ width: `${(dim.value / dim.max) * 100}%` }"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { TrendingUp } from 'lucide-vue-next';
import type { FiveDimensionEvaluation } from '@/types/inspiration';

const props = defineProps<{
  evaluation: FiveDimensionEvaluation;
  compact?: boolean;
}>();

const dimensions = [
  { 
    id: 'originality' as const, 
    name: '原创性', 
    icon: '✨',
    description: '市场同质化程度',
    color: '#8b5cf6',
    gradient: 'from-violet-500 to-purple-600'
  },
  { 
    id: 'marketPotential' as const, 
    name: '市场', 
    icon: '📈',
    description: '读者群体规模',
    color: '#f59e0b',
    gradient: 'from-amber-500 to-orange-600'
  },
  { 
    id: 'expandability' as const, 
    name: '扩展性', 
    icon: '🌱',
    description: '能否支撑长篇',
    color: '#10b981',
    gradient: 'from-emerald-500 to-teal-600'
  },
  { 
    id: 'difficulty' as const, 
    name: '难度', 
    icon: '⚡',
    description: '设定复杂度',
    color: '#ef4444',
    gradient: 'from-red-500 to-orange-600'
  },
  { 
    id: 'personalMatch' as const, 
    name: '匹配', 
    icon: '🎯',
    description: '知识储备/兴趣',
    color: '#3b82f6',
    gradient: 'from-blue-500 to-indigo-600'
  },
];

// 计算总分
const totalScore = computed(() => {
  return props.evaluation.originality + 
         props.evaluation.marketPotential + 
         props.evaluation.expandability + 
         props.evaluation.difficulty + 
         props.evaluation.personalMatch;
});

// 计算平均分
const averageScore = computed(() => {
  return (totalScore.value / 5).toFixed(1);
});

// 获取评分对应的等级
const scoreLevel = computed(() => {
  const avg = parseFloat(averageScore.value);
  if (avg >= 4) return { text: '高潜力', color: 'text-emerald-600', bg: 'bg-emerald-100' };
  if (avg >= 3) return { text: '中潜力', color: 'text-amber-600', bg: 'bg-amber-100' };
  return { text: '低潜力', color: 'text-red-600', bg: 'bg-red-100' };
});

// 获取分数对应的颜色
function getScoreColor(score: number, isDifficulty: boolean = false): string {
  if (isDifficulty) {
    // 难度是反向的，越低越好
    if (score >= 4) return 'bg-emerald-500';
    if (score >= 3) return 'bg-blue-500';
    if (score >= 2) return 'bg-amber-500';
    return 'bg-red-500';
  }
  if (score >= 4) return 'bg-emerald-500';
  if (score >= 3) return 'bg-blue-500';
  if (score >= 2) return 'bg-amber-500';
  return 'bg-red-500';
}

function getScoreTextColor(score: number): string {
  if (score >= 4) return 'text-emerald-600';
  if (score >= 3) return 'text-blue-600';
  if (score >= 2) return 'text-amber-600';
  return 'text-red-600';
}
</script>

<template>
  <div class="space-y-3">
    <!-- 总分概览 -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span 
          class="px-2 py-0.5 rounded-full text-xs font-medium"
          :class="[scoreLevel.color, scoreLevel.bg]"
        >
          {{ scoreLevel.text }}
        </span>
        <span class="text-xs text-gray-500">综合评估</span>
      </div>
      <div class="flex items-center gap-1">
        <span class="text-xl font-bold text-gray-900 dark:text-white">{{ averageScore }}</span>
        <span class="text-xs text-gray-400">/5</span>
      </div>
    </div>

    <!-- 五维评分条 -->
    <div class="space-y-2.5">
      <div 
        v-for="dim in dimensions" 
        :key="dim.id"
        class="flex items-center gap-3"
      >
        <!-- 图标和名称 -->
        <div class="w-16 flex-shrink-0 flex items-center gap-1">
          <span class="text-sm">{{ dim.icon }}</span>
          <span class="text-xs text-gray-600 dark:text-gray-400">{{ dim.name }}</span>
        </div>
        
        <!-- 进度条 -->
        <div class="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div 
            class="h-full rounded-full transition-all duration-500 ease-out"
            :class="getScoreColor(evaluation[dim.id], dim.id === 'difficulty')"
            :style="{ width: `${(evaluation[dim.id] / 5) * 100}%` }"
          ></div>
        </div>
        
        <!-- 分数 -->
        <div class="w-6 text-right">
          <span 
            class="text-sm font-semibold"
            :class="getScoreTextColor(evaluation[dim.id])"
          >
            {{ evaluation[dim.id] }}
          </span>
        </div>
      </div>
    </div>

    <!-- 紧凑模式下隐藏详情 -->
    <template v-if="!compact">
      <!-- 评估说明 -->
      <div class="pt-2 border-t border-gray-100 dark:border-gray-700">
        <div class="text-xs text-gray-400 space-y-1">
          <p>
            <span class="text-violet-500">✨ 原创性：</span>
            创意独特程度，与同类作品的差异化
          </p>
          <p>
            <span class="text-amber-500">📈 市场：</span>
            目标读者群体的大小和付费意愿
          </p>
          <p>
            <span class="text-emerald-500">🌱 扩展性：</span>
            能否支撑30万字以上的长篇故事
          </p>
          <p>
            <span class="text-red-500">⚡ 难度：</span>
            设定复杂度，越低越容易驾驭
          </p>
          <p>
            <span class="text-blue-500">🎯 匹配：</span>
            与你知识储备和兴趣爱好的契合度
          </p>
        </div>
      </div>
    </template>
  </div>
</template>

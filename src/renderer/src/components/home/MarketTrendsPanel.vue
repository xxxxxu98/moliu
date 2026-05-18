<script setup lang="ts">
import { ref, computed } from 'vue';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Star,
  AlertTriangle,
  CheckCircle,
  Info,
  ExternalLink
} from 'lucide-vue-next';
import { NModal, NButton } from 'naive-ui';
import { 
  platforms, 
  genreTrends, 
  tagCombos, 
  readerTrends,
  getLifecycleName,
  getLifecycleColor,
  getRiskColor,
  getPotentialColor,
  type GenreLifecycle
} from '@/data/market-trends';

const props = defineProps<{
  selectedTags?: string[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'select', tag: string): void;
}>();

// 状态
const showModal = ref(true);
const activeTab = ref<'genre' | 'platform' | 'combo' | 'reader'>('genre');

// 根据选中标签推荐趋势
const recommendedGenres = computed(() => {
  if (!props.selectedTags || props.selectedTags.length === 0) {
    return genreTrends.filter(t => t.lifecycle === 'rising' || t.lifecycle === 'peak').slice(0, 3);
  }
  
  return genreTrends.filter(trend => 
    trend.hotTags.some(tag => 
      props.selectedTags!.some(selected => 
        tag.includes(selected) || selected.includes(tag)
      )
    )
  ).slice(0, 3);
});

// 获取生命周期图标
function getLifecycleIcon(lifecycle: GenreLifecycle) {
  switch (lifecycle) {
    case 'emerging':
      return '🌟';
    case 'rising':
      return '📈';
    case 'peak':
      return '🔥';
    case 'declining':
      return '📉';
    case 'saturated':
      return '⚠️';
    default:
      return '❓';
  }
}

// 获取风险图标
function getRiskIcon(risk: 'low' | 'medium' | 'high') {
  switch (risk) {
    case 'low':
      return '✅';
    case 'medium':
      return '⚠️';
    case 'high':
      return '🚨';
    default:
      return '❓';
  }
}

// 关闭
function handleClose() {
  showModal.value = false;
  emit('close');
}

// 选择标签
function handleSelectTag(tag: string) {
  emit('select', tag);
}
</script>

<template>
  <NModal
    v-model:show="showModal"
    preset="card"
    title="市场趋势分析"
    :style="{ width: '900px', maxHeight: '80vh' }"
    :mask-closable="false"
    @close="handleClose"
  >
    <div class="space-y-4">
      <!-- 推荐趋势 -->
      <div class="p-3 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800">
        <div class="flex items-center gap-2 mb-2">
          <TrendingUp class="w-4 h-4 text-amber-500" />
          <span class="text-sm font-medium text-amber-700 dark:text-amber-400">为你推荐</span>
        </div>
        <div class="flex flex-wrap gap-2">
          <NButton
            v-for="genre in recommendedGenres"
            :key="genre.id"
            size="small"
            @click="handleSelectTag(genre.name)"
          >
            {{ genre.icon }} {{ genre.name }}
          </NButton>
        </div>
      </div>

      <!-- Tab切换 -->
      <div class="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
        <button
          v-for="tab in [
            { id: 'genre', label: '题材趋势' },
            { id: 'platform', label: '平台分析' },
            { id: 'combo', label: '标签组合' },
            { id: 'reader', label: '读者偏好' }
          ]"
          :key="tab.id"
          class="flex-1 py-1.5 text-sm font-medium rounded-md transition-all"
          :class="activeTab === tab.id
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
          @click="activeTab = tab.id as any"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- 题材趋势 Tab -->
      <div v-if="activeTab === 'genre'" class="space-y-3 max-h-[50vh] overflow-y-auto">
        <div 
          v-for="genre in genreTrends" 
          :key="genre.id"
          class="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
        >
          <div class="flex items-start gap-3">
            <span class="text-3xl">{{ getLifecycleIcon(genre.lifecycle) }}</span>
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <h4 class="font-medium text-gray-900 dark:text-white">{{ genre.name }}</h4>
                <span 
                  class="px-2 py-0.5 rounded text-xs font-medium"
                  :class="getLifecycleColor(genre.lifecycle)"
                >
                  {{ getLifecycleName(genre.lifecycle) }}
                </span>
                <span 
                  class="px-2 py-0.5 rounded text-xs font-medium"
                  :class="getRiskColor(genre.riskLevel)"
                >
                  {{ getRiskIcon(genre.riskLevel) }} 
                  {{ genre.riskLevel === 'low' ? '低风险' : genre.riskLevel === 'medium' ? '中风险' : '高风险' }}
                </span>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">{{ genre.description }}</p>
              
              <div class="flex flex-wrap gap-1 mb-2">
                <NButton
                  v-for="tag in genre.hotTags" 
                  :key="tag"
                  size="tiny"
                  quaternary
                  type="info"
                  @click="handleSelectTag(tag)"
                >
                  {{ tag }}
                </NButton>
              </div>
              
              <p class="text-xs text-indigo-600 dark:text-indigo-400 flex items-start gap-1">
                <Info class="w-3 h-3 flex-shrink-0 mt-0.5" />
                {{ genre.suggestion }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- 平台分析 Tab -->
      <div v-if="activeTab === 'platform'" class="space-y-3 max-h-[50vh] overflow-y-auto">
        <div 
          v-for="platform in platforms" 
          :key="platform.id"
          class="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
        >
          <div class="flex items-start gap-3">
            <span class="text-3xl">{{ platform.icon }}</span>
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <h4 class="font-medium text-gray-900 dark:text-white">{{ platform.name }}</h4>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">{{ platform.description }}</p>
              
              <div class="grid grid-cols-2 gap-2 text-xs mb-2">
                <div>
                  <span class="text-gray-400">读者群体：</span>
                  <span class="text-gray-600 dark:text-gray-400">{{ platform.readerBase }}</span>
                </div>
                <div>
                  <span class="text-gray-400">变现方式：</span>
                  <span class="text-gray-600 dark:text-gray-400">{{ platform.monetization }}</span>
                </div>
              </div>
              
              <div class="flex flex-wrap gap-1 mb-2">
                <span class="text-xs text-gray-400">热门题材：</span>
                <NButton
                  v-for="tag in platform.hotGenres" 
                  :key="tag"
                  size="tiny"
                  quaternary
                  type="primary"
                  @click="handleSelectTag(tag)"
                >
                  {{ tag }}
                </NButton>
              </div>
              
              <p class="text-xs text-gray-500 dark:text-gray-400 italic">
                特点：{{ platform.characteristics }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- 标签组合 Tab -->
      <div v-if="activeTab === 'combo'" class="space-y-3 max-h-[50vh] overflow-y-auto">
        <div 
          v-for="combo in tagCombos" 
          :key="combo.id"
          class="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
        >
          <div class="flex items-start justify-between mb-2">
            <div class="flex items-center gap-2">
              <h4 class="font-medium text-gray-900 dark:text-white">{{ combo.name }}</h4>
              <span 
                class="px-2 py-0.5 rounded text-xs font-medium"
                :class="getPotentialColor(combo.potential)"
              >
                {{ combo.potential === 'high' ? '⭐ 高潜力' : combo.potential === 'medium' ? '中潜力' : '低潜力' }}
              </span>
            </div>
          </div>
          
          <div class="flex flex-wrap gap-1 mb-2">
            <NButton
              v-for="tag in combo.tags" 
              :key="tag"
              size="tiny"
              quaternary
              type="warning"
              @click="handleSelectTag(tag)"
            >
              {{ tag }}
            </NButton>
          </div>
          
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">{{ combo.description }}</p>
          
          <p class="text-xs text-gray-500 dark:text-gray-400 italic">
            代表作：{{ combo.example }}
          </p>
        </div>
      </div>

      <!-- 读者偏好 Tab -->
      <div v-if="activeTab === 'reader'" class="space-y-3 max-h-[50vh] overflow-y-auto">
        <div class="grid grid-cols-2 gap-3">
          <div 
            v-for="trend in readerTrends" 
            :key="trend.trend"
            class="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
          >
            <div class="flex items-center gap-2 mb-2">
              <span 
                class="px-2 py-0.5 rounded text-xs font-medium"
                :class="trend.impact === 'positive' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'"
              >
                {{ trend.impact === 'positive' ? '📈 有利' : '📉 挑战' }}
              </span>
              <h4 class="font-medium text-gray-900 dark:text-white">{{ trend.trend }}</h4>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">{{ trend.description }}</p>
            <p class="text-xs text-indigo-600 dark:text-indigo-400 italic">
              例子：{{ trend.example }}
            </p>
          </div>
        </div>
      </div>

      <!-- 底部操作 -->
      <div class="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
        <NButton type="default" @click="handleClose">
          关闭
        </NButton>
      </div>
    </div>
  </NModal>
</template>

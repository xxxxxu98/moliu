<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { NCard, NButton, NInput, NSelect, NTag, NEmpty, NProgress, NModal, NPopconfirm, useMessage } from 'naive-ui';
import { Plus, Trash2, Edit3, Save, X, TrendingUp, Heart, Sparkles, Target, Zap } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/stores/project.store';
import { EMOTION_ARC_LABELS, type EmotionGoal, type EmotionArcType } from '@/types/project';

const { t } = useI18n();
const projectStore = useProjectStore();
const message = useMessage();

// 情绪选项
const emotionOptions = [
  { label: '热血', value: '热血' },
  { label: '甜蜜', value: '甜蜜' },
  { label: '虐心', value: '虐心' },
  { label: '紧张', value: '紧张' },
  { label: '悬疑', value: '悬疑' },
  { label: '治愈', value: '治愈' },
  { label: '搞笑', value: '搞笑' },
  { label: '感动', value: '感动' },
  { label: '恐怖', value: '恐怖' },
  { label: '浪漫', value: '浪漫' },
  { label: '励志', value: '励志' },
  { label: '复仇', value: '复仇' },
];

const arcOptions = computed(() => 
  Object.entries(EMOTION_ARC_LABELS).map(([value, data]) => ({
    label: `${data.label} - ${data.description}`,
    value,
  }))
);

// 编辑状态
const isEditing = ref(false);
const editingGoal = ref<EmotionGoal | null>(null);

// 高点/低点输入
const newHighPoint = ref<number | null>(null);
const newLowPoint = ref<number | null>(null);

// 初始化编辑数据
function initEditData() {
  if (projectStore.emotionGoal) {
    editingGoal.value = JSON.parse(JSON.stringify(projectStore.emotionGoal));
  } else {
    editingGoal.value = {
      id: `emotion-${Date.now()}`,
      primary: '',
      secondary: '',
      arc: 'rising',
      density: 3000,
      highPoints: [],
      lowPoints: [],
    };
  }
}

// 开始编辑
function startEdit() {
  initEditData();
  isEditing.value = true;
}

// 取消编辑
function cancelEdit() {
  isEditing.value = false;
  editingGoal.value = null;
}

// 保存
async function saveGoal() {
  if (!editingGoal.value) return;
  
  if (!editingGoal.value.primary) {
    message.warning('请选择核心情绪');
    return;
  }
  
  await projectStore.updateEmotionGoal(editingGoal.value);
  message.success('情绪目标已保存');
  isEditing.value = false;
}

// 删除
async function deleteGoal() {
  await projectStore.deleteEmotionGoal();
  message.success('情绪目标已删除');
}

// 添加高点章节
function addHighPoint() {
  if (newHighPoint.value && editingGoal.value) {
    const chapter = newHighPoint.value;
    if (!editingGoal.value.highPoints.includes(chapter)) {
      editingGoal.value.highPoints.push(chapter);
      editingGoal.value.highPoints.sort((a, b) => a - b);
    }
    newHighPoint.value = null;
  }
}

// 移除高点章节
function removeHighPoint(chapter: number) {
  if (editingGoal.value) {
    editingGoal.value.highPoints = editingGoal.value.highPoints.filter(h => h !== chapter);
  }
}

// 添加低点章节
function addLowPoint() {
  if (newLowPoint.value && editingGoal.value) {
    const chapter = newLowPoint.value;
    if (!editingGoal.value.lowPoints.includes(chapter)) {
      editingGoal.value.lowPoints.push(chapter);
      editingGoal.value.lowPoints.sort((a, b) => a - b);
    }
    newLowPoint.value = null;
  }
}

// 移除低点章节
function removeLowPoint(chapter: number) {
  if (editingGoal.value) {
    editingGoal.value.lowPoints = editingGoal.value.lowPoints.filter(l => l !== chapter);
  }
}

// 获取情绪弧线颜色
function getArcColor(arc: EmotionArcType): string {
  const colors: Record<EmotionArcType, string> = {
    rising: '#22c55e',
    falling: '#ef4444',
    wave: '#3b82f6',
    mixed: '#8b5cf6',
  };
  return colors[arc] || '#6b7280';
}

// 获取弧线图形数据
const arcChartData = computed(() => {
  if (!projectStore.emotionGoal) return [];
  const { highPoints, lowPoints, arc } = projectStore.emotionGoal;
  const maxChapter = Math.max(...highPoints, ...lowPoints, 30);
  const data: { x: number; y: number; type: 'high' | 'low' | 'mid' }[] = [];
  
  for (let i = 1; i <= Math.min(maxChapter, 50); i++) {
    let y = 50;
    
    if (highPoints.includes(i)) {
      y = 90;
    } else if (lowPoints.includes(i)) {
      y = 20;
    } else {
      // 根据弧线类型计算中间值
      const progress = i / maxChapter;
      switch (arc) {
        case 'rising':
          y = 30 + progress * 50;
          break;
        case 'falling':
          y = 80 - progress * 50;
          break;
        case 'wave':
          y = 50 + Math.sin(progress * Math.PI * 2) * 30;
          break;
        case 'mixed':
          y = 50 + Math.sin(progress * Math.PI * 4) * 25;
          break;
      }
    }
    
    data.push({ x: i, y, type: highPoints.includes(i) ? 'high' : lowPoints.includes(i) ? 'low' : 'mid' });
  }
  
  return data;
});

// 情绪密度建议
const densitySuggestion = computed(() => {
  if (!projectStore.emotionGoal?.density) return '';
  const d = projectStore.emotionGoal.density;
  if (d <= 2000) return '高密度 - 每2000字一个情绪波动，适合快节奏爽文';
  if (d <= 4000) return '中等密度 - 每3000-4000字一个情绪波动，适合大多数网文';
  if (d <= 6000) return '低密度 - 每5000-6000字一个情绪波动，适合慢热型作品';
  return '极低密度 - 适合超长篇或特定风格作品';
});
</script>

<template>
  <div class="space-y-4">
    <!-- 头部 -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
          <Heart class="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 class="font-semibold text-gray-900 dark:text-white">情绪目标</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400">规划故事的核心情绪体验</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <NButton v-if="!projectStore.emotionGoal && !isEditing" size="small" type="primary" @click="startEdit">
          <template #icon>
            <Plus class="w-4 h-4" />
          </template>
          创建
        </NButton>
        <NButton v-if="projectStore.emotionGoal && !isEditing" size="small" @click="startEdit">
          <template #icon>
            <Edit3 class="w-4 h-4" />
          </template>
          编辑
        </NButton>
        <NPopconfirm v-if="projectStore.emotionGoal && !isEditing" @positive-click="deleteGoal">
          <template #trigger>
            <NButton size="small" type="error" quaternary>
              <template #icon>
                <Trash2 class="w-4 h-4" />
              </template>
            </NButton>
          </template>
          确定要删除情绪目标吗？
        </NPopconfirm>
      </div>
    </div>

    <!-- 无数据状态 -->
    <NEmpty v-if="!projectStore.emotionGoal && !isEditing" description="暂无情绪目标" size="small">
      <template #extra>
        <NButton size="small" @click="startEdit">创建情绪目标</NButton>
      </template>
    </NEmpty>

    <!-- 查看模式 -->
    <div v-if="projectStore.emotionGoal && !isEditing" class="space-y-4">
      <!-- 核心情绪 -->
      <div class="p-4 rounded-xl bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/20 border border-pink-200 dark:border-pink-800">
        <div class="flex items-center gap-2 mb-3">
          <Target class="w-4 h-4 text-pink-500" />
          <span class="text-sm font-medium text-pink-700 dark:text-pink-400">核心情绪</span>
        </div>
        <div class="flex items-center gap-3">
          <NTag size="large" type="error" round>
            {{ projectStore.emotionGoal.primary }}
          </NTag>
          <span v-if="projectStore.emotionGoal.secondary" class="text-gray-400">/</span>
          <NTag v-if="projectStore.emotionGoal.secondary" size="large" type="warning" round>
            {{ projectStore.emotionGoal.secondary }}
          </NTag>
        </div>
      </div>

      <!-- 情绪弧线 -->
      <div class="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <div class="flex items-center gap-2 mb-3">
          <TrendingUp class="w-4 h-4 text-blue-500" />
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">情绪弧线</span>
          <NTag size="small" :color="{ color: getArcColor(projectStore.emotionGoal.arc), textColor: '#fff' }">
            {{ EMOTION_ARC_LABELS[projectStore.emotionGoal.arc].label }}
          </NTag>
        </div>
        
        <!-- 简单弧线图 -->
        <div class="h-24 flex items-end gap-1 px-2">
          <div 
            v-for="(point, index) in arcChartData" 
            :key="index"
            class="flex-1 rounded-t transition-all"
            :style="{
              height: `${point.y}%`,
              backgroundColor: point.type === 'high' ? '#ef4444' : point.type === 'low' ? '#3b82f6' : '#e5e7eb',
              minWidth: '2px',
            }"
            :title="`第${point.x}章`"
          />
        </div>
        <div class="flex justify-between mt-1 px-2 text-xs text-gray-400">
          <span>第1章</span>
          <span>第{{ arcChartData.length }}章</span>
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
          {{ EMOTION_ARC_LABELS[projectStore.emotionGoal.arc].description }}
        </p>
      </div>

      <!-- 情绪密度 -->
      <div class="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <div class="flex items-center gap-2 mb-3">
          <Zap class="w-4 h-4 text-amber-500" />
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">情绪密度</span>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ projectStore.emotionGoal.density.toLocaleString() }}
          </span>
          <span class="text-sm text-gray-500">字/次波动</span>
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
          {{ densitySuggestion }}
        </p>
      </div>

      <!-- 情绪高点 -->
      <div class="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <div class="flex items-center gap-2 mb-3">
          <TrendingUp class="w-4 h-4 text-red-500" />
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">情绪高点章节</span>
          <NTag size="small" type="error">{{ projectStore.emotionGoal.highPoints.length }}个</NTag>
        </div>
        <div class="flex flex-wrap gap-2">
          <NTag 
            v-for="chapter in projectStore.emotionGoal.highPoints" 
            :key="chapter"
            type="error"
            closable
            @close="removeHighPoint"
          >
            第{{ chapter }}章
          </NTag>
          <span v-if="projectStore.emotionGoal.highPoints.length === 0" class="text-sm text-gray-400">
            暂无设置
          </span>
        </div>
      </div>

      <!-- 情绪低点 -->
      <div class="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <div class="flex items-center gap-2 mb-3">
          <TrendingUp class="w-4 h-4 text-blue-500" style="transform: rotate(180deg)" />
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">情绪低点章节</span>
          <NTag size="small" type="info">{{ projectStore.emotionGoal.lowPoints.length }}个</NTag>
        </div>
        <div class="flex flex-wrap gap-2">
          <NTag 
            v-for="chapter in projectStore.emotionGoal.lowPoints" 
            :key="chapter"
            type="info"
            closable
            @close="removeLowPoint"
          >
            第{{ chapter }}章
          </NTag>
          <span v-if="projectStore.emotionGoal.lowPoints.length === 0" class="text-sm text-gray-400">
            暂无设置
          </span>
        </div>
      </div>
    </div>

    <!-- 编辑模式 -->
    <div v-if="isEditing && editingGoal" class="space-y-4">
      <NCard size="small" :bordered="false" class="bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/20">
        <div class="space-y-4">
          <!-- 核心情绪 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              核心情绪 *
            </label>
            <NSelect
              v-model:value="editingGoal.primary"
              :options="emotionOptions"
              placeholder="选择核心情绪"
              filterable
            />
          </div>

          <!-- 次要情绪 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              次要情绪
            </label>
            <NSelect
              v-model:value="editingGoal.secondary"
              :options="emotionOptions"
              placeholder="选择次要情绪（可选）"
              filterable
              clearable
            />
          </div>

          <!-- 情绪弧线 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              情绪弧线
            </label>
            <NSelect
              v-model:value="editingGoal.arc"
              :options="arcOptions"
              placeholder="选择情绪弧线类型"
            />
          </div>

          <!-- 情绪密度 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              情绪波动间隔（字数）
            </label>
            <NInput
              v-model:value="editingGoal.density"
              type="number"
              placeholder="每多少字一个情绪波动"
            >
              <template #suffix>
                <span class="text-gray-400">字</span>
              </template>
            </NInput>
            <p class="text-xs text-gray-400 mt-1">
              建议：3000-4000字为中等密度，2000字为高密度
            </p>
          </div>

          <!-- 情绪高点 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              情绪高点章节
            </label>
            <div class="flex flex-wrap gap-2 mb-2">
              <NTag
                v-for="chapter in editingGoal.highPoints"
                :key="chapter"
                type="error"
                closable
                @close="removeHighPoint(chapter)"
              >
                第{{ chapter }}章
              </NTag>
            </div>
            <div class="flex gap-2">
              <NInput
                v-model:value="newHighPoint"
                type="number"
                placeholder="输入章节号"
                @keyup.enter="addHighPoint"
              />
              <NButton @click="addHighPoint">添加</NButton>
            </div>
          </div>

          <!-- 情绪低点 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              情绪低点章节
            </label>
            <div class="flex flex-wrap gap-2 mb-2">
              <NTag
                v-for="chapter in editingGoal.lowPoints"
                :key="chapter"
                type="info"
                closable
                @close="removeLowPoint(chapter)"
              >
                第{{ chapter }}章
              </NTag>
            </div>
            <div class="flex gap-2">
              <NInput
                v-model:value="newLowPoint"
                type="number"
                placeholder="输入章节号"
                @keyup.enter="addLowPoint"
              />
              <NButton @click="addLowPoint">添加</NButton>
            </div>
          </div>
        </div>
      </NCard>

      <!-- 操作按钮 -->
      <div class="flex justify-end gap-2">
        <NButton @click="cancelEdit">
          <template #icon>
            <X class="w-4 h-4" />
          </template>
          取消
        </NButton>
        <NButton type="primary" @click="saveGoal">
          <template #icon>
            <Save class="w-4 h-4" />
          </template>
          保存
        </NButton>
      </div>
    </div>
  </div>
</template>

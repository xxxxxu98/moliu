<script setup lang="ts">
import { ref, computed } from 'vue';
import { NCard, NButton, NInput, NSelect, NTag, NEmpty, NModal, NProgress, NPopconfirm, useMessage } from 'naive-ui';
import { Plus, Trash2, Edit3, Save, X, Zap, Star, Target, Calendar } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/stores/project.store';
import {
  COOL_POINT_PATTERN_LABELS,
  type CoolPointDesign,
  type CoolPointPattern,
  type CoolPointArrangement,
} from '@/types/project';

const { t } = useI18n();
const projectStore = useProjectStore();
const message = useMessage();

// 爽点类型选项
const patternOptions = computed(() =>
  Object.entries(COOL_POINT_PATTERN_LABELS).map(([value, data]) => ({
    label: `${data.emoji} ${data.label}`,
    value,
  }))
);

// 编辑状态
const isEditing = ref(false);
const editingDesign = ref<CoolPointDesign | null>(null);

// 爽点安排编辑弹窗
const showArrangementDialog = ref(false);
const editingArrangement = ref<CoolPointArrangement | null>(null);
const arrangementForm = ref({
  chapter: '1',
  type: 'face-slapping' as CoolPointPattern,
  description: '',
});
const newChapter = ref<string>('');

// 密度编辑
const densityForm = ref({
  micro: '3000',
  small: '9000',
  big: '21000',
});

// 初始化编辑数据
function initEditData() {
  if (projectStore.coolPointDesign) {
    editingDesign.value = JSON.parse(JSON.stringify(projectStore.coolPointDesign));
  } else {
    editingDesign.value = {
      id: `coolpoint-${Date.now()}`,
      patterns: [],
      arranged: [],
      density: {
        micro: 3000,
        small: 9000,
        big: 21000,
      },
    };
  }
  densityForm.value = editingDesign.value?.density 
    ? {
        micro: String(editingDesign.value.density.micro),
        small: String(editingDesign.value.density.small),
        big: String(editingDesign.value.density.big),
      }
    : {
        micro: '3000',
        small: '9000',
        big: '21000',
      };
}

// 开始编辑
function startEdit() {
  initEditData();
  isEditing.value = true;
}

// 取消编辑
function cancelEdit() {
  isEditing.value = false;
  editingDesign.value = null;
}

// 保存
async function saveDesign() {
  if (!editingDesign.value) return;
  
  editingDesign.value.density = {
    micro: parseInt(densityForm.value.micro) || 3000,
    small: parseInt(densityForm.value.small) || 9000,
    big: parseInt(densityForm.value.big) || 21000,
  };
  await projectStore.updateCoolPointDesign(editingDesign.value);
  message.success('爽点设计已保存');
  isEditing.value = false;
}

// 删除
async function deleteDesign() {
  await projectStore.deleteCoolPointDesign();
  message.success('爽点设计已删除');
}

// 切换爽点类型
function togglePattern(pattern: CoolPointPattern) {
  if (!editingDesign.value) return;
  
  const index = editingDesign.value.patterns.indexOf(pattern);
  if (index >= 0) {
    editingDesign.value.patterns.splice(index, 1);
  } else {
    editingDesign.value.patterns.push(pattern);
  }
}

// 是否选中某类型
function isPatternSelected(pattern: CoolPointPattern): boolean {
  return editingDesign.value?.patterns.includes(pattern) || false;
}

// 打开安排编辑弹窗
function openArrangementDialog(arrangement?: CoolPointArrangement) {
  if (arrangement) {
    editingArrangement.value = arrangement;
    arrangementForm.value = {
      chapter: String(arrangement.chapter),
      type: arrangement.type,
      description: arrangement.description,
    };
  } else {
    editingArrangement.value = null;
    arrangementForm.value = {
      chapter: '1',
      type: 'face-slapping',
      description: '',
    };
  }
  showArrangementDialog.value = true;
}

// 保存安排
function saveArrangement() {
  if (!editingDesign.value) return;
  
  if (!arrangementForm.value.description.trim()) {
    message.warning('请填写爽点描述');
    return;
  }
  
  const arrangementData: CoolPointArrangement = {
    id: editingArrangement.value?.id || `arrangement-${Date.now()}`,
    chapter: parseInt(arrangementForm.value.chapter) || 1,
    type: arrangementForm.value.type,
    description: arrangementForm.value.description,
  };
  
  if (editingArrangement.value) {
    const index = editingDesign.value.arranged.findIndex(a => a.id === editingArrangement.value!.id);
    if (index >= 0) {
      editingDesign.value.arranged[index] = arrangementData;
    }
  } else {
    editingDesign.value.arranged.push(arrangementData);
  }
  
  // 按章节排序
  editingDesign.value.arranged.sort((a, b) => a.chapter - b.chapter);
  showArrangementDialog.value = false;
}

// 删除安排
function deleteArrangement(id: string) {
  if (editingDesign.value) {
    editingDesign.value.arranged = editingDesign.value.arranged.filter(a => a.id !== id);
  }
}

// 获取去重后的爽点类型列表（防止数据异常导致重复渲染）
const uniquePatterns = computed(() => {
  if (!projectStore.coolPointDesign?.patterns) return [];
  return [...new Set(projectStore.coolPointDesign.patterns)];
});

// 按类型分组统计
const groupedByType = computed(() => {
  if (!projectStore.coolPointDesign) return {};
  
  const grouped: Record<string, CoolPointArrangement[]> = {};
  projectStore.coolPointDesign.arranged.forEach(arr => {
    if (!grouped[arr.type]) {
      grouped[arr.type] = [];
    }
    grouped[arr.type].push(arr);
  });
  return grouped;
});

// 章节分布统计
const chapterDistribution = computed(() => {
  if (!projectStore.coolPointDesign) return [];
  
  const arranged = projectStore.coolPointDesign.arranged;
  if (arranged.length === 0) return [];
  
  // 按章节号分组统计
  const chapterMap = new Map<number, number>();
  for (const item of arranged) {
    chapterMap.set(item.chapter, (chapterMap.get(item.chapter) || 0) + 1);
  }
  
  // 只返回有数据的章节
  const distribution: { chapter: number; count: number }[] = [];
  chapterMap.forEach((count, chapter) => {
    distribution.push({ chapter, count });
  });
  
  // 按章节号排序
  distribution.sort((a, b) => a.chapter - b.chapter);
  
  return distribution;
});

// 获取类型颜色
function getPatternColor(pattern: CoolPointPattern): string {
  const colors: Record<CoolPointPattern, string> = {
    'face-slapping': '#ef4444',
    'show-off': '#f97316',
    'identity-reveal': '#8b5cf6',
    'growth': '#22c55e',
    'rescue': '#3b82f6',
    'treasure': '#eab308',
    'breakthrough': '#06b6d4',
    'romance': '#ec4899',
    'revenge': '#dc2626',
    'mystery-reveal': '#6366f1',
    'comedy': '#14b8a6',
    'justice': '#64748b',
  };
  return colors[pattern] || '#6b7280';
}
</script>

<template>
  <div class="space-y-4">
    <!-- 头部 -->
    <div class="flex items-center justify-between p-3 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-100 dark:border-indigo-800">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-sm">
          <Zap class="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 class="font-semibold text-sm text-gray-900 dark:text-white">爽点设计</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400">规划故事的精彩爽点</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <NButton v-if="!projectStore.coolPointDesign && !isEditing" size="small" type="primary" @click="startEdit">
          <template #icon>
            <Plus class="w-4 h-4" />
          </template>
          创建
        </NButton>
        <NButton v-if="projectStore.coolPointDesign && !isEditing" size="small" @click="startEdit">
          <template #icon>
            <Edit3 class="w-4 h-4" />
          </template>
          编辑
        </NButton>
        <NPopconfirm v-if="projectStore.coolPointDesign && !isEditing" @positive-click="deleteDesign">
          <template #trigger>
            <NButton size="small" type="error" quaternary>
              <template #icon>
                <Trash2 class="w-4 h-4" />
              </template>
            </NButton>
          </template>
          确定要删除爽点设计吗？
        </NPopconfirm>
      </div>
    </div>

    <!-- 无数据状态 -->
    <NEmpty v-if="!projectStore.coolPointDesign && !isEditing" description="暂无爽点设计" size="small">
      <template #extra>
        <NButton size="small" @click="startEdit">创建爽点设计</NButton>
      </template>
    </NEmpty>

    <!-- 查看模式 -->
    <div v-if="projectStore.coolPointDesign && !isEditing" class="space-y-3">
      <!-- 爽点类型 -->
      <div class="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
        <div class="flex items-center gap-2 mb-3">
          <Star class="w-4 h-4 text-amber-500" />
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">爽点类型</span>
          <NTag size="small" type="warning">{{ projectStore.coolPointDesign.patterns.length }}种</NTag>
        </div>
        <div class="flex flex-wrap gap-2">
          <NTag
            v-for="pattern in uniquePatterns"
            :key="pattern"
            :color="{ color: getPatternColor(pattern), textColor: '#fff' }"
            size="large"
          >
            {{ COOL_POINT_PATTERN_LABELS[pattern].emoji }}
            {{ COOL_POINT_PATTERN_LABELS[pattern].label }}
          </NTag>
          <span v-if="uniquePatterns.length === 0" class="text-sm text-gray-400">
            暂无设置
          </span>
        </div>
      </div>

      <!-- 爽点密度 -->
      <div class="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
        <div class="flex items-center gap-2 mb-3">
          <Target class="w-4 h-4 text-indigo-500" />
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">爽点密度</span>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div class="text-center p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
            <div class="text-xl font-bold text-red-600 dark:text-red-400">
              {{ projectStore.coolPointDesign.density.micro.toLocaleString() }}
            </div>
            <div class="text-xs text-gray-500">微爽点</div>
          </div>
          <div class="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20">
            <div class="text-xl font-bold text-amber-600 dark:text-amber-400">
              {{ projectStore.coolPointDesign.density.small.toLocaleString() }}
            </div>
            <div class="text-xs text-gray-500">小爽点</div>
          </div>
          <div class="text-center p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
            <div class="text-xl font-bold text-green-600 dark:text-green-400">
              {{ projectStore.coolPointDesign.density.big.toLocaleString() }}
            </div>
            <div class="text-xs text-gray-500">大爽点</div>
          </div>
        </div>
      </div>

      <!-- 章节分布 -->
      <div class="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
        <div class="flex items-center gap-2 mb-3">
          <Calendar class="w-4 h-4 text-indigo-500" />
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">章节爽点分布</span>
        </div>
        
        <div v-if="chapterDistribution.length > 0" class="h-16 flex items-end gap-1">
          <div 
            v-for="item in chapterDistribution" 
            :key="item.chapter"
            class="flex-1 min-w-0 bg-indigo-200 dark:bg-indigo-800 rounded-t transition-all hover:bg-indigo-400 dark:hover:bg-indigo-600"
            :style="{ height: `${Math.max(15, Math.min(100, item.count * 40))}%` }"
            :title="`第${item.chapter}章: ${item.count}个爽点`"
          />
        </div>
        <div v-if="chapterDistribution.length > 0" class="flex justify-between mt-1 px-1 text-xs text-gray-400">
          <span>第{{ chapterDistribution[0]?.chapter }}章</span>
          <span>第{{ chapterDistribution[chapterDistribution.length - 1]?.chapter }}章</span>
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
          共 {{ projectStore.coolPointDesign.arranged.length }} 个已安排爽点
        </p>
      </div>

      <!-- 爽点列表 -->
      <div class="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <Zap class="w-4 h-4 text-amber-500" />
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">已安排爽点</span>
            <NTag size="small">{{ projectStore.coolPointDesign.arranged.length }}个</NTag>
          </div>
        </div>
        
        <div v-if="projectStore.coolPointDesign.arranged.length > 0" class="space-y-2 max-h-48 overflow-y-auto">
          <div 
            v-for="arrangement in projectStore.coolPointDesign.arranged"
            :key="arrangement.id"
            class="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <NTag 
              size="small"
              :color="{ color: getPatternColor(arrangement.type), textColor: '#fff' }"
            >
              第{{ arrangement.chapter }}章
            </NTag>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-base">{{ COOL_POINT_PATTERN_LABELS[arrangement.type].emoji }}</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white">
                  {{ COOL_POINT_PATTERN_LABELS[arrangement.type].label }}
                </span>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                {{ arrangement.description }}
              </p>
            </div>
          </div>
        </div>
        <p v-else class="text-sm text-gray-400 text-center py-4">暂无已安排的爽点</p>
      </div>
    </div>

    <!-- 编辑模式 -->
    <div v-if="isEditing && editingDesign" class="space-y-3">
      <NCard size="small" :bordered="false" class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
        <div class="space-y-4">
          <!-- 爽点类型 -->
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
              爽点类型（可多选）
            </label>
            <div class="flex flex-wrap gap-2">
              <NTag
                v-for="[key, data] in Object.entries(COOL_POINT_PATTERN_LABELS)"
                :key="key"
                :type="isPatternSelected(key as CoolPointPattern) ? 'success' : 'default'"
                checkable
                :checked="isPatternSelected(key as CoolPointPattern)"
                @click="togglePattern(key as CoolPointPattern)"
              >
                {{ data.emoji }} {{ data.label }}
              </NTag>
            </div>
          </div>

          <!-- 爽点密度 -->
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
              爽点密度设置
            </label>
            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="block text-xs text-gray-500 mb-1">微爽点</label>
                <NInput v-model:value="densityForm.micro" type="number" placeholder="3000" size="small">
                  <template #suffix>
                    <span class="text-xs text-gray-400">字</span>
                  </template>
                </NInput>
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">小爽点</label>
                <NInput v-model:value="densityForm.small" type="number" placeholder="9000" size="small">
                  <template #suffix>
                    <span class="text-xs text-gray-400">字</span>
                  </template>
                </NInput>
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">大爽点</label>
                <NInput v-model:value="densityForm.big" type="number" placeholder="21000" size="small">
                  <template #suffix>
                    <span class="text-xs text-gray-400">字</span>
                  </template>
                </NInput>
              </div>
            </div>
            <p class="text-xs text-gray-400 mt-1">
              微爽点约每3章1个，小爽点约每9章1个，大爽点约每21章1个
            </p>
          </div>

          <!-- 爽点安排 -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                已安排爽点
              </label>
              <NButton size="tiny" @click="openArrangementDialog()">
                <Plus class="w-3 h-3" />
                添加
              </NButton>
            </div>
            
            <div v-if="editingDesign.arranged.length > 0" class="space-y-2 max-h-32 overflow-y-auto">
              <div 
                v-for="arrangement in editingDesign.arranged"
                :key="arrangement.id"
                class="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600"
              >
                <div class="flex items-center gap-2">
                  <NTag 
                    size="small"
                    :color="{ color: getPatternColor(arrangement.type), textColor: '#fff' }"
                  >
                    第{{ arrangement.chapter }}章
                  </NTag>
                  <span class="text-sm text-gray-900 dark:text-white">
                    {{ COOL_POINT_PATTERN_LABELS[arrangement.type].emoji }}
                    {{ COOL_POINT_PATTERN_LABELS[arrangement.type].label }}
                  </span>
                </div>
                <div class="flex items-center gap-1">
                  <NButton size="tiny" quaternary @click="openArrangementDialog(arrangement)">
                    <Edit3 class="w-3 h-3" />
                  </NButton>
                  <NButton size="tiny" quaternary type="error" @click="deleteArrangement(arrangement.id)">
                    <Trash2 class="w-3 h-3" />
                  </NButton>
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-gray-400 text-center py-2">点击添加爽点安排</p>
          </div>
        </div>
      </NCard>

      <!-- 操作按钮 -->
      <div class="flex justify-end gap-2 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
        <NButton size="small" @click="cancelEdit">
          <template #icon>
            <X class="w-4 h-4" />
          </template>
          取消
        </NButton>
        <NButton type="primary" size="small" @click="saveDesign">
          <template #icon>
            <Save class="w-4 h-4" />
          </template>
          保存
        </NButton>
      </div>
    </div>

    <!-- 爽点安排编辑弹窗 -->
    <NModal
      v-model:show="showArrangementDialog"
      preset="dialog"
      title="编辑爽点安排"
      style="width: 500px"
    >
      <div class="space-y-4 py-4">
        <div class="flex gap-4">
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              章节
            </label>
            <NInput
              v-model:value="arrangementForm.chapter"
              type="number"
              placeholder="章节号"
            />
          </div>
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              爽点类型
            </label>
            <NSelect
              v-model:value="arrangementForm.type"
              :options="patternOptions"
              placeholder="选择类型"
            />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            描述
          </label>
          <NInput
            v-model:value="arrangementForm.description"
            type="textarea"
            :rows="3"
            placeholder="描述这个爽点的具体内容"
          />
        </div>
      </div>
      <template #action>
        <div class="flex justify-end gap-2">
          <NButton @click="showArrangementDialog = false">取消</NButton>
          <NButton type="primary" @click="saveArrangement">保存</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

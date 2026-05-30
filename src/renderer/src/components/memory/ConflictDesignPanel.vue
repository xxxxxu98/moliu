<script setup lang="ts">
import { ref, computed } from 'vue';
import { NCard, NButton, NInput, NSelect, NTag, NEmpty, NModal, NPopconfirm, useMessage } from 'naive-ui';
import { Plus, Trash2, Edit3, Save, X, Swords, AlertTriangle, TrendingUp, BookOpen, Target } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/stores/project.store';
import {
  CONFLICT_SOURCE_LABELS,
  CONFLICT_INTENSITY_LABELS,
  type ConflictDesign,
  type ConflictLevel,
  type MajorConflict,
  type ConflictSourceType,
  type ConflictIntensityType,
  type ConflictStatus,
} from '@/types/project';

const { t } = useI18n();
const projectStore = useProjectStore();
const message = useMessage();

// 冲突来源选项
const sourceOptions = computed(() =>
  Object.entries(CONFLICT_SOURCE_LABELS).map(([value, data]) => ({
    label: `${data.label} - ${data.description}`,
    value,
  }))
);

// 冲突强度选项
const intensityOptions = computed(() =>
  Object.entries(CONFLICT_INTENSITY_LABELS).map(([value, data]) => ({
    label: data.label,
    value,
    color: data.color,
  }))
);

// 冲突状态选项
const statusOptions = [
  { label: '待激活', value: 'pending' },
  { label: '进行中', value: 'active' },
  { label: '已解决', value: 'resolved' },
];

// 编辑状态
const isEditing = ref(false);
const editingDesign = ref<ConflictDesign | null>(null);

// 层级编辑弹窗
const showLevelDialog = ref(false);
const editingLevel = ref<ConflictLevel | null>(null);
const levelForm = ref({
  level: 1,
  name: '',
  description: '',
  examples: [] as string[],
});
const newExample = ref('');

// 冲突编辑弹窗
const showConflictDialog = ref(false);
const editingConflict = ref<MajorConflict | null>(null);
const conflictForm = ref({
  title: '',
  type: 'B' as ConflictIntensityType,
  status: 'pending' as ConflictStatus,
  chapters: [] as number[],
  stakes: '',
  resolution: '',
});
const newChapter = ref<number | null>(null);

// 初始化编辑数据
function initEditData() {
  if (projectStore.conflictDesign) {
    editingDesign.value = JSON.parse(JSON.stringify(projectStore.conflictDesign));
  } else {
    editingDesign.value = {
      id: `conflict-${Date.now()}`,
      source: 'resource',
      escalation: [],
      majorConflicts: [],
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
  editingDesign.value = null;
}

// 保存
async function saveDesign() {
  if (!editingDesign.value) return;
  
  await projectStore.updateConflictDesign(editingDesign.value);
  message.success('矛盾设计已保存');
  isEditing.value = false;
}

// 删除
async function deleteDesign() {
  await projectStore.deleteConflictDesign();
  message.success('矛盾设计已删除');
}

// 打开层级编辑弹窗
function openLevelDialog(level?: ConflictLevel) {
  if (level) {
    editingLevel.value = level;
    levelForm.value = {
      level: level.level,
      name: level.name,
      description: level.description,
      examples: [...level.examples],
    };
  } else {
    editingLevel.value = null;
    const nextLevel = editingDesign.value ? editingDesign.value.escalation.length + 1 : 1;
    levelForm.value = {
      level: Math.min(nextLevel, 4),
      name: '',
      description: '',
      examples: [],
    };
  }
  showLevelDialog.value = true;
}

// 保存层级
function saveLevel() {
  if (!editingDesign.value) return;
  
  const levelData: ConflictLevel = {
    level: levelForm.value.level,
    name: levelForm.value.name,
    description: levelForm.value.description,
    examples: levelForm.value.examples,
  };
  
  if (editingLevel.value) {
    const index = editingDesign.value.escalation.findIndex(l => l.level === editingLevel.value!.level);
    if (index >= 0) {
      editingDesign.value.escalation[index] = levelData;
    }
  } else {
    editingDesign.value.escalation.push(levelData);
  }
  
  // 按层级排序
  editingDesign.value.escalation.sort((a, b) => a.level - b.level);
  showLevelDialog.value = false;
}

// 删除层级
function deleteLevel(level: number) {
  if (editingDesign.value) {
    editingDesign.value.escalation = editingDesign.value.escalation.filter(l => l.level !== level);
  }
}

// 添加示例
function addExample() {
  if (newExample.value.trim() && !levelForm.value.examples.includes(newExample.value.trim())) {
    levelForm.value.examples.push(newExample.value.trim());
    newExample.value = '';
  }
}

// 移除示例
function removeExample(index: number) {
  levelForm.value.examples.splice(index, 1);
}

// 打开冲突编辑弹窗
function openConflictDialog(conflict?: MajorConflict) {
  if (conflict) {
    editingConflict.value = conflict;
    conflictForm.value = {
      title: conflict.title,
      type: conflict.type,
      status: conflict.status,
      chapters: [...conflict.chapters],
      stakes: conflict.stakes,
      resolution: conflict.resolution || '',
    };
  } else {
    editingConflict.value = null;
    conflictForm.value = {
      title: '',
      type: 'B',
      status: 'pending',
      chapters: [],
      stakes: '',
      resolution: '',
    };
  }
  showConflictDialog.value = true;
}

// 保存冲突
function saveConflict() {
  if (!editingDesign.value || !conflictForm.value.title.trim()) {
    message.warning('请填写冲突标题');
    return;
  }
  
  const conflictData: MajorConflict = {
    id: editingConflict.value?.id || `conflict-${Date.now()}`,
    title: conflictForm.value.title,
    type: conflictForm.value.type,
    status: conflictForm.value.status,
    chapters: conflictForm.value.chapters,
    stakes: conflictForm.value.stakes,
    resolution: conflictForm.value.resolution || undefined,
  };
  
  if (editingConflict.value) {
    const index = editingDesign.value.majorConflicts.findIndex(c => c.id === editingConflict.value!.id);
    if (index >= 0) {
      editingDesign.value.majorConflicts[index] = conflictData;
    }
  } else {
    editingDesign.value.majorConflicts.push(conflictData);
  }
  
  showConflictDialog.value = false;
}

// 删除冲突
function deleteConflict(id: string) {
  if (editingDesign.value) {
    editingDesign.value.majorConflicts = editingDesign.value.majorConflicts.filter(c => c.id !== id);
  }
}

// 添加冲突章节
function addConflictChapter() {
  if (newChapter.value && !conflictForm.value.chapters.includes(newChapter.value)) {
    conflictForm.value.chapters.push(newChapter.value);
    conflictForm.value.chapters.sort((a, b) => a - b);
    newChapter.value = null;
  }
}

// 移除冲突章节
function removeConflictChapter(chapter: number) {
  conflictForm.value.chapters = conflictForm.value.chapters.filter(c => c !== chapter);
}

// 获取冲突来源颜色
function getSourceColor(source: ConflictSourceType): string {
  const colors: Record<ConflictSourceType, string> = {
    resource: '#f97316',
    faction: '#ef4444',
    path: '#8b5cf6',
    faith: '#3b82f6',
    factionFight: '#eab308',
    ideology: '#22c55e',
  };
  return colors[source] || '#6b7280';
}

// 获取状态颜色
function getStatusColor(status: ConflictStatus): string {
  const colors: Record<ConflictStatus, string> = {
    pending: '#6b7280',
    active: '#f97316',
    resolved: '#22c55e',
  };
  return colors[status] || '#6b7280';
}
</script>

<template>
  <div class="space-y-4">
    <!-- 头部 -->
    <div class="flex items-center justify-between p-3 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-100 dark:border-indigo-800">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shadow-sm">
          <Swords class="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 class="font-semibold text-sm text-gray-900 dark:text-white">矛盾设计</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400">规划故事的核心冲突</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <NButton v-if="!projectStore.conflictDesign && !isEditing" size="small" type="primary" @click="startEdit">
          <template #icon>
            <Plus class="w-4 h-4" />
          </template>
          创建
        </NButton>
        <NButton v-if="projectStore.conflictDesign && !isEditing" size="small" @click="startEdit">
          <template #icon>
            <Edit3 class="w-4 h-4" />
          </template>
          编辑
        </NButton>
        <NPopconfirm v-if="projectStore.conflictDesign && !isEditing" @positive-click="deleteDesign">
          <template #trigger>
            <NButton size="small" type="error" quaternary>
              <template #icon>
                <Trash2 class="w-4 h-4" />
              </template>
            </NButton>
          </template>
          确定要删除矛盾设计吗？
        </NPopconfirm>
      </div>
    </div>

    <!-- 无数据状态 -->
    <NEmpty v-if="!projectStore.conflictDesign && !isEditing" description="暂无矛盾设计" size="small">
      <template #extra>
        <NButton size="small" @click="startEdit">创建矛盾设计</NButton>
      </template>
    </NEmpty>

    <!-- 查看模式 -->
    <div v-if="projectStore.conflictDesign && !isEditing" class="space-y-3">
      <!-- 冲突来源 -->
      <div class="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
        <div class="flex items-center gap-2 mb-3">
          <AlertTriangle class="w-4 h-4 text-red-500" />
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">冲突来源</span>
        </div>
        <NTag
          size="large"
          :color="{ color: getSourceColor(projectStore.conflictDesign.source), textColor: '#fff' }"
        >
          {{ CONFLICT_SOURCE_LABELS[projectStore.conflictDesign.source].label }}
        </NTag>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
          {{ CONFLICT_SOURCE_LABELS[projectStore.conflictDesign.source].description }}
        </p>
      </div>

      <!-- 矛盾递进 -->
      <div class="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <TrendingUp class="w-4 h-4 text-indigo-500" />
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">矛盾递进</span>
            <NTag size="small">{{ projectStore.conflictDesign.escalation.length }}级</NTag>
          </div>
        </div>
        
        <!-- 递进阶梯 -->
        <div v-if="projectStore.conflictDesign.escalation.length > 0" class="space-y-2">
          <div 
            v-for="level in projectStore.conflictDesign.escalation" 
            :key="level.level"
            class="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
          >
            <div class="flex items-center gap-2 mb-2">
              <NTag :color="{ color: getStatusColor('active'), textColor: '#fff' }" size="small">
                Lv.{{ level.level }}
              </NTag>
              <span class="font-medium text-sm text-gray-900 dark:text-white">{{ level.name }}</span>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">{{ level.description }}</p>
            <div v-if="level.examples.length > 0" class="flex flex-wrap gap-1">
              <NTag v-for="ex in level.examples" :key="ex" size="tiny" type="info">{{ ex }}</NTag>
            </div>
          </div>
        </div>
        <p v-else class="text-sm text-gray-400 text-center py-4">暂无矛盾递进设置</p>
      </div>

      <!-- 主要冲突 -->
      <div class="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <Target class="w-4 h-4 text-indigo-500" />
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">主要冲突</span>
            <NTag size="small">{{ projectStore.conflictDesign.majorConflicts.length }}个</NTag>
          </div>
        </div>
        
        <div v-if="projectStore.conflictDesign.majorConflicts.length > 0" class="space-y-3">
          <div 
            v-for="conflict in projectStore.conflictDesign.majorConflicts"
            :key="conflict.id"
            class="p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <div class="flex items-center gap-2 mb-2">
              <NTag 
                size="small" 
                :color="{ color: CONFLICT_INTENSITY_LABELS[conflict.type].color, textColor: '#fff' }"
              >
                {{ CONFLICT_INTENSITY_LABELS[conflict.type].label }}
              </NTag>
              <span class="font-medium text-sm text-gray-900 dark:text-white">{{ conflict.title }}</span>
              <NTag 
                size="tiny" 
                :color="{ color: getStatusColor(conflict.status), textColor: '#fff' }"
              >
                {{ statusOptions.find(s => s.value === conflict.status)?.label }}
              </NTag>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">
              <span class="font-medium">赌注：</span>{{ conflict.stakes }}
            </p>
            <div v-if="conflict.chapters.length > 0" class="flex flex-wrap gap-1">
              <NTag v-for="ch in conflict.chapters" :key="ch" size="tiny">
                第{{ ch }}章
              </NTag>
            </div>
          </div>
        </div>
        <p v-else class="text-sm text-gray-400 text-center py-4">暂无主要冲突设置</p>
      </div>
    </div>

    <!-- 编辑模式 -->
    <div v-if="isEditing && editingDesign" class="space-y-3">
      <NCard size="small" :bordered="false" class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
        <div class="space-y-4">
          <!-- 冲突来源 -->
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
              冲突来源
            </label>
            <NSelect
              v-model:value="editingDesign.source"
              :options="sourceOptions"
              placeholder="选择冲突来源"
              size="small"
            />
          </div>

          <!-- 矛盾递进 -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                矛盾递进
              </label>
              <NButton size="tiny" @click="openLevelDialog()">
                <Plus class="w-3 h-3" />
                添加层级
              </NButton>
            </div>
            
            <div class="space-y-2">
              <div 
                v-for="level in editingDesign.escalation"
                :key="level.level"
                class="p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 flex items-center justify-between"
              >
                <div class="flex items-center gap-2">
                  <NTag size="small">Lv.{{ level.level }}</NTag>
                  <span class="text-sm text-gray-900 dark:text-white">{{ level.name }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <NButton size="tiny" quaternary @click="openLevelDialog(level)">
                    <Edit3 class="w-3 h-3" />
                  </NButton>
                  <NButton size="tiny" quaternary type="error" @click="deleteLevel(level.level)">
                    <Trash2 class="w-3 h-3" />
                  </NButton>
                </div>
              </div>
            </div>
          </div>

          <!-- 主要冲突 -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                主要冲突
              </label>
              <NButton size="tiny" @click="openConflictDialog()">
                <Plus class="w-3 h-3" />
                添加冲突
              </NButton>
            </div>
            
            <div class="space-y-2">
              <div 
                v-for="conflict in editingDesign.majorConflicts"
                :key="conflict.id"
                class="p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 flex items-center justify-between"
              >
                <div class="flex items-center gap-2">
                  <NTag size="small" :color="{ color: CONFLICT_INTENSITY_LABELS[conflict.type].color, textColor: '#fff' }">
                    {{ CONFLICT_INTENSITY_LABELS[conflict.type].label }}
                  </NTag>
                  <span class="text-sm text-gray-900 dark:text-white">{{ conflict.title }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <NButton size="tiny" quaternary @click="openConflictDialog(conflict)">
                    <Edit3 class="w-3 h-3" />
                  </NButton>
                  <NButton size="tiny" quaternary type="error" @click="deleteConflict(conflict.id)">
                    <Trash2 class="w-3 h-3" />
                  </NButton>
                </div>
              </div>
            </div>
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

    <!-- 层级编辑弹窗 -->
    <NModal
      v-model:show="showLevelDialog"
      preset="dialog"
      title="编辑矛盾层级"
      style="width: 500px"
    >
      <div class="space-y-4 py-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            层级 (1-4)
          </label>
          <NInput v-model:value="levelForm.level" type="number" placeholder="1-4" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            名称
          </label>
          <NInput v-model:value="levelForm.name" placeholder="如：言语冲突" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            描述
          </label>
          <NInput
            v-model:value="levelForm.description"
            type="textarea"
            :rows="2"
            placeholder="描述这一层级的冲突特点"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            示例
          </label>
          <div class="flex flex-wrap gap-2 mb-2">
            <NTag
              v-for="(ex, index) in levelForm.examples"
              :key="index"
              closable
              @close="removeExample(index)"
            >
              {{ ex }}
            </NTag>
          </div>
          <div class="flex gap-2">
            <NInput v-model:value="newExample" placeholder="输入示例" @keyup.enter="addExample" />
            <NButton @click="addExample">添加</NButton>
          </div>
        </div>
      </div>
      <template #action>
        <div class="flex justify-end gap-2">
          <NButton @click="showLevelDialog = false">取消</NButton>
          <NButton type="primary" @click="saveLevel">保存</NButton>
        </div>
      </template>
    </NModal>

    <!-- 冲突编辑弹窗 -->
    <NModal
      v-model:show="showConflictDialog"
      preset="dialog"
      title="编辑主要冲突"
      style="width: 600px"
    >
      <div class="space-y-4 py-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            冲突标题 *
          </label>
          <NInput v-model:value="conflictForm.title" placeholder="输入冲突标题" />
        </div>
        <div class="flex gap-4">
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              强度级别
            </label>
            <NSelect
              v-model:value="conflictForm.type"
              :options="intensityOptions"
              placeholder="选择强度"
            />
          </div>
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              状态
            </label>
            <NSelect
              v-model:value="conflictForm.status"
              :options="statusOptions"
              placeholder="选择状态"
            />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            赌注/风险
          </label>
          <NInput
            v-model:value="conflictForm.stakes"
            type="textarea"
            :rows="2"
            placeholder="描述这场冲突的赌注是什么"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            涉及章节
          </label>
          <div class="flex flex-wrap gap-2 mb-2">
            <NTag
              v-for="ch in conflictForm.chapters"
              :key="ch"
              closable
              @close="removeConflictChapter(ch)"
            >
              第{{ ch }}章
            </NTag>
          </div>
          <div class="flex gap-2">
            <NInput v-model:value="newChapter" type="number" placeholder="输入章节号" @keyup.enter="addConflictChapter" />
            <NButton @click="addConflictChapter">添加</NButton>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            解决方式
          </label>
          <NInput
            v-model:value="conflictForm.resolution"
            type="textarea"
            :rows="2"
            placeholder="描述冲突如何解决（可选）"
          />
        </div>
      </div>
      <template #action>
        <div class="flex justify-end gap-2">
          <NButton @click="showConflictDialog = false">取消</NButton>
          <NButton type="primary" @click="saveConflict">保存</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

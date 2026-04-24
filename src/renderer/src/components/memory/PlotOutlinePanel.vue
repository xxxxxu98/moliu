<script setup lang="ts">
import { ref, computed } from 'vue';
import { NButton, NInput, NEmpty, NTag, NCard, NModal, NPopconfirm, useMessage } from 'naive-ui';
import { Plus, Search, Map, ChevronDown, ChevronRight, Trash2, Edit3, BookOpen, Layers } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/stores/project.store';
import type { PlotNode, PlotNodeType } from '@/types/project';
import { PLOT_NODE_TYPE_LABELS } from '@/types/project';

const { t } = useI18n();
const projectStore = useProjectStore();
const message = useMessage();

const searchQuery = ref('');

// Dialog states
const showPlotDialog = ref(false);
const plotDialogMode = ref<'create' | 'edit'>('create');
const editingPlot = ref<PlotNode | null>(null);
const plotForm = ref({
  title: '',
  description: '',
  type: 'act' as PlotNodeType,
  chapterRange: undefined as [number, number] | undefined,
  purpose: '',
  keyEvents: [] as string[],
  relatedCharacters: [] as string[],
  parentId: '',
  orderIndex: 0,
});

// New key event input
const newKeyEvent = ref('');
const newRelatedCharacter = ref('');

// Expanded nodes
const expandedNodes = ref<Set<string>>(new Set());

// Group plots by type
const groupedPlots = computed(() => {
  const plots = projectStore.plotOutline || [];
  const groups = {
    act: plots.filter(p => p.type === 'act'),
    subplot: plots.filter(p => p.type === 'subplot'),
    chapter: plots.filter(p => p.type === 'chapter'),
    foreshadow: plots.filter(p => p.type === 'foreshadow'),
  };
  return groups;
});

// Filtered plots
const filteredPlots = computed(() => {
  if (!searchQuery.value.trim()) {
    return projectStore.plotOutline || [];
  }
  const query = searchQuery.value.toLowerCase();
  return (projectStore.plotOutline || []).filter(p => 
    p.title.toLowerCase().includes(query) || p.description?.toLowerCase().includes(query)
  );
});

// Plot type options
const plotTypeOptions = Object.entries(PLOT_NODE_TYPE_LABELS).map(([value, label]) => ({
  label,
  value,
}));

// Plot type colors
const plotTypeColors: Record<PlotNodeType, string> = {
  act: '#8b5cf6',
  subplot: '#f97316',
  chapter: '#3b82f6',
  foreshadow: '#22c55e',
};

function getPlotTypeColor(type: PlotNodeType): string {
  return plotTypeColors[type] || '#6b7280';
}

function getPlotTypeLabel(type: PlotNodeType): string {
  return PLOT_NODE_TYPE_LABELS[type] || type;
}

function toggleExpand(nodeId: string) {
  if (expandedNodes.value.has(nodeId)) {
    expandedNodes.value.delete(nodeId);
  } else {
    expandedNodes.value.add(nodeId);
  }
}

function openAddPlotDialog(type: PlotNodeType = 'chapter') {
  plotDialogMode.value = 'create';
  plotForm.value = {
    title: '',
    description: '',
    type,
    chapterRange: undefined,
    purpose: '',
    keyEvents: [],
    relatedCharacters: [],
    parentId: '',
    orderIndex: projectStore.plotOutline?.length || 0,
  };
  editingPlot.value = null;
  showPlotDialog.value = true;
}

function openEditPlotDialog(plot: PlotNode) {
  plotDialogMode.value = 'edit';
  editingPlot.value = plot;
  plotForm.value = {
    title: plot.title,
    description: plot.description || '',
    type: plot.type,
    chapterRange: plot.chapterRange,
    purpose: plot.purpose || '',
    keyEvents: plot.keyEvents || [],
    relatedCharacters: plot.relatedCharacters || [],
    parentId: plot.parentId || '',
    orderIndex: plot.orderIndex || 0,
  };
  showPlotDialog.value = true;
}

function addKeyEvent() {
  if (newKeyEvent.value.trim() && !plotForm.value.keyEvents.includes(newKeyEvent.value.trim())) {
    plotForm.value.keyEvents.push(newKeyEvent.value.trim());
    newKeyEvent.value = '';
  }
}

function removeKeyEvent(index: number) {
  plotForm.value.keyEvents.splice(index, 1);
}

// Related Characters - quick selection from existing characters
const existingCharacterNames = computed(() => {
  return projectStore.characters.map(c => c.name);
});

function addRelatedCharacter() {
  if (newRelatedCharacter.value.trim() && !plotForm.value.relatedCharacters.includes(newRelatedCharacter.value.trim())) {
    plotForm.value.relatedCharacters.push(newRelatedCharacter.value.trim());
    newRelatedCharacter.value = '';
  }
}

function selectRelatedCharacter(name: string) {
  if (!plotForm.value.relatedCharacters.includes(name)) {
    plotForm.value.relatedCharacters.push(name);
  }
}

function removeRelatedCharacter(index: number) {
  plotForm.value.relatedCharacters.splice(index, 1);
}

async function handlePlotDialogConfirm() {
  if (!plotForm.value.title.trim()) {
    message.warning('请输入标题');
    return;
  }
  
  try {
    const plotData: Partial<PlotNode> = {
      title: plotForm.value.title.trim(),
      description: plotForm.value.description.trim(),
      type: plotForm.value.type,
      chapterRange: plotForm.value.chapterRange,
      purpose: plotForm.value.purpose.trim(),
      keyEvents: plotForm.value.keyEvents,
      relatedCharacters: plotForm.value.relatedCharacters,
      parentId: plotForm.value.parentId || undefined,
      orderIndex: plotForm.value.orderIndex,
    };
    
    if (plotDialogMode.value === 'create') {
      await projectStore.createPlotNode(plotData as any);
      message.success('剧情节点创建成功');
    } else {
      if (editingPlot.value) {
        await projectStore.updatePlotNode(editingPlot.value.id, plotData);
        message.success('剧情节点已更新');
      }
    }
    showPlotDialog.value = false;
  } catch (error) {
    message.error('操作失败');
  }
}

async function handleDeletePlot(id: string) {
  try {
    await projectStore.deletePlotNode(id);
    message.success('剧情节点已删除');
  } catch (error) {
    message.error('删除失败');
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Search -->
    <div class="relative">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--moliu-text-secondary)]" />
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索剧情大纲..."
        class="w-full pl-10 pr-4 py-2 rounded-lg bg-[var(--moliu-bg-primary)] border border-[var(--moliu-border-color)] text-sm focus:outline-none focus:border-[var(--moliu-primary)]"
      />
    </div>

    <!-- Add Buttons -->
    <div class="flex flex-wrap gap-2">
      <NButton size="small" type="primary" @click="openAddPlotDialog('act')">
        <template #icon>
          <Plus class="w-3 h-3" />
        </template>
        添加幕
      </NButton>
      <NButton size="small" type="warning" @click="openAddPlotDialog('subplot')">
        <template #icon>
          <Plus class="w-3 h-3" />
        </template>
        添加支线
      </NButton>
      <NButton size="small" type="info" @click="openAddPlotDialog('chapter')">
        <template #icon>
          <Plus class="w-3 h-3" />
        </template>
        添加章节
      </NButton>
    </div>

    <!-- Plot Outline -->
    <div v-if="filteredPlots.length > 0" class="space-y-3">
      <!-- Acts -->
      <div v-if="groupedPlots.act.length > 0">
        <div class="flex items-center gap-2 mb-2">
          <Layers class="w-4 h-4 text-purple-500" />
          <span class="text-sm font-medium text-[var(--moliu-text-secondary)]">四幕结构</span>
        </div>
        <div class="space-y-2 pl-2">
          <div
            v-for="plot in groupedPlots.act"
            :key="plot.id"
            class="rounded-lg bg-[var(--moliu-bg-primary)] border border-purple-200 dark:border-purple-800 overflow-hidden"
          >
            <div 
              class="p-3 cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
              @click="toggleExpand(plot.id)"
            >
              <div class="flex items-center gap-2">
                <component 
                  :is="expandedNodes.has(plot.id) ? ChevronDown : ChevronRight"
                  class="w-4 h-4 text-purple-400"
                />
                <NTag size="tiny" :style="{ backgroundColor: getPlotTypeColor(plot.type) + '20', color: getPlotTypeColor(plot.type) }">
                  {{ getPlotTypeLabel(plot.type) }}
                </NTag>
                <span class="font-medium text-[var(--moliu-text-primary)]">{{ plot.title }}</span>
                <span v-if="plot.chapterRange" class="text-xs text-[var(--moliu-text-secondary)]">
                  第{{ plot.chapterRange[0] }}-{{ plot.chapterRange[1] }}章
                </span>
                <div class="flex items-center gap-1 ml-auto opacity-0 group-hover:opacity-100">
                  <button
                    class="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                    @click.stop="openEditPlotDialog(plot)"
                  >
                    <Edit3 class="w-3 h-3 text-gray-400" />
                  </button>
                  <button
                    class="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                    @click.stop="handleDeletePlot(plot.id)"
                  >
                    <Trash2 class="w-3 h-3 text-red-400" />
                  </button>
                </div>
              </div>
            </div>
            <div v-if="expandedNodes.has(plot.id)" class="px-3 pb-3 border-t border-purple-100 dark:border-purple-800 pt-2">
              <p v-if="plot.description" class="text-sm text-[var(--moliu-text-secondary)] whitespace-pre-wrap">
                {{ plot.description }}
              </p>
              <p v-if="plot.purpose" class="text-xs text-purple-600 dark:text-purple-400 mt-2">
                主题：{{ plot.purpose }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Subplots -->
      <div v-if="groupedPlots.subplot.length > 0">
        <div class="flex items-center gap-2 mb-2">
          <Map class="w-4 h-4 text-orange-500" />
          <span class="text-sm font-medium text-[var(--moliu-text-secondary)]">支线情节</span>
        </div>
        <div class="space-y-2 pl-2">
          <div
            v-for="plot in groupedPlots.subplot"
            :key="plot.id"
            class="rounded-lg bg-[var(--moliu-bg-primary)] border border-orange-200 dark:border-orange-800 overflow-hidden"
          >
            <div 
              class="p-3 cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
              @click="toggleExpand(plot.id)"
            >
              <div class="flex items-center gap-2">
                <component 
                  :is="expandedNodes.has(plot.id) ? ChevronDown : ChevronRight"
                  class="w-4 h-4 text-orange-400"
                />
                <NTag size="tiny" :style="{ backgroundColor: getPlotTypeColor(plot.type) + '20', color: getPlotTypeColor(plot.type) }">
                  {{ getPlotTypeLabel(plot.type) }}
                </NTag>
                <span class="font-medium text-[var(--moliu-text-primary)]">{{ plot.title }}</span>
                <span v-if="plot.chapterRange" class="text-xs text-[var(--moliu-text-secondary)]">
                  第{{ plot.chapterRange[0] }}-{{ plot.chapterRange[1] }}章
                </span>
                <div class="flex items-center gap-1 ml-auto opacity-0 group-hover:opacity-100">
                  <button
                    class="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                    @click.stop="openEditPlotDialog(plot)"
                  >
                    <Edit3 class="w-3 h-3 text-gray-400" />
                  </button>
                  <button
                    class="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                    @click.stop="handleDeletePlot(plot.id)"
                  >
                    <Trash2 class="w-3 h-3 text-red-400" />
                  </button>
                </div>
              </div>
            </div>
            <div v-if="expandedNodes.has(plot.id)" class="px-3 pb-3 border-t border-orange-100 dark:border-orange-800 pt-2 space-y-2">
              <p v-if="plot.description" class="text-sm text-[var(--moliu-text-secondary)] whitespace-pre-wrap">
                {{ plot.description }}
              </p>
              <p v-if="plot.purpose" class="text-xs text-orange-600 dark:text-orange-400">
                目的：{{ plot.purpose }}
              </p>
              <div v-if="plot.relatedCharacters?.length" class="flex items-center gap-2 flex-wrap">
                <span class="text-xs text-[var(--moliu-text-secondary)]">涉及角色：</span>
                <NTag
                  v-for="char in plot.relatedCharacters"
                  :key="char"
                  size="tiny"
                  type="info"
                >
                  {{ char }}
                </NTag>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Chapters -->
      <div v-if="groupedPlots.chapter.length > 0">
        <div class="flex items-center gap-2 mb-2">
          <BookOpen class="w-4 h-4 text-blue-500" />
          <span class="text-sm font-medium text-[var(--moliu-text-secondary)]">章节级大纲</span>
        </div>
        <div class="grid grid-cols-1 gap-2 pl-2">
          <div
            v-for="plot in groupedPlots.chapter"
            :key="plot.id"
            class="rounded-lg bg-[var(--moliu-bg-primary)] border border-blue-200 dark:border-blue-800 p-3 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            @click="toggleExpand(plot.id)"
          >
            <div class="flex items-center gap-2">
              <NTag size="tiny" :style="{ backgroundColor: getPlotTypeColor(plot.type) + '20', color: getPlotTypeColor(plot.type) }">
                {{ plot.title }}
              </NTag>
              <span v-if="plot.keyEvents?.length" class="text-xs text-[var(--moliu-text-secondary)]">
                {{ plot.keyEvents.length }}个关键事件
              </span>
              <div class="flex items-center gap-1 ml-auto opacity-0 group-hover:opacity-100">
                <button
                  class="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                  @click.stop="openEditPlotDialog(plot)"
                >
                  <Edit3 class="w-3 h-3 text-gray-400" />
                </button>
                <button
                  class="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                  @click.stop="handleDeletePlot(plot.id)"
                >
                  <Trash2 class="w-3 h-3 text-red-400" />
                </button>
              </div>
            </div>
            <div v-if="expandedNodes.has(plot.id)" class="mt-2 space-y-2">
              <p v-if="plot.description" class="text-sm text-[var(--moliu-text-secondary)] whitespace-pre-wrap">
                {{ plot.description }}
              </p>
              <div v-if="plot.keyEvents?.length" class="space-y-1">
                <span class="text-xs font-medium text-[var(--moliu-text-secondary)]">关键事件：</span>
                <ul class="text-xs text-[var(--moliu-text-secondary)] list-disc list-inside space-y-0.5">
                  <li v-for="event in plot.keyEvents" :key="event">{{ event }}</li>
                </ul>
              </div>
              <div v-if="plot.relatedCharacters?.length" class="flex items-center gap-2 flex-wrap">
                <span class="text-xs font-medium text-[var(--moliu-text-secondary)]">涉及角色：</span>
                <NTag
                  v-for="char in plot.relatedCharacters"
                  :key="char"
                  size="tiny"
                  type="info"
                >
                  {{ char }}
                </NTag>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <NEmpty v-else :description="'暂无剧情大纲'" size="small" />

    <!-- Plot Dialog -->
    <NModal
      v-model:show="showPlotDialog"
      preset="dialog"
      :title="plotDialogMode === 'create' ? '添加剧情节点' : '编辑剧情节点'"
      style="width: 600px; max-height: 90vh;"
      :mask-closable="false"
    >
      <div class="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
        <div class="flex gap-4">
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">节点类型</label>
            <NSelect
              v-model:value="plotForm.type"
              :options="plotTypeOptions"
              placeholder="选择类型"
              :disabled="plotDialogMode === 'edit'"
            />
          </div>
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">标题 *</label>
            <NInput
              v-model:value="plotForm.title"
              placeholder="输入标题"
            />
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">描述</label>
          <NInput
            v-model:value="plotForm.description"
            type="textarea"
            :rows="3"
            placeholder="输入剧情描述..."
          />
        </div>

        <div class="flex gap-4">
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">起始章节</label>
            <NInput
              v-model:value="plotForm.chapterRange![0]"
              type="number"
              placeholder="起始章节"
            />
          </div>
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">结束章节</label>
            <NInput
              v-model:value="plotForm.chapterRange![1]"
              type="number"
              placeholder="结束章节"
            />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">主题/目的</label>
          <NInput
            v-model:value="plotForm.purpose"
            type="textarea"
            :rows="2"
            placeholder="本节点的主题或目的（可选）"
          />
        </div>

        <!-- Key Events (for chapter type) -->
        <div v-if="plotForm.type === 'chapter'">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">关键事件</label>
          <div class="flex flex-wrap gap-2 mb-2">
            <NTag
              v-for="(event, index) in plotForm.keyEvents"
              :key="index"
              closable
              @close="removeKeyEvent(index)"
            >
              {{ event }}
            </NTag>
          </div>
          <div class="flex gap-2">
            <NInput
              v-model:value="newKeyEvent"
              placeholder="输入关键事件后按回车添加"
              @keyup.enter="addKeyEvent"
            />
            <NButton @click="addKeyEvent">添加</NButton>
          </div>
        </div>

        <!-- Related Characters (for subplot and chapter types) -->
        <div v-if="plotForm.type === 'subplot' || plotForm.type === 'chapter'">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">涉及角色</label>
          <div class="flex flex-wrap gap-2 mb-2">
            <NTag
              v-for="(char, index) in plotForm.relatedCharacters"
              :key="index"
              closable
              @close="removeRelatedCharacter(index)"
            >
              {{ char }}
            </NTag>
          </div>
          <div class="flex flex-wrap gap-2 mb-2" v-if="existingCharacterNames.length > 0">
            <span class="text-xs text-[var(--moliu-text-secondary)]">快速添加：</span>
            <NTag
              v-for="name in existingCharacterNames"
              :key="name"
              size="tiny"
              class="cursor-pointer hover:opacity-80"
              :type="plotForm.relatedCharacters.includes(name) ? 'info' : 'default'"
              @click="selectRelatedCharacter(name)"
            >
              {{ name }}
            </NTag>
          </div>
          <div class="flex gap-2">
            <NInput
              v-model:value="newRelatedCharacter"
              placeholder="输入角色名称后按回车添加"
              @keyup.enter="addRelatedCharacter"
            />
            <NButton @click="addRelatedCharacter">添加</NButton>
          </div>
        </div>
      </div>
      
      <template #action>
        <div class="flex justify-end gap-2">
          <NButton @click="showPlotDialog = false">取消</NButton>
          <NButton type="primary" @click="handlePlotDialogConfirm">确认</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

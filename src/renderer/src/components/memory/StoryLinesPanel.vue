<script setup lang="ts">
import { ref, computed } from 'vue';
import { NCard, NButton, NInput, NSelect, NTag, NEmpty, NModal, NCollapse, NCollapseItem, NPopconfirm, useMessage } from 'naive-ui';
import { Plus, Trash2, Edit3, Save, X, Map, Users, Swords, Zap, Globe, Layers, Package, Heart, ChevronDown } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/stores/project.store';
import { ROMANCE_STAGE_LABELS, type StoryLines, type RomanceStageType } from '@/types/project';

const { t } = useI18n();
const projectStore = useProjectStore();
const message = useMessage();

// 八条故事线配置
const storyLinesConfig = [
  { key: 'map', label: '地图线', icon: Map, color: '#3b82f6', description: '地点变迁和地图推进' },
  { key: 'faction', label: '阵营线', icon: Layers, color: '#8b5cf6', description: '势力发展和阵营变化' },
  { key: 'character', label: '人物线', icon: Users, color: '#22c55e', description: '角色登场和关系变化' },
  { key: 'goldenfinger', label: '金手指线', icon: Zap, color: '#f59e0b', description: '主角能力提升' },
  { key: 'worldRules', label: '世界观线', icon: Globe, color: '#06b6d4', description: '规则揭示和世界观扩展' },
  { key: 'conflict', label: '矛盾线', icon: Swords, color: '#ef4444', description: '冲突升级和解决' },
  { key: 'collection', label: '收集线', icon: Package, color: '#ec4899', description: '物品收集和资源获取' },
  { key: 'romance', label: '感情线', icon: Heart, color: '#f43f5e', description: '感情发展和关系变化' },
];

// 编辑状态
const isEditing = ref(false);
const editingLines = ref<StoryLines | null>(null);

// 展开的面板
const expandedPanels = ref<string[]>(['map', 'romance']);

// 感情线编辑
const showRomanceDialog = ref(false);
const romanceForm = ref({
  currentStage: 'cold' as RomanceStageType,
  progression: [] as { chapter: number; stage: RomanceStageType; description: string }[],
});
const newProgression = ref({
  chapter: 1,
  stage: 'cold' as RomanceStageType,
  description: '',
});

// 初始化编辑数据
function initEditData() {
  if (projectStore.storyLines) {
    editingLines.value = JSON.parse(JSON.stringify(projectStore.storyLines));
  } else {
    editingLines.value = {
      id: `storylines-${Date.now()}`,
      map: { planned: [], introduced: [], current: '', chaptersPerLocation: 50 },
      faction: { planned: [], introduced: [], currentLevel: 1, escalationChapters: [] },
      character: { planned: [], introduced: [], keyRelationships: [] },
      goldenfinger: { type: '', currentStage: 1, upgrades: [] },
      worldRules: { revealed: [], pending: [] },
      conflict: { chains: [], activeConflict: '' },
      collection: { target: [], progress: [] },
      romance: { currentStage: 'cold', progression: [] },
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
  editingLines.value = null;
}

// 保存
async function saveLines() {
  if (!editingLines.value) return;
  
  await projectStore.updateStoryLines(editingLines.value);
  message.success('八条故事线已保存');
  isEditing.value = false;
}

// 删除
async function deleteLines() {
  await projectStore.deleteStoryLines();
  message.success('八条故事线已删除');
}

// ===== 地图线 =====
function addMapPlanned(location: string) {
  if (!editingLines.value || !location.trim()) return;
  if (!editingLines.value.map.planned.includes(location.trim())) {
    editingLines.value.map.planned.push(location.trim());
  }
}

function removeMapPlanned(index: number) {
  if (!editingLines.value) return;
  editingLines.value.map.planned.splice(index, 1);
}

function addMapIntroduced(location: string) {
  if (!editingLines.value || !location.trim()) return;
  if (!editingLines.value.map.introduced.includes(location.trim())) {
    editingLines.value.map.introduced.push(location.trim());
  }
}

function removeMapIntroduced(index: number) {
  if (!editingLines.value) return;
  editingLines.value.map.introduced.splice(index, 1);
}

// ===== 阵营线 =====
function addFactionPlanned(faction: string) {
  if (!editingLines.value || !faction.trim()) return;
  if (!editingLines.value.faction.planned.includes(faction.trim())) {
    editingLines.value.faction.planned.push(faction.trim());
  }
}

function removeFactionPlanned(index: number) {
  if (!editingLines.value) return;
  editingLines.value.faction.planned.splice(index, 1);
}

function addFactionIntroduced(faction: string) {
  if (!editingLines.value || !faction.trim()) return;
  if (!editingLines.value.faction.introduced.includes(faction.trim())) {
    editingLines.value.faction.introduced.push(faction.trim());
  }
}

function removeFactionIntroduced(index: number) {
  if (!editingLines.value) return;
  editingLines.value.faction.introduced.splice(index, 1);
}

function addFactionEscalation(chapter: number) {
  if (!editingLines.value) return;
  if (!editingLines.value.faction.escalationChapters.includes(chapter)) {
    editingLines.value.faction.escalationChapters.push(chapter);
    editingLines.value.faction.escalationChapters.sort((a, b) => a - b);
  }
}

function removeFactionEscalation(chapter: number) {
  if (!editingLines.value) return;
  editingLines.value.faction.escalationChapters = editingLines.value.faction.escalationChapters.filter(c => c !== chapter);
}

// ===== 人物线 =====
function addCharacterPlanned(character: { id: string; role: string }) {
  if (!editingLines.value || !character.id.trim()) return;
  if (!editingLines.value.character.planned.find(c => c.id === character.id)) {
    editingLines.value.character.planned.push(character);
  }
}

function removeCharacterPlanned(index: number) {
  if (!editingLines.value) return;
  editingLines.value.character.planned.splice(index, 1);
}

function addCharacterIntroduced(name: string) {
  if (!editingLines.value || !name.trim()) return;
  if (!editingLines.value.character.introduced.includes(name.trim())) {
    editingLines.value.character.introduced.push(name.trim());
  }
}

function removeCharacterIntroduced(index: number) {
  if (!editingLines.value) return;
  editingLines.value.character.introduced.splice(index, 1);
}

// ===== 金手指线 =====
function addGoldenfingerUpgrade(chapter: number, description: string) {
  if (!editingLines.value || !description.trim()) return;
  editingLines.value.goldenfinger.upgrades.push({ chapter, description });
  editingLines.value.goldenfinger.upgrades.sort((a, b) => a.chapter - b.chapter);
}

function removeGoldenfingerUpgrade(index: number) {
  if (!editingLines.value) return;
  editingLines.value.goldenfinger.upgrades.splice(index, 1);
}

// ===== 世界观线 =====
function addWorldRuleRevealed(rule: string) {
  if (!editingLines.value || !rule.trim()) return;
  if (!editingLines.value.worldRules.revealed.includes(rule.trim())) {
    editingLines.value.worldRules.revealed.push(rule.trim());
  }
}

function removeWorldRuleRevealed(index: number) {
  if (!editingLines.value) return;
  editingLines.value.worldRules.revealed.splice(index, 1);
}

function addWorldRulePending(rule: string) {
  if (!editingLines.value || !rule.trim()) return;
  if (!editingLines.value.worldRules.pending.includes(rule.trim())) {
    editingLines.value.worldRules.pending.push(rule.trim());
  }
}

function removeWorldRulePending(index: number) {
  if (!editingLines.value) return;
  editingLines.value.worldRules.pending.splice(index, 1);
}

// ===== 收集线 =====
function addCollectionTarget(item: string) {
  if (!editingLines.value || !item.trim()) return;
  if (!editingLines.value.collection.target.includes(item.trim())) {
    editingLines.value.collection.target.push(item.trim());
  }
}

function removeCollectionTarget(index: number) {
  if (!editingLines.value) return;
  editingLines.value.collection.target.splice(index, 1);
}

function toggleCollectionProgress(item: string, acquired: boolean, chapter?: number) {
  if (!editingLines.value) return;
  const existing = editingLines.value.collection.progress.find(p => p.item === item);
  if (existing) {
    existing.acquired = acquired;
    existing.chapter = chapter;
  } else {
    editingLines.value.collection.progress.push({ item, acquired, chapter });
  }
}

// ===== 感情线 =====
function openRomanceDialog() {
  if (!editingLines.value) return;
  romanceForm.value = {
    currentStage: editingLines.value.romance.currentStage,
    progression: [...editingLines.value.romance.progression],
  };
  showRomanceDialog.value = true;
}

function addRomanceProgression() {
  if (!romanceForm.value.description.trim()) {
    message.warning('请填写进展描述');
    return;
  }
  romanceForm.value.progression.push({
    chapter: romanceForm.value.chapter,
    stage: romanceForm.value.stage,
    description: romanceForm.value.description,
  });
  romanceForm.value.progression.sort((a, b) => a.chapter - b.chapter);
  romanceForm.value.description = '';
}

function removeRomanceProgression(index: number) {
  romanceForm.value.progression.splice(index, 1);
}

function saveRomance() {
  if (!editingLines.value) return;
  editingLines.value.romance.currentStage = romanceForm.value.currentStage;
  editingLines.value.romance.progression = romanceForm.value.progression;
  showRomanceDialog.value = false;
}

// 获取感情阶段颜色
function getRomanceStageColor(stage: RomanceStageType): string {
  const colors: Record<RomanceStageType, string> = {
    cold: '#6b7280',
    warm: '#f59e0b',
    hot: '#ef4444',
    climax: '#ec4899',
  };
  return colors[stage] || '#6b7280';
}

// 获取感情阶段标签
function getRomanceStageLabel(stage: RomanceStageType): string {
  return ROMANCE_STAGE_LABELS[stage]?.label || stage;
}

// 获取进度统计
const progressStats = computed(() => {
  if (!projectStore.storyLines) return null;
  
  const stats = {
    map: {
      total: projectStore.storyLines.map.planned.length,
      introduced: projectStore.storyLines.map.introduced.length,
      progress: projectStore.storyLines.map.planned.length > 0 
        ? Math.round((projectStore.storyLines.map.introduced.length / projectStore.storyLines.map.planned.length) * 100)
        : 0,
    },
    faction: {
      total: projectStore.storyLines.faction.planned.length,
      introduced: projectStore.storyLines.faction.introduced.length,
      progress: projectStore.storyLines.faction.planned.length > 0
        ? Math.round((projectStore.storyLines.faction.introduced.length / projectStore.storyLines.faction.planned.length) * 100)
        : 0,
    },
    collection: {
      total: projectStore.storyLines.collection.target.length,
      acquired: projectStore.storyLines.collection.progress.filter(p => p.acquired).length,
      progress: projectStore.storyLines.collection.target.length > 0
        ? Math.round((projectStore.storyLines.collection.progress.filter(p => p.acquired).length / projectStore.storyLines.collection.target.length) * 100)
        : 0,
    },
  };
  
  return stats;
});
</script>

<template>
  <div class="space-y-4">
    <!-- 头部 -->
    <div class="flex items-center justify-between p-3 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-100 dark:border-indigo-800">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm">
          <Layers class="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 class="font-semibold text-sm text-gray-900 dark:text-white">八条故事线</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400">管理故事的核心发展线</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <NButton v-if="!projectStore.storyLines && !isEditing" size="small" type="primary" @click="startEdit">
          <template #icon>
            <Plus class="w-4 h-4" />
          </template>
          创建
        </NButton>
        <NButton v-if="projectStore.storyLines && !isEditing" size="small" @click="startEdit">
          <template #icon>
            <Edit3 class="w-4 h-4" />
          </template>
          编辑
        </NButton>
        <NPopconfirm v-if="projectStore.storyLines && !isEditing" @positive-click="deleteLines">
          <template #trigger>
            <NButton size="small" type="error" quaternary>
              <template #icon>
                <Trash2 class="w-4 h-4" />
              </template>
            </NButton>
          </template>
          确定要删除八条故事线吗？
        </NPopconfirm>
      </div>
    </div>

    <!-- 无数据状态 -->
    <NEmpty v-if="!projectStore.storyLines && !isEditing" description="暂无八条故事线" size="small">
      <template #extra>
        <NButton size="small" @click="startEdit">创建故事线</NButton>
      </template>
    </NEmpty>

    <!-- 查看模式 -->
    <div v-if="projectStore.storyLines && !isEditing" class="space-y-3">
      <!-- 进度概览 -->
      <div v-if="progressStats" class="grid grid-cols-3 gap-3">
        <div class="p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div class="flex items-center gap-2 mb-2">
            <Map class="w-4 h-4 text-blue-500" />
            <span class="text-xs font-medium text-gray-600 dark:text-gray-400">地图线</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div class="h-full bg-blue-500" :style="{ width: `${progressStats.map.progress}%` }" />
            </div>
            <span class="text-xs text-gray-500">{{ progressStats.map.introduced }}/{{ progressStats.map.total }}</span>
          </div>
        </div>
        <div class="p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div class="flex items-center gap-2 mb-2">
            <Layers class="w-4 h-4 text-purple-500" />
            <span class="text-xs font-medium text-gray-600 dark:text-gray-400">阵营线</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div class="h-full bg-purple-500" :style="{ width: `${progressStats.faction.progress}%` }" />
            </div>
            <span class="text-xs text-gray-500">{{ progressStats.faction.introduced }}/{{ progressStats.faction.total }}</span>
          </div>
        </div>
        <div class="p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div class="flex items-center gap-2 mb-2">
            <Package class="w-4 h-4 text-pink-500" />
            <span class="text-xs font-medium text-gray-600 dark:text-gray-400">收集线</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div class="h-full bg-pink-500" :style="{ width: `${progressStats.collection.progress}%` }" />
            </div>
            <span class="text-xs text-gray-500">{{ progressStats.collection.acquired }}/{{ progressStats.collection.total }}</span>
          </div>
        </div>
      </div>

      <!-- 折叠面板 -->
      <NCollapse v-model:expanded-names="expandedPanels" accordion>
        <!-- 地图线 -->
        <NCollapseItem title="地图线" name="map">
          <template #header>
            <div class="flex items-center gap-2">
              <Map class="w-4 h-4" :style="{ color: '#3b82f6' }" />
              <span class="font-medium">地图线</span>
            </div>
          </template>
          <div class="space-y-3">
            <div>
              <div class="text-xs text-gray-500 mb-2">规划地点 ({{ projectStore.storyLines.map.planned.length }})</div>
              <div class="flex flex-wrap gap-1">
                <NTag v-for="(loc, index) in projectStore.storyLines.map.planned" :key="`map-planned-${index}`" size="small" type="info">{{ loc }}</NTag>
              </div>
            </div>
            <div>
              <div class="text-xs text-gray-500 mb-2">已引入 ({{ projectStore.storyLines.map.introduced.length }})</div>
              <div class="flex flex-wrap gap-1">
                <NTag v-for="(loc, index) in projectStore.storyLines.map.introduced" :key="`map-intro-${index}`" size="small" type="success">{{ loc }}</NTag>
              </div>
            </div>
            <div v-if="projectStore.storyLines.map.current" class="text-sm">
              <span class="text-gray-500">当前地点：</span>
              <span class="font-medium">{{ projectStore.storyLines.map.current }}</span>
            </div>
          </div>
        </NCollapseItem>

        <!-- 阵营线 -->
        <NCollapseItem title="阵营线" name="faction">
          <template #header>
            <div class="flex items-center gap-2">
              <Layers class="w-4 h-4" :style="{ color: '#8b5cf6' }" />
              <span class="font-medium">阵营线</span>
            </div>
          </template>
          <div class="space-y-3">
            <div>
              <div class="text-xs text-gray-500 mb-2">规划势力 ({{ projectStore.storyLines.faction.planned.length }})</div>
              <div class="flex flex-wrap gap-1">
                <NTag v-for="(fac, index) in projectStore.storyLines.faction.planned" :key="`faction-planned-${index}`" size="small" type="info">{{ fac }}</NTag>
              </div>
            </div>
            <div>
              <div class="text-xs text-gray-500 mb-2">已引入 ({{ projectStore.storyLines.faction.introduced.length }})</div>
              <div class="flex flex-wrap gap-1">
                <NTag v-for="(fac, index) in projectStore.storyLines.faction.introduced" :key="`faction-intro-${index}`" size="small" type="success">{{ fac }}</NTag>
              </div>
            </div>
          </div>
        </NCollapseItem>

        <!-- 人物线 -->
        <NCollapseItem title="人物线" name="character">
          <template #header>
            <div class="flex items-center gap-2">
              <Users class="w-4 h-4" :style="{ color: '#22c55e' }" />
              <span class="font-medium">人物线</span>
            </div>
          </template>
          <div class="space-y-3">
            <div>
              <div class="text-xs text-gray-500 mb-2">规划角色 ({{ projectStore.storyLines.character.planned.length }})</div>
              <div class="flex flex-wrap gap-1">
                <NTag v-for="char in projectStore.storyLines.character.planned" :key="char.id" size="small" type="info">
                  {{ char.id }} ({{ char.role }})
                </NTag>
              </div>
            </div>
            <div>
              <div class="text-xs text-gray-500 mb-2">已引入 ({{ projectStore.storyLines.character.introduced.length }})</div>
              <div class="flex flex-wrap gap-1">
                <NTag v-for="(name, index) in projectStore.storyLines.character.introduced" :key="`char-intro-${index}`" size="small" type="success">{{ name }}</NTag>
              </div>
            </div>
          </div>
        </NCollapseItem>

        <!-- 金手指线 -->
        <NCollapseItem title="金手指线" name="goldenfinger">
          <template #header>
            <div class="flex items-center gap-2">
              <Zap class="w-4 h-4" :style="{ color: '#f59e0b' }" />
              <span class="font-medium">金手指线</span>
            </div>
          </template>
          <div class="space-y-3">
            <div v-if="projectStore.storyLines.goldenfinger.type" class="text-sm">
              <span class="text-gray-500">金手指类型：</span>
              <span class="font-medium">{{ projectStore.storyLines.goldenfinger.type }}</span>
            </div>
            <div>
              <div class="text-xs text-gray-500 mb-2">升级节点 ({{ projectStore.storyLines.goldenfinger.upgrades.length }})</div>
              <div class="space-y-1">
                <div v-for="(upgrade, index) in projectStore.storyLines.goldenfinger.upgrades" :key="`goldenfinger-upgrade-${index}`" class="flex items-center gap-2 text-sm">
                  <NTag size="tiny" type="warning">第{{ upgrade.chapter }}章</NTag>
                  <span>{{ upgrade.description }}</span>
                </div>
              </div>
            </div>
          </div>
        </NCollapseItem>

        <!-- 世界观线 -->
        <NCollapseItem title="世界观线" name="worldRules">
          <template #header>
            <div class="flex items-center gap-2">
              <Globe class="w-4 h-4" :style="{ color: '#06b6d4' }" />
              <span class="font-medium">世界观线</span>
            </div>
          </template>
          <div class="space-y-3">
            <div>
              <div class="text-xs text-gray-500 mb-2">已揭示规则 ({{ projectStore.storyLines.worldRules.revealed.length }})</div>
              <div class="flex flex-wrap gap-1">
                <NTag v-for="(rule, index) in projectStore.storyLines.worldRules.revealed" :key="`world-rules-revealed-${index}`" size="small" type="success">{{ rule }}</NTag>
              </div>
            </div>
            <div>
              <div class="text-xs text-gray-500 mb-2">待揭示规则 ({{ projectStore.storyLines.worldRules.pending.length }})</div>
              <div class="flex flex-wrap gap-1">
                <NTag v-for="(rule, index) in projectStore.storyLines.worldRules.pending" :key="`world-rules-pending-${index}`" size="small" type="default">{{ rule }}</NTag>
              </div>
            </div>
          </div>
        </NCollapseItem>

        <!-- 矛盾线 -->
        <NCollapseItem title="矛盾线" name="conflict">
          <template #header>
            <div class="flex items-center gap-2">
              <Swords class="w-4 h-4" :style="{ color: '#ef4444' }" />
              <span class="font-medium">矛盾线</span>
            </div>
          </template>
          <div class="space-y-2">
            <div v-for="(chain, index) in projectStore.storyLines.conflict.chains" :key="`conflict-chain-${index}`" class="p-2 rounded bg-gray-50 dark:bg-gray-800">
              <div class="flex items-center gap-2 mb-1">
                <NTag size="tiny" :type="chain.status === 'resolved' ? 'success' : chain.status === 'active' ? 'warning' : 'default'">
                  Lv.{{ chain.level }}
                </NTag>
                <span class="font-medium text-sm">{{ chain.name }}</span>
              </div>
              <p class="text-xs text-gray-500">{{ chain.description }}</p>
            </div>
            <p v-if="projectStore.storyLines.conflict.chains.length === 0" class="text-sm text-gray-400 text-center py-2">
              暂无矛盾链
            </p>
          </div>
        </NCollapseItem>

        <!-- 收集线 -->
        <NCollapseItem title="收集线" name="collection">
          <template #header>
            <div class="flex items-center gap-2">
              <Package class="w-4 h-4" :style="{ color: '#ec4899' }" />
              <span class="font-medium">收集线</span>
            </div>
          </template>
          <div class="space-y-3">
            <div v-for="(item, index) in projectStore.storyLines.collection.target" :key="`collection-target-${index}`" class="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-gray-800">
              <span class="text-sm">{{ item }}</span>
              <NTag :type="projectStore.storyLines.collection.progress.find(p => p.item === item)?.acquired ? 'success' : 'default'" size="small">
                {{ projectStore.storyLines.collection.progress.find(p => p.item === item)?.acquired ? '已获得' : '未获得' }}
              </NTag>
            </div>
            <p v-if="projectStore.storyLines.collection.target.length === 0" class="text-sm text-gray-400 text-center py-2">
              暂无收集目标
            </p>
          </div>
        </NCollapseItem>

        <!-- 感情线 -->
        <NCollapseItem title="感情线" name="romance">
          <template #header>
            <div class="flex items-center gap-2">
              <Heart class="w-4 h-4" :style="{ color: '#f43f5e' }" />
              <span class="font-medium">感情线</span>
              <NTag size="tiny" :color="{ color: getRomanceStageColor(projectStore.storyLines.romance.currentStage), textColor: '#fff' }">
                {{ getRomanceStageLabel(projectStore.storyLines.romance.currentStage) }}
              </NTag>
            </div>
          </template>
          <div class="space-y-3">
            <div v-if="projectStore.storyLines.romance.progression.length > 0" class="space-y-2">
              <div v-for="(prog, index) in projectStore.storyLines.romance.progression" :key="`romance-prog-${index}`" class="p-2 rounded bg-pink-50 dark:bg-pink-900/20">
                <div class="flex items-center gap-2 mb-1">
                  <NTag size="tiny" :color="{ color: getRomanceStageColor(prog.stage), textColor: '#fff' }">
                    第{{ prog.chapter }}章
                  </NTag>
                  <NTag size="tiny" type="warning">{{ getRomanceStageLabel(prog.stage) }}</NTag>
                </div>
                <p class="text-sm text-gray-600 dark:text-gray-400">{{ prog.description }}</p>
              </div>
            </div>
            <p v-else class="text-sm text-gray-400 text-center py-2">
              暂无感情进展记录
            </p>
          </div>
        </NCollapseItem>
      </NCollapse>
    </div>

    <!-- 编辑模式 -->
    <div v-if="isEditing && editingLines" class="space-y-3">
      <NCard size="small" :bordered="false" class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
        <!-- 地图线编辑 -->
        <div class="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
          <div class="flex items-center gap-2 mb-3">
            <Map class="w-4 h-4 text-blue-500" />
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">地图线</span>
          </div>
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">规划地点</label>
              <div class="flex flex-wrap gap-1 mb-2">
                <NTag v-for="(loc, index) in editingLines.map.planned" :key="`edit-map-${index}`" size="small" closable @close="removeMapPlanned(index)">{{ loc }}</NTag>
              </div>
              <div class="flex gap-2">
                <NInput size="small" placeholder="添加地点" />
                <NButton size="small">添加</NButton>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">当前地点</label>
              <NInput v-model:value="editingLines.map.current" size="small" placeholder="当前所在地点" />
            </div>
          </div>
        </div>

        <!-- 阵营线编辑 -->
        <div class="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
          <div class="flex items-center gap-2 mb-3">
            <Layers class="w-4 h-4 text-purple-500" />
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">阵营线</span>
          </div>
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">规划势力</label>
              <div class="flex flex-wrap gap-1 mb-2">
                <NTag v-for="(fac, index) in editingLines.faction.planned" :key="`edit-faction-${index}`" size="small" closable @close="removeFactionPlanned(index)">{{ fac }}</NTag>
              </div>
              <div class="flex gap-2">
                <NInput size="small" placeholder="添加势力" />
                <NButton size="small">添加</NButton>
              </div>
            </div>
          </div>
        </div>

        <!-- 感情线编辑 -->
        <div>
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <Heart class="w-4 h-4 text-pink-500" />
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">感情线</span>
            </div>
            <NButton size="tiny" @click="openRomanceDialog">编辑进展</NButton>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-500">当前阶段：</span>
            <NTag :color="{ color: getRomanceStageColor(editingLines.romance.currentStage), textColor: '#fff' }">
              {{ getRomanceStageLabel(editingLines.romance.currentStage) }}
            </NTag>
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
        <NButton type="primary" size="small" @click="saveLines">
          <template #icon>
            <Save class="w-4 h-4" />
          </template>
          保存
        </NButton>
      </div>
    </div>

    <!-- 感情线编辑弹窗 -->
    <NModal
      v-model:show="showRomanceDialog"
      preset="dialog"
      title="编辑感情进展"
      style="width: 600px"
    >
      <div class="space-y-4 py-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            当前阶段
          </label>
          <NSelect
            v-model:value="romanceForm.currentStage"
            :options="Object.entries(ROMANCE_STAGE_LABELS).map(([value, data]) => ({
              label: data.label,
              value,
            }))"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            感情进展
          </label>
          <div class="space-y-2 mb-3 max-h-60 overflow-y-auto">
            <div v-for="(prog, index) in romanceForm.progression" :key="index" class="flex items-center gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800">
              <NTag size="small">{{ prog.chapter }}章</NTag>
              <NTag size="small" :color="{ color: getRomanceStageColor(prog.stage), textColor: '#fff' }">
                {{ getRomanceStageLabel(prog.stage) }}
              </NTag>
              <span class="flex-1 text-sm truncate">{{ prog.description }}</span>
              <NButton size="tiny" quaternary type="error" @click="removeRomanceProgression(index)">删除</NButton>
            </div>
          </div>
          
          <div class="flex gap-2">
            <NInput v-model:value="romanceForm.chapter" type="number" size="small" placeholder="章节" style="width: 80px" />
            <NSelect
              v-model:value="romanceForm.stage"
              size="small"
              style="width: 120px"
              :options="Object.entries(ROMANCE_STAGE_LABELS).map(([value, data]) => ({
                label: data.label,
                value,
              }))"
            />
            <NInput v-model:value="romanceForm.description" size="small" placeholder="描述" class="flex-1" />
            <NButton size="small" @click="addRomanceProgression">添加</NButton>
          </div>
        </div>
      </div>
      <template #action>
        <div class="flex justify-end gap-2">
          <NButton @click="showRomanceDialog = false">取消</NButton>
          <NButton type="primary" @click="saveRomance">保存</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

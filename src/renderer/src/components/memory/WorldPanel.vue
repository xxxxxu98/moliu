<script setup lang="ts">
import { ref, computed } from 'vue';
import { NButton, NInput, NEmpty, NTag, NCard, NModal, NPopconfirm, NSelect, useMessage } from 'naive-ui';
import { Plus, Search, Globe, MapPin, Shield, Trash2, Edit3, ChevronRight, ChevronDown, Network } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/stores/project.store';
import type { Location, Faction, WorldRule, LocationLevel, RuleCategory, FactionRelation } from '@/types/project';
import { RULE_CATEGORY_LABELS } from '@/types/project';

const { t } = useI18n();
const projectStore = useProjectStore();
const message = useMessage();

const searchQuery = ref('');

// Dialog states
const showAddDialog = ref(false);
const addDialogType = ref<'location' | 'faction' | 'rule'>('location');
const addForm = ref({
  name: '',
  description: '',
  locked: false,
  level: 'city' as LocationLevel,
  parentId: '',
  category: 'custom' as RuleCategory,
  relation: undefined as FactionRelation | undefined,
});

// Edit dialog
const showEditDialog = ref(false);
const editingItem = ref<{ type: string; id: string; name: string; description: string; locked?: boolean; level?: LocationLevel; parentId?: string; category?: RuleCategory; relation?: FactionRelation } | null>(null);
const editForm = ref({
  name: '',
  description: '',
  locked: false,
  level: 'city' as LocationLevel,
  parentId: '',
  category: 'custom' as RuleCategory,
  relation: undefined as FactionRelation | undefined,
});

// Location level options
const locationLevelOptions = [
  { label: '世界', value: 'world' },
  { label: '大陆', value: 'continent' },
  { label: '国家', value: 'country' },
  { label: '城市', value: 'city' },
  { label: '城区', value: 'district' },
  { label: '特殊地点', value: 'special' },
];

// Rule category options
const ruleCategoryOptions = Object.entries(RULE_CATEGORY_LABELS).map(([value, label]) => ({
  label,
  value,
}));

// Faction relation type options
const relationTypeOptions = [
  { label: '友好', value: 'ally' },
  { label: '敌对', value: 'enemy' },
  { label: '中立', value: 'neutral' },
];

// Build location tree
const locationTree = computed(() => {
  const locations = projectStore.worldSchema.locations;
  const tree: { root: Location[]; children: Map<string, Location[]> } = {
    root: [],
    children: new Map(),
  };
  
  // Group by parent
  locations.forEach(loc => {
    if (loc.parentId) {
      const children = tree.children.get(loc.parentId) || [];
      children.push(loc);
      tree.children.set(loc.parentId, children);
    } else {
      tree.root.push(loc);
    }
  });
  
  return tree;
});

// Filtered locations (flat for search)
const filteredLocations = computed(() => {
  if (!searchQuery.value.trim()) {
    return projectStore.worldSchema.locations;
  }
  const query = searchQuery.value.toLowerCase();
  return projectStore.worldSchema.locations.filter(l => 
    l.name.toLowerCase().includes(query) || l.description?.toLowerCase().includes(query)
  );
});

const filteredFactions = computed(() => {
  if (!searchQuery.value.trim()) {
    return projectStore.worldSchema.factions;
  }
  const query = searchQuery.value.toLowerCase();
  return projectStore.worldSchema.factions.filter(f => 
    f.name.toLowerCase().includes(query) || f.description?.toLowerCase().includes(query)
  );
});

const filteredRules = computed(() => {
  if (!searchQuery.value.trim()) {
    return projectStore.worldSchema.rules;
  }
  const query = searchQuery.value.toLowerCase();
  return projectStore.worldSchema.rules.filter(r => 
    r.name.toLowerCase().includes(query) || r.description?.toLowerCase().includes(query)
  );
});

function getLocationLevelLabel(level: LocationLevel): string {
  return locationLevelOptions.find(o => o.value === level)?.label || level;
}

function getLocationLevelColor(level: LocationLevel): string {
  const colors: Record<LocationLevel, string> = {
    world: '#8b5cf6',
    continent: '#6366f1',
    country: '#3b82f6',
    city: '#14b8a6',
    district: '#22c55e',
    special: '#f97316',
  };
  return colors[level] || '#6b7280';
}

function getRuleCategoryLabel(category: RuleCategory): string {
  return RULE_CATEGORY_LABELS[category] || category;
}

function getRuleCategoryColor(category: RuleCategory): string {
  const colors: Record<RuleCategory, string> = {
    cultivation: '#8b5cf6',
    magic: '#ec4899',
    social: '#f97316',
    physics: '#14b8a6',
    custom: '#6b7280',
  };
  return colors[category] || '#6b7280';
}

function getFactionRelationLabel(type: string): string {
  const labels: Record<string, string> = {
    ally: '友好',
    enemy: '敌对',
    neutral: '中立',
  };
  return labels[type] || type;
}

function getFactionRelationColor(type: string): string {
  const colors: Record<string, string> = {
    ally: '#22c55e',
    enemy: '#ef4444',
    neutral: '#6b7280',
  };
  return colors[type] || '#6b7280';
}

function getParentLocationName(parentId?: string): string {
  if (!parentId) return '';
  const parent = projectStore.worldSchema.locations.find(l => l.id === parentId);
  return parent?.name || '';
}

function getParentFactionName(parentId?: string): string {
  if (!parentId) return '';
  const parent = projectStore.worldSchema.factions.find(f => f.id === parentId);
  return parent?.name || '';
}

function openAddDialog(type: 'location' | 'faction' | 'rule') {
  addDialogType.value = type;
  if (type === 'location') {
    addForm.value = { name: '', description: '', locked: false, level: 'city', parentId: '' };
  } else if (type === 'faction') {
    addForm.value = { name: '', description: '', locked: false, parentId: '', relation: undefined };
  } else {
    addForm.value = { name: '', description: '', locked: true, category: 'custom' };
  }
  showAddDialog.value = true;
}

async function handleAdd() {
  if (!addForm.value.name.trim()) {
    message.warning('请输入名称');
    return;
  }
  
  try {
    switch (addDialogType.value) {
      case 'location':
        await projectStore.addLocation({ 
          name: addForm.value.name.trim(), 
          description: addForm.value.description.trim(),
          level: addForm.value.level,
          parentId: addForm.value.parentId,
        });
        message.success('地点添加成功');
        break;
      case 'faction':
        await projectStore.addFaction({ 
          name: addForm.value.name.trim(), 
          description: addForm.value.description.trim(),
          parentId: addForm.value.parentId,
          relation: addForm.value.relation,
        });
        message.success('势力添加成功');
        break;
      case 'rule':
        await projectStore.addWorldRule({ 
          name: addForm.value.name.trim(), 
          description: addForm.value.description.trim(),
          locked: addForm.value.locked,
          category: addForm.value.category,
        });
        message.success('规则添加成功');
        break;
    }
    showAddDialog.value = false;
  } catch (error) {
    message.error('添加失败');
  }
}

function openEditDialog(type: string, item: any) {
  editingItem.value = { ...item, type };
  editForm.value = {
    name: item.name,
    description: item.description || '',
    locked: item.locked || false,
    level: item.level || 'city',
    parentId: item.parentId || '',
    category: item.category || 'custom',
    relation: item.relation,
  };
  showEditDialog.value = true;
}

async function handleEdit() {
  if (!editingItem.value || !editForm.value.name.trim()) {
    message.warning('请输入名称');
    return;
  }
  
  try {
    switch (editingItem.value.type) {
      case 'location':
        await projectStore.updateLocation(editingItem.value.id, { 
          name: editForm.value.name.trim(), 
          description: editForm.value.description.trim(),
          level: editForm.value.level,
          parentId: editForm.value.parentId,
        });
        message.success('地点已更新');
        break;
      case 'faction':
        await projectStore.updateFaction(editingItem.value.id, { 
          name: editForm.value.name.trim(), 
          description: editForm.value.description.trim(),
          parentId: editForm.value.parentId,
          relation: editForm.value.relation,
        });
        message.success('势力已更新');
        break;
      case 'rule':
        await projectStore.updateWorldRule(editingItem.value.id, { 
          name: editForm.value.name.trim(), 
          description: editForm.value.description.trim(),
          locked: editForm.value.locked,
          category: editForm.value.category,
        });
        message.success('规则已更新');
        break;
    }
    showEditDialog.value = false;
  } catch (error) {
    message.error('更新失败');
  }
}

async function handleDelete(type: string, id: string) {
  try {
    switch (type) {
      case 'location':
        await projectStore.deleteLocation(id);
        message.success('地点已删除');
        break;
      case 'faction':
        await projectStore.deleteFaction(id);
        message.success('势力已删除');
        break;
      case 'rule':
        await projectStore.deleteWorldRule(id);
        message.success('规则已删除');
        break;
    }
  } catch (error) {
    message.error('删除失败');
  }
}

// Parent options for locations
const locationParentOptions = computed(() => {
  return projectStore.worldSchema.locations
    .filter(l => editingItem.value?.id !== l.id)
    .map(l => ({ label: `${getLocationLevelLabel(l.level)}: ${l.name}`, value: l.id }));
});

// Parent options for factions
const factionParentOptions = computed(() => {
  return projectStore.worldSchema.factions
    .filter(f => editingItem.value?.id !== f.id)
    .map(f => ({ label: f.name, value: f.id }));
});
</script>

<template>
  <div class="space-y-4">
    <!-- Search -->
    <div class="relative">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--moliu-text-secondary)]" />
      <input
        v-model="searchQuery"
        type="text"
        :placeholder="t('world.searchPlaceholder')"
        class="w-full pl-10 pr-4 py-2 rounded-lg bg-[var(--moliu-bg-primary)] border border-[var(--moliu-border-color)] text-sm focus:outline-none focus:border-[var(--moliu-primary)]"
      />
    </div>

    <!-- Add Buttons -->
    <div class="flex gap-2">
      <NButton size="small" quaternary @click="openAddDialog('location')">
        <template #icon>
          <MapPin class="w-4 h-4" />
        </template>
        {{ t('world.location') }}
      </NButton>
      <NButton size="small" quaternary @click="openAddDialog('faction')">
        <template #icon>
          <Shield class="w-4 h-4" />
        </template>
        {{ t('world.faction') }}
      </NButton>
      <NButton size="small" quaternary @click="openAddDialog('rule')">
        <template #icon>
          <Globe class="w-4 h-4" />
        </template>
        {{ t('world.rule') }}
      </NButton>
    </div>

    <!-- World Settings -->
    <div class="space-y-4">
      <!-- Locations with hierarchy -->
      <NCard size="small" :title="t('world.locations')" :bordered="false">
        <div v-if="filteredLocations.length > 0" class="space-y-2">
          <div
            v-for="location in filteredLocations"
            :key="location.id"
            class="p-2 rounded bg-[var(--moliu-bg-primary)] group"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <MapPin class="w-3 h-3 text-[var(--moliu-text-secondary)]" />
                <NTag size="tiny" :style="{ backgroundColor: getLocationLevelColor(location.level) + '20', color: getLocationLevelColor(location.level) }">
                  {{ getLocationLevelLabel(location.level) }}
                </NTag>
                <span class="font-medium text-sm text-[var(--moliu-text-primary)] truncate">{{ location.name }}</span>
                <span v-if="location.parentId" class="text-xs text-[var(--moliu-text-secondary)]">
                  属于 {{ getParentLocationName(location.parentId) }}
                </span>
              </div>
              <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  class="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                  @click="openEditDialog('location', location)"
                >
                  <Edit3 class="w-3 h-3 text-gray-400" />
                </button>
                <button
                  class="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                  @click="handleDelete('location', location.id)"
                >
                  <Trash2 class="w-3 h-3 text-red-400" />
                </button>
              </div>
            </div>
            <p v-if="location.description" class="text-xs text-[var(--moliu-text-secondary)] mt-1 ml-5">{{ location.description }}</p>
          </div>
        </div>
        <div v-else class="text-center py-4 text-sm text-[var(--moliu-text-secondary)]">
          暂无地点，点击上方按钮添加
        </div>
      </NCard>

      <!-- Factions with hierarchy -->
      <NCard size="small" :title="t('world.factions')" :bordered="false">
        <div v-if="filteredFactions.length > 0" class="space-y-2">
          <div
            v-for="faction in filteredFactions"
            :key="faction.id"
            class="p-2 rounded bg-[var(--moliu-bg-primary)] group"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <Shield class="w-3 h-3 text-[var(--moliu-text-secondary)]" />
                <span class="font-medium text-sm text-[var(--moliu-text-primary)] truncate">{{ faction.name }}</span>
                <span v-if="faction.parentId" class="text-xs text-[var(--moliu-text-secondary)]">
                  属于 {{ getParentFactionName(faction.parentId) }}
                </span>
                <NTag v-if="faction.relation" size="tiny" :style="{ backgroundColor: getFactionRelationColor(faction.relation.type) + '20', color: getFactionRelationColor(faction.relation.type) }">
                  {{ getFactionRelationLabel(faction.relation.type) }}
                </NTag>
              </div>
              <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  class="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                  @click="openEditDialog('faction', faction)"
                >
                  <Edit3 class="w-3 h-3 text-gray-400" />
                </button>
                <button
                  class="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                  @click="handleDelete('faction', faction.id)"
                >
                  <Trash2 class="w-3 h-3 text-red-400" />
                </button>
              </div>
            </div>
            <p v-if="faction.description" class="text-xs text-[var(--moliu-text-secondary)] mt-1 ml-5">{{ faction.description }}</p>
            <p v-if="faction.relation?.targetFactionName" class="text-xs text-[var(--moliu-text-secondary)] mt-1 ml-5">
              与 {{ faction.relation.targetFactionName }} {{ getFactionRelationLabel(faction.relation.type) }}
            </p>
          </div>
        </div>
        <div v-else class="text-center py-4 text-sm text-[var(--moliu-text-secondary)]">
          暂无势力，点击上方按钮添加
        </div>
      </NCard>

      <!-- Rules with categories -->
      <NCard size="small" :title="t('world.rules')" :bordered="false">
        <div v-if="filteredRules.length > 0" class="space-y-2">
          <div
            v-for="rule in filteredRules"
            :key="rule.id"
            class="p-2 rounded bg-[var(--moliu-bg-primary)] group"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <Globe class="w-3 h-3 text-[var(--moliu-text-secondary)]" />
                <NTag size="tiny" :style="{ backgroundColor: getRuleCategoryColor(rule.category) + '20', color: getRuleCategoryColor(rule.category) }">
                  {{ getRuleCategoryLabel(rule.category) }}
                </NTag>
                <span class="font-medium text-sm text-[var(--moliu-text-primary)] truncate">{{ rule.name }}</span>
              </div>
              <div class="flex items-center gap-1">
                <NTag v-if="rule.locked" size="tiny" type="warning">{{ t('world.locked') }}</NTag>
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    class="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                    @click="openEditDialog('rule', rule)"
                  >
                    <Edit3 class="w-3 h-3 text-gray-400" />
                  </button>
                  <button
                    class="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                    @click="handleDelete('rule', rule.id)"
                  >
                    <Trash2 class="w-3 h-3 text-red-400" />
                  </button>
                </div>
              </div>
            </div>
            <p v-if="rule.description" class="text-xs text-[var(--moliu-text-secondary)] mt-1 ml-5">{{ rule.description }}</p>
          </div>
        </div>
        <div v-else class="text-center py-4 text-sm text-[var(--moliu-text-secondary)]">
          暂无规则，点击上方按钮添加
        </div>
      </NCard>
    </div>

    <!-- Add Dialog -->
    <NModal
      v-model:show="showAddDialog"
      preset="dialog"
      :title="addDialogType === 'location' ? '添加地点' : addDialogType === 'faction' ? '添加势力' : '添加规则'"
      positive-text="确认"
      negative-text="取消"
      @positive-click="handleAdd"
      @negative-click="showAddDialog = false"
    >
      <div class="space-y-4 py-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">名称</label>
          <NInput
            v-model:value="addForm.name"
            placeholder="输入名称"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">描述</label>
          <NInput
            v-model:value="addForm.description"
            type="textarea"
            :rows="3"
            placeholder="输入描述（可选）"
          />
        </div>
        
        <!-- Location specific fields -->
        <template v-if="addDialogType === 'location'">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">地点层级</label>
            <NSelect
              v-model:value="addForm.level"
              :options="locationLevelOptions"
              placeholder="选择层级"
            />
          </div>
          <div v-if="locationParentOptions.length > 0">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">上级地点</label>
            <NSelect
              v-model:value="addForm.parentId"
              :options="locationParentOptions"
              placeholder="选择上级地点（可选）"
              clearable
            />
          </div>
        </template>
        
        <!-- Faction specific fields -->
        <template v-if="addDialogType === 'faction'">
          <div v-if="factionParentOptions.length > 0">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">上级势力</label>
            <NSelect
              v-model:value="addForm.parentId"
              :options="factionParentOptions"
              placeholder="选择上级势力（可选）"
              clearable
            />
          </div>
        </template>
        
        <!-- Rule specific fields -->
        <template v-if="addDialogType === 'rule'">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">规则类别</label>
            <NSelect
              v-model:value="addForm.category"
              :options="ruleCategoryOptions"
              placeholder="选择类别"
            />
          </div>
        </template>
      </div>
    </NModal>

    <!-- Edit Dialog -->
    <NModal
      v-model:show="showEditDialog"
      preset="dialog"
      :title="'编辑'"
      positive-text="确认"
      negative-text="取消"
      @positive-click="handleEdit"
      @negative-click="showEditDialog = false"
    >
      <div class="space-y-4 py-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">名称</label>
          <NInput
            v-model:value="editForm.name"
            placeholder="输入名称"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">描述</label>
          <NInput
            v-model:value="editForm.description"
            type="textarea"
            :rows="3"
            placeholder="输入描述（可选）"
          />
        </div>
        
        <!-- Location specific fields -->
        <template v-if="editingItem?.type === 'location'">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">地点层级</label>
            <NSelect
              v-model:value="editForm.level"
              :options="locationLevelOptions"
              placeholder="选择层级"
            />
          </div>
          <div v-if="locationParentOptions.length > 0">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">上级地点</label>
            <NSelect
              v-model:value="editForm.parentId"
              :options="locationParentOptions"
              placeholder="选择上级地点（可选）"
              clearable
            />
          </div>
        </template>
        
        <!-- Faction specific fields -->
        <template v-if="editingItem?.type === 'faction'">
          <div v-if="factionParentOptions.length > 0">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">上级势力</label>
            <NSelect
              v-model:value="editForm.parentId"
              :options="factionParentOptions"
              placeholder="选择上级势力（可选）"
              clearable
            />
          </div>
        </template>
        
        <!-- Rule specific fields -->
        <template v-if="editingItem?.type === 'rule'">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">规则类别</label>
            <NSelect
              v-model:value="editForm.category"
              :options="ruleCategoryOptions"
              placeholder="选择类别"
            />
          </div>
        </template>
      </div>
    </NModal>
  </div>
</template>

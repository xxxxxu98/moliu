<script setup lang="ts">
import { ref, computed } from 'vue';
import { NButton, NInput, NEmpty, NTag, NCard, NModal, useMessage } from 'naive-ui';
import { Plus, Search, Globe, MapPin, Shield, Trash2, Edit3 } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/stores/project.store';

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
});

// Edit dialog
const showEditDialog = ref(false);
const editingItem = ref<{ type: string; id: string; name: string; description: string; locked?: boolean } | null>(null);
const editForm = ref({
  name: '',
  description: '',
  locked: false,
});

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

function openAddDialog(type: 'location' | 'faction' | 'rule') {
  addDialogType.value = type;
  addForm.value = { name: '', description: '', locked: type === 'rule' };
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
        await projectStore.addLocation({ name: addForm.value.name.trim(), description: addForm.value.description.trim() });
        message.success('地点添加成功');
        break;
      case 'faction':
        await projectStore.addFaction({ name: addForm.value.name.trim(), description: addForm.value.description.trim() });
        message.success('势力添加成功');
        break;
      case 'rule':
        await projectStore.addWorldRule({ 
          name: addForm.value.name.trim(), 
          description: addForm.value.description.trim(),
          locked: addForm.value.locked 
        });
        message.success('规则添加成功');
        break;
    }
    showAddDialog.value = false;
  } catch (error) {
    message.error('添加失败');
  }
}

function openEditDialog(type: string, item: { id: string; name: string; description?: string; locked?: boolean }) {
  editingItem.value = { ...item, type } as any;
  editForm.value = {
    name: item.name,
    description: item.description || '',
    locked: item.locked || false,
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
          description: editForm.value.description.trim() 
        });
        message.success('地点已更新');
        break;
      case 'faction':
        await projectStore.updateFaction(editingItem.value.id, { 
          name: editForm.value.name.trim(), 
          description: editForm.value.description.trim() 
        });
        message.success('势力已更新');
        break;
      case 'rule':
        await projectStore.updateWorldRule(editingItem.value.id, { 
          name: editForm.value.name.trim(), 
          description: editForm.value.description.trim(),
          locked: editForm.value.locked 
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
      <!-- Locations -->
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
                <span class="font-medium text-sm text-[var(--moliu-text-primary)] truncate">{{ location.name }}</span>
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

      <!-- Factions -->
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
          </div>
        </div>
        <div v-else class="text-center py-4 text-sm text-[var(--moliu-text-secondary)]">
          暂无势力，点击上方按钮添加
        </div>
      </NCard>

      <!-- Rules -->
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
      </div>
    </NModal>
  </div>
</template>

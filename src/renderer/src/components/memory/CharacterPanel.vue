<script setup lang="ts">
import { ref, computed } from 'vue';
import { NButton, NInput, NEmpty, NAvatar, NTag, NCard, NModal, useMessage } from 'naive-ui';
import { Plus, Search, Users, Trash2, Edit3 } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/stores/project.store';
import { getRoleColor } from '@/config/character-roles';
import type { Character } from '@/types/project';

const { t } = useI18n();
const projectStore = useProjectStore();
const message = useMessage();

const searchQuery = ref('');
const showCharacterDialog = ref(false);
const characterDialogMode = ref<'create' | 'edit'>('create');
const editingCharacter = ref<Character | null>(null);

// Character form
const characterForm = ref({
  name: '',
  description: '',
  personality: [] as string[],
});

// Role options
const roleOptions = [
  { label: '主角', value: 'protagonist' },
  { label: '女主', value: 'femaleLead' },
  { label: '导师', value: 'mentor' },
  { label: '反派', value: 'antagonist' },
  { label: '配角', value: 'supporting' },
  { label: '其他', value: 'other' },
];

const selectedRole = ref('protagonist');

const filteredCharacters = computed(() => {
  if (!searchQuery.value.trim()) {
    return projectStore.characters;
  }
  const query = searchQuery.value.toLowerCase();
  return projectStore.characters.filter(c => 
    c.name.toLowerCase().includes(query) || 
    c.description?.toLowerCase().includes(query)
  );
});

function openCreateCharacterDialog() {
  characterDialogMode.value = 'create';
  characterForm.value = { name: '', description: '', personality: [] };
  selectedRole.value = 'protagonist';
  editingCharacter.value = null;
  showCharacterDialog.value = true;
}

function openEditCharacterDialog(character: Character) {
  characterDialogMode.value = 'edit';
  editingCharacter.value = character;
  characterForm.value = {
    name: character.name,
    description: character.description || '',
    personality: character.profile?.personality || [],
  };
  selectedRole.value = 'protagonist';
  showCharacterDialog.value = true;
}

async function handleCharacterDialogConfirm() {
  if (!characterForm.value.name.trim()) {
    message.warning('请输入角色名称');
    return;
  }
  
  const characterData = {
    name: characterForm.value.name.trim(),
    description: characterForm.value.description.trim(),
    profile: {
      personality: characterForm.value.personality,
      appearance: '',
      background: '',
      abilities: [],
      relationships: [],
    },
    avatarPath: undefined,
  };
  
  try {
    if (characterDialogMode.value === 'create') {
      await projectStore.createCharacter({
        ...characterData,
        name: `${characterData.name} (${roleOptions.find(r => r.value === selectedRole.value)?.label || '其他'})`,
      } as any);
      message.success('角色创建成功');
    } else {
      if (editingCharacter.value) {
        await projectStore.updateCharacter(editingCharacter.value.id, characterData);
        message.success('角色信息已更新');
      }
    }
    showCharacterDialog.value = false;
  } catch (error) {
    message.error('操作失败');
  }
}

async function handleDeleteCharacter(character: Character) {
  try {
    await projectStore.deleteCharacter(character.id);
    message.success('角色已删除');
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
        :placeholder="t('character.searchPlaceholder')"
        class="w-full pl-10 pr-4 py-2 rounded-lg bg-[var(--moliu-bg-primary)] border border-[var(--moliu-border-color)] text-sm focus:outline-none focus:border-[var(--moliu-primary)]"
      />
    </div>

    <!-- Add Button -->
    <NButton class="w-full" quaternary @click="openCreateCharacterDialog">
      <template #icon>
        <Plus class="w-4 h-4" />
      </template>
      {{ t('character.addCharacter') }}
    </NButton>

    <!-- Character List -->
    <div v-if="filteredCharacters.length > 0" class="space-y-2">
      <div
        v-for="char in filteredCharacters"
        :key="char.id"
        class="p-3 rounded-lg bg-[var(--moliu-bg-primary)] border border-[var(--moliu-border-color)] hover:border-[var(--moliu-primary)] transition-colors cursor-pointer group"
      >
        <div class="flex items-start gap-3">
          <NAvatar
            :style="{ backgroundColor: getRoleColor(char.name) }"
            round
            size="small"
          >
            {{ char.name.slice(0, 1) }}
          </NAvatar>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium text-[var(--moliu-text-primary)]">{{ char.name }}</span>
              <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  class="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                  @click.stop="openEditCharacterDialog(char)"
                >
                  <Edit3 class="w-3 h-3 text-gray-400" />
                </button>
                <button
                  class="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                  @click.stop="handleDeleteCharacter(char)"
                >
                  <Trash2 class="w-3 h-3 text-red-400" />
                </button>
              </div>
            </div>
            <p class="text-xs text-[var(--moliu-text-secondary)] mt-1 truncate">
              {{ char.description || '暂无描述' }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <NEmpty v-else-if="searchQuery" :description="t('character.noCharacters')" size="small" />
    <div v-else class="text-center py-8 text-sm text-[var(--moliu-text-secondary)]">
      <Users class="w-12 h-12 mx-auto mb-3 opacity-50" />
      <p>{{ t('character.noCharacters') }}</p>
      <p class="mt-1">点击上方按钮添加第一个角色</p>
    </div>

    <!-- Character Dialog -->
    <NModal
      v-model:show="showCharacterDialog"
      preset="dialog"
      :title="characterDialogMode === 'create' ? '添加角色' : '编辑角色'"
      positive-text="确认"
      negative-text="取消"
      @positive-click="handleCharacterDialogConfirm"
      @negative-click="showCharacterDialog = false"
    >
      <div class="space-y-4 py-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">角色名称</label>
          <NInput
            v-model:value="characterForm.name"
            placeholder="输入角色名称"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">角色描述</label>
          <NInput
            v-model:value="characterForm.description"
            type="textarea"
            :rows="3"
            placeholder="输入角色描述（可选）"
          />
        </div>
      </div>
    </NModal>
  </div>
</template>

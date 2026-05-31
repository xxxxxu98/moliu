<script setup lang="ts">
import { ref, computed } from 'vue';
import { NButton, NInput, NEmpty, NTag, NCard, NModal, NPopconfirm, NSelect, useMessage } from 'naive-ui';
import { Plus, Search, Users, Trash2, Edit3, User, Eye, Zap, BookOpen, Heart, X } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/stores/project.store';
import type { Character, Relationship, RelationshipType } from '@/types/project';
import { RELATIONSHIP_TYPE_LABELS } from '@/types/project';
import { characterRoles } from '@/config/character-roles';

const { t } = useI18n();
const projectStore = useProjectStore();
const message = useMessage();

const searchQuery = ref('');
const showCharacterDialog = ref(false);
const characterDialogMode = ref<'create' | 'edit'>('create');
const editingCharacter = ref<Character | null>(null);
const expandedCharacterId = ref<string | null>(null);

// Character form
const characterForm = ref({
  name: '',
  role: '',
  description: '',
  personality: [] as string[],
  appearance: '',
  background: '',
  abilities: [] as string[],
  relationships: [] as Relationship[],
});

// New personality/ability input
const newPersonality = ref('');
const newAbility = ref('');

// Relationship form
const showRelationshipDialog = ref(false);
const relationshipForm = ref({
  targetName: '',
  type: 'neutral' as RelationshipType,
  description: '',
});
const editingRelationshipIndex = ref<number | null>(null);

// Relationship type options - value 存储中文
const relationshipTypeOptions = Object.entries(RELATIONSHIP_TYPE_LABELS).map(([, data]) => ({
  label: data.label,
  value: data.label,
}));

// Character role options - value 存储中文
const characterRoleOptions = Object.entries(characterRoles).map(([label, data]) => ({
  label,
  value: label,
}));

// Helper: 根据英文 key 获取中文 label（用于编辑回显和显示）
function getRoleLabelByKey(key: string): string {
  const entry = Object.entries(characterRoles).find(([, d]) => d.key === key);
  return entry ? entry[0] : key;
}

// Helper: 获取角色显示文本（兼容中文和英文 key）
function getRoleDisplayText(role: string | undefined): string {
  if (!role) return '';
  // 如果在 characterRoles 中找到（可能是中文 key），直接返回
  if (role in characterRoles) return role;
  // 否则尝试作为英文 key 转换
  return getRoleLabelByKey(role);
}

// Helper: 根据英文 key 获取关系类型中文 label
function getRelationTypeLabelByKey(key: string): string {
  return RELATIONSHIP_TYPE_LABELS[key as keyof typeof RELATIONSHIP_TYPE_LABELS]?.label || key;
}

// Helper: 获取关系类型显示文本（兼容中文和英文 key）
function getRelationTypeDisplayText(type: string | undefined): string {
  if (!type) return '';
  // 如果直接是中文，返回
  const lowerType = type.toLowerCase();
  for (const [key, data] of Object.entries(RELATIONSHIP_TYPE_LABELS)) {
    if (data.label === type) return type;
    if (key.toLowerCase() === lowerType) return data.label;
  }
  return type;
}

// Other characters for selection
const otherCharacters = computed(() => {
  return projectStore.characters.filter(c => c.id !== editingCharacter.value?.id);
});

const filteredCharacters = computed(() => {
  if (!searchQuery.value.trim()) {
    return projectStore.characters;
  }
  const query = searchQuery.value.toLowerCase();
  return projectStore.characters.filter(c => 
    c.name.toLowerCase().includes(query) || 
    c.description?.toLowerCase().includes(query) ||
    c.role?.toLowerCase().includes(query)
  );
});

function toggleExpand(characterId: string) {
  expandedCharacterId.value = expandedCharacterId.value === characterId ? null : characterId;
}

function openCreateCharacterDialog() {
  characterDialogMode.value = 'create';
  characterForm.value = { 
    name: '', 
    role: '', 
    description: '', 
    personality: [], 
    appearance: '',
    background: '',
    abilities: [],
    relationships: [],
  };
  editingCharacter.value = null;
  showCharacterDialog.value = true;
}

function openEditCharacterDialog(character: Character) {
  characterDialogMode.value = 'edit';
  editingCharacter.value = character;
  // 角色定位：如果存储的是英文 key，转换为中文 label 显示
  const roleLabel = character.role ? getRoleLabelByKey(character.role) : '';
  characterForm.value = {
    name: character.name,
    role: roleLabel,
    description: character.description || '',
    personality: character.profile?.personality || [],
    appearance: character.profile?.appearance || '',
    background: character.profile?.background || '',
    abilities: character.profile?.abilities || [],
    relationships: character.profile?.relationships || [],
  };
  showCharacterDialog.value = true;
}

function addPersonality() {
  if (newPersonality.value.trim() && !characterForm.value.personality.includes(newPersonality.value.trim())) {
    characterForm.value.personality.push(newPersonality.value.trim());
    newPersonality.value = '';
  }
}

function removePersonality(index: number) {
  characterForm.value.personality.splice(index, 1);
}

function addAbility() {
  if (newAbility.value.trim() && !characterForm.value.abilities.includes(newAbility.value.trim())) {
    characterForm.value.abilities.push(newAbility.value.trim());
    newAbility.value = '';
  }
}

function removeAbility(index: number) {
  characterForm.value.abilities.splice(index, 1);
}

// Relationship functions
function openAddRelationshipDialog() {
  relationshipForm.value = {
    targetName: '',
    type: 'neutral',
    description: '',
  };
  editingRelationshipIndex.value = null;
  showRelationshipDialog.value = true;
}

function openEditRelationshipDialog(index: number) {
  const rel = characterForm.value.relationships[index];
  relationshipForm.value = {
    targetName: rel.targetName || '',
    type: rel.type,
    description: rel.description || '',
  };
  editingRelationshipIndex.value = index;
  showRelationshipDialog.value = true;
}

function removeRelationship(index: number) {
  characterForm.value.relationships.splice(index, 1);
}

function handleRelationshipDialogConfirm() {
  if (!relationshipForm.value.targetName.trim()) {
    message.warning('请输入关联角色名称');
    return;
  }
  
  const rel: Relationship = {
    targetName: relationshipForm.value.targetName.trim(),
    type: relationshipForm.value.type,
    description: relationshipForm.value.description.trim(),
  };
  
  if (editingRelationshipIndex.value !== null) {
    characterForm.value.relationships[editingRelationshipIndex.value] = rel;
  } else {
    characterForm.value.relationships.push(rel);
  }
  
  showRelationshipDialog.value = false;
}

async function handleCharacterDialogConfirm() {
  if (!characterForm.value.name.trim()) {
    message.warning('请输入角色名称');
    return;
  }
  
  const characterData = {
    name: characterForm.value.name.trim(),
    role: characterForm.value.role.trim(),
    description: characterForm.value.description.trim(),
    profile: {
      personality: characterForm.value.personality,
      appearance: characterForm.value.appearance.trim(),
      background: characterForm.value.background.trim(),
      abilities: characterForm.value.abilities,
      relationships: characterForm.value.relationships,
    },
    avatarPath: undefined,
  };
  
  try {
    if (characterDialogMode.value === 'create') {
      await projectStore.createCharacter(characterData as any);
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

function getRelationTypeLabel(type: string): string {
  // 先尝试直接匹配中文
  for (const [key, data] of Object.entries(RELATIONSHIP_TYPE_LABELS)) {
    if (data.label === type) return data.label;
  }
  // 再尝试匹配英文 key
  return RELATIONSHIP_TYPE_LABELS[type as RelationshipType]?.label || type;
}

function getRelationTypeColor(type: string): string {
  // 先尝试直接匹配中文
  for (const [key, data] of Object.entries(RELATIONSHIP_TYPE_LABELS)) {
    if (data.label === type) return data.color;
  }
  // 再尝试匹配英文 key
  return RELATIONSHIP_TYPE_LABELS[type as RelationshipType]?.color || '#6b7280';
}
</script>

<template>
  <div class="space-y-4">
    <!-- Search -->
    <NInput
      v-model:value="searchQuery"
      :placeholder="t('character.searchPlaceholder')"
      clearable
    >
      <template #prefix>
        <Search class="w-4 h-4 text-[var(--moliu-text-secondary)]" />
      </template>
    </NInput>

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
        class="rounded-lg bg-[var(--moliu-bg-primary)] border border-[var(--moliu-border-color)] hover:border-[var(--moliu-primary)] transition-colors group"
      >
        <!-- Character Header -->
        <div 
          class="p-3 cursor-pointer"
          @click="toggleExpand(char.id)"
        >
          <div class="flex items-start gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-[var(--moliu-text-primary)]">{{ char.name }}</span>
                  <NTag v-if="char.role" size="tiny" type="info">{{ getRoleDisplayText(char.role) }}</NTag>
                </div>
                <div class="flex items-center gap-1">
                  <NButton quaternary circle size="small" @click.stop="openEditCharacterDialog(char)">
                    <template #icon>
                      <Edit3 class="w-3 h-3 text-gray-400" />
                    </template>
                  </NButton>
                  <NPopconfirm
                    @positive-click="handleDeleteCharacter(char)"
                  >
                    <template #trigger>
                      <NButton quaternary circle size="small" @click.stop>
                        <template #icon>
                          <Trash2 class="w-3 h-3 text-red-400" />
                        </template>
                      </NButton>
                    </template>
                    确定要删除这个角色吗？
                  </NPopconfirm>
                </div>
              </div>
              <p class="text-xs text-[var(--moliu-text-secondary)] mt-1 truncate">
                {{ char.description || '暂无描述' }}
              </p>
              <!-- Quick preview of personality -->
              <div v-if="char.profile?.personality?.length" class="flex flex-wrap gap-1 mt-2">
                <NTag
                  v-for="trait in char.profile.personality.slice(0, 3)"
                  :key="trait"
                  size="tiny"
                  :bordered="false"
                  type="warning"
                >
                  {{ trait }}
                </NTag>
                <NTag v-if="char.profile.personality.length > 3" size="tiny" :bordered="false" type="default">
                  +{{ char.profile.personality.length - 3 }}
                </NTag>
              </div>
            </div>
          </div>
        </div>

        <!-- Expanded Details -->
        <div 
          v-if="expandedCharacterId === char.id"
          class="px-3 pb-3 border-t border-[var(--moliu-border-color)] pt-3 space-y-3"
        >
          <!-- Appearance -->
          <div v-if="char.profile?.appearance" class="flex items-start gap-2">
            <Eye class="w-4 h-4 text-[var(--moliu-text-secondary)] mt-0.5" />
            <div>
              <span class="text-xs text-[var(--moliu-text-secondary)]">外貌特征</span>
              <p class="text-sm text-[var(--moliu-text-primary)]">{{ char.profile.appearance }}</p>
            </div>
          </div>

          <!-- Background -->
          <div v-if="char.profile?.background" class="flex items-start gap-2">
            <BookOpen class="w-4 h-4 text-[var(--moliu-text-secondary)] mt-0.5" />
            <div>
              <span class="text-xs text-[var(--moliu-text-secondary)]">背景故事</span>
              <p class="text-sm text-[var(--moliu-text-primary)]">{{ char.profile.background }}</p>
            </div>
          </div>

          <!-- Abilities -->
          <div v-if="char.profile?.abilities?.length" class="flex items-start gap-2">
            <Zap class="w-4 h-4 text-[var(--moliu-text-secondary)] mt-0.5" />
            <div class="flex-1">
              <span class="text-xs text-[var(--moliu-text-secondary)]">特殊能力</span>
              <div class="flex flex-wrap gap-1 mt-1">
                <NTag
                  v-for="ability in char.profile.abilities"
                  :key="ability"
                  size="tiny"
                  type="success"
                >
                  {{ ability }}
                </NTag>
              </div>
            </div>
          </div>

          <!-- Relationships - Structured -->
          <div v-if="char.profile?.relationships?.length" class="flex items-start gap-2">
            <Heart class="w-4 h-4 text-[var(--moliu-text-secondary)] mt-0.5" />
            <div class="flex-1">
              <span class="text-xs text-[var(--moliu-text-secondary)]">人物关系</span>
              <div class="space-y-1 mt-1">
                <div 
                  v-for="rel in char.profile.relationships" 
                  :key="rel.targetName + rel.type"
                  class="flex items-center gap-2 p-1.5 rounded bg-[var(--moliu-bg-secondary)]"
                >
                  <NTag 
                    size="tiny" 
                    :style="{ backgroundColor: getRelationTypeColor(rel.type) + '20', color: getRelationTypeColor(rel.type) }"
                  >
                    {{ getRelationTypeLabel(rel.type) }}
                  </NTag>
                  <span class="text-sm font-medium text-[var(--moliu-text-primary)]">{{ rel.targetName || rel.characterId }}</span>
                  <span v-if="rel.description" class="text-xs text-[var(--moliu-text-secondary)]">{{ rel.description }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Personality tags -->
          <div v-if="char.profile?.personality?.length" class="flex items-start gap-2">
            <User class="w-4 h-4 text-[var(--moliu-text-secondary)] mt-0.5" />
            <div class="flex-1">
              <span class="text-xs text-[var(--moliu-text-secondary)]">性格特点</span>
              <div class="flex flex-wrap gap-1 mt-1">
                <NTag
                  v-for="trait in char.profile.personality"
                  :key="trait"
                  size="tiny"
                  type="warning"
                >
                  {{ trait }}
                </NTag>
              </div>
            </div>
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
      style="width: 600px; max-height: 90vh;"
      :mask-closable="false"
    >
      <div class="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">角色名称 *</label>
          <NInput
            v-model:value="characterForm.name"
            placeholder="输入角色名称"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">角色定位</label>
          <NInput
            v-model:value="characterForm.role"
            placeholder="输入角色定位，如：主角、导师、反派等"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">角色描述</label>
          <NInput
            v-model:value="characterForm.description"
            type="textarea"
            :rows="2"
            placeholder="简要描述这个角色（可选）"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">外貌特征</label>
          <NInput
            v-model:value="characterForm.appearance"
            type="textarea"
            :rows="2"
            placeholder="描述角色的外貌特征（可选）"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">性格特点</label>
          <div class="flex flex-wrap gap-2 mb-2">
            <NTag
              v-for="(trait, index) in characterForm.personality"
              :key="trait"
              closable
              @close="removePersonality(index)"
            >
              {{ trait }}
            </NTag>
          </div>
          <div class="flex gap-2">
            <NInput
              v-model:value="newPersonality"
              placeholder="输入性格特点后按回车添加"
              @keyup.enter="addPersonality"
            />
            <NButton @click="addPersonality">添加</NButton>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">特殊能力</label>
          <div class="flex flex-wrap gap-2 mb-2">
            <NTag
              v-for="(ability, index) in characterForm.abilities"
              :key="ability"
              closable
              type="success"
              @close="removeAbility(index)"
            >
              {{ ability }}
            </NTag>
          </div>
          <div class="flex gap-2">
            <NInput
              v-model:value="newAbility"
              placeholder="输入特殊能力后按回车添加"
              @keyup.enter="addAbility"
            />
            <NButton @click="addAbility">添加</NButton>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">背景故事</label>
          <NInput
            v-model:value="characterForm.background"
            type="textarea"
            :rows="3"
            placeholder="描述角色的背景故事（可选）"
          />
        </div>
        
        <!-- Structured Relationships -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300">人物关系</label>
            <NButton size="small" @click="openAddRelationshipDialog">
              <template #icon>
                <Plus class="w-3 h-3" />
              </template>
              添加关系
            </NButton>
          </div>
          
          <div v-if="characterForm.relationships.length > 0" class="space-y-2">
            <div 
              v-for="(rel, index) in characterForm.relationships" 
              :key="index"
              class="flex items-center gap-2 p-2 rounded bg-[var(--moliu-bg-secondary)] border border-[var(--moliu-border-color)]"
            >
              <NTag
                size="tiny" 
                :style="{ backgroundColor: getRelationTypeColor(rel.type) + '20', color: getRelationTypeColor(rel.type) }"
              >
                {{ getRelationTypeLabel(rel.type) }}
              </NTag>
              <span class="text-sm font-medium text-[var(--moliu-text-primary)] flex-1">{{ rel.targetName }}</span>
              <span v-if="rel.description" class="text-xs text-[var(--moliu-text-secondary)] truncate flex-1 max-w-[200px]">{{ rel.description }}</span>
              <NButton quaternary circle size="tiny" @click="openEditRelationshipDialog(index)">
                <template #icon>
                  <Edit3 class="w-3 h-3 text-gray-400" />
                </template>
              </NButton>
              <NButton quaternary circle size="tiny" @click="removeRelationship(index)">
                <template #icon>
                  <X class="w-3 h-3 text-red-400" />
                </template>
              </NButton>
            </div>
          </div>
          <div v-else class="text-center py-4 text-sm text-[var(--moliu-text-secondary)] border border-dashed border-[var(--moliu-border-color)] rounded">
            暂无人物关系，点击上方按钮添加
          </div>
        </div>
      </div>
      
      <template #action>
        <div class="flex justify-end gap-2">
          <NButton @click="showCharacterDialog = false">取消</NButton>
          <NButton type="primary" @click="handleCharacterDialogConfirm">确认</NButton>
        </div>
      </template>
    </NModal>

    <!-- Relationship Dialog -->
    <NModal
      v-model:show="showRelationshipDialog"
      preset="dialog"
      :title="editingRelationshipIndex !== null ? '编辑关系' : '添加关系'"
      style="width: 400px;"
    >
      <div class="space-y-4 py-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">关联角色 *</label>
          <NInput
            v-model:value="relationshipForm.targetName"
            placeholder="输入关联角色名称"
          />
          <div v-if="otherCharacters.length > 0" class="mt-2 flex flex-wrap gap-1">
            <NTag
              v-for="char in otherCharacters"
              :key="char.id"
              size="tiny"
              class="cursor-pointer hover:opacity-80"
              @click="relationshipForm.targetName = char.name"
            >
              {{ char.name }}
            </NTag>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">关系类型</label>
          <NSelect
            v-model:value="relationshipForm.type"
            :options="relationshipTypeOptions"
            placeholder="选择关系类型"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">关系描述</label>
          <NInput
            v-model:value="relationshipForm.description"
            type="textarea"
            :rows="2"
            placeholder="描述这段关系（可选）"
          />
        </div>
      </div>
      <template #action>
        <div class="flex justify-end gap-2">
          <NButton @click="showRelationshipDialog = false">取消</NButton>
          <NButton type="primary" @click="handleRelationshipDialogConfirm">确认</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

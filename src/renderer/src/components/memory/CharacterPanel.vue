<script setup lang="ts">
import { ref } from 'vue';
import { NButton, NInput, NEmpty, NAvatar, NTag, NCard } from 'naive-ui';
import { Plus, Search, Users } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const searchQuery = ref('');
const characters = ref([
  {
    id: '1',
    name: '林风',
    role: '主角',
    description: '天生废灵根的少年，性格坚韧不拔',
    avatar: null,
  },
  {
    id: '2',
    name: '苏婉儿',
    role: '女主',
    description: '苏家千金，天资聪颖，与主角有婚约',
    avatar: null,
  },
  {
    id: '3',
    name: '神秘老者',
    role: '导师',
    description: '来历不明的前辈高人，拥有上古传承',
    avatar: null,
  },
]);

function getRoleColor(role: string) {
  switch (role) {
    case '主角':
      return '#6366f1';
    case '女主':
      return '#ec4899';
    case '导师':
      return '#f59e0b';
    case '反派':
      return '#ef4444';
    default:
      return '#6b7280';
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
    <NButton class="w-full" quaternary @click="$emit('addCharacter')">
      <template #icon>
        <Plus class="w-4 h-4" />
      </template>
      {{ t('character.addCharacter') }}
    </NButton>

    <!-- Character List -->
    <div v-if="characters.length > 0" class="space-y-2">
      <div
        v-for="char in characters"
        :key="char.id"
        class="p-3 rounded-lg bg-[var(--moliu-bg-primary)] border border-[var(--moliu-border-color)] hover:border-[var(--moliu-primary)] transition-colors cursor-pointer"
      >
        <div class="flex items-start gap-3">
          <NAvatar
            :style="{ backgroundColor: getRoleColor(char.role) }"
            round
            size="small"
          >
            {{ char.name.slice(0, 1) }}
          </NAvatar>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-medium text-[var(--moliu-text-primary)]">{{ char.name }}</span>
              <NTag size="tiny" :color="{ color: getRoleColor(char.role) + '20', textColor: getRoleColor(char.role) }">
                {{ char.role }}
              </NTag>
            </div>
            <p class="text-xs text-[var(--moliu-text-secondary)] mt-1 truncate">
              {{ char.description }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <NEmpty v-else :description="t('character.noCharacters')" size="small" />
  </div>
</template>

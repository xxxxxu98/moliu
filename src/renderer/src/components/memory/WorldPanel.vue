<script setup lang="ts">
import { ref } from 'vue';
import { NButton, NInput, NEmpty, NTag, NCard, NCollapse, NCollapseItem } from 'naive-ui';
import { Plus, Search, Globe, MapPin, Shield } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const searchQuery = ref('');

const worldData = ref({
  locations: [
    { id: '1', name: '青木镇', description: '故事开始的地方，主角的家乡' },
    { id: '2', name: '青云宗', description: '当地最大的修仙宗门' },
    { id: '3', name: '天机阁', description: '神秘的情报组织' },
  ],
  factions: [
    { id: '1', name: '青云宗', description: '以剑道为主的宗门' },
    { id: '2', name: '玄火教', description: '修炼火系功法的邪道势力' },
  ],
  rules: [
    { id: '1', name: '灵根体系', description: '灵根决定修炼资质，共分九品', locked: true },
    { id: '2', name: '境界划分', description: '练气、筑基、金丹、元婴...', locked: true },
  ],
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
      <NButton size="small" quaternary>
        <template #icon>
          <MapPin class="w-4 h-4" />
        </template>
        {{ t('world.location') }}
      </NButton>
      <NButton size="small" quaternary>
        <template #icon>
          <Shield class="w-4 h-4" />
        </template>
        {{ t('world.faction') }}
      </NButton>
      <NButton size="small" quaternary>
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
        <div class="space-y-2">
          <div
            v-for="location in worldData.locations"
            :key="location.id"
            class="p-2 rounded bg-[var(--moliu-bg-primary)]"
          >
            <div class="flex items-center gap-2">
              <MapPin class="w-3 h-3 text-[var(--moliu-text-secondary)]" />
              <span class="font-medium text-sm text-[var(--moliu-text-primary)]">{{ location.name }}</span>
            </div>
            <p class="text-xs text-[var(--moliu-text-secondary)] mt-1 ml-5">{{ location.description }}</p>
          </div>
        </div>
      </NCard>

      <!-- Factions -->
      <NCard size="small" :title="t('world.factions')" :bordered="false">
        <div class="space-y-2">
          <div
            v-for="faction in worldData.factions"
            :key="faction.id"
            class="p-2 rounded bg-[var(--moliu-bg-primary)]"
          >
            <div class="flex items-center gap-2">
              <Shield class="w-3 h-3 text-[var(--moliu-text-secondary)]" />
              <span class="font-medium text-sm text-[var(--moliu-text-primary)]">{{ faction.name }}</span>
            </div>
            <p class="text-xs text-[var(--moliu-text-secondary)] mt-1 ml-5">{{ faction.description }}</p>
          </div>
        </div>
      </NCard>

      <!-- Rules -->
      <NCard size="small" :title="t('world.rules')" :bordered="false">
        <div class="space-y-2">
          <div
            v-for="rule in worldData.rules"
            :key="rule.id"
            class="p-2 rounded bg-[var(--moliu-bg-primary)]"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Globe class="w-3 h-3 text-[var(--moliu-text-secondary)]" />
                <span class="font-medium text-sm text-[var(--moliu-text-primary)]">{{ rule.name }}</span>
              </div>
              <NTag v-if="rule.locked" size="tiny" type="warning">{{ t('world.locked') }}</NTag>
            </div>
            <p class="text-xs text-[var(--moliu-text-secondary)] mt-1 ml-5">{{ rule.description }}</p>
          </div>
        </div>
      </NCard>
    </div>
  </div>
</template>

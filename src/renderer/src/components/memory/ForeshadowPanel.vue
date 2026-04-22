<script setup lang="ts">
import { ref } from 'vue';
import { NButton, NTag, NEmpty, NProgress } from 'naive-ui';
import { Plus, Lightbulb, AlertCircle, CheckCircle } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const foreshadows = ref([
  {
    id: '1',
    hint: '主角在路边捡到一枚神秘的玉佩',
    type: 'item',
    status: 'buried',
    chapter: 1,
  },
  {
    id: '2',
    hint: '老者临走时说："记住，你的血脉..."',
    type: 'dialogue',
    status: 'foreshadowed',
    chapter: 3,
  },
  {
    id: '3',
    hint: '村口的老槐树下总有人影晃动',
    type: 'event',
    status: 'buried',
    chapter: 2,
  },
  {
    id: '4',
    hint: '神秘势力的追杀',
    type: 'event',
    status: 'resolved',
    chapter: 15,
  },
]);

const stats = {
  total: 4,
  resolved: 1,
  resolutionRate: 25,
};

function getStatusIcon(status: string) {
  switch (status) {
    case 'resolved':
      return CheckCircle;
    case 'foreshadowed':
    case 'hinted':
      return AlertCircle;
    default:
      return Lightbulb;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'resolved':
      return 'success';
    case 'foreshadowed':
    case 'hinted':
      return 'warning';
    default:
      return 'default';
  }
}

function getStatusText(status: string) {
  const statusMap: Record<string, string> = {
    buried: t('editor.toBeRevealed'),
    hinted: t('editor.revealed'),
    foreshadowed: t('editor.toBeRevealed'),
    resolved: t('editor.resolved'),
  };
  return statusMap[status] || status;
}
</script>

<template>
  <div class="space-y-4">
    <!-- Stats -->
    <div class="p-3 rounded-lg bg-[var(--moliu-bg-primary)] border border-[var(--moliu-border-color)]">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm text-[var(--moliu-text-secondary)]">{{ t('editor.foreshadowResolutionRate') }}</span>
        <span class="text-lg font-bold text-[var(--moliu-primary)]">{{ stats.resolutionRate }}%</span>
      </div>
      <NProgress
        type="line"
        :percentage="stats.resolutionRate"
        :height="8"
        :border-radius="4"
        :fill-border-radius="4"
        :show-indicator="false"
        status="success"
      />
      <div class="flex justify-between mt-2 text-xs text-[var(--moliu-text-secondary)]">
        <span>{{ t('editor.resolved') }}: {{ stats.resolved }}</span>
        <span>{{ t('editor.total') }}: {{ stats.total }}</span>
      </div>
    </div>

    <!-- Add Button -->
    <NButton class="w-full" quaternary>
      <template #icon>
        <Plus class="w-4 h-4" />
      </template>
      {{ t('editor.addForeshadow') }}
    </NButton>

    <!-- Foreshadow List -->
    <div v-if="foreshadows.length > 0" class="space-y-2">
      <div
        v-for="foreshadow in foreshadows"
        :key="foreshadow.id"
        class="p-3 rounded-lg bg-[var(--moliu-bg-primary)] border border-[var(--moliu-border-color)] hover:border-[var(--moliu-primary)] transition-colors cursor-pointer"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-start gap-2 flex-1">
            <component
              :is="getStatusIcon(foreshadow.status)"
              class="w-4 h-4 mt-0.5"
              :class="{
                'text-green-500': foreshadow.status === 'resolved',
                'text-yellow-500': foreshadow.status === 'foreshadowed' || foreshadow.status === 'hinted',
                'text-[var(--moliu-text-secondary)]': foreshadow.status === 'buried'
              }"
            />
            <div class="flex-1 min-w-0">
              <p class="text-sm text-[var(--moliu-text-primary)]">{{ foreshadow.hint }}</p>
              <div class="flex items-center gap-2 mt-2">
                <NTag size="tiny" :type="getStatusColor(foreshadow.status)">
                  {{ getStatusText(foreshadow.status) }}
                </NTag>
                <span class="text-xs text-[var(--moliu-text-secondary)]">
                  {{ t('editor.chapterLabel', { chapter: foreshadow.chapter }) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <NEmpty v-else :description="t('editor.noForeshadows')" size="small" />
  </div>
</template>

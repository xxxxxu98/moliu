<script setup lang="ts">
import type { Component } from 'vue';
import type { OutlineDirection } from '@/services/outline/types/direction';
import type { GeneratedOutline } from '@/types/inspiration';
import type { ExecutableOutline } from '@/services/outline/types/executable-outline';
import DirectionPicker from './DirectionPicker.vue';
import OutlineDisplay from '@/components/common/OutlineDisplay.vue';

interface DirectionCardViewModel {
  id: string;
  icon: Component;
  accent: string;
  direction: OutlineDirection;
}

interface Props {
  show: boolean;
  title: string;
  description: string;
  cards: DirectionCardViewModel[];
  selectedDirection: OutlineDirection | null;
  isProcessing: boolean;
  progress?: string;
  error?: string | null;
  canExpand: boolean;
  compact?: boolean;
  previewOutline: GeneratedOutline | null;
  expandedOutline: ExecutableOutline | null;
  emptyDescription?: string;
  disableRegenerate?: boolean;
}

interface Emits {
  (e: 'regenerate'): void;
  (e: 'select-direction', direction: OutlineDirection): void;
  (e: 'expand'): void;
  (e: 'select-outline', outline: GeneratedOutline): void;
  (e: 'create'): void;
}

withDefaults(defineProps<Props>(), {
  progress: '',
  error: null,
  compact: false,
  emptyDescription: '',
  disableRegenerate: false,
});

const emit = defineEmits<Emits>();
</script>

<template>
  <div v-if="show" class="space-y-4">
    <DirectionPicker
      :title="title"
      :description="description"
      :cards="cards"
      :selected-direction="selectedDirection"
      :is-processing="isProcessing"
      :progress="progress"
      :error="compact ? error : null"
      :can-expand="canExpand"
      :compact="compact"
      @regenerate="emit('regenerate')"
      @select="emit('select-direction', $event)"
      @expand="emit('expand')"
    />

    <div>
      <OutlineDisplay
        v-if="previewOutline"
        :outlines="[previewOutline]"
        :selected-outline="previewOutline"
        :is-generating="!!isProcessing && !expandedOutline"
        :progress="progress"
        :error="error"
        :show-word-count="true"
        :show-streaming-preview="true"
        :empty-description="emptyDescription"
        :disable-regenerate="disableRegenerate"
        @select="emit('select-outline', $event)"
        @regenerate="emit('regenerate')"
        @create="emit('create')"
      />
    </div>
  </div>
</template>

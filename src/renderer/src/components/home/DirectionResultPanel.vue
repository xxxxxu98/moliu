<script setup lang="ts">
import type { Component } from 'vue';
import type { OutlineDirection } from '@/services/outline/types/direction';
import type { GeneratedOutline } from '@/types/inspiration';
import type { ExecutableOutline } from '@/services/outline/types/executable-outline';
import DirectionPicker from './DirectionPicker.vue';
import OutlineDisplay from '@/components/common/OutlineDisplay.vue';

interface DirectionScaleHint {
  targetWordCountLabel: string;
  estimatedChapterCount: number;
  suggestedVolumeCount: number;
  estimatedChaptersPerVolume: number;
  startupPhaseRatio: string;
  longformCapacityScore: number;
  longformCapacityLabel: string;
  longformCapacityTone: 'strong' | 'medium' | 'cautious';
  improvementSuggestions: string[];
  enhancementBrief: string;
}

interface DirectionCardViewModel {
  id: string;
  icon: Component;
  accent: string;
  direction: OutlineDirection;
  scaleHint?: DirectionScaleHint;
}

interface DirectionScaleHint {
  targetWordCountLabel: string;
  estimatedChapterCount: number;
  suggestedVolumeCount: number;
  estimatedChaptersPerVolume: number;
  startupPhaseRatio: string;
  longformCapacityScore: number;
  longformCapacityLabel: string;
  longformCapacityTone: 'strong' | 'medium' | 'cautious';
  improvementSuggestions: string[];
  enhancementBrief: string;
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
  enhancingDirectionId?: string | null;
}

interface Emits {
  (e: 'regenerate'): void;
  (e: 'select-direction', direction: OutlineDirection): void;
  (e: 'expand'): void;
  (e: 'enhance-direction', payload: { direction: OutlineDirection; enhancementBrief: string }): void;
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
      :enhancing-direction-id="enhancingDirectionId"
      @regenerate="emit('regenerate')"
      @select="emit('select-direction', $event)"
      @expand="emit('expand')"
      @enhance="emit('enhance-direction', $event)"
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

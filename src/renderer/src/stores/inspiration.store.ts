import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { GenreTag, SettingElement, StoryNucleus, GeneratedOutline, InspirationPack } from '@/types/inspiration';

export const useInspirationStore = defineStore('inspiration', () => {
  // State
  const tags = ref<GenreTag[]>([]);
  const elements = ref<SettingElement[]>([]);
  const storyNuclei = ref<StoryNucleus[]>([]);
  const selectedTags = ref<string[]>([]);
  const selectedElements = ref<string[]>([]);
  const selectedNucleus = ref<StoryNucleus | null>(null);
  const generatedOutlines = ref<GeneratedOutline[]>([]);
  const selectedOutline = ref<GeneratedOutline | null>(null);
  const isGenerating = ref(false);
  const generationPhase = ref<'idle' | 'generating-L1' | 'generating-L2' | 'generating-L3' | 'generating-outlines'>('idle');

  // Getters
  const canGenerateOutlines = computed(() => selectedNucleus.value !== null);
  const canGenerateNuclei = computed(() => selectedElements.value.length > 0);
  const canGenerateElements = computed(() => selectedTags.value.length > 0);

  // Actions
  function setTags(newTags: GenreTag[]) {
    tags.value = newTags;
  }

  function setElements(newElements: SettingElement[]) {
    elements.value = newElements;
  }

  function setStoryNuclei(nuclei: StoryNucleus[]) {
    storyNuclei.value = nuclei;
  }

  function toggleTag(tagId: string) {
    const index = selectedTags.value.indexOf(tagId);
    if (index === -1) {
      selectedTags.value.push(tagId);
    } else {
      selectedTags.value.splice(index, 1);
    }
    // Clear downstream selections when tags change
    selectedElements.value = [];
    storyNuclei.value = [];
    selectedNucleus.value = null;
    generatedOutlines.value = [];
    selectedOutline.value = null;
  }

  function toggleElement(elementId: string) {
    const index = selectedElements.value.indexOf(elementId);
    if (index === -1) {
      selectedElements.value.push(elementId);
    } else {
      selectedElements.value.splice(index, 1);
    }
    // Clear downstream selections when elements change
    storyNuclei.value = [];
    selectedNucleus.value = null;
    generatedOutlines.value = [];
    selectedOutline.value = null;
  }

  function selectNucleus(nucleus: StoryNucleus) {
    selectedNucleus.value = nucleus;
  }

  function selectOutline(outline: GeneratedOutline) {
    selectedOutline.value = outline;
  }

  function setGenerating(generating: boolean, phase?: typeof generationPhase.value) {
    isGenerating.value = generating;
    if (phase) {
      generationPhase.value = phase;
    }
  }

  function setGeneratedOutlines(outlines: GeneratedOutline[]) {
    generatedOutlines.value = outlines;
  }

  function reset() {
    selectedTags.value = [];
    selectedElements.value = [];
    selectedNucleus.value = null;
    generatedOutlines.value = [];
    selectedOutline.value = null;
    isGenerating.value = false;
    generationPhase.value = 'idle';
  }

  return {
    tags,
    elements,
    storyNuclei,
    selectedTags,
    selectedElements,
    selectedNucleus,
    generatedOutlines,
    selectedOutline,
    isGenerating,
    generationPhase,
    canGenerateOutlines,
    canGenerateNuclei,
    canGenerateElements,
    setTags,
    setElements,
    setStoryNuclei,
    toggleTag,
    toggleElement,
    selectNucleus,
    selectOutline,
    setGenerating,
    setGeneratedOutlines,
    reset,
  };
});

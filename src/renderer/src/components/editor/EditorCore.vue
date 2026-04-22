<script setup lang="ts">
import { ref, watch, computed, onUnmounted } from 'vue';
import { NScrollbar, NButton, useMessage } from 'naive-ui';
import { Save, Check, FileText } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/stores/project.store';

const { t } = useI18n();
const projectStore = useProjectStore();
const message = useMessage();

const editorRef = ref<HTMLTextAreaElement | null>(null);
const content = ref('');
const wordCount = ref(0);
const charCount = ref(0);
const isSaved = ref(true);
const isSaving = ref(false);
const autoSaveTimer = ref<number | null>(null);
const lastSavedContent = ref('');

function updateCounts(text: string) {
  const trimmed = text.trim();
  charCount.value = text.length;
  wordCount.value = trimmed ? trimmed.split(/\s+/).length : 0;
}

function handleInput(event: Event) {
  const target = event.target as HTMLTextAreaElement;
  content.value = target.value;
  updateCounts(target.value);
  isSaved.value = false;
  scheduleAutoSave();
}

function scheduleAutoSave() {
  if (autoSaveTimer.value) {
    clearTimeout(autoSaveTimer.value);
  }
  autoSaveTimer.value = window.setTimeout(() => {
    saveChapter(true);
  }, 30000);
}

async function saveChapter(isAutoSave = false) {
  if (!projectStore.currentChapterId) return;
  
  isSaving.value = true;
  const words = content.value.trim() ? content.value.trim().split(/\s+/).length : 0;
  
  try {
    await projectStore.updateChapter(projectStore.currentChapterId, {
      content: content.value,
      wordCount: words,
    });
    lastSavedContent.value = content.value;
    isSaved.value = true;
    if (!isAutoSave) {
      message.success('保存成功');
    }
  } catch (error) {
    console.error('Failed to save chapter:', error);
    if (!isAutoSave) {
      message.error('保存失败');
    }
  } finally {
    isSaving.value = false;
  }
}

const chapterTitle = computed({
  get: () => {
    const chapter = projectStore.currentChapter;
    return chapter?.title || '';
  },
  set: (value: string) => {
    if (projectStore.currentChapterId) {
      projectStore.updateChapter(projectStore.currentChapterId, { title: value });
    }
  },
});

// Watch for chapter changes
watch(() => projectStore.currentChapter, (newChapter) => {
  if (newChapter) {
    const newContent = newChapter.content || '';
    if (lastSavedContent.value !== newContent) {
      content.value = newContent;
      lastSavedContent.value = newContent;
      wordCount.value = newChapter.wordCount || 0;
      updateCounts(newContent);
      isSaved.value = true;
    }
  } else {
    content.value = '';
    wordCount.value = 0;
    charCount.value = 0;
  }
}, { immediate: true });

watch(() => projectStore.currentChapterId, (newId) => {
  if (newId) {
    const chapter = projectStore.chapters.find(c => c.id === newId);
    if (chapter) {
      const newContent = chapter.content || '';
      content.value = newContent;
      lastSavedContent.value = newContent;
      wordCount.value = chapter.wordCount || 0;
      updateCounts(newContent);
      isSaved.value = true;
    }
  }
});

function handleKeyDown(event: KeyboardEvent) {
  // Ctrl/Cmd + S to save
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault();
    saveChapter();
  }
  // Tab for indentation
  if (event.key === 'Tab') {
    event.preventDefault();
    const target = event.target as HTMLTextAreaElement;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    content.value = content.value.substring(0, start) + '    ' + content.value.substring(end);
    // Restore cursor position
    setTimeout(() => {
      target.selectionStart = target.selectionEnd = start + 4;
    }, 0);
  }
}

onUnmounted(() => {
  if (autoSaveTimer.value) {
    clearTimeout(autoSaveTimer.value);
  }
  if (!isSaved.value && projectStore.currentChapterId) {
    saveChapter(true);
  }
});
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Toolbar -->
    <div class="h-14 flex items-center justify-between px-4 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
      <div class="flex items-center gap-4">
        <!-- Title Input -->
        <input
          v-model="chapterTitle"
          type="text"
          class="bg-transparent border-none text-lg font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 rounded-lg px-3 py-1 min-w-[200px]"
          :placeholder="t('editor.chapterTitle')"
        />
      </div>

      <!-- Right: Stats & Save -->
      <div class="flex items-center gap-4">
        <!-- Stats -->
        <div class="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
          <span>{{ wordCount }} {{ t('editor.words') }}</span>
          <span>{{ charCount }} {{ t('editor.characters') }}</span>
        </div>

        <!-- Save Status -->
        <div class="flex items-center gap-2">
          <span
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
            :class="[
              isSaved
                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
            ]"
          >
            <Check v-if="isSaved" class="w-3 h-3" />
            <span>{{ isSaved ? t('editor.saved') : t('editor.unsaved') }}</span>
          </span>
          <NButton
            type="primary"
            size="small"
            :loading="isSaving"
            class="!text-white"
            @click="saveChapter"
          >
            <template #icon>
              <Save class="w-4 h-4" />
            </template>
            {{ t('editor.save') }}
          </NButton>
        </div>
      </div>
    </div>

    <!-- Editor Content -->
    <NScrollbar v-if="projectStore.currentChapter" class="flex-1">
      <div class="max-w-3xl mx-auto py-12 px-8">
        <textarea
          ref="editorRef"
          v-model="content"
          class="w-full h-full min-h-[60vh] bg-transparent border-none resize-none focus:outline-none text-gray-900 dark:text-white text-lg leading-relaxed"
          :placeholder="t('editor.editorPlaceholder')"
          @input="handleInput"
          @keydown="handleKeyDown"
        ></textarea>
      </div>
    </NScrollbar>
    
    <!-- Empty State -->
    <div v-else class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <FileText class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <p class="text-gray-500 dark:text-gray-400">{{ t('editor.noChapterSelected') }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
textarea {
  font-family: inherit;
  line-height: 1.8;
}

textarea::placeholder {
  color: var(--moliu-text-secondary);
}
</style>

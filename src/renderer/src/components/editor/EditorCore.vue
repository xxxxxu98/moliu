<script setup lang="ts">
import { ref, watch, computed, onUnmounted, nextTick } from "vue";
import { NScrollbar, NButton, useMessage } from "naive-ui";
import { Save, Check, FileText } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { useProjectStore } from "@/stores/project.store";

const { t } = useI18n();
const projectStore = useProjectStore();
const message = useMessage();

const editorRef = ref<HTMLTextAreaElement | null>(null);
const content = ref("");
const charCount = ref(0);
const isSaved = ref(true);
const isSaving = ref(false);
const autoSaveTimer = ref<number | null>(null);
const lastSavedContent = ref("");

function updateCounts(text: string) {
  charCount.value = text.length;
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

  try {
    await projectStore.updateChapter(projectStore.currentChapterId, {
      content: content.value,
      wordCount: charCount.value,
    });
    lastSavedContent.value = content.value;
    isSaved.value = true;
    if (!isAutoSave) {
      message.success("保存成功");
    }
  } catch (error) {
    console.error("Failed to save chapter:", error);
    if (!isAutoSave) {
      message.error("保存失败");
    }
  } finally {
    isSaving.value = false;
  }
}

const chapterTitle = computed({
  get: () => {
    const chapter = projectStore.currentChapter;
    return chapter?.title || "";
  },
  set: (value: string) => {
    if (projectStore.currentChapterId) {
      projectStore.updateChapter(projectStore.currentChapterId, {
        title: value,
      });
    }
  },
});

// Watch for chapter changes
watch(
  () => projectStore.currentChapter,
  (newChapter) => {
    if (newChapter) {
      const newContent = newChapter.content || "";
      if (lastSavedContent.value !== newContent) {
        content.value = newContent;
        lastSavedContent.value = newContent;
        charCount.value = newContent.length;
        updateCounts(newContent);
        isSaved.value = true;
      }
    } else {
      content.value = "";
      charCount.value = 0;
    }
  },
  { immediate: true },
);

watch(
  () => projectStore.currentChapterId,
  (newId) => {
    if (newId) {
      const chapter = projectStore.chapters.find((c) => c.id === newId);
      if (chapter) {
        const newContent = chapter.content || "";
        content.value = newContent;
        lastSavedContent.value = newContent;
        charCount.value = newContent.length;
        updateCounts(newContent);
        isSaved.value = true;
      }
    }
  },
);

function handleKeyDown(event: KeyboardEvent) {
  // Ctrl/Cmd + S to save
  if ((event.ctrlKey || event.metaKey) && event.key === "s") {
    event.preventDefault();
    saveChapter();
  }
  // Tab for indentation
  if (event.key === "Tab") {
    event.preventDefault();
    const target = event.target as HTMLTextAreaElement;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    content.value =
      content.value.substring(0, start) + "    " + content.value.substring(end);
    // Restore cursor position
    setTimeout(() => {
      target.selectionStart = target.selectionEnd = start + 4;
    }, 0);
  }
}

/**
 * 在光标位置插入文本
 * @param text 要插入的文本
 */
function insertText(text: string) {
  const textarea = editorRef.value;
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = content.value.substring(0, start);
  const after = content.value.substring(end);

  content.value = before + text + after;

  // 设置光标位置到插入文本之后
  nextTick(() => {
    const newPosition = start + text.length;
    textarea.selectionStart = newPosition;
    textarea.selectionEnd = newPosition;
    textarea.focus();
  });

  // 触发更新
  updateCounts(content.value);
  isSaved.value = false;
  scheduleAutoSave();
}

/**
 * 在内容末尾追加文本
 * @param text 要追加的文本
 */
function appendText(text: string) {
  const textarea = editorRef.value;
  if (!textarea) return;

  // 确保末尾有换行
  const separator =
    content.value.length > 0 && !content.value.endsWith("\n") ? "\n\n" : "";
  content.value += separator + text;

  // 滚动到底部
  nextTick(() => {
    if (textarea) {
      textarea.scrollTop = textarea.scrollHeight;
    }
  });

  updateCounts(content.value);
  isSaved.value = false;
  scheduleAutoSave();
}

/**
 * 替换选中的文本
 * @param newText 替换后的文本
 */
function replaceSelectedText(newText: string) {
  const textarea = editorRef.value;
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = content.value.substring(0, start);
  const after = content.value.substring(end);

  content.value = before + newText + after;

  // 设置光标位置
  nextTick(() => {
    const newPosition = start + newText.length;
    textarea.selectionStart = newPosition;
    textarea.selectionEnd = newPosition;
    textarea.focus();
  });

  updateCounts(content.value);
  isSaved.value = false;
  scheduleAutoSave();
}

/**
 * 获取当前编辑器内容
 */
function getContent(): string {
  return content.value;
}

/**
 * 获取当前选中的文本
 */
function getSelectedText(): string {
  const textarea = editorRef.value;
  if (!textarea) return "";
  return textarea.value.substring(
    textarea.selectionStart,
    textarea.selectionEnd,
  );
}

/**
 * 获取光标位置
 */
function getCursorPosition(): { start: number; end: number } | null {
  const textarea = editorRef.value;
  if (!textarea) return null;
  return {
    start: textarea.selectionStart,
    end: textarea.selectionEnd,
  };
}

// 暴露方法给父组件
defineExpose({
  insertText,
  appendText,
  replaceSelectedText,
  getContent,
  getSelectedText,
  getCursorPosition,
  saveChapter,
});

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
    <div
      class="h-14 flex items-center justify-between px-4 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800"
    >
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
        <div
          class="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400"
        >
          <span class="text-nowrap">{{ charCount }} {{ t("editor.charCount") }}</span>
        </div>

        <!-- Save Status -->
        <div class="flex items-center gap-2">
          <span
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
            :class="[
              isSaved
                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
            ]"
          >
            <Check v-if="isSaved" class="w-3 h-3" />
            <span class="text-nowrap">{{ isSaved ? t("editor.saved") : t("editor.unsaved") }}</span>
          </span>
          <NButton
            type="primary"
            size="small"
            :loading="isSaving"
            class="!text-white"
            @click="() => saveChapter()"
          >
            <template #icon>
              <Save class="w-4 h-4" />
            </template>
            {{ t("editor.save") }}
          </NButton>
        </div>
      </div>
    </div>

    <!-- Editor Content -->
    <NScrollbar v-if="projectStore.currentChapter" class="flex-1">
      <div class="mx-auto py-6 px-6">
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
        <FileText
          class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4"
        />
        <p class="text-gray-500 dark:text-gray-400">
          {{ t("editor.noChapterSelected") }}
        </p>
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

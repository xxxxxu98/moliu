<script setup lang="ts">
import { ref, watch, computed, onUnmounted, nextTick } from "vue";
import { NScrollbar, NButton, NProgress, useMessage, NDrawer, NDrawerContent } from "naive-ui";
import { Save, Check, FileText, Bold, Italic, List, Heading1, Heading2, Undo, Redo, Wand2 } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { useProjectStore } from "@/stores/project.store";
import { useSettingsStore } from "@/stores/settings.store";
import { countWords } from "@/services/writing/utils";
import DeAIPolishPanel from "@/components/editor/DeAIPolishPanel.vue";

const { t } = useI18n();
const projectStore = useProjectStore();
const settingsStore = useSettingsStore();
const message = useMessage();

const editorRef = ref<HTMLTextAreaElement | null>(null);
const scrollbarRef = ref<InstanceType<typeof NScrollbar> | null>(null);
const content = ref("");
const charCount = ref(0);
const wordCount = ref(0);
const isSaved = ref(true);
const isSaving = ref(false);
const autoSaveTimer = ref<number | null>(null);
const lastSavedContent = ref("");
const writingTarget = ref(3000); // 写作目标字数

// 去AI味润色相关状态
const showDeAIDrawer = ref(false);

function openDeAIPanel() {
  showDeAIDrawer.value = true;
}

function handleApplyPolished(polished: string) {
  content.value = polished;
  updateCounts(polished);
  isSaved.value = false;
  scheduleAutoSave();
  showDeAIDrawer.value = false;
}

/**
 * 计算写作进度百分比
 */
const writingProgress = computed(() => {
  if (writingTarget.value <= 0) return 0;
  return Math.min(100, Math.round((wordCount.value / writingTarget.value) * 100));
});

function updateCounts(text: string) {
  const chars = countWords(text);
  charCount.value = chars;
  wordCount.value = chars;
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
  // 只在自动保存启用时调度
  if (!settingsStore.autoSave) {
    return;
  }
  autoSaveTimer.value = window.setTimeout(() => {
    saveChapter(true);
  }, settingsStore.autoSaveInterval * 1000);
}

async function saveChapter(isAutoSave = false) {
  if (!projectStore.currentChapterId) return;

  isSaving.value = true;

  try {
    await projectStore.updateChapter(projectStore.currentChapterId, {
      content: content.value,
      wordCount: wordCount.value,
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
        updateCounts(newContent);
        isSaved.value = true;
      }
    } else {
      content.value = "";
      updateCounts("");
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

// ========== 格式化功能 ==========

/**
 * 插入加粗标记
 */
function insertBold() {
  const selected = getSelectedText();
  if (selected) {
    replaceSelectedText(`**${selected}**`);
  } else {
    insertText("**加粗文字**");
  }
}

/**
 * 插入斜体标记
 */
function insertItalic() {
  const selected = getSelectedText();
  if (selected) {
    replaceSelectedText(`*${selected}*`);
  } else {
    insertText("*斜体文字*");
  }
}

/**
 * 插入一级标题
 */
function insertHeading1() {
  const selected = getSelectedText();
  if (selected) {
    replaceSelectedText(`# ${selected}`);
  } else {
    insertText("# 第一级标题\n");
  }
}

/**
 * 插入二级标题
 */
function insertHeading2() {
  const selected = getSelectedText();
  if (selected) {
    replaceSelectedText(`## ${selected}`);
  } else {
    insertText("## 第二级标题\n");
  }
}

/**
 * 插入列表项
 */
function insertList() {
  insertText("- 列表项\n");
}

/**
 * 插入引用块
 */
function insertQuote() {
  insertText("> 引用文本\n");
}

/**
 * 撤销操作
 */
function undoAction() {
  document.execCommand("undo", false);
}

/**
 * 重做操作
 */
function redoAction() {
  document.execCommand("redo", false);
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

/**
 * 滚动到编辑器顶部
 */
function scrollToTop() {
  const textarea = editorRef.value;
  if (textarea) {
    textarea.scrollTop = 0;
  }
  if (scrollbarRef.value) {
    scrollbarRef.value.scrollTo({ top: 0 });
  }
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
  scrollToTop,
  // 格式化方法
  insertBold,
  insertItalic,
  insertHeading1,
  insertHeading2,
  insertList,
  insertQuote,
  undoAction,
  redoAction,
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
          class="bg-transparent border-none text-lg font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 rounded-lg px-3 py-1 min-w-[480px]"
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
          <span class="text-gray-300 dark:text-gray-600">|</span>
          <span class="text-nowrap">{{ wordCount }} 字</span>
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

    <!-- Format Toolbar -->
    <div
      class="h-10 flex items-center gap-1 px-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800"
    >
      <NButton
        quaternary
        size="tiny"
        @click="undoAction"
        :title="t('editor.undo')"
      >
        <template #icon>
          <Undo class="w-4 h-4" />
        </template>
      </NButton>
      <NButton
        quaternary
        size="tiny"
        @click="redoAction"
        :title="t('editor.redo')"
      >
        <template #icon>
          <Redo class="w-4 h-4" />
        </template>
      </NButton>

      <div class="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-2"></div>

      <NButton
        quaternary
        size="tiny"
        @click="insertHeading1"
        :title="t('editor.heading1')"
      >
        <template #icon>
          <Heading1 class="w-4 h-4" />
        </template>
      </NButton>
      <NButton
        quaternary
        size="tiny"
        @click="insertHeading2"
        :title="t('editor.heading2')"
      >
        <template #icon>
          <Heading2 class="w-4 h-4" />
        </template>
      </NButton>

      <div class="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-2"></div>

      <NButton
        quaternary
        size="tiny"
        @click="insertBold"
        :title="t('editor.bold')"
      >
        <template #icon>
          <Bold class="w-4 h-4" />
        </template>
      </NButton>
      <NButton
        quaternary
        size="tiny"
        @click="insertItalic"
        :title="t('editor.italic')"
      >
        <template #icon>
          <Italic class="w-4 h-4" />
        </template>
      </NButton>

      <div class="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-2"></div>

      <NButton
        quaternary
        size="tiny"
        @click="insertList"
        :title="t('editor.list')"
      >
        <template #icon>
          <List class="w-4 h-4" />
        </template>
      </NButton>

      <div class="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-2"></div>

      <!-- 去AI味按钮 -->
      <NButton
        quaternary
        size="tiny"
        @click="openDeAIPanel"
        title="去AI味润色"
      >
        <template #icon>
          <Wand2 class="w-4 h-4" />
        </template>
      </NButton>

      <!-- Writing Progress -->
      <div class="flex items-center gap-2 ml-auto">
        <span class="text-xs text-gray-500 dark:text-gray-400">
          {{ writingProgress }}%
        </span>
        <NProgress
          type="line"
          :percentage="writingProgress"
          :show-indicator="false"
          :height="6"
          :border-radius="3"
          :fill-border-radius="3"
          :color="writingProgress >= 100 ? '#10b981' : '#6366f1'"
          :rail-color="'#e5e7eb'"
          class="!w-24"
        />
      </div>
    </div>

    <!-- Editor Content -->
    <NScrollbar v-if="projectStore.currentChapter" ref="scrollbarRef" class="flex-1" content-class="h-full">
      <div class="mx-auto py-6 px-6 h-full">
        <textarea
          ref="editorRef"
          v-model="content"
          class="w-full h-full min-h-[60vh] bg-transparent border-none resize-none focus:outline-none text-gray-900 dark:text-white"
          :style="{
            fontSize: `${settingsStore.fontSize}px`,
            lineHeight: settingsStore.lineHeight
          }"
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

    <!-- 去AI味润色抽屉 -->
    <NDrawer
      v-model:show="showDeAIDrawer"
      :width="420"
      placement="right"
    >
      <NDrawerContent :title="'去AI味润色'" :native-scrollbar="false">
        <DeAIPolishPanel
          :content="content"
          @apply="handleApplyPolished"
        />
      </NDrawerContent>
    </NDrawer>
  </div>
</template>

<style scoped>
textarea::placeholder {
  color: var(--moliu-text-secondary);
}
</style>

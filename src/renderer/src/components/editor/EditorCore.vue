<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import CharacterCount from '@tiptap/extension-character-count';
import { NScrollbar, NButton, NTooltip, useMessage } from 'naive-ui';
import { timing } from '@/config/timing';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Highlighter,
  Link as LinkIcon,
  Save,
  Check,
  FileText,
} from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/stores/project.store';

const { t } = useI18n();
const projectStore = useProjectStore();
const message = useMessage();

const editor = useEditor({
  extensions: [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
      link: false,
      underline: false,
    }),
    Underline,
    Highlight,
    Link.configure({
      openOnClick: false,
    }),
    Placeholder.configure({
      placeholder: t('editor.editorPlaceholder'),
    }),
    CharacterCount,
  ],
  editorProps: {
    attributes: {
      class: 'prose prose-lg max-w-none focus:outline-none min-h-[500px]',
    },
  },
  content: '',
});

const wordCount = ref(0);
const charCount = ref(0);
const isSaved = ref(true);
const isSaving = ref(false);
const autoSaveTimer = ref<number | null>(null);
const lastSavedContent = ref('');

// Watch for editor content changes
watch(editor, (newEditor) => {
  if (newEditor) {
    newEditor.on('update', () => {
      wordCount.value = newEditor.storage.characterCount.words();
      charCount.value = newEditor.storage.characterCount.characters();
      isSaved.value = false;
      scheduleAutoSave();
    });
    
    newEditor.on('selectionUpdate', () => {
      // Content is being edited
    });
  }
});

// Watch for current chapter changes
watch(() => projectStore.currentChapter, (newChapter) => {
  if (newChapter && editor.value) {
    const newContent = newChapter.content || '';
    if (lastSavedContent.value !== newContent) {
      editor.value.commands.setContent(newContent || '<p></p>');
      lastSavedContent.value = newContent;
      wordCount.value = newChapter.wordCount || 0;
      charCount.value = newContent.length;
      isSaved.value = true;
    }
  }
}, { immediate: true });

// Watch for chapter ID changes to reload content
watch(() => projectStore.currentChapterId, (newId) => {
  if (newId && editor.value) {
    const chapter = projectStore.chapters.find(c => c.id === newId);
    if (chapter) {
      const newContent = chapter.content || '';
      editor.value.commands.setContent(newContent || '<p></p>');
      lastSavedContent.value = newContent;
      wordCount.value = chapter.wordCount || 0;
      charCount.value = newContent.length;
      isSaved.value = true;
    }
  }
});

function scheduleAutoSave() {
  if (autoSaveTimer.value) {
    clearTimeout(autoSaveTimer.value);
  }
  autoSaveTimer.value = window.setTimeout(() => {
    saveChapter(true);
  }, 30000); // Auto-save after 30 seconds of inactivity
}

async function saveChapter(isAutoSave = false) {
  if (!projectStore.currentChapterId || !editor.value) return;
  
  isSaving.value = true;
  const content = editor.value.getHTML();
  const plainText = editor.value.getText();
  const words = plainText.trim() ? plainText.trim().split(/\s+/).length : 0;
  
  try {
    await projectStore.updateChapter(projectStore.currentChapterId, {
      content,
      wordCount: words,
    });
    lastSavedContent.value = content;
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

// Update chapter title
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

function insertHeading(level: 1 | 2 | 3) {
  editor.value?.chain().focus().toggleHeading({ level }).run();
}

function setLink() {
  const url = window.prompt(t('editor.linkPrompt'));
  if (url) {
    editor.value?.chain().focus().setLink({ href: url }).run();
  } else {
    editor.value?.chain().focus().unsetLink().run();
  }
}

const toolbarButtons = computed(() => [
  { icon: Bold, action: () => editor.value?.chain().focus().toggleBold().run(), isActive: () => editor.value?.isActive('bold'), title: t('editor.toolbar.bold') },
  { icon: Italic, action: () => editor.value?.chain().focus().toggleItalic().run(), isActive: () => editor.value?.isActive('italic'), title: t('editor.toolbar.italic') },
  { icon: UnderlineIcon, action: () => editor.value?.chain().focus().toggleUnderline().run(), isActive: () => editor.value?.isActive('underline'), title: t('editor.toolbar.underline') },
  { icon: Strikethrough, action: () => editor.value?.chain().focus().toggleStrike().run(), isActive: () => editor.value?.isActive('strike'), title: t('editor.toolbar.strikethrough') },
]);

const headingButtons = computed(() => [
  { icon: Heading1, action: () => insertHeading(1), title: t('editor.toolbar.heading1') },
  { icon: Heading2, action: () => insertHeading(2), title: t('editor.toolbar.heading2') },
  { icon: Heading3, action: () => insertHeading(3), title: t('editor.toolbar.heading3') },
]);

const listButtons = computed(() => [
  { icon: List, action: () => editor.value?.chain().focus().toggleBulletList().run(), isActive: () => editor.value?.isActive('bulletList'), title: t('editor.toolbar.bulletList') },
  { icon: ListOrdered, action: () => editor.value?.chain().focus().toggleOrderedList().run(), isActive: () => editor.value?.isActive('orderedList'), title: t('editor.toolbar.orderedList') },
  { icon: Quote, action: () => editor.value?.chain().focus().toggleBlockquote().run(), isActive: () => editor.value?.isActive('blockquote'), title: t('editor.toolbar.blockquote') },
]);

// Cleanup on unmount
onUnmounted(() => {
  if (autoSaveTimer.value) {
    clearTimeout(autoSaveTimer.value);
  }
  // Save before unmount if there are unsaved changes
  if (!isSaved.value && projectStore.currentChapterId) {
    saveChapter(true);
  }
});
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Toolbar -->
    <div class="h-14 flex items-center justify-between px-4 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
      <div class="flex items-center gap-1">
        <!-- Title Input -->
        <input
          v-model="chapterTitle"
          type="text"
          class="bg-transparent border-none text-lg font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 rounded-lg px-3 py-1 min-w-[200px]"
          :placeholder="t('editor.chapterTitle')"
        />

        <div class="w-px h-8 bg-gray-200 dark:bg-gray-700 mx-3"></div>

        <!-- Format Buttons -->
        <div class="flex items-center gap-0.5">
          <NTooltip
            v-for="(btn, index) in toolbarButtons"
            :key="index"
            trigger="hover"
          >
            <template #trigger>
              <button
                class="w-9 h-9 flex items-center justify-center rounded-lg transition-all"
                :class="[
                  btn.isActive?.()
                    ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300'
                ]"
                @click="btn.action"
              >
                <component :is="btn.icon" class="w-4 h-4" />
              </button>
            </template>
            {{ btn.title }}
          </NTooltip>
        </div>

        <div class="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1"></div>

        <!-- Heading Buttons -->
        <div class="flex items-center gap-0.5">
          <NTooltip
            v-for="(btn, index) in headingButtons"
            :key="index"
            trigger="hover"
          >
            <template #trigger>
              <button
                class="w-9 h-9 flex items-center justify-center rounded-lg transition-all"
                :class="[
                  editor?.isActive('heading', { level: index + 1 })
                    ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300'
                ]"
                @click="btn.action"
              >
                <component :is="btn.icon" class="w-4 h-4" />
              </button>
            </template>
            {{ btn.title }}
          </NTooltip>
        </div>

        <div class="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1"></div>

        <!-- List Buttons -->
        <div class="flex items-center gap-0.5">
          <NTooltip
            v-for="(btn, index) in listButtons"
            :key="index"
            trigger="hover"
          >
            <template #trigger>
              <button
                class="w-9 h-9 flex items-center justify-center rounded-lg transition-all"
                :class="[
                  btn.isActive?.()
                    ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300'
                ]"
                @click="btn.action"
              >
                <component :is="btn.icon" class="w-4 h-4" />
              </button>
            </template>
            {{ btn.title }}
          </NTooltip>
        </div>

        <div class="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1"></div>

        <!-- Extra Buttons -->
        <NTooltip trigger="hover">
          <template #trigger>
            <button
              class="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-all"
              @click="setLink"
            >
              <LinkIcon class="w-4 h-4" />
            </button>
          </template>
          {{ t('editor.toolbar.insertLink') }}
        </NTooltip>

        <NTooltip trigger="hover">
          <template #trigger>
            <button
              class="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-all"
              @click="editor?.chain().focus().toggleHighlight().run()"
            >
              <Highlighter class="w-4 h-4" />
            </button>
          </template>
          {{ t('editor.toolbar.highlight') }}
        </NTooltip>
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
        <EditorContent :editor="editor" />
      </div>
    </NScrollbar>
    
    <!-- Empty State -->
    <div v-else class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <FileText class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <p class="text-gray-500 dark:text-gray-400">{{ t('editor.noChapterSelected') || '请选择或创建一个章节开始写作' }}</p>
      </div>
    </div>
  </div>
</template>

<style>
.ProseMirror {
  outline: none;
}

.ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: var(--moliu-text-secondary);
  pointer-events: none;
  height: 0;
}

.ProseMirror h1 {
  @apply text-3xl font-bold mb-6 mt-8;
}

.ProseMirror h2 {
  @apply text-2xl font-bold mb-4 mt-6;
}

.ProseMirror h3 {
  @apply text-xl font-bold mb-3 mt-5;
}

.ProseMirror p {
  @apply mb-4 leading-relaxed;
}

.ProseMirror blockquote {
  @apply pl-4 border-l-4 border-indigo-500 italic text-gray-600 dark:text-gray-400 my-4;
}

.ProseMirror ul,
.ProseMirror ol {
  @apply pl-6 mb-4;
}

.ProseMirror ul {
  @apply list-disc;
}

.ProseMirror ol {
  @apply list-decimal;
}

.ProseMirror li {
  @apply mb-1;
}

.ProseMirror mark {
  @apply bg-yellow-200/70 dark:bg-yellow-800/50 px-1 rounded;
}

.ProseMirror a {
  @apply text-indigo-600 dark:text-indigo-400 underline;
}
</style>

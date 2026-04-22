<script setup lang="ts">
import { ref, watch } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import CharacterCount from '@tiptap/extension-character-count';
import { NScrollbar, NButton, NTooltip } from 'naive-ui';
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
} from 'lucide-vue-next';
import { useProjectStore } from '@/stores/project.store';

const projectStore = useProjectStore();

const editor = useEditor({
  extensions: [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
    }),
    Underline,
    Highlight,
    Link.configure({
      openOnClick: false,
    }),
    Placeholder.configure({
      placeholder: '开始你的创作...',
    }),
    CharacterCount,
  ],
  editorProps: {
    attributes: {
      class: 'prose prose-lg max-w-none focus:outline-none min-h-[500px]',
    },
  },
});

const chapterTitle = ref('第一章 废物少年');
const wordCount = ref(0);
const charCount = ref(0);
const isSaved = ref(true);
const isSaving = ref(false);

watch(editor, (newEditor) => {
  if (newEditor) {
    newEditor.on('update', () => {
      wordCount.value = newEditor.storage.characterCount.words();
      charCount.value = newEditor.storage.characterCount.characters();
      isSaved.value = false;
    });
  }
});

function insertHeading(level: 1 | 2 | 3) {
  editor.value?.chain().focus().toggleHeading({ level }).run();
}

function setLink() {
  const url = window.prompt('输入链接地址');
  if (url) {
    editor.value?.chain().focus().setLink({ href: url }).run();
  } else {
    editor.value?.chain().focus().unsetLink().run();
  }
}

async function saveChapter() {
  isSaving.value = true;
  await new Promise(resolve => setTimeout(resolve, 500));
  isSaving.value = false;
  isSaved.value = true;
}

const toolbarButtons = [
  { icon: Bold, action: () => editor.value?.chain().focus().toggleBold().run(), isActive: () => editor.value?.isActive('bold'), title: '加粗' },
  { icon: Italic, action: () => editor.value?.chain().focus().toggleItalic().run(), isActive: () => editor.value?.isActive('italic'), title: '斜体' },
  { icon: UnderlineIcon, action: () => editor.value?.chain().focus().toggleUnderline().run(), isActive: () => editor.value?.isActive('underline'), title: '下划线' },
  { icon: Strikethrough, action: () => editor.value?.chain().focus().toggleStrike().run(), isActive: () => editor.value?.isActive('strike'), title: '删除线' },
];

const headingButtons = [
  { icon: Heading1, action: () => insertHeading(1), title: '一级标题' },
  { icon: Heading2, action: () => insertHeading(2), title: '二级标题' },
  { icon: Heading3, action: () => insertHeading(3), title: '三级标题' },
];

const listButtons = [
  { icon: List, action: () => editor.value?.chain().focus().toggleBulletList().run(), isActive: () => editor.value?.isActive('bulletList'), title: '无序列表' },
  { icon: ListOrdered, action: () => editor.value?.chain().focus().toggleOrderedList().run(), isActive: () => editor.value?.isActive('orderedList'), title: '有序列表' },
  { icon: Quote, action: () => editor.value?.chain().focus().toggleBlockquote().run(), isActive: () => editor.value?.isActive('blockquote'), title: '引用' },
];
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
          placeholder="章节标题"
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
          插入链接
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
          高亮
        </NTooltip>
      </div>

      <!-- Right: Stats & Save -->
      <div class="flex items-center gap-4">
        <!-- Stats -->
        <div class="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
          <span>{{ wordCount }} 字</span>
          <span>{{ charCount }} 字符</span>
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
            <span>{{ isSaved ? '已保存' : '未保存' }}</span>
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
            保存
          </NButton>
        </div>
      </div>
    </div>

    <!-- Editor Content -->
    <NScrollbar class="flex-1">
      <div class="max-w-3xl mx-auto py-12 px-8">
        <EditorContent :editor="editor" />
      </div>
    </NScrollbar>
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

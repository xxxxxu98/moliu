<script setup lang="ts">
/**
 * ToolBar - 工具栏组件
 * Moliu v2.0 - 写作工具栏
 */
import { computed } from "vue";
import {
  Undo2,
  Redo2,
  Save,
  FileDown,
  FileUp,
  Settings,
  HelpCircle,
  ChevronLeft,
  Sparkles,
  BookOpen,
  ListTodo,
  Layers,
} from "lucide-vue-next";

// ============================================================
// Types
// ============================================================

interface ToolItem {
  id: string;
  icon: any;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  divider?: boolean;
}

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  canUndo?: boolean;
  canRedo?: boolean;
  canSave?: boolean;
  isSaving?: boolean;
  showBack?: boolean;
  activeView?: "editor" | "outline" | "setting";
}

interface Emits {
  (e: "undo"): void;
  (e: "redo"): void;
  (e: "save"): void;
  (e: "export"): void;
  (e: "import"): void;
  (e: "settings"): void;
  (e: "help"): void;
  (e: "back"): void;
  (e: "switchView", view: "editor" | "outline" | "setting"): void;
}

const props = withDefaults(defineProps<Props>(), {
  canUndo: false,
  canRedo: false,
  canSave: true,
  isSaving: false,
  showBack: false,
  activeView: "editor",
});

const emit = defineEmits<Emits>();

// ============================================================
// Data
// ============================================================

const leftTools: ToolItem[] = [
  { id: "back", icon: ChevronLeft, label: "返回", divider: true },
];

const centerTools: ToolItem[] = [
  { id: "editor", icon: BookOpen, label: "编辑器" },
  { id: "outline", icon: ListTodo, label: "大纲" },
  { id: "layers", icon: Layers, label: "设定" },
];

const rightTools: ToolItem[] = [
  { id: "undo", icon: Undo2, label: "撤销", shortcut: "Ctrl+Z" },
  { id: "redo", icon: Redo2, label: "重做", shortcut: "Ctrl+Y", divider: true },
  { id: "save", icon: Save, label: "保存", shortcut: "Ctrl+S", divider: true },
  { id: "export", icon: FileDown, label: "导出" },
  { id: "import", icon: FileUp, label: "导入" },
  { id: "settings", icon: Settings, label: "设置", divider: true },
  { id: "help", icon: HelpCircle, label: "帮助" },
];

// ============================================================
// Methods
// ============================================================

function handleToolClick(toolId: string) {
  switch (toolId) {
    case "undo":
      emit("undo");
      break;
    case "redo":
      emit("redo");
      break;
    case "save":
      emit("save");
      break;
    case "export":
      emit("export");
      break;
    case "import":
      emit("import");
      break;
    case "settings":
      emit("settings");
      break;
    case "help":
      emit("help");
      break;
    case "back":
      emit("back");
      break;
    case "editor":
    case "outline":
    case "layers":
      emit("switchView", toolId as any);
      break;
  }
}

function isToolDisabled(toolId: string): boolean {
  switch (toolId) {
    case "undo":
      return !props.canUndo;
    case "redo":
      return !props.canRedo;
    case "save":
      return !props.canSave || props.isSaving;
    default:
      return false;
  }
}
</script>

<template>
  <div class="flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
    <!-- Left Tools -->
    <div class="flex items-center gap-1">
      <!-- Back Button -->
      <button
        v-if="showBack"
        class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
        title="返回"
        @click="emit('back')"
      >
        <ChevronLeft class="w-5 h-5" />
      </button>

      <!-- View Switcher -->
      <div class="flex items-center gap-0.5 p-1 rounded-lg bg-gray-100 dark:bg-gray-800">
        <button
          v-for="tool in centerTools"
          :key="tool.id"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200"
          :class="[
            activeView === tool.id
              ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200',
          ]"
          @click="handleToolClick(tool.id)"
        >
          <component :is="tool.icon" class="w-4 h-4" />
          <span class="hidden sm:inline">{{ tool.label }}</span>
        </button>
      </div>
    </div>

    <!-- Right Tools -->
    <div class="flex items-center gap-0.5">
      <template v-for="(tool, index) in rightTools" :key="tool.id">
        <!-- Divider -->
        <div
          v-if="tool.divider && index > 0"
          class="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1"
        />

        <!-- Tool Button -->
        <button
          class="p-2 rounded-lg transition-colors"
          :class="[
            isToolDisabled(tool.id)
              ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
              : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400',
          ]"
          :disabled="isToolDisabled(tool.id)"
          :title="tool.label + (tool.shortcut ? ` (${tool.shortcut})` : '')"
          @click="handleToolClick(tool.id)"
        >
          <!-- Saving indicator -->
          <div v-if="tool.id === 'save' && isSaving" class="w-4 h-4 animate-spin">
            <svg class="animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <component v-else :is="tool.icon" class="w-4 h-4" />
        </button>
      </template>

      <!-- AI Generate Button -->
      <button
        class="ml-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-medium shadow-md hover:shadow-lg transition-all duration-200"
      >
        <Sparkles class="w-4 h-4" />
        <span class="hidden sm:inline">AI续写</span>
      </button>
    </div>
  </div>
</template>

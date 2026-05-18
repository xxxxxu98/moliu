<script setup lang="ts">
/**
 * ModeSwitcher - 创作模式切换器
 * Moliu v2.0 - 在不同创作模式之间切换
 */
import { ref, computed } from "vue";
import { 
  Feather, 
  Sparkles, 
  BookOpen, 
  BarChart3, 
  Settings,
  ChevronDown,
  Check
} from "lucide-vue-next";

// ============================================================
// Types
// ============================================================

export type WritingMode = "outline" | "chapter" | "batch" | "analysis" | "settings";

interface ModeOption {
  id: WritingMode;
  name: string;
  icon: typeof Feather;
  description: string;
  gradient: string;
  badge?: string;
}

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  modelValue?: WritingMode;
}

interface Emits {
  (e: "update:modelValue", value: WritingMode): void;
  (e: "change", value: WritingMode): void;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: "outline",
});

const emit = defineEmits<Emits>();

// ============================================================
// State
// ============================================================

const isOpen = ref(false);

// ============================================================
// Data
// ============================================================

const modes: ModeOption[] = [
  {
    id: "outline",
    name: "大纲模式",
    icon: BookOpen,
    description: "创作故事大纲和章节规划",
    gradient: "from-indigo-500 to-purple-600",
    badge: "推荐",
  },
  {
    id: "chapter",
    name: "单章模式",
    icon: Feather,
    description: "逐章精细化写作",
    gradient: "from-amber-500 to-orange-600",
  },
  {
    id: "batch",
    name: "批量模式",
    icon: Sparkles,
    description: "批量生成多章内容",
    gradient: "from-emerald-500 to-teal-600",
  },
  {
    id: "analysis",
    name: "分析模式",
    icon: BarChart3,
    description: "拆文分析提升写作",
    gradient: "from-cyan-500 to-blue-600",
  },
  {
    id: "settings",
    name: "设置",
    icon: Settings,
    description: "调整AI参数和偏好",
    gradient: "from-gray-500 to-slate-600",
  },
];

// ============================================================
// Computed
// ============================================================

const currentMode = computed(() => {
  return modes.find((m) => m.id === props.modelValue) || modes[0];
});

const currentGradient = computed(() => currentMode.value.gradient);

// ============================================================
// Methods
// ============================================================

function toggleDropdown() {
  isOpen.value = !isOpen.value;
}

function selectMode(mode: WritingMode) {
  emit("update:modelValue", mode);
  emit("change", mode);
  isOpen.value = false;
}

function closeDropdown() {
  isOpen.value = false;
}
</script>

<template>
  <div class="relative">
    <!-- Dropdown Trigger -->
    <button
      class="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-gradient-to-r text-white shadow-lg hover:shadow-xl transition-all duration-200"
      :class="currentGradient"
      @click="toggleDropdown"
    >
      <component :is="currentMode.icon" class="w-5 h-5" />
      <span class="font-medium">{{ currentMode.name }}</span>
      <ChevronDown
        class="w-4 h-4 transition-transform duration-200"
        :class="{ 'rotate-180': isOpen }"
      />
    </button>

    <!-- Dropdown Menu -->
    <Transition name="dropdown">
      <div
        v-if="isOpen"
        class="absolute top-full left-0 mt-2 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50"
        v-click-outside="closeDropdown"
      >
        <div class="p-2">
          <button
            v-for="mode in modes"
            :key="mode.id"
            class="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all duration-150"
            :class="[
              modelValue === mode.id
                ? 'bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30'
                : 'hover:bg-gray-50 dark:hover:bg-gray-700/50',
            ]"
            @click="selectMode(mode.id)"
          >
            <div
              class="w-10 h-10 rounded-lg flex items-center justify-center"
              :class="`bg-gradient-to-br ${mode.gradient}`"
            >
              <component :is="mode.icon" class="w-5 h-5 text-white" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-gray-900 dark:text-white">
                  {{ mode.name }}
                </span>
                <span
                  v-if="mode.badge"
                  class="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
                >
                  {{ mode.badge }}
                </span>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                {{ mode.description }}
              </p>
            </div>
            <Check
              v-if="modelValue === mode.id"
              class="w-4 h-4 text-indigo-500 flex-shrink-0"
            />
          </button>
        </div>

        <!-- Footer -->
        <div class="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700">
          <p class="text-xs text-gray-400 dark:text-gray-500">
            切换模式不会丢失当前进度
          </p>
        </div>
      </div>
    </Transition>

    <!-- Backdrop -->
    <Transition name="fade">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-40"
        @click="closeDropdown"
      />
    </Transition>
  </div>
</template>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

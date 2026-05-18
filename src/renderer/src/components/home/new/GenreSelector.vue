<script setup lang="ts">
/**
 * GenreSelector - 题材选择器组件
 * Moliu v2.0 - 多标签题材选择
 */
import { ref, computed, watch } from "vue";
import { X, Check, Search, TrendingUp, Star, Clock } from "lucide-vue-next";

// ============================================================
// Types
// ============================================================

interface GenreTag {
  id: string;
  name: string;
  icon: string;
  description?: string;
  hotScore?: number;
  isRecommended?: boolean;
  category: string;
}

interface Props {
  genres: GenreTag[];
  modelValue: string[];
  max?: number;
  searchable?: boolean;
  showHot?: boolean;
  placeholder?: string;
}

interface Emits {
  (e: "update:modelValue", value: string[]): void;
  (e: "change", value: string[]): void;
}

const props = withDefaults(defineProps<Props>(), {
  max: 5,
  searchable: true,
  showHot: true,
  placeholder: "选择题材标签",
});

const emit = defineEmits<Emits>();

// ============================================================
// State
// ============================================================

const searchQuery = ref("");
const showDropdown = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);

// ============================================================
// Computed
// ============================================================

const selectedGenres = computed(() => {
  return props.genres.filter((g) => props.modelValue.includes(g.id));
});

const availableGenres = computed(() => {
  let result = [...props.genres];

  // 搜索过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(
      (g) =>
        g.name.toLowerCase().includes(query) ||
        g.description?.toLowerCase().includes(query) ||
        g.category.toLowerCase().includes(query)
    );
  }

  // 已选中的排除
  result = result.filter((g) => !props.modelValue.includes(g.id));

  // 热门优先
  if (props.showHot) {
    result.sort((a, b) => (b.hotScore || 0) - (a.hotScore || 0));
  }

  return result;
});

const categories = computed(() => {
  const cats = [...new Set(props.genres.map((g) => g.category))];
  return cats;
});

const groupedGenres = computed(() => {
  const groups: Record<string, GenreTag[]> = {};
  for (const cat of categories.value) {
    groups[cat] = availableGenres.value.filter((g) => g.category === cat);
  }
  return groups;
});

const canAddMore = computed(() => {
  return props.modelValue.length < props.max;
});

const isMaxReached = computed(() => {
  return props.modelValue.length >= props.max;
});

// ============================================================
// Methods
// ============================================================

function selectGenre(genreId: string) {
  if (isMaxReached.value) return;
  if (props.modelValue.includes(genreId)) return;

  const newValue = [...props.modelValue, genreId];
  emit("update:modelValue", newValue);
  emit("change", newValue);
}

function removeGenre(genreId: string) {
  const newValue = props.modelValue.filter((id) => id !== genreId);
  emit("update:modelValue", newValue);
  emit("change", newValue);
}

function toggleDropdown() {
  showDropdown.value = !showDropdown.value;
  if (showDropdown.value) {
    searchQuery.value = "";
  }
}

function handleClickOutside(event: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    showDropdown.value = false;
  }
}

// ============================================================
// Lifecycle
// ============================================================

watch(showDropdown, (show) => {
  if (show) {
    document.addEventListener("click", handleClickOutside);
  } else {
    document.removeEventListener("click", handleClickOutside);
  }
});
</script>

<template>
  <div ref="dropdownRef" class="relative">
    <!-- Selected Tags -->
    <div
      class="min-h-[44px] px-3 py-2 rounded-xl border-2 border-dashed cursor-pointer transition-colors"
      :class="[
        showDropdown
          ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700',
        isMaxReached ? 'opacity-60' : '',
      ]"
      @click="toggleDropdown"
    >
      <!-- Selected Tags List -->
      <div v-if="selectedGenres.length > 0" class="flex flex-wrap gap-2">
        <span
          v-for="genre in selectedGenres"
          :key="genre.id"
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-sm font-medium"
        >
          <span>{{ genre.icon }}</span>
          <span>{{ genre.name }}</span>
          <button
            class="ml-0.5 p-0.5 rounded hover:bg-white/20 transition-colors"
            @click.stop="removeGenre(genre.id)"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </span>
      </div>

      <!-- Placeholder -->
      <div
        v-else
        class="flex items-center gap-2 text-sm"
        :class="showDropdown ? 'text-indigo-500' : 'text-gray-400'"
      >
        <span>{{ placeholder }}</span>
        <span class="text-xs opacity-60">({{ modelValue.length }}/{{ max }})</span>
      </div>

      <!-- Hint when max reached -->
      <div
        v-if="isMaxReached && selectedGenres.length > 0"
        class="mt-2 text-xs text-amber-500"
      >
        已达到最大选择数量 ({{ max }})
      </div>
    </div>

    <!-- Dropdown -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-1"
    >
      <div
        v-if="showDropdown"
        class="absolute z-50 left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
      >
        <!-- Search -->
        <div v-if="searchable" class="p-3 border-b border-gray-100 dark:border-gray-700">
          <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="搜索题材..."
              class="w-full pl-10 pr-4 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              @click.stop
            />
          </div>
        </div>

        <!-- Genre List -->
        <div class="max-h-80 overflow-y-auto">
          <!-- Empty State -->
          <div
            v-if="availableGenres.length === 0"
            class="flex flex-col items-center justify-center py-8 px-4"
          >
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ searchQuery ? "未找到匹配的题材" : "已选择所有可用题材" }}
            </p>
          </div>

          <!-- Grouped List -->
          <template v-else>
            <div
              v-for="(genres, category) in groupedGenres"
              :key="category"
              class="py-2"
            >
              <div
                v-if="genres.length > 0"
              >
                <div class="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {{ category }}
                </div>
                <div class="space-y-0.5 px-2 pb-2">
                  <button
                    v-for="genre in genres"
                    :key="genre.id"
                    class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    :class="{ 'opacity-50 cursor-not-allowed': isMaxReached }"
                    :disabled="isMaxReached"
                    @click="selectGenre(genre.id)"
                  >
                    <span class="text-xl">{{ genre.icon }}</span>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="font-medium text-gray-900 dark:text-white">
                          {{ genre.name }}
                        </span>
                        <Star
                          v-if="genre.isRecommended"
                          class="w-3.5 h-3.5 text-amber-500 fill-current"
                        />
                        <TrendingUp
                          v-if="genre.hotScore && genre.hotScore > 80"
                          class="w-3.5 h-3.5 text-red-500"
                        />
                      </div>
                      <p
                        v-if="genre.description"
                        class="text-xs text-gray-500 dark:text-gray-400 truncate"
                      >
                        {{ genre.description }}
                      </p>
                    </div>
                    <div
                      v-if="genre.hotScore"
                      class="px-1.5 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-500"
                    >
                      {{ genre.hotScore }}
                    </div>
                    <Check
                      v-if="modelValue.includes(genre.id)"
                      class="w-4 h-4 text-indigo-500"
                    />
                  </button>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- Footer -->
        <div class="px-3 py-2 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <p class="text-xs text-gray-500 dark:text-gray-400">
            已选择 {{ modelValue.length }}/{{ max }} 个题材
          </p>
        </div>
      </div>
    </Transition>
  </div>
</template>

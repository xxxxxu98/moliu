<script setup lang="ts">
import { ref, computed } from 'vue';
import { Sparkles, Check, ChevronRight, Info } from 'lucide-vue-next';
import { NModal, NButton } from 'naive-ui';
import { 
  storyCards, 
  getRecommendedCombos, 
  getComboCards, 
  filterStoryCardsByGenre,
  type StoryCard,
  type StoryCardComposition,
  generateCompositionOutline
} from '@/data/story-cards';

const props = defineProps<{
  selectedTags?: string[];
}>();

const emit = defineEmits<{
  (e: 'select', composition: StoryCardComposition): void;
  (e: 'close'): void;
}>();

// 状态
const showModal = ref(true);
const selectedCards = ref<StoryCard[]>([]);
const currentStep = ref<'select' | 'confirm'>('select');
const showCardDetail = ref<StoryCard | null>(null);

// 推荐组合
const recommendedCombos = getRecommendedCombos();

// 过滤故事卡
const filteredCards = computed(() => {
  if (!props.selectedTags || props.selectedTags.length === 0) {
    return storyCards;
  }
  // 根据选中标签过滤
  return storyCards.filter(card => 
    card.applicableGenres.some(genre => 
      props.selectedTags!.some(tag => 
        tag.includes(genre) || genre.includes(tag)
      )
    )
  );
});

// 已选中的卡片类型集合
const selectedCardTypes = computed(() => 
  new Set(selectedCards.value.map(c => c.type))
);

// 选中的卡片详情
const selectedCardDetails = computed(() => {
  return selectedCards.value.map(card => ({
    ...card,
    relatedCards: getComboCards(card.type).slice(0, 2),
  }));
});

// 可组合的卡片（用于提示）
const suggestedCombos = computed(() => {
  if (selectedCards.value.length === 0) return [];
  const lastCard = selectedCards.value[selectedCards.value.length - 1];
  return getComboCards(lastCard.type).filter(
    card => !selectedCardTypes.value.has(card.type)
  );
});

// 切换卡片选择
function toggleCard(card: StoryCard) {
  const index = selectedCards.value.findIndex(c => c.type === card.type);
  if (index === -1) {
    if (selectedCards.value.length < 3) {
      selectedCards.value.push(card);
    }
  } else {
    selectedCards.value.splice(index, 1);
  }
}

// 选择推荐组合
function selectRecommendedCombo(primary: StoryCard, secondary: StoryCard) {
  selectedCards.value = [primary, secondary];
}

// 确认选择
function confirmSelection() {
  if (selectedCards.value.length === 0) return;
  
  currentStep.value = 'confirm';
}

// 返回选择
function backToSelect() {
  currentStep.value = 'select';
}

// 确认并发送
function handleConfirm() {
  const composition: StoryCardComposition = {
    primaryCard: selectedCards.value[0],
    secondaryCard: selectedCards.value[1] || undefined,
  };
  
  emit('select', composition);
  showModal.value = false;
}

// 关闭
function handleClose() {
  showModal.value = false;
  emit('close');
}

// 获取卡片难度标签
function getDifficultyLabel(level: number): string {
  if (level <= 2) return '简单';
  if (level <= 3) return '中等';
  return '困难';
}

// 获取卡片难度颜色
function getDifficultyColor(level: number): string {
  if (level <= 2) return 'text-emerald-600 bg-emerald-100';
  if (level <= 3) return 'text-amber-600 bg-amber-100';
  return 'text-red-600 bg-red-100';
}
</script>

<template>
  <NModal
    v-model:show="showModal"
    preset="card"
    :title="'故事卡模板库'"
    :style="{ width: '800px', maxHeight: '80vh' }"
    :mask-closable="false"
    @close="handleClose"
  >
    <div class="space-y-4">
      <!-- 说明 -->
      <div class="p-3 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-200 dark:border-indigo-800">
        <p class="text-xs text-indigo-700 dark:text-indigo-400">
          <strong>故事卡系统</strong>：选择一个或多个故事卡，AI将为你组合出完整的故事框架。
          故事卡代表经典的故事模块（英雄救美、装逼打脸等），通过组合不同卡片可以创造出新颖的故事！
        </p>
      </div>

      <!-- 步骤1：选择故事卡 -->
      <template v-if="currentStep === 'select'">
        <!-- 推荐组合 -->
        <div>
          <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
            <Sparkles class="w-4 h-4 text-amber-500" />
            推荐组合
          </h4>
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="(combo, index) in recommendedCombos"
              :key="index"
              class="p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50/50 to-orange-50/50 dark:from-amber-900/20 dark:to-orange-900/20 text-left hover:border-amber-400 transition-colors"
              @click="selectRecommendedCombo(combo.primary, combo.secondary)"
            >
              <div class="flex items-center gap-2 mb-1">
                <span class="text-lg">{{ combo.primary.icon }}</span>
                <span class="text-lg">{{ combo.secondary.icon }}</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white">
                  {{ combo.primary.name }} + {{ combo.secondary.name }}
                </span>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400">{{ combo.description }}</p>
            </button>
          </div>
        </div>

        <!-- 所有故事卡 -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">
              所有故事卡 ({{ filteredCards.length }})
            </h4>
            <span class="text-xs text-gray-400">
              已选: {{ selectedCards.length }}/3
            </span>
          </div>
          <div class="grid grid-cols-3 gap-2 max-h-96 overflow-y-auto pr-1">
            <button
              v-for="card in filteredCards"
              :key="card.id"
              class="p-3 rounded-xl border text-left transition-all duration-200 relative group"
              :class="[
                selectedCardTypes.has(card.type)
                  ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/30'
                  : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 bg-white dark:bg-gray-800'
              ]"
              @click="toggleCard(card)"
            >
              <!-- 选中标记 -->
              <div 
                v-if="selectedCardTypes.has(card.type)"
                class="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center"
              >
                <Check class="w-3 h-3 text-white" />
              </div>
              
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xl">{{ card.icon }}</span>
                <span class="font-medium text-sm text-gray-900 dark:text-white">{{ card.name }}</span>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                {{ card.description }}
              </p>
              
              <!-- 悬停显示详情 -->
              <div
                class="absolute bottom-full left-0 right-0 mb-2 p-2 rounded-lg bg-gray-900 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none"
              >
                <p class="font-medium mb-1">适用：{{ card.applicableGenres.join('、') }}</p>
                <p>难度：<span :class="getDifficultyColor(card.difficulty)">{{ getDifficultyLabel(card.difficulty) }}</span></p>
              </div>
            </button>
          </div>
        </div>

        <!-- 可组合提示 -->
        <div v-if="suggestedCombos.length > 0" class="p-3 rounded-xl bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800">
          <p class="text-xs text-teal-700 dark:text-teal-400 mb-2 flex items-center gap-1">
            <Info class="w-3 h-3" />
            搭配推荐
          </p>
          <div class="flex flex-wrap gap-2">
            <NButton
              v-for="combo in suggestedCombos"
              :key="combo.id"
              size="small"
              quaternary
              type="success"
              @click="toggleCard(combo)"
            >
              {{ combo.icon }} {{ combo.name }}
            </NButton>
          </div>
        </div>
      </template>

      <!-- 步骤2：确认 -->
      <template v-else>
        <div class="space-y-3">
          <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">
            已选故事卡
          </h4>
          
          <div 
            v-for="card in selectedCardDetails" 
            :key="card.id"
            class="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
          >
            <div class="flex items-start gap-3">
              <span class="text-3xl">{{ card.icon }}</span>
              <div class="flex-1">
                <h5 class="font-medium text-gray-900 dark:text-white mb-1">{{ card.name }}</h5>
                <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">{{ card.description }}</p>
                
                <div class="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span class="text-gray-400">结构：</span>
                    <span class="text-gray-600 dark:text-gray-300">起因→发展→高潮→解决</span>
                  </div>
                  <div>
                    <span class="text-gray-400">难度：</span>
                    <span :class="getDifficultyColor(card.difficulty)">{{ getDifficultyLabel(card.difficulty) }}</span>
                  </div>
                </div>
                
                <div v-if="card.relatedCards.length > 0" class="mt-2">
                  <span class="text-xs text-gray-400">可组合：</span>
                  <span 
                    v-for="related in card.relatedCards" 
                    :key="related.id"
                    class="text-xs text-indigo-600 dark:text-indigo-400 ml-1"
                  >
                    {{ related.icon }}{{ related.name }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 生成的大纲预览 -->
          <div class="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">AI将为你生成的大纲结构：</p>
            <div class="text-xs text-gray-600 dark:text-gray-300 space-y-1">
              <p>• <strong>第一幕</strong>：融合 {{ selectedCards.map(c => c.name).join(' + ') }} 的起因设定</p>
              <p>• <strong>第二幕</strong>：交织两条故事线的发展</p>
              <p>• <strong>第三幕</strong>：双重冲突同时爆发</p>
              <p>• <strong>第四幕</strong>：完美收束多条线索</p>
            </div>
          </div>
        </div>
      </template>

      <!-- 操作按钮 -->
      <div class="flex justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <NButton
          v-if="currentStep === 'confirm'"
          quaternary
          @click="backToSelect"
        >
          返回修改
        </NButton>
        <div v-else></div>
        
        <div class="flex gap-2">
          <NButton @click="handleClose">
            取消
          </NButton>
          <NButton
            v-if="currentStep === 'select'"
            type="primary"
            :disabled="selectedCards.length === 0"
            @click="confirmSelection"
          >
            确认选择 ({{ selectedCards.length }})
            <template #icon>
              <ChevronRight class="w-4 h-4" />
            </template>
          </NButton>
          <NButton
            v-else
            type="primary"
            @click="handleConfirm"
          >
            生成大纲
            <template #icon>
              <Sparkles class="w-4 h-4" />
            </template>
          </NButton>
        </div>
      </div>
    </div>
  </NModal>
</template>

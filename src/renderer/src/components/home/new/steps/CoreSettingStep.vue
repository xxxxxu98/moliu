<script setup lang="ts">
/**
 * 核心设定步骤
 * Moliu v2.0 - 三步创作法的第二步
 */
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Settings, Sword, Crown, MapPin, Zap, ChevronRight, ChevronLeft } from "lucide-vue-next";
import { GENRE_PROFILES } from "@/data/genre-profiles";

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  modelValue?: StepData;
  genres?: string[];
  isGenerating?: boolean;
}

interface Emits {
  (e: "update:modelValue", value: StepData): void;
  (e: "complete"): void;
  (e: "back"): void;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => ({
    worldType: "",
    powerSystem: "",
    goldenFinger: "",
    mainConflict: "",
    protagonistType: "",
    antagonistType: "",
  }),
  genres: () => [],
  isGenerating: false,
});

const emit = defineEmits<Emits>();

// ============================================================
// Types
// ============================================================

interface StepData {
  worldType: string;
  powerSystem: string;
  goldenFinger: string;
  mainConflict: string;
  protagonistType: string;
  antagonistType: string;
}

// ============================================================
// Data
// ============================================================

const worldTypes = [
  { id: "urban", name: "都市", icon: "🏙️" },
  { id: "ancient", name: "古代", icon: "🏯" },
  { id: "xianxia", name: "修仙界", icon: "☁️" },
  { id: "fantasy", name: "异世界", icon: "🌍" },
  { id: "scifi", name: "未来/星际", icon: "🚀" },
  { id: "historical", name: "历史", icon: "📜" },
];

const powerSystems = [
  { id: "cultivation", name: "修炼体系", description: "境界突破、功法秘籍" },
  { id: "system", name: "系统流", description: "任务奖励、属性面板" },
  { id: "martial", name: "武学体系", description: "招式、内力、功法" },
  { id: "magic", name: "魔法体系", description: "元素、法术、咒语" },
  { id: "tech", name: "科技力量", description: "机甲、异能、基因" },
  { id: "none", name: "无特殊体系", description: "现实都市、无超自然" },
];

const goldenFingerOptions = [
  { id: "system", name: "系统", icon: "🎮", description: "任务奖励、属性面板" },
  { id: "inheritance", name: "传承", icon: "📜", description: "上古功法、神兵利器" },
  { id: "bloodline", name: "血脉", icon: "🩸", description: "特殊体质、天赋血脉" },
  { id: "knowledge", name: "知识", icon: "📚", description: "未来知识、独特技能" },
  { id: "space", name: "随身空间", icon: "🎒", description: "储物空间、农场、基地" },
  { id: "other", name: "其他", icon: "✨", description: "特殊机缘" },
];

const protagonistTypes = [
  { id: "underdog", name: "废柴逆袭", description: "资质平平、被人看不起", example: "三年废物，一朝觉醒" },
  { id: "talent", name: "天才崛起", description: "天赋异禀、受人瞩目", example: "天生神体、修炼奇速" },
  { id: "transmigrator", name: "穿越者", description: "带有前世记忆", example: "重生归来、未卜先知" },
  { id: "reborn", name: "重生者", description: "回到过去重来", example: "带着遗憾重生" },
  { id: "chosen", name: "天选之人", description: "被命运选中", example: "预言中的救世主" },
  { id: "opportunist", name: "老硬币", description: "苟到最后才是赢", example: "低调发育、猥琐流" },
];

// ============================================================
// State
// ============================================================

const selectedWorldType = ref(props.modelValue.worldType);
const selectedPowerSystem = ref(props.modelValue.powerSystem);
const selectedGoldenFinger = ref(props.modelValue.goldenFinger);
const mainConflict = ref(props.modelValue.mainConflict);
const selectedProtagonistType = ref(props.modelValue.protagonistType);
const selectedAntagonistType = ref(props.modelValue.antagonistType);

// ============================================================
// Computed
// ============================================================

const canProceed = computed(() => {
  return (
    selectedWorldType.value !== "" &&
    selectedPowerSystem.value !== "" &&
    selectedProtagonistType.value !== ""
  );
});

// ============================================================
// Methods
// ============================================================

function handleBack() {
  emitUpdate();
  emit("back");
}

function handleNext() {
  if (!canProceed.value) return;
  emitUpdate();
  emit("complete");
}

function emitUpdate() {
  emit("update:modelValue", {
    worldType: selectedWorldType.value,
    powerSystem: selectedPowerSystem.value,
    goldenFinger: selectedGoldenFinger.value,
    mainConflict: mainConflict.value,
    protagonistType: selectedProtagonistType.value,
    antagonistType: selectedAntagonistType.value,
  });
}

// Watch for external changes
watch(
  () => props.modelValue,
  (newVal) => {
    selectedWorldType.value = newVal.worldType;
    selectedPowerSystem.value = newVal.powerSystem;
    selectedGoldenFinger.value = newVal.goldenFinger;
    mainConflict.value = newVal.mainConflict;
    selectedProtagonistType.value = newVal.protagonistType;
    selectedAntagonistType.value = newVal.antagonistType;
  },
  { deep: true }
);
</script>

<template>
  <div class="space-y-6">
    <!-- Section 1: 世界类型 -->
    <div>
      <div class="flex items-center gap-2 mb-3">
        <MapPin class="w-5 h-5 text-indigo-500" />
        <h4 class="text-sm font-medium text-gray-900 dark:text-white">世界类型</h4>
      </div>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="world in worldTypes"
          :key="world.id"
          class="p-2.5 rounded-xl text-center transition-all duration-200 border-2"
          :class="[
            selectedWorldType === world.id
              ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 bg-white dark:bg-gray-800',
          ]"
          @click="selectedWorldType = world.id"
        >
          <span class="text-xl mb-1 block">{{ world.icon }}</span>
          <span class="text-xs font-medium text-gray-900 dark:text-white">
            {{ world.name }}
          </span>
        </button>
      </div>
    </div>

    <!-- Section 2: 力量体系 -->
    <div>
      <div class="flex items-center gap-2 mb-3">
        <Zap class="w-5 h-5 text-amber-500" />
        <h4 class="text-sm font-medium text-gray-900 dark:text-white">力量体系</h4>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="power in powerSystems"
          :key="power.id"
          class="p-3 rounded-xl text-left transition-all duration-200 border-2"
          :class="[
            selectedPowerSystem === power.id
              ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-amber-300 dark:hover:border-amber-700 bg-white dark:bg-gray-800',
          ]"
          @click="selectedPowerSystem = power.id"
        >
          <span class="text-sm font-medium text-gray-900 dark:text-white">
            {{ power.name }}
          </span>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {{ power.description }}
          </p>
        </button>
      </div>
    </div>

    <!-- Section 3: 金手指 -->
    <div>
      <div class="flex items-center gap-2 mb-3">
        <Settings class="w-5 h-5 text-emerald-500" />
        <h4 class="text-sm font-medium text-gray-900 dark:text-white">
          金手指
          <span class="text-xs font-normal text-gray-500 dark:text-gray-400 ml-1">
            (可选)
          </span>
        </h4>
      </div>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="gf in goldenFingerOptions"
          :key="gf.id"
          class="p-3 rounded-xl text-center transition-all duration-200 border-2"
          :class="[
            selectedGoldenFinger === gf.id
              ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700 bg-white dark:bg-gray-800',
          ]"
          @click="selectedGoldenFinger = gf.id"
        >
          <span class="text-xl mb-1 block">{{ gf.icon }}</span>
          <span class="text-xs font-medium text-gray-900 dark:text-white">
            {{ gf.name }}
          </span>
        </button>
      </div>
    </div>

    <!-- Section 4: 主角类型 -->
    <div>
      <div class="flex items-center gap-2 mb-3">
        <Sword class="w-5 h-5 text-rose-500" />
        <h4 class="text-sm font-medium text-gray-900 dark:text-white">主角定位</h4>
      </div>
      <div class="space-y-2">
        <button
          v-for="pt in protagonistTypes"
          :key="pt.id"
          class="w-full p-3 rounded-xl text-left transition-all duration-200 border-2"
          :class="[
            selectedProtagonistType === pt.id
              ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-rose-300 dark:hover:border-rose-700 bg-white dark:bg-gray-800',
          ]"
          @click="selectedProtagonistType = pt.id"
        >
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-900 dark:text-white">
              {{ pt.name }}
            </span>
            <ChevronRight
              v-if="selectedProtagonistType === pt.id"
              class="w-4 h-4 text-rose-500"
            />
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {{ pt.description }}
          </p>
          <p
            class="text-xs text-rose-600 dark:text-rose-400 mt-1 italic"
          >
            "{{ pt.example }}"
          </p>
        </button>
      </div>
    </div>

    <!-- Section 5: 核心冲突 -->
    <div>
      <div class="flex items-center gap-2 mb-3">
        <Crown class="w-5 h-5 text-purple-500" />
        <h4 class="text-sm font-medium text-gray-900 dark:text-white">
          核心冲突
          <span class="text-xs font-normal text-gray-500 dark:text-gray-400 ml-1">
            (可选)
          </span>
        </h4>
      </div>
      <textarea
        v-model="mainConflict"
        class="w-full h-20 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
        placeholder="描述故事的核心冲突，如：家族恩怨、宗门争斗、寻找身世真相..."
      ></textarea>
    </div>

    <!-- Navigation Buttons -->
    <div class="flex gap-3">
      <button
        class="flex-1 py-3 rounded-xl font-medium border-2 transition-all flex items-center justify-center gap-2"
        :class="[
          !isGenerating
            ? 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            : 'border-gray-100 dark:border-gray-800 text-gray-400 cursor-not-allowed',
        ]"
        :disabled="isGenerating"
        @click="handleBack"
      >
        <ChevronLeft v-if="!isGenerating" class="w-4 h-4" />
        <span v-if="isGenerating" class="w-4 h-4 border-2 border-gray-400/30 border-t-gray-400 rounded-full animate-spin"></span>
        {{ isGenerating ? '生成中...' : '上一步' }}
      </button>
      <button
        class="flex-1 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2"
        :class="[
          canProceed && !isGenerating
            ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg hover:shadow-xl'
            : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed',
        ]"
        :disabled="!canProceed || isGenerating"
        @click="handleNext"
      >
        <span v-if="isGenerating" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
        {{ isGenerating ? '生成中...' : '下一步：爽点规划' }}
      </button>
    </div>
  </div>
</template>

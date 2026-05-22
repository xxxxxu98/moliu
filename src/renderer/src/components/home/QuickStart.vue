<script setup lang="ts">
/**
 * QuickStart v2 - 新三步创作法组件
 * Moliu v2.0 - 基于三步创作法的快速开始组件
 */
import { ref, computed, watch, onMounted } from "vue";
import {
  Sparkles,
  Check,
  Wand2,
  BookOpen,
  Save,
  RotateCcw,
  ChevronDown,
  Heart,
  Zap,
  Search,
  TrendingUp,
  X,
  Star,
} from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { useMessage } from "naive-ui";
import { NButton, NInput } from "naive-ui";
import { useSettingsStore } from "@/stores/settings.store";
import { DEFAULT_WORD_COUNT_RANGE } from "@/services/ai/unified.service";
import type { GeneratedOutline } from "@/types/inspiration";
import { useOutlineGenerator } from "@/composables/useOutlineGenerator";
import { useProjectCreator } from "@/composables/useProjectCreator";
import OutlineDisplay from "@/components/common/OutlineDisplay.vue";
import WordCountSelector from "@/components/common/WordCountSelector.vue";
import StepWizard from "./new/StepWizard.vue";
import type { HookType, CoolPointType } from "@/types/evaluation";

// ============================================================
// Types
// ============================================================

interface WizardData {
  emotionGenre: {
    emotionGoals: string[];
    genres: string[];
    customPrompt: string;
  };
  coreSetting: {
    worldType: string;
    powerSystem: string;
    goldenFinger: string;
    mainConflict: string;
    protagonistType: string;
    antagonistType: string;
  };
  coolPoint: {
    coolPoints: CoolPointType[];
    hooks: HookType[];
    rhythmType: string;
    antiTropes: string[];
    customCoolPoints: string;
  };
}

// ============================================================
// Composables
// ============================================================

const { t } = useI18n();
const message = useMessage();
const settingsStore = useSettingsStore();

const {
  isGenerating,
  error: generationError,
  progress: generationProgress,
  outlines: generatedOutlines,
  generateOutlines,
  reset: resetOutlineState,
} = useOutlineGenerator();

const {
  isCreating,
  error: projectCreateError,
  createProject: doCreateProject,
  reset: resetProjectState,
} = useProjectCreator();

// ============================================================
// State
// ============================================================

type ActiveTab = "wizard" | "templates" | "custom";
const activeTab = ref<ActiveTab>("wizard");

// Wizard state
const showWizard = ref(true);
const wizardCompleted = ref(false);
const wizardData = ref<WizardData | null>(null);

// Traditional inputs
const selectedTemplate = ref<WritingTemplate | null>(null);
const prompt = ref("");
const selectedWordCountRange = ref(DEFAULT_WORD_COUNT_RANGE);
const selectedOutline = ref<GeneratedOutline | null>(null);

// Draft state
const savedDraft = ref<{
  prompt: string;
  templateId: string | null;
  timestamp: number;
  wordCountRange: string;
} | null>(null);

const showDraftMenu = ref(false);

// ============================================================
// Computed
// ============================================================

const isProcessing = computed(
  () => isGenerating.value || isCreating.value
);

const combinedError = computed(
  () => generationError.value || projectCreateError.value
);

const canGenerate = computed(() => {
  if (wizardCompleted.value) return true;
  if (activeTab.value === "templates" && selectedTemplate.value) {
    return true;
  }
  if (activeTab.value === "custom") {
    return prompt.value.trim().length >= 10;
  }
  return false;
});

const MIN_PROMPT_LENGTH = 10;
const MAX_PROMPT_LENGTH = 2000;

const promptPreview = computed(() => {
  if (wizardCompleted.value && wizardData.value) {
    return buildPromptFromWizard(wizardData.value);
  }
  if (activeTab.value === "templates" && selectedTemplate.value) {
    return selectedTemplate.value.prompt;
  }
  return prompt.value;
});

const inputStatus = computed(() => {
  if (activeTab.value !== "custom") return null;
  const len = prompt.value.trim().length;
  if (len === 0) return { type: "empty", message: "" };
  if (len < MIN_PROMPT_LENGTH) {
    return {
      type: "insufficient",
      message: `还需 ${MIN_PROMPT_LENGTH - len} 个字符`,
      remaining: MIN_PROMPT_LENGTH - len,
    };
  }
  if (len >= MIN_PROMPT_LENGTH && len < 50) {
    return {
      type: "progress",
      message: "继续输入，让 AI 更好地理解你的想法",
      remaining: 0,
    };
  }
  if (len >= 50 && len < 100) {
    return { type: "good", message: "很好，已有足够信息", remaining: 0 };
  }
  return {
    type: "excellent",
    message: "非常详细，AI 将生成更精准的大纲",
    remaining: 0,
  };
});

const isPromptTooLong = computed(
  () => prompt.value.length > MAX_PROMPT_LENGTH
);

// ============================================================
// Methods
// ============================================================

// ID到中文名称的映射
const emotionGoalMap: Record<string, string> = {
  excitement: "热血沸腾",
  tears: "催人泪下",
  thrill: "紧张刺激",
  sweet: "甜蜜心动",
  laugh: "轻松搞笑",
  shock: "震惊反转",
  comfort: "治愈温暖",
  anger: "义愤填膺",
};

const genreMap: Record<string, string> = {
  urban: "都市",
  fantasy: "玄幻",
  xianxia: "仙侠",
  romance: "言情",
  "sci-fi": "科幻",
  mystery: "悬疑",
  horror: "悬疑/惊悚",
  historical: "历史",
  game: "游戏",
  sports: "体育",
  competition: "都市/职场",
};

const worldTypeMap: Record<string, string> = {
  urban: "都市",
  ancient: "古代",
  xianxia: "修仙界",
  fantasy: "异世界",
  scifi: "未来/星际",
  historical: "历史",
};

const powerSystemMap: Record<string, string> = {
  cultivation: "修炼体系",
  system: "系统流",
  martial: "武学体系",
  magic: "魔法体系",
  tech: "科技力量",
  none: "无特殊体系",
};

const goldenFingerMap: Record<string, string> = {
  system: "系统",
  inheritance: "传承",
  bloodline: "血脉",
  knowledge: "知识",
  space: "随身空间",
  other: "其他",
};

const protagonistTypeMap: Record<string, string> = {
  underdog: "废柴逆袭",
  talent: "天才崛起",
  transmigrator: "穿越者",
  reborn: "重生者",
  chosen: "天选之人",
  opportunist: "老硬币",
};

const rhythmTypeMap: Record<string, string> = {
  single: "单点爽",
  combo: "连击爽",
  cascade: "瀑布爽",
};

const coolPointMap: Record<string, string> = {
  "face-slapping": "打脸爽",
  "show-off": "装逼爽",
  "identity-reveal": "身份揭秘",
  "growth": "成长突破",
  "rescue": "英雄救美",
  "treasure": "寻宝获宝",
  "breakthrough": "境界突破",
  "romance": "甜蜜恋爱",
  "revenge": "复仇快感",
  "mystery-reveal": "谜题揭开",
  "comedy": "搞笑逗比",
  "justice": "伸张正义",
};

const hookMap: Record<string, string> = {
  cliffhanger: "悬念钩子",
  question: "疑问钩子",
  revelation: "揭秘钩子",
  conflict: "冲突钩子",
  tension: "紧张钩子",
  choice: "抉择钩子",
  mystery: "神秘钩子",
  emotional: "情感钩子",
  action: "行动钩子",
};

function buildPromptFromWizard(data: WizardData): string {
  const parts: string[] = [];

  // Emotion and Genre - 使用中文名称
  if (data.emotionGenre.emotionGoals.length > 0) {
    const emotionNames = data.emotionGenre.emotionGoals
      .map(id => emotionGoalMap[id] || id)
      .join("、");
    parts.push(`【情绪目标】${emotionNames}`);
  }
  if (data.emotionGenre.genres.length > 0) {
    const genreNames = data.emotionGenre.genres
      .map(id => genreMap[id] || id)
      .join("、");
    parts.push(`【题材类型】${genreNames}`);
  }

  // Core Setting - 使用中文名称
  if (data.coreSetting.worldType) {
    const worldName = worldTypeMap[data.coreSetting.worldType] || data.coreSetting.worldType;
    parts.push(`【世界类型】${worldName}`);
  }
  if (data.coreSetting.powerSystem) {
    const powerName = powerSystemMap[data.coreSetting.powerSystem] || data.coreSetting.powerSystem;
    parts.push(`【力量体系】${powerName}`);
  }
  if (data.coreSetting.goldenFinger) {
    const gfName = goldenFingerMap[data.coreSetting.goldenFinger] || data.coreSetting.goldenFinger;
    parts.push(`【金手指】${gfName}`);
  }
  if (data.coreSetting.protagonistType) {
    const ptName = protagonistTypeMap[data.coreSetting.protagonistType] || data.coreSetting.protagonistType;
    parts.push(`【主角定位】${ptName}`);
  }
  if (data.coreSetting.mainConflict) {
    parts.push(`【核心冲突】${data.coreSetting.mainConflict}`);
  }

  // Cool Points - 使用中文名称
  if (data.coolPoint.coolPoints.length > 0) {
    const cpNames = data.coolPoint.coolPoints
      .map(cp => coolPointMap[cp] || cp);
    parts.push(`【核心爽点】${cpNames.join("、")}`);
  }
  if (data.coolPoint.rhythmType) {
    const rhythmName = rhythmTypeMap[data.coolPoint.rhythmType] || data.coolPoint.rhythmType;
    parts.push(`【爽点节奏】${rhythmName}`);
  }
  if (data.coolPoint.hooks.length > 0) {
    const hookNames = data.coolPoint.hooks
      .map(h => hookMap[h] || h);
    parts.push(`【章节钩子】${hookNames.join("、")}`);
  }
  if (data.coolPoint.customCoolPoints) {
    parts.push(`【自定义爽点】${data.coolPoint.customCoolPoints}`);
  }

  return parts.join("\n\n");
}

function selectTemplate(template: WritingTemplate) {
  selectedTemplate.value = template;
}

function switchTab(tab: ActiveTab) {
  activeTab.value = tab;
  if (tab === "wizard") {
    showWizard.value = true;
  }
}

async function handleWizardComplete(data: WizardData) {
  wizardData.value = data;
  wizardCompleted.value = true;

  // Auto-generate outlines
  await handleGenerateOutlines();
}

function handleWizardBack() {
  showWizard.value = false;
  activeTab.value = "templates";
}

async function handleGenerateOutlines() {
  if (!canGenerate.value) return;

  await generateOutlines(promptPreview.value, {
    wordCountRange: selectedWordCountRange.value,
  });

  if (generatedOutlines.value && generatedOutlines.value.length > 0) {
    clearDraft();
  }
}

function selectOutline(outline: GeneratedOutline) {
  selectedOutline.value = outline;
}

async function handleCreateProject() {
  if (!selectedOutline.value) return;
  await doCreateProject(selectedOutline.value);
}

function saveDraft() {
  const draft = {
    prompt: prompt.value,
    templateId: selectedTemplate.value?.id || null,
    timestamp: Date.now(),
    wordCountRange: selectedWordCountRange.value,
  };
  localStorage.setItem("quickStartDraft", JSON.stringify(draft));
  savedDraft.value = draft;
  showDraftMenu.value = false;
}

function loadDraft() {
  if (savedDraft.value) {
    prompt.value = savedDraft.value.prompt;
    if (savedDraft.value.templateId) {
      selectedTemplate.value =
        writingTemplates.find((t) => t.id === savedDraft.value?.templateId) ||
        null;
    }
    activeTab.value = savedDraft.value.templateId ? "templates" : "custom";
  }
  showDraftMenu.value = false;
}

function clearDraft() {
  localStorage.removeItem("quickStartDraft");
  savedDraft.value = null;
}

// ============================================================
// Lifecycle
// ============================================================

onMounted(() => {
  const draft = localStorage.getItem("quickStartDraft");
  if (draft) {
    try {
      savedDraft.value = JSON.parse(draft);
    } catch (e) {
      console.error("Failed to parse saved draft:", e);
    }
  }
});

// ============================================================
// Writing Templates - 完整的创作模板数据
// ============================================================

export interface WritingTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: string;
  tags: string[];
  usageCount: number;
  rating: number;
  isHot?: boolean;
  isNew?: boolean;
  prompt: string;
  gradient: string;
  // 增强字段
  coreFormula?: string;        // 核心公式
  requiredElements?: string[]; // 必含元素
  rhythmAdvice?: string;      // 节奏建议
  antiTropes?: string[];      // 反套路要求
  structureTemplate?: string;  // 结构模板
}

const writingTemplates: WritingTemplate[] = [
  // 玄幻仙侠类
  {
    id: "tpl-fan-waste",
    name: "废物流逆袭",
    icon: "💫",
    description: "资质平凡的主角获得金手指，一路逆袭打脸各路天才，在修炼世界中崛起",
    category: "玄幻仙侠",
    tags: ["废柴", "逆袭", "打脸", "升级"],
    usageCount: 12580,
    rating: 4.8,
    isHot: true,
    prompt: `请根据以下模板生成一个废物流逆袭的玄幻小说大纲。

## 【核心公式】
起点：废材困境 + 退婚/打压事件
转折：获得金手指（系统/传承/血脉）
中期：打脸嘲讽者 + 势力崛起
后期：对战大反派 + 身世揭秘
结局：登顶 + 飞升/称霸

## 【必含元素】
- [ ] 退婚/被羞辱的开局事件
- [ ] 金手指激活的第一个任务
- [ ] 打脸第一个嘲讽者
- [ ] 第一个异性好感角色
- [ ] 反派报复事件
- [ ] 势力/宗门加入事件
- [ ] 第一次越级战斗
- [ ] 身世伏笔埋设

## 【节奏建议】
- 前30章：建立困境 + 金手指激活
- 30-100章：新手村成长 + 第一次大规模打脸
- 100-200章：势力崛起 + 宗门大比
- 200章后：地图扩展 + 更强敌人

## 【反套路要求】
- 不要让主角一直隐藏实力
- 不要让反派愚蠢到无底线
- 给配角合理的智商和反应

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 主角设定（起点状态、金手指、性格）
3. 主要配角（至少3个，含反派）
4. 世界观要点（力量体系、地图层级）
5. 分卷大纲（3-5卷，含章节范围和核心事件）
6. 核心爽点列表（至少5个）
7. 伏笔规划（至少3个，标明埋设和回收时机）`,
    gradient: "from-indigo-500 to-purple-600",
    coreFormula: "废材困境 → 金手指激活 → 打脸升级 → 势力崛起 → 地图扩展 → 终极对决",
    requiredElements: ["退婚/打压开局", "金手指激活", "打脸嘲讽者", "宗门加入", "越级战斗", "身世揭秘"],
    rhythmAdvice: "前30章密集打脸，中期每卷一个大规模爽点，后期大高潮间隔拉长但力度更强",
    antiTropes: ["主角全程隐藏实力", "反派无脑送人头", "所有女性倒贴主角"],
    structureTemplate: "三层结构：骨架（起承转合）→ 分卷（每卷小高潮）→ 章节（每3-5章小爽点）"
  },
  {
    id: "tpl-fan-honghuang",
    name: "洪荒崛起",
    icon: "🌋",
    description: "穿越到洪荒世界，与盘古女娲等上古大能争锋，建立势力征战诸天万界",
    category: "玄幻仙侠",
    tags: ["洪荒", "穿越", "势力", "诸天"],
    usageCount: 8932,
    rating: 4.7,
    isHot: true,
    prompt: `请根据以下模板生成一个洪荒背景的小说大纲。

## 【核心公式】
穿越：现代人带着知识/系统穿越到洪荒世界
崛起：通过先知先觉获得机缘，收服弟子建立势力
争锋：与上古大能（盘古/女娲/三清等）产生关联或对抗
诸天：征战诸天万界，成为至高存在

## 【必含元素】
- [ ] 穿越开局与金手指设定
- [ ] 洪荒世界的基础设定（天道/地道/人道）
- [ ] 主要上古大能的出场安排
- [ ] 势力建立与扩张
- [ ] 资源争夺（灵宝/灵根/气运）
- [ ] 因果纠缠与宿命对决
- [ ] 诸天征战的宏大场景

## 【节奏建议】
- 前期：熟悉洪荒规则 + 获得机缘 + 收服追随者
- 中期：建立势力 + 与大能交锋 + 获得气运
- 后期：诸天征战 + 对战天道级存在 + 超脱

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 主角设定（穿越身份、金手指、修炼方向）
3. 世界观设定（力量体系、势力分布、地图层级）
4. 主要人物（至少5个，含上古大能）
5. 分卷大纲（按地图/境界划分，3-5卷）
6. 核心势力关系图
7. 关键机缘清单（灵宝/灵根/功法）
8. 伏笔规划（至少3个贯穿全文的伏笔）`,
    gradient: "from-amber-500 to-red-600",
    coreFormula: "穿越洪荒 → 先知先觉 → 收服追随者 → 建立势力 → 诸天征战 → 超脱天道",
    requiredElements: ["穿越开局", "先知先觉", "上古大能关联", "势力建立", "诸天征战"],
    rhythmAdvice: "前期以机缘争夺为主，中期以势力对抗为主，后期以天道对决为主",
    antiTropes: ["开局无敌秒杀一切", "所有大能都友善", "无代价获得机缘"],
    structureTemplate: "地图式结构：按诸天层级划分势力范围，每层有不同势力和机缘"
  },
  {
    id: "tpl-fan-sword",
    name: "剑道至尊",
    icon: "⚔️",
    description: "以剑证道，一剑破万法。主角专注剑道，在宗门大比和遗迹探险中声名鹊起",
    category: "玄幻仙侠",
    tags: ["剑修", "热血", "宗门", "大比"],
    usageCount: 6543,
    rating: 4.6,
    prompt: `请根据以下模板生成一个剑道修仙小说大纲。

## 【核心公式】
剑心：专注剑道，以剑证道
修炼：剑意提升，剑招精进
战斗：剑道对决，剑气纵横
崛起：宗门大比，遗迹探险
登顶：一剑破万法，剑道至尊

## 【剑道文核心要素】
- [ ] 剑道体系的设定（剑意/剑气/剑招）
- [ ] 剑心/剑道的修炼方式
- [ ] 剑修与其他修士的差异
- [ ] 剑意觉醒的契机
- [ ] 剑道战斗的描写

## 【必含元素】
- [ ] 剑道传承的获得
- [ ] 剑意觉醒事件
- [ ] 宗门大比的战斗
- [ ] 剑道对手的设定
- [ ] 遗迹探险的机缘
- [ ] 剑道进阶的关键
- [ ] 终极剑道的追求

## 【节奏建议】
- 前期：剑道入门 + 剑意觉醒 + 宗门大比
- 中期：剑道精进 + 遗迹探险 + 对手交锋
- 后期：剑道巅峰 + 终极对决 + 剑道至尊

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 剑道体系设定
3. 主角设定（剑道传承/剑心）
4. 关键剑道技能
5. 宗门设定
6. 主要对手（剑道天才）
7. 分卷大纲（3-5卷）
8. 经典剑战场景
9. 伏笔设计`,
    gradient: "from-slate-500 to-gray-700",
    coreFormula: "剑道传承 → 剑意觉醒 → 宗门大比 → 剑道精进 → 遗迹机缘 → 终极对决",
    requiredElements: ["剑道传承", "剑意觉醒", "宗门大比", "遗迹探险", "剑道对决"],
    rhythmAdvice: "剑战描写要精彩，每场战斗要有不同看点，剑意进阶要配合大场面",
    antiTropes: ["剑道无脑碾压", "敌人不堪一击", "剑意领悟无代价"],
    structureTemplate: "剑道进阶结构：按剑道境界分卷，每卷有核心剑战和境界突破"
  },
  {
    id: "tpl-fan-urban",
    name: "都市修仙",
    icon: "🌃",
    description: "灵气复苏时代，主角在现代都市中修仙，揭开都市隐藏的灵异世界",
    category: "玄幻仙侠",
    tags: ["都市", "灵气复苏", "修仙", "都市传说"],
    usageCount: 11234,
    rating: 4.9,
    isHot: true,
    isNew: true,
    prompt: `请根据以下模板生成一个都市修仙小说大纲。

## 【核心公式】
灵气复苏：现代都市出现灵气，修仙成为可能
发现：主角发现隐藏的灵异世界
修炼：利用灵气走上修仙之路
斗争：都市势力和灵异存在的冲突
融合：修仙与都市生活的平衡

## 【都市修仙核心要素】
- [ ] 灵气复苏的契机
- [ ] 现代都市与修仙的冲突
- [ ] 隐藏势力（宗门/家族/灵异存在）
- [ ] 都市生活的日常
- [ ] 力量体系的设定

## 【必含元素】
- [ ] 灵气复苏的发现
- [ ] 第一个修炼机缘
- [ ] 隐藏势力的出场
- [ ] 都市与修炼的冲突
- [ ] 日常生活场景
- [ ] 灵异事件处理
- [ ] 感情的展开
- [ ] 终极秘密的揭露

## 【节奏建议】
- 前期：灵气发现 + 初步修炼 + 隐藏势力
- 中期：势力冲突 + 灵异事件 + 能力提升
- 后期：终极秘密 + 都市危机 + 圆满

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 灵气复苏设定
3. 力量体系设计
4. 隐藏势力格局
5. 主角设定
6. 分卷大纲（3卷）
7. 都市日常设计
8. 灵异事件清单`,
    gradient: "from-cyan-500 to-blue-600",
    coreFormula: "灵气复苏 → 发现隐藏世界 → 修炼崛起 → 势力冲突 → 揭开秘密",
    requiredElements: ["灵气复苏", "隐藏势力", "都市日常", "灵异事件", "修炼体系"],
    rhythmAdvice: "都市日常和修炼冲突要平衡，灵异事件要有趣味性",
    antiTropes: ["一路碾压隐藏势力", "都市无脑被欺负", "修炼无代价"],
    structureTemplate: "双线结构：都市线和修仙线并行，交替推进"
  },
  {
    id: "tpl-fan-system",
    name: "系统修仙",
    icon: "🎮",
    description: "主角获得逆天系统，完成任务获取修为资源，在修仙界横着走",
    category: "玄幻仙侠",
    tags: ["系统流", "升级", "爽文", "任务"],
    usageCount: 9876,
    rating: 4.8,
    isHot: true,
    prompt: `请根据以下模板生成一个系统流修仙小说大纲。

## 【核心公式】
开局：获得系统 → 第一个任务 → 激活功能
中期：完成任务 → 获得奖励 → 实力提升 → 触发新任务
后期：系统升级 → 解锁高级功能 → 挑战更强敌人

## 【系统设计要点】
- [ ] 系统的功能要有成长性和多样性
- [ ] 任务设计要有挑战性和趣味性
- [ ] 奖励要分为主动奖励和随机奖励
- [ ] 系统要有独特个性（吐槽型/高冷型/辅助型）

## 【必含元素】
- [ ] 系统激活的契机
- [ ] 第一个新手任务
- [ ] 系统商店/抽奖机制
- [ ] 任务失败惩罚设计
- [ ] 系统升级机制
- [ ] 隐藏功能解锁
- [ ] 系统与主线的关联

## 【节奏建议】
- 前20章：熟悉系统功能 + 快速升级
- 20-100章：任务驱动剧情 + 能力展示
- 100-200章：系统升级 + 解锁隐藏功能
- 200章后：系统成为核心爽点来源

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 系统设定（功能、外观、人格）
3. 主角设定（金手指、能力树）
4. 任务体系设计
5. 奖励机制设计
6. 分卷大纲（3-5卷）
7. 核心爽点列表
8. 伏笔规划（系统身世之谜等）`,
    gradient: "from-violet-500 to-purple-600",
    coreFormula: "获得系统 → 新手任务 → 奖励获取 → 实力提升 → 新任务解锁 → 系统升级",
    requiredElements: ["系统激活", "新手任务", "商店机制", "任务体系", "系统升级", "隐藏功能"],
    rhythmAdvice: "每10-20章完成一个系统里程碑，新功能解锁要配合大场面展示",
    antiTropes: ["系统全程无敌碾压", "任务无惩罚无代价", "系统无脑送装备"],
    structureTemplate: "任务驱动结构：每个任务构成一个完整故事弧，任务之间穿插日常和支线"
  },

  // 都市言情类
  {
    id: "tpl-rom-sweet",
    name: "甜宠总裁",
    icon: "💕",
    description: "霸道总裁与女主甜蜜互宠，从误会到相知相爱，上演各种甜蜜名场面",
    category: "都市言情",
    tags: ["总裁", "甜宠", "误会", "HE"],
    usageCount: 15678,
    rating: 4.9,
    isHot: true,
    prompt: `请根据以下模板生成一个甜宠总裁文大纲。

## 【核心公式】
邂逅：豪门总裁与普通人女主意外相遇
冲突：身份差距 + 误解 + 旁人阻挠
发展：甜蜜互动 + 互相试探 + 关系升温
高潮：身份揭秘/误会解除 + 真心告白
结局：幸福在一起 + 圆满收尾

## 【爱情线四阶段】
1. 萍水相逢：初次相遇，建立第一印象（用差异评价制造张力）
2. 爱情喜剧：被迫/偶然频繁接触，甜蜜互动为主（试探阶段是核心，占30-50%剧情）
3. 爱隔山海：外部压力/身份真相/误会将两人分开（烈度高）
4. 大结局：克服最大阻碍，在一起（专注发糖）

## 【必含元素】
- [ ] 初次相遇的戏剧性场景
- [ ] 男主的霸道/傲娇表现
- [ ] 女主的独立/可爱特质
- [ ] 甜到掉牙的互动场景（至少5个）
- [ ] 误会和吃醋情节
- [ ] 身份/身世揭秘
- [ ] 真心告白名场面
- [ ] 完美结局

## 【节奏建议】
- 前期：邂逅 + 互相看不顺眼 + 甜蜜萌芽
- 中期：频繁接触 + 误会 + 吃醋 + 感情升温
- 后期：危机/误会 + 分离 + 真心告白 + 在一起

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 人物设定（男女主性格、职业、背景）
3. 关系发展线（从相识到相爱的关键节点）
4. 关键场景设计（至少5个甜蜜名场面）
5. 误会/冲突设计（至少3个）
6. 分卷大纲（3卷）
7. 甜点清单（按章节分布）`,
    gradient: "from-pink-500 to-rose-600",
    coreFormula: "邂逅 → 冲突 → 试探 → 升温 → 危机 → 解密 → 表白 → 圆满",
    requiredElements: ["霸道总裁人设", "女主独立特质", "甜蜜互动", "误会吃醋", "真心告白", "圆满结局"],
    rhythmAdvice: "试探阶段占全文30-50%，酸甜交替，误会解除要快，发糖要足",
    antiTropes: ["男主全程冷血", "女主傻白甜无脑", "无底线误会拖剧情"],
    structureTemplate: "感情线驱动结构：按关系阶段分卷，每阶段有核心冲突和甜蜜场景"
  },
  {
    id: "tpl-rom-reborn",
    name: "重生复仇",
    icon: "⏰",
    description: "女主重生回到过去，弥补上一世遗憾，对付渣男绿茶，走上人生巅峰",
    category: "都市言情",
    tags: ["重生", "复仇", "豪门", "爽文"],
    usageCount: 9876,
    rating: 4.7,
    isHot: true,
    prompt: `请根据以下模板生成一个重生复仇小说大纲。

## 【核心公式】
重生：带着前世记忆回到过去
复仇：对付渣男绿茶、讨回公道
崛起：利用先知优势改变命运
收获：事业爱情双丰收

## 【重生文核心要素】
- [ ] 重生节点的明确
- [ ] 前世遗憾的具体呈现
- [ ] 先知优势的使用方式
- [ ] 复仇手段的设计
- [ ] 命运的改变轨迹

## 【必含元素】
- [ ] 重生开局的戏剧性
- [ ] 前世悲剧的回顾（闪回/对话）
- [ ] 渣男/绿茶的反派设定
- [ ] 复仇计划的设计
- [ ] 利用先知优势获取资源
- [ ] 打脸渣男绿茶的爽点
- [ ] 新感情线的展开
- [ ] 事业线的崛起

## 【节奏建议】
- 前期：重生适应 + 复仇计划 + 初步反击
- 中期：渣男绿茶被打脸 + 事业起步 + 新感情萌芽
- 后期：终极对决 + 彻底胜利 + 圆满结局

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 前世悲剧概述
3. 主角重生后的优势利用
4. 反派设定（渣男/绿茶的性格和结局）
5. 复仇计划清单
6. 感情线设计
7. 事业线设计
8. 分卷大纲（3卷）
9. 打脸爽点清单`,
    gradient: "from-slate-600 to-gray-700",
    coreFormula: "重生 → 先知优势 → 复仇计划 → 打脸渣男 → 改变命运 → 圆满人生",
    requiredElements: ["重生开局", "前世悲剧", "渣男绿茶设定", "复仇计划", "先知优势", "打脸爽点"],
    rhythmAdvice: "打脸渣男要密集，前期小打脸中期大打脸，后期终极对决",
    antiTropes: ["渣男无脑愚蠢", "女主无脑冲动", "重生后开挂无敌"],
    structureTemplate: "复仇驱动结构：按复仇阶段分卷，每卷有核心打脸目标和事业/感情收获"
  },
  {
    id: "tpl-rom-mask",
    name: "马甲大佬",
    icon: "🎭",
    description: "女主隐藏身份，男主发现后追妻火葬场，各种身份反转让人目不暇接",
    category: "都市言情",
    tags: ["马甲", "追妻", "身份", "反转"],
    usageCount: 8234,
    rating: 4.6,
    prompt: `请根据以下模板生成一个马甲文大纲。

## 【核心公式】
马甲：女主隐藏真实身份
反差：表面身份与真实身份的巨大差异
发现：男主发现马甲
追妻：男主追妻火葬场
反转：各种身份反转的爽点

## 【马甲文核心要素】
- [ ] 女主的多重身份设定
- [ ] 马甲的精彩展示
- [ ] 男主发现的契机
- [ ] 追妻火葬场的设定
- [ ] 身份反转的爽点设计

## 【必含元素】
- [ ] 第一个马甲的展示
- [ ] 男主被震惊的场面
- [ ] 追妻火葬场的拉扯
- [ ] 身份反转的爽点
- [ ] 马甲掉落的危机
- [ ] 最终身份公开

## 【节奏建议】
- 前期：马甲隐藏 + 男主发现
- 中期：追妻火葬场 + 拉扯
- 后期：身份反转 + 圆满

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 女主多重身份设计
3. 男主设定
4. 发现契机
5. 分卷大纲（3卷）
6. 马甲展示清单
7. 追妻场景设计`,
    gradient: "from-amber-500 to-orange-600",
    coreFormula: "马甲隐藏 → 男主发现 → 追妻火葬场 → 身份反转 → 圆满",
    requiredElements: ["马甲设计", "发现契机", "追妻火葬场", "身份反转"],
    rhythmAdvice: "马甲展示要精彩，追妻火葬场要虐但不能太长",
    antiTropes: ["马甲一次性全掉", "追妻无限拖"],
    structureTemplate: "身份反转结构：按马甲揭露层级分卷"
  },
  {
    id: "tpl-rom-campus",
    name: "校园暗恋",
    icon: "🌸",
    description: "校花学霸与男神的校园故事，暗恋追求、青梅竹马，甜蜜青春校园时光",
    category: "都市言情",
    tags: ["校园", "暗恋", "学霸", "青春"],
    usageCount: 7654,
    rating: 4.5,
    isNew: true,
    prompt: `请根据以下模板生成一个校园暗恋小说大纲。

## 【核心公式】
暗恋：甜蜜酸涩的暗恋时光
追求：从暗恋到表白的过程
青梅：青梅竹马的校园恋情
成长：共同进步的青春岁月
甜蜜：校园恋爱的美好回忆

## 【校园文核心要素】
- [ ] 校园场景的真实性
- [ ] 暗恋的心理描写
- [ ] 追求的过程设计
- [ ] 学业与感情的平衡
- [ ] 青春的悸动和美好

## 【必含元素】
- [ ] 初次相遇的怦然心动
- [ ] 暗恋的小心思和试探
- [ ] 表白的场景设计
- [ ] 校园活动的参与
- [ ] 竞争对手的出现
- [ ] 感情的误会与和解
- [ ] 甜蜜的校园互动
- [ ] 共同的成长和进步

## 【节奏建议】
- 前期：相识 + 暗恋萌芽 + 小心试探
- 中期：追求 + 感情升温 + 小波折
- 后期：表白 + 在一起 + 甜蜜日常

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 男女主设定（性格、特点、背景）
3. 暗恋/追求过程设计
4. 关键甜蜜场景（至少5个）
5. 误会设计
6. 分卷大纲（3卷）
7. 校园活动清单`,
    gradient: "from-pink-400 to-rose-500",
    coreFormula: "相识 → 暗恋 → 追求 → 表白 → 甜蜜 → 成长",
    requiredElements: ["校园场景", "暗恋心思", "追求过程", "甜蜜互动", "共同成长"],
    rhythmAdvice: "暗恋阶段要细腻，追求过程要有起伏，甜蜜场景要真实",
    antiTropes: ["无脑倒追", "误会无底线", "学霸人设崩塌"],
    structureTemplate: "感情线驱动：按暗恋→追求→在一起分阶段，每阶段有核心事件"
  },

  // 历史穿越类
  {
    id: "tpl-his-palace",
    name: "宫墙之内",
    icon: "👑",
    description: "女主穿越到古代皇宫，与各路妃嫔斗智斗勇，最终获得帝王宠爱登上后位",
    category: "历史穿越",
    tags: ["宫斗", "穿越", "权谋", "皇帝"],
    usageCount: 11234,
    rating: 4.7,
    isHot: true,
    prompt: `请根据以下模板生成一个宫斗小说大纲。

## 【核心公式】
穿越：现代人带着智慧穿越到古代皇宫
斗智：与各路妃嫔斗智斗勇
争宠：获得帝王宠爱
权谋：后宫与前朝的政治斗争
结局：登上后位或获得真爱

## 【宫斗文核心要素】
- [ ] 后宫势力格局设定
- [ ] 皇帝的性格和喜好
- [ ] 女主独特优势的运用
- [ ] 妃嫔之间的派系斗争
- [ ] 权谋与感情的平衡

## 【必含元素】
- [ ] 穿越到皇宫的契机
- [ ] 后宫势力格局展示
- [ ] 与主要妃嫔的对决（至少3场）
- [ ] 皇帝的宠爱
- [ ] 前朝政治牵连
- [ ] 危机与反转
- [ ] 最终的胜利
- [ ] 感情的归宿

## 【节奏建议】
- 前期：适应环境 + 初步交锋 + 获得宠爱
- 中期：深入斗争 + 派系对抗 + 感情升温
- 后期：终极对决 + 权力巅峰 + 圆满

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 女主设定（穿越身份、技能优势）
3. 后宫势力格局
4. 皇帝设定
5. 主要对手（至少3个妃嫔）
6. 分卷大纲（3卷）
7. 经典对决场景设计
8. 权谋设计
9. 伏笔规划`,
    gradient: "from-red-500 to-rose-600",
    coreFormula: "穿越皇宫 → 适应环境 → 初步斗争 → 获得宠爱 → 深入权谋 → 终极对决 → 圆满",
    requiredElements: ["后宫格局", "妃嫔对决", "皇帝宠爱", "权谋设计", "感情线"],
    rhythmAdvice: "每卷至少2场大型对决，危机设计要出人意料，胜利要合理",
    antiTropes: ["女主无脑送人头", "妃嫔全部愚蠢", "皇帝专一痴情"],
    structureTemplate: "宫斗驱动结构：按权力层级分阶段，每阶段有核心对手和危机设计"
  },
  {
    id: "tpl-his-prince",
    name: "王爷宠妃",
    icon: "🕊️",
    description: "穿越女与王爷相遇，从欢喜冤家到甜蜜相爱，共谱穿越古言佳话",
    category: "历史穿越",
    tags: ["穿越", "王爷", "甜宠", "古风"],
    usageCount: 9876,
    rating: 4.8,
    prompt: `请根据以下模板生成一个穿越古言小说大纲。

## 【核心公式】
穿越：现代人带着智慧穿越到古代
邂逅：意外与王爷相遇
冤家：从互相看不顺眼到暗生情愫
权谋：卷入宫廷/王府的斗争
甜蜜：各种甜蜜互动
结局：真爱圆满

## 【古言穿越核心要素】
- [ ] 现代知识在古代的运用
- [ ] 王爷的性格设定
- [ ] 欢喜冤家的互动设计
- [ ] 权谋斗争的穿插
- [ ] 感情的发展递进

## 【必含元素】
- [ ] 穿越到古代的契机
- [ ] 与王爷的初次相遇
- [ ] 欢喜冤家的互怼日常
- [ ] 宫廷/王府的斗争
- [ ] 真情流露的时刻
- [ ] 误会与和解
- [ ] 真心告白
- [ ] 圆满结局

## 【节奏建议】
- 前期：穿越适应 + 相识互怼
- 中期：情愫暗生 + 权谋斗争
- 后期：感情明确 + 圆满

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 女主设定（现代技能、性格）
3. 王爷设定（性格、背景）
4. 权谋设计
5. 分卷大纲（3卷）
6. 甜蜜互动场景清单`,
    gradient: "from-pink-400 to-rose-500",
    coreFormula: "穿越 → 相识 → 冤家 → 情愫 → 权谋 → 真心 → 圆满",
    requiredElements: ["现代知识", "王爷人设", "欢喜冤家", "权谋斗争", "甜蜜互动"],
    rhythmAdvice: "冤家互怼要精彩有趣，权谋要恰到好处不喧宾夺主",
    antiTropes: ["女主无脑金手指", "王爷无理由宠爱", "权谋过于复杂"],
    structureTemplate: "感情线+权谋线并行：感情线推动故事，权谋线制造波折"
  },
  {
    id: "tpl-his-family",
    name: "宅斗风云",
    icon: "🏠",
    description: "穿越到世家大族，与各房斗智斗勇，带领家族走向辉煌",
    category: "历史穿越",
    tags: ["宅斗", "穿越", "家族", "逆袭"],
    usageCount: 6543,
    rating: 4.6,
    prompt: `请根据以下模板生成一个宅斗小说大纲。

## 【核心公式】
穿越：现代人穿越到世家大族
困境：面临家族内部斗争
斗智：与各房斗智斗勇
崛起：带领家族走向辉煌
结局：家族兴旺，个人圆满

## 【宅斗文核心要素】
- [ ] 家族势力格局设定
- [ ] 各房人物的性格和目的
- [ ] 宅斗的手段和智慧
- [ ] 家族利益与个人感情的平衡
- [ ] 家族崛起的目标

## 【必含元素】
- [ ] 穿越到家族的契机
- [ ] 家族势力格局展示
- [ ] 与各房的智谋较量
- [ ] 获得家主/长辈支持
- [ ] 家族内部的危机
- [ ] 对外扩张的机缘
- [ ] 带领家族崛起
- [ ] 家族圆满

## 【节奏建议】
- 前期：适应环境 + 初步交锋
- 中期：深入斗争 + 获得支持
- 后期：家族崛起 + 圆满

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 女主设定（现代技能、性格）
3. 家族势力格局
4. 各房人物设定
5. 分卷大纲（3卷）
6. 宅斗精彩场景
7. 家族发展线`,
    gradient: "from-amber-500 to-orange-600",
    coreFormula: "穿越 → 适应 → 宅斗 → 崛起 → 家族辉煌",
    requiredElements: ["家族格局", "各房人物", "宅斗智慧", "家族发展"],
    rhythmAdvice: "宅斗要精彩，每场斗争要有不同看点",
    antiTropes: ["无脑送人头", "各房全部愚蠢", "家族无脑内斗"],
    structureTemplate: "家族发展线+宅斗线并行：宅斗推动家族发展"
  },

  // 科幻星际类
  {
    id: "tpl-sci-stellar",
    name: "星际领主",
    icon: "🚀",
    description: "建立星际帝国，征服星辰大海。主角在星际时代建立势力，成为一代霸主",
    category: "科幻星际",
    tags: ["星际", "领主", "战争", "科幻"],
    usageCount: 7654,
    rating: 4.5,
    prompt: `请根据以下模板生成一个星际科幻小说大纲。

## 【核心公式】
开局：星际时代的机遇
崛起：建立势力和舰队
征战：征服星际、建立帝国
科技：科技升级和装备更新
终极：成为星际霸主

## 【星际领主核心要素】
- [ ] 星际世界观设定
- [ ] 势力格局和种族设定
- [ ] 舰队和战斗系统
- [ ] 资源采集和经济发展
- [ ] 科技升级体系

## 【必含元素】
- [ ] 星际时代的开局设定
- [ ] 第一个势力的建立
- [ ] 星际战斗场景
- [ ] 科技升级
- [ ] 势力扩张
- [ ] 终极敌人
- [ ] 星际帝国建立

## 【节奏建议】
- 前期：势力建立 + 初步扩张
- 中期：星际战争 + 科技升级
- 后期：终极征服 + 帝国建立

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 世界观设定
3. 势力格局
4. 舰队/战斗系统
5. 科技体系
6. 分卷大纲（3-5卷）`,
    gradient: "from-cyan-500 to-blue-600",
    coreFormula: "星际时代 → 势力建立 → 舰队扩张 → 星际征战 → 帝国称霸",
    requiredElements: ["星际世界观", "势力格局", "舰队战斗", "科技升级"],
    rhythmAdvice: "战争场面要宏大，科技升级要配合战略展示",
    antiTropes: ["一路无敌碾压", "科技无代价获取", "敌人无脑送"],
    structureTemplate: "势力扩张结构：按征服层级分卷，每卷有核心战役"
  },
  {
    id: "tpl-sci-cyber",
    name: "赛博朋克",
    icon: "🤖",
    description: "高科技低生活的赛博世界，主角作为黑客在夹缝中生存，追求自由与真相",
    category: "科幻星际",
    tags: ["赛博", "黑客", "机械", "都市"],
    usageCount: 5432,
    rating: 4.4,
    isNew: true,
    prompt: `请根据以下模板生成一个赛博朋克小说大纲。

## 【核心公式】
低生活：高科技下的底层生存
黑客：主角作为黑客的能力
真相：追寻社会的真相
自由：追求个人解放
革命：对抗大公司/体制

## 【赛博朋克核心要素】
- [ ] 高科技低生活的世界观
- [ ] 大公司/财团的统治
- [ ] 义体改造和机械设定
- [ ] 黑客技术的展示
- [ ] 反乌托邦的氛围

## 【必含元素】
- [ ] 赛博朋克世界观展示
- [ ] 主角黑客身份的设定
- [ ] 第一次黑客行动
- [ ] 大公司的阴谋揭露
- [ ] 义体改造
- [ ] 反抗组织的出现
- [ ] 终极真相的追寻

## 【节奏建议】
- 前期：黑客行动 + 真相初现
- 中期：阴谋深入 + 反抗崛起
- 后期：终极对决 + 追求自由

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 世界观设定
3. 大公司/财团设定
4. 黑客技术设定
5. 义体系统
6. 分卷大纲（3卷）`,
    gradient: "from-violet-600 to-purple-700",
    coreFormula: "赛博世界 → 黑客身份 → 真相追寻 → 反抗崛起 → 追求自由",
    requiredElements: ["赛博世界观", "大公司设定", "黑客技术", "义体改造", "反乌托邦"],
    rhythmAdvice: "黑客行动要精彩，世界观要阴暗压抑",
    antiTropes: ["黑客无代价入侵", "义体无限升级", "公司无脑弱"],
    structureTemplate: "真相揭露结构：按阴谋层级分卷，逐步揭露深层真相"
  },
  {
    id: "tpl-sci-apocalypse",
    name: "末世生存",
    icon: "☢️",
    description: "末日降临，主角在废土中挣扎求存，建立势力寻找人类最后的希望",
    category: "科幻星际",
    tags: ["末世", "废土", "生存", "异能"],
    usageCount: 6789,
    rating: 4.6,
    isHot: true,
    prompt: `请根据以下模板生成一个末世生存小说大纲。

## 【核心公式】
末日：天灾/病毒/灾难降临
生存：在废土中挣扎求存
异能：主角觉醒特殊能力
势力：建立自己的势力
希望：寻找人类最后的希望

## 【末世核心要素】
- [ ] 末世的成因和世界观
- [ ] 废土环境的设定
- [ ] 异能的种类和代价
- [ ] 生存物资的争夺
- [ ] 势力的建立和发展

## 【必含元素】
- [ ] 末世降临的契机
- [ ] 废土生存的挑战
- [ ] 异能觉醒
- [ ] 第一个队友/伙伴
- [ ] 生存物资的争夺
- [ ] 势力的建立
- [ ] 终极希望的追寻

## 【节奏建议】
- 前期：末日适应 + 异能觉醒
- 中期：势力建立 + 生存挑战
- 后期：希望追寻 + 终极对决

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 末世成因设定
3. 废土世界观
4. 异能体系
5. 势力格局
6. 分卷大纲（3-5卷）`,
    gradient: "from-lime-500 to-green-600",
    coreFormula: "末世降临 → 废土求生 → 异能觉醒 → 势力建立 → 希望追寻",
    requiredElements: ["末世成因", "废土设定", "异能系统", "势力发展"],
    rhythmAdvice: "生存压力要持续，异能要有代价，势力发展要有挑战",
    antiTropes: ["异能无代价无限用", "物资取之不尽", "敌人全部送死"],
    structureTemplate: "生存扩张结构：按生存层级分卷，逐步扩大势力范围"
  },

  // 悬疑推理类
  {
    id: "tpl-mys-crime",
    name: "心理罪者",
    icon: "🔍",
    description: "犯罪心理学专家破解疑难案件，深入罪犯内心，揭开真相背后的秘密",
    category: "悬疑推理",
    tags: ["推理", "心理", "破案", "刑侦"],
    usageCount: 6789,
    rating: 4.8,
    prompt: `请根据以下模板生成一个推理小说大纲。

## 【核心公式】
破案：破解疑难刑事案件
心理：深入罪犯内心世界
推理：严密的逻辑推理
真相：揭开案件背后的真相
人性：探讨人性的黑暗与光明

## 【推理文核心要素】
- [ ] 案件的复杂程度设计
- [ ] 心理分析的独特视角
- [ ] 推理过程的展示
- [ ] 罪犯的心理画像
- [ ] 真相的多重反转

## 【必含元素】
- [ ] 第一个案件的引入
- [ ] 心理分析的过程
- [ ] 推理链条的展示
- [ ] 案件的连环设计
- [ ] 罪犯的心理动机
- [ ] 真相的揭露
- [ ] 主线悬念的推进

## 【节奏建议】
- 前期：案件引入 + 心理画像
- 中期：推理深入 + 反转
- 后期：真相揭露 + 主线推进

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 主角设定（心理学背景、性格）
3. 案件设计（至少3个独立案件）
4. 推理链条设计
5. 罪犯心理画像
6. 分卷大纲（3卷）`,
    gradient: "from-slate-500 to-gray-600",
    coreFormula: "案件 → 心理画像 → 推理链条 → 反转 → 真相揭露",
    requiredElements: ["案件设计", "心理分析", "推理展示", "多重反转"],
    rhythmAdvice: "推理要严密，反转要出人意料但合理",
    antiTropes: ["推理过于简单", "罪犯动机牵强", "主角开挂"],
    structureTemplate: "案件串联结构：每个案件独立成篇，通过主线串联"
  },
  {
    id: "tpl-mys-haunted",
    name: "灵异事务所",
    icon: "👻",
    description: "主角经营一家处理灵异事件的事务所，遇见各种超自然事件，揭开灵异真相",
    category: "悬疑推理",
    tags: ["灵异", "都市", "超自然", "探险"],
    usageCount: 6543,
    rating: 4.6,
    prompt: `请根据以下模板生成一个灵异小说大纲。

## 【核心公式】
事务所：专门处理灵异事件
案件：各种超自然事件
真相：揭开灵异背后的真相
成长：主角能力的提升
主线：贯穿全文的核心秘密

## 【灵异文核心要素】
- [ ] 事务所的设定
- [ ] 灵异事件的类型
- [ ] 主角能力的来源
- [ ] 灵异背后的世界观
- [ ] 主线秘密的设计

## 【必含元素】
- [ ] 事务所的开业
- [ ] 第一个灵异案件
- [ ] 灵异事件的处理
- [ ] 能力展示
- [ ] 主线秘密的铺垫
- [ ] 灵异世界观的揭露

## 【节奏建议】
- 前期：事务所建立 + 案件处理
- 中期：能力提升 + 主线深入
- 后期：真相揭露 + 终极对决

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 事务所设定
3. 灵异世界观
4. 主角能力设定
5. 案件设计（至少3个）
6. 分卷大纲（3卷）`,
    gradient: "from-gray-700 to-slate-800",
    coreFormula: "事务所 → 灵异案件 → 能力提升 → 真相揭露 → 终极对决",
    requiredElements: ["灵异设定", "案件设计", "能力来源", "主线秘密"],
    rhythmAdvice: "灵异事件要精彩吓人，主线秘密要持续拉悬念",
    antiTropes: ["灵异无代价解决", "能力无限制使用", "敌人无脑送死"],
    structureTemplate: "案件串联结构：每个灵异案件独立成篇，主线秘密贯穿全文"
  },

  // 游戏异世类
  {
    id: "tpl-game-holo",
    name: "全息游戏",
    icon: "🎮",
    description: "主角进入全息游戏世界，在虚拟与现实中穿梭，成为游戏中的传奇玩家",
    category: "游戏异世",
    tags: ["游戏", "全息", "虚拟现实", "穿越"],
    usageCount: 8765,
    rating: 4.7,
    isHot: true,
    prompt: `请根据以下模板生成一个全息游戏小说大纲。

## 【核心公式】
游戏：进入全息游戏世界
冒险：在虚拟世界中探索
现实：虚拟与现实的交织
成长：游戏中不断提升实力
传奇：成为游戏中的传奇

## 【全息游戏核心要素】
- [ ] 游戏世界的设定
- [ ] 全息游戏的独特机制
- [ ] 虚拟与现实的冲突
- [ ] 游戏中的成长体系
- [ ] 传奇玩家的养成

## 【必含元素】
- [ ] 游戏世界的开场
- [ ] 游戏机制的展示
- [ ] 第一次副本冒险
- [ ] 游戏中的势力
- [ ] 现实中的秘密
- [ ] 虚拟现实的交织
- [ ] 成为传奇玩家

## 【节奏建议】
- 前期：游戏熟悉 + 初步冒险
- 中期：势力崛起 + 虚拟现实交织
- 后期：传奇养成 + 终极挑战

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 游戏世界设定
3. 游戏机制设计
4. 成长体系
5. 势力格局
6. 分卷大纲（3卷）`,
    gradient: "from-violet-500 to-purple-600",
    coreFormula: "全息游戏 → 冒险成长 → 势力崛起 → 虚拟现实 → 传奇诞生",
    requiredElements: ["游戏世界", "游戏机制", "成长体系", "虚拟现实"],
    rhythmAdvice: "游戏冒险要精彩，现实秘密要持续拉悬念",
    antiTropes: ["游戏无代价通关", "现实秘密无关联", "玩家无脑强"],
    structureTemplate: "双线结构：游戏线和现实线并行，交替推进"
  },
  {
    id: "tpl-game-esports",
    name: "电竞冠军",
    icon: "🏆",
    description: "电竞选手的逆袭之路，从默默无闻到站上世界冠军领奖台的热血故事",
    category: "游戏异世",
    tags: ["电竞", "逆袭", "热血", "直播"],
    usageCount: 5432,
    rating: 4.5,
    isNew: true,
    prompt: `请根据以下模板生成一个电竞冠军小说大纲。

## 【核心公式】
电竞：电竞选手的职业生涯
逆袭：从草根到冠军的逆袭
热血：比赛的热血和激情
团队：队友的配合和羁绊
冠军：站上世界冠军的领奖台

## 【电竞文核心要素】
- [ ] 电竞项目的设定
- [ ] 选手的成长历程
- [ ] 比赛的热血描写
- [ ] 团队配合的设计
- [ ] 职业生涯的起伏

## 【必含元素】
- [ ] 电竞梦想的起源
- [ ] 第一次比赛
- [ ] 队友的集结
- [ ] 重要比赛的描写
- [ ] 低谷和挫折
- [ ] 团队配合的成长
- [ ] 世界冠军的冲刺

## 【节奏建议】
- 前期：梦想起源 + 初步成名
- 中期：职业发展 + 巅峰低谷
- 后期：冠军冲刺 + 圆满

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 电竞项目设定
3. 主角设定
4. 队友设定
5. 重要比赛设计
6. 分卷大纲（3卷）`,
    gradient: "from-indigo-500 to-blue-600",
    coreFormula: "电竞梦想 → 职业起步 → 团队成长 → 冠军冲刺 → 站上巅峰",
    requiredElements: ["电竞设定", "选手成长", "团队配合", "热血比赛"],
    rhythmAdvice: "比赛场面要热血，团队羁绊要感人",
    antiTropes: ["无代价获胜", "队友无存在感", "比赛无悬念"],
    structureTemplate: "职业生涯结构：按发展阶段分卷，每卷有核心比赛"
  },

  // 都市异能类
  {
    id: "tpl-urb-superhero",
    name: "都市兵王",
    icon: "🎖️",
    description: "神秘特种兵回归都市，曾经的战神守护亲人朋友，顺便收拾各路不长眼的",
    category: "都市异能",
    tags: ["兵王", "都市", "特种兵", "热血"],
    usageCount: 11234,
    rating: 4.8,
    isHot: true,
    prompt: `请根据以下模板生成一个都市兵王小说大纲。

## 【核心公式】
归来：战神回归都市，守护亲人
冲突：都市势力挑衅，战神随手解决
崛起：建立自己的势力网络
复仇：对付曾经的仇人
热血：各种战斗和热血场面

## 【兵王文核心要素】
- [ ] 战神身份的特殊技能展示
- [ ] 都市势力格局设定
- [ ] 亲情/友情线的重要性
- [ ] 战斗系统的设计
- [ ] 热血场面的安排

## 【必含元素】
- [ ] 战神归来的震撼出场
- [ ] 家人被欺负/保护的场景
- [ ] 第一场战斗展示实力
- [ ] 红颜知己的出场
- [ ] 兄弟情义的战友情
- [ ] 都市势力的挑衅
- [ ] 战神身份的秘密
- [ ] 最终决战

## 【节奏建议】
- 前期：回归震撼 + 家人保护 + 初步展示
- 中期：建立势力 + 战斗升级 + 敌人变强
- 后期：对抗幕后黑手 + 战神身份揭秘 + 终极对决

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 主角设定（特种兵背景、技能、性格）
3. 都市势力格局
4. 关键人物（家人、战友、红颜、敌人）
5. 分卷大纲（3卷）
6. 战斗系统设计
7. 热血场面清单
8. 伏笔规划`,
    gradient: "from-slate-600 to-gray-700",
    coreFormula: "战神归来 → 守护家人 → 震撼出场 → 建立势力 → 敌人挑衅 → 终极对决",
    requiredElements: ["战神身份", "家人保护", "战斗展示", "势力建立", "热血场面"],
    rhythmAdvice: "前期密集展示实力建立形象，中期势力扩张战斗升级，后期终极对决",
    antiTropes: ["一路碾压无压力", "家人无脑被欺负", "敌人全部无脑"],
    structureTemplate: "战力展示结构：按敌人层级分卷，每卷有核心战斗和情感收获"
  },
  {
    id: "tpl-urb-doctor",
    name: "神医归来",
    icon: "💉",
    description: "绝世神医回归都市，一手银针救苍生，疑难杂症手到擒来",
    category: "都市异能",
    tags: ["神医", "都市", "医术", "传承"],
    usageCount: 8765,
    rating: 4.7,
    prompt: `请根据以下模板生成一个都市神医小说大纲。

## 【核心公式】
归来：绝世神医回归都市
震撼：医术震惊世人
冲突：都市势力与医学界黑幕
救助：银针救人，妙手回春
崛起：揭开医学黑幕，成为医道至尊

## 【神医文核心要素】
- [ ] 神医身份的设定
- [ ] 医术的展示方式
- [ ] 银针/医术的独特能力
- [ ] 医学黑幕的揭露
- [ ] 医德与医道的平衡

## 【必含元素】
- [ ] 神医归来的震撼出场
- [ ] 第一个患者的救治
- [ ] 医学界的黑幕揭露
- [ ] 与西医/其他势力的冲突
- [ ] 医术的进阶
- [ ] 感情线的展开
- [ ] 终极挑战
- [ ] 医道至尊的成就

## 【节奏建议】
- 前期：震惊世人 + 初步冲突
- 中期：揭露黑幕 + 医术进阶
- 后期：终极挑战 + 医道至尊

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 神医设定（身份、医术来源）
3. 医术体系设计
4. 医学黑幕设定
5. 主要对手
6. 分卷大纲（3卷）
7. 经典救治场景
8. 感情线设计`,
    gradient: "from-teal-500 to-cyan-600",
    coreFormula: "神医归来 → 震惊世人 → 揭露黑幕 → 医术进阶 → 医道至尊",
    requiredElements: ["神医身份", "银针医术", "医学黑幕", "势力冲突"],
    rhythmAdvice: "救治场景要精彩，每场救治要有不同看点",
    antiTropes: ["病人无脑质疑", "西医全程被打脸", "神医无代价治病"],
    structureTemplate: "医术进阶结构：按医治对象层级分卷，每卷有核心救治和黑幕揭露"
  },
  {
    id: "tpl-urb-business",
    name: "商战霸主",
    icon: "💼",
    description: "重生者凭借前世记忆在商海中翻云覆雨，成为一代商业传奇",
    category: "都市异能",
    tags: ["商战", "重生", "职场", "逆袭"],
    usageCount: 7654,
    rating: 4.6,
    prompt: `请根据以下模板生成一个商战霸主小说大纲。

## 【核心公式】
重生：带着前世记忆回到过去
先知：利用信息差抢占先机
商战：在商业竞争中崛起
传奇：成为一代商业霸主

## 【商战文核心要素】
- [ ] 商业领域的设定
- [ ] 重生带来的先知优势
- [ ] 商战手段的设计
- [ ] 竞争对手的设定
- [ ] 商业帝国的建立

## 【必含元素】
- [ ] 重生开局的契机
- [ ] 先知优势的运用
- [ ] 第一个商业机会
- [ ] 竞争对手的对抗
- [ ] 商业帝国的扩张
- [ ] 终极商业对决

## 【节奏建议】
- 前期：重生适应 + 先知优势
- 中期：商业崛起 + 竞争对抗
- 后期：帝国建立 + 终极对决

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 商业领域设定
3. 重生优势设计
4. 竞争对手设定
5. 分卷大纲（3卷）`,
    gradient: "from-amber-500 to-orange-600",
    coreFormula: "重生 → 先知优势 → 商业崛起 → 帝国建立 → 商业传奇",
    requiredElements: ["重生设定", "先知优势", "商战设计", "竞争对手"],
    rhythmAdvice: "商战要精彩，每场竞争要有不同看点",
    antiTropes: ["无代价成功", "对手无脑弱", "商业无风险"],
    structureTemplate: "商业扩张结构：按商业层级分卷，逐步扩大商业版图"
  },
  {
    id: "tpl-urb-bodyguard",
    name: "贴身保镖",
    icon: "🛡️",
    description: "顶级保镖守护千金小姐，从雇佣关系到暗生情愫，保镖文学经典再现",
    category: "都市异能",
    tags: ["保镖", "都市", "甜宠", "保镖文学"],
    usageCount: 6543,
    rating: 4.5,
    prompt: `请根据以下模板生成一个贴身保镖小说大纲。

## 【核心公式】
保镖：顶级保镖执行保护任务
雇主：富家千金小姐
日久：相处中产生情愫
危机：危机中的守护和信任
圆满：从保镖到真爱

## 【保镖文核心要素】
- [ ] 保镖身份的设定
- [ ] 雇主性格的设定
- [ ] 日久生情的过程
- [ ] 危机场景的设计
- [ ] 身份差距的克服

## 【必含元素】
- [ ] 保镖任务的开始
- [ ] 与雇主的初次相遇
- [ ] 日常相处中的情愫
- [ ] 危机事件的处理
- [ ] 感情的确认
- [ ] 圆满结局

## 【节奏建议】
- 前期：任务开始 + 相识
- 中期：相处情愫 + 危机
- 后期：感情明确 + 圆满

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 保镖设定
3. 雇主设定
4. 危机设计
5. 分卷大纲（3卷）`,
    gradient: "from-stone-500 to-zinc-600",
    coreFormula: "保镖任务 → 相识相处 → 日久生情 → 危机守护 → 真爱圆满",
    requiredElements: ["保镖身份", "雇主设定", "日久生情", "危机场景"],
    rhythmAdvice: "日久生情要细腻，危机场景要紧张",
    antiTropes: ["保镖无脑帅", "雇主无脑作", "危机无代价解决"],
    structureTemplate: "感情线+任务线并行：任务制造危机，感情推动关系"
  },

  // 武侠江湖类
  {
    id: "tpl-wuxia-legend",
    name: "江湖传说",
    icon: "⚔️",
    description: "少年闯荡江湖，行侠仗义，在武林中留下无数传说",
    category: "武侠江湖",
    tags: ["武侠", "江湖", "热血", "成长"],
    usageCount: 6543,
    rating: 4.6,
    prompt: `请根据以下模板生成一个江湖传说小说大纲。

## 【核心公式】
少年：初入江湖的少年
成长：江湖中的历练和成长
侠义：行侠仗义的信念
传说：留下属于自己的传说
江湖：恩怨情仇的交织

## 【武侠文核心要素】
- [ ] 江湖世界的设定
- [ ] 武学体系的设定
- [ ] 门派势力格局
- [ ] 侠义精神的体现
- [ ] 江湖恩怨的交织

## 【必含元素】
- [ ] 初入江湖的开局
- [ ] 第一个江湖历练
- [ ] 门派的选择
- [ ] 侠义行为的展示
- [ ] 江湖恩怨的牵扯
- [ ] 武功的提升
- [ ] 传说的诞生

## 【节奏建议】
- 前期：初入江湖 + 成长历练
- 中期：恩怨交织 + 武功精进
- 后期：传说诞生 + 江湖传奇

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 江湖世界设定
3. 武学体系
4. 门派势力格局
5. 主角设定
6. 分卷大纲（3卷）`,
    gradient: "from-stone-500 to-gray-600",
    coreFormula: "初入江湖 → 成长历练 → 侠义之行 → 江湖恩怨 → 传说诞生",
    requiredElements: ["江湖设定", "武学体系", "侠义精神", "恩怨情仇"],
    rhythmAdvice: "江湖历练要精彩，侠义精神要突出",
    antiTropes: ["武功无代价提升", "江湖无规矩", "侠义无回报"],
    structureTemplate: "成长驱动结构：按江湖层级分卷，逐步提升武功和地位"
  },
  {
    id: "tpl-wuxia-sect",
    name: "宗门崛起",
    icon: "🏯",
    description: "小宗门弟子逆袭成长，将宗门发展壮大成为武林至尊",
    category: "武侠江湖",
    tags: ["武侠", "宗门", "逆袭", "崛起"],
    usageCount: 5432,
    rating: 4.5,
    prompt: `请根据以下模板生成一个宗门崛起小说大纲。

## 【核心公式】
弟子：宗门中的普通弟子
逆袭：凭借努力和机缘崛起
宗门：将小宗门发展壮大
崛起：从弱到强的逆袭
至尊：成为武林至尊

## 【宗门文核心要素】
- [ ] 宗门体系的设定
- [ ] 修炼等级的设定
- [ ] 宗门之间的竞争
- [ ] 弟子的成长
- [ ] 宗门的发展

## 【必含元素】
- [ ] 宗门弟子的开局
- [ ] 修炼入门
- [ ] 宗门大比
- [ ] 宗门危机
- [ ] 宗门发展
- [ ] 逆袭崛起

## 【节奏建议】
- 前期：弟子成长 + 宗门大比
- 中期：宗门危机 + 崛起
- 后期：宗门发展 + 至尊

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 宗门设定
3. 修炼体系
4. 宗门格局
5. 主角设定
6. 分卷大纲（3卷）`,
    gradient: "from-emerald-500 to-teal-600",
    coreFormula: "宗门弟子 → 修炼成长 → 宗门危机 → 逆袭崛起 → 武林至尊",
    requiredElements: ["宗门体系", "修炼等级", "弟子成长", "宗门发展"],
    rhythmAdvice: "宗门冲突要精彩，发展过程要有挑战",
    antiTropes: ["修炼无代价", "宗门无竞争", "逆袭无阻力"],
    structureTemplate: "宗门发展结构：按宗门层级分卷，逐步扩大宗门势力"
  },

  // 奇幻冒险类
  {
    id: "tpl-fantasy-dragon",
    name: "驯龙高手",
    icon: "🐉",
    description: "与龙族签订契约，成为龙骑士，在奇幻大陆上展开史诗冒险",
    category: "奇幻冒险",
    tags: ["奇幻", "龙族", "冒险", "异世界"],
    usageCount: 6543,
    rating: 4.7,
    prompt: `请根据以下模板生成一个驯龙高手小说大纲。

## 【核心公式】
契约：与龙族签订契约
骑士：成为龙骑士
冒险：在奇幻大陆上探险
成长：与龙共同成长
传奇：成为传奇的龙骑士

## 【奇幻龙骑核心要素】
- [ ] 龙族的设定（种类、能力、性格）
- [ ] 契约的方式和条件
- [ ] 龙骑士的成长体系
- [ ] 奇幻世界的世界观
- [ ] 冒险历程的设计

## 【必含元素】
- [ ] 与龙的初次相遇
- [ ] 契约的签订
- [ ] 龙骑士的第一次战斗
- [ ] 龙与骑士的羁绊
- [ ] 奇幻世界的冒险
- [ ] 龙的进化/成长
- [ ] 传奇的诞生

## 【节奏建议】
- 前期：契约签订 + 熟悉能力
- 中期：冒险成长 + 羁绊加深
- 后期：传奇诞生 + 终极冒险

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 龙族设定
3. 契约方式
4. 龙骑士成长体系
5. 世界观设定
6. 分卷大纲（3卷）`,
    gradient: "from-purple-500 to-violet-600",
    coreFormula: "龙族契约 → 龙骑士成长 → 奇幻冒险 → 羁绊加深 → 传奇诞生",
    requiredElements: ["龙族设定", "契约方式", "骑士成长", "奇幻世界观"],
    rhythmAdvice: "龙与骑士的羁绊要感人，冒险场面要宏大",
    antiTropes: ["龙无代价服从", "骑士无脑强", "冒险无挑战"],
    structureTemplate: "冒险成长结构：按冒险层级分卷，逐步提升骑士和龙的能力"
  },
  {
    id: "tpl-fantasy-magic",
    name: "魔法学徒",
    icon: "🔮",
    description: "平凡少年进入魔法学院，从学徒成长为一代大法师",
    category: "奇幻冒险",
    tags: ["魔法", "学院", "成长", "异世界"],
    usageCount: 7654,
    rating: 4.6,
    isNew: true,
    prompt: `请根据以下模板生成一个魔法学徒小说大纲。

## 【核心公式】
学徒：进入魔法学院的普通少年
成长：魔法知识和技能的提升
学院：学院内部的竞争和友情
冒险：魔法世界的探索和冒险
法师：成为一代大法师

## 【魔法学院核心要素】
- [ ] 魔法体系的设定
- [ ] 学院制度的设定
- [ ] 魔法老师/导师的设定
- [ ] 同学/朋友的设定
- [ ] 魔法考试的挑战

## 【必含元素】
- [ ] 进入魔法学院的契机
- [ ] 魔法觉醒
- [ ] 学院生活的展示
- [ ] 魔法考试/竞赛
- [ ] 魔法冒险
- [ ] 成长和突破

## 【节奏建议】
- 前期：学院适应 + 魔法觉醒
- 中期：学院竞争 + 冒险
- 后期：魔法大成 + 终极挑战

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 魔法体系设定
3. 学院设定
4. 主要人物
5. 分卷大纲（3卷）`,
    gradient: "from-blue-500 to-indigo-600",
    coreFormula: "魔法学徒 → 学院成长 → 魔法精进 → 冒险探索 → 大法师",
    requiredElements: ["魔法体系", "学院制度", "导师设定", "同学友情"],
    rhythmAdvice: "学院生活要精彩，魔法展示要有想象力",
    antiTropes: ["魔法无代价使用", "学院无竞争", "老师无脑强"],
    structureTemplate: "成长驱动结构：按魔法等级分卷，逐步提升魔法能力"
  },
  {
    id: "tpl-fantasy-dungeon",
    name: "地城勇者",
    icon: "🗝️",
    description: "冒险者组队探索地下城，挑战Boss获取宝藏，在迷宫中不断变强",
    category: "奇幻冒险",
    tags: ["地城", "冒险", "组队", "战斗"],
    usageCount: 5432,
    rating: 4.5,
    prompt: `请根据以下模板生成一个地城勇者小说大纲。

## 【核心公式】
冒险：地下城探险冒险
组队：冒险者组队合作
战斗：与怪物的激烈战斗
宝藏：获取宝物和装备
成长：在战斗中不断提升实力

## 【地城冒险核心要素】
- [ ] 地下城的设定（层数、怪物、资源）
- [ ] 冒险者职业体系
- [ ] 组队配合的设计
- [ ] Boss的设计
- [ ] 宝藏/装备系统

## 【必含元素】
- [ ] 地下城的初次探索
- [ ] 组队冒险的开始
- [ ] 与怪物的战斗
- [ ] Boss挑战
- [ ] 宝藏获取
- [ ] 冒险者的成长

## 【节奏建议】
- 前期：探索熟悉 + 初步战斗
- 中期：深入冒险 + 组队配合
- 后期：终极挑战 + 冒险者巅峰

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 地下城设定
3. 职业体系
4. 队友设定
5. Boss设计
6. 分卷大纲（3卷）`,
    gradient: "from-yellow-500 to-amber-600",
    coreFormula: "地城探索 → 组队冒险 → Boss挑战 → 宝藏获取 → 冒险者巅峰",
    requiredElements: ["地下城设定", "职业体系", "组队配合", "Boss设计"],
    rhythmAdvice: "战斗场面要精彩，组队配合要有默契",
    antiTropes: ["怪物无代价击杀", "宝藏无限获取", "组队无配合"],
    structureTemplate: "探险结构：按地下城层数分卷，逐步深入挑战更强Boss"
  },

  // 军事战争类
  {
    id: "tpl-mil-warrior",
    name: "特种兵王",
    icon: "🎯",
    description: "特种部队精英参与各种危险任务，保家卫国的热血故事",
    category: "军事战争",
    tags: ["军事", "特种兵", "热血", "保家卫国"],
    usageCount: 6789,
    rating: 4.7,
    prompt: `请根据以下模板生成一个特种兵王小说大纲。

## 【核心公式】
特种兵：精英士兵的传奇
任务：执行危险军事任务
热血：保家卫国的信念
战斗：激烈战斗场面
荣耀：军人的荣誉和使命

## 【军事文核心要素】
- [ ] 特种兵身份的设定
- [ ] 军事任务的类型
- [ ] 战斗场面的描写
- [ ] 战友情谊的展现
- [ ] 保家卫国的信念

## 【必含元素】
- [ ] 特种兵身份的展示
- [ ] 第一个军事任务
- [ ] 战斗场面的描写
- [ ] 战友情谊
- [ ] 保家卫国的使命
- [ ] 终极任务

## 【节奏建议】
- 前期：任务执行 + 战斗展示
- 中期：危机任务 + 战友牺牲
- 后期：终极使命 + 荣耀

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 特种兵设定
3. 任务类型设计
4. 战友设定
5. 分卷大纲（3卷）`,
    gradient: "from-green-700 to-emerald-800",
    coreFormula: "特种兵 → 危险任务 → 战斗考验 → 战友羁绊 → 保家卫国",
    requiredElements: ["特种兵设定", "任务设计", "战斗场面", "战友情谊"],
    rhythmAdvice: "战斗场面要热血，战友情谊要感人",
    antiTropes: ["任务无代价完成", "战友无意义牺牲", "战斗无悬念"],
    structureTemplate: "任务驱动结构：按任务层级分卷，每卷有核心任务"
  },
  {
    id: "tpl-mil-sniper",
    name: "狙击之王",
    icon: "🔭",
    description: "王牌狙击手的传奇，从新兵到兵王的成长之路",
    category: "军事战争",
    tags: ["军事", "狙击", "成长", "热血"],
    usageCount: 5432,
    rating: 4.5,
    prompt: `请根据以下模板生成一个狙击之王小说大纲。

## 【核心公式】
狙击：狙击手的精准射击
成长：从新兵到王牌的成长
训练：艰苦的狙击训练
任务：狙击任务的执行
王牌：成为狙击之王

## 【狙击文核心要素】
- [ ] 狙击手技能的设定
- [ ] 训练过程的描写
- [ ] 狙击任务的类型
- [ ] 成长历程的设计
- [ ] 狙击之王的目标

## 【必含元素】
- [ ] 狙击手的起源
- [ ] 训练和成长
- [ ] 狙击任务
- [ ] 精准射击的展示
- [ ] 成为狙击之王

## 【节奏建议】
- 前期：训练成长 + 初次任务
- 中期：任务进阶 + 技能提升
- 后期：狙击之王 + 终极任务

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 狙击手设定
3. 训练体系
4. 任务设计
5. 分卷大纲（3卷）`,
    gradient: "from-slate-600 to-gray-700",
    coreFormula: "新兵 → 狙击训练 → 任务成长 → 技能精进 → 狙击之王",
    requiredElements: ["狙击技能", "训练过程", "任务设计", "成长历程"],
    rhythmAdvice: "狙击场面要精准，成长过程要有挑战",
    antiTropes: ["狙击无代价成功", "训练无困难", "任务无失败风险"],
    structureTemplate: "成长驱动结构：按狙击技能等级分卷"
  },

  // 美食生活类
  {
    id: "tpl-food-master",
    name: "美食供应商",
    icon: "🍳",
    description: "获得神秘能力的厨师，用美食征服食客的味蕾，开启美食传奇",
    category: "美食生活",
    tags: ["美食", "都市", "创业", "系统"],
    usageCount: 4321,
    rating: 4.4,
    prompt: `请根据以下模板生成一个美食供应商小说大纲。

## 【核心公式】
厨师：拥有神秘能力的厨师
美食：用美食征服食客
创业：从街头小摊到餐饮帝国
传奇：美食传奇的诞生

## 【美食文核心要素】
- [ ] 厨师身份的设定
- [ ] 神秘能力的来源
- [ ] 美食的独特之处
- [ ] 创业发展的路径
- [ ] 竞争对手的设定

## 【必含元素】
- [ ] 厨师身份的展示
- [ ] 神秘能力的觉醒
- [ ] 第一道美食
- [ ] 创业起步
- [ ] 竞争对手
- [ ] 美食帝国的建立

## 【节奏建议】
- 前期：能力觉醒 + 初步创业
- 中期：美食发展 + 竞争
- 后期：餐饮帝国 + 美食传奇

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 厨师设定
3. 能力设定
4. 美食设计
5. 分卷大纲（3卷）`,
    gradient: "from-orange-500 to-amber-600",
    coreFormula: "厨师 → 能力觉醒 → 美食创业 → 餐饮发展 → 美食帝国",
    requiredElements: ["厨师身份", "神秘能力", "美食设计", "创业发展"],
    rhythmAdvice: "美食描写要诱人，创业过程要有挑战",
    antiTropes: ["能力无代价使用", "美食无创新", "竞争无悬念"],
    structureTemplate: "创业发展结构：按餐饮发展层级分卷"
  },
  {
    id: "tpl-food-restaurant",
    name: "舌尖上的修仙",
    icon: "🍜",
    description: "以美食入道的修仙世界，厨师用菜品修炼境界，美食与修仙的奇妙结合",
    category: "美食生活",
    tags: ["美食", "修仙", "奇幻", "系统"],
    usageCount: 5432,
    rating: 4.5,
    isNew: true,
    prompt: `请根据以下模板生成一个舌尖上的修仙小说大纲。

## 【核心公式】
美食：以美食入道的修仙方式
厨师：修仙世界的厨师
修炼：通过做菜提升修为
灵材：用灵材做出美味
境界：美食与修仙的结合

## 【美食修仙核心要素】
- [ ] 修仙世界观设定
- [ ] 美食修仙的体系
- [ ] 灵材的种类和效果
- [ ] 厨师的修炼方式
- [ ] 境界的提升

## 【必含元素】
- [ ] 美食修仙的觉醒
- [ ] 第一个灵材菜品
- [ ] 修炼的展示
- [ ] 美食大赛
- [ ] 境界的提升
- [ ] 美食之道的追求

## 【节奏建议】
- 前期：美食觉醒 + 初步修炼
- 中期：美食大赛 + 境界提升
- 后期：美食之道 + 终极成就

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 世界观设定
3. 美食修仙体系
4. 灵材设计
5. 分卷大纲（3卷）`,
    gradient: "from-yellow-500 to-orange-600",
    coreFormula: "美食觉醒 → 灵材做菜 → 修炼提升 → 美食大赛 → 美食之道",
    requiredElements: ["世界观设定", "美食体系", "灵材设计", "修炼方式"],
    rhythmAdvice: "美食描写要诱人，修仙设定要有想象力",
    antiTropes: ["灵材无限获取", "美食无创新", "修炼无代价"],
    structureTemplate: "修炼提升结构：按修仙境界分卷"
  },

  // 悬疑惊悚类
  {
    id: "tpl-thr-escape",
    name: "密室逃生",
    icon: "🚪",
    description: "被困在神秘的密室中，必须解开谜题才能生存，紧张刺激的逃生之旅",
    category: "悬疑惊悚",
    tags: ["悬疑", "逃生", "密室", "解谜"],
    usageCount: 5432,
    rating: 4.6,
    prompt: `请根据以下模板生成一个密室逃生小说大纲。

## 【核心公式】
密室：被困神秘的密室
谜题：解开谜题才能生存
逃生：紧张刺激的逃生
真相：揭开密室的真相
逃脱：成功逃出密室

## 【密室文核心要素】
- [ ] 密室环境的设定
- [ ] 谜题的设计
- [ ] 逃生过程的紧张感
- [ ] 密室背后的真相
- [ ] 主角的成长

## 【必含元素】
- [ ] 密室环境的展示
- [ ] 第一个谜题
- [ ] 逃生过程的紧张
- [ ] 密室的秘密
- [ ] 成功逃脱

## 【节奏建议】
- 前期：密室发现 + 第一个谜题
- 中期：深入探索 + 真相揭露
- 后期：终极谜题 + 成功逃脱

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 密室设定
3. 谜题设计（至少3个）
4. 真相设计
5. 分卷大纲（3卷）`,
    gradient: "from-gray-700 to-slate-800",
    coreFormula: "密室 → 谜题 → 逃生 → 真相 → 逃脱",
    requiredElements: ["密室设定", "谜题设计", "逃生过程", "真相揭露"],
    rhythmAdvice: "逃生要紧张刺激，谜题要合理有趣",
    antiTropes: ["谜题无代价解决", "逃生无紧张感", "真相牵强"],
    structureTemplate: "逃生结构：按密室层级分卷，逐步揭开真相"
  },
  {
    id: "tpl-thr-serial",
    name: "连环杀手",
    icon: "🔪",
    description: "追踪连环杀手，破解犯罪心理，与高智商罪犯斗智斗勇",
    category: "悬疑惊悚",
    tags: ["悬疑", "刑侦", "连环杀手", "心理"],
    usageCount: 6543,
    rating: 4.7,
    prompt: `请根据以下模板生成一个连环杀手小说大纲。

## 【核心公式】
连环：连环杀手的神秘
追踪：刑侦人员的追踪
心理：罪犯心理的分析
对决：正邪之间的斗智斗勇
真相：揭开杀手的真相

## 【刑侦文核心要素】
- [ ] 连环杀手的设计
- [ ] 犯罪心理的分析
- [ ] 追踪过程的设计
- [ ] 正邪对决的紧张
- [ ] 真相的揭露

## 【必含元素】
- [ ] 第一起案件
- [ ] 连环案件的发现
- [ ] 心理分析
- [ ] 追踪过程
- [ ] 正邪对决
- [ ] 真相揭露

## 【节奏建议】
- 前期：案件发现 + 初步追踪
- 中期：连环发现 + 心理分析
- 后期：终极对决 + 真相揭露

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 连环杀手设定
3. 犯罪心理设计
4. 追踪过程设计
5. 分卷大纲（3卷）`,
    gradient: "from-red-700 to-rose-800",
    coreFormula: "案件 → 连环 → 追踪 → 心理分析 → 真相揭露",
    requiredElements: ["杀手设计", "心理分析", "追踪过程", "正邪对决"],
    rhythmAdvice: "追踪要紧张，推理要严密，对决要精彩",
    antiTropes: ["杀手无逻辑", "追踪无难度", "对决无悬念"],
    structureTemplate: "追踪结构：按追踪层级分卷，逐步逼近真相"
  },

  // 同人衍生类
  {
    id: "tpl-fan-if",
    name: "如果当初",
    icon: "🔄",
    description: "穿越到熟悉的故事中改变命运，是同人创作的经典设定",
    category: "同人衍生",
    tags: ["同人", "穿越", "改变命运", "二次创作"],
    usageCount: 4321,
    rating: 4.3,
    prompt: `请根据以下模板生成一个同人小说大纲。

## 【核心公式】
同人：穿越到熟悉的故事世界
改变：改变原有的命运
羁绊：与原角色的关系
发展：走出自己的道路
结局：新的命运走向

## 【同人文核心要素】
- [ ] 原著世界观的设定
- [ ] 穿越的设定
- [ ] 改变命运的策略
- [ ] 与原角色的关系
- [ ] 新的故事发展

## 【必含元素】
- [ ] 穿越到原著世界
- [ ] 与原著角色的相遇
- [ ] 改变命运的尝试
- [ ] 羁绊的建立
- [ ] 新的故事走向

## 【节奏建议】
- 前期：穿越适应 + 角色相遇
- 中期：改变命运 + 羁绊加深
- 后期：新的命运 + 圆满结局

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 原著世界观设定
3. 穿越设定
4. 改变策略
5. 分卷大纲（3卷）`,
    gradient: "from-pink-500 to-purple-600",
    coreFormula: "穿越 → 改变命运 → 羁绊建立 → 新的道路 → 圆满",
    requiredElements: ["原著世界观", "穿越设定", "改变策略", "角色关系"],
    rhythmAdvice: "同人设定要精准，改变命运要有看点",
    antiTropes: ["无脑改变剧情", "原著角色崩人设", "穿越无代价"],
    structureTemplate: "改变命运结构：按改变程度分卷，逐步走出新路"
  },
  {
    id: "tpl-fan-game",
    name: "游戏乱入",
    icon: "🎲",
    description: "游戏角色穿越到现实世界，或主角进入游戏世界展开冒险",
    category: "同人衍生",
    tags: ["同人", "游戏", "穿越", "冒险"],
    usageCount: 5432,
    rating: 4.4,
    prompt: `请根据以下模板生成一个游戏乱入小说大纲。

## 【核心公式】
乱入：游戏与现实的交织
穿越：游戏角色到现实或反之
冲突：两个世界的碰撞
成长：找到自己的价值
平衡：游戏与现实的平衡

## 【游戏乱入核心要素】
- [ ] 游戏世界的设定
- [ ] 现实世界的设定
- [ ] 乱入的方式
- [ ] 两个世界的冲突
- [ ] 成长的设计

## 【必含元素】
- [ ] 乱入事件的发生
- [ ] 两个世界的碰撞
- [ ] 冲突的展开
- [ ] 成长的过程
- [ ] 平衡的达成

## 【节奏建议】
- 前期：乱入发生 + 两个世界碰撞
- 中期：冲突展开 + 成长
- 后期：平衡达成 + 圆满

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 游戏世界设定
3. 乱入方式
4. 冲突设计
5. 分卷大纲（3卷）`,
    gradient: "from-cyan-500 to-blue-600",
    coreFormula: "乱入 → 碰撞 → 冲突 → 成长 → 平衡",
    requiredElements: ["游戏设定", "乱入方式", "世界冲突", "成长设计"],
    rhythmAdvice: "游戏与现实冲突要有趣，成长要有看点",
    antiTropes: ["游戏角色无敌", "现实无存在感", "冲突无意义"],
    structureTemplate: "双世界结构：游戏线和现实线并行，交替推进"
  },

  // 都市种田类
  {
    id: "tpl-farming-village",
    name: "悠然田居",
    icon: "🌾",
    description: "回归田园，种植养殖发家致富，远离都市喧嚣享受慢生活",
    category: "都市种田",
    tags: ["种田", "田园", "发家致富", "慢生活"],
    usageCount: 5432,
    rating: 4.4,
    prompt: `请根据以下模板生成一个悠然田居小说大纲。

## 【核心公式】
归隐：远离都市回归田园
种田：种植养殖的田园生活
致富：发家致富的过程
慢生活：享受悠闲的田园时光
圆满：田园生活的美好

## 【种田文核心要素】
- [ ] 田居环境的设定
- [ ] 种植养殖的设计
- [ ] 发家致富的过程
- [ ] 田园生活的描写
- [ ] 慢生活的节奏

## 【必含元素】
- [ ] 归隐的契机
- [ ] 田园生活的开始
- [ ] 种植养殖
- [ ] 发家致富
- [ ] 田园风光
- [ ] 慢生活的美好

## 【节奏建议】
- 前期：归隐 + 生活建立
- 中期：种田 + 发展
- 后期：致富 + 田园美好

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 田居设定
3. 种植养殖设计
4. 发展设计
5. 分卷大纲（3卷）`,
    gradient: "from-green-500 to-emerald-600",
    coreFormula: "归隐 → 田园生活 → 种田发展 → 发家致富 → 慢生活",
    requiredElements: ["田园设定", "种田设计", "发展过程", "慢生活"],
    rhythmAdvice: "田园生活要悠闲自在，致富过程要有成就感",
    antiTropes: ["种田无代价成功", "发展无挑战", "田园无烦恼"],
    structureTemplate: "田园发展结构：按发展层级分卷，逐步扩大田园规模"
  },
  {
    id: "tpl-farming-pet",
    name: "灵宠空间",
    icon: "🦊",
    description: "获得神奇空间，可以种植灵植养殖灵宠，走上修仙种田两不误的道路",
    category: "都市种田",
    tags: ["种田", "空间", "灵宠", "修仙"],
    usageCount: 6543,
    rating: 4.6,
    isHot: true,
    prompt: `请根据以下模板生成一个灵宠空间小说大纲。

## 【核心公式】
空间：神奇的空间能力
灵植：空间中的灵植种植
灵宠：空间中的灵宠养殖
修仙：修仙与种田的结合
发展：空间的发展和壮大

## 【灵宠文核心要素】
- [ ] 空间的设定和规则
- [ ] 灵植的种类和效果
- [ ] 灵宠的种类和能力
- [ ] 修仙的结合方式
- [ ] 空间的发展路径

## 【必含元素】
- [ ] 空间能力的觉醒
- [ ] 灵植的种植
- [ ] 灵宠的获得
- [ ] 修仙的结合
- [ ] 空间的发展
- [ ] 终极空间能力

## 【节奏建议】
- 前期：空间觉醒 + 初步种田
- 中期：灵宠获得 + 修仙结合
- 后期：空间发展 + 终极能力

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 空间设定
3. 灵植体系
4. 灵宠体系
5. 分卷大纲（3卷）`,
    gradient: "from-lime-500 to-green-600",
    coreFormula: "空间觉醒 → 灵植种植 → 灵宠获得 → 修仙结合 → 空间发展",
    requiredElements: ["空间设定", "灵植体系", "灵宠设计", "修仙结合"],
    rhythmAdvice: "种田要有成就感，灵宠要有萌点",
    antiTropes: ["空间无限扩展", "灵宠无代价获得", "发展无挑战"],
    structureTemplate: "空间发展结构：按空间层级分卷，逐步扩大空间能力"
  },

  // 都市神医类
  {
    id: "tpl-med-legend",
    name: "医道圣手",
    icon: "🏥",
    description: "中医世家传人，以精湛医术救死扶伤，成为一代名医传奇",
    category: "都市神医",
    tags: ["神医", "中医", "都市", "传承"],
    usageCount: 7654,
    rating: 4.6,
    prompt: `请根据以下模板生成一个医道圣手小说大纲。

## 【核心公式】
世家：中医世家传人
医术：精湛的中医技艺
传承：中医的传承与发展
名医：成为一代名医
传奇：医学传奇的诞生

## 【中医文核心要素】
- [ ] 中医世家背景设定
- [ ] 中医技艺的独特之处
- [ ] 传承的师徒关系
- [ ] 医术的进阶
- [ ] 中医与现代医学的冲突

## 【必含元素】
- [ ] 中医世家的背景
- [ ] 医术的传承
- [ ] 第一位病人的救治
- [ ] 中医的独特治疗
- [ ] 医术的进阶
- [ ] 名医的诞生

## 【节奏建议】
- 前期：传承 + 医术展示
- 中期：医术进阶 + 传承
- 后期：名医 + 医学传奇

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 中医世家设定
3. 医术体系设计
4. 传承设计
5. 分卷大纲（3卷）`,
    gradient: "from-teal-500 to-emerald-600",
    coreFormula: "世家 → 传承 → 医术精进 → 名医 → 医学传奇",
    requiredElements: ["中医世家", "医术体系", "传承设计", "名医之路"],
    rhythmAdvice: "医术展示要精彩，传承要有仪式感",
    antiTropes: ["医术无代价提升", "传承无困难", "中医无挑战"],
    structureTemplate: "医术进阶结构：按医术等级分卷，逐步成为名医"
  },
  {
    id: "tpl-med-chinese",
    name: "国医崛起",
    icon: "📜",
    description: "西医当道的时代，主角以中医之术证明传统医学的博大精深",
    category: "都市神医",
    tags: ["神医", "中医", "打脸", "逆袭"],
    usageCount: 5432,
    rating: 4.5,
    prompt: `请根据以下模板生成一个国医崛起小说大纲。

## 【核心公式】
西医：西医当道的时代背景
中医：传统中医的价值
崛起：中医崛起的逆袭
打脸：证明中医的博大精深
传承：中医文化的传承

## 【国医文核心要素】
- [ ] 西医主导的世界观
- [ ] 中医的价值和独特性
- [ ] 打脸西医的爽点设计
- [ ] 中医的独特疗法
- [ ] 传承的使命感

## 【必含元素】
- [ ] 西医当道的背景
- [ ] 中医的独特展示
- [ ] 打脸西医
- [ ] 中医的疗效
- [ ] 传承的使命感
- [ ] 中医崛起

## 【节奏建议】
- 前期：被轻视 + 初步展示
- 中期：打脸 + 崛起
- 后期：证明 + 传承

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 世界观设定
3. 中医体系设计
4. 打脸设计
5. 分卷大纲（3卷）`,
    gradient: "from-emerald-500 to-teal-600",
    coreFormula: "西医主导 → 中医价值 → 打脸崛起 → 证明 → 传承",
    requiredElements: ["世界观", "中医体系", "打脸设计", "传承"],
    rhythmAdvice: "打脸要精彩，疗效要有说服力",
    antiTropes: ["中医无代价成功", "西医无脑弱", "打脸无意义"],
    structureTemplate: "逆袭打脸结构：按崛起程度分卷，逐步证明中医价值"
  },
  {
    id: "tpl-med-young",
    name: "少年圣医",
    icon: "🩺",
    description: "年纪轻轻便医术惊人，妙手回春救世家家主，被奉为少年圣医",
    category: "都市神医",
    tags: ["神医", "天才", "都市", "医术"],
    usageCount: 4321,
    rating: 4.4,
    isNew: true,
    prompt: `请根据以下模板生成一个少年圣医小说大纲。

## 【核心公式】
天才：天赋异禀的少年
医术：惊人的医术能力
圣医：被奉为少年圣医
成长：医术的不断精进
传奇：医学传奇的诞生

## 【少年神医核心要素】
- [ ] 少年天才的设定
- [ ] 医术天赋的来源
- [ ] 妙手回春的展示
- [ ] 被认可的过程
- [ ] 医术的继续精进

## 【必含元素】
- [ ] 少年天才的出场
- [ ] 医术天赋的展示
- [ ] 第一次救治
- [ ] 被奉为圣医
- [ ] 医术继续精进
- [ ] 医学传奇

## 【节奏建议】
- 前期：天才展示 + 初露锋芒
- 中期：被认可 + 医术精进
- 后期：圣医 + 传奇

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 少年设定
3. 天赋来源
4. 医术展示
5. 分卷大纲（3卷）`,
    gradient: "from-sky-500 to-cyan-600",
    coreFormula: "天才 → 医术展示 → 被认可 → 圣医 → 传奇",
    requiredElements: ["天才设定", "天赋来源", "医术展示", "认可"],
    rhythmAdvice: "天才展示要震撼，医术要有说服力",
    antiTropes: ["天才无代价", "医术无挑战", "成长无阻力"],
    structureTemplate: "天才成长结构：按医术层级分卷，逐步成为传奇"
  },

  // 都市鉴宝类
  {
    id: "tpl-appraisal-master",
    name: "鉴宝大师",
    icon: "💎",
    description: "拥有特殊能力可以鉴定各种宝物，在古董收藏界所向披靡",
    category: "都市鉴宝",
    tags: ["鉴宝", "古董", "都市", "收藏"],
    usageCount: 6543,
    rating: 4.5,
    prompt: `请根据以下模板生成一个鉴宝大师小说大纲。

## 【核心公式】
鉴宝：鉴定宝物的能力
大师：成为鉴宝大师
古董：古董收藏界
逆袭：从普通人到大师的逆袭
传奇：古董界的传奇

## 【鉴宝文核心要素】
- [ ] 鉴宝能力的设定
- [ ] 古董知识的展示
- [ ] 收藏界的势力格局
- [ ] 鉴宝的技巧
- [ ] 打眼与捡漏

## 【必含元素】
- [ ] 鉴宝能力的觉醒
- [ ] 古董知识的展示
- [ ] 第一次捡漏
- [ ] 收藏界的势力
- [ ] 鉴宝大师的成长
- [ ] 打眼与反转

## 【节奏建议】
- 前期：能力觉醒 + 初步接触
- 中期：收藏界 + 打眼捡漏
- 后期：大师 + 传奇

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 鉴宝能力设定
3. 古董知识体系
4. 收藏界格局
5. 分卷大纲（3卷）`,
    gradient: "from-amber-500 to-yellow-600",
    coreFormula: "能力觉醒 → 鉴宝展示 → 收藏界闯荡 → 大师 → 传奇",
    requiredElements: ["鉴宝能力", "古董知识", "收藏界格局", "打眼捡漏"],
    rhythmAdvice: "鉴宝场面要专业，捡漏要有快感",
    antiTropes: ["能力无代价使用", "知识无来源", "打眼无反转"],
    structureTemplate: "成长驱动结构：按鉴宝能力层级分卷"
  },
  {
    id: "tpl-appraisal-eye",
    name: "天眼通",
    icon: "👁️",
    description: "意外获得天眼异能，可以看穿一切，在赌石界和鉴宝界混得风生水起",
    category: "都市鉴宝",
    tags: ["天眼", "赌石", "鉴宝", "异能"],
    usageCount: 7654,
    rating: 4.7,
    isHot: true,
    prompt: `请根据以下模板生成一个天眼通小说大纲。

## 【核心公式】
天眼：神秘的异能
赌石：赌石界的刺激
鉴宝：鉴宝界的大师
崛起：从普通人到巅峰
传奇：异能传奇

## 【天眼文核心要素】
- [ ] 天眼能力的设定
- [ ] 赌石界的刺激
- [ ] 鉴宝界的大师
- [ ] 异能的代价
- [ ] 势力的扩张

## 【必含元素】
- [ ] 天眼能力的觉醒
- [ ] 第一次赌石
- [ ] 天眼展示
- [ ] 鉴宝界闯荡
- [ ] 异能的代价
- [ ] 巅峰之路

## 【节奏建议】
- 前期：天眼觉醒 + 赌石
- 中期：鉴宝闯荡 + 异能代价
- 后期：巅峰 + 传奇

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 天眼能力设定
3. 赌石体系
4. 鉴宝体系
5. 分卷大纲（3卷）`,
    gradient: "from-amber-600 to-orange-600",
    coreFormula: "天眼觉醒 → 赌石崛起 → 鉴宝大师 → 异能代价 → 巅峰",
    requiredElements: ["天眼能力", "赌石刺激", "鉴宝专业", "异能代价"],
    rhythmAdvice: "赌石要刺激，天眼展示要有快感",
    antiTropes: ["天眼无代价使用", "赌石无风险", "异能无限制"],
    structureTemplate: "异能成长结构：按异能层级分卷"
  },

  // 都市直播类
  {
    id: "tpl-live-star",
    name: "直播之王",
    icon: "📱",
    description: "网络主播的逆袭之路，从无名小卒到粉丝千万的顶流主播",
    category: "都市直播",
    tags: ["直播", "网红", "逆袭", "都市"],
    usageCount: 5432,
    rating: 4.4,
    prompt: `请根据以下模板生成一个直播之王小说大纲。

## 【核心公式】
直播：网络主播的职业生涯
逆袭：从无名小卒到顶流
粉丝：粉丝的增长和维护
直播：精彩内容的创作
传奇：直播界的传奇

## 【直播文核心要素】
- [ ] 直播平台的设定
- [ ] 主播成长历程
- [ ] 内容创作的设计
- [ ] 粉丝维护
- [ ] 竞争和打压

## 【必含元素】
- [ ] 主播身份的设定
- [ ] 第一场直播
- [ ] 粉丝增长
- [ ] 内容创作
- [ ] 竞争打压
- [ ] 逆袭成功

## 【节奏建议】
- 前期：起步 + 粉丝积累
- 中期：成长 + 竞争
- 后期：逆袭 + 传奇

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 直播平台设定
3. 主播设定
4. 内容设计
5. 分卷大纲（3卷）`,
    gradient: "from-pink-500 to-rose-600",
    coreFormula: "主播 → 直播起步 → 粉丝积累 → 逆袭 → 传奇",
    requiredElements: ["直播平台", "主播成长", "内容创作", "粉丝维护"],
    rhythmAdvice: "直播内容要精彩，粉丝增长要有快感",
    antiTropes: ["一夜爆红", "粉丝无脑增长", "竞争无意义"],
    structureTemplate: "成长驱动结构：按粉丝层级分卷"
  },
  {
    id: "tpl-live-game",
    name: "电竞主播",
    icon: "🎮",
    description: "游戏主播的技术流之路，用实力征服观众，从草根到明星",
    category: "都市直播",
    tags: ["电竞", "主播", "游戏", "逆袭"],
    usageCount: 4321,
    rating: 4.3,
    prompt: `请根据以下模板生成一个电竞主播小说大纲。

## 【核心公式】
电竞：游戏技术和比赛
主播：技术流主播
实力：用技术征服观众
逆袭：从草根到明星
传奇：电竞界的传奇

## 【电竞主播核心要素】
- [ ] 游戏项目的设定
- [ ] 技术流主播的风格
- [ ] 直播内容的设计
- [ ] 粉丝的维护
- [ ] 职业生涯

## 【必含元素】
- [ ] 主播身份的设定
- [ ] 技术展示
- [ ] 粉丝增长
- [ ] 比赛参与
- [ ] 逆袭成功

## 【节奏建议】
- 前期：起步 + 技术展示
- 中期：成长 + 比赛
- 后期：明星 + 传奇

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 游戏设定
3. 主播设定
4. 内容设计
5. 分卷大纲（3卷）`,
    gradient: "from-violet-500 to-purple-600",
    coreFormula: "电竞 → 主播起步 → 技术展示 → 逆袭 → 传奇",
    requiredElements: ["游戏设定", "技术展示", "直播内容", "比赛"],
    rhythmAdvice: "技术展示要精彩，比赛场面要热血",
    antiTropes: ["技术无意义", "粉丝无脑增长", "比赛无悬念"],
    structureTemplate: "成长驱动结构：按技术层级分卷"
  },

  // 都市风水类
  {
    id: "tpl-fengshui-master",
    name: "玄学大师",
    icon: "☯️",
    description: "精通风水玄学，为人看相算命批八字，成为都市中的神秘高人",
    category: "都市玄学",
    tags: ["玄学", "风水", "算命", "神秘"],
    usageCount: 6543,
    rating: 4.5,
    prompt: `请根据以下模板生成一个玄学大师小说大纲。

## 【核心公式】
玄学：神秘的风水算命
大师：玄学领域的大师
都市：都市中的神秘存在
逆袭：从普通人到大师
传奇：玄学界的传奇

## 【玄学文核心要素】
- [ ] 玄学知识的设定
- [ ] 风水算命的技巧
- [ ] 都市神秘世界观
- [ ] 大师的成长历程
- [ ] 玄学的神秘感

## 【必含元素】
- [ ] 玄学能力的觉醒
- [ ] 第一次算命
- [ ] 风水布局
- [ ] 神秘事件的处理
- [ ] 大师的成长
- [ ] 玄学传奇

## 【节奏建议】
- 前期：能力觉醒 + 初步接触
- 中期：玄学展示 + 成长
- 后期：大师 + 传奇

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 玄学体系设定
3. 能力展示
4. 神秘事件设计
5. 分卷大纲（3卷）`,
    gradient: "from-stone-500 to-slate-600",
    coreFormula: "能力觉醒 → 玄学展示 → 神秘事件 → 大师 → 传奇",
    requiredElements: ["玄学体系", "算命技巧", "风水知识", "神秘事件"],
    rhythmAdvice: "玄学展示要神秘，事件要有悬念",
    antiTropes: ["玄学无代价使用", "预测无失败", "事件无挑战"],
    structureTemplate: "成长驱动结构：按玄学能力层级分卷"
  },
  {
    id: "tpl-fengshui-tomb",
    name: "寻龙点穴",
    icon: "🗺️",
    description: "风水师传人，精通寻龙点穴之术，游走于古墓与现代都市之间",
    category: "都市玄学",
    tags: ["风水", "盗墓", "探险", "玄学"],
    usageCount: 7654,
    rating: 4.6,
    isHot: true,
    prompt: `请根据以下模板生成一个寻龙点穴小说大纲。

## 【核心公式】
传承：风水师传人
古墓：神秘古墓探险
玄学：寻龙点穴之术
探险：古墓中的冒险
发现：揭开古墓的秘密

## 【盗墓文核心要素】
- [ ] 风水师传承的设定
- [ ] 寻龙点穴的能力
- [ ] 古墓的设定
- [ ] 探险过程的紧张
- [ ] 古墓秘密的揭露

## 【必含元素】
- [ ] 传承的展示
- [ ] 第一次古墓探险
- [ ] 寻龙点穴的展示
- [ ] 古墓中的危机
- [ ] 秘密的揭露
- [ ] 传承的延续

## 【节奏建议】
- 前期：传承 + 初次探险
- 中期：探险 + 危机
- 后期：秘密 + 传承

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 传承设定
3. 寻龙点穴能力
4. 古墓设计
5. 分卷大纲（3卷）`,
    gradient: "from-amber-700 to-yellow-700",
    coreFormula: "传承 → 寻龙点穴 → 古墓探险 → 危机 → 发现",
    requiredElements: ["传承设定", "寻龙点穴", "古墓设计", "探险危机"],
    rhythmAdvice: "探险要紧张刺激，玄学要有神秘感",
    antiTropes: ["无代价探险", "古墓无危险", "秘密无悬念"],
    structureTemplate: "探险结构：按古墓层级分卷"
  },

  // 都市战神类
  {
    id: "tpl-warrior-return",
    name: "战神归来",
    icon: "⚔️",
    description: "战场上无敌的战神回归都市，却发现家人受辱，从此展开复仇之路",
    category: "都市战神",
    tags: ["战神", "都市", "复仇", "热血"],
    usageCount: 9876,
    rating: 4.8,
    isHot: true,
    prompt: `请根据以下模板生成一个战神归来小说大纲。

## 【核心公式】
归来：战神回归都市
发现：家人受辱的真相
愤怒：愤怒但克制的反应
复仇：一步步对付仇人
热血：战斗场面的展示
结局：保护家人，圆满结局

## 【战神文核心要素】
- [ ] 战神身份的震撼展示
- [ ] 都市势力格局
- [ ] 家人被欺负的原因
- [ ] 复仇计划的设计
- [ ] 战斗系统的设计

## 【必含元素】
- [ ] 战神归来的震撼出场
- [ ] 发现家人受辱
- [ ] 第一次战斗展示
- [ ] 敌人的势力网络
- [ ] 复仇的铺垫
- [ ] 与家人的温情场景
- [ ] 终极对决
- [ ] 保护家人的决心

## 【节奏建议】
- 前期：回归震撼 + 了解真相 + 初步反击
- 中期：深入调查 + 对付势力 + 战斗升级
- 后期：终极对决 + 复仇完成 + 守护家人

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 战神背景设定
3. 家人设定和被欺负的原因
4. 敌人势力格局
5. 复仇计划
6. 分卷大纲（3卷）
7. 战斗场面设计
8. 温情场景设计`,
    gradient: "from-red-600 to-rose-700",
    coreFormula: "战神归来 → 发现真相 → 克制愤怒 → 复仇计划 → 战斗升级 → 终极对决 → 守护家人",
    requiredElements: ["战神身份", "家人受辱", "复仇计划", "战斗场面", "温情守护"],
    rhythmAdvice: "前期战神身份要震撼，中期复仇要有节奏，后期终极对决要热血",
    antiTropes: ["一路无脑碾压", "家人无脑被欺负", "战神无感情线"],
    structureTemplate: "复仇驱动结构：按复仇对象层级分卷，每卷有核心战斗和情感收获"
  },
  {
    id: "tpl-warrior-king",
    name: "都市阎王",
    icon: "💀",
    description: "地下世界的王者，都市中的传说，强者中的强者",
    category: "都市战神",
    tags: ["战神", "都市", "强者", "热血"],
    usageCount: 8765,
    rating: 4.7,
    prompt: `请根据以下模板生成一个都市阎王小说大纲。

## 【核心公式】
阎王：地下世界的王者
都市：都市中的传说
强者：强者中的强者
热血：各种热血战斗
传说：都市传奇的诞生

## 【都市阎王核心要素】
- [ ] 阎王身份的设定
- [ ] 地下世界的势力
- [ ] 战斗系统的设计
- [ ] 都市势力的格局
- [ ] 传说的诞生

## 【必含元素】
- [ ] 阎王身份的展示
- [ ] 地下世界的势力
- [ ] 热血战斗
- [ ] 都市势力
- [ ] 传说的诞生

## 【节奏建议】
- 前期：身份展示 + 势力扩张
- 中期：战斗升级 + 敌人变强
- 后期：终极对决 + 传说

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 阎王设定
3. 势力格局
4. 战斗系统
5. 分卷大纲（3卷）`,
    gradient: "from-gray-700 to-slate-800",
    coreFormula: "阎王 → 地下势力 → 热血战斗 → 都市传说",
    requiredElements: ["阎王身份", "势力格局", "战斗场面", "都市传说"],
    rhythmAdvice: "战斗要热血，传说要有神秘感",
    antiTropes: ["无代价胜利", "敌人无脑弱", "势力无限制扩张"],
    structureTemplate: "势力扩张结构：按势力层级分卷"
  },

  // 玄幻领主类
  {
    id: "tpl-lord-fantasy",
    name: "异界领主",
    icon: "🏰",
    description: "穿越到异世界成为领主，建设领地招兵买马，建立自己的王国",
    category: "玄幻领主",
    tags: ["领主", "异界", "建设", "种田"],
    usageCount: 7654,
    rating: 4.6,
    isHot: true,
    prompt: `请根据以下模板生成一个异界领主小说大纲。

## 【核心公式】
领主：成为异世界的领主
建设：建设和发展领地
招兵：招兵买马扩势力
王国：建立自己的王国
征服：最终征服整个世界

## 【领主文核心要素】
- [ ] 异世界的设定
- [ ] 领地的建设系统
- [ ] 军队的招募和培养
- [ ] 势力之间的竞争
- [ ] 王国的建立

## 【必含元素】
- [ ] 穿越到异世界
- [ ] 成为领主
- [ ] 领地建设
- [ ] 军队招募
- [ ] 势力扩张
- [ ] 王国建立
- [ ] 世界征服

## 【节奏建议】
- 前期：领地建立 + 初步发展
- 中期：势力扩张 + 战争
- 后期：王国建立 + 征服

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 异世界设定
3. 领地系统
4. 势力格局
5. 分卷大纲（3-5卷）`,
    gradient: "from-amber-600 to-orange-700",
    coreFormula: "穿越 → 成为领主 → 领地建设 → 势力扩张 → 王国建立 → 世界征服",
    requiredElements: ["异世界设定", "领地系统", "军队体系", "势力格局"],
    rhythmAdvice: "领地建设要有成就感，战争场面要宏大",
    antiTropes: ["建设无代价", "扩张无阻力", "敌人无脑"],
    structureTemplate: "势力扩张结构：按势力层级分卷，逐步扩大领土"
  },
  {
    id: "tpl-lord-demon",
    name: "深渊领主",
    icon: "👹",
    description: "成为深渊恶魔领主，在无尽的黑暗中建立势力，征服诸天",
    category: "玄幻领主",
    tags: ["领主", "深渊", "恶魔", "黑暗"],
    usageCount: 5432,
    rating: 4.4,
    prompt: `请根据以下模板生成一个深渊领主小说大纲。

## 【核心公式】
深渊：无尽黑暗的深渊世界
恶魔：恶魔领主的身份
势力：深渊势力的建立
征服：征服诸天的野心
黑暗：黑暗力量的运用

## 【深渊领主核心要素】
- [ ] 深渊世界的设定
- [ ] 恶魔领主的身份
- [ ] 深渊势力系统
- [ ] 黑暗力量的运用
- [ ] 征服诸天的过程

## 【必含元素】
- [ ] 深渊世界的设定
- [ ] 恶魔领主的崛起
- [ ] 深渊势力的建立
- [ ] 黑暗力量的展示
- [ ] 征服诸天
- [ ] 终极黑暗

## 【节奏建议】
- 前期：深渊崛起 + 势力建立
- 中期：势力扩张 + 黑暗力量
- 后期：征服诸天 + 终极黑暗

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 深渊世界设定
3. 恶魔领主设定
4. 黑暗力量系统
5. 分卷大纲（3卷）`,
    gradient: "from-purple-700 to-violet-800",
    coreFormula: "深渊 → 恶魔崛起 → 势力建立 → 黑暗力量 → 征服诸天",
    requiredElements: ["深渊世界", "恶魔身份", "黑暗力量", "势力扩张"],
    rhythmAdvice: "黑暗势力要有压迫感，战斗场面要宏大",
    antiTropes: ["黑暗无代价", "势力无限扩张", "征服无阻力"],
    structureTemplate: "势力扩张结构：按征服层级分卷"
  },

  // 玄幻退婚类
  {
    id: "tpl-retro-slam",
    name: "退婚流打脸",
    icon: "📜",
    description: "废物主角被未婚妻退婚，三十年河东三十年河西，莫欺少年穷",
    category: "玄幻退婚",
    tags: ["退婚", "打脸", "逆袭", "废柴"],
    usageCount: 8765,
    rating: 4.7,
    isHot: true,
    prompt: `请根据以下模板生成一个退婚流打脸小说大纲。

## 【核心公式】
退婚：被未婚妻退婚的羞辱
打脸：三年河东三十年河西
逆袭：从废物到天才的逆袭
复仇：让退婚者后悔莫及
崛起：成为至高存在

## 【退婚流核心要素】
- [ ] 退婚事件的设定
- [ ] 废物到天才的逆袭
- [ ] 打脸的设计
- [ ] 退婚者的后悔
- [ ] 逆袭的爽点

## 【必含元素】
- [ ] 退婚事件的羞辱
- [ ] 逆袭的开始
- [ ] 第一次打脸
- [ ] 退婚者的后悔
- [ ] 终极打脸

## 【节奏建议】
- 前期：退婚 + 逆袭开始
- 中期：打脸 + 退婚者后悔
- 后期：终极打脸 + 逆袭成功

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 退婚设定
3. 逆袭设计
4. 打脸设计
5. 分卷大纲（3卷）`,
    gradient: "from-indigo-600 to-purple-700",
    coreFormula: "退婚 → 羞辱 → 逆袭 → 打脸 → 后悔 → 终极打脸",
    requiredElements: ["退婚设定", "逆袭设计", "打脸设计", "后悔设计"],
    rhythmAdvice: "打脸要密集，羞辱到打脸的落差要有张力",
    antiTropes: ["逆袭无代价", "打脸无铺垫", "退婚者无脑"],
    structureTemplate: "逆袭打脸结构：按打脸层级分卷"
  },
  {
    id: "tpl-retro-ex",
    name: "前女友的逆袭",
    icon: "💔",
    description: "当年嫌弃主角的前女友后悔莫及，却发现主角已经高攀不起",
    category: "玄幻退婚",
    tags: ["前女友", "打脸", "逆袭", "都市"],
    usageCount: 6543,
    rating: 4.5,
    prompt: `请根据以下模板生成一个前女友的逆袭小说大纲。

## 【核心公式】
前女友：当年嫌弃主角的前女友
嫌弃：被嫌弃和看不起
逆袭：主角从穷小子到成功人士
后悔：前女友后悔莫及
高攀：主角已经高攀不起

## 【前女友文核心要素】
- [ ] 前女友的设定
- [ ] 主角被嫌弃的原因
- [ ] 逆袭的过程
- [ ] 前女友后悔的场景
- [ ] 高攀不起的展示

## 【必含元素】
- [ ] 被嫌弃的场景
- [ ] 逆袭的开始
- [ ] 前女友的再次出现
- [ ] 后悔的场景
- [ ] 高攀不起的展示

## 【节奏建议】
- 前期：嫌弃 + 逆袭开始
- 中期：逆袭成功 + 前女友出现
- 后期：后悔 + 高攀不起

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 前女友设定
3. 逆袭设计
4. 后悔设计
5. 分卷大纲（3卷）`,
    gradient: "from-pink-600 to-rose-700",
    coreFormula: "嫌弃 → 逆袭 → 成功 → 后悔 → 高攀不起",
    requiredElements: ["嫌弃设计", "逆袭设计", "后悔设计", "高攀设计"],
    rhythmAdvice: "逆袭要有落差感，后悔要有张力",
    antiTropes: ["逆袭无代价", "前女友无脑", "打脸无铺垫"],
    structureTemplate: "逆袭打脸结构：按逆袭层级分卷"
  },

  // 玄幻召唤类
  {
    id: "tpl-summon-hero",
    name: "召唤师",
    icon: "📿",
    description: "成为召唤师，召唤各种英灵魔兽为自己战斗，成为召唤流大师",
    category: "玄幻召唤",
    tags: ["召唤", "英灵", "魔兽", "异界"],
    usageCount: 7654,
    rating: 4.6,
    prompt: `请根据以下模板生成一个召唤师小说大纲。

## 【核心公式】
召唤：召唤英灵魔兽的能力
英灵：各种强大的英灵
魔兽：各种神兽魔兽
战斗：召唤物的战斗
大师：成为召唤流大师

## 【召唤文核心要素】
- [ ] 召唤能力的设定
- [ ] 召唤物的种类
- [ ] 召唤的规则和代价
- [ ] 召唤物的培养
- [ ] 与召唤物的羁绊

## 【必含元素】
- [ ] 召唤能力的觉醒
- [ ] 第一个召唤物
- [ ] 召唤物的战斗
- [ ] 更多召唤物的获得
- [ ] 召唤物培养
- [ ] 召唤流大师

## 【节奏建议】
- 前期：能力觉醒 + 召唤物获得
- 中期：培养 + 战斗
- 后期：大师 + 终极召唤

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 召唤能力设定
3. 召唤物体系
4. 召唤规则
5. 分卷大纲（3卷）`,
    gradient: "from-violet-600 to-purple-700",
    coreFormula: "召唤觉醒 → 英灵获得 → 培养 → 战斗 → 召唤大师",
    requiredElements: ["召唤能力", "召唤物体系", "召唤规则", "培养系统"],
    rhythmAdvice: "召唤场面要精彩，召唤物要有特色",
    antiTropes: ["召唤无代价", "召唤物无限获得", "培养无挑战"],
    structureTemplate: "召唤成长结构：按召唤能力层级分卷"
  },
  {
    id: "tpl-summon-servant",
    name: "英灵殿主",
    icon: "⚜️",
    description: "建立英灵殿，收集各路英雄豪杰的英灵为己所用",
    category: "玄幻召唤",
    tags: ["英灵", "召唤", "收集", "异界"],
    usageCount: 6543,
    rating: 4.5,
    isNew: true,
    prompt: `请根据以下模板生成一个英灵殿主小说大纲。

## 【核心公式】
英灵：收集英雄豪杰的英灵
殿主：建立英灵殿
收集：收集各种英灵
殿：英灵殿的发展
传奇：收集传奇英灵

## 【英灵殿核心要素】
- [ ] 英灵殿的设定
- [ ] 英灵的种类和获取方式
- [ ] 英灵的培养
- [ ] 英灵殿的发展
- [ ] 与英灵的羁绊

## 【必含元素】
- [ ] 英灵殿的建立
- [ ] 第一个英灵
- [ ] 英灵的获取
- [ ] 英灵殿的发展
- [ ] 传奇英灵

## 【节奏建议】
- 前期：英灵殿建立 + 第一个英灵
- 中期：英灵收集 + 殿发展
- 后期：传奇英灵 + 终极收集

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 英灵殿设定
3. 英灵体系
4. 获取方式
5. 分卷大纲（3卷）`,
    gradient: "from-cyan-600 to-blue-700",
    coreFormula: "英灵殿 → 英灵收集 → 殿发展 → 传奇英灵 → 终极收集",
    requiredElements: ["英灵殿设定", "英灵体系", "获取方式", "发展系统"],
    rhythmAdvice: "英灵要有特色，收集要有成就感",
    antiTropes: ["英灵无限获得", "收集无代价", "发展无挑战"],
    structureTemplate: "收集发展结构：按英灵层级分卷"
  },

  // 玄幻学院类
  {
    id: "tpl-academy-legend",
    name: "学院传奇",
    icon: "🎓",
    description: "在修炼学院中从籍籍无名到名震天下，成为一代传奇",
    category: "玄幻学院",
    tags: ["学院", "修炼", "成长", "天才"],
    usageCount: 8765,
    rating: 4.7,
    isHot: true,
    prompt: `请根据以下模板生成一个学院传奇小说大纲。

## 【核心公式】
学院：修炼学院的背景
成长：从籍籍无名到天才
竞争：学院内的竞争
传奇：名震天下的传奇

## 【学院文核心要素】
- [ ] 学院的设定
- [ ] 修炼体系的设定
- [ ] 学院内的竞争
- [ ] 成长历程
- [ ] 传奇的诞生

## 【必含元素】
- [ ] 进入学院的契机
- [ ] 修炼入门
- [ ] 学院竞争
- [ ] 成长
- [ ] 传奇

## 【节奏建议】
- 前期：学院适应 + 初步成长
- 中期：竞争 + 成长
- 后期：传奇 + 传说

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 学院设定
3. 修炼体系
4. 竞争设计
5. 分卷大纲（3卷）`,
    gradient: "from-blue-600 to-indigo-700",
    coreFormula: "学院 → 修炼 → 竞争 → 成长 → 传奇",
    requiredElements: ["学院设定", "修炼体系", "竞争设计", "成长"],
    rhythmAdvice: "学院竞争要精彩，成长要有看点",
    antiTropes: ["修炼无代价", "竞争无悬念", "成长无阻力"],
    structureTemplate: "成长结构：按修炼层级分卷"
  },
  {
    id: "tpl-academy-genius",
    name: "天才学院",
    icon: "⭐",
    description: "修炼天才进入顶尖学院，与各路天才竞争，争夺第一的宝座",
    category: "玄幻学院",
    tags: ["学院", "天才", "竞争", "热血"],
    usageCount: 7654,
    rating: 4.6,
    prompt: `请根据以下模板生成一个天才学院小说大纲。

## 【核心公式】
天才：修炼天才的身份
学院：顶尖学院的环境
竞争：与天才们的竞争
争夺：争夺第一的宝座
热血：激烈的竞争和战斗

## 【天才学院核心要素】
- [ ] 天才身份的设定
- [ ] 顶尖学院的设定
- [ ] 天才之间的竞争
- [ ] 争夺第一的过程
- [ ] 热血战斗场面

## 【必含元素】
- [ ] 进入顶尖学院
- [ ] 天才们的竞争
- [ ] 第一的争夺
- [ ] 热血战斗
- [ ] 最终胜利

## 【节奏建议】
- 前期：入学 + 初步竞争
- 中期：竞争加剧 + 战斗
- 后期：第一争夺 + 胜利

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 天才设定
3. 学院设定
4. 竞争设计
5. 分卷大纲（3卷）`,
    gradient: "from-emerald-600 to-teal-700",
    coreFormula: "天才 → 学院 → 竞争 → 争夺 → 胜利",
    requiredElements: ["天才设定", "学院设定", "竞争设计", "热血"],
    rhythmAdvice: "竞争要激烈，战斗要热血",
    antiTropes: ["天才无代价胜利", "竞争无悬念", "第一无挑战"],
    structureTemplate: "竞争结构：按竞争层级分卷"
  },

  // 玄幻系统类
  {
    id: "tpl-sys-infinite",
    name: "无限流",
    icon: "🔄",
    description: "进入各种副本世界完成任务，获得奖励不断变强，穿梭于无尽世界",
    category: "玄幻系统",
    tags: ["无限流", "副本", "系统", "穿越"],
    usageCount: 9876,
    rating: 4.8,
    isHot: true,
    prompt: `请根据以下模板生成一个无限流小说大纲。

## 【核心公式】
主神：进入主神空间获得任务
副本：穿梭不同世界完成任务
奖励：完成任务获得强化
成长：不断变强，揭开真相
终极：挑战主神空间真相

## 【无限流核心要素】
- [ ] 主神空间的设定
- [ ] 副本世界的设计
- [ ] 任务系统的设计
- [ ] 奖励机制
- [ ] 队伍/队友设定
- [ ] 主神空间升级

## 【必含元素】
- [ ] 主神空间的激活
- [ ] 第一个副本世界
- [ ] 队友的出场
- [ ] 副本任务的挑战
- [ ] 奖励的获取和使用
- [ ] 副本之间的过渡
- [ ] 主神空间的秘密
- [ ] 终极挑战

## 【节奏建议】
- 前期：熟悉规则 + 第一个副本 + 队友集结
- 中期：多副本挑战 + 实力提升 + 主神秘密揭露
- 后期：挑战主神 + 真相大白 + 终极结局

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 主神空间设定
3. 副本世界设计（至少5个不同世界）
4. 任务体系
5. 奖励机制
6. 队伍设定（至少3个队友）
7. 分卷大纲（按副本序列）
8. 主神秘密的伏笔设计`,
    gradient: "from-cyan-600 to-blue-700",
    coreFormula: "主神空间 → 副本挑战 → 任务完成 → 奖励获取 → 实力提升 → 主神秘密",
    requiredElements: ["主神空间", "副本世界", "任务系统", "队友设定", "奖励机制", "主神秘密"],
    rhythmAdvice: "每个副本要有独特世界观和挑战，主神秘密要分段揭露保持悬念",
    antiTropes: ["副本无难度碾压", "队友全程无存在感", "奖励来得太容易"],
    structureTemplate: "副本串联结构：每个副本独立成篇，通过主神秘密串联成完整故事"
  },
  {
    id: "tpl-sys-task",
    name: "任务达人",
    icon: "📋",
    description: "系统发布各种奇葩任务，完成任务获得奖励，主角在欢声笑语中变强",
    category: "玄幻系统",
    tags: ["系统", "任务", "搞笑", "轻松"],
    usageCount: 7654,
    rating: 4.6,
    prompt: `请根据以下模板生成一个任务达人小说大纲。

## 【核心公式】
系统：发布任务的系统
任务：各种奇葩有趣的任务
奖励：完成任务获得奖励
搞笑：轻松幽默的剧情
变强：在欢乐中不断变强

## 【任务文核心要素】
- [ ] 系统的设定和人格
- [ ] 奇葩任务的设计
- [ ] 奖励的种类和用途
- [ ] 轻松搞笑的氛围
- [ ] 变强的过程

## 【必含元素】
- [ ] 系统的激活
- [ ] 第一个奇葩任务
- [ ] 任务完成的搞笑过程
- [ ] 奖励的获取
- [ ] 更多有趣的任务
- [ ] 在欢乐中变强

## 【节奏建议】
- 前期：系统激活 + 第一个任务
- 中期：奇葩任务 + 搞笑日常
- 后期：高级任务 + 欢乐变强

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 系统设定
3. 任务设计（至少5个奇葩任务）
4. 奖励体系
5. 分卷大纲（3卷）`,
    gradient: "from-yellow-500 to-amber-600",
    coreFormula: "系统激活 → 奇葩任务 → 搞笑完成 → 奖励获取 → 欢乐变强",
    requiredElements: ["系统设定", "奇葩任务", "搞笑氛围", "奖励体系"],
    rhythmAdvice: "任务要奇葩有趣，搞笑要自然不尴尬",
    antiTropes: ["任务太正常", "搞笑强行尴尬", "变强无代价"],
    structureTemplate: "任务串联结构：每个任务独立成篇，通过系统秘密串联"
  },

  // 玄幻重生类
  {
    id: "tpl-reborn-supreme",
    name: "重生之至尊",
    icon: "👑",
    description: "重生回到少年时期，带着前世记忆重新修炼，登临绝顶",
    category: "玄幻重生",
    tags: ["重生", "修炼", "逆袭", "复仇"],
    usageCount: 8765,
    rating: 4.7,
    isHot: true,
    prompt: `请根据以下模板生成一个重生之至尊小说大纲。

## 【核心公式】
重生：带着前世记忆回到过去
逆袭：利用先知优势改变命运
修炼：重新开始修炼之路
复仇：对付前世的仇人
登顶：登临绝顶成为至尊

## 【重生文核心要素】
- [ ] 重生节点的设定
- [ ] 前世记忆的内容
- [ ] 先知优势的使用
- [ ] 修炼路径的重选
- [ ] 复仇计划的设计

## 【必含元素】
- [ ] 重生开局的震撼
- [ ] 前世记忆的展示
- [ ] 先知优势的利用
- [ ] 修炼路径的改变
- [ ] 前世仇人的对付
- [ ] 登临绝顶

## 【节奏建议】
- 前期：重生 + 先知利用 + 初步改变
- 中期：修炼 + 势力发展 + 复仇
- 后期：登顶 + 终极对决 + 至尊

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 重生设定
3. 前世记忆设计
4. 先知优势设计
5. 复仇计划
6. 分卷大纲（3-5卷）`,
    gradient: "from-amber-600 to-red-700",
    coreFormula: "重生 → 先知优势 → 修炼改变 → 复仇 → 登临绝顶",
    requiredElements: ["重生设定", "前世记忆", "先知优势", "复仇计划"],
    rhythmAdvice: "先知优势要合理使用，复仇要有节奏",
    antiTropes: ["先知无代价使用", "重生后直接无敌", "敌人无脑"],
    structureTemplate: "逆袭结构：按复仇阶段分卷，逐步登顶"
  },
  {
    id: "tpl-reborn-young",
    name: "重回少年",
    icon: "⏳",
    description: "回到过去弥补遗憾，不再让悲剧重演，用先知先觉改变人生",
    category: "玄幻重生",
    tags: ["重生", "逆袭", "弥补", "都市"],
    usageCount: 7654,
    rating: 4.6,
    prompt: `请根据以下模板生成一个重回少年小说大纲。

## 【核心公式】
回到：回到过去的特定时刻
遗憾：上一世的遗憾
弥补：改变悲剧的命运
人生：用先知改变人生轨迹
圆满：实现上一世未完成的梦想

## 【重回文核心要素】
- [ ] 回到过去的时间点
- [ ] 上一世遗憾的内容
- [ ] 弥补遗憾的方法
- [ ] 改变人生的过程
- [ ] 圆满结局

## 【必含元素】
- [ ] 回到过去的事件
- [ ] 上一世遗憾的回顾
- [ ] 弥补行动
- [ ] 人生改变
- [ ] 圆满结局

## 【节奏建议】
- 前期：回到过去 + 遗憾回顾
- 中期：弥补行动 + 改变
- 后期：圆满 + 人生升华

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 回到过去设定
3. 遗憾设计
4. 弥补设计
5. 分卷大纲（3卷）`,
    gradient: "from-teal-600 to-cyan-700",
    coreFormula: "回到 → 遗憾 → 弥补 → 改变 → 圆满",
    requiredElements: ["回到设定", "遗憾设计", "弥补行动", "改变"],
    rhythmAdvice: "遗憾要有张力，弥补要有成就感",
    antiTropes: ["遗憾无意义", "弥补无代价", "改变无挑战"],
    structureTemplate: "弥补结构：按弥补阶段分卷"
  },

  // 玄幻异火类
  {
    id: "tpl-fire-alchemy",
    name: "异火炼药师",
    icon: "🔥",
    description: "获得异火成为炼药师，炼制神丹妙药，成为一代药皇",
    category: "玄幻异火",
    tags: ["异火", "炼药", "药师", "升级"],
    usageCount: 8765,
    rating: 4.7,
    isHot: true,
    prompt: `请根据以下模板生成一个异火炼药师小说大纲。

## 【核心公式】
异火：获得神秘的异火
炼药：利用异火炼制丹药
药师：成为一代炼药大师
药皇：炼药领域的巅峰存在

## 【异火文核心要素】
- [ ] 异火的设定（种类、能力、特性）
- [ ] 炼药体系的设定
- [ ] 异火与炼药的结合
- [ ] 丹药的种类和效果
- [ ] 药皇之路

## 【必含元素】
- [ ] 异火的获得
- [ ] 第一次炼药
- [ ] 异火能力的展示
- [ ] 丹药的炼制
- [ ] 炼药大师之路
- [ ] 药皇

## 【节奏建议】
- 前期：异火获得 + 炼药入门
- 中期：炼药精进 + 能力展示
- 后期：药皇 + 终极炼药

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 异火设定
3. 炼药体系
4. 丹药设计
5. 分卷大纲（3卷）`,
    gradient: "from-orange-600 to-red-700",
    coreFormula: "异火 → 炼药 → 丹药 → 炼药大师 → 药皇",
    requiredElements: ["异火设定", "炼药体系", "丹药设计", "药皇之路"],
    rhythmAdvice: "炼药场面要精彩，异火展示要有特色",
    antiTropes: ["异火无代价", "炼药无失败", "丹药无限制"],
    structureTemplate: "炼药成长结构：按炼药层级分卷"
  },
  {
    id: "tpl-fire-blast",
    name: "焚天剑帝",
    icon: "🗡️",
    description: "以火焰入道，一剑焚天，火焰系剑修的崛起之路",
    category: "玄幻异火",
    tags: ["火焰", "剑修", "热血", "逆袭"],
    usageCount: 7654,
    rating: 4.6,
    prompt: `请根据以下模板生成一个焚天剑帝小说大纲。

## 【核心公式】
火焰：以火焰入道的修炼方式
剑修：剑道的修炼者
焚天：一剑焚天的极致威力
崛起：从普通剑修到剑帝的崛起
帝：剑道领域的巅峰存在

## 【火焰剑修核心要素】
- [ ] 火焰剑道的设定
- [ ] 剑道的修炼体系
- [ ] 火焰与剑的结合
- [ ] 剑技的设计
- [ ] 剑帝之路

## 【必含元素】
- [ ] 火焰剑道的觉醒
- [ ] 第一次火焰剑技
- [ ] 火焰剑道的修炼
- [ ] 剑道的进阶
- [ ] 焚天的展示
- [ ] 剑帝

## 【节奏建议】
- 前期：火焰觉醒 + 剑道入门
- 中期：火焰剑道 + 修炼
- 后期：焚天 + 剑帝

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 火焰剑道设定
3. 剑道体系
4. 剑技设计
5. 分卷大纲（3卷）`,
    gradient: "from-red-600 to-orange-700",
    coreFormula: "火焰 → 剑道 → 修炼 → 焚天 → 剑帝",
    requiredElements: ["火焰设定", "剑道体系", "火焰剑技", "焚天"],
    rhythmAdvice: "剑战场面要精彩，火焰展示要有威力感",
    antiTropes: ["火焰无代价", "剑道无挑战", "焚天无悬念"],
    structureTemplate: "剑道进阶结构：按剑道层级分卷"
  },

  // 玄幻血脉类
  {
    id: "tpl-blood-supreme",
    name: "血脉觉醒",
    icon: "🩸",
    description: "体内沉睡的强大血脉觉醒，从此走上觉醒者之路",
    category: "玄幻血脉",
    tags: ["血脉", "觉醒", "异能", "逆袭"],
    usageCount: 9876,
    rating: 4.8,
    isHot: true,
    prompt: `请根据以下模板生成一个血脉觉醒小说大纲。

## 【核心公式】
血脉：体内沉睡强大血脉
觉醒：血脉觉醒获得力量
修炼：血脉之力的运用
觉醒：血脉不断进化
终极：血脉本源的力量

## 【血脉觉醒核心要素】
- [ ] 血脉的来源和等级
- [ ] 血脉觉醒的契机
- [ ] 血脉能力的设定
- [ ] 血脉进化的条件
- [ ] 血脉觉醒的代价

## 【必含元素】
- [ ] 血脉觉醒的震撼场面
- [ ] 血脉能力的展示
- [ ] 与其他血脉者的相遇
- [ ] 血脉进化的条件
- [ ] 血脉与身体的冲突
- [ ] 终极血脉的秘密

## 【节奏建议】
- 前期：血脉觉醒 + 能力熟悉
- 中期：血脉进化 + 血脉者相遇
- 后期：血脉本源 + 终极觉醒

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 血脉设定（来源、等级）
3. 血脉能力设计
4. 血脉进化条件
5. 分卷大纲（3卷）
6. 血脉者对手设计`,
    gradient: "from-red-600 to-pink-700",
    coreFormula: "血脉觉醒 → 能力掌控 → 血脉进化 → 血脉者对决 → 终极本源",
    requiredElements: ["血脉设定", "觉醒契机", "血脉能力", "进化条件"],
    rhythmAdvice: "觉醒场面要震撼，进化要有代价和能力提升",
    antiTropes: ["血脉无代价觉醒", "血脉无限制使用"],
    structureTemplate: "血脉进阶结构：按血脉觉醒等级分卷"
  },
  {
    id: "tpl-blood-dragon",
    name: "龙血战士",
    icon: "🐲",
    description: "获得龙族血脉，成为龙血战士，在战斗中获得力量",
    category: "玄幻血脉",
    tags: ["龙血", "血脉", "战斗", "升级"],
    usageCount: 8765,
    rating: 4.7,
    prompt: `请根据以下模板生成一个龙血战士小说大纲。

## 【核心公式】
龙血：获得龙族血脉
战士：成为龙血战士
战斗：战斗中获得成长
进化：龙血不断进化
龙魂：觉醒龙魂之力

## 【龙血战士核心要素】
- [ ] 龙血的来源和特性
- [ ] 龙血战士的设定
- [ ] 战斗系统的设计
- [ ] 龙血进化的方式
- [ ] 龙魂的觉醒

## 【必含元素】
- [ ] 龙血的获得
- [ ] 龙血战士的觉醒
- [ ] 第一次龙血战斗
- [ ] 龙血进化
- [ ] 龙魂觉醒
- [ ] 龙血战士的巅峰

## 【节奏建议】
- 前期：龙血获得 + 战士觉醒
- 中期：战斗成长 + 龙血进化
- 后期：龙魂觉醒 + 巅峰

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 龙血设定
3. 战士设定
4. 战斗系统
5. 分卷大纲（3卷）`,
    gradient: "from-slate-600 to-gray-700",
    coreFormula: "龙血 → 战士 → 战斗成长 → 进化 → 龙魂",
    requiredElements: ["龙血设定", "战士体系", "战斗系统", "进化方式"],
    rhythmAdvice: "战斗场面要热血，龙血展示要有力量感",
    antiTropes: ["龙血无代价", "战斗无挑战", "进化无限制"],
    structureTemplate: "战士成长结构：按龙血层级分卷"
  },

  // 玄幻阵法类
  {
    id: "tpl-formation-master",
    name: "阵法师",
    icon: "☯️",
    description: "成为阵法师，布阵困敌破阵，在阵法之道上登峰造极",
    category: "玄幻阵法",
    tags: ["阵法", "布阵", "修炼", "策略"],
    usageCount: 6543,
    rating: 4.5,
    prompt: `请根据以下模板生成一个阵法师小说大纲。

## 【核心公式】
阵法：布阵困敌破阵的能力
法师：精通阵法之道的法师
修炼：阵法之道的修炼
策略：以阵法战胜强敌
大师：阵法之道的巅峰存在

## 【阵法师核心要素】
- [ ] 阵法体系的设定
- [ ] 布阵的规则和限制
- [ ] 破阵的方法
- [ ] 阵法种类的设计
- [ ] 策略战斗的展示

## 【必含元素】
- [ ] 阵法天赋的觉醒
- [ ] 第一次布阵
- [ ] 阵法困敌
- [ ] 破阵挑战
- [ ] 阵法大师之路

## 【节奏建议】
- 前期：天赋觉醒 + 布阵入门
- 中期：阵法精进 + 策略战斗
- 后期：阵法大师 + 终极阵法

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 阵法设定
3. 阵法体系
4. 布阵规则
5. 分卷大纲（3卷）`,
    gradient: "from-blue-600 to-indigo-700",
    coreFormula: "阵法 → 布阵 → 困敌 → 破阵 → 阵法大师",
    requiredElements: ["阵法设定", "布阵规则", "阵法体系", "策略战斗"],
    rhythmAdvice: "布阵场面要精彩，策略展示要有智慧感",
    antiTropes: ["布阵无代价", "阵法无限制", "破阵无难度"],
    structureTemplate: "阵法进阶结构：按阵法层级分卷"
  },
  {
    id: "tpl-formation-trap",
    name: "万阵之王",
    icon: "🔮",
    description: "精通万阵之道，一念之间布下万千阵法，以阵称王",
    category: "玄幻阵法",
    tags: ["阵法", "布阵", "称王", "策略"],
    usageCount: 5432,
    rating: 4.4,
    isNew: true,
    prompt: `请根据以下模板生成一个万阵之王小说大纲。

## 【核心公式】
万阵：精通万种阵法
之王：一念布阵的能力
阵法：万千阵法的极致
称王：以阵称王的霸业

## 【万阵之王核心要素】
- [ ] 万阵体系的设定
- [ ] 一念布阵的能力
- [ ] 阵法的种类和威力
- [ ] 称王之路
- [ ] 终极阵法

## 【必含元素】
- [ ] 阵法天赋
- [ ] 万阵的修炼
- [ ] 一念布阵
- [ ] 阵法称王
- [ ] 终极阵法

## 【节奏建议】
- 前期：阵法天赋 + 入门
- 中期：万阵修炼 + 一念布阵
- 后期：称王 + 终极

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 万阵设定
3. 一念布阵
4. 阵法种类
5. 分卷大纲（3卷）`,
    gradient: "from-violet-600 to-purple-700",
    coreFormula: "万阵 → 一念 → 布阵 → 称王 → 终极",
    requiredElements: ["万阵设定", "一念布阵", "阵法种类"],
    rhythmAdvice: "布阵场面要宏大，一念布阵要有震撼感",
    antiTropes: ["万阵无代价", "布阵无限制"],
    structureTemplate: "阵法进阶结构：按阵法层级分卷"
  },

  // 都市总裁类
  {
    id: "tpl-ceo-sweet",
    name: "总裁的小甜妻",
    icon: "💝",
    description: "契约结婚先婚后爱，总裁老公实力宠妻，甜到掉牙",
    category: "都市总裁",
    tags: ["总裁", "甜宠", "契约", "先婚后爱"],
    usageCount: 12345,
    rating: 4.9,
    isHot: true,
    prompt: `请根据以下模板生成一个总裁的小甜妻小说大纲。

## 【核心公式】
契约：契约结婚成为夫妻
相处：从陌生到熟悉，从契约到真心
甜蜜：各种宠溺互动，甜到掉牙
误会：身份/误解带来的波折
圆满：真心相爱，幸福在一起

## 【甜宠文核心要素】
- [ ] 契约结婚的前提设定
- [ ] 男主的宠妻行为设计
- [ ] 女主的可爱/独立特质
- [ ] 甜蜜互动的名场面
- [ ] 误会的设计
- [ ] 真心的告白

## 【必含元素】
- [ ] 契约结婚的原因和条件
- [ ] 第一次同居的尴尬
- [ ] 男主宠妻的名场面（至少5个）
- [ ] 女主的小心机/可爱表现
- [ ] 外部情敌的挑衅
- [ ] 契约解除的危机
- [ ] 真心告白
- [ ] 圆满结局

## 【节奏建议】
- 前期：契约签订 + 同居相处 + 好感萌芽
- 中期：甜蜜日常 + 情敌出现 + 小波折
- 后期：契约危机 + 真心告白 + 圆满

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 人物设定（男女主性格、职业、背景）
3. 契约设定（结婚原因、期限、条件）
4. 甜蜜场景清单（至少8个）
5. 误会/危机设计
6. 分卷大纲（3卷）
7. 甜点按章节分布表`,
    gradient: "from-pink-500 to-rose-600",
    coreFormula: "契约结婚 → 同居相处 → 甜蜜互动 → 危机波折 → 真心告白 → 圆满",
    requiredElements: ["契约设定", "同居日常", "宠妻名场面", "情敌挑衅", "真心告白"],
    rhythmAdvice: "甜蜜日常要密集，每10章至少3个甜点，危机后要有加倍甜蜜",
    antiTropes: ["男主冷血无情", "女主傻白甜", "误会拖到几百章"],
    structureTemplate: "感情线驱动：按关系发展阶段分卷，每卷有核心甜蜜场景和危机设计"
  },
  {
    id: "tpl-ceo-pregnant",
    name: "一胎二宝",
    icon: "👶",
    description: "带球跑后归来，总裁爹地追妻火葬场，一双萌宝神助攻",
    category: "都市总裁",
    tags: ["总裁", "萌宝", "带球跑", "追妻"],
    usageCount: 11234,
    rating: 4.8,
    isHot: true,
    prompt: `请根据以下模板生成一个一胎二宝小说大纲。

## 【核心公式】
带球跑：带着孩子离开
归来：多年后回归
追妻：总裁爹地追妻火葬场
萌宝：一双萌宝神助攻
圆满：一家四口的幸福

## 【萌宝文核心要素】
- [ ] 带球跑的原因
- [ ] 萌宝的设定
- [ ] 追妻火葬场
- [ ] 萌宝助攻
- [ ] 身份揭秘

## 【必含元素】
- [ ] 带球跑的原因
- [ ] 萌宝的出生
- [ ] 多年后归来
- [ ] 总裁追妻
- [ ] 萌宝助攻
- [ ] 圆满结局

## 【节奏建议】
- 前期：归来 + 相遇
- 中期：追妻 + 萌宝助攻
- 后期：真相 + 圆满

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 带球跑设定
3. 萌宝设定
4. 追妻设计
5. 分卷大纲（3卷）`,
    gradient: "from-pink-400 to-rose-500",
    coreFormula: "带球跑 → 归来 → 追妻 → 助攻 → 圆满",
    requiredElements: ["带球跑", "萌宝", "追妻", "助攻"],
    rhythmAdvice: "追妻要虐心，萌宝要可爱",
    antiTropes: ["追妻无意义", "萌宝无存在感", "真相无悬念"],
    structureTemplate: "追妻结构：按追妻阶段分卷"
  },
  {
    id: "tpl-ceo-divorce",
    name: "离婚后我红了",
    icon: "💄",
    description: "被净身出户后女主逆袭成为顶流明星，前夫后悔求复合",
    category: "都市总裁",
    tags: ["总裁", "离婚", "逆袭", "娱乐圈"],
    usageCount: 9876,
    rating: 4.7,
    prompt: `请根据以下模板生成一个离婚后我红了小说大纲。

## 【核心公式】
离婚：被净身出户
逆袭：逆袭成为顶流明星
打脸：让前夫后悔
翻身：从被嫌弃到被追求
圆满：找到真爱

## 【逆袭文核心要素】
- [ ] 离婚的原因
- [ ] 逆袭的领域（娱乐圈/事业）
- [ ] 前夫的设定
- [ ] 打脸的设计
- [ ] 真爱的出现

## 【必含元素】
- [ ] 离婚的羞辱
- [ ] 逆袭的开始
- [ ] 走红的过程
- [ ] 前夫后悔
- [ ] 真爱出现

## 【节奏建议】
- 前期：离婚 + 逆袭开始
- 中期：走红 + 前夫出现
- 后期：打脸 + 圆满

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 离婚设定
3. 逆袭设计
4. 打脸设计
5. 分卷大纲（3卷）`,
    gradient: "from-red-500 to-pink-600",
    coreFormula: "离婚 → 逆袭 → 走红 → 打脸 → 圆满",
    requiredElements: ["离婚设定", "逆袭设计", "打脸设计", "真爱"],
    rhythmAdvice: "逆袭要有落差感，打脸要密集",
    antiTropes: ["逆袭无代价", "打脸无铺垫", "前夫无脑"],
    structureTemplate: "逆袭结构：按逆袭阶段分卷"
  },

  // 都市闪婚类
  {
    id: "tpl-flash-marry",
    name: "闪婚甜宠",
    icon: "💒",
    description: "闪婚嫁给陌生人，却发现对方是隐藏大佬，甜宠日常",
    category: "都市闪婚",
    tags: ["闪婚", "甜宠", "隐藏身份", "豪门"],
    usageCount: 8765,
    rating: 4.6,
    prompt: `请根据以下模板生成一个闪婚甜宠小说大纲。

## 【核心公式】
闪婚：意外闪婚嫁给陌生人
隐藏：对方是隐藏大佬
大佬：隐藏身份的揭示
甜宠：甜蜜宠溺的日常
圆满：真心相爱的幸福

## 【闪婚文核心要素】
- [ ] 闪婚的原因
- [ ] 隐藏大佬的身份设定
- [ ] 隐藏揭露的过程
- [ ] 甜宠日常的设计
- [ ] 真心相爱

## 【必含元素】
- [ ] 闪婚的原因
- [ ] 隐藏身份的发现
- [ ] 隐藏揭露
- [ ] 甜宠日常
- [ ] 圆满结局

## 【节奏建议】
- 前期：闪婚 + 隐藏发现
- 中期：隐藏揭露 + 甜宠
- 后期：真心 + 圆满

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 闪婚设定
3. 大佬设定
4. 甜宠设计
5. 分卷大纲（3卷）`,
    gradient: "from-rose-500 to-pink-600",
    coreFormula: "闪婚 → 隐藏发现 → 揭露 → 甜宠 → 圆满",
    requiredElements: ["闪婚设定", "大佬身份", "甜宠设计"],
    rhythmAdvice: "隐藏揭露要有张力，甜宠要有糖分",
    antiTropes: ["隐藏无代价", "大佬无理由宠", "甜宠无层次"],
    structureTemplate: "闪婚结构：按闪婚阶段分卷"
  },
  {
    id: "tpl-flash-contract",
    name: "契约夫妻",
    icon: "📝",
    description: "假结婚签契约，结果假戏真做，从契约关系到真心相爱",
    category: "都市闪婚",
    tags: ["闪婚", "契约", "假戏真做", "甜宠"],
    usageCount: 7654,
    rating: 4.6,
    prompt: `请根据以下模板生成一个契约夫妻小说大纲。

## 【核心公式】
契约：假结婚签契约
夫妻：从契约到真心
假戏：假装恩爱的日常
真做：假戏真做的转变
圆满：真心相爱的幸福

## 【契约文核心要素】
- [ ] 契约的原因
- [ ] 假装恩爱的日常
- [ ] 假戏真做的转变
- [ ] 真心告白
- [ ] 契约解除

## 【必含元素】
- [ ] 契约的原因
- [ ] 假装恩爱的日常
- [ ] 真心萌芽
- [ ] 假戏真做
- [ ] 圆满结局

## 【节奏建议】
- 前期：契约 + 假装恩爱
- 中期：真心萌芽 + 矛盾
- 后期：假戏真做 + 圆满

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 契约设定
3. 假装恩爱设计
4. 真心转变
5. 分卷大纲（3卷）`,
    gradient: "from-pink-500 to-purple-600",
    coreFormula: "契约 → 假装恩爱 → 真心萌芽 → 假戏真做 → 圆满",
    requiredElements: ["契约设定", "假装恩爱", "真心转变"],
    rhythmAdvice: "假装恩爱要有趣，转变要自然",
    antiTropes: ["契约无意义", "假装无趣味", "转变无铺垫"],
    structureTemplate: "契约结构：按契约阶段分卷"
  },

  // 古言甜宠类
  {
    id: "tpl-ancient-sweet",
    name: "锦绣未央",
    icon: "🌺",
    description: "穿越到古代成为相府嫡女，与皇子展开甜蜜爱情",
    category: "古言甜宠",
    tags: ["穿越", "古言", "甜宠", "皇子"],
    usageCount: 9876,
    rating: 4.8,
    isHot: true,
    prompt: `请根据以下模板生成一个锦绣未央小说大纲。

## 【核心公式】
穿越：现代人穿越到古代相府
逆袭：从相府嫡女到皇子妃
宫斗：后宫的权谋斗争
甜蜜：与皇子的甜蜜爱情
结局：成为皇妃，圆满人生

## 【古言穿越核心要素】
- [ ] 穿越身份的设定
- [ ] 相府的复杂关系
- [ ] 皇子的设定
- [ ] 宫斗的设计
- [ ] 甜蜜爱情的展开

## 【必含元素】
- [ ] 穿越到相府嫡女
- [ ] 与皇子的相遇
- [ ] 宫斗的参与
- [ ] 甜蜜互动
- [ ] 圆满结局

## 【节奏建议】
- 前期：穿越 + 相府适应
- 中期：宫斗 + 皇子互动
- 后期：甜蜜 + 圆满

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 穿越设定
3. 皇子设定
4. 宫斗设计
5. 分卷大纲（3卷）`,
    gradient: "from-pink-500 to-rose-600",
  },
  {
    id: "tpl-ancient-wife",
    name: "侯门主母",
    icon: "🏛️",
    description: "成为侯门主母，在复杂的家族关系中周旋，最终收获幸福",
    category: "古言甜宠",
    tags: ["古言", "侯门", "主母", "甜宠"],
    usageCount: 7654,
    rating: 4.6,
    prompt: `请根据以下模板生成一个侯门主母小说大纲。

## 【核心公式】
主母：成为侯门主母
周旋：在复杂家族中周旋
智谋：展现管家智慧
逆袭：从被动到主动
幸福：收获家族尊重和幸福

## 【宅斗核心要素】
- [ ] 侯门家族的设定
- [ ] 主母身份的挑战
- [ ] 家族关系的复杂
- [ ] 管家智慧
- [ ] 收获幸福

## 【必含元素】
- [ ] 成为主母
- [ ] 家族周旋
- [ ] 智慧展示
- [ ] 收获幸福

## 【节奏建议】
- 前期：主母适应 + 家族关系
- 中期：周旋 + 智慧展示
- 后期：收获 + 幸福

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 侯门设定
3. 主母挑战
4. 智慧设计
5. 分卷大纲（3卷）`,
    gradient: "from-amber-500 to-orange-600",
  },
  {
    id: "tpl-ancient-marry",
    name: "下堂妇",
    icon: "📜",
    description: "被休下堂后女主自强不息，最终成就一番事业并收获真爱",
    category: "古言甜宠",
    tags: ["古言", "下堂", "逆袭", "自强"],
    usageCount: 6543,
    rating: 4.5,
    prompt: `请根据以下模板生成一个下堂妇小说大纲。

## 【核心公式】
下堂：被休下堂的羞辱
自强：自强不息的努力
逆袭：从被嫌弃到被尊重
事业：成就一番事业
幸福：收获真爱和尊重

## 【逆袭文核心要素】
- [ ] 下堂的原因
- [ ] 自强的过程
- [ ] 事业的成就
- [ ] 真爱的出现
- [ ] 打脸设计

## 【必含元素】
- [ ] 下堂的羞辱
- [ ] 自强的过程
- [ ] 事业成就
- [ ] 真爱出现
- [ ] 打脸

## 【节奏建议】
- 前期：下堂 + 自强
- 中期：事业 + 真爱
- 后期：打脸 + 圆满

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 下堂设定
3. 自强设计
4. 事业设计
5. 分卷大纲（3卷）`,
    gradient: "from-emerald-500 to-teal-600",
  },

  // 古言权谋类
  {
    id: "tpl-ancient-intrigue",
    name: "凤谋天下",
    icon: "🦚",
    description: "步步为营的后宫争斗，从宫女到皇后的逆袭之路",
    category: "古言权谋",
    tags: ["古言", "宫斗", "权谋", "皇后"],
    usageCount: 8765,
    rating: 4.7,
    isHot: true,
    prompt: `请根据以下模板生成一个凤谋天下小说大纲。

## 【核心公式】
凤谋：步步为营的后宫争斗
逆袭：从宫女到皇后的逆袭
权谋：后宫的权力斗争
智慧：展现后宫女主的智慧
结局：成为皇后，凤临天下

## 【宫斗核心要素】
- [ ] 后宫格局的设定
- [ ] 女主的智慧和策略
- [ ] 权谋的设计
- [ ] 皇帝的设定
- [ ] 从宫女到皇后的成长

## 【必含元素】
- [ ] 宫女身份
- [ ] 后宫争斗
- [ ] 智慧展示
- [ ] 皇后之路
- [ ] 凤临天下

## 【节奏建议】
- 前期：宫女 + 初步争斗
- 中期：权谋 + 智慧展示
- 后期：皇后 + 凤谋

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 后宫设定
3. 女主智慧
4. 权谋设计
5. 分卷大纲（3卷）`,
    gradient: "from-red-600 to-rose-700",
  },
  {
    id: "tpl-ancient-kingdom",
    name: "女帝传",
    icon: "👸",
    description: "从不受宠的公主到登基为帝，一代女帝的传奇人生",
    category: "古言权谋",
    tags: ["古言", "女帝", "权谋", "公主"],
    usageCount: 9876,
    rating: 4.8,
    prompt: `请根据以下模板生成一个女帝传小说大纲。

## 【核心公式】
公主：不受宠的公主
逆袭：从公主到女帝的逆袭
权谋：政治斗争的智慧
成长：从软弱到坚强的蜕变
帝业：登基为帝的传奇

## 【女帝文核心要素】
- [ ] 公主身份的设定
- [ ] 逆袭的历程
- [ ] 权谋的设计
- [ ] 女帝的成长
- [ ] 帝国的建立

## 【必含元素】
- [ ] 公主身份
- [ ] 逆袭开始
- [ ] 权谋斗争
- [ ] 女帝成长
- [ ] 登基为帝

## 【节奏建议】
- 前期：公主 + 逆境
- 中期：逆袭 + 权谋
- 后期：女帝 + 传奇

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 公主设定
3. 逆袭设计
4. 权谋设计
5. 分卷大纲（3卷）`,
    gradient: "from-amber-600 to-red-700",
  },

  // 都市悬疑类
  {
    id: "tpl-mystery-apartment",
    name: "凶宅笔记",
    icon: "🏚️",
    description: "专门处理凶宅事件的风水师，在一桩桩灵异事件中揭开真相",
    category: "都市悬疑",
    tags: ["悬疑", "凶宅", "灵异", "风水"],
    usageCount: 6543,
    rating: 4.6,
    prompt: `请根据以下模板生成一个凶宅笔记小说大纲。

## 【核心公式】
凶宅：专门处理凶宅事件
风水：风水师的身份
灵异：揭开灵异真相
成长：风水能力的提升
真相：凶宅背后的秘密

## 【灵异文核心要素】
- [ ] 凶宅的设定
- [ ] 风水师身份的设定
- [ ] 灵异事件的类型
- [ ] 真相的揭露
- [ ] 能力的提升

## 【必含元素】
- [ ] 凶宅事件
- [ ] 风水展示
- [ ] 灵异真相
- [ ] 能力提升
- [ ] 真相揭露

## 【节奏建议】
- 前期：凶宅 + 风水展示
- 中期：灵异 + 真相
- 后期：能力 + 终极真相

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 凶宅设定
3. 风水体系
4. 灵异设计
5. 分卷大纲（3卷）`,
    gradient: "from-gray-700 to-slate-800",
  },
  {
    id: "tpl-mystery-night",
    name: "深夜它来了",
    icon: "🌙",
    description: "深夜时分发生的诡异事件，每晚准时上演的恐怖故事",
    category: "都市悬疑",
    tags: ["悬疑", "深夜", "灵异", "恐怖"],
    usageCount: 5432,
    rating: 4.5,
    prompt: `请根据以下模板生成一个深夜它来了小说大纲。

## 【核心公式】
深夜：深夜时分发生的诡异
诡异：各种灵异事件
真相：揭开诡异的真相
恐惧：营造恐怖氛围
结局：真相大白或永远未知

## 【恐怖文核心要素】
- [ ] 深夜世界的设定
- [ ] 诡异事件的类型
- [ ] 恐怖氛围的营造
- [ ] 真相的揭露
- [ ] 恐惧与揭秘的平衡

## 【必含元素】
- [ ] 深夜诡异
- [ ] 恐怖氛围
- [ ] 灵异探索
- [ ] 真相揭露
- [ ] 恐怖结局

## 【节奏建议】
- 前期：诡异 + 恐怖
- 中期：探索 + 恐惧
- 后期：真相 + 结局

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 深夜设定
3. 诡异设计
4. 恐怖氛围
5. 分卷大纲（3卷）`,
    gradient: "from-slate-700 to-gray-800",
  },

  // 穿越异世类
  {
    id: "tpl-trans-other",
    name: "异世为王",
    icon: "🌍",
    description: "穿越到异世界，凭借智慧和实力成为一方王者",
    category: "穿越异世",
    tags: ["穿越", "异世", "称王", "冒险"],
    usageCount: 8765,
    rating: 4.7,
    isHot: true,
    prompt: `请根据以下模板生成一个异世为王小说大纲。

## 【核心公式】
异世：穿越到异世界
为王：凭借智慧和实力成为王者
智慧：运用智慧解决问题
实力：不断提升实力
称王：建立势力，最终称王

## 【异世文核心要素】
- [ ] 异世界的设定
- [ ] 王者之路的设计
- [ ] 智慧与实力的平衡
- [ ] 势力的建立
- [ ] 称王的过程

## 【必含元素】
- [ ] 异世界
- [ ] 智慧展示
- [ ] 实力提升
- [ ] 势力建立
- [ ] 称王

## 【节奏建议】
- 前期：异世界 + 智慧
- 中期：实力 + 势力
- 后期：称王 + 传奇

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 异世界设定
3. 王者之路
4. 势力设计
5. 分卷大纲（3卷）`,
    gradient: "from-amber-600 to-orange-700",
  },
  {
    id: "tpl-trans-gaming",
    name: "转生史莱姆",
    icon: "🫧",
    description: "转生为史莱姆，在异世界从最低级生物成长为顶级存在",
    category: "穿越异世",
    tags: ["转生", "异世", "史莱姆", "冒险"],
    usageCount: 9876,
    rating: 4.8,
    isHot: true,
    prompt: `请根据以下模板生成一个转生史莱姆小说大纲。

## 【核心公式】
转生：转生为最弱小的生物（史莱姆）
觉醒：获得特殊能力/进化能力
成长：通过吞噬/进化不断变强
崛起：建立势力，成为顶级存在
结局：成为世界最强/建国/飞升

## 【史莱姆文核心要素】
- [ ] 转生设定和初始能力
- [ ] 进化系统的设计
- [ ] 吞噬能力的多种用法
- [ ] 势力的建立
- [ ] 与其他种族的互动

## 【必含元素】
- [ ] 转生为史莱姆的开局
- [ ] 独特能力的发现
- [ ] 第一次吞噬和进化
- [ ] 遇到的第一个同伴/敌人
- [ ] 势力的雏形
- [ ] 与其他魔物的冲突
- [ ] 进化链的设计
- [ ] 终极目标

## 【节奏建议】
- 前期：弱小生存 + 能力觉醒 + 第一次进化
- 中期：建立势力 + 吞噬扩张 + 势力对抗
- 后期：成为顶级 + 终极挑战 + 结局

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 转生设定
3. 史莱姆能力设计（核心技能树）
4. 进化链设计
5. 势力设定
6. 同伴/敌人设计
7. 分卷大纲（3-5卷）
8. 核心爽点清单
9. 世界观设计`,
    gradient: "from-green-500 to-emerald-600",
    coreFormula: "转生史莱姆 → 能力觉醒 → 吞噬进化 → 建立势力 → 成为顶级 → 终极目标",
    requiredElements: ["史莱姆能力", "进化系统", "吞噬机制", "势力建立", "同伴设定"],
    rhythmAdvice: "前期成长要密集展现，中期势力扩张要有波澜，后期终极目标要震撼",
    antiTropes: ["开局就无敌", "吞噬无代价", "势力扩张无阻力"],
    structureTemplate: "成长驱动结构：按进化阶段分卷，每卷有核心挑战和势力发展"
  },
  {
    id: "tpl-trans-legend",
    name: "转生勇者",
    icon: "🛡️",
    description: "带着前世记忆转生为勇者，弥补前世遗憾，成为最强的勇者",
    category: "穿越异世",
    tags: ["转生", "勇者", "异世", "冒险"],
    usageCount: 8765,
    rating: 4.7,
    prompt: `请根据以下模板生成一个转生勇者小说大纲。

## 【核心公式】
转生：带着前世记忆转生为勇者
前世：前世的遗憾
弥补：弥补前世遗憾
成长：成长为最强勇者
结局：弥补遗憾的圆满结局

## 【转生勇者核心要素】
- [ ] 转生设定的设计
- [ ] 前世遗憾的内容
- [ ] 弥补遗憾的过程
- [ ] 勇者的成长
- [ ] 圆满结局

## 【必含元素】
- [ ] 转生到勇者的身份
- [ ] 前世遗憾的回顾
- [ ] 弥补行动
- [ ] 勇者成长
- [ ] 圆满结局

## 【节奏建议】
- 前期：转生 + 前世回顾
- 中期：弥补 + 成长
- 后期：圆满 + 结局

## 【输出要求】
请按以下结构输出：
1. 一句话故事（30字以内）
2. 转生设定
3. 前世设计
4. 弥补设计
5. 分卷大纲（3卷）`,
    gradient: "from-blue-600 to-indigo-700",
    coreFormula: "转生 → 前世 → 弥补 → 成长 → 圆满",
    requiredElements: ["转生设定", "前世", "弥补", "成长"],
    rhythmAdvice: "遗憾要有张力，弥补要有成就感",
    antiTropes: ["遗憾无意义", "弥补无代价"],
    structureTemplate: "弥补结构：按弥补阶段分卷"
  },
];

// ============================================================
// 模板市场状态
// ============================================================

const emit = defineEmits<{
  (e: 'openProOutliner', template: WritingTemplate): void;
}>();

// Open ProOutliner with current template
function handleOpenProOutliner() {
  if (selectedTemplate.value) {
    emit('openProOutliner', selectedTemplate.value);
    message.success(t('quickStart.openedInPro'));
  }
}

const templateSearchQuery = ref("");
const templateSelectedCategory = ref<string | null>(null);

// 模板分类
const templateCategories = computed(() => {
  const cats = [...new Set(writingTemplates.map((t) => t.category))];
  return cats;
});

// 过滤后的模板列表
const filteredTemplates = computed(() => {
  let result = writingTemplates;

  // 搜索过滤
  if (templateSearchQuery.value) {
    const query = templateSearchQuery.value.toLowerCase();
    result = result.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }

  // 分类过滤
  if (templateSelectedCategory.value) {
    result = result.filter((t) => t.category === templateSelectedCategory.value);
  }

  return result;
});

// 格式化使用人数
function formatUsageCount(count: number): string {
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}万`;
  }
  return count.toString();
}

// 选择分类
function selectTemplateCategory(category: string | null) {
  templateSelectedCategory.value = category;
}

// 清除搜索
function clearTemplateSearch() {
  templateSearchQuery.value = "";
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <div
          class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center"
        >
          <Wand2 class="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 class="font-semibold text-gray-900 dark:text-white">
            {{ t("quickStart.title") }}
          </h3>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            {{ t("quickStart.description") }}
          </p>
        </div>
      </div>
      <div class="relative">
        <NButton
          v-if="savedDraft"
          quaternary
          circle
          @click="showDraftMenu = !showDraftMenu"
        >
          <template #icon>
            <BookOpen class="w-4 h-4 text-amber-500" />
          </template>
        </NButton>
        <div
          v-if="showDraftMenu"
          class="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10"
        >
          <NButton
            quaternary
            block
            @click="loadDraft"
          >
            <template #icon>
              <BookOpen class="w-4 h-4" />
            </template>
            加载草稿
          </NButton>
          <NButton
            quaternary
            block
            @click="clearDraft"
          >
            <template #icon>
              <RotateCcw class="w-4 h-4" />
            </template>
            清除草稿
          </NButton>
        </div>
      </div>
    </div>

    <!-- Tab Switcher -->
    <div class="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
      <button
        class="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
        :class="activeTab === 'wizard' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
        @click="switchTab('wizard')"
      >
        <Sparkles class="w-4 h-4" />
        三步法
      </button>
      <button
        class="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
        :class="activeTab === 'templates' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
        @click="switchTab('templates')"
      >
        {{ t("quickStart.templateMarket") }}
      </button>
      <button
        class="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
        :class="activeTab === 'custom' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
        @click="switchTab('custom')"
      >
        {{ t("quickStart.customInput") }}
      </button>
    </div>

    <!-- Wizard Tab -->
    <div v-if="activeTab === 'wizard' && showWizard" class="space-y-4">
      <StepWizard
        ref="wizardRef"
        :is-generating="isProcessing"
        @complete="handleWizardComplete"
        @back="handleWizardBack"
      />

      <!-- Generated Outlines Display -->
      <OutlineDisplay
        v-if="generatedOutlines.length > 0 || isProcessing"
        :outlines="generatedOutlines"
        :selected-outline="selectedOutline ?? null"
        :is-generating="!!isProcessing"
        :progress="generationProgress || ''"
        :error="combinedError"
        :show-word-count="true"
        :show-streaming-preview="true"
        :disable-regenerate="isProcessing"
        @select="selectOutline"
        @regenerate="handleGenerateOutlines"
        @create="handleCreateProject"
      />
    </div>

    <!-- Templates Tab -->
    <div v-else-if="activeTab === 'templates'" class="space-y-3">
      <!-- Search Bar -->
      <div class="relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          v-model="templateSearchQuery"
          type="text"
          placeholder="搜索模板..."
          class="w-full pl-10 pr-8 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
        />
        <button
          v-if="templateSearchQuery"
          class="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          @click="clearTemplateSearch"
        >
          <X class="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <!-- Categories - 全部展示，不滚动 -->
      <div class="flex flex-wrap gap-2">
        <button
          class="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
          :class="templateSelectedCategory === null
            ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
          @click="selectTemplateCategory(null)"
        >
          全部
        </button>
        <button
          v-for="cat in templateCategories"
          :key="cat"
          class="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
          :class="templateSelectedCategory === cat
            ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
          @click="selectTemplateCategory(cat)"
        >
          {{ cat }}
        </button>
      </div>

      <!-- Template Results Count -->
      <div class="text-xs text-gray-400 dark:text-gray-500">
        共 {{ filteredTemplates.length }} 个模板
      </div>

      <!-- Templates Grid -->
      <div class="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-1">
        <div
          v-for="template in filteredTemplates"
          :key="template.id"
          class="p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer relative"
          :class="selectedTemplate?.id === template.id
            ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20'
            : 'border-gray-100 dark:border-gray-800 hover:border-indigo-200 dark:hover:border-indigo-800'"
          @click="selectTemplate(template)"
        >
          <!-- Badge -->
          <div class="absolute top-2 right-2 flex gap-1">
            <span v-if="template.isHot" class="px-1.5 py-0.5 rounded text-xs bg-orange-500 text-white">
              热
            </span>
            <span v-if="template.isNew" class="px-1.5 py-0.5 rounded text-xs bg-green-500 text-white">
              新
            </span>
          </div>

          <!-- Header: Icon + Title -->
          <div class="flex items-center gap-3">
            <div
              class="w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-2xl flex-shrink-0"
              :class="`bg-gradient-to-br ${template.gradient}`"
            >
              {{ template.icon }}
            </div>
            <div class="flex-1 min-w-0">
              <h4 class="font-semibold text-gray-900 dark:text-white">{{ template.name }}</h4>
              <p class="text-xs text-gray-500 dark:text-gray-400">{{ template.category }}</p>
            </div>
          </div>

          <!-- Description - 不截断完整显示 -->
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1 mb-3 leading-relaxed">
            {{ template.description }}
          </p>

          <!-- Footer: Tags + Usage -->
          <div class="flex items-center justify-between">
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="tag in template.tags.slice(0, 4)"
                :key="tag"
                class="px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              >
                {{ tag }}
              </span>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="filteredTemplates.length === 0" class="text-center py-8">
          <Search class="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p class="text-sm text-gray-500 dark:text-gray-400">
            未找到匹配的模板
          </p>
          <button
            class="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            @click="clearTemplateSearch"
          >
            清除搜索
          </button>
        </div>
      </div>

      <!-- Template Detail -->
      <div
        v-if="selectedTemplate"
        class="rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 overflow-hidden"
      >
        <!-- Header -->
        <div class="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
          <div class="flex items-center gap-2">
            <span class="text-lg">{{ selectedTemplate.icon }}</span>
            <span class="font-medium text-sm text-gray-900 dark:text-white">{{ selectedTemplate.name }}</span>
          </div>
          <div class="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
            <span>模板详情</span>
          </div>
        </div>
        <!-- Prompt Content - Scrollable with max height -->
        <div class="p-3 max-h-48 overflow-y-auto">
          <div
            class="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap"
          >
            {{ selectedTemplate.prompt }}
          </div>
        </div>
        <!-- Footer with Stats and Actions -->
        <div class="px-3 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-xs text-gray-500 dark:text-gray-400">
              {{ selectedTemplate.prompt.length }} 字符
            </span>
            <span class="text-xs text-gray-400 dark:text-gray-500">
              {{ selectedTemplate.tags?.length || 0 }} 个标签
            </span>
          </div>
          <div class="flex items-center gap-2">
            <div class="flex items-center gap-1">
              <Star class="w-3.5 h-3.5 text-amber-500" />
              <span class="text-xs text-gray-600 dark:text-gray-400">{{ selectedTemplate.rating }}</span>
            </div>
            <NButton
              size="tiny"
              quaternary
              @click="handleOpenProOutliner"
            >
              <template #icon>
                <TrendingUp class="w-3.5 h-3.5" />
              </template>
              导入专业大纲
            </NButton>
          </div>
        </div>
      </div>
    </div>

    <!-- Custom Input Tab -->
    <div v-else-if="activeTab === 'custom'" class="space-y-3">
      <NInput
        v-model:value="prompt"
        type="textarea"
        :placeholder="t('quickStart.placeholder')"
        :autosize="{ minRows: 4, maxRows: 8 }"
        show-count
        :status="isPromptTooLong ? 'error' : prompt.trim().length >= MIN_PROMPT_LENGTH ? 'success' : undefined"
      />
      <div class="flex items-center justify-between mt-1.5">
        <div v-if="inputStatus?.type === 'insufficient'" class="flex items-center gap-1 text-xs text-amber-500">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          {{ inputStatus.message }}
        </div>
        <div v-else-if="inputStatus?.type === 'good'" class="flex items-center gap-1 text-xs text-green-500">
          <Check class="w-3 h-3" />
          {{ inputStatus.message }}
        </div>
        <div v-else></div>
        <div class="flex items-center gap-2">
          <span class="text-xs transition-colors" :class="isPromptTooLong ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'">
            {{ prompt.length }} / {{ MAX_PROMPT_LENGTH }}
          </span>
          <NButton
            v-if="prompt.trim()"
            quaternary
            size="small"
            @click="saveDraft"
          >
            <template #icon>
              <Save class="w-3.5 h-3.5" />
            </template>
          </NButton>
        </div>
      </div>
    </div>

    <!-- Word Count Range Selector -->
    <div v-if="activeTab !== 'wizard'" class="flex items-center justify-between px-1">
      <WordCountSelector
        v-model="selectedWordCountRange"
        :disabled="isProcessing"
      />
      <span class="text-xs text-gray-400 dark:text-gray-500">字数范围</span>
    </div>

    <!-- Generate Button -->
    <div v-if="activeTab !== 'wizard'" class="relative">
      <NButton
        class="w-full"
        type="primary"
        size="large"
        :disabled="!canGenerate || isProcessing"
        :loading="isProcessing"
        @click="handleGenerateOutlines"
      >
        <template #icon>
          <Sparkles v-if="!isProcessing" class="w-4 h-4" />
        </template>
        {{ isProcessing ? t("quickStart.generating") : t("quickStart.generate") }}
      </NButton>
    </div>

    <!-- Outline Display - 非 Wizard Tab 时显示 -->
    <OutlineDisplay
      v-if="activeTab !== 'wizard' && generatedOutlines && generatedOutlines.length > 0"
      :outlines="generatedOutlines"
      :selected-outline="selectedOutline ?? null"
      :is-generating="!!isProcessing"
      :progress="generationProgress || ''"
      :error="combinedError"
      :show-word-count="true"
      :show-streaming-preview="true"
      @select="selectOutline"
      @regenerate="handleGenerateOutlines"
      @create="handleCreateProject"
    />
  </div>
</template>

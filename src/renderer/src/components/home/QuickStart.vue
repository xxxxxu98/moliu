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

interface WritingTemplate {
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
    prompt: "请生成一个废物流逆袭的玄幻小说大纲，包含主角资质平凡、获得传承或系统、逐步升级打脸的经典情节。",
    gradient: "from-indigo-500 to-purple-600",
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
    prompt: "请生成一个洪荒背景的小说大纲，主角穿越到上古洪荒世界，通过建立势力、收服弟子、征战诸天来崛起。",
    gradient: "from-amber-500 to-red-600",
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
    prompt: "请生成一个剑道修仙的小说大纲，主角专精剑道，通过宗门大比、遗迹探险等方式不断提升。",
    gradient: "from-slate-500 to-gray-700",
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
    prompt: "请生成一个都市修仙小说大纲，主角在现代都市中发现灵气复苏，通过修仙解决各种灵异事件。",
    gradient: "from-cyan-500 to-blue-600",
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
    prompt: "请生成一个系统流修仙小说大纲，主角获得逆天系统，通过完成任务获取修为资源，一路碾压各路天才。",
    gradient: "from-violet-500 to-purple-600",
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
    prompt: "请生成一个甜宠总裁文大纲，霸道总裁与女主从误会到相爱的过程，包含各种甜蜜互动和误会解除。",
    gradient: "from-pink-500 to-rose-600",
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
    prompt: "请生成一个重生复仇小说大纲，女主重生回到过去，弥补上一世遗憾，对付渣男绿茶。",
    gradient: "from-slate-600 to-gray-700",
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
    prompt: "请生成一个马甲文大纲，女主有隐藏身份，男主发现后追妻火葬场。",
    gradient: "from-amber-500 to-orange-600",
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
    prompt: "请生成一个校园暗恋小说大纲，讲述校花/学霸的校园故事，包含暗恋追求、青梅竹马等甜蜜元素。",
    gradient: "from-pink-400 to-rose-500",
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
    prompt: "请生成一个宫斗小说大纲，女主穿越到古代皇宫，与各路妃嫔斗智斗勇，最终获得帝王宠爱。",
    gradient: "from-red-500 to-rose-600",
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
    prompt: "请生成一个穿越古言小说大纲，女主穿越后与王爷相遇，从欢喜冤家到甜蜜相爱。",
    gradient: "from-pink-400 to-rose-500",
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
    prompt: "请生成一个宅斗小说大纲，女主穿越到世家大族，与各房斗智斗勇，最终带领家族走向辉煌。",
    gradient: "from-amber-500 to-orange-600",
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
    prompt: "请生成一个星际科幻小说大纲，主角在星际时代建立势力，逐步征服星辰大海。",
    gradient: "from-cyan-500 to-blue-600",
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
    prompt: "请生成一个赛博朋克小说大纲，高科技低生活的未来世界，主角作为黑客在夹缝中生存。",
    gradient: "from-violet-600 to-purple-700",
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
    prompt: "请生成一个末世生存小说大纲，末日降临后主角在废土中挣扎求存，建立势力寻找人类最后的希望。",
    gradient: "from-lime-500 to-green-600",
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
    prompt: "请生成一个推理小说大纲，主角是犯罪心理学专家，通过心理分析破解各种疑难案件。",
    gradient: "from-slate-500 to-gray-600",
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
    prompt: "请生成一个灵异小说大纲，主角经营一家处理灵异事件的事务所，遇见各种超自然事件。",
    gradient: "from-gray-700 to-slate-800",
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
    prompt: "请生成一个全息游戏小说大纲，主角进入全息游戏世界，在虚拟与现实中穿梭，成为传奇玩家。",
    gradient: "from-violet-500 to-purple-600",
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
    prompt: "请生成一个电竞冠军小说大纲，讲述电竞选手从默默无闻到站上世界冠军领奖台的热血故事。",
    gradient: "from-indigo-500 to-blue-600",
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
    prompt: "请生成一个都市兵王小说大纲，主角是神秘特种兵回归都市，守护亲人朋友，顺便收拾各路不长眼的。",
    gradient: "from-slate-600 to-gray-700",
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
    prompt: "请生成一个都市神医小说大纲，主角是绝世神医回归都市，一手银针救苍生，疑难杂症手到擒来。",
    gradient: "from-teal-500 to-cyan-600",
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
    prompt: "请生成一个商战霸主小说大纲，主角重生后凭借前世记忆在商海中翻云覆雨，成为商业传奇。",
    gradient: "from-amber-500 to-orange-600",
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
    prompt: "请生成一个贴身保镖小说大纲，顶级保镖守护千金小姐，从雇佣关系到暗生情愫。",
    gradient: "from-stone-500 to-zinc-600",
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
    prompt: "请生成一个江湖传说小说大纲，主角少年闯荡江湖，行侠仗义，在武林中留下无数传说。",
    gradient: "from-stone-500 to-gray-600",
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
    prompt: "请生成一个宗门崛起小说大纲，主角是小宗门弟子，将宗门发展壮大成为武林至尊。",
    gradient: "from-emerald-500 to-teal-600",
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
    prompt: "请生成一个驯龙高手小说大纲，主角与龙族签订契约，成为龙骑士，在奇幻大陆上展开史诗冒险。",
    gradient: "from-purple-500 to-violet-600",
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
    prompt: "请生成一个魔法学徒小说大纲，主角平凡少年进入魔法学院，从学徒成长为一代大法师。",
    gradient: "from-blue-500 to-indigo-600",
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
    prompt: "请生成一个地城勇者小说大纲，冒险者组队探索地下城，挑战Boss获取宝藏，在迷宫中不断变强。",
    gradient: "from-yellow-500 to-amber-600",
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
    prompt: "请生成一个特种兵王小说大纲，特种部队精英参与各种危险任务，保家卫国的热血故事。",
    gradient: "from-green-700 to-emerald-800",
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
    prompt: "请生成一个狙击之王小说大纲，王牌狙击手的传奇，从新兵到兵王的成长之路。",
    gradient: "from-slate-600 to-gray-700",
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
    prompt: "请生成一个美食供应商小说大纲，获得神秘能力的厨师，用美食征服食客的味蕾，开启美食传奇。",
    gradient: "from-orange-500 to-amber-600",
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
    prompt: "请生成一个舌尖上的修仙小说大纲，以美食入道的修仙世界，厨师用菜品修炼境界。",
    gradient: "from-yellow-500 to-orange-600",
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
    prompt: "请生成一个密室逃生小说大纲，主角被困在神秘的密室中，必须解开谜题才能生存。",
    gradient: "from-gray-700 to-slate-800",
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
    prompt: "请生成一个连环杀手小说大纲，主角追踪连环杀手，破解犯罪心理，与高智商罪犯斗智斗勇。",
    gradient: "from-red-700 to-rose-800",
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
    prompt: "请生成一个同人小说大纲，主角穿越到熟悉的故事中改变命运，开启全新人生。",
    gradient: "from-pink-500 to-purple-600",
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
    prompt: "请生成一个游戏乱入小说大纲，游戏角色穿越到现实世界，或主角进入游戏世界展开冒险。",
    gradient: "from-cyan-500 to-blue-600",
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
    prompt: "请生成一个悠然田居小说大纲，主角回归田园，种植养殖发家致富，远离都市喧嚣享受慢生活。",
    gradient: "from-green-500 to-emerald-600",
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
    prompt: "请生成一个灵宠空间小说大纲，主角获得神奇空间，可以种植灵植养殖灵宠，走上修仙种田两不误的道路。",
    gradient: "from-lime-500 to-green-600",
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
    prompt: "请生成一个医道圣手小说大纲，主角是中医世家传人，以精湛医术救死扶伤，成为一代名医传奇。",
    gradient: "from-teal-500 to-emerald-600",
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
    prompt: "请生成一个国医崛起小说大纲，主角以中医之术证明传统医学的博大精深，打脸西医权威。",
    gradient: "from-emerald-500 to-teal-600",
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
    prompt: "请生成一个少年圣医小说大纲，主角年纪轻轻便医术惊人，妙手回春救世家家主。",
    gradient: "from-sky-500 to-cyan-600",
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
    prompt: "请生成一个鉴宝大师小说大纲，主角拥有特殊能力可以鉴定各种宝物，在古董收藏界所向披靡。",
    gradient: "from-amber-500 to-yellow-600",
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
    prompt: "请生成一个天眼通小说大纲，主角意外获得天眼异能，可以看穿一切，在赌石界和鉴宝界混得风生水起。",
    gradient: "from-amber-600 to-orange-600",
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
    prompt: "请生成一个直播之王小说大纲，主角从无名小卒到粉丝千万的顶流主播的逆袭之路。",
    gradient: "from-pink-500 to-rose-600",
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
    prompt: "请生成一个电竞主播小说大纲，游戏主播用实力征服观众，从草根到明星的逆袭之路。",
    gradient: "from-violet-500 to-purple-600",
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
    prompt: "请生成一个玄学大师小说大纲，主角精通风水玄学，为人看相算命批八字，成为都市中的神秘高人。",
    gradient: "from-stone-500 to-slate-600",
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
    prompt: "请生成一个寻龙点穴小说大纲，主角是风水师传人，精通寻龙点穴之术，游走于古墓与现代都市之间。",
    gradient: "from-amber-700 to-yellow-700",
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
    prompt: "请生成一个战神归来小说大纲，主角是战场上无敌的战神回归都市，却发现家人受辱，从此展开复仇之路。",
    gradient: "from-red-600 to-rose-700",
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
    prompt: "请生成一个都市阎王小说大纲，主角是地下世界的王者，都市中的传说，强者中的强者。",
    gradient: "from-gray-700 to-slate-800",
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
    prompt: "请生成一个异界领主小说大纲，主角穿越到异世界成为领主，建设领地招兵买马，建立自己的王国。",
    gradient: "from-amber-600 to-orange-700",
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
    prompt: "请生成一个深渊领主小说大纲，主角成为深渊恶魔领主，在无尽的黑暗中建立势力，征服诸天。",
    gradient: "from-purple-700 to-violet-800",
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
    prompt: "请生成一个退婚流打脸小说大纲，主角被未婚妻退婚，三十年河东三十年河西，莫欺少年穷。",
    gradient: "from-indigo-600 to-purple-700",
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
    prompt: "请生成一个前女友的逆袭小说大纲，当年嫌弃主角的前女友后悔莫及，却发现主角已经高攀不起。",
    gradient: "from-pink-600 to-rose-700",
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
    prompt: "请生成一个召唤师小说大纲，主角成为召唤师，召唤各种英灵魔兽为自己战斗。",
    gradient: "from-violet-600 to-purple-700",
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
    prompt: "请生成一个英灵殿主小说大纲，主角建立英灵殿，收集各路英雄豪杰的英灵为己所用。",
    gradient: "from-cyan-600 to-blue-700",
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
    prompt: "请生成一个学院传奇小说大纲，主角在修炼学院中从籍籍无名到名震天下，成为一代传奇。",
    gradient: "from-blue-600 to-indigo-700",
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
    prompt: "请生成一个天才学院小说大纲，主角作为修炼天才进入顶尖学院，与各路天才竞争。",
    gradient: "from-emerald-600 to-teal-700",
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
    prompt: "请生成一个无限流小说大纲，主角进入各种副本世界完成任务，获得奖励不断变强。",
    gradient: "from-cyan-600 to-blue-700",
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
    prompt: "请生成一个任务达人小说大纲，系统发布各种奇葩任务，主角在欢声笑语中变强。",
    gradient: "from-yellow-500 to-amber-600",
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
    prompt: "请生成一个重生之至尊小说大纲，主角重生回到少年时期，带着前世记忆重新修炼，登临绝顶。",
    gradient: "from-amber-600 to-red-700",
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
    prompt: "请生成一个重回少年小说大纲，主角回到过去弥补遗憾，不再让悲剧重演。",
    gradient: "from-teal-600 to-cyan-700",
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
    prompt: "请生成一个异火炼药师小说大纲，主角获得异火成为炼药师，炼制神丹妙药，成为一代药皇。",
    gradient: "from-orange-600 to-red-700",
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
    prompt: "请生成一个焚天剑帝小说大纲，主角以火焰入道，一剑焚天，火焰系剑修的崛起之路。",
    gradient: "from-red-600 to-orange-700",
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
    prompt: "请生成一个血脉觉醒小说大纲，主角体内沉睡的强大血脉觉醒，从此走上觉醒者之路。",
    gradient: "from-red-600 to-pink-700",
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
    prompt: "请生成一个龙血战士小说大纲，主角获得龙族血脉，成为龙血战士，在战斗中获得力量。",
    gradient: "from-slate-600 to-gray-700",
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
    prompt: "请生成一个阵法师小说大纲，主角成为阵法师，布阵困敌破阵，在阵法之道上登峰造极。",
    gradient: "from-blue-600 to-indigo-700",
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
    prompt: "请生成一个万阵之王小说大纲，主角精通万阵之道，一念之间布下万千阵法，以阵称王。",
    gradient: "from-violet-600 to-purple-700",
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
    prompt: "请生成一个总裁的小甜妻小说大纲，契约结婚先婚后爱，总裁老公实力宠妻。",
    gradient: "from-pink-500 to-rose-600",
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
    prompt: "请生成一个一胎二宝小说大纲，主角带球跑后归来，总裁爹地追妻火葬场，一双萌宝神助攻。",
    gradient: "from-pink-400 to-rose-500",
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
    prompt: "请生成一个离婚后我红了小说大纲，主角被净身出户后逆袭成为顶流明星，前夫后悔求复合。",
    gradient: "from-red-500 to-pink-600",
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
    prompt: "请生成一个闪婚甜宠小说大纲，主角闪婚嫁给陌生人，却发现对方是隐藏大佬。",
    gradient: "from-rose-500 to-pink-600",
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
    prompt: "请生成一个契约夫妻小说大纲，主角假结婚签契约，结果假戏真做，从契约关系到真心相爱。",
    gradient: "from-pink-500 to-purple-600",
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
    prompt: "请生成一个锦绣未央小说大纲，主角穿越到古代成为相府嫡女，与皇子展开甜蜜爱情。",
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
    prompt: "请生成一个侯门主母小说大纲，主角成为侯门主母，在复杂的家族关系中周旋，最终收获幸福。",
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
    prompt: "请生成一个下堂妇小说大纲，主角被休下堂后自强不息，最终成就一番事业并收获真爱。",
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
    prompt: "请生成一个凤谋天下小说大纲，主角步步为营的后宫争斗，从宫女到皇后的逆袭之路。",
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
    prompt: "请生成一个女帝传小说大纲，主角从不受宠的公主到登基为帝，一代女帝的传奇人生。",
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
    prompt: "请生成一个凶宅笔记小说大纲，主角专门处理凶宅事件的风水师，在灵异事件中揭开真相。",
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
    prompt: "请生成一个深夜它来了小说大纲，深夜时分发生的诡异事件，每晚准时上演的恐怖故事。",
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
    prompt: "请生成一个异世为王小说大纲，主角穿越到异世界，凭借智慧和实力成为一方王者。",
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
    prompt: "请生成一个转生史莱姆小说大纲，主角转生为史莱姆，在异世界从最低级生物成长为顶级存在。",
    gradient: "from-green-500 to-emerald-600",
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
    prompt: "请生成一个转生勇者小说大纲，主角带着前世记忆转生为勇者，弥补前世遗憾，成为最强的勇者。",
    gradient: "from-blue-600 to-indigo-700",
  },
];

// ============================================================
// 模板市场状态
// ============================================================

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
        class="p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
      >
        <div class="flex items-center gap-2 mb-2">
          <span class="text-lg">{{ selectedTemplate.icon }}</span>
          <span class="font-medium text-sm text-gray-900 dark:text-white">{{ selectedTemplate.name }}</span>
        </div>
        <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          {{ selectedTemplate.prompt }}
        </p>
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

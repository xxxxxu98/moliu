<script setup lang="ts">
import { ref, computed } from "vue";
import {
  Sparkles,
  RefreshCw,
  Check,
  X,
  Zap,
  ChevronDown,
  Wand2,
  FileText,
  Search,
  Copy,
} from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { useMessage } from "naive-ui";
import { useInspirationStore } from "@/stores/inspiration.store";
import { genreTags as configGenreTags, settingElements as configSettingElements } from "@/data/inspirations";
import { timing } from "@/config/timing";
import type { GeneratedOutline } from "@/types/inspiration";
import { useOutlineGenerator } from "@/composables/useOutlineGenerator";
import { useProjectCreator } from "@/composables/useProjectCreator";
import { TextAnalysisService, type AnalysisFocus } from "@/services/writing/text-analysis-service";
import OutlineDisplay from "@/components/common/OutlineDisplay.vue";
import WordCountSelector from "@/components/common/WordCountSelector.vue";
import { DEFAULT_WORD_COUNT_RANGE } from "@/services/ai/unified.service";

// 使用别名以保持与模板中的引用一致
const genreTags = configGenreTags;
const settingElements = configSettingElements;

const { t } = useI18n();
const message = useMessage();
const inspirationStore = useInspirationStore();

// 使用 Composable 封装的大纲生成和项目创建逻辑
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

// 拆文分析相关状态
const showAnalysisModal = ref(false);
const isAnalyzing = ref(false);
const analysisInput = ref({
  title: "",
  content: "",
  genre: "都市",
});
const analysisResult = ref<string>("");
const selectedAnalysisFocus = ref<AnalysisFocus>("all");

// 选中的大纲
const selectedOutline = ref<GeneratedOutline | null>(null);

// 显示模式: all = 全部, collapsed = 收起
type DisplayMode = "all" | "collapsed";

// Tab 模式: quick = 快速开始, custom = 自定义
type CreationTab = "quick" | "custom";
const creationTab = ref<CreationTab>("quick");

// 当前状态: selecting = 选择中, generating = 生成中, generated = 已生成
type PanelState = "selecting" | "generating" | "generated";
const panelState = ref<PanelState>("selecting");

// 合并生成和创建状态
const isProcessing = computed(() => isGenerating.value || isCreating.value);

// 合并错误状态
const combinedError = computed(() => generationError.value || projectCreateError.value);

// 字数范围选择
const selectedWordCountRange = ref(DEFAULT_WORD_COUNT_RANGE);

// 受众人群选项
type AudienceType = "general" | "male" | "female";
const audienceTypes: {
  id: AudienceType;
  name: string;
  icon: string;
  description: string;
}[] = [
  { id: "general", name: "大众", icon: "👥", description: "适合所有读者" },
  { id: "male", name: "男生", icon: "♂️", description: "男性向作品" },
  { id: "female", name: "女生", icon: "♀️", description: "女性向作品" },
];

// 当前选中的受众人群，默认为大众
const selectedAudience = ref<AudienceType>("general");

// 是否已完成受众人群选择（默认已选择大众）
const audienceSelected = ref(true);

// 当前选中的快速开始卡片
const selectedQuickScenario = ref<string | null>(null);

// Display counts - 收起时显示数量
const TAG_DISPLAY_COUNT = 10;
const ELEMENT_DISPLAY_COUNT = 10;

// Current step: 0=受众人群, 1=标签, 2=元素, 3=生成
const currentStep = computed(() => {
  // 快速开始模式：选择场景后直接进入步骤3
  if (creationTab.value === "quick" && hasQuickSelection.value) return 3;

  // 自定义模式：按步骤选择
  if (inspirationStore.selectedElements.length > 0) return 3;
  if (inspirationStore.selectedTags.length > 0) return 2;
  if (audienceSelected.value) return 1;
  return 0;
});

// 快速开始模式是否有选择
const hasQuickSelection = computed(() => {
  return (
    inspirationStore.selectedTags.length > 0 ||
    inspirationStore.selectedElements.length > 0
  );
});

// 显示模式控制（默认收起）
const tagDisplayMode = ref<DisplayMode>("collapsed");
const elementDisplayMode = ref<DisplayMode>("collapsed");

const shuffledGenreTags = ref<typeof genreTags>([]);
const shuffledSettingElements = ref<typeof settingElements>([]);

shuffledGenreTags.value = shuffleArray(genreTags);
shuffledSettingElements.value = shuffleArray(settingElements);

// 显示逻辑：根据显示模式过滤数据
const displayedTags = computed(() => {
  if (tagDisplayMode.value === "all") {
    return shuffledGenreTags.value;
  }
  return shuffledGenreTags.value.slice(0, TAG_DISPLAY_COUNT);
});

const displayedElements = computed(() => {
  if (elementDisplayMode.value === "all") {
    return shuffledSettingElements.value;
  }
  return shuffledSettingElements.value.slice(0, ELEMENT_DISPLAY_COUNT);
});

const tagsTotalCount = computed(() => shuffledGenreTags.value.length);
const elementsTotalCount = computed(() => shuffledSettingElements.value.length);

function toggleTag(tagId: string) {
  // 清除快速开始选中状态（切换到自定义模式）
  if (creationTab.value === 'custom') {
    selectedQuickScenario.value = null;
  }
  inspirationStore.toggleTag(tagId);
}

function selectAudience(audienceId: AudienceType) {
  selectedAudience.value = audienceId;
  audienceSelected.value = true;
  // 清除快速开始选中状态
  selectedQuickScenario.value = null;
  // 切换受众人群时重置其他选择
  inspirationStore.reset();
  shuffledGenreTags.value = shuffleArray(genreTags);
  shuffledSettingElements.value = shuffleArray(settingElements);
  tagDisplayMode.value = "all";
  elementDisplayMode.value = "all";
}

function toggleElement(elementId: string) {
  inspirationStore.toggleElement(elementId);
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

async function refreshTags() {
  isGenerating.value = true;
  await new Promise((resolve) => setTimeout(resolve, timing.mockApi.quick));
  shuffledGenreTags.value = shuffleArray(genreTags);
  inspirationStore.reset();
  panelState.value = "selecting";
  tagDisplayMode.value = "all";
  isGenerating.value = false;
}

async function refreshElements() {
  if (inspirationStore.selectedTags.length === 0) return;
  isGenerating.value = true;
  await new Promise((resolve) => setTimeout(resolve, timing.mockApi.quick));
  shuffledSettingElements.value = shuffleArray(settingElements);
  inspirationStore.selectedElements = [];
  panelState.value = "selecting";
  elementDisplayMode.value = "all";
  isGenerating.value = false;
}

function toggleTagDisplayMode() {
  tagDisplayMode.value = tagDisplayMode.value === "all" ? "collapsed" : "all";
}

function toggleElementDisplayMode() {
  elementDisplayMode.value =
    elementDisplayMode.value === "all" ? "collapsed" : "all";
}

async function randomPick() {
  isGenerating.value = true;
  await new Promise((resolve) => setTimeout(resolve, 500));

  // 随机打乱数据
  shuffledGenreTags.value = shuffleArray(genreTags);
  shuffledSettingElements.value = shuffleArray(settingElements);

  // 清空之前的选择
  inspirationStore.reset();

  // 1. 随机选择受众人群
  const randomAudience =
    audienceTypes[Math.floor(Math.random() * audienceTypes.length)];
  selectedAudience.value = randomAudience.id;
  audienceSelected.value = true;

  // 2. 随机选择 1-3 个标签和元素
  const tagCount = 1 + Math.floor(Math.random() * 3);
  const elementCount = 1 + Math.floor(Math.random() * 3);

  shuffledGenreTags.value.slice(0, tagCount).forEach((tag) => {
    inspirationStore.toggleTag(tag.id);
  });

  shuffledSettingElements.value.slice(0, elementCount).forEach((element) => {
    inspirationStore.toggleElement(element.id);
  });

  // 保持收起状态
  tagDisplayMode.value = "collapsed";
  elementDisplayMode.value = "collapsed";

  isGenerating.value = false;
}

function clearSelection() {
  inspirationStore.reset();
  selectedAudience.value = "general";
  shuffledGenreTags.value = shuffleArray(genreTags);
  shuffledSettingElements.value = shuffleArray(settingElements);
  panelState.value = "selecting";
  selectedOutline.value = null;
  tagDisplayMode.value = "collapsed";
  elementDisplayMode.value = "collapsed";
  resetOutlineState();
  resetProjectState();
}

/**
 * 构建生成大纲的 prompt
 * 将用户选择的标签和元素组合成结构化的提示词
 */
function buildPrompt(): string {
  const tags = inspirationStore.selectedTags
    .map((id) => genreTags.find((t) => t.id === id)?.name)
    .filter(Boolean);
  const elements = inspirationStore.selectedElements
    .map((id) => settingElements.find((e) => e.id === id)?.name)
    .filter(Boolean);

  return `请根据以下设定，为我生成小说大纲。

类型标签：${tags.join("、")}
设定元素：${elements.join("、")}

请确保：
1. 融合所有选定的类型标签特点
2. 包含选定的设定元素
3. 有明确的主角设定和成长弧线
4. 有清晰的故事冲突和解决
5. 生成3个不同风格的大纲备选`;
}

async function handleGenerateOutlines() {
  // 构建 prompt
  const prompt = buildPrompt();

  // 调用 composable 生成大纲，传递字数范围
  const results = await generateOutlines(prompt, {
    wordCountRange: selectedWordCountRange.value,
  });

  if (results.length > 0) {
    panelState.value = "generated";
  } else {
    panelState.value = "selecting";
  }
}

function selectOutline(outline: GeneratedOutline) {
  selectedOutline.value = outline;
}

async function handleCreateProject() {
  if (!selectedOutline.value) return;
  await doCreateProject(selectedOutline.value);
}

// Quick scenario cards
interface QuickScenario {
  id: string;
  title: string;
  audience: AudienceType;
  tags: string[];
  elements: string[];
  icon: string;
  gradient: string;
}

const quickScenarios: QuickScenario[] = [
  // ==================== 男性向 - 玄幻仙侠 ====================
  {
    id: "qs-fan-1",
    title: "废物流逆袭",
    audience: "male",
    tags: ["修仙", "玄幻"],
    elements: ["资质平平", "灭门惨案", "逆袭打脸"],
    icon: "💫",
    gradient: "from-indigo-500 to-purple-600",
  },
  {
    id: "qs-fan-2",
    title: "洪荒崛起",
    audience: "male",
    tags: ["洪荒", "玄幻"],
    elements: ["穿越者", "宗门崛起", "势力崛起"],
    icon: "🌋",
    gradient: "from-amber-500 to-red-600",
  },
  {
    id: "qs-fan-3",
    title: "剑道至尊",
    audience: "male",
    tags: ["玄幻", "武侠"],
    elements: ["传承觉醒", "宗门大比", "天才流"],
    icon: "⚔️",
    gradient: "from-emerald-500 to-teal-600",
  },
  {
    id: "qs-fan-4",
    title: "系统修仙",
    audience: "male",
    tags: ["修仙", "都市"],
    elements: ["系统流", "神秘导师", "资质平平"],
    icon: "🎮",
    gradient: "from-violet-500 to-purple-600",
  },
  {
    id: "qs-fan-5",
    title: "重生夺舍",
    audience: "male",
    tags: ["修仙", "穿越"],
    elements: ["重生者", "身份伪装", "逆袭打脸"],
    icon: "⏰",
    gradient: "from-slate-600 to-indigo-700",
  },
  {
    id: "qs-fan-6",
    title: "都市修仙",
    audience: "male",
    tags: ["都市", "修仙"],
    elements: ["灵气复苏", "隐藏血脉", "都市修仙"],
    icon: "🌃",
    gradient: "from-cyan-500 to-blue-600",
  },

  // ==================== 男性向 - 都市军旅 ====================
  {
    id: "qs-urb-1",
    title: "都市兵王",
    audience: "male",
    tags: ["都市", "军旅"],
    elements: ["神秘导师", "隐藏血脉", "逆袭打脸"],
    icon: "🎖️",
    gradient: "from-slate-600 to-gray-700",
  },
  {
    id: "qs-urb-2",
    title: "特种兵王",
    audience: "male",
    tags: ["都市", "特种兵"],
    elements: ["神秘导师", "红颜知己", "兄弟情义"],
    icon: "🗡️",
    gradient: "from-green-700 to-emerald-800",
  },
  {
    id: "qs-urb-3",
    title: "商战霸主",
    audience: "male",
    tags: ["都市", "职场"],
    elements: ["重生者", "商战博弈", "背叛陷害"],
    icon: "💼",
    gradient: "from-amber-500 to-orange-600",
  },
  {
    id: "qs-urb-4",
    title: "神医归来",
    audience: "male",
    tags: ["都市", "医疗"],
    elements: ["传承觉醒", "都市修仙", "红颜知己"],
    icon: "💉",
    gradient: "from-teal-500 to-cyan-600",
  },

  // ==================== 男性向 - 科幻星际 ====================
  {
    id: "qs-sci-1",
    title: "星际探险",
    audience: "male",
    tags: ["星际", "科幻"],
    elements: ["穿越异界", "星际争霸", "正邪对立"],
    icon: "🚀",
    gradient: "from-cyan-500 to-blue-600",
  },
  {
    id: "qs-sci-2",
    title: "末世生存",
    audience: "male",
    tags: ["末世", "废土"],
    elements: ["末日生存", "废土末世", "生存危机"],
    icon: "☢️",
    gradient: "from-lime-500 to-green-600",
  },
  {
    id: "qs-sci-3",
    title: "赛博朋克",
    audience: "male",
    tags: ["赛博朋克", "科幻"],
    elements: ["赛博都市", "正邪对立", "机械改造"],
    icon: "🤖",
    gradient: "from-cyan-400 to-blue-500",
  },
  {
    id: "qs-sci-4",
    title: "虚拟现实",
    audience: "male",
    tags: ["虚拟现实", "科幻"],
    elements: ["游戏世界", "穿越异界", "系统流"],
    icon: "🕶️",
    gradient: "from-indigo-400 to-purple-500",
  },
  {
    id: "qs-sci-5",
    title: "机甲战士",
    audience: "male",
    tags: ["科幻", "星际"],
    elements: ["机械改造", "星际争霸", "正邪对立"],
    icon: "🦾",
    gradient: "from-gray-400 to-slate-500",
  },

  // ==================== 男性向 - 历史战争 ====================
  {
    id: "qs-his-1",
    title: "回到古代当王爷",
    audience: "male",
    tags: ["穿越", "历史"],
    elements: ["权力斗争", "皇子/贵族", "逆袭打脸"],
    icon: "🏯",
    gradient: "from-amber-600 to-orange-600",
  },
  {
    id: "qs-his-2",
    title: "抗战烽火",
    audience: "male",
    tags: ["战争", "历史"],
    elements: ["正邪对立", "兄弟情义", "牺牲救赎"],
    icon: "💥",
    gradient: "from-red-700 to-orange-800",
  },
  {
    id: "qs-his-3",
    title: "军工科技",
    audience: "male",
    tags: ["都市", "科技"],
    elements: ["科技创业", "爱国情怀", "商战博弈"],
    icon: "🔧",
    gradient: "from-blue-600 to-indigo-700",
  },

  // ==================== 女性向 - 甜宠言情 ====================
  {
    id: "qs-rom-1",
    title: "甜宠总裁",
    audience: "female",
    tags: ["都市", "言情", "总裁"],
    elements: ["总裁/大佬", "甜宠", "误会重重"],
    icon: "👔",
    gradient: "from-pink-500 to-rose-600",
  },
  {
    id: "qs-rom-2",
    title: "校园暗恋",
    audience: "female",
    tags: ["校园", "言情"],
    elements: ["校花/学霸", "青梅竹马", "暗恋追求"],
    icon: "🌸",
    gradient: "from-pink-400 to-rose-500",
  },
  {
    id: "qs-rom-3",
    title: "豪门联姻",
    audience: "female",
    tags: ["都市", "言情"],
    elements: ["总裁/大佬", "误会重重", "逆袭打脸"],
    icon: "💍",
    gradient: "from-rose-500 to-pink-600",
  },
  {
    id: "qs-rom-4",
    title: "医见钟情",
    audience: "female",
    tags: ["都市", "医疗", "言情"],
    elements: ["温柔贤惠", "腹黑深沉", "红颜知己"],
    icon: "💕",
    gradient: "from-teal-400 to-cyan-500",
  },
  {
    id: "qs-rom-5",
    title: "国民女神",
    audience: "female",
    tags: ["娱乐", "言情", "都市"],
    elements: ["女强人", "总裁/大佬", "三角恋"],
    icon: "⭐",
    gradient: "from-violet-500 to-purple-600",
  },

  // ==================== 女性向 - 古风穿越 ====================
  {
    id: "qs-gus-1",
    title: "宫墙之内",
    audience: "female",
    tags: ["宫斗", "穿越"],
    elements: ["权力斗争", "误会重重", "皇帝"],
    icon: "👑",
    gradient: "from-red-500 to-rose-600",
  },
  {
    id: "qs-gus-2",
    title: "宅斗风云",
    audience: "female",
    tags: ["宅斗", "穿越"],
    elements: ["家族羁绊", "逆袭打脸", "姐妹情深"],
    icon: "🏠",
    gradient: "from-amber-500 to-orange-600",
  },
  {
    id: "qs-gus-3",
    title: "种田发家",
    audience: "female",
    tags: ["种田", "穿越"],
    elements: ["势力崛起", "红颜知己", "萌宠/灵兽"],
    icon: "🌾",
    gradient: "from-green-500 to-emerald-600",
  },
  {
    id: "qs-gus-4",
    title: "王爷宠妻",
    audience: "female",
    tags: ["穿越", "历史"],
    elements: ["皇子/贵族", "甜宠", "师尊/师父"],
    icon: "🕊️",
    gradient: "from-pink-400 to-rose-500",
  },
  {
    id: "qs-gus-5",
    title: "江湖女侠",
    audience: "female",
    tags: ["武侠", "言情"],
    elements: ["江湖武林", "师尊/师父", "妖女/魔女"],
    icon: "⚔️",
    gradient: "from-emerald-500 to-teal-600",
  },

  // ==================== 女性向 - 奇幻仙侠 ====================
  {
    id: "qs-xia-1",
    title: "师尊在上",
    audience: "female",
    tags: ["仙侠", "言情"],
    elements: ["师尊/师父", "修仙", "误会重重"],
    icon: "🧘",
    gradient: "from-violet-500 to-purple-600",
  },
  {
    id: "qs-xia-2",
    title: "废柴逆袭",
    audience: "female",
    tags: ["修仙", "玄幻"],
    elements: ["资质平平", "师尊/师父", "逆袭打脸"],
    icon: "💫",
    gradient: "from-indigo-500 to-purple-600",
  },
  {
    id: "qs-xia-3",
    title: "魔法学院",
    audience: "female",
    tags: ["奇幻", "校园"],
    elements: ["魔法学院", "青梅竹马", "师尊/师父"],
    icon: "🏰",
    gradient: "from-violet-400 to-purple-500",
  },

  // ==================== 大众向 - 游戏电竞 ====================
  {
    id: "qs-gam-1",
    title: "全息游戏",
    audience: "general",
    tags: ["游戏", "虚拟现实"],
    elements: ["游戏世界", "穿越异界", "系统流"],
    icon: "🎮",
    gradient: "from-violet-500 to-purple-600",
  },
  {
    id: "qs-gam-2",
    title: "电竞冠军",
    audience: "general",
    tags: ["电竞", "都市"],
    elements: ["兄弟情义", "逆袭打脸", "直播"],
    icon: "🏆",
    gradient: "from-indigo-500 to-blue-600",
  },
  {
    id: "qs-gam-3",
    title: "异界召唤",
    audience: "general",
    tags: ["游戏", "奇幻"],
    elements: ["穿越异界", "萌宠/灵兽", "正邪对立"],
    icon: "🎲",
    gradient: "from-amber-500 to-orange-600",
  },

  // ==================== 大众向 - 悬疑推理 ====================
  {
    id: "qs-mys-1",
    title: "心理罪者",
    audience: "general",
    tags: ["悬疑", "推理"],
    elements: ["身世之谜", "身份认同", "正邪对立"],
    icon: "🔍",
    gradient: "from-slate-500 to-gray-600",
  },
  {
    id: "qs-mys-2",
    title: "灵异事务所",
    audience: "general",
    tags: ["灵异", "都市"],
    elements: ["身世之谜", "萌宠/灵兽", "正邪对立"],
    icon: "👻",
    gradient: "from-purple-500 to-indigo-600",
  },
  {
    id: "qs-mys-3",
    title: "密室逃生",
    audience: "general",
    tags: ["悬疑", "惊悚"],
    elements: ["生存危机", "身份认同", "逃生"],
    icon: "🚪",
    gradient: "from-gray-700 to-slate-800",
  },

  // ==================== 大众向 - 轻松日常 ====================
  {
    id: "qs-lif-1",
    title: "美食日常",
    audience: "general",
    tags: ["美食", "都市"],
    elements: ["萌宠/灵兽", "红颜知己", "创业致富"],
    icon: "🍳",
    gradient: "from-yellow-500 to-amber-600",
  },
  {
    id: "qs-lif-2",
    title: "音乐人生",
    audience: "general",
    tags: ["音乐", "都市"],
    elements: ["青梅竹马", "兄弟情义", "梦想信念"],
    icon: "🎵",
    gradient: "from-violet-500 to-purple-600",
  },
  {
    id: "qs-lif-3",
    title: "体育竞技",
    audience: "general",
    tags: ["运动", "校园"],
    elements: ["热血青春", "兄弟情义", "逆袭打脸"],
    icon: "⚽",
    gradient: "from-green-500 to-teal-600",
  },

  // ==================== 大众向 - 同人衍生 ====================
  {
    id: "qs-der-1",
    title: "综漫之旅",
    audience: "general",
    tags: ["综漫", "衍生"],
    elements: ["穿越异界", "系统流", "收小弟"],
    icon: "🌐",
    gradient: "from-pink-500 to-violet-600",
  },
  {
    id: "qs-der-2",
    title: "同人创作",
    audience: "general",
    tags: ["同人", "衍生"],
    elements: ["游戏世界", "萌宠/灵兽", "兄弟情义"],
    icon: "📝",
    gradient: "from-rose-500 to-pink-600",
  },
];

function applyQuickScenario(scenario: QuickScenario) {
  inspirationStore.reset();

  // 设置当前选中的快速开始卡片
  selectedQuickScenario.value = scenario.id;

  // 设置受众人群
  selectedAudience.value = scenario.audience;
  audienceSelected.value = true;

  // 应用题材标签
  scenario.tags.forEach((tagName) => {
    const tag = genreTags.find((g) => g.name === tagName);
    if (tag) inspirationStore.toggleTag(tag.id);
  });

  // 应用设定元素
  scenario.elements.forEach((elementName) => {
    const element = settingElements.find((e) => e.name === elementName);
    if (element) inspirationStore.toggleElement(element.id);
  });

  panelState.value = "selecting";
  generatedOutlines.value = [];
  selectedOutline.value = null;
  tagDisplayMode.value = "all";
  elementDisplayMode.value = "all";
}

function switchTab(tab: CreationTab) {
  creationTab.value = tab;
  selectedQuickScenario.value = null;
  if (tab === "custom") {
    // 切换到自定义模式时，清空快速开始的选择
    inspirationStore.reset();
    selectedAudience.value = "general";
  }
}

function resetToQuickStart() {
  inspirationStore.reset();
  selectedAudience.value = "general";
  selectedQuickScenario.value = null;
  creationTab.value = "quick";
  panelState.value = "selecting";
  generatedOutlines.value = [];
  selectedOutline.value = null;
  tagDisplayMode.value = "collapsed";
  elementDisplayMode.value = "collapsed";
}

// 拆文分析相关方法
function openAnalysisModal() {
  showAnalysisModal.value = true;
  analysisInput.value = {
    title: "",
    content: "",
    genre: "都市",
  };
  analysisResult.value = "";
}

function closeAnalysisModal() {
  showAnalysisModal.value = false;
}

async function handleStartAnalysis() {
  if (!analysisInput.value.title || !analysisInput.value.content) {
    message.warning("请填写书名和内容");
    return;
  }

  isAnalyzing.value = true;
  analysisResult.value = "";

  try {
    // 获取 AI 服务
    const { useAIService } = await import("@/services/ai/useAIService");
    const aiService = useAIService();
    
    const aiClient = async (prompt: string): Promise<string> => {
      const response = await aiService.generate(prompt, "concise");
      return response;
    };

    const report = await TextAnalysisService.analyze(
      {
        title: analysisInput.value.title,
        content: analysisInput.value.content,
        mode: "quick",
        focus: selectedAnalysisFocus.value,
        genre: analysisInput.value.genre,
      },
      aiClient
    );

    // 将报告转换为 Markdown 格式
    analysisResult.value = convertReportToMarkdown(report);
    message.success("分析完成");
  } catch (err) {
    message.error(err instanceof Error ? err.message : "分析失败");
  } finally {
    isAnalyzing.value = false;
  }
}

function convertReportToMarkdown(report: any): string {
  let md = `# 《${report.basicInfo.title}》拆文报告\n\n`;
  
  md += `## 基本信息\n`;
  md += `- **题材**：${report.basicInfo.genre}\n`;
  md += `- **预估章节数**：${report.basicInfo.estimatedChapters} 章\n`;
  md += `- **预估字数**：约 ${report.basicInfo.estimatedWords.toLocaleString()} 字\n\n`;

  if (report.goldenThreeChapters.length > 0) {
    md += `## 黄金三章分析\n\n`;
    report.goldenThreeChapters.forEach((chapter: any, index: number) => {
      md += `### 第${index + 1}章：${chapter.chapterTitle}\n\n`;
      md += `- **开篇钩子**：${chapter.openingHook}\n`;
      md += `- **核心冲突**：${chapter.coreConflict}\n`;
      md += `- **爽点设计**：${chapter.highlightDesign.join("、")}\n`;
      md += `- **节奏特点**：${chapter.pacingFeatures.join("、")}\n`;
      md += `- **值得学习**：${chapter.learnings.join("、")}\n\n`;
    });
  }

  if (report.characterArchitecture.length > 0) {
    md += `## 人物架构\n\n`;
    report.characterArchitecture.forEach((char: any) => {
      md += `### ${char.name}（${char.role}）\n\n`;
      md += `- **性格特点**：${char.personalityTraits.join("、")}\n`;
      md += `- **人物弧线**：${char.arcDescription}\n`;
      md += `- **关系网络**：${char.relationshipMap.map((r: any) => `${r.with}（${r.type}）`).join("、")}\n\n`;
    });
  }

  if (report.writingTechniques.openingTechniques.length > 0) {
    md += `## 写作技法\n\n`;
    md += `### 开篇技法\n`;
    md += report.writingTechniques.openingTechniques.map((t: string) => `- ${t}`).join("\n");
    md += "\n\n### 对话技法\n";
    md += report.writingTechniques.dialogueTechniques.map((t: string) => `- ${t}`).join("\n");
    md += "\n\n### 悬念技法\n";
    md += report.writingTechniques.tensionTechniques.map((t: string) => `- ${t}`).join("\n");
    md += "\n";
  }

  if (report.keyLearnings.length > 0) {
    md += `## 关键学习点\n\n`;
    report.keyLearnings.forEach((learning: string, index: number) => {
      md += `${index + 1}. ${learning}\n`;
    });
  }

  return md;
}

function copyAnalysisResult() {
  if (analysisResult.value) {
    navigator.clipboard.writeText(analysisResult.value);
    message.success("已复制到剪贴板");
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <div
          class="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center"
        >
          <Sparkles class="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 class="font-semibold text-gray-900 dark:text-white">
            {{ t("inspiration.title") }}
          </h3>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            {{ t("inspiration.description") }}
          </p>
        </div>
      </div>
      <button
        v-if="panelState !== 'selecting' || currentStep > 0"
        class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        @click="resetToQuickStart"
      >
        <X class="w-4 h-4 text-gray-400" />
      </button>
    </div>

    <!-- Tab Switcher -->
    <div
      v-if="panelState === 'selecting'"
      class="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl mb-4"
    >
      <button
        class="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
        :class="
          creationTab === 'quick'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
        "
        @click="switchTab('quick')"
      >
        <Zap class="w-4 h-4" />
        {{ t("inspiration.quickStart") }}
      </button>
      <button
        class="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
        :class="
          creationTab === 'custom'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
        "
        @click="switchTab('custom')"
      >
        <Wand2 class="w-4 h-4" />
        {{ t("inspiration.customMode") }}
      </button>
    </div>

    <!-- Quick Scenarios (快速开始模式) -->
    <div
      v-if="panelState === 'selecting' && creationTab === 'quick'"
      class="mb-4"
    >
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs text-gray-500 dark:text-gray-400"
          >选择一个预设模板开始创作</span
        >
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="scenario in quickScenarios"
          :key="scenario.id"
          class="p-3 rounded-xl bg-gradient-to-br text-left transition-all duration-200 relative group"
          :class="[
            scenario.gradient,
            selectedQuickScenario === scenario.id
              ? 'ring-2 ring-white ring-offset-2 dark:ring-offset-gray-900 scale-[1.02]'
              : 'hover:scale-[1.02]',
          ]"
          @click="applyQuickScenario(scenario)"
        >
          <!-- 选中状态指示器 -->
          <div
            v-if="selectedQuickScenario === scenario.id"
            class="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center"
          >
            <Check class="w-3 h-3 text-white" />
          </div>
          <div class="flex items-center gap-2 mb-1.5">
            <span class="text-lg">{{ scenario.icon }}</span>
            <span class="font-medium text-sm text-white">{{
              scenario.title
            }}</span>
          </div>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="tag in scenario.tags"
              :key="tag"
              class="px-1.5 py-0.5 text-xs bg-white/20 rounded text-white/90"
            >
              {{ tag }}
            </span>
          </div>
        </button>
      </div>
    </div>

    <!-- Custom Mode Content (自定义模式) -->
    <div v-if="panelState === 'selecting' && creationTab === 'custom'">
      <!-- Progress Indicator -->
      <div class="flex items-center gap-1 mb-3">
        <div
          v-for="step in 3"
          :key="step"
          class="h-1 flex-1 rounded-full transition-all duration-300"
          :class="
            step <= currentStep
              ? 'bg-gradient-to-r from-amber-500 to-orange-500'
              : 'bg-gray-200 dark:bg-gray-700'
          "
        ></div>
      </div>

      <!-- Step 1: Audience Selection (始终显示) -->
      <div class="mb-4">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <div
              class="w-6 h-6 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center"
            >
              <span class="text-xs font-bold text-white">1</span>
            </div>
            <span class="text-sm text-gray-700 dark:text-gray-300">{{
              t("inspiration.audienceTitle")
            }}</span>
          </div>
          <button
            class="flex items-center gap-1 px-2 py-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg transition-colors"
            @click="randomPick"
            :disabled="isGenerating"
          >
            <Zap class="w-3 h-3" />
            {{ t("inspiration.randomPick") }}
          </button>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="audience in audienceTypes"
            :key="audience.id"
            class="p-3 rounded-xl border-2 transition-all duration-200 flex flex-col items-center gap-1"
            :class="[
              selectedAudience === audience.id
                ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-amber-300 dark:hover:border-amber-600 bg-white dark:bg-gray-800',
            ]"
            @click="selectAudience(audience.id)"
          >
            <span class="text-xl">{{ audience.icon }}</span>
            <span class="font-medium text-xs text-gray-900 dark:text-white">{{
              audience.name
            }}</span>
          </button>
        </div>
      </div>

      <!-- Step 2: Genre Tags (选择受众人群后显示) -->
      <div v-if="currentStep >= 1" class="mb-4">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <div
              class="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center"
            >
              <span class="text-xs font-bold text-white">2</span>
            </div>
            <span class="text-sm text-gray-700 dark:text-gray-300">{{
              t("inspiration.step1Title")
            }}</span>
            <span class="text-xs text-gray-400 dark:text-gray-500"
              >({{ tagsTotalCount }})</span
            >
          </div>
          <button
            v-if="shuffledGenreTags.length > TAG_DISPLAY_COUNT"
            class="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
            @click="toggleTagDisplayMode"
          >
            <span>{{ tagDisplayMode === "collapsed" ? "展开" : "收起" }}</span>
            <ChevronDown
              class="w-3.5 h-3.5 transition-transform"
              :class="{ 'rotate-180': tagDisplayMode === 'all' }"
            />
          </button>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            v-for="tag in displayedTags"
            :key="tag.id"
            class="px-3 py-1.5 rounded-lg text-sm transition-all duration-200 relative group"
            :class="[
              inspirationStore.selectedTags.includes(tag.id)
                ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500/50'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30',
            ]"
            @click="toggleTag(tag.id)"
          >
            <span class="mr-1">{{ tag.icon }}</span>
            {{ tag.name }}
            <span
              v-if="
                tag.description &&
                inspirationStore.selectedTags.includes(tag.id)
              "
              class="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 text-xs bg-gray-900 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10"
            >
              {{ tag.description }}
            </span>
          </button>
        </div>

        <!-- 收起时显示提示 -->
        <div
          v-if="
            tagDisplayMode === 'collapsed' &&
            shuffledGenreTags.length > TAG_DISPLAY_COUNT
          "
          class="mt-2 text-center"
        >
          <span class="text-xs text-gray-400 dark:text-gray-500"
            >还有
            {{
              shuffledGenreTags.length - TAG_DISPLAY_COUNT
            }}
            个标签，点击展开查看全部</span
          >
        </div>
      </div>

      <!-- Step 3: Setting Elements (选择标签后显示) -->
      <div v-if="currentStep >= 2" class="animate-fade-in">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <div
              class="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center"
            >
              <span class="text-xs font-bold text-white">3</span>
            </div>
            <span class="text-sm text-gray-700 dark:text-gray-300">{{
              t("inspiration.step2Title")
            }}</span>
            <span class="text-xs text-gray-400 dark:text-gray-500"
              >({{ elementsTotalCount }})</span
            >
          </div>
          <button
            v-if="shuffledSettingElements.length > ELEMENT_DISPLAY_COUNT"
            class="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
            @click="toggleElementDisplayMode"
          >
            <span>{{
              elementDisplayMode === "collapsed" ? "展开" : "收起"
            }}</span>
            <ChevronDown
              class="w-3.5 h-3.5 transition-transform"
              :class="{ 'rotate-180': elementDisplayMode === 'all' }"
            />
          </button>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            v-for="element in displayedElements"
            :key="element.id"
            class="px-3 py-1.5 rounded-lg text-sm transition-all duration-200"
            :class="[
              inspirationStore.selectedElements.includes(element.id)
                ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/50'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30',
            ]"
            @click="toggleElement(element.id)"
          >
            <span class="mr-1">{{ element.icon }}</span>
            {{ element.name }}
          </button>
        </div>

        <!-- 收起时显示提示 -->
        <div
          v-if="
            elementDisplayMode === 'collapsed' &&
            shuffledSettingElements.length > ELEMENT_DISPLAY_COUNT
          "
          class="mt-2 text-center"
        >
          <span class="text-xs text-gray-400 dark:text-gray-500"
            >还有
            {{
              shuffledSettingElements.length - ELEMENT_DISPLAY_COUNT
            }}
            个元素，点击展开查看全部</span
          >
        </div>
      </div>
    </div>

    <!-- Generate Button -->
    <div
      v-if="panelState === 'selecting' && currentStep >= 3"
      class="animate-fade-in pt-2 space-y-3"
    >
      <!-- Selected Items Summary (快速开始模式) -->
      <div
        v-if="creationTab === 'quick'"
        class="mb-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
      >
        <!-- 受众人群 -->
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xs text-amber-600 dark:text-amber-400 font-medium">受众人群</span>
          <span class="px-2 py-0.5 text-xs rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
            {{ audienceTypes.find(a => a.id === selectedAudience)?.icon }}
            {{ audienceTypes.find(a => a.id === selectedAudience)?.name }}
          </span>
        </div>
        <!-- 题材标签 -->
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xs text-indigo-600 dark:text-indigo-400 font-medium">题材标签</span>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="tagId in inspirationStore.selectedTags"
              :key="tagId"
              class="px-2 py-0.5 text-xs rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400"
            >
              {{ genreTags.find((t) => t.id === tagId)?.name }}
            </span>
          </div>
        </div>
        <!-- 设定元素 -->
        <div class="flex items-start gap-2">
          <span class="text-xs text-emerald-600 dark:text-emerald-400 font-medium pt-0.5">设定元素</span>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="elementId in inspirationStore.selectedElements"
              :key="elementId"
              class="px-2 py-0.5 text-xs rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
            >
              {{ settingElements.find((e) => e.id === elementId)?.name }}
            </span>
          </div>
        </div>
      </div>
      
      <!-- Word Count Range Selector -->
      <div class="flex items-center justify-between px-1">
        <WordCountSelector
          v-model="selectedWordCountRange"
          :disabled="isProcessing"
        />
        <span class="text-xs text-gray-400 dark:text-gray-500">字数范围</span>
      </div>
      
      <button
        class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 text-white text-sm font-semibold shadow-lg hover:shadow-xl transition-all"
        :disabled="isProcessing"
        @click="handleGenerateOutlines"
      >
        <Sparkles v-if="!isProcessing" class="w-4 h-4" />
        <span
          v-if="isProcessing"
          class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
        ></span>
        {{ t("inspiration.generateOutline") }}
      </button>
    </div>

    <!-- 大纲列表展示（使用通用组件） -->
    <OutlineDisplay
      v-if="panelState === 'generated' || isGenerating"
      :outlines="generatedOutlines || []"
      :selected-outline="selectedOutline ?? null"
      :is-generating="!!isGenerating"
      :progress="generationProgress || ''"
      :error="combinedError"
      :show-word-count="false"
      @select="selectOutline"
      @regenerate="handleGenerateOutlines"
      @create="handleCreateProject"
    />

    <!-- Error Message (仅在未生成时显示) -->
    <div
      v-if="combinedError && panelState !== 'generated'"
      class="mt-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
    >
      <p class="text-xs text-red-600 dark:text-red-400">
        {{ combinedError }}
      </p>
    </div>

    <!-- Empty State (自定义模式，未选择标签时) -->
    <div
      v-if="
        panelState === 'selecting' &&
        creationTab === 'custom' &&
        currentStep === 1
      "
      class="text-center py-4"
    >
      <Sparkles class="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
      <p class="text-xs text-gray-400 dark:text-gray-500">
        {{ t("inspiration.startJourneyDesc") }}
      </p>
    </div>

    <!-- 拆文分析入口按钮 -->
    <div class="pt-4 border-t border-gray-100 dark:border-gray-800">
      <button
        class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-purple-200 dark:border-purple-700 text-purple-600 dark:text-purple-400 font-medium hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
        @click="openAnalysisModal"
      >
        <Search class="w-4 h-4" />
        拆文分析
      </button>
      <p class="text-xs text-gray-400 dark:text-gray-500 text-center mt-1">分析爆款，学习写作技巧</p>
    </div>

    <!-- 拆文分析 Modal -->
    <Teleport to="body">
      <div
        v-if="showAnalysisModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="closeAnalysisModal"
      >
        <div class="w-full max-w-3xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
          <!-- Modal Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div class="flex items-center gap-3">
              <FileText class="w-5 h-5 text-purple-500" />
              <h3 class="font-semibold text-gray-900 dark:text-white">拆文分析</h3>
            </div>
            <button
              class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              @click="closeAnalysisModal"
            >
              <X class="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <!-- Modal Content -->
          <div class="flex-1 overflow-y-auto p-6 space-y-4">
            <!-- 输入区域 -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">书名</label>
                <input
                  v-model="analysisInput.title"
                  type="text"
                  placeholder="请输入要分析的书名"
                  class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">题材</label>
                <select
                  v-model="analysisInput.genre"
                  class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="都市">都市</option>
                  <option value="玄幻">玄幻</option>
                  <option value="仙侠">仙侠</option>
                  <option value="穿越">穿越</option>
                  <option value="言情">言情</option>
                  <option value="科幻">科幻</option>
                  <option value="悬疑">悬疑</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">分析重点</label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="focus in [
                    { value: 'all', label: '全部' },
                    { value: 'golden3', label: '黄金三章' },
                    { value: 'structure', label: '整体结构' },
                    { value: 'character', label: '人物架构' },
                    { value: 'plot', label: '情节设计' },
                  ]"
                  :key="focus.value"
                  class="px-3 py-1.5 rounded-lg text-sm transition-colors"
                  :class="[
                    selectedAnalysisFocus === focus.value
                      ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-purple-50 dark:hover:bg-purple-900/30'
                  ]"
                  @click="selectedAnalysisFocus = focus.value as AnalysisFocus"
                >
                  {{ focus.label }}
                </button>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">原文内容</label>
              <textarea
                v-model="analysisInput.content"
                rows="8"
                placeholder="请粘贴要分析的原文内容（前3000字左右效果最佳）"
                class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              ></textarea>
              <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">
                建议粘贴3000-5000字，AI将分析其结构、技法和亮点
              </div>
            </div>

            <!-- 分析按钮 -->
            <button
              class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-600 text-white font-medium shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
              :disabled="isAnalyzing || !analysisInput.title || !analysisInput.content"
              @click="handleStartAnalysis"
            >
              <Search v-if="!isAnalyzing" class="w-4 h-4" />
              <span v-else class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              {{ isAnalyzing ? "分析中..." : "开始分析" }}
            </button>

            <!-- 分析结果 -->
            <div v-if="analysisResult" class="pt-4 border-t border-gray-100 dark:border-gray-800">
              <div class="flex items-center justify-between mb-2">
                <h4 class="font-medium text-gray-900 dark:text-white">分析报告</h4>
                <button
                  class="flex items-center gap-1 px-2 py-1 text-xs text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                  @click="copyAnalysisResult"
                >
                  <Copy class="w-3 h-3" />
                  复制报告
                </button>
              </div>
              <div class="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 max-h-96 overflow-y-auto">
                <pre class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans">{{ analysisResult }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style>
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.2s ease-out;
}
</style>

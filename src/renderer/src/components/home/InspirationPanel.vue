<script setup lang="ts">
/**
 * InspirationPanel v2 - 创意灵感面板
 * Moliu v2.0 - 集成追读力评分和六维评估的创作灵感面板
 */
import { ref, computed, watch } from "vue";
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
  TrendingUp,
  Eye,
  Rocket,
  Layers3,
} from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { useMessage } from "naive-ui";
import { NModal, NInput, NSelect, NButton } from "naive-ui";
import { useInspirationStore } from "@/stores/inspiration.store";
import { genreTags as configGenreTags, settingElements as configSettingElements } from "@/data/inspirations";
import { timing } from "@/config/timing";
import type { GeneratedOutline } from "@/types/inspiration";
import type { OutlineDirection } from "@/services/outline/types/direction";
import type { ExecutableOutline } from "@/services/outline/types/executable-outline";
import { useOutlineGenerator } from "@/composables/useOutlineGenerator";
import { useProjectCreator } from "@/composables/useProjectCreator";
import { TextAnalysisService, type AnalysisFocus } from "@/services/writing/text-analysis-service";
import { calculateFiveDimensionEvaluation, getEvaluationAdvice } from "@/composables/useInspirationEvaluation";
import type { FiveDimensionEvaluation } from "@/types/inspiration";
import DirectionResultPanel from "@/components/home/DirectionResultPanel.vue";
import { mapExecutableOutlineToGeneratedOutline } from "@/services/outline/adapters/executable-outline-adapter";
import WordCountSelector from "@/components/common/WordCountSelector.vue";
import InspirationScore from "@/components/home/InspirationScore.vue";
import StoryCardSelector from "@/components/home/StoryCardSelector.vue";
import MarketTrendsPanel from "@/components/home/MarketTrendsPanel.vue";
import RetentionScoreCard from "./new/RetentionScoreCard.vue";
import type { StoryCardComposition } from "@/data/story-cards";
import { DEFAULT_WORD_COUNT_RANGE } from "@/services/ai/unified.service";

// ============================================================
// Types
// ============================================================

type DisplayMode = "all" | "collapsed";
type CreationTab = "quick" | "custom";
type PanelState = "selecting" | "generating" | "generated";
type AudienceType = "general" | "male" | "female";

// ============================================================
// Composables
// ============================================================

const { t } = useI18n();
const message = useMessage();
const inspirationStore = useInspirationStore();

const {
  isGenerating,
  error: generationError,
  progress: generationProgress,
  warnings: outlineWarnings,
  generateDirections,
  expandDirection,
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

// Panel state
const panelState = ref<PanelState>("selecting");
const creationTab = ref<CreationTab>("quick");

// 独立的"标签/元素洗牌中"状态：以前复用了 useOutlineGenerator 的 isGenerating，
// 会让"换一批 / 随机灵感"误触发大纲生成中的骨架屏和进度条。
const isShuffling = ref(false);

// Analysis modal
const showAnalysisModal = ref(false);
const isAnalyzing = ref(false);
const analysisInput = ref({ title: "", content: "", genre: "都市" });
const analysisResult = ref<string>("");
const selectedAnalysisFocus = ref<AnalysisFocus>("all");

// Genre options for NSelect
const genreOptions = [
  { label: "都市", value: "都市" },
  { label: "玄幻", value: "玄幻" },
  { label: "仙侠", value: "仙侠" },
  { label: "穿越", value: "穿越" },
  { label: "言情", value: "言情" },
  { label: "科幻", value: "科幻" },
  { label: "悬疑", value: "悬疑" },
  { label: "武侠", value: "武侠" },
  { label: "军事", value: "军事" },
  { label: "游戏", value: "游戏" },
];

// Analysis focus options
const analysisFocusOptions = [
  { label: "全部", value: "all" },
  { label: "黄金三章", value: "golden3" },
  { label: "整体结构", value: "structure" },
  { label: "人物架构", value: "character" },
  { label: "情节设计", value: "plot" },
];

// Selectors
const selectedOutline = ref<GeneratedOutline | null>(null);
const generatedDirections = ref<OutlineDirection[]>([]);
const selectedDirection = ref<OutlineDirection | null>(null);
const expandedOutline = ref<ExecutableOutline | null>(null);
const selectedWordCountRange = ref(DEFAULT_WORD_COUNT_RANGE);
const selectedQuickScenario = ref<string | null>(null);

// Audience
const audienceTypes: { id: AudienceType; name: string; icon: string; description: string }[] = [
  { id: "general", name: "大众", icon: "👥", description: "适合所有读者" },
  { id: "male", name: "男生", icon: "♂️", description: "男性向作品" },
  { id: "female", name: "女生", icon: "♀️", description: "女性向作品" },
];
const selectedAudience = ref<AudienceType>("general");

// Tags/Elements display
const TAG_DISPLAY_COUNT = 10;
const ELEMENT_DISPLAY_COUNT = 10;
const tagDisplayMode = ref<DisplayMode>("collapsed");
const elementDisplayMode = ref<DisplayMode>("collapsed");

const shuffledGenreTags = ref([...configGenreTags]);
const shuffledSettingElements = ref([...configSettingElements]);

// UI toggles
const showStoryCardSelector = ref(false);
const showMarketTrendsPanel = ref(false);

// ============================================================
// Computed
// ============================================================

const isProcessing = computed(() => isGenerating.value || isCreating.value);
const combinedError = computed(() => generationError.value || projectCreateError.value);

const directionCards = computed(() =>
  generatedDirections.value.map((direction, index) => ({
    id: direction.id,
    icon: [Rocket, Layers3, Wand2][index] ?? Sparkles,
    accent: [
      "from-indigo-500 to-violet-600",
      "from-fuchsia-500 to-pink-600",
      "from-amber-500 to-orange-600",
    ][index] ?? "from-slate-500 to-slate-600",
    direction,
  })),
);

const previewGeneratedOutline = computed<GeneratedOutline | null>(() => {
  if (!expandedOutline.value) return null;
  return mapExecutableOutlineToGeneratedOutline(expandedOutline.value, {
    targetWordCountRange: selectedWordCountRange.value,
  });
});

const previewOutline = computed<GeneratedOutline | null>(() => {
  if (selectedOutline.value) return selectedOutline.value;
  return previewGeneratedOutline.value;
});

const canExpandDirection = computed(
  () => !!selectedDirection.value && !isProcessing.value,
);

// 当前步骤索引（0=受众选择, 1=标签, 2=元素, 3=生成）
const currentStep = computed(() => {
  if (creationTab.value === "quick" && hasQuickSelection.value) return 3;
  if (inspirationStore.selectedElements.length > 0) return 3;
  if (inspirationStore.selectedTags.length > 0) return 2;
  return 1;
});

const hasQuickSelection = computed(() => {
  return (
    inspirationStore.selectedTags.length > 0 ||
    inspirationStore.selectedElements.length > 0
  );
});

const displayedTags = computed(() => {
  return tagDisplayMode.value === "all"
    ? shuffledGenreTags.value
    : shuffledGenreTags.value.slice(0, TAG_DISPLAY_COUNT);
});

const displayedElements = computed(() => {
  return elementDisplayMode.value === "all"
    ? shuffledSettingElements.value
    : shuffledSettingElements.value.slice(0, ELEMENT_DISPLAY_COUNT);
});

const tagsTotalCount = computed(() => shuffledGenreTags.value.length);
const elementsTotalCount = computed(() => shuffledSettingElements.value.length);

// 按受众过滤的快速场景
const filteredQuickScenarios = computed(() => {
  if (selectedAudience.value === "general") {
    return quickScenarios;
  }
  return quickScenarios.filter(s => s.audience === selectedAudience.value);
});

// Five dimension evaluation
const fiveDimensionEvaluation = computed<FiveDimensionEvaluation | null>(() => {
  if (inspirationStore.selectedTags.length === 0 && inspirationStore.selectedElements.length === 0) {
    return null;
  }

  const selectedTagNames = inspirationStore.selectedTags
    .map((id) => configGenreTags.find((t) => t.id === id)?.name || "")
    .filter(Boolean);

  const selectedElementNames = inspirationStore.selectedElements
    .map((id) => settingElements.find((e) => e.id === id)?.name || "")
    .filter(Boolean);

  return calculateFiveDimensionEvaluation(selectedTagNames, selectedElementNames);
});

const evaluationAdvice = computed(() => {
  if (!fiveDimensionEvaluation.value) return [];
  return getEvaluationAdvice(fiveDimensionEvaluation.value);
});

const showEvaluation = computed(() => {
  return hasQuickSelection.value && fiveDimensionEvaluation.value !== null;
});

// ============================================================
// Quick Scenarios (精选场景)
// ============================================================

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
  // 男性向 - 玄幻仙侠
  { id: "qs-fan-1", title: "废物流逆袭", audience: "male", tags: ["修仙", "玄幻"], elements: ["资质平平", "灭门惨案", "逆袭打脸"], icon: "💫", gradient: "from-indigo-500 to-purple-600" },
  { id: "qs-fan-2", title: "洪荒崛起", audience: "male", tags: ["洪荒", "玄幻"], elements: ["穿越者", "宗门崛起", "势力崛起"], icon: "🌋", gradient: "from-amber-500 to-red-600" },
  { id: "qs-fan-3", title: "剑道至尊", audience: "male", tags: ["玄幻", "武侠"], elements: ["传承觉醒", "宗门大比", "天才流"], icon: "⚔️", gradient: "from-emerald-500 to-teal-600" },
  { id: "qs-fan-4", title: "系统修仙", audience: "male", tags: ["修仙", "都市"], elements: ["系统流", "神秘导师", "资质平平"], icon: "🎮", gradient: "from-violet-500 to-purple-600" },
  { id: "qs-fan-5", title: "都市修仙", audience: "male", tags: ["都市", "修仙"], elements: ["灵气复苏", "隐藏血脉", "都市修仙"], icon: "🌃", gradient: "from-cyan-500 to-blue-600" },
  { id: "qs-fan-6", title: "重生夺舍", audience: "male", tags: ["修仙", "穿越"], elements: ["重生者", "身份伪装", "逆袭打脸"], icon: "⏰", gradient: "from-slate-600 to-indigo-700" },

  // 男性向 - 都市军旅
  { id: "qs-urb-1", title: "都市兵王", audience: "male", tags: ["都市", "军旅"], elements: ["神秘导师", "隐藏血脉", "逆袭打脸"], icon: "🎖️", gradient: "from-slate-600 to-gray-700" },
  { id: "qs-urb-2", title: "特种兵王", audience: "male", tags: ["都市", "特种兵"], elements: ["神秘导师", "红颜知己", "兄弟情义"], icon: "🗡️", gradient: "from-green-700 to-emerald-800" },
  { id: "qs-urb-3", title: "商战霸主", audience: "male", tags: ["都市", "职场"], elements: ["重生者", "商战博弈", "背叛陷害"], icon: "💼", gradient: "from-amber-500 to-orange-600" },
  { id: "qs-urb-4", title: "神医归来", audience: "male", tags: ["都市", "医疗"], elements: ["传承觉醒", "都市修仙", "红颜知己"], icon: "💉", gradient: "from-teal-500 to-cyan-600" },

  // 男性向 - 科幻星际
  { id: "qs-sci-1", title: "星际探险", audience: "male", tags: ["星际", "科幻"], elements: ["穿越异界", "星际争霸", "正邪对立"], icon: "🚀", gradient: "from-cyan-500 to-blue-600" },
  { id: "qs-sci-2", title: "末世生存", audience: "male", tags: ["末世", "废土"], elements: ["末日生存", "废土末世", "生存危机"], icon: "☢️", gradient: "from-lime-500 to-green-600" },
  { id: "qs-sci-3", title: "赛博朋克", audience: "male", tags: ["赛博朋克", "科幻"], elements: ["赛博都市", "正邪对立", "机械改造"], icon: "🤖", gradient: "from-cyan-400 to-blue-500" },

  // 女性向 - 甜宠言情
  { id: "qs-rom-1", title: "甜宠总裁", audience: "female", tags: ["都市", "言情", "总裁"], elements: ["总裁/大佬", "甜宠", "误会重重"], icon: "👔", gradient: "from-pink-500 to-rose-600" },
  { id: "qs-rom-2", title: "校园暗恋", audience: "female", tags: ["校园", "言情"], elements: ["校花/学霸", "青梅竹马", "暗恋追求"], icon: "🌸", gradient: "from-pink-400 to-rose-500" },
  { id: "qs-rom-3", title: "豪门联姻", audience: "female", tags: ["都市", "言情"], elements: ["总裁/大佬", "误会重重", "逆袭打脸"], icon: "💍", gradient: "from-rose-500 to-pink-600" },
  { id: "qs-rom-4", title: "国民女神", audience: "female", tags: ["娱乐", "言情", "都市"], elements: ["女强人", "总裁/大佬", "三角恋"], icon: "⭐", gradient: "from-violet-500 to-purple-600" },

  // 女性向 - 古风穿越
  { id: "qs-gus-1", title: "宫墙之内", audience: "female", tags: ["宫斗", "穿越"], elements: ["权力斗争", "误会重重", "皇帝"], icon: "👑", gradient: "from-red-500 to-rose-600" },
  { id: "qs-gus-2", title: "宅斗风云", audience: "female", tags: ["宅斗", "穿越"], elements: ["家族羁绊", "逆袭打脸", "姐妹情深"], icon: "🏠", gradient: "from-amber-500 to-orange-600" },
  { id: "qs-gus-3", title: "种田发家", audience: "female", tags: ["种田", "穿越"], elements: ["势力崛起", "红颜知己", "萌宠/灵兽"], icon: "🌾", gradient: "from-green-500 to-emerald-600" },
  { id: "qs-gus-4", title: "王爷宠妻", audience: "female", tags: ["穿越", "历史"], elements: ["皇子/贵族", "甜宠", "师尊/师父"], icon: "🕊️", gradient: "from-pink-400 to-rose-500" },

  // 女性向 - 奇幻仙侠
  { id: "qs-xia-1", title: "师尊在上", audience: "female", tags: ["仙侠", "言情"], elements: ["师尊/师父", "修仙", "误会重重"], icon: "🧘", gradient: "from-violet-500 to-purple-600" },
  { id: "qs-xia-2", title: "废柴逆袭", audience: "female", tags: ["修仙", "玄幻"], elements: ["资质平平", "师尊/师父", "逆袭打脸"], icon: "💫", gradient: "from-indigo-500 to-purple-600" },

  // 大众向
  { id: "qs-gam-1", title: "全息游戏", audience: "general", tags: ["游戏", "虚拟现实"], elements: ["游戏世界", "穿越异界", "系统流"], icon: "🎮", gradient: "from-violet-500 to-purple-600" },
  { id: "qs-gam-2", title: "电竞冠军", audience: "general", tags: ["电竞", "都市"], elements: ["兄弟情义", "逆袭打脸", "直播"], icon: "🏆", gradient: "from-indigo-500 to-blue-600" },
  { id: "qs-mys-1", title: "心理罪者", audience: "general", tags: ["悬疑", "推理"], elements: ["身世之谜", "身份认同", "正邪对立"], icon: "🔍", gradient: "from-slate-500 to-gray-600" },
  { id: "qs-mys-2", title: "密室逃生", audience: "general", tags: ["悬疑", "惊悚"], elements: ["生存危机", "身份认同", "逃生"], icon: "🚪", gradient: "from-gray-700 to-slate-800" },
  { id: "qs-lif-1", title: "美食日常", audience: "general", tags: ["美食", "都市"], elements: ["萌宠/灵兽", "红颜知己", "创业致富"], icon: "🍳", gradient: "from-yellow-500 to-amber-600" },
];

// ============================================================
// Methods
// ============================================================

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function toggleTag(tagId: string) {
  if (creationTab.value === "custom") {
    selectedQuickScenario.value = null;
  }
  inspirationStore.toggleTag(tagId);
}

function toggleElement(elementId: string) {
  inspirationStore.toggleElement(elementId);
}

function selectAudience(audienceId: AudienceType) {
  selectedAudience.value = audienceId;
  selectedQuickScenario.value = null;
  inspirationStore.reset();
  shuffledGenreTags.value = shuffleArray(configGenreTags);
  shuffledSettingElements.value = shuffleArray(configSettingElements);
  tagDisplayMode.value = "all";
  elementDisplayMode.value = "all";
}

function applyQuickScenario(scenario: QuickScenario) {
  inspirationStore.reset();
  selectedQuickScenario.value = scenario.id;
  selectedAudience.value = scenario.audience;

  scenario.tags.forEach((tagName) => {
    const tag = configGenreTags.find((g) => g.name === tagName);
    if (tag) inspirationStore.toggleTag(tag.id);
  });

  scenario.elements.forEach((elementName) => {
    const element = settingElements.find((e) => e.name === elementName);
    if (element) inspirationStore.toggleElement(element.id);
  });

  panelState.value = "selecting";
  generatedDirections.value = [];
  selectedDirection.value = null;
  expandedOutline.value = null;
  selectedOutline.value = null;
  tagDisplayMode.value = "all";
  elementDisplayMode.value = "all";
}

async function refreshTags() {
  isShuffling.value = true;
  await new Promise((resolve) => setTimeout(resolve, timing.mockApi.quick));
  shuffledGenreTags.value = shuffleArray(configGenreTags);
  inspirationStore.reset();
  panelState.value = "selecting";
  tagDisplayMode.value = "all";
  isShuffling.value = false;
}

async function randomPick() {
  isShuffling.value = true;
  await new Promise((resolve) => setTimeout(resolve, 500));

  shuffledGenreTags.value = shuffleArray(configGenreTags);
  shuffledSettingElements.value = shuffleArray(configSettingElements);
  inspirationStore.reset();

  const randomAudience = audienceTypes[Math.floor(Math.random() * audienceTypes.length)];
  selectedAudience.value = randomAudience.id;

  const tagCount = 1 + Math.floor(Math.random() * 3);
  const elementCount = 1 + Math.floor(Math.random() * 3);

  shuffledGenreTags.value.slice(0, tagCount).forEach((tag) => {
    inspirationStore.toggleTag(tag.id);
  });

  shuffledSettingElements.value.slice(0, elementCount).forEach((element) => {
    inspirationStore.toggleElement(element.id);
  });

  tagDisplayMode.value = "collapsed";
  elementDisplayMode.value = "collapsed";
  isShuffling.value = false;
}

function clearSelection() {
  inspirationStore.reset();
  selectedAudience.value = "general";
  shuffledGenreTags.value = shuffleArray(configGenreTags);
  shuffledSettingElements.value = shuffleArray(settingElements);
  panelState.value = "selecting";
  selectedOutline.value = null;
  tagDisplayMode.value = "collapsed";
  elementDisplayMode.value = "collapsed";
  resetOutlineState();
  resetProjectState();
}

function buildPrompt(): string {
  const tags = inspirationStore.selectedTags
    .map((id) => configGenreTags.find((t) => t.id === id)?.name)
    .filter(Boolean);
  const elements = inspirationStore.selectedElements
    .map((id) => settingElements.find((e) => e.id === id)?.name)
    .filter(Boolean);

  // 注意：这里只输出"创意种子"，不再指定输出格式（JSON/Markdown）。
  // 输出格式由 UnifiedOutlineGenerator 的系统提示词统一负责（Markdown）。
  // 旧实现里同时塞了"输出 JSON"的指令和"八线并行"等方法论，会和系统提示词
  // （要求 Markdown、采用三线交织）正面冲突，导致模型漂移、字段解析失败。
  const audience = audienceTypes.find((a) => a.id === selectedAudience.value)?.name ?? "大众";

  return `【受众定位】${audience}

【题材标签】${tags.join("、") || "未指定"}

【设定元素】${elements.join("、") || "未指定"}

【字数目标】${selectedWordCountRange.value}

请基于以上受众、题材、设定元素和字数目标，生成多个结构完整、卖点清晰、风格各异的网文大纲创意。每个大纲都要有独特的主卖点，避免同质化；优先考虑前 30 章的追读动力和长篇连载承载力。`;
}

async function handleGenerateOutlines() {
  const prompt = buildPrompt();
  selectedOutline.value = null;
  expandedOutline.value = null;
  generatedDirections.value = await generateDirections(prompt, {
    wordCountRange: selectedWordCountRange.value,
  });
  selectedDirection.value = generatedDirections.value[0] ?? null;
  panelState.value = generatedDirections.value.length > 0 ? "generated" : "selecting";
}

function selectDirection(direction: OutlineDirection) {
  selectedDirection.value = direction;
  expandedOutline.value = null;
  selectedOutline.value = null;
}

async function handleExpandDirection() {
  if (!selectedDirection.value) return;
  expandedOutline.value = await expandDirection(buildPrompt(), selectedDirection.value, {
    wordCountRange: selectedWordCountRange.value,
  });
  if (expandedOutline.value) {
    selectedOutline.value = previewGeneratedOutline.value;
    if (outlineWarnings.value.length > 0) {
      message.warning(
        `大纲已生成，但有 ${outlineWarnings.value.length} 条质量提示：${outlineWarnings.value[0].slice(0, 80)}`,
      );
    }
  }
}

function selectOutline(outline: GeneratedOutline) {
  selectedOutline.value = outline;
}

async function handleCreateProject() {
  const outline = selectedOutline.value ?? previewGeneratedOutline.value;
  if (!outline) return;
  await doCreateProject(outline);
}

function switchTab(tab: CreationTab) {
  creationTab.value = tab;
  selectedQuickScenario.value = null;
  if (tab === "custom") {
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
  generatedDirections.value = [];
  selectedDirection.value = null;
  expandedOutline.value = null;
  selectedOutline.value = null;
  tagDisplayMode.value = "collapsed";
  elementDisplayMode.value = "collapsed";
}

// Analysis modal handlers
function openAnalysisModal() {
  showAnalysisModal.value = true;
  analysisInput.value = { title: "", content: "", genre: "都市" };
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
    const { useAIService } = await import("@/services/ai/useAIService");
    const aiService = useAIService();

    const aiClient = async (prompt: string): Promise<string> => {
      return await aiService.complete(prompt);
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

// Market trends handlers
function openMarketTrendsPanel() {
  showMarketTrendsPanel.value = true;
}

function handleMarketTrendsSelectTag(tag: string) {
  const tagConfig = configGenreTags.find((t) => t.name === tag || t.name.includes(tag));
  if (tagConfig) {
    inspirationStore.toggleTag(tagConfig.id);
  }
  showMarketTrendsPanel.value = false;
}

// Story card selector handlers
function openStoryCardSelector() {
  showStoryCardSelector.value = true;
}

function handleStoryCardSelect(composition: StoryCardComposition) {
  const { primaryCard, secondaryCard } = composition;

  let prompt = `请根据以下故事卡组合，为我生成小说大纲。\n\n`;
  prompt += `主要故事卡：${primaryCard.name}\n`;
  prompt += `- 设定：${primaryCard.setup}\n`;
  prompt += `- 发展：${primaryCard.development}\n`;
  prompt += `- 高潮：${primaryCard.climax}\n`;
  prompt += `- 解决：${primaryCard.resolution}\n`;

  if (secondaryCard) {
    prompt += `\n次要故事卡：${secondaryCard.name}\n`;
    prompt += `- 设定：${secondaryCard.setup}\n`;
    prompt += `- 发展：${secondaryCard.development}\n`;
    prompt += `- 高潮：${secondaryCard.climax}\n`;
    prompt += `- 解决：${secondaryCard.resolution}\n`;
  }

  prompt += `\n请融合这两个故事卡的特点，生成一个完整的大纲。`;

  inspirationStore.reset();
  panelState.value = "selecting";
  generatedDirections.value = [];
  selectedDirection.value = null;
  expandedOutline.value = null;
  selectedOutline.value = null;

  generateDirections(prompt, {
    wordCountRange: selectedWordCountRange.value,
  }).then((results) => {
    generatedDirections.value = results;
    selectedDirection.value = results[0] ?? null;
    if (results.length > 0) {
      panelState.value = "generated";
    }
  });

  showStoryCardSelector.value = false;
}

// Alias for template compatibility
const genreTags = configGenreTags;
const settingElements = configSettingElements;
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
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
    <div v-if="panelState === 'selecting'" class="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl mb-4">
      <button
        class="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
        :class="creationTab === 'quick' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
        @click="switchTab('quick')"
      >
        <Zap class="w-4 h-4" />
        {{ t("inspiration.quickStart") }}
      </button>
      <button
        class="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
        :class="creationTab === 'custom' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
        @click="switchTab('custom')"
      >
        <Wand2 class="w-4 h-4" />
        {{ t("inspiration.customMode") }}
      </button>
    </div>

    <!-- Quick Scenarios -->
    <div v-if="panelState === 'selecting' && creationTab === 'quick'" class="mb-4">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs text-gray-500 dark:text-gray-400">选择{{ selectedAudience === 'general' ? '所有' : audienceTypes.find(a => a.id === selectedAudience)?.name }}类型的模板开始创作</span>
        <span class="text-xs text-amber-500">{{ filteredQuickScenarios.length }} 个可用</span>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="scenario in filteredQuickScenarios"
          :key="scenario.id"
          class="p-3 rounded-xl bg-gradient-to-br text-left transition-all duration-200 relative group"
          :class="[scenario.gradient, selectedQuickScenario === scenario.id ? 'ring-2 ring-white ring-offset-2 dark:ring-offset-gray-900 scale-[1.02]' : 'hover:scale-[1.02]']"
          @click="applyQuickScenario(scenario)"
        >
          <div v-if="selectedQuickScenario === scenario.id" class="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center">
            <Check class="w-3 h-3 text-white" />
          </div>
          <div class="flex items-center gap-2 mb-1.5">
            <span class="text-lg">{{ scenario.icon }}</span>
            <span class="font-medium text-sm text-white">{{ scenario.title }}</span>
          </div>
          <div class="flex flex-wrap gap-1">
            <span v-for="tag in scenario.tags" :key="tag" class="px-1.5 py-0.5 text-xs bg-white/20 rounded text-white/90">
              {{ tag }}
            </span>
          </div>
        </button>
      </div>
    </div>

    <!-- Custom Mode Content -->
    <div v-if="panelState === 'selecting' && creationTab === 'custom'">
      <!-- Progress Indicator -->
      <div class="flex items-center gap-1 mb-3">
        <div
          v-for="step in 3"
          :key="step"
          class="h-1 flex-1 rounded-full transition-all duration-300"
          :class="step <= currentStep ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gray-200 dark:bg-gray-700'"
        />
      </div>

      <!-- Step 1: Audience Selection -->
      <div class="mb-4">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <span class="text-xs font-bold text-white">1</span>
            </div>
            <span class="text-sm text-gray-700 dark:text-gray-300">{{ t("inspiration.audienceTitle") }}</span>
          </div>
          <button
            class="flex items-center gap-1 px-2 py-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg transition-colors"
            @click="randomPick"
            :disabled="isShuffling || isGenerating"
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
            :class="[selectedAudience === audience.id ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-amber-300 dark:hover:border-amber-600 bg-white dark:bg-gray-800']"
            @click="selectAudience(audience.id)"
          >
            <span class="text-xl">{{ audience.icon }}</span>
            <span class="font-medium text-xs text-gray-900 dark:text-white">{{ audience.name }}</span>
          </button>
        </div>
      </div>

      <!-- Step 2: Genre Tags -->
      <div v-if="currentStep >= 1" class="mb-4">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <span class="text-xs font-bold text-white">2</span>
            </div>
            <span class="text-sm text-gray-700 dark:text-gray-300">{{ t("inspiration.step1Title") }}</span>
            <span class="text-xs text-gray-400 dark:text-gray-500">({{ tagsTotalCount }})</span>
          </div>
          <button
            v-if="shuffledGenreTags.length > TAG_DISPLAY_COUNT"
            class="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
            @click="tagDisplayMode = tagDisplayMode === 'all' ? 'collapsed' : 'all'"
          >
            <span>{{ tagDisplayMode === 'collapsed' ? '展开' : '收起' }}</span>
            <ChevronDown class="w-3.5 h-3.5 transition-transform" :class="{ 'rotate-180': tagDisplayMode === 'all' }" />
          </button>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            v-for="tag in displayedTags"
            :key="tag.id"
            class="px-3 py-1.5 rounded-lg text-sm transition-all duration-200 relative group"
            :class="[inspirationStore.selectedTags.includes(tag.id) ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500/50' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30']"
            @click="toggleTag(tag.id)"
          >
            <span class="mr-1">{{ tag.icon }}</span>
            {{ tag.name }}
            <span v-if="tag.description && inspirationStore.selectedTags.includes(tag.id)" class="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 text-xs bg-gray-900 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
              {{ tag.description }}
            </span>
          </button>
        </div>

        <div v-if="tagDisplayMode === 'collapsed' && shuffledGenreTags.length > TAG_DISPLAY_COUNT" class="mt-2 text-center">
          <span class="text-xs text-gray-400 dark:text-gray-500">还有 {{ shuffledGenreTags.length - TAG_DISPLAY_COUNT }} 个标签，点击展开查看全部</span>
        </div>
      </div>

      <!-- Step 3: Setting Elements -->
      <div v-if="currentStep >= 2" class="animate-fade-in">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <span class="text-xs font-bold text-white">3</span>
            </div>
            <span class="text-sm text-gray-700 dark:text-gray-300">{{ t("inspiration.step2Title") }}</span>
            <span class="text-xs text-gray-400 dark:text-gray-500">({{ elementsTotalCount }})</span>
          </div>
          <button
            v-if="shuffledSettingElements.length > ELEMENT_DISPLAY_COUNT"
            class="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
            @click="elementDisplayMode = elementDisplayMode === 'all' ? 'collapsed' : 'all'"
          >
            <span>{{ elementDisplayMode === 'collapsed' ? '展开' : '收起' }}</span>
            <ChevronDown class="w-3.5 h-3.5 transition-transform" :class="{ 'rotate-180': elementDisplayMode === 'all' }" />
          </button>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            v-for="element in displayedElements"
            :key="element.id"
            class="px-3 py-1.5 rounded-lg text-sm transition-all duration-200"
            :class="[inspirationStore.selectedElements.includes(element.id) ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/50' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30']"
            @click="toggleElement(element.id)"
          >
            <span class="mr-1">{{ element.icon }}</span>
            {{ element.name }}
          </button>
        </div>
      </div>
    </div>

    <!-- Generate Section -->
    <div v-if="panelState === 'selecting' && currentStep >= 3" class="animate-fade-in pt-2 space-y-3">
      <!-- Selected Summary (Quick Mode) -->
      <div v-if="creationTab === 'quick'" class="mb-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xs text-amber-600 dark:text-amber-400 font-medium">受众人群</span>
          <span class="px-2 py-0.5 text-xs rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
            {{ audienceTypes.find(a => a.id === selectedAudience)?.icon }}
            {{ audienceTypes.find(a => a.id === selectedAudience)?.name }}
          </span>
        </div>
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xs text-indigo-600 dark:text-indigo-400 font-medium">题材标签</span>
          <div class="flex flex-wrap gap-1">
            <span v-for="tagId in inspirationStore.selectedTags" :key="tagId" class="px-2 py-0.5 text-xs rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400">
              {{ genreTags.find((t) => t.id === tagId)?.name }}
            </span>
          </div>
        </div>
        <div class="flex items-start gap-2">
          <span class="text-xs text-emerald-600 dark:text-emerald-400 font-medium pt-0.5">设定元素</span>
          <div class="flex flex-wrap gap-1">
            <span v-for="elementId in inspirationStore.selectedElements" :key="elementId" class="px-2 py-0.5 text-xs rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">
              {{ settingElements.find((e) => e.id === elementId)?.name }}
            </span>
          </div>
        </div>
      </div>

      <!-- Five Dimension Evaluation -->
      <div v-if="showEvaluation && fiveDimensionEvaluation" class="mb-3 p-3 rounded-xl bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20 border border-violet-200 dark:border-violet-800">
        <div class="flex items-center gap-2 mb-3">
          <TrendingUp class="w-4 h-4 text-violet-500" />
          <span class="text-sm font-medium text-violet-700 dark:text-violet-400">创意评估</span>
        </div>
        <InspirationScore :evaluation="fiveDimensionEvaluation" :compact="true" />
        <div v-if="evaluationAdvice.length > 0" class="mt-3 pt-2 border-t border-violet-200 dark:border-violet-700">
          <p v-for="(advice, index) in evaluationAdvice" :key="index" class="text-xs text-violet-600 dark:text-violet-400 mb-1">
            • {{ advice }}
          </p>
        </div>
      </div>

      <!-- Retention Score Card (v2 Feature) -->
      <RetentionScoreCard
        :tags="inspirationStore.selectedTags.map(id => genreTags.find(t => t.id === id)?.name || '')"
        :elements="inspirationStore.selectedElements.map(id => settingElements.find(e => e.id === id)?.name || '')"
        :compact="true"
      />

      <!-- Word Count Selector -->
      <div class="flex items-center justify-between px-1">
        <WordCountSelector v-model="selectedWordCountRange" :disabled="isProcessing" />
        <span class="text-xs text-gray-400 dark:text-gray-500">字数范围</span>
      </div>

      <button
        class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 text-white text-sm font-semibold shadow-lg hover:shadow-xl transition-all"
        :disabled="isProcessing"
        @click="handleGenerateOutlines"
      >
        <Sparkles v-if="!isProcessing" class="w-4 h-4" />
        <span v-if="isProcessing" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
        {{ t("inspiration.generateOutline") }}
      </button>
    </div>

    <!-- Direction + outline -->
    <DirectionResultPanel
      v-if="panelState === 'generated' || isGenerating"
      :show="true"
      title="候选方向"
      description="先选一个方向展开主方案，再创建项目。"
      :cards="directionCards"
      :selected-direction="selectedDirection"
      :is-processing="!!isProcessing"
      :progress="generationProgress || ''"
      :error="combinedError"
      :can-expand="canExpandDirection"
      compact
      :preview-outline="previewOutline"
      :expanded-outline="expandedOutline"
      empty-description="请先选择一个创作方向并展开主方案。"
      @regenerate="handleGenerateOutlines"
      @select-direction="selectDirection"
      @expand="handleExpandDirection"
      @select-outline="selectOutline"
      @create="handleCreateProject"
    />

    <!-- Error Message -->
    <div v-if="combinedError && panelState !== 'generated'" class="mt-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
      <p class="text-xs text-red-600 dark:text-red-400">{{ combinedError }}</p>
    </div>

    <!-- Empty State -->
    <div v-if="panelState === 'selecting' && creationTab === 'custom' && currentStep === 1" class="text-center py-4">
      <Sparkles class="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
      <p class="text-xs text-gray-400 dark:text-gray-500">{{ t("inspiration.startJourneyDesc") }}</p>
    </div>

    <!-- Tool Buttons -->
    <div class="pt-4 border-t border-gray-100 dark:border-gray-800">
      <div class="grid grid-cols-3 gap-2">
        <button
          class="flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all duration-200 shadow-sm hover:shadow-md"
          @click="openAnalysisModal"
        >
          <Search class="w-5 h-5" />
          <span class="text-xs font-medium">拆文分析</span>
        </button>
        <button
          class="flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all duration-200 shadow-sm hover:shadow-md"
          @click="openStoryCardSelector"
        >
          <Wand2 class="w-5 h-5" />
          <span class="text-xs font-medium">故事卡</span>
        </button>
        <button
          class="flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all duration-200 shadow-sm hover:shadow-md"
          @click="openMarketTrendsPanel"
        >
          <TrendingUp class="w-5 h-5" />
          <span class="text-xs font-medium">市场趋势</span>
        </button>
      </div>
      <p class="text-xs text-gray-400 dark:text-gray-500 text-center mt-3">探索创意的无限可能</p>
    </div>

    <!-- Market Trends Panel -->
    <MarketTrendsPanel
      v-if="showMarketTrendsPanel"
      :selected-tags="inspirationStore.selectedTags.map(id => genreTags.find(t => t.id === id)?.name || '')"
      @close="showMarketTrendsPanel = false"
      @select="handleMarketTrendsSelectTag"
    />

    <!-- Story Card Selector -->
    <StoryCardSelector
      v-if="showStoryCardSelector"
      :selected-tags="inspirationStore.selectedTags.map(id => genreTags.find(t => t.id === id)?.name || '')"
      @select="handleStoryCardSelect"
      @close="showStoryCardSelector = false"
    />

    <!-- Analysis Modal -->
    <NModal
      v-model:show="showAnalysisModal"
      preset="card"
      title="拆文分析"
      :style="{ width: '800px', maxHeight: '85vh' }"
      :mask-closable="true"
      :bordered="false"
      class="!bg-white dark:!bg-gray-800 !rounded-2xl"
    >
      <template #header-extra>
        <div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <FileText class="w-4 h-4 text-purple-500" />
          <span>AI智能分析</span>
        </div>
      </template>

      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">书名</label>
            <NInput
              v-model:value="analysisInput.title"
              placeholder="请输入要分析的书名"
              clearable
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">题材</label>
            <NSelect
              v-model:value="analysisInput.genre"
              :options="genreOptions"
              placeholder="选择题材"
            />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">分析重点</label>
          <div class="flex flex-wrap gap-2">
            <NButton
              v-for="focus in analysisFocusOptions"
              :key="focus.value"
              size="small"
              :type="selectedAnalysisFocus === focus.value ? 'primary' : 'default'"
              :quaternary="selectedAnalysisFocus !== focus.value"
              @click="selectedAnalysisFocus = focus.value as AnalysisFocus"
            >
              {{ focus.label }}
            </NButton>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">原文内容</label>
          <NInput
            v-model:value="analysisInput.content"
            type="textarea"
            placeholder="请粘贴要分析的原文内容（前3000字左右效果最佳）"
            :autosize="{ minRows: 6, maxRows: 12 }"
            show-count
          />
          <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">建议粘贴3000-5000字，AI将分析其结构、技法和亮点</div>
        </div>

        <NButton
          class="w-full"
          type="primary"
          size="large"
          :loading="isAnalyzing"
          :disabled="!analysisInput.title || !analysisInput.content"
          @click="handleStartAnalysis"
        >
          <template #icon>
            <Search v-if="!isAnalyzing" class="w-4 h-4" />
          </template>
          {{ isAnalyzing ? "分析中..." : "开始分析" }}
        </NButton>

        <div v-if="analysisResult" class="pt-4 border-t border-gray-100 dark:border-gray-700">
          <div class="flex items-center justify-between mb-2">
            <h4 class="font-medium text-gray-900 dark:text-white">分析报告</h4>
            <NButton size="small" quaternary @click="copyAnalysisResult">
              <template #icon>
                <Copy class="w-3 h-3" />
              </template>
              复制报告
            </NButton>
          </div>
          <div class="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 max-h-80 overflow-y-auto">
            <pre class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans">{{ analysisResult }}</pre>
          </div>
        </div>
      </div>
    </NModal>
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

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import {
  Sparkles,
  ArrowRight,
  Check,
  Wand2,
  BookOpen,
  Save,
  Edit3,
  RotateCcw,
  ChevronDown,
  RefreshCw,
} from "lucide-vue-next";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useSettingsStore } from "@/stores/settings.store";
import { useProjectStore } from "@/stores/project.store";
import { useInspirationStore } from "@/stores/inspiration.store";
import { UnifiedAIService } from "@/services/ai/unified.service";
import { FunctionCallingClient } from "@/services/ai/function-calling-client";
import { WORD_COUNT_OPTIONS, DEFAULT_WORD_COUNT_RANGE } from "@/services/ai/unified.service";
import type { GeneratedOutline } from "@/types/inspiration";
import type { PlotNode } from "@/types/project";
import { writingTemplates } from "@/data/inspirations";
import { NTooltip } from "naive-ui";

const { t } = useI18n();
const router = useRouter();
const settingsStore = useSettingsStore();
const projectStore = useProjectStore();
const inspirationStore = useInspirationStore();

const activeTab = ref<"templates" | "custom">("templates");
const selectedTemplate = ref<(typeof writingTemplates)[0] | null>(null);
const prompt = ref("");
const storyType = ref("");
const mainCharacter = ref("");
const storyGoal = ref("");
const conflict = ref("");
const customSettings = ref("");

const showStructuredInput = ref(false);

// 字数范围选择
const selectedWordCountRange = ref(DEFAULT_WORD_COUNT_RANGE);
const showWordCountDropdown = ref(false);

const isGenerating = ref(false);
const generatedOutlines = ref<GeneratedOutline[]>([]);
const selectedOutline = ref<GeneratedOutline | null>(null);
const streamingError = ref<string | null>(null);

// Draft state
const savedDraft = ref<{
  prompt: string;
  storyType: string;
  mainCharacter: string;
  storyGoal: string;
  conflict: string;
  customSettings: string;
  templateId: string | null;
  timestamp: number;
  wordCountRange: string;
} | null>(null);

const showDraftMenu = ref(false);

const canGenerate = computed(() => {
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

const isPromptTooLong = computed(() => prompt.value.length > MAX_PROMPT_LENGTH);

const promptPreview = computed(() => {
  if (activeTab.value === "templates" && selectedTemplate.value) {
    return selectedTemplate.value.prompt;
  }
  return prompt.value;
});

// Event listeners cleanup (no longer needed since we use direct service calls)
let aiServiceInstance: UnifiedAIService | null = null;
// 进度消息
const generationProgress = ref<string>('');

onMounted(() => {
  // Load saved draft from localStorage
  const draft = localStorage.getItem("quickStartDraft");
  if (draft) {
    try {
      savedDraft.value = JSON.parse(draft);
    } catch (e) {
      console.error("Failed to parse saved draft:", e);
    }
  }
});

onUnmounted(() => {
  // Cleanup is no longer needed since we use direct service calls
});

function selectTemplate(template: (typeof writingTemplates)[0]) {
  selectedTemplate.value = template;
}

function useStructuredInput() {
  showStructuredInput.value = !showStructuredInput.value;
  if (showStructuredInput.value) {
    activeTab.value = "custom";
  }
}

function updatePromptFromStructured() {
  const parts: string[] = [];

  if (storyType.value) {
    parts.push(`题材类型：${storyType.value}`);
  }
  if (mainCharacter.value) {
    parts.push(`主角设定：${mainCharacter.value}`);
  }
  if (storyGoal.value) {
    parts.push(`故事目标：${storyGoal.value}`);
  }
  if (conflict.value) {
    parts.push(`核心冲突：${conflict.value}`);
  }
  if (customSettings.value) {
    parts.push(`其他设定：${customSettings.value}`);
  }

  prompt.value = parts.join("\n");
}

function saveDraft() {
  const draft = {
    prompt: prompt.value,
    storyType: storyType.value,
    mainCharacter: mainCharacter.value,
    storyGoal: storyGoal.value,
    conflict: conflict.value,
    customSettings: customSettings.value,
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
    storyType.value = savedDraft.value.storyType;
    mainCharacter.value = savedDraft.value.mainCharacter;
    storyGoal.value = savedDraft.value.storyGoal;
    conflict.value = savedDraft.value.conflict;
    customSettings.value = savedDraft.value.customSettings;
    if (savedDraft.value.templateId) {
      selectedTemplate.value =
        writingTemplates.find((t) => t.id === savedDraft.value?.templateId) ||
        null;
    }
    activeTab.value = savedDraft.value.templateId ? "templates" : "custom";
    showStructuredInput.value = !!(
      storyType.value ||
      mainCharacter.value ||
      storyGoal.value ||
      conflict.value ||
      customSettings.value
    );
    // 恢复字数范围
    if (savedDraft.value.wordCountRange) {
      selectedWordCountRange.value = savedDraft.value.wordCountRange;
    }
  }
  showDraftMenu.value = false;
}

function clearDraft() {
  localStorage.removeItem("quickStartDraft");
  savedDraft.value = null;
}

async function generateOutlines() {
  if (!canGenerate.value) return;

  // 优先使用用户在设置页面选择的默认模型
  let enabledProvider = null;
  const defaultModelId = settingsStore.defaultModel;
  
  if (defaultModelId) {
    // 解析 defaultModelId，格式为 "providerId:modelName"
    const [providerId, modelName] = defaultModelId.split(':');
    enabledProvider = settingsStore.aiProviders.find(
      (p) => p.id === providerId && p.modelName === modelName && p.enabled && p.apiKey,
    );
  }
  
  // Fallback: 如果默认模型无效或未设置，找第一个启用的厂商
  if (!enabledProvider) {
    enabledProvider = settingsStore.aiProviders.find(
      (p) => p.enabled && p.apiKey,
    );
  }
  
  if (!enabledProvider) {
    streamingError.value = "请先在设置中配置 AI 提供商";
    return;
  }

  isGenerating.value = true;
  selectedOutline.value = null;
  generatedOutlines.value = [];
  streamingError.value = null;
  generationProgress.value = '';

  try {
    // 优先使用 Function Calling Client（更可靠）
    const fcClient = new FunctionCallingClient({
      provider: enabledProvider.provider,
      apiKey: enabledProvider.apiKey,
      baseUrl: enabledProvider.baseUrl,
      model: enabledProvider.modelName,
      temperature: enabledProvider.generationConfig?.temperature,
    });

    // 使用 Function Calling 生成大纲
    const result = await fcClient.generateOutline(
      promptPreview.value,
      selectedWordCountRange.value,
      (msg) => { generationProgress.value = msg; }
    );

    if (result && result.outlines) {
      generatedOutlines.value = result.outlines.map(
        (o: any, i: number) => {
          // 确保角色信息格式正确（支持结构化关系）
          const characters = (Array.isArray(o.characters) ? o.characters : []).map((c: any) => {
            // 处理旧格式的 relationships（字符串）
            if (typeof c.relationships === 'string') {
              return {
                name: c.name || '',
                role: c.role || '',
                description: c.description || '',
                personality: Array.isArray(c.personality) ? c.personality : [],
                appearance: c.appearance || '',
                abilities: Array.isArray(c.abilities) ? c.abilities : [],
                background: c.background || '',
                relationships: c.relationships ? [{ targetName: '', type: 'neutral', description: c.relationships }] : [],
              };
            }
            // 新格式的结构化关系
            return {
              name: c.name || '',
              role: c.role || '',
              description: c.description || '',
              personality: Array.isArray(c.personality) ? c.personality : [],
              appearance: c.appearance || '',
              abilities: Array.isArray(c.abilities) ? c.abilities : [],
              background: c.background || '',
              relationships: Array.isArray(c.relationships)
                ? c.relationships.map((r: any) => ({
                    targetName: r.targetName || '',
                    type: r.type || 'neutral',
                    description: r.description || '',
                  }))
                : [],
            };
          });

          // 确保伏笔信息格式正确
          const foreshadows = (Array.isArray(o.foreshadows) ? o.foreshadows : []).map((f: any) => {
            if (typeof f === 'string') {
              return { hint: f, type: 'mystery', suggestedChapter: undefined };
            }
            return {
              hint: f.hint || '',
              type: f.type || 'mystery',
              suggestedChapter: f.suggestedChapter,
            };
          });

          // 确保世界观信息格式正确（支持层级关系）
          const worldSetting = o.worldSetting ? {
            locations: (Array.isArray(o.worldSetting.locations) ? o.worldSetting.locations : []).map((l: any) => ({
              name: l.name || '',
              description: l.description || '',
              level: l.level || 'city',
              parentName: l.parentName || '',
            })),
            factions: (Array.isArray(o.worldSetting.factions) ? o.worldSetting.factions : []).map((f: any) => ({
              name: f.name || '',
              description: f.description || '',
              parentName: f.parentName || '',
              allies: Array.isArray(f.allies) ? f.allies : [],
              enemies: Array.isArray(f.enemies) ? f.enemies : [],
            })),
            rules: (Array.isArray(o.worldSetting.rules) ? o.worldSetting.rules : []).map((r: any) => ({
              name: r.name || '',
              description: r.description || '',
              category: r.category || 'custom',
              relatedRuleNames: Array.isArray(r.relatedRuleNames) ? r.relatedRuleNames : [],
            })),
          } : undefined;

          // 确保子情节格式正确
          const subplots = (Array.isArray(o.subplots) ? o.subplots : []).map((s: any) => ({
            title: s.title || '',
            description: s.description || '',
            relatedCharacters: Array.isArray(s.relatedCharacters) ? s.relatedCharacters : [],
            chapterRange: s.chapterRange || undefined,
            purpose: s.purpose || '',
          }));

          // 确保章节级大纲格式正确
          const chapters = (Array.isArray(o.chapters) ? o.chapters : []).map((ch: any) => ({
            title: ch.title || '',
            summary: ch.summary || '',
            keyEvents: Array.isArray(ch.keyEvents) ? ch.keyEvents : [],
            involvedCharacters: Array.isArray(ch.involvedCharacters) ? ch.involvedCharacters : [],
          }));

          return {
            id: `outline-${i}-${Date.now()}`,
            title: o.title || '',
            synopsis: o.synopsis || '',
            genres: Array.isArray(o.genres) ? o.genres : [],
            worldSetting,
            subplots,
            chapters,
            structure: o.structure || { act1: '', act2a: '', act2b: '', act3: '' },
            characters,
            foreshadows,
            estimatedWordCount: o.estimatedWordCount || 0,
          };
        },
      );
      clearDraft();
    } else {
      streamingError.value = "AI 返回格式异常，请重试或更换模型";
    }
  } catch (error) {
    console.error("[QuickStart] Outline generation error:", error);
    streamingError.value = String(error);
  } finally {
    isGenerating.value = false;
  }
}

function selectOutline(outline: GeneratedOutline) {
  selectedOutline.value = outline;
}

async function createProject() {
  if (!selectedOutline.value) return;

  isGenerating.value = true;

  try {
    const outline = selectedOutline.value;
    const structure = outline.structure;

    // 构建剧情大纲（包含四幕 + 子情节 + 章节级大纲）
    const plotOutline: PlotNode[] = [];
    let plotIndex = 0;
    
    // 添加四幕
    plotOutline.push(
      { id: `plot-${Date.now()}-${plotIndex++}`, title: '第一幕', description: structure.act1, type: 'act', orderIndex: 0 },
      { id: `plot-${Date.now()}-${plotIndex++}`, title: '第二幕上', description: structure.act2a, type: 'act', orderIndex: 1 },
      { id: `plot-${Date.now()}-${plotIndex++}`, title: '第二幕下', description: structure.act2b, type: 'act', orderIndex: 2 },
      { id: `plot-${Date.now()}-${plotIndex++}`, title: '第三幕', description: structure.act3, type: 'act', orderIndex: 3 },
    );

    // 添加子情节
    if (outline.subplots && outline.subplots.length > 0) {
      outline.subplots.forEach((subplot, idx) => {
        plotOutline.push({
          id: `plot-${Date.now()}-${plotIndex++}`,
          title: subplot.title,
          description: subplot.description,
          type: 'subplot' as const,
          chapterRange: subplot.chapterRange,
          purpose: subplot.purpose,
          orderIndex: plotIndex,
        });
      });
    }

    // 添加章节级大纲（作为子节点或直接节点）
    if (outline.chapters && outline.chapters.length > 0) {
      outline.chapters.forEach((chapter, idx) => {
        plotOutline.push({
          id: `plot-${Date.now()}-${plotIndex++}`,
          title: chapter.title,
          description: chapter.summary,
          type: 'chapter' as const,
          keyEvents: chapter.keyEvents,
          orderIndex: plotIndex,
        });
      });
    }

    // 构建角色信息（支持结构化关系）
    const characters = (Array.isArray(outline.characters) ? outline.characters : []).map((c, i) => ({
      id: `char-${Date.now()}-${i}`,
      name: c.name,
      role: c.role,
      description: c.description,
      profile: {
        personality: c.personality || [],
        appearance: c.appearance || '',
        background: c.background || c.description,
        abilities: c.abilities || [],
        // 处理结构化关系
        relationships: Array.isArray(c.relationships)
          ? c.relationships.map((r: any) => ({
              characterId: '', // 后续需要根据角色名匹配填充
              targetName: r.targetName || '',
              type: (r.type || 'neutral') as any,
              description: r.description || '',
            }))
          : [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    // 构建伏笔信息
    const foreshadows = (Array.isArray(outline.foreshadows) ? outline.foreshadows : []).map((f, i) => ({
      id: `foreshadow-${Date.now()}-${i}`,
      hint: f.hint,
      type: f.type || 'mystery',
      status: 'buried' as const,
      createdChapter: 1,
      suggestedResolutionChapter: f.suggestedChapter,
    }));

    // 使用 AI 生成的世界观设定（支持层级关系）
    let worldSchema = { locations: [] as any[], rules: [] as any[], factions: [] as any[] };
    if (outline.worldSetting) {
      // 先建立地点名称到ID的映射，用于处理层级关系
      const locationNameToId = new Map<string, string>();
      const factionNameToId = new Map<string, string>();
      const ruleNameToId = new Map<string, string>();

      // 转换地点
      const locations = (Array.isArray(outline.worldSetting.locations) ? outline.worldSetting.locations : []).map((l, i) => {
        const id = `loc-${Date.now()}-${i}`;
        locationNameToId.set(l.name, id);
        return {
          id,
          name: l.name,
          description: l.description || '',
          level: l.level || 'city',
          parentId: '', // 后续填充
        };
      });

      // 填充层级关系
      locations.forEach(loc => {
        const sourceLoc = outline.worldSetting!.locations.find(l => l.name === loc.name);
        if (sourceLoc?.parentName) {
          loc.parentId = locationNameToId.get(sourceLoc.parentName) || '';
        }
      });

      // 转换规则
      const rules: Array<{
        id: string;
        name: string;
        description: string;
        locked: boolean;
        category: string;
        relatedRuleIds: string[];
      }> = (Array.isArray(outline.worldSetting.rules) ? outline.worldSetting.rules : []).map((r, i) => {
        const id = `rule-${Date.now()}-${i}`;
        ruleNameToId.set(r.name, id);
        return {
          id,
          name: r.name,
          description: r.description || '',
          locked: false,
          category: r.category || 'custom',
          relatedRuleIds: [],
        };
      });

      // 填充规则关联
      rules.forEach(rule => {
        const sourceRule = outline.worldSetting!.rules.find(r => r.name === rule.name);
        if (sourceRule?.relatedRuleNames) {
          const mappedIds: string[] = [];
          sourceRule.relatedRuleNames.forEach(name => {
            const id = ruleNameToId.get(name);
            if (id) mappedIds.push(id);
          });
          rule.relatedRuleIds = mappedIds;
        }
      });

      // 转换势力
      const factions = (Array.isArray(outline.worldSetting.factions) ? outline.worldSetting.factions : []).map((f, i) => {
        const id = `faction-${Date.now()}-${i}`;
        factionNameToId.set(f.name, id);
        return {
          id,
          name: f.name,
          description: f.description || '',
          parentId: '', // 后续填充
          relation: undefined as { targetFactionId: string; targetFactionName: string; type: string; description: string } | undefined,
        };
      });

      // 填充势力层级和关系
      factions.forEach(faction => {
        const sourceFaction = outline.worldSetting!.factions.find(f => f.name === faction.name);
        if (sourceFaction?.parentName) {
          faction.parentId = factionNameToId.get(sourceFaction.parentName) || '';
        }
        // 添加友好/敌对关系
        const relations: { targetFactionId: string; targetFactionName: string; type: string; description: string }[] = [];
        if (sourceFaction?.allies?.length) {
          sourceFaction.allies.forEach(allyName => {
            relations.push({
              targetFactionId: factionNameToId.get(allyName) || '',
              targetFactionName: allyName,
              type: 'ally',
              description: '',
            });
          });
        }
        if (sourceFaction?.enemies?.length) {
          sourceFaction.enemies.forEach(enemyName => {
            relations.push({
              targetFactionId: factionNameToId.get(enemyName) || '',
              targetFactionName: enemyName,
              type: 'enemy',
              description: '',
            });
          });
        }
        if (relations.length > 0) {
          faction.relation = relations[0]; // 简化为单个关系
        }
      });

      worldSchema = { locations, rules, factions };
    }

    // 转换题材标签
    const genreTags = (outline.genres || []).map((genreName: string) => ({
      id: `genre-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: genreName,
      color: '#8b5cf6', // 默认紫色
    }));

    const newProject = await projectStore.createProject({
      name: outline.title,
      description: outline.synopsis,
      genre: genreTags,
      plotOutline,
      characters,
      foreshadows,
      worldSchema,
      targetWordCount: outline.estimatedWordCount,
    });

    if (newProject) {
      router.push(`/project/${newProject.id}`);
    }
  } catch (error) {
    console.error("Failed to create project:", error);
  } finally {
    isGenerating.value = false;
  }
}

/**
 * 从故事简介中提取世界观设定（基础实现）
 * 后续可以增强为更智能的AI提取
 */
function extractWorldSchemaFromSynopsis(synopsis: string): { locations: any[]; rules: any[]; factions: any[] } {
  const worldSchema = { locations: [] as any[], rules: [] as any[], factions: [] as any[] };

  // 简单关键词匹配来识别世界观元素
  // 这些关键词可以根据实际需求扩展

  const locationKeywords = ['城', '镇', '村', '国', '山', '河', '海', '森林', '沙漠', '大陆', '世界'];
  const ruleKeywords = ['法则', '规则', '力量', '体系', '设定'];
  const factionKeywords = ['门派', '家族', '组织', '势力', '帮派', '宗门'];

  // 按句子分割简介
  const sentences = synopsis.split(/[。；！？]/).filter(s => s.trim());

  for (const sentence of sentences) {
    // 尝试提取地点
    for (const keyword of locationKeywords) {
      if (sentence.includes(keyword) && sentence.length < 100) {
        const locationName = extractMainEntity(sentence, keyword);
        if (locationName && !worldSchema.locations.find(l => l.name === locationName)) {
          worldSchema.locations.push({
            id: `loc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: locationName,
            description: sentence.trim(),
          });
        }
        break;
      }
    }

    // 尝试提取规则/法则
    for (const keyword of ruleKeywords) {
      if (sentence.includes(keyword) && sentence.length < 150) {
        const ruleName = extractMainEntity(sentence, keyword);
        if (ruleName && !worldSchema.rules.find(r => r.name === ruleName)) {
          worldSchema.rules.push({
            id: `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: ruleName,
            description: sentence.trim(),
            locked: false,
          });
        }
        break;
      }
    }

    // 尝试提取势力
    for (const keyword of factionKeywords) {
      if (sentence.includes(keyword) && sentence.length < 100) {
        const factionName = extractMainEntity(sentence, keyword);
        if (factionName && !worldSchema.factions.find(f => f.name === factionName)) {
          worldSchema.factions.push({
            id: `faction-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: factionName,
            description: sentence.trim(),
          });
        }
        break;
      }
    }
  }

  return worldSchema;
}

/**
 * 从句子中提取主体实体
 */
function extractMainEntity(sentence: string, keyword: string): string {
  // 找到关键词的位置
  const index = sentence.indexOf(keyword);
  if (index === -1) return '';

  // 尝试往前取实体名称（最多8个字符）
  let start = Math.max(0, index - 8);
  let entity = sentence.slice(start, index).trim();

  // 如果实体太短或包含逗号等，尝试往后取一点
  if (entity.length < 2) {
    entity = sentence.slice(index, Math.min(sentence.length, index + 10)).trim();
  }

  // 清理实体名称
  entity = entity.replace(/[，、：:]/g, '').trim();

  return entity;
}

function formatWordCount(count: number) {
  if (count >= 10000) {
    return `${(count / 10000).toFixed(0)}${t("quickStart.tenThousands", { count })}`;
  }
  return `${count}`;
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
        <button
          v-if="savedDraft"
          class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          @click="showDraftMenu = !showDraftMenu"
        >
          <BookOpen class="w-4 h-4 text-amber-500" />
        </button>
        <div
          v-if="showDraftMenu"
          class="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10"
        >
          <button
            class="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
            @click="loadDraft"
          >
            <BookOpen class="w-4 h-4" />
            加载草稿
          </button>
          <button
            class="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
            @click="clearDraft"
          >
            <RotateCcw class="w-4 h-4" />
            清除草稿
          </button>
        </div>
      </div>
    </div>

    <!-- Tab Switcher -->
    <div class="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
      <button
        class="flex-1 py-1.5 text-sm font-medium rounded-md transition-all"
        :class="
          activeTab === 'templates'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-500 dark:text-gray-400'
        "
        @click="activeTab = 'templates'"
      >
        {{ t("quickStart.templateMarket") }}
      </button>
      <button
        class="flex-1 py-1.5 text-sm font-medium rounded-md transition-all"
        :class="
          activeTab === 'custom'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-500 dark:text-gray-400'
        "
        @click="activeTab = 'custom'"
      >
        {{ t("quickStart.customInput") }}
      </button>
    </div>

    <!-- Templates Tab -->
    <div v-if="activeTab === 'templates'" class="space-y-3">
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="template in writingTemplates"
          :key="template.id"
          class="p-3 rounded-xl border-2 text-left transition-all duration-200"
          :class="[
            selectedTemplate?.id === template.id
              ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20'
              : 'border-gray-100 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 bg-white dark:bg-gray-800',
          ]"
          @click="selectTemplate(template)"
        >
          <div class="flex items-center gap-2 mb-1.5">
            <span class="text-lg">{{ template.icon }}</span>
            <span class="font-medium text-sm text-gray-900 dark:text-white">{{
              template.name
            }}</span>
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
            {{ template.description }}
          </p>
        </button>
      </div>

      <!-- Template Detail -->
      <div
        v-if="selectedTemplate"
        class="p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
      >
        <div class="flex items-center gap-2 mb-2">
          <Edit3 class="w-4 h-4 text-indigo-500" />
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{
            t("quickStart.templatePrompt")
          }}</span>
        </div>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ selectedTemplate.prompt }}
        </p>
      </div>
    </div>

    <!-- Custom Input Tab -->
    <div v-else class="space-y-3">
      <!-- Structured Input Toggle -->
      <button
        class="w-full flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-left transition-all hover:border-indigo-300 dark:hover:border-indigo-700"
        @click="useStructuredInput"
      >
        <div class="flex items-center gap-2">
          <Edit3 class="w-4 h-4 text-indigo-500" />
          <span class="text-sm text-gray-700 dark:text-gray-300">{{
            t("quickStart.useStructuredInput")
          }}</span>
        </div>
        <ChevronDown
          class="w-4 h-4 text-gray-400 transition-transform duration-200"
          :class="{ 'rotate-180': showStructuredInput }"
        />
      </button>

      <!-- Structured Input Fields -->
      <div
        v-if="showStructuredInput"
        class="space-y-2 p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800"
      >
        <div>
          <label class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{{
            t("quickStart.storyType")
          }}</label>
          <input
            v-model="storyType"
            class="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            :placeholder="t('quickStart.storyTypePlaceholder')"
            @input="updatePromptFromStructured"
          />
        </div>
        <div>
          <label class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{{
            t("quickStart.mainCharacter")
          }}</label>
          <input
            v-model="mainCharacter"
            class="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            :placeholder="t('quickStart.mainCharacterPlaceholder')"
            @input="updatePromptFromStructured"
          />
        </div>
        <div>
          <label class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{{
            t("quickStart.storyGoal")
          }}</label>
          <input
            v-model="storyGoal"
            class="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            :placeholder="t('quickStart.storyGoalPlaceholder')"
            @input="updatePromptFromStructured"
          />
        </div>
        <div>
          <label class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{{
            t("quickStart.conflict")
          }}</label>
          <input
            v-model="conflict"
            class="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            :placeholder="t('quickStart.conflictPlaceholder')"
            @input="updatePromptFromStructured"
          />
        </div>
        <div>
          <label class="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{{
            t("quickStart.customSettings")
          }}</label>
          <textarea
            v-model="customSettings"
            class="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
            rows="2"
            :placeholder="t('quickStart.customSettingsPlaceholder')"
            @input="updatePromptFromStructured"
          ></textarea>
        </div>
      </div>

      <!-- Free-form Prompt -->
      <div>
        <textarea
          v-model="prompt"
          class="w-full h-28 p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border transition-all text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
          :class="[
            isPromptTooLong
              ? 'border-red-400 dark:border-red-500'
              : prompt.trim().length >= MIN_PROMPT_LENGTH
                ? 'border-green-400 dark:border-green-500'
                : 'border-gray-200 dark:border-gray-700',
          ]"
          :placeholder="t('quickStart.placeholder')"
        ></textarea>
        <div class="flex items-center justify-between mt-1.5">
          <!-- Input Status Message -->
          <div v-if="activeTab === 'custom'" class="flex items-center gap-1.5">
            <span
              v-if="inputStatus?.type === 'insufficient'"
              class="flex items-center gap-1 text-xs text-amber-500"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              {{ inputStatus.message }}
            </span>
            <span
              v-else-if="inputStatus?.type === 'progress'"
              class="flex items-center gap-1 text-xs text-indigo-500"
            >
              <span
                class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"
              ></span>
              {{ inputStatus.message }}
            </span>
            <span
              v-else-if="inputStatus?.type === 'good'"
              class="flex items-center gap-1 text-xs text-green-500"
            >
              <Check class="w-3 h-3" />
              {{ inputStatus.message }}
            </span>
            <span
              v-else-if="inputStatus?.type === 'excellent'"
              class="flex items-center gap-1 text-xs text-emerald-500"
            >
              <Check class="w-3 h-3" />
              {{ inputStatus.message }}
            </span>
          </div>
          <div v-else></div>

          <!-- Character Count -->
          <div class="flex items-center gap-2">
            <span
              class="text-xs transition-colors"
              :class="isPromptTooLong ? 'text-red-500' : 'text-gray-400'"
            >
              {{ prompt.length }} / {{ MAX_PROMPT_LENGTH }}
            </span>
            <button
              v-if="prompt.trim()"
              class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              @click="saveDraft"
            >
              <Save class="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Word Count Range Selector -->
    <div class="flex items-center justify-between px-1">
      <div class="relative">
        <button
          class="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-xs text-gray-600 dark:text-gray-400"
          @click="showWordCountDropdown = !showWordCountDropdown"
        >
          <span>📏</span>
          <span>{{ selectedWordCountRange }}</span>
          <ChevronDown
            class="w-3 h-3 transition-transform"
            :class="{ 'rotate-180': showWordCountDropdown }"
          />
        </button>
        <div
          v-if="showWordCountDropdown"
          class="absolute left-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-20"
        >
          <button
            v-for="option in WORD_COUNT_OPTIONS"
            :key="option.value"
            class="w-full px-3 py-2 text-left text-sm transition-colors flex items-center justify-between"
            :class="[
              selectedWordCountRange === option.value
                ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            ]"
            @click="selectedWordCountRange = option.value; showWordCountDropdown = false"
          >
            <span>{{ option.label }}</span>
            <Check v-if="selectedWordCountRange === option.value" class="w-4 h-4 text-indigo-500" />
          </button>
        </div>
      </div>
      <span class="text-xs text-gray-400 dark:text-gray-500">字数范围</span>
    </div>

    <!-- Generate Button -->
    <div class="relative">
      <button
        class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-medium shadow-lg transition-all"
        :class="[
          canGenerate && !isGenerating
            ? 'bg-gradient-to-r from-indigo-500 to-purple-600 shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30'
            : 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed',
        ]"
        :disabled="!canGenerate || isGenerating"
        @click="generateOutlines"
      >
        <Sparkles v-if="!isGenerating" class="w-4 h-4" />
        <span
          v-if="isGenerating"
          class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
        ></span>
        {{
          isGenerating ? t("quickStart.generating") : t("quickStart.generate")
        }}
      </button>

      <!-- Tooltip for disabled state -->
      <div
        v-if="
          !canGenerate &&
          !isGenerating &&
          activeTab === 'custom' &&
          prompt.trim().length > 0
        "
        class="absolute left-1/2 -translate-x-1/2 -top-8 px-2 py-1 bg-gray-800 dark:bg-gray-700 text-white text-xs rounded whitespace-nowrap pointer-events-none z-10"
      >
        <span class="flex items-center gap-1">
          <span class="text-red-400">✕</span>
          请至少输入 {{ MIN_PROMPT_LENGTH }} 个字符
        </span>
        <div
          class="absolute left-1/2 -translate-x-1/2 top-full -mt-px w-2 h-2 bg-gray-800 dark:bg-gray-700 rotate-45"
        ></div>
      </div>
    </div>

    <!-- Streaming Content Preview -->
    <div
      v-if="isGenerating && !generatedOutlines.length"
      class="p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
    >
      <div class="flex items-center gap-2 mb-2">
        <div
          class="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"
        ></div>
        <span class="text-xs text-gray-500 dark:text-gray-400">{{
          t("quickStart.generating")
        }}</span>
      </div>
      <div class="text-xs text-gray-400 dark:text-gray-500 whitespace-pre-wrap">
        {{ generationProgress || 'AI 正在构思故事，请稍候...' }}
      </div>
    </div>

    <!-- Error Message -->
    <div
      v-if="streamingError"
      class="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
    >
      <div class="text-sm text-red-600 dark:text-red-400">
        {{ streamingError }}
      </div>
    </div>

    <!-- Generated Outlines -->
    <div v-if="generatedOutlines.length > 0" class="space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div
            class="w-1 h-4 rounded-full bg-gradient-to-b from-purple-500 to-indigo-500"
          ></div>
          <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">
            {{ t("quickStart.preparedOutlines") }}
          </h4>
          <span class="text-xs text-gray-400 dark:text-gray-500"
            >({{ generatedOutlines.length }}{{ t("quickStart.plans") }})</span
          >
        </div>
        <NTooltip trigger="hover">
          <template #trigger>
            <button
              class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="isGenerating"
              @click="generateOutlines"
            >
              <RefreshCw
                class="w-4 h-4 text-gray-500 dark:text-gray-400"
                :class="{ 'animate-spin': isGenerating }"
              />
            </button>
          </template>
          换一批大纲
        </NTooltip>
      </div>

      <div class="space-y-2">
        <div
          v-for="outline in generatedOutlines"
          :key="outline.id"
          class="p-3 rounded-xl border-2 cursor-pointer transition-all duration-200"
          :class="[
            selectedOutline?.id === outline.id
              ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20'
              : 'border-gray-100 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-700 bg-white dark:bg-gray-800',
          ]"
          @click="selectOutline(outline)"
        >
          <div class="flex items-start gap-2">
            <div
              v-if="selectedOutline?.id === outline.id"
              class="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0"
            >
              <Check class="w-3 h-3 text-white" />
            </div>
            <div class="flex-1 min-w-0">
              <h5
                class="font-medium text-sm text-gray-900 dark:text-white truncate"
              >
                {{ outline.title }}
              </h5>
              <NTooltip trigger="hover">
                <template #trigger>
                  <p
                    class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1 cursor-help"
                  >
                    {{ outline.synopsis }}
                  </p>
                </template>
                <div
                  class="max-w-sm max-h-48 overflow-y-auto text-sm text-gray-300 dark:text-gray-700 whitespace-pre-wrap"
                >
                  {{ outline.synopsis }}
                </div>
              </NTooltip>
              <div
                class="flex items-center gap-3 mt-2 text-xs text-gray-400 dark:text-gray-500"
              >
                <span>{{ formatWordCount(outline.estimatedWordCount) }}</span>
                <span
                  >{{ outline.characters.length
                  }}{{ t("quickStart.characters") }}</span
                >
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Create Button -->
      <button
        v-if="selectedOutline"
        class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white text-sm font-semibold shadow-lg hover:shadow-xl transition-all"
        @click="createProject"
      >
        <span>{{ t("quickStart.createFromOutline") }}</span>
        <ArrowRight class="w-4 h-4" />
      </button>
    </div>

    <!-- Empty State -->
    <div
      v-if="generatedOutlines.length === 0 && !isGenerating && !streamingError"
      class="text-center py-4"
    >
      <Sparkles class="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
      <p class="text-xs text-gray-400 dark:text-gray-500">
        {{ t("quickStart.emptyDesc") }}
      </p>
    </div>
  </div>
</template>

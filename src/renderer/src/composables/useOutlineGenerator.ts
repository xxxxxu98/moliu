import { ref } from "vue";
import { FunctionCallingClient } from "@/services/ai/function-calling-client";
import { useSettingsStore } from "@/stores/settings.store";
import type { GeneratedOutline } from "@/types/inspiration";

export interface UseOutlineGeneratorOptions {
  /** 字数范围，可选 */
  wordCountRange?: string;
}

export interface UseOutlineGeneratorReturn {
  /** 是否正在生成 */
  isGenerating: ReturnType<typeof ref<boolean>>;
  /** 错误信息 */
  error: ReturnType<typeof ref<string | null>>;
  /** 生成进度 */
  progress: ReturnType<typeof ref<string>>;
  /** 生成的大纲列表 */
  outlines: ReturnType<typeof ref<GeneratedOutline[]>>;
  /** 生成大纲方法 */
  generateOutlines: (prompt: string, options?: UseOutlineGeneratorOptions) => Promise<GeneratedOutline[]>;
  /** 重置状态 */
  reset: () => void;
}

/**
 * 大纲生成 Composable
 * 封装大纲生成的通用逻辑，供 InspirationPanel 和 QuickStart 共用
 */
export function useOutlineGenerator(): UseOutlineGeneratorReturn {
  const settingsStore = useSettingsStore();

  const isGenerating = ref(false);
  const error = ref<string | null>(null);
  const progress = ref<string>("");
  const outlines = ref<GeneratedOutline[]>([]);

  /**
   * 获取可用的 AI Provider
   */
  function getEnabledProvider() {
    // 优先使用用户在设置页面选择的默认模型
    let enabledProvider = null;
    const defaultModelId = settingsStore.defaultModel;

    if (defaultModelId) {
      const [providerId, modelName] = defaultModelId.split(":");
      enabledProvider = settingsStore.aiProviders.find(
        (p) =>
          p.id === providerId &&
          p.modelName === modelName &&
          p.enabled &&
          p.apiKey,
      );
    }

    // Fallback: 如果默认模型无效或未设置，找第一个启用的厂商
    if (!enabledProvider) {
      enabledProvider = settingsStore.aiProviders.find(
        (p) => p.enabled && p.apiKey,
      );
    }

    return enabledProvider;
  }

  /**
   * 验证 AI Provider 配置
   */
  function validateProvider(): string | null {
    const provider = getEnabledProvider();
    if (!provider) {
      return "请先在设置中配置 AI 提供商";
    }
    return null;
  }

  /**
   * 生成大纲
   * @param prompt 生成大纲的提示词
   * @param options 可选配置
   * @returns 生成的大纲列表
   */
  async function generateOutlines(
    prompt: string,
    options?: UseOutlineGeneratorOptions,
  ): Promise<GeneratedOutline[]> {
    const validationError = validateProvider();
    if (validationError) {
      error.value = validationError;
      return [];
    }

    const provider = getEnabledProvider()!;

    isGenerating.value = true;
    error.value = null;
    progress.value = "";
    outlines.value = [];

    try {
      const fcClient = new FunctionCallingClient({
        provider: provider.provider,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        model: provider.modelName,
        temperature: provider.generationConfig?.temperature,
      });

      // 使用指定的字数范围或默认 medium
      const wordCountRange = options?.wordCountRange || "medium";

      const result = await fcClient.generateOutline(
        prompt,
        wordCountRange,
        (msg) => {
          progress.value = msg;
        },
      );

      if (result && result.outlines && result.outlines.length > 0) {
        outlines.value = normalizeOutlines(result.outlines);
        return outlines.value;
      } else {
        error.value = "AI 返回格式异常，请重试或更换模型";
        return [];
      }
    } catch (err) {
      console.error("[useOutlineGenerator] Outline generation error:", err);
      error.value = String(err);
      return [];
    } finally {
      isGenerating.value = false;
    }
  }

  /**
   * 标准化大纲数据
   * 统一处理 AI 返回的数据格式，确保包含所有必要字段
   */
  function normalizeOutlines(aiOutlines: any[]): GeneratedOutline[] {
    return aiOutlines.map((o: any, i: number) => {
      // 处理角色信息（支持结构化关系）
      const characters = (Array.isArray(o.characters) ? o.characters : []).map(
        (c: any) => {
          // 处理旧格式的 relationships（字符串）
          if (typeof c.relationships === "string") {
            return {
              name: c.name || "",
              role: c.role || "",
              description: c.description || "",
              personality: Array.isArray(c.personality) ? c.personality : [],
              appearance: c.appearance || "",
              abilities: Array.isArray(c.abilities) ? c.abilities : [],
              background: c.background || "",
              relationships: c.relationships
                ? [
                    {
                      targetName: "",
                      type: "neutral",
                      description: c.relationships,
                    },
                  ]
                : [],
            };
          }
          // 新格式的结构化关系
          return {
            name: c.name || "",
            role: c.role || "",
            description: c.description || "",
            personality: Array.isArray(c.personality) ? c.personality : [],
            appearance: c.appearance || "",
            abilities: Array.isArray(c.abilities) ? c.abilities : [],
            background: c.background || "",
            relationships: Array.isArray(c.relationships)
              ? c.relationships.map((r: any) => ({
                  targetName: r.targetName || "",
                  type: r.type || "neutral",
                  description: r.description || "",
                }))
              : [],
          };
        },
      );

      // 处理伏笔信息
      const foreshadows = (
        Array.isArray(o.foreshadows) ? o.foreshadows : []
      ).map((f: any) => {
        if (typeof f === "string") {
          return {
            hint: f,
            type: "mystery",
            suggestedChapter: undefined,
          };
        }
        return {
          hint: f.hint || "",
          type: f.type || "mystery",
          suggestedChapter: f.suggestedChapter,
        };
      });

      // 处理世界观设定（支持层级关系）
      const worldSetting = o.worldSetting
        ? {
            locations: (
              Array.isArray(o.worldSetting.locations)
                ? o.worldSetting.locations
                : []
            ).map((l: any) => ({
              name: l.name || "",
              description: l.description || "",
              level: l.level || "city",
              parentName: l.parentName || "",
            })),
            factions: (
              Array.isArray(o.worldSetting.factions)
                ? o.worldSetting.factions
                : []
            ).map((f: any) => ({
              name: f.name || "",
              description: f.description || "",
              parentName: f.parentName || "",
              allies: Array.isArray(f.allies) ? f.allies : [],
              enemies: Array.isArray(f.enemies) ? f.enemies : [],
            })),
            rules: (
              Array.isArray(o.worldSetting.rules) ? o.worldSetting.rules : []
            ).map((r: any) => ({
              name: r.name || "",
              description: r.description || "",
              category: r.category || "custom",
              relatedRuleNames: Array.isArray(r.relatedRuleNames)
                ? r.relatedRuleNames
                : [],
            })),
          }
        : undefined;

      // 处理子情节
      const subplots = (
        Array.isArray(o.subplots) ? o.subplots : []
      ).map((s: any) => ({
        title: s.title || "",
        description: s.description || "",
        relatedCharacters: Array.isArray(s.relatedCharacters)
          ? s.relatedCharacters
          : [],
        chapterRange: s.chapterRange || undefined,
        purpose: s.purpose || "",
      }));

      // 处理章节级大纲
      const chapters = (
        Array.isArray(o.chapters) ? o.chapters : []
      ).map((ch: any) => ({
        title: ch.title || "",
        summary: ch.summary || "",
        keyEvents: Array.isArray(ch.keyEvents) ? ch.keyEvents : [],
        involvedCharacters: Array.isArray(ch.involvedCharacters)
          ? ch.involvedCharacters
          : [],
      }));

      return {
        id: `outline-${i}-${Date.now()}`,
        title: o.title || "",
        synopsis: o.synopsis || "",
        genres: Array.isArray(o.genres) ? o.genres : [],
        worldSetting,
        subplots,
        chapters,
        structure: o.structure || { act1: "", act2a: "", act2b: "", act3: "" },
        characters,
        foreshadows,
        estimatedWordCount: o.estimatedWordCount || 0,
      };
    });
  }

  /**
   * 重置状态
   */
  function reset() {
    isGenerating.value = false;
    error.value = null;
    progress.value = "";
    outlines.value = [];
  }

  return {
    isGenerating,
    error,
    progress,
    outlines,
    generateOutlines,
    reset,
  };
}

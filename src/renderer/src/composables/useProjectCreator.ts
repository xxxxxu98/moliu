import { ref } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "@/stores/project.store";
import type { GeneratedOutline } from "@/types/inspiration";
import type { PlotNode } from "@/types/project";

export interface UseProjectCreatorReturn {
  /** 是否正在创建 */
  isCreating: ReturnType<typeof ref<boolean>>;
  /** 错误信息 */
  error: ReturnType<typeof ref<string | null>>;
  /** 创建项目方法 */
  createProject: (outline: GeneratedOutline) => Promise<string | null>;
  /** 重置状态 */
  reset: () => void;
}

/**
 * 项目创建 Composable
 * 封装项目创建的通用逻辑，供 InspirationPanel 和 QuickStart 共用
 */
export function useProjectCreator(): UseProjectCreatorReturn {
  const router = useRouter();
  const projectStore = useProjectStore();

  const isCreating = ref(false);
  const error = ref<string | null>(null);

  /**
   * 从大纲构建剧情大纲
   * 包含四幕结构 + 子情节 + 章节级大纲
   */
  function buildPlotOutline(outline: GeneratedOutline): PlotNode[] {
    const plotOutline: PlotNode[] = [];
    let plotIndex = 0;
    const structure = outline.structure;

    // 添加四幕结构
    plotOutline.push(
      {
        id: `plot-${Date.now()}-${plotIndex++}`,
        title: "第一幕",
        description: structure?.act1 || "",
        type: "act",
        orderIndex: 0,
      },
      {
        id: `plot-${Date.now()}-${plotIndex++}`,
        title: "第二幕上",
        description: structure?.act2a || "",
        type: "act",
        orderIndex: 1,
      },
      {
        id: `plot-${Date.now()}-${plotIndex++}`,
        title: "第二幕下",
        description: structure?.act2b || "",
        type: "act",
        orderIndex: 2,
      },
      {
        id: `plot-${Date.now()}-${plotIndex++}`,
        title: "第三幕",
        description: structure?.act3 || "",
        type: "act",
        orderIndex: 3,
      },
    );

    // 添加子情节
    if (outline.subplots && outline.subplots.length > 0) {
      outline.subplots.forEach((subplot) => {
        plotOutline.push({
          id: `plot-${Date.now()}-${plotIndex++}`,
          title: subplot.title,
          description: subplot.description,
          type: "subplot" as const,
          chapterRange: subplot.chapterRange,
          purpose: subplot.purpose,
          relatedCharacters: Array.isArray(subplot.relatedCharacters) ? subplot.relatedCharacters : undefined,
          orderIndex: plotOutline.length,
        });
      });
    }

    // 添加章节级大纲
    if (outline.chapters && outline.chapters.length > 0) {
      outline.chapters.forEach((chapter) => {
        plotOutline.push({
          id: `plot-${Date.now()}-${plotIndex++}`,
          title: chapter.title,
          description: chapter.summary,
          type: "chapter" as const,
          keyEvents: chapter.keyEvents,
          relatedCharacters: Array.isArray(chapter.involvedCharacters) ? chapter.involvedCharacters : undefined,
          orderIndex: plotOutline.length,
        });
      });
    }

    return plotOutline;
  }

  /**
   * 从大纲构建角色信息
   * 支持结构化关系
   */
  function buildCharacters(outline: GeneratedOutline) {
    return (Array.isArray(outline.characters) ? outline.characters : []).map(
      (c, i) => ({
        id: `char-${Date.now()}-${i}`,
        name: c.name,
        role: c.role,
        description: c.description,
        profile: {
          personality: Array.isArray(c.personality) ? c.personality : [],
          appearance: c.appearance || "",
          background: c.background || c.description || "",
          abilities: Array.isArray(c.abilities) ? c.abilities : [],
          relationships: Array.isArray(c.relationships)
            ? c.relationships.map((r: any) => ({
                characterId: "",
                targetName: r.targetName || "",
                type: (r.type || "neutral") as any,
                description: r.description || "",
              }))
            : [],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    );
  }

  /**
   * 从大纲构建伏笔信息
   */
  function buildForeshadows(outline: GeneratedOutline) {
    return (Array.isArray(outline.foreshadows) ? outline.foreshadows : []).map(
      (f, i) => ({
        id: `foreshadow-${Date.now()}-${i}`,
        hint: f.hint,
        type: (f.type || "mystery") as "item" | "dialogue" | "event" | "mystery",
        status: "buried" as const,
        createdChapter: 1,
        suggestedResolutionChapter: f.suggestedChapter,
      }),
    );
  }

  /**
   * 从大纲构建世界观设定
   * 支持层级关系
   */
  function buildWorldSchema(outline: GeneratedOutline) {
    const worldSchema = {
      locations: [] as any[],
      rules: [] as any[],
      factions: [] as any[],
    };

    if (!outline.worldSetting) {
      return worldSchema;
    }

    // 先建立名称到ID的映射，用于处理层级关系
    const locationNameToId = new Map<string, string>();
    const factionNameToId = new Map<string, string>();
    const ruleNameToId = new Map<string, string>();

    // 转换地点
    const locations = (
      Array.isArray(outline.worldSetting.locations)
        ? outline.worldSetting.locations
        : []
    ).map((l, i) => {
      const id = `loc-${Date.now()}-${i}`;
      locationNameToId.set(l.name, id);
      return {
        id,
        name: l.name,
        description: l.description || "",
        level: l.level || "city",
        parentId: "",
      };
    });

    // 填充地点层级关系
    locations.forEach((loc) => {
      const sourceLoc = outline.worldSetting!.locations.find(
        (l) => l.name === loc.name,
      );
      if (sourceLoc?.parentName) {
        loc.parentId = locationNameToId.get(sourceLoc.parentName) || "";
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
    }> = (
      Array.isArray(outline.worldSetting.rules)
        ? outline.worldSetting.rules
        : []
    ).map((r, i) => {
      const id = `rule-${Date.now()}-${i}`;
      ruleNameToId.set(r.name, id);
      return {
        id,
        name: r.name,
        description: r.description || "",
        locked: false,
        category: r.category || "custom",
        relatedRuleIds: [],
      };
    });

    // 填充规则关联
    rules.forEach((rule) => {
      const sourceRule = outline.worldSetting!.rules.find(
        (r) => r.name === rule.name,
      );
      if (sourceRule?.relatedRuleNames) {
        const mappedIds: string[] = [];
        sourceRule.relatedRuleNames.forEach((name) => {
          const id = ruleNameToId.get(name);
          if (id) mappedIds.push(id);
        });
        rule.relatedRuleIds = mappedIds;
      }
    });

    // 转换势力
    const factions = (
      Array.isArray(outline.worldSetting.factions)
        ? outline.worldSetting.factions
        : []
    ).map((f, i) => {
      const id = `faction-${Date.now()}-${i}`;
      factionNameToId.set(f.name, id);
      return {
        id,
        name: f.name,
        description: f.description || "",
        parentId: "",
        relation: undefined as
          | {
              targetFactionId: string;
              targetFactionName: string;
              type: string;
              description: string;
            }
          | undefined,
      };
    });

    // 填充势力层级和关系
    factions.forEach((faction) => {
      const sourceFaction = outline.worldSetting!.factions.find(
        (f) => f.name === faction.name,
      );
      if (sourceFaction?.parentName) {
        faction.parentId = factionNameToId.get(sourceFaction.parentName) || "";
      }
      const relations: {
        targetFactionId: string;
        targetFactionName: string;
        type: string;
        description: string;
      }[] = [];
      if (sourceFaction?.allies?.length) {
        sourceFaction.allies.forEach((allyName) => {
          relations.push({
            targetFactionId: factionNameToId.get(allyName) || "",
            targetFactionName: allyName,
            type: "ally",
            description: "",
          });
        });
      }
      if (sourceFaction?.enemies?.length) {
        sourceFaction.enemies.forEach((enemyName) => {
          relations.push({
            targetFactionId: factionNameToId.get(enemyName) || "",
            targetFactionName: enemyName,
            type: "enemy",
            description: "",
          });
        });
      }
      if (relations.length > 0) {
        faction.relation = relations[0];
      }
    });

    return {
      locations,
      rules,
      factions,
    };
  }

  /**
   * 从大纲构建题材标签
   */
  function buildGenreTags(outline: GeneratedOutline) {
    return (outline.genres || []).map((genreName: string) => ({
      id: `genre-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: genreName,
      color: "#8b5cf6",
    }));
  }

  /**
   * 创建项目
   * @param outline 选定的大纲
   * @returns 创建成功返回项目ID，否则返回 null
   */
  async function createProject(outline: GeneratedOutline): Promise<string | null> {
    isCreating.value = true;
    error.value = null;

    try {
      // 深拷贝大纲数据，移除 Vue 响应式代理
      const outlineData = JSON.parse(JSON.stringify(outline));

      // 构建项目数据
      const plotOutline = buildPlotOutline(outlineData);
      const characters = buildCharacters(outlineData);
      const foreshadows = buildForeshadows(outlineData);
      const worldSchema = buildWorldSchema(outlineData);
      const genreTags = buildGenreTags(outlineData);

      const newProject = await projectStore.createProject({
        name: outlineData.title,
        description: outlineData.synopsis,
        genre: genreTags,
        plotOutline,
        characters,
        foreshadows,
        worldSchema,
        targetWordCount: outlineData.estimatedWordCount,
      });

      if (newProject) {
        // 导航到项目编辑器
        router.push(`/project/${newProject.id}`);
        // 完善项目数据（填充角色关系等）
        projectStore.finalizeProjectCreation(newProject.id);
        return newProject.id;
      }

      return null;
    } catch (err) {
      console.error("[useProjectCreator] Create project error:", err);
      error.value = String(err);
      return null;
    } finally {
      isCreating.value = false;
    }
  }

  /**
   * 重置状态
   */
  function reset() {
    isCreating.value = false;
    error.value = null;
  }

  return {
    isCreating,
    error,
    createProject,
    reset,
  };
}

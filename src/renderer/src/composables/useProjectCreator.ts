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
   * 从大纲构建项目元数据
   * 包含情绪目标、爽点设计、核心卖点等增强信息
   * 数据格式需要符合 types/project.ts 中的接口定义
   */
  function buildProjectMetadata(outline: GeneratedOutline) {
    return {
      // 情绪目标 - 格式正确
      emotionGoal: outline.emotionGoal ? {
        primary: outline.emotionGoal.primary,
        secondary: outline.emotionGoal.secondary,
        arc: outline.emotionGoal.arc as 'rising' | 'falling' | 'wave' | 'mixed' || 'rising',
        density: outline.emotionGoal.density || 3000,
        highPoints: outline.emotionGoal.highPoints || [],
        lowPoints: outline.emotionGoal.lowPoints || [],
      } : undefined,
      // 爽点设计 - 需要转换 patterns 和 arranged 格式
      coolPointDesign: outline.coolPointDesign ? {
        id: `coolpoint-${Date.now()}`,
        patterns: (outline.coolPointDesign.patterns || []).map(p => normalizeCoolPointPattern(p)),
        arranged: (outline.coolPointDesign.arranged || []).map((cp, i) => ({
          id: `arrangement-${Date.now()}-${i}`,
          chapter: cp.suggestedChapter || 1,
          type: normalizeCoolPointPattern(cp.type || ''),
          description: cp.description || '',
        })),
        density: {
          micro: 3000,
          small: 9000,
          big: 21000,
        },
      } : undefined,
      // 核心卖点 - 需要转换格式
      coreSellingPoints: (outline.coreSellingPoints || []).map((cp, i) => ({
        id: `selling-point-${Date.now()}-${i}`,
        name: typeof cp === 'string' ? cp : (cp as any).name || '',
        description: typeof cp === 'string' ? '' : (cp as any).description || '',
        priority: typeof cp === 'string' ? 1 : (cp as any).priority || 1,
      })),
      // 矛盾设计 - 需要转换 source 和 escalation 格式
      conflictDesign: outline.conflictDesign ? {
        id: `conflict-${Date.now()}`,
        source: normalizeConflictSource(outline.conflictDesign.source),
        escalation: normalizeConflictEscalation(outline.conflictDesign.escalation || []),
        majorConflicts: normalizeMajorConflicts(outline.conflictDesign.majorConflicts || []),
      } : undefined,
      // 八条故事线 - 需要转换为完整格式
      storyLines: outline.storyLines ? normalizeStoryLines(outline.storyLines) : undefined,
    };
  }

  /**
   * 规范化爽点类型
   */
  function normalizeCoolPointPattern(pattern: string): 'face-slapping' | 'show-off' | 'identity-reveal' | 'growth' | 'rescue' | 'treasure' | 'breakthrough' | 'romance' | 'revenge' | 'mystery-reveal' | 'comedy' | 'justice' {
    const patternMap: Record<string, typeof pattern> = {
      '打脸': 'face-slapping',
      '打脸爽': 'face-slapping',
      'face-slapping': 'face-slapping',
      '装逼': 'show-off',
      '装逼爽': 'show-off',
      'show-off': 'show-off',
      '身份揭秘': 'identity-reveal',
      'identity-reveal': 'identity-reveal',
      '成长': 'growth',
      'growth': 'growth',
      'rescue': 'rescue',
      'treasure': 'treasure',
      '突破': 'breakthrough',
      'breakthrough': 'breakthrough',
      '恋爱': 'romance',
      'romance': 'romance',
      '复仇': 'revenge',
      'revenge': 'revenge',
      'mystery-reveal': 'mystery-reveal',
      '搞笑': 'comedy',
      'comedy': 'comedy',
      'justice': 'justice',
    };
    return patternMap[pattern] || 'face-slapping';
  }

  /**
   * 规范化冲突来源
   */
  function normalizeConflictSource(source: string): 'resource' | 'faction' | 'path' | 'faith' | 'factionFight' | 'ideology' {
    const sourceMap: Record<string, typeof source> = {
      '资源': 'resource',
      '资源/利益': 'resource',
      '利益': 'resource',
      'resource': 'resource',
      '阵营': 'faction',
      '阵营/种族': 'faction',
      '种族': 'faction',
      'faction': 'faction',
      'path': 'path',
      '信仰': 'faith',
      'faith': 'faith',
      '派系': 'factionFight',
      '派系之争': 'factionFight',
      'factionFight': 'factionFight',
      '理念': 'ideology',
      '理念/三观': 'ideology',
      'ideology': 'ideology',
    };
    return sourceMap[source] || 'resource';
  }

  /**
   * 规范化矛盾递进
   */
  function normalizeConflictEscalation(escalation: string[]) {
    return escalation.map((e, i) => ({
      level: i + 1,
      name: e,
      description: e,
      examples: [],
    }));
  }

  /**
   * 规范化主要冲突
   */
  function normalizeMajorConflicts(majorConflicts: string[]) {
    return majorConflicts.map((c, i) => ({
      id: `major-conflict-${Date.now()}-${i}`,
      title: c,
      type: 'B' as const,
      status: 'pending' as const,
      chapters: [],
      stakes: c,
      resolution: '',
    }));
  }

  /**
   * 规范化故事线
   * 将大纲简化的字符串格式转换为完整的 StoryLines 格式
   */
  function normalizeStoryLines(storyLines: any) {
    const parseLocations = (str: string) => {
      if (!str) return [];
      return str.split(/[,，、→\->]+/).map(s => s.trim()).filter(Boolean);
    };

    return {
      id: `storylines-${Date.now()}`,
      map: {
        planned: parseLocations(storyLines.map),
        introduced: [],
        current: parseLocations(storyLines.map)[0] || '',
        chaptersPerLocation: 50,
      },
      faction: {
        planned: parseLocations(storyLines.faction),
        introduced: [],
        currentLevel: 1,
        escalationChapters: [],
      },
      character: {
        planned: parseLocations(storyLines.character),
        introduced: [],
        keyRelationships: [],
      },
      goldenfinger: {
        type: storyLines.goldenfinger || '',
        currentStage: 1,
        upgrades: [],
      },
      worldRules: {
        revealed: parseLocations(storyLines.worldRules),
        pending: [],
      },
      conflict: {
        chains: parseLocations(storyLines.conflict),
        activeConflict: parseLocations(storyLines.conflict)[0] || '',
      },
      collection: {
        target: parseLocations(storyLines.collection),
        progress: [],
      },
      romance: {
        currentStage: 'cold' as const,
        progression: [],
      },
    };
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
      const metadata = buildProjectMetadata(outlineData);

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
        // 保存增强数据到项目顶层字段（不是 metadata）
        if (metadata.emotionGoal || metadata.coreSellingPoints?.length || metadata.conflictDesign || metadata.storyLines) {
          await projectStore.updateProjectInfo(newProject.id, {
            emotionGoal: metadata.emotionGoal,
            coolPointDesign: metadata.coolPointDesign,
            coreSellingPoints: metadata.coreSellingPoints,
            conflictDesign: metadata.conflictDesign,
            storyLines: metadata.storyLines,
          });
        }

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

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

    // 辅助函数：提取幕内容
    // structure.act1 可能是字符串，也可能是对象 { title, content, wordCountRatio }
    const extractActContent = (act: any): string => {
      if (!act) return '';
      if (typeof act === 'string') return act;
      if (typeof act === 'object' && act.content) return act.content;
      return String(act);
    };

    // 添加四幕结构
    plotOutline.push(
      {
        id: `plot-${Date.now()}-${plotIndex++}`,
        title: "第一幕",
        description: extractActContent(structure?.act1),
        type: "act",
        orderIndex: 0,
      },
      {
        id: `plot-${Date.now()}-${plotIndex++}`,
        title: "第二幕上",
        description: extractActContent(structure?.act2a),
        type: "act",
        orderIndex: 1,
      },
      {
        id: `plot-${Date.now()}-${plotIndex++}`,
        title: "第二幕下",
        description: extractActContent(structure?.act2b),
        type: "act",
        orderIndex: 2,
      },
      {
        id: `plot-${Date.now()}-${plotIndex++}`,
        title: "第三幕",
        description: extractActContent(structure?.act3),
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

    // 添加章节级大纲（完整保存结构化节点和写作策略字段，供续写消费）
    if (outline.chapters && outline.chapters.length > 0) {
      outline.chapters.forEach((chapter) => {
        plotOutline.push({
          id: `plot-${Date.now()}-${plotIndex++}`,
          title: chapter.title,
          description: chapter.summary,
          type: "chapter" as const,
          keyEvents: Array.isArray(chapter.keyEvents) ? chapter.keyEvents : undefined,
          relatedCharacters: Array.isArray(chapter.involvedCharacters) ? chapter.involvedCharacters : undefined,
          orderIndex: plotOutline.length,
          // ========== 结构化节点 ==========
          CBN: chapter.CBN,
          CPNs: chapter.CPNs,
          CEN: chapter.CEN ?? chapter.coreEvent,
          mustCover: chapter.mustCover,
          forbiddenZones: chapter.forbiddenZones,
          timeSpan: chapter.timeSpan,
          // ========== 写作策略 ==========
          chapterType: chapter.chapterType as any,
          hookType: chapter.hookType as any,
          pacingStrategy: chapter.pacingStrategy as any,
          isClimax: chapter.isClimax,
          expectedCoolPoints: chapter.expectedCoolPoints,
          // purpose：把 CBN/CEN 摘要给 UI 展示用
          purpose: chapter.CBN
            ? `CBN: ${chapter.CBN}\nCEN: ${chapter.CEN || chapter.coreEvent || '待定'}`
            : undefined,
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
        createdChapter: f.setupChapter ?? 1,
        suggestedResolutionChapter: f.suggestedChapter ?? f.payoffChapter,
        // 富伏笔字段（来自首页大纲 foreshadowPlan）
        payoffValue: f.payoffValue,
        carrierCharacter: f.carrierCharacter,
        linkedConflict: f.linkedConflict,
        importance: f.importance,
        setupChapter: f.setupChapter,
        payoffChapter: f.payoffChapter,
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

      // ========== 首页大纲扩展字段 ==========
      // 前 30 章启动包（直接透传，供续写消费 buildEnhancedDesignPrompt）
      startupPack: outline.startupPack30 ? {
        openingHook: outline.startupPack30.openingHook || '',
        promiseToReader: outline.startupPack30.promiseToReader || '',
        protagonistFirstImpression: outline.startupPack30.protagonistFirstImpression || '',
        firstMajorCoolPoint: outline.startupPack30.firstMajorCoolPoint || '',
        firstConflictCycle: outline.startupPack30.firstConflictCycle || '',
        chapterBlocks: (outline.startupPack30.chapterBlocks || []).map(b => ({
          range: b.range,
          objective: b.objective,
          mustEvents: b.mustEvents || [],
          coolPoints: b.coolPoints || [],
          hookRequirement: b.hookRequirement,
          pacing: b.pacing,
          readerExpectation: b.readerExpectation,
        })),
      } : undefined,
      // 故事规模规划（独立存到 metadata.storyScale）
      storyScale: outline.storyScale ? {
        averageWordsPerChapter: outline.storyScale.averageWordsPerChapter,
        suggestedVolumeCount: outline.storyScale.suggestedVolumeCount,
        estimatedChaptersPerVolume: outline.storyScale.estimatedChaptersPerVolume,
        startupPhaseRatio: outline.storyScale.startupPhaseRatio,
        longformProgressionNote: outline.storyScale.longformProgressionNote,
      } : undefined,
      // 完结感知：计划总章节数 + 计划总字数
      plannedChapterCount: outline.storyScale?.estimatedChapterCount
        ? Math.max(1, outline.storyScale.estimatedChapterCount)
        : undefined,
      plannedWordCount: outline.estimatedWordCount || undefined,
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
    /**
     * 规范化分隔符并分割字符串
     * 将各种分隔符（中文逗号、顿号、箭头、英文逗号）统一处理
     */
    const parseListString = (str: string | string[]): string[] => {
      if (!str) return [];
      if (Array.isArray(str)) return str.filter(Boolean);
      const s = String(str).trim();
      if (!s) return [];

      // 统一分隔符：把 → 和 -> 替换成统一符号，然后用统一符号分割
      // 注意：不能在正则的字符类中使用 →\-> 的写法（会导致解析错误）
      const normalized = s
        .replace(/→/g, '|||')
        .replace(/->/g, '|||');
      return normalized
        .split(/[,，、|||]+/)
        .map(part => part.trim())
        .filter(Boolean);
    };

    /**
     * 解析人物线
     * 支持格式：
     * - "老鱼（1-10）→ 铁锚加入（5）→ 珊瑚加入（30）"
     * - "林深、老鱼、泡泡"
     * - { id: "老鱼", role: "mentor" }
     */
    const parseCharacters = (chars: any): { id: string; role: string }[] => {
      if (!chars) return [];
      // 已经是对象数组
      if (Array.isArray(chars) && chars.length > 0 && typeof chars[0] === 'object') {
        return chars.map((c: any) => ({
          id: c.id || c.name || String(c),
          role: c.role || c.type || '',
        }));
      }
      // 字符串格式解析
      const parts = parseListString(chars);
      return parts.map(part => {
        // 匹配中文或英文括号：名称（描述）或 名称(desc)
        const match = part.match(/^(.+?)[（(](.+?)[）)]$/);
        if (match) {
          const name = match[1].trim();
          const desc = match[2].trim();
          // 如果描述是纯数字或数字范围（章节范围），只取名称，不显示为角色描述
          // 例如 "老鱼（1-10）" -> { id: '老鱼', role: '' }
          return { id: name, role: /^[\d]+(-[\d]+)*$/.test(desc) ? '' : desc };
        }
        // 纯名称
        return { id: part, role: '' };
      });
    };

    /**
     * 解析冲突链
     */
    const parseConflictChains = (chains: any): { level: number; name: string; description: string; chapters: number[]; status: 'pending' | 'active' | 'resolved' }[] => {
      if (!chains) return [];
      // 已经是对象数组
      if (Array.isArray(chains) && chains.length > 0 && typeof chains[0] === 'object') {
        return chains.map((c: any, i: number) => ({
          level: c.level || i + 1,
          name: c.name || String(c),
          description: c.description || '',
          chapters: Array.isArray(c.chapters) ? c.chapters : [],
          status: (c.status as 'pending' | 'active' | 'resolved') || 'pending',
        }));
      }
      // 字符串格式解析
      const parts = parseListString(chains);
      return parts.map((part, i) => {
        // 匹配 "名称（章节）" 格式，提取冲突名称
        const match = part.match(/^(.+?)[（(](.+?)[）)]$/);
        let name = part;
        let chapters: number[] = [];

        if (match) {
          name = match[1].trim();
          const desc = match[2].trim();
          // 尝试解析章节范围，如 "1-20" 或 "1-200"
          const rangeMatch = desc.match(/^(\d+)-(\d+)$/);
          if (rangeMatch) {
            // 提取起始章节作为参考
            chapters = [parseInt(rangeMatch[1], 10)];
          } else {
            // 尝试解析单个数字
            const num = parseInt(desc, 10);
            if (!isNaN(num)) {
              chapters = [num];
            }
          }
        }

        return {
          level: i + 1,
          name,
          description: name,
          chapters,
          status: 'pending' as const,
        };
      });
    };

    return {
      id: `storylines-${Date.now()}`,
      map: {
        planned: parseListString(storyLines.map),
        introduced: [],
        current: parseListString(storyLines.map)[0] || '',
        chaptersPerLocation: 50,
      },
      faction: {
        planned: parseListString(storyLines.faction),
        introduced: [],
        currentLevel: 1,
        escalationChapters: [],
      },
      character: {
        planned: parseCharacters(storyLines.character),
        introduced: [],
        keyRelationships: [],
      },
      goldenfinger: {
        type: storyLines.goldenfinger || '',
        currentStage: 1,
        upgrades: [],
      },
      worldRules: {
        revealed: parseListString(storyLines.worldRules),
        pending: [],
      },
      conflict: {
        chains: parseConflictChains(storyLines.conflict),
        activeConflict: parseListString(storyLines.conflict)[0] || '',
      },
      collection: {
        target: parseListString(storyLines.collection),
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
        // 注意：条件必须覆盖所有可能的增强字段，否则单一字段场景会被跳过（原 bug：漏掉 coolPointDesign）
        const hasEnhancement =
          metadata.emotionGoal
          || metadata.coolPointDesign
          || (metadata.coreSellingPoints && metadata.coreSellingPoints.length > 0)
          || metadata.conflictDesign
          || metadata.storyLines
          || metadata.startupPack
          || metadata.storyScale
          || metadata.plannedChapterCount
          || metadata.plannedWordCount;

        if (hasEnhancement) {
          // 注意：main.ts 的 project:update 是浅合并，metadata 会被整体覆盖，
          // 因此这里需要把 newProject 已有的 metadata 合并起来传
          const existingMetadata = (newProject.metadata || {}) as Record<string, unknown>;
          const newMetadata: Record<string, unknown> = {};
          if (metadata.startupPack) newMetadata.startupPack = metadata.startupPack;
          if (metadata.storyScale) newMetadata.storyScale = metadata.storyScale;
          if (metadata.plannedChapterCount !== undefined) newMetadata.plannedChapterCount = metadata.plannedChapterCount;
          if (metadata.plannedWordCount !== undefined) newMetadata.plannedWordCount = metadata.plannedWordCount;

          await projectStore.updateProjectInfo(newProject.id, {
            emotionGoal: metadata.emotionGoal,
            coolPointDesign: metadata.coolPointDesign,
            coreSellingPoints: metadata.coreSellingPoints,
            conflictDesign: metadata.conflictDesign,
            storyLines: metadata.storyLines,
            metadata: Object.keys(newMetadata).length > 0
              ? { ...existingMetadata, ...newMetadata }
              : existingMetadata,
          });
        }

        // 导航到项目编辑器
        router.push(`/project/${newProject.id}`);
        // 完善项目数据（填充角色关系等）
        await projectStore.finalizeProjectCreation(newProject.id);
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

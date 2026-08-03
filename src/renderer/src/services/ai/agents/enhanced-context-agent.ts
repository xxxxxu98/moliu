/**
 * 增强上下文 Agent (Enhanced Context Agent)
 * 
 * 职责：
 * 1. 收集项目上下文
 * 2. 加载历史合同和记忆
 * 3. 生成结构化写作任务书
 */

import { useProjectStore } from '@/stores/project.store';
import { useMemoryOrchestrator } from '../../writing/memory/MemoryOrchestrator';
import {
  detectMustCoverForbiddenConflicts,
  softenConflictingForbidden,
} from '@/services/story-runtime/contractHealth';
import {
  isCrossChapterGoal,
  isReaderMetaText,
  isTemplateHookCen,
  normalizeChapterBlueprint,
  splitPlotClauses,
  stripReaderMeta,
} from '@/services/story-runtime/chapterBlueprintNormalize';
import type {
  WritingTaskBook,
  ChapterContract,
  VolumeContract,
  HardConstraints,
  StyleGuidance,
  DynamicContext,
} from '@/types/writing-v2';
import type { Project, Character, Foreshadow } from '@/types/project';

export interface ContextAgentInput {
  chapterNumber: number;
  previousChapterEnding: string;
  recentChaptersFullText: string;
  targetWordCount?: number;
  writingStyle?: 'concise' | 'elegant' | 'humorous' | 'ancient';
}

export interface ContextAgentOutput {
  success: boolean;
  taskBook?: WritingTaskBook;
  error?: string;
}

export class EnhancedContextAgent {
  private projectStore = useProjectStore();
  private memoryOrchestrator = useMemoryOrchestrator();

  /**
   * 生成写作任务书
   */
  async generateTaskBook(input: ContextAgentInput): Promise<ContextAgentOutput> {
    try {
      const project = this.projectStore.currentProject;
      if (!project) {
        return { success: false, error: '没有加载项目' };
      }

      // 1. 加载合同
      const { volumeContract, chapterContract } = await this.loadContracts(
        project,
        input.chapterNumber
      );

      // 2. 收集上下文
      const context = await this.collectContext(project, input);

      // 3. 构建硬性约束
      const hardConstraints = this.buildHardConstraints(
        chapterContract,
        input.previousChapterEnding
      );

      // 4. 构建风格指引
      const styleGuidance = await this.buildStyleGuidance(
        project,
        chapterContract,
        input.chapterNumber
      );

      // 5. 构建动态上下文
      const dynamicContext = await this.buildDynamicContext(
        project,
        input.chapterNumber
      );

      // 6. 组装任务书
      const previousChapterCen = this.resolvePreviousChapterCen(project, input.chapterNumber);
      const rawTaskBook: WritingTaskBook = {
        hardConstraints,
        CBN: chapterContract?.directive?.CBN || this.generateDefaultCBN(context),
        CPNs: chapterContract?.directive?.CPNs || this.generateDefaultCPNs(context),
        CEN: chapterContract?.directive?.CEN || this.generateDefaultCEN(context),
        // P2 卖点传导：把卷计划里可单章兑现的高光（如「厉鬼群自动让开一条路」）
        // 补进 mustCover，让正文有机会写到书名承诺的核心爽点，而不是只复述上章。
        // 候选与禁区冲突时跳过该候选（不软化作者禁区）。
        mustCover: enrichMustCoverWithVolumeSellingPoints(
          chapterContract?.directive?.mustCoverNodes || [],
          volumePlanSellingPointCandidates(this.resolveVolumePlan(project, input.chapterNumber)),
          chapterContract?.directive?.forbiddenZones || []
        ),
        forbiddenZones: normalizeForbiddenZonesByChapter(
          chapterContract?.directive?.forbiddenZones || [],
          input.chapterNumber
        ),
        styleGuidance,
        dynamicContext,
      };
      const taskBook = this.sanitizeTaskBook(
        rawTaskBook,
        input.chapterNumber,
        input.previousChapterEnding,
        previousChapterCen
      );

      console.log('[ContextAgent] 任务书生成成功:', {
        chapter: input.chapterNumber,
        CBN: taskBook.CBN.slice(0, 50),
        mustCover: taskBook.mustCover.length,
        forbiddenZones: taskBook.forbiddenZones.length,
      });

      return { success: true, taskBook };
    } catch (error) {
      console.error('[ContextAgent] 任务书生成失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '生成失败',
      };
    }
  }

  /**
   * 解析当前章所属卷的卷计划（metadata.volumePlans，与 ContractPackBuilder 同源）。
   * volumePlans.volumeIndex 为 1 基，sortedVolumes.orderIndex 为 0 基，匹配时 +1。
   */
  private resolveVolumePlan(
    project: Project,
    chapterNumber: number
  ): VolumePlanLike | undefined {
    const chapters = this.projectStore.sortedChapters;
    const chapter = chapters.find(c => c.orderIndex === chapterNumber - 1);
    if (!chapter) return undefined;
    const volumes = this.projectStore.sortedVolumes;
    const volumeIndex = volumes.find(v => v.id === chapter.volumeId)?.orderIndex ?? 0;
    return matchVolumePlanByIndex(project.metadata?.volumePlans, volumeIndex);
  }

  /**
   * 读取上一章 CEN（优先作跨章 CBN tip，避免正文碎片污染）
   */
  private resolvePreviousChapterCen(project: Project, chapterNumber: number): string {
    if (chapterNumber <= 1) return '';
    const prev = this.buildChapterContract(project, chapterNumber - 1);
    return (prev?.directive?.CEN || '').trim();
  }

  /**
   * 任务书出口清洗：完整蓝图规范化 + mustCover×禁区冲突软化
   */
  private sanitizeTaskBook(
    taskBook: WritingTaskBook,
    chapterNumber: number,
    previousChapterEnding?: string,
    previousChapterCen?: string
  ): WritingTaskBook {
    const normalized = normalizeChapterBlueprint(
      {
        title: taskBook.hardConstraints.goal || `第${chapterNumber}章`,
        goal: taskBook.hardConstraints.goal,
        CBN: taskBook.CBN,
        CPNs: taskBook.CPNs,
        CEN: taskBook.CEN,
        mustCover: taskBook.mustCover,
      },
      chapterNumber,
      {
        previousEnding: previousChapterEnding,
        previousCen: previousChapterCen,
      }
    );
    const conflicts = detectMustCoverForbiddenConflicts(
      normalized.mustCover,
      taskBook.forbiddenZones
    );
    const { forbidden } = softenConflictingForbidden(taskBook.forbiddenZones, conflicts);
    if (conflicts.length > 0) {
      console.info(
        `[ContextAgent] mustCover×禁区冲突 ${conflicts.length} 处，已软化禁区`
      );
    }
    return {
      ...taskBook,
      CBN: normalized.CBN,
      CPNs: normalized.CPNs,
      CEN: normalized.CEN,
      mustCover: normalized.mustCover,
      forbiddenZones: forbidden,
      hardConstraints: {
        ...taskBook.hardConstraints,
        goal: normalized.goal || taskBook.hardConstraints.goal,
        chapterEndOpenQuestion:
          normalized.CEN || taskBook.hardConstraints.chapterEndOpenQuestion,
      },
    };
  }

  /**
   * 加载合同
   */
  private async loadContracts(project: Project, chapterNumber: number) {
    // 加载卷合同
    const volumeContract = this.buildVolumeContract(project, chapterNumber);

    // 加载章节合同
    const chapterContract = this.buildChapterContract(project, chapterNumber);

    return { volumeContract, chapterContract };
  }

  /**
   * 构建卷合同
   */
  private buildVolumeContract(project: Project, chapterNumber: number): VolumeContract | null {
    const volumes = this.projectStore.sortedVolumes;
    if (volumes.length === 0) {
      return null;
    }

    // 找到章节所属的卷
    const chapters = this.projectStore.sortedChapters;
    const chapter = chapters.find((c) => c.orderIndex === chapterNumber - 1);
    if (!chapter) {
      return null;
    }

    const volume = volumes.find((v) => v.id === chapter.volumeId) || volumes[0];

    return {
      id: volume.id,
      volumeNumber: volume.orderIndex + 1,
      title: volume.name,
      pacingStrategy: 'normal',
      coolPointTarget: 1,
      readerSignals: [],
      tone: 'neutral',
    };
  }

  /**
   * 构建章节合同
   */
  private buildChapterContract(project: Project, chapterNumber: number): ChapterContract | null {
    const plotOutline = project.plotOutline || [];

    // 查找匹配的章节型 plot 节点。优先级：
    //   1. 节点 chapterId 显式绑定到对应真实 Chapter
    //   2. 位置兜底：第 N 个 chapter 型节点 = 第 N 章（首页大纲路径主要走这条）
    // 此前用 `p.orderIndex === chapterNumber - 1` 兜底，但 chapter 节点的 orderIndex 会被
    // 前面的 act/subplot 节点污染，导致长篇几乎永远查不到。
    let plotNode: any;
    const chapters = this.projectStore.sortedChapters;
    const realChapter = chapters.find((c) => c.orderIndex === chapterNumber - 1);
    if (realChapter) {
      plotNode = plotOutline.find((p: any) => p.chapterId === realChapter.id);
    }
    if (!plotNode) {
      const chapterNodes = plotOutline
        .filter((p: any) => p.type === 'chapter')
        .sort((a: any, b: any) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
      plotNode = chapterNodes[chapterNumber - 1];
    }

    if (!plotNode) {
      // 如果还是没有，返回默认合同
      return {
        id: `chapter-${chapterNumber}`,
        chapterNumber,
        title: `第${chapterNumber}章`,
        directive: {
          goal: '续写当前情节',
        },
      };
    }

    return {
      id: plotNode.id || `chapter-${chapterNumber}`,
      chapterNumber,
      title: plotNode.title || plotNode.name || `第${chapterNumber}章`,
      directive: {
        goal: plotNode.description || plotNode.plotSummary || '续写当前情节',
        timeAnchor: plotNode.timeAnchor,
        chapterSpan: plotNode.chapterSpan,
        countdown: plotNode.countdown,
        chapterEndOpenQuestion: plotNode.chapterEndOpenQuestion,
        CBN: plotNode.CBN,
        CPNs: plotNode.CPNs,
        CEN: plotNode.CEN,
        mustCoverNodes: plotNode.mustCover || [],
        forbiddenZones: plotNode.forbiddenZones || [],
      },
      characters: this.buildCharacterContext(project.characters || [], plotNode),
    };
  }

  /**
   * 构建角色上下文
   */
  private buildCharacterContext(
    characters: Character[],
    plotNode: any
  ): ChapterContract['characters'] {
    if (!characters.length) {
      return [];
    }

    // 获取本章出场的角色
    const charactersInScene = plotNode.charactersInScene || characters.slice(0, 5);

    return charactersInScene.map((char: Character) => ({
      id: char.id,
      name: char.name,
      role: char.role || '角色',
      state: char.profile?.status || '正常',
      motivation: char.profile?.goals?.[0] || '未知',
      chapterRole: '本章出场',
      speakingStyle: char.profile?.speakingStyle || '正常',
    }));
  }

  /**
   * 收集上下文
   */
  private async collectContext(project: Project, input: ContextAgentInput) {
    const chapters = this.projectStore.sortedChapters;
    const currentIndex = input.chapterNumber - 1;

    // 获取近期章节记忆
    const recentMemories = this.projectStore.getShortTermMemories();

    // 获取角色状态
    const characterStates = this.buildCharacterStatesTable();

    // 获取情节进度
    const plotProgress = this.buildPlotProgressTable();

    return {
      recentMemories,
      characterStates,
      plotProgress,
      recentChaptersFullText: input.recentChaptersFullText,
      previousChapterEnding: input.previousChapterEnding,
    };
  }

  /**
   * 构建角色状态表
   */
  private buildCharacterStatesTable(): Record<string, string> {
    const states: Record<string, string> = {};
    const characters = this.projectStore.characters;

    for (const char of characters) {
      // 从最新记忆获取状态
      const memories = this.projectStore.chapterMemories.filter((m) =>
        m.characterStateChanges.some((c) => c.characterName === char.name)
      );

      if (memories.length > 0) {
        const latestMemory = memories[memories.length - 1];
        const latestChange = latestMemory.characterStateChanges.find(
          (c) => c.characterName === char.name
        );
        if (latestChange) {
          states[char.name] = latestChange.detail;
        }
      } else {
        states[char.name] = char.profile?.status || '正常';
      }
    }

    return states;
  }

  /**
   * 构建情节进度表
   */
  private buildPlotProgressTable(): string {
    const memories = this.projectStore.chapterMemories;
    if (memories.length === 0) {
      return '暂无情节进度';
    }

    // 获取最近 3 章的关键事件
    const recentMemories = memories.slice(-3);
    const events = recentMemories.flatMap((m) => m.keyEvents);

    return events.slice(0, 5).join('；');
  }

  /**
   * 构建硬性约束
   */
  private buildHardConstraints(
    contract: ChapterContract | null,
    previousChapterEnding: string
  ): HardConstraints {
    if (!contract) {
      return {
        goal: '续写当前情节',
      };
    }

    const directive = contract.directive;

    return {
      goal: directive.goal || '续写当前情节',
      timeAnchor: directive.timeAnchor,
      chapterSpan: directive.chapterSpan,
      countdown: directive.countdown,
      chapterEndOpenQuestion: directive.chapterEndOpenQuestion,
    };
  }

  /**
   * 构建风格指引
   */
  private async buildStyleGuidance(
    project: Project,
    contract: ChapterContract | null,
    chapterNumber: number
  ): Promise<StyleGuidance> {
    // 从记忆系统获取近期风格
    const recentMemories = this.projectStore.getShortTermMemories();
    const lastMemory = recentMemories[recentMemories.length - 1];

    // 从反模式注册表获取避雷模式
    const antiPatterns = await this.loadAntiPatterns();

    // 提取主角 OOC 警戒
    const protagonistOOCAlert = this.buildProtagonistOOCAlert(project.characters || []);

    return {
      reasoning: this.buildReasoningRules(project),
      antiPatterns,
      protagonistOOCAlert,
    };
  }

  /**
   * 加载反模式
   */
  private async loadAntiPatterns(): Promise<string[]> {
    try {
      // 从项目设置或记忆中获取反模式
      const settings = await this.getProjectSettings();
      return settings.antiPatterns || [];
    } catch {
      return [];
    }
  }

  /**
   * 获取项目设置
   */
  private async getProjectSettings(): Promise<{ antiPatterns?: string[] }> {
    // TODO: 从项目存储中获取
    return {};
  }

  /**
   * 构建主角 OOC 警戒
   */
  private buildProtagonistOOCAlert(characters: Character[]): string[] {
    const alerts: string[] = [];
    const protagonists = characters.filter(
      (c) => c.role === '主角' || c.role?.includes('主角')
    );

    for (const protagonist of protagonists) {
      // 从角色设定中提取核心特质
      const traits = protagonist.profile?.personality || [];
      if (traits.length > 0) {
        alerts.push(`主角 ${protagonist.name} 的核心特质: ${traits.slice(0, 3).join('、')}`);
      }
    }

    return alerts;
  }

  /**
   * 构建推理规则
   */
  private buildReasoningRules(project: Project): string[] {
    const rules: string[] = [];

    // 基于世界观添加规则
    if (project.worldSchema?.rules) {
      for (const rule of project.worldSchema.rules.slice(0, 3)) {
        rules.push(`世界规则: ${rule.name} - ${rule.description}`);
      }
    }

    // 基于类型添加规则
    const genre = project.genre?.[0]?.name;
    if (genre) {
      rules.push(`题材: ${genre}`);
    }

    return rules;
  }

  /**
   * 构建动态上下文
   */
  private async buildDynamicContext(
    project: Project,
    chapterNumber: number
  ): Promise<DynamicContext | undefined> {
    // 获取近期风格
    const recentChapters = this.projectStore.sortedChapters.slice(-3);
    const recentContent = recentChapters.map((c) => c.content).join('\n');

    // 获取角色状态
    const characterStates = this.buildCharacterStatesTable();

    // 获取情节进度
    const plotProgress = this.buildPlotProgressTable();

    return {
      recentStyle: this.analyzeStyle(recentContent),
      characterStates,
      plotProgress,
    };
  }

  /**
   * 分析风格
   */
  private analyzeStyle(content: string): string {
    if (!content) {
      return '正常叙事风格';
    }

    // 简单分析：检测对话比例、句子长度等
    const dialogues = (content.match(/[""][^""]+[""]/g) || []).length;
    const totalLength = content.length;
    const dialogueRatio = dialogues * 50 / totalLength; // 估算

    if (dialogueRatio > 0.4) {
      return '对话较多，节奏紧凑';
    } else if (dialogueRatio < 0.2) {
      return '叙述为主，描写细腻';
    }
    return '对话与叙述平衡';
  }

  /**
   * 生成默认 CBN
   */
  private generateDefaultCBN(context: any): string {
    if (context.previousChapterEnding) {
      return `承接前章结尾继续: "${context.previousChapterEnding.slice(-50)}..."`;
    }
    return '开始新的情节';
  }

  /**
   * 生成默认 CPNs
   */
  private generateDefaultCPNs(context: any): string[] {
    return [
      '推进主要冲突',
      '展现角色动机',
      '增加悬念或转折',
    ];
  }

  /**
   * 生成默认 CEN
   */
  private generateDefaultCEN(context: any): string {
    return '留下悬念，吸引读者继续阅读';
  }
}

// ============================================================
// Composable 导出
// ============================================================

let contextAgentInstance: EnhancedContextAgent | null = null;

export function useEnhancedContextAgent(): EnhancedContextAgent {
  if (!contextAgentInstance) {
    contextAgentInstance = new EnhancedContextAgent();
  }
  return contextAgentInstance;
}

export default EnhancedContextAgent;

// ============================================================
// 纯函数导出（供单测与复用）
// ============================================================

/** 卷计划的最小字段视图（与 project.metadata.volumePlans 同源） */
export interface VolumePlanLike {
  volumeIndex: number;
  objective?: string;
  coreConflict?: string;
  climax?: string;
  payoffForeshadows?: string[];
}

/**
 * 禁区按章归一化：引用「第N章」的禁区，其全部目标章号都已小于当前章时视为过期，予以过滤。
 * 例：大纲把「不能让沈青梧在第1章就出现」复制到全部 30 章，
 * 写第 3 章时该限制早已过去——原样透传会让正文让沈青梧出场就被判触禁。
 * 语义处理：
 * - 单点/区间（「第1章就出现」「第1章到第3章」）：任一目标章号 ≥ 当前章则保留
 *   （「第1章到第3章」写第 2 章时 3 未过，仍应受限）；
 * - 开放下限（「第5章以后/之后/起」）：章号 ≤ 当前章则保留（写第 6 章时第 5 章起的限制仍有效）。
 * 无章号引用的禁区（如「不能解释厉鬼绕行原因」）恒保留。
 */
export function normalizeForbiddenZonesByChapter(
  zones: string[],
  chapterNumber: number
): string[] {
  return (zones ?? []).filter(zone => {
    const numbers = [...zone.matchAll(/第\s*(\d+)\s*章/gu)]
      .map(match => Number(match[1]))
      .filter(Number.isFinite);
    if (numbers.length === 0) return true;
    const isOpenEnded = /(?:从\s*)?第\s*\d+\s*章\s*(?:起|开始)|以后|之后/gu.test(zone);
    if (isOpenEnded) return numbers.some(number => number <= chapterNumber);
    return numbers.some(number => number >= chapterNumber);
  });
}

/**
 * 按 0 基卷索引匹配卷计划：volumePlans.volumeIndex 为 1 基，故匹配 volumeIndex + 1。
 */
export function matchVolumePlanByIndex(
  plans: VolumePlanLike[] | undefined,
  volumeIndex: number
): VolumePlanLike | undefined {
  return plans?.find(plan => plan.volumeIndex === volumeIndex + 1);
}

/**
 * 从卷计划收集卖点候选（卷高光 > 卷目标 > 核心冲突 > 必付伏笔），去空。
 */
export function volumePlanSellingPointCandidates(
  plan: VolumePlanLike | undefined
): string[] {
  if (!plan) return [];
  return [plan.climax, plan.objective, plan.coreConflict, ...(plan.payoffForeshadows ?? [])]
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim());
}

/**
 * P2 卖点传导：把卷计划里「可单章兑现」的高光场景补入 mustCover（最多 1 条）。
 * 过滤规则：
 * - 按中文标点拆子句，只取 8–40 字；
 * - 排除跨章目标（限期/威胁组合，纳入即死锁）、模板钩子、读者元文本；
 * - 与既有 mustCover 重叠的跳过。
 * 这样正文有机会写到书名承诺的核心爽点（如「厉鬼群自动让开一条路」），
 * 而不是只复述上章结尾。
 */
export function enrichMustCoverWithVolumeSellingPoints(
  mustCover: string[],
  sellingPointCandidates: string[],
  forbiddenZones: string[] = []
): string[] {
  if (!sellingPointCandidates || sellingPointCandidates.length === 0) {
    return mustCover;
  }
  for (const candidate of sellingPointCandidates) {
    const clauses = splitPlotClauses(stripReaderMeta(candidate));
    for (const clause of clauses) {
      if (clause.length < 8 || clause.length > 40) continue;
      if (isCrossChapterGoal(clause)) continue;
      if (isTemplateHookCen(clause)) continue;
      if (isReaderMetaText(clause)) continue;
      if (mustCover.some(item => item.includes(clause) || clause.includes(item))) continue;
      // 与禁区冲突则跳过该候选，避免借 mustCover 新增硬约束后被软化
      if (
        forbiddenZones.length > 0 &&
        detectMustCoverForbiddenConflicts([clause], forbiddenZones).length > 0
      ) {
        continue;
      }
      return [...mustCover, clause];
    }
  }
  return mustCover;
}

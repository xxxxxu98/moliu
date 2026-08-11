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
        // 单章硬合同只能来自逐章蓝图。卷级 payoffForeshadows 没有精确章号调度，
        // 无条件注入会把“卷末真相/后期回收”塞进开篇，迫使正文提前透支主线。
        // 卷卖点仍保留在动态上下文中作为软提示，不能进入 mustCover 强制验收。
        mustCover: chapterContract?.directive?.mustCoverNodes || [],
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
 * 从卷计划收集可单章兑现的卖点候选（仅必付伏笔），去空。
 *
 * 刻意排除卷高潮 climax：climax 是本卷收尾的高光，往往落在中后期某具体章
 * （AI 常写成「第59章，主角在朝会上当众拆穿旧党首领的贪污证据」）。
 * 把它注入开篇章的 mustCover 会让履约审核判「未兑现」并强制整章重写，
 * 迫使正文提前透支卷级高潮、打乱全卷节拍。
 *
 * 刻意排除卷目标 objective：objective 是「本卷要达成的整卷承诺」，天然跨章
 * （如「完成清河县亏空清账、清丈田亩、重定税则、汰换吏员」是全卷 30 章的主线，
 * 不是任一单章可兑现的事件）。注入单章 mustCover 后，履约审核必然判「未兑现」
 * → 连环整章重写 → 整批熔断。isLikelyVolumeScopedObjective 的正则只覆盖
 * 「打败/治理成…模范」等标志词，覆盖不到「清账、清丈、改税、汰吏」这类无标志
 * 动词的纯并列写法；splitPlotClauses 又不按顿号拆分，导致整条卷目标蒙混进入。
 * 根治方式是源头排除：objective 整体不进单章候选。需要保留卷主线提示时，应
 * 走「风格指引/动态上下文」而非单章硬约束。
 *
 * coreConflict 同样是卷级矛盾定义，不是单章事件。真实 smoke 曾把
 * 「现代管理思维 vs 县衙旧势力」注入第 1 章 mustCover，同时本章禁区又要求
 * 「不得提前展示现代知识」，导致合同自相矛盾和多轮无效重写。因此 coreConflict
 * 也不得进入单章硬约束；只有经过后续过滤的 payoffForeshadows 可作为候选。
 */
export function volumePlanSellingPointCandidates(
  plan: VolumePlanLike | undefined
): string[] {
  if (!plan) return [];
  return [...(plan.payoffForeshadows ?? [])]
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim());
}

/**
 * 判断子句是否引用了远期章节。AI 在卷计划里常把高光写成「第59章，主角在朝会上
 * 当众拆穿旧党首领的贪污证据」——这种带具体章号的卷级目标天然属于远期兑现点，
 * 注入当前章 mustCover 会触发履约审核判「未兑现」并强制重写，迫使正文提前透支
 * 后续高潮。给 isCrossChapterGoal 补一道章号引用识别（后者只认时限/威胁式跨章目标）。
 *
 * 判定：子句含「第N章」且 N 超过当前章 + horizon（默认 5，即本卷近 5 章视窗内的
 * 章号引用仍可作为近期铺垫注入；超出视窗则属远期目标，跳过）。
 */
export function referencesFutureChapter(
  clause: string,
  chapterNumber: number,
  horizon: number = 5
): boolean {
  if (!clause || chapterNumber <= 0) return false;
  const numbers = [...clause.matchAll(/第\s*(\d+)\s*章/gu)]
    .map(match => Number(match[1]))
    .filter(Number.isFinite);
  if (numbers.length === 0) return false;
  const ceiling = chapterNumber + Math.max(0, horizon);
  return numbers.some(number => number > ceiling);
}

const VOLUME_STAGE_REFERENCE_RE =
  /(?:第\s*[一二三四五六七八九十百千零〇两\d]+\s*卷|本卷|该卷)(?:开篇|初|前期|中段|中期|中后期|后期|末|末尾|收尾|结束)|(?:卷中|卷末|本卷末|中后期|后期|最终)(?:才|再|将|会|被)?/u;

export function referencesVolumeStage(text: string): boolean {
  return VOLUME_STAGE_REFERENCE_RE.test((text ?? '').trim());
}

/**
 * 卷级 objective 天然跨章：即使 isCrossChapterGoal 未命中（模型可能写成
 * 「三个月把一个穷县治理成模范县」「打败钱四海，通过考绩并获得进京机会」这类
 * 不带「完成/逆转」标志词但本质仍是整卷主线的表述），注入单章 mustCover 也会
 * 触发履约审核判「未兑现」并连环重写熔断。
 *
 * 这里做一道更保守的二次校验：候选若含卷级跨度信号词
 * （打败/击败 + 卷级反派名；获得/取得 + 卷级奖励；通过 + 考绩/考核/验收/述职；
 *   治理成/打造成 + 模范/示范/标杆；获得 + 进京/晋升/封爵/升任；获得/拿下 + 全 + 名额/资源）
 * 即视为卷级目标，整体跳过。宁可少注入一条卖点，也不污染单章合同。
 *
 * 注意：此函数只用于过滤来自卷计划 objective 的「整卷承诺」，不应误伤单章爽点
 * （单章爽点一般是「当众打脸」「翻案」「破局」等具体场景动作）。
 */
const VOLUME_SCOPED_OBJECTIVE_RE =
  /(?:打败|击败|扳倒|铲除|消灭|清除).{0,12}(?:党|派|集团|势力|反派|boss)/u;
const VOLUME_SCOPED_REWARD_RE =
  /(?:通过|拿下|取得|获得|完成).{0,8}(?:考绩|考核|验收|述职|复审|评定)/u;
const VOLUME_SCOPED_TRANSFORM_RE =
  /(?:治理成|打造成|建设成|做成|变成).{0,8}(?:模范|示范|标杆|样板|第一)/u;
const VOLUME_SCOPED_PROMOTION_RE =
  /(?:获得|取得|拿到|赢得).{0,8}(?:进京|晋升|封爵|升任|提拔|入阁|入朝)/u;
const VOLUME_SCOPED_BULK_RE =
  /(?:平定|肃清|统一|收复|荡平|剿灭).{0,8}(?:叛乱|边患|匪患|全国|全境|全境)/u;
/** 多方“敌意/警惕/打压”等并列状态是卷级关系图，不是单章可兑现事件。 */
const ABSTRACT_CONFLICT_STATE_RE = /敌意|警惕|排挤|打压|压制|对立|掣肘|猜忌|戒备/u;

function isAbstractMultiPartyConflictSummary(text: string): boolean {
  const clauses = (text ?? '')
    .split(/[、，,；;]/u)
    .map(item => item.trim())
    .filter(Boolean);
  return clauses.length >= 3 && clauses.filter(item => ABSTRACT_CONFLICT_STATE_RE.test(item)).length >= 2;
}

export function isLikelyVolumeScopedObjective(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  return (
    VOLUME_SCOPED_OBJECTIVE_RE.test(t) ||
    VOLUME_SCOPED_REWARD_RE.test(t) ||
    VOLUME_SCOPED_TRANSFORM_RE.test(t) ||
    VOLUME_SCOPED_PROMOTION_RE.test(t) ||
    VOLUME_SCOPED_BULK_RE.test(t) ||
    isAbstractMultiPartyConflictSummary(t)
  );
}

/**
 * P2 卖点传导：把卷计划里「可单章兑现」的高光场景补入 mustCover（最多 1 条）。
 * 过滤规则：
 * - 按中文标点拆子句，只取 8–40 字；
 * - 排除跨章目标（限期/威胁组合、远期章号引用，纳入即死锁或提前透支）、模板钩子、读者元文本；
 * - 排除卷级 objective（打败卷级反派/通过卷级考核/治理成模范县等整卷承诺，单章无法兑现）；
 * - 与既有 mustCover 重叠的跳过。
 * 这样正文有机会写到书名承诺的核心爽点（如「厉鬼群自动让开一条路」），
 * 而不是只复述上章结尾。
 *
 * chapterNumber 用于过滤远期章号引用（如「第59章…」对第1章而言是远期目标），
 * 不传时退化为不过滤章号引用（保留向后兼容，但建议始终传入）。
 */
export function enrichMustCoverWithVolumeSellingPoints(
  mustCover: string[],
  sellingPointCandidates: string[],
  forbiddenZones: string[] = [],
  chapterNumber?: number
): string[] {
  if (!sellingPointCandidates || sellingPointCandidates.length === 0) {
    return mustCover;
  }
  for (const candidate of sellingPointCandidates) {
    // payoffForeshadows 经常写成“第1卷末才发现……”。它没有具体章号，不能由
    // referencesFutureChapter 捕获，但同样属于远期回收点，绝不能注入当前章硬合同。
    if (referencesVolumeStage(candidate)) continue;
    // 远期章号引用（如卷级目标「第59章，主角在朝会上当众拆穿旧党首领的贪污证据」）
    // 必须在拆子句之前判定：splitPlotClauses 按逗号切分后会把章号独立成片并因长度<4
    // 被过滤掉，剩下不带章号的情节子句会绕过章号检查被注入，反而触发履约审核判
    // 未兑现、强制重写透支后续高潮。整个候选一旦含远期章号引用即整体跳过。
    if (chapterNumber && referencesFutureChapter(candidate, chapterNumber)) continue;
    // 卷级 objective 整体跳过：即使拆成子句后某一短句看似可单章兑现，
    // 它仍属整卷承诺的一部分，注入会与卷级节拍冲突。isCrossChapterGoal 抓标志词，
    // 这里再补一道结构化信号（打败卷级反派/通过卷级考核/治理成模范县等）双保险。
    if (isLikelyVolumeScopedObjective(candidate)) continue;
    const clauses = splitPlotClauses(stripReaderMeta(candidate));
    for (const clause of clauses) {
      if (clause.length < 8 || clause.length > 40) continue;
      if (isCrossChapterGoal(clause)) continue;
      if (isTemplateHookCen(clause)) continue;
      if (isReaderMetaText(clause)) continue;
      // 子句级卷级跨度信号再过滤一次（拆出来的子句也可能是整卷目标）
      if (isLikelyVolumeScopedObjective(clause)) continue;
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

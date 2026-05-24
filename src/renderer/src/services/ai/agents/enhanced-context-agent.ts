/**
 * 增强上下文 Agent (Enhanced Context Agent)
 * 
 * 职责：
 * 1. 收集项目上下文
 * 2. 加载历史合同和记忆
 * 3. 生成结构化写作任务书
 */

import { useProjectStore } from '@/stores/project.store';
import { useMemoryOrchestrator } from '../memory/MemoryOrchestrator';
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
      const taskBook: WritingTaskBook = {
        hardConstraints,
        CBN: chapterContract?.directive?.CBN || this.generateDefaultCBN(context),
        CPNs: chapterContract?.directive?.CPNs || this.generateDefaultCPNs(context),
        CEN: chapterContract?.directive?.CEN || this.generateDefaultCEN(context),
        mustCover: chapterContract?.directive?.mustCoverNodes || [],
        forbiddenZones: chapterContract?.directive?.forbiddenZones || [],
        styleGuidance,
        dynamicContext,
      };

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
    
    // 尝试从 plotOutline 找到匹配的章节
    let plotNode = plotOutline.find(
      (p: any) => p.chapterNumber === chapterNumber || p.orderIndex === chapterNumber - 1
    );

    // 如果没找到，使用章节标题匹配
    if (!plotNode && project.plotOutline) {
      const chapters = this.projectStore.sortedChapters;
      const chapter = chapters.find((c) => c.orderIndex === chapterNumber - 1);
      if (chapter) {
        plotNode = project.plotOutline.find((p: any) => p.chapterId === chapter.id);
      }
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

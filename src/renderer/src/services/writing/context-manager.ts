/**
 * 上下文管理器
 * 负责管理分层上下文，控制 Token 预算
 */

import type { 
  ChapterWritingContext, 
  ContextInfo,
  WritingConfig 
} from '@/types/writing';
import { ContextLevel } from '@/types/writing';
import type { Character, WorldSchema, PlotNode } from '@/types/project';
import { PromptBuilder } from './prompt-builder';

/**
 * Token 预算配置
 */
const TOKEN_BUDGET = {
  // 总预算
  total: 20000,
  // 各层级预算
  levels: {
    [ContextLevel.Project]: 2000,     // 项目级 2KB
    [ContextLevel.Volume]: 3000,      // 卷级 3KB
    [ContextLevel.Chapter]: 4000,     // 章级 4KB
    [ContextLevel.Writing]: 8000,     // 创作级 8KB
  },
  // 保留给 AI 输出的空间
  outputReserve: 6000,
};

/**
 * 默认写作配置
 */
const DEFAULT_WRITING_CONFIG: Partial<WritingConfig> = {
  targetWordCount: 800000,
  wordsPerChapter: 4000,
  chapterCount: 200,
  writingStyle: 'concise',
  temperature: 0.7,
  maxTokensPerChapter: 4000,
  includePreviousChapter: true,
  includeCharacterProfiles: true,
  includeWorldSetting: true,
  includeForeshadows: true,
};

/**
 * 上下文管理器类
 */
export class ContextManager {
  private config: WritingConfig;
  private contextHistory: ContextInfo[] = [];
  private currentTokenUsage: number = 0;

  constructor(config?: Partial<WritingConfig>) {
    this.config = {
      ...DEFAULT_WRITING_CONFIG as WritingConfig,
      ...config,
    };
  }

  /**
   * 获取可用 Token 预算
   */
  getAvailableTokenBudget(): number {
    return TOKEN_BUDGET.total - this.currentTokenUsage - TOKEN_BUDGET.outputReserve;
  }

  /**
   * 获取当前 Token 使用量
   */
  getCurrentTokenUsage(): number {
    return this.currentTokenUsage;
  }

  /**
   * 构建项目级上下文
   */
  buildProjectContext(
    projectTitle: string,
    projectSynopsis: string,
    worldSchema?: WorldSchema,
    coreCharacters?: Character[]
  ): string {
    const sections: string[] = [];

    // 项目标题和简介
    sections.push(`# 项目信息`);
    sections.push(`**书名**：${projectTitle}`);
    sections.push(`**故事简介**：${projectSynopsis}`);

    // 核心角色（最多 5 个）
    if (coreCharacters && coreCharacters.length > 0) {
      sections.push(`\n## 核心角色`);
      const limitedCharacters = coreCharacters.slice(0, 5);
      limitedCharacters.forEach(char => {
        const personality = char.profile?.personality?.join('、') || '未知';
        const relationships = char.profile?.relationships
          ?.map(r => `${r.type === 'ally' ? '盟友' : r.type === 'enemy' ? '敌人' : '关系'}：${r.targetName}`)
          .join('、') || '无';

        sections.push(`### ${char.name}`);
        sections.push(`- 身份：${char.role}`);
        sections.push(`- 性格：${personality}`);
        if (relationships !== '无') {
          sections.push(`- 关系：${relationships}`);
        }
      });
    }

    // 世界观设定（简洁版）
    if (worldSchema) {
      sections.push(`\n## 世界观设定`);
      
      // 规则
      if (worldSchema.rules && worldSchema.rules.length > 0) {
        sections.push(`### 核心规则`);
        worldSchema.rules.slice(0, 5).forEach(rule => {
          sections.push(`- ${rule.name}：${rule.description}`);
        });
      }

      // 势力
      if (worldSchema.factions && worldSchema.factions.length > 0) {
        sections.push(`### 主要势力`);
        worldSchema.factions.slice(0, 5).forEach(faction => {
          sections.push(`- ${faction.name}：${faction.description}`);
        });
      }
    }

    const context = sections.join('\n');
    const tokens = PromptBuilder.estimateTokens(context);

    this.recordContextUsage(ContextLevel.Project, context, tokens);

    return context;
  }

  /**
   * 构建卷级上下文
   */
  buildVolumeContext(
    volumeTitle: string,
    volumeOutline: string,
    volumeCharacters?: Character[],
    relatedEvents?: string[]
  ): string {
    const sections: string[] = [];

    sections.push(`# 当前卷：${volumeTitle}`);
    sections.push(`\n## 本卷概述`);
    sections.push(volumeOutline);

    if (volumeCharacters && volumeCharacters.length > 0) {
      sections.push(`\n## 本卷涉及角色`);
      volumeCharacters.forEach(char => {
        const personality = char.profile?.personality?.join('、') || '未知';
        sections.push(`- ${char.name}（${char.role}）：${personality}`);
      });
    }

    if (relatedEvents && relatedEvents.length > 0) {
      sections.push(`\n## 本卷核心事件`);
      relatedEvents.forEach((event, i) => {
        sections.push(`${i + 1}. ${event}`);
      });
    }

    const context = sections.join('\n');
    const tokens = PromptBuilder.estimateTokens(context);

    this.recordContextUsage(ContextLevel.Volume, context, tokens);

    return context;
  }

  /**
   * 构建章级上下文
   */
  buildChapterContext(
    chapterTitle: string,
    chapterOutline: string,
    charactersInScene: Character[],
    previousChapterSummary?: string,
    foreshadowsToTrack?: Array<{ hint: string; status: string }>
  ): string {
    const sections: string[] = [];

    sections.push(`# 当前章节：${chapterTitle}`);
    sections.push(`\n## 章节任务`);
    sections.push(chapterOutline);

    // 前情摘要
    if (previousChapterSummary) {
      sections.push(`\n## 前情概要`);
      sections.push(previousChapterSummary);
    }

    // 本章出场角色
    if (charactersInScene.length > 0) {
      sections.push(`\n## 本章出场角色`);
      charactersInScene.forEach(char => {
        const personality = char.profile?.personality?.join('、') || '未知';
        sections.push(`- ${char.name}：${personality}`);
      });
    }

    // 伏笔追踪
    if (foreshadowsToTrack && foreshadowsToTrack.length > 0) {
      sections.push(`\n## 伏笔状态`);
      foreshadowsToTrack.forEach(f => {
        sections.push(`- ${f.hint} [${this.getForeshadowStatusText(f.status)}]`);
      });
    }

    const context = sections.join('\n');
    const tokens = PromptBuilder.estimateTokens(context);

    this.recordContextUsage(ContextLevel.Chapter, context, tokens);

    return context;
  }

  /**
   * 构建创作上下文
   */
  buildWritingContext(
    existingContent: string,
    writingInstructions: string,
    styleRequirements?: string
  ): string {
    const sections: string[] = [];

    sections.push(`# 创作指令`);

    if (writingInstructions) {
      sections.push(`\n## 本次写作要求`);
      sections.push(writingInstructions);
    }

    if (styleRequirements) {
      sections.push(`\n## 风格要求`);
      sections.push(styleRequirements);
    }

    if (existingContent) {
      sections.push(`\n## 现有内容`);
      sections.push(`（见下方已写内容）`);
    }

    const context = sections.join('\n');
    const tokens = PromptBuilder.estimateTokens(context);

    this.recordContextUsage(ContextLevel.Writing, context, tokens);

    return context;
  }

  /**
   * 构建完整的章节写作上下文
   */
  buildFullChapterContext(params: {
    projectTitle: string;
    projectSynopsis: string;
    worldSchema?: WorldSchema;
    coreCharacters?: Character[];
    volumeTitle?: string;
    volumeOutline?: string;
    chapterTitle: string;
    chapterOutline: string;
    charactersInScene: Character[];
    previousChapterSummary?: string;
    existingContent?: string;
    activeForeshadows?: Array<{ hint: string; status: string }>;
    writingStyle?: string;
    targetWordCount?: number;
    additionalInstructions?: string;
  }): ChapterWritingContext {
    return {
      projectTitle: params.projectTitle,
      projectSynopsis: params.projectSynopsis,
      worldSetting: params.worldSchema ? {
        locations: params.worldSchema.locations || [],
        rules: params.worldSchema.rules || [],
        factions: params.worldSchema.factions || [],
      } : undefined,
      volumeTitle: params.volumeTitle,
      volumeOutline: params.volumeOutline,
      chapter: {
        id: '',
        title: params.chapterTitle,
        orderIndex: 0,
        outline: params.chapterOutline,
        existingContent: params.existingContent,
      },
      previousChapter: params.previousChapterSummary ? {
        title: '',
        summary: params.previousChapterSummary,
        ending: '',
      } : undefined,
      characters: (params.coreCharacters || []).map(c => ({
        id: c.id,
        name: c.name,
        role: c.role,
        description: c.description,
        personality: c.profile?.personality || [],
        appearance: c.profile?.appearance,
        speakingStyle: undefined,
        currentStatus: undefined,
        relationships: c.profile?.relationships?.map(r => ({
          targetName: r.targetName,
          type: r.type,
          description: r.description,
        })),
      })),
      charactersInScene: params.charactersInScene.map(c => c.id),
      foreshadows: params.activeForeshadows || [],
      requirements: {
        targetWordCount: params.targetWordCount || 3000,
        style: (params.writingStyle as any) || 'concise',
        customStyle: params.additionalInstructions,
      },
    };
  }

  /**
   * 提取前情摘要
   * 从上一章内容中提取关键信息
   */
  extractPreviousChapterSummary(content: string, maxLength: number = 300): string {
    if (!content) return '';

    // 如果内容较短，直接返回
    if (content.length <= maxLength) {
      return content;
    }

    // 尝试找到合适的截断点（段落边界）
    const truncated = content.slice(0, maxLength);
    const lastParagraph = truncated.lastIndexOf('\n\n');
    const lastPeriod = truncated.lastIndexOf('。');
    const lastPunctuation = Math.max(lastParagraph, lastPeriod);

    if (lastPunctuation > maxLength * 0.7) {
      return content.slice(0, lastPunctuation + 1);
    }

    return truncated + '...';
  }

  /**
   * 提取章节结尾关键句
   */
  extractChapterEnding(content: string): string {
    if (!content) return '';

    const lines = content.trim().split('\n\n');
    if (lines.length === 0) return '';

    // 返回最后一段的最后一句
    const lastParagraph = lines[lines.length - 1];
    const sentences = lastParagraph.split(/[。！？]/);
    
    if (sentences.length > 0) {
      const lastSentence = sentences[sentences.length - 1].trim();
      if (lastSentence) {
        return lastSentence + '。';
      }
    }

    return lastParagraph.slice(-100);
  }

  /**
   * 检查上下文是否超限
   */
  checkContextOverLimit(context: string): boolean {
    const tokens = PromptBuilder.estimateTokens(context);
    return tokens > this.getAvailableTokenBudget();
  }

  /**
   * 优化上下文以符合 Token 限制
   */
  optimizeContext(context: string, level: ContextLevel): string {
    const levelBudget = TOKEN_BUDGET.levels[level];
    const estimatedTokens = PromptBuilder.estimateTokens(context);

    if (estimatedTokens <= levelBudget) {
      return context;
    }

    // 逐步裁剪内容
    let truncated = context;
    while (PromptBuilder.estimateTokens(truncated) > levelBudget * 0.9 && truncated.length > 100) {
      // 按比例裁剪
      const ratio = (levelBudget * 0.9) / PromptBuilder.estimateTokens(truncated);
      truncated = truncated.slice(0, Math.floor(truncated.length * ratio));
    }

    return truncated;
  }

  /**
   * 重置上下文使用统计
   */
  resetContextUsage(): void {
    this.contextHistory = [];
    this.currentTokenUsage = 0;
  }

  /**
   * 记录上下文使用
   */
  private recordContextUsage(level: ContextLevel, content: string, tokens: number): void {
    this.contextHistory.push({
      level,
      content,
      tokenCount: tokens,
      source: `Level ${level}`,
    });
    this.currentTokenUsage += tokens;
  }

  /**
   * 获取伏笔状态文本
   */
  private getForeshadowStatusText(status: string): string {
    const statusMap: Record<string, string> = {
      buried: '已埋设',
      hinted: '已暗示',
      foreshadowed: '已铺垫',
      resolved: '已揭示',
    };
    return statusMap[status] || status;
  }

  /**
   * 获取上下文历史
   */
  getContextHistory(): ContextInfo[] {
    return [...this.contextHistory];
  }
}

/**
 * 创建上下文管理器实例
 */
export function createContextManager(config?: Partial<WritingConfig>): ContextManager {
  return new ContextManager(config);
}

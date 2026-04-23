import type { ProviderType } from '@/config/ai-providers';
import type { Project, Character, Foreshadow } from '@/types/project';
import { useSettingsStore } from '@/stores/settings.store';

/**
 * 项目上下文信息，用于构建 AI 提示词
 */
export interface ProjectContext {
  /** 当前项目 */
  project: Project;
  /** 当前章节 ID */
  currentChapterId: string;
  /** 当前章节内容 */
  currentChapterContent: string;
  /** 当前章节前后的章节内容摘要 */
  adjacentChaptersSummary?: {
    previousChapterTitle?: string;
    previousChapterSummary?: string;
    nextChapterTitle?: string;
    nextChapterSummary?: string;
  };
  /** 当前场景中出现的角色列表 */
  charactersInScene?: Character[];
  /** 当前章节的伏笔 */
  relatedForeshadows?: Foreshadow[];
  /** 用户的自定义提示词 */
  customPrompt?: string;
}

/**
 * AI 建议类型
 */
export interface AISuggestion {
  id: string;
  type: 'characterConsistency' | 'foreshadowReminder' | 'paceSuggestion' | 'logicGap' | 'styleConsistency';
  severity: 'info' | 'warning' | 'error';
  title: string;
  description: string;
  position?: {
    startLine: number;
    endLine: number;
    suggestion: string;
  };
}

/**
 * AI 续写/润色结果
 */
export interface AIWriteResult {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  reasoning?: string;
}

/**
 * AI 服务基类
 */
export abstract class BaseAIService {
  abstract readonly provider: ProviderType;
  abstract readonly defaultModel: string;

  protected apiKey: string;
  protected baseUrl: string;
  protected model: string;

  constructor(apiKey: string, baseUrl: string, model?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model || this.defaultModel;
  }

  /**
   * 测试连接是否可用
   */
  abstract testConnection(): Promise<{ success: boolean; models?: string[]; error?: string }>;

  /**
   * 续写内容
   * @param context 项目上下文
   * @param mode 续写模式
   */
  abstract continueWriting(
    context: ProjectContext,
    mode: 'smartContinue' | 'polish'
  ): Promise<AIWriteResult>;

  /**
   * 润色优化
   * @param context 项目上下文
   * @param selectedText 可选的选中文本
   */
  abstract polishText(
    context: ProjectContext,
    selectedText?: string
  ): Promise<AIWriteResult>;

  /**
   * 分析章节并提供建议
   * @param context 项目上下文
   */
  abstract analyzeChapter(context: ProjectContext): Promise<AISuggestion[]>;

  /**
   * 获取当前章节的记忆上下文
   * @param context 项目上下文
   */
  abstract getMemoryContext(context: ProjectContext): Promise<{
    charactersInScene: Character[];
    location: string;
    time: string;
    mood: string;
  }>;

  /**
   * 流式续写（支持流式输出）
   */
  continueWritingStream?(
    context: ProjectContext,
    mode: 'smartContinue' | 'polish',
    onChunk: (text: string) => void,
    onComplete: () => void,
    onError: (error: string) => void
  ): void;

  /**
   * 流式润色
   */
  polishTextStream?(
    context: ProjectContext,
    selectedText: string | undefined,
    onChunk: (text: string) => void,
    onComplete: () => void,
    onError: (error: string) => void
  ): void;
}

/**
 * 提示词构建工具
 */
export class PromptBuilder {
  /**
   * 构建系统提示词
   */
  static buildSystemPrompt(language: string = 'zh-CN'): string {
    const languageMap: Record<string, string> = {
      'zh-CN': '中文',
      'en-US': '英文',
    };
    const lang = languageMap[language] || '中文';

    return `你是一位专业的${lang}小说作家，拥有丰富的创作经验。你的任务是帮助用户续写和润色小说内容。

## 创作原则
1. 保持与原文一致的文风、语气和叙事节奏
2. 深入理解人物性格，确保人物行为符合角色设定
3. 注重情节的合理性和逻辑性
4. 善用细节描写来增强画面感
5. 避免使用重复的表达和俗套的桥段
6. 伏笔和悬念的处理要自然，不要过于刻意

## 续写要求
1. 仔细阅读用户提供的上下文，理解当前情节走向
2. 续写内容要与前文自然衔接，承上启下
3. 保持合理的篇幅，一般 200-500 字为宜
4. 可以添加适当的环境描写、人物对话和心理活动
5. 结尾要有吸引力，为下一段情节做好铺垫

## 润色要求
1. 改善句子的流畅度和可读性
2. 消除语法错误和表达不当
3. 丰富修辞手法，增强文字感染力
4. 保持原文的风格和意图

## 输出格式
请直接输出续写/润色后的内容，不要添加任何前缀说明（如"以下是续写内容："等）。`;
  }

  /**
   * 构建续写提示词
   */
  static buildContinuePrompt(
    context: ProjectContext,
    mode: 'smartContinue' | 'polish'
  ): { systemPrompt: string; userPrompt: string } {
    const { project, currentChapterContent, customPrompt } = context;

    // 构建角色信息
    const charactersInfo = this.buildCharactersInfo(project.characters);

    // 构建世界观信息
    const worldInfo = this.buildWorldInfo(project.worldSchema);

    // 构建伏笔信息
    const foreshadowInfo = this.buildForeshadowInfo(project.foreshadows);

    // 构建用户提示词
    const modeInstruction = mode === 'smartContinue'
      ? '请根据以下上下文续写故事内容。续写要自然流畅，承上启下。'
      : '请润色优化以下内容，改善文笔和表达。';

    let userPrompt = `# 当前作品信息
作品名称：${project.name}
类型标签：${project.genre.map(g => g.name).join('、')}

# 作品设定
${worldInfo}

# 角色设定
${charactersInfo}

# 伏笔设定
${foreshadowInfo}

# 当前章节内容（请续写/润色这部分内容）
${currentChapterContent || '(当前章节为空)'}`

    if (customPrompt) {
      userPrompt += `\n\n# 用户补充要求
${customPrompt}`;
    }

    userPrompt += `\n\n# 要求
${modeInstruction}`;

    return {
      systemPrompt: this.buildSystemPrompt(getContentLanguage()),
      userPrompt,
    };
  }

  /**
   * 构建分析章节的提示词
   */
  static buildAnalysisPrompt(context: ProjectContext): { systemPrompt: string; userPrompt: string } {
    const { project, currentChapterContent } = context;

    const systemPrompt = `你是一位专业的小说编辑，擅长分析文本中的问题并提供改进建议。

## 分析维度
1. **人物一致性**：检查角色行为是否符合其性格设定
2. **伏笔回收**：检查已埋设的伏笔是否有暗示或可以推进
3. **节奏把控**：分析情节推进是否合理，是否需要调整
4. **逻辑漏洞**：检查情节是否有前后矛盾或不合理之处
5. **风格统一**：检查文风是否前后一致

## 输出格式
请以 JSON 格式输出分析结果：
{
  "suggestions": [
    {
      "type": "characterConsistency" | "foreshadowReminder" | "paceSuggestion" | "logicGap" | "styleConsistency",
      "severity": "info" | "warning" | "error",
      "title": "建议标题",
      "description": "具体描述",
      "position": {
        "startLine": 10,
        "endLine": 15,
        "suggestion": "如果可以定位，提供修改建议"
      }
    }
  ]
}`;

    const userPrompt = `# 当前作品信息
作品名称：${project.name}

# 当前章节内容
${currentChapterContent || '(当前章节为空)'}`

    return { systemPrompt, userPrompt };
  }

  /**
   * 构建记忆上下文提取的提示词
   */
  static buildMemoryContextPrompt(context: ProjectContext): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `你是一位专业的叙事分析师，擅长从文本中提取关键场景信息。

## 提取维度
1. **出场角色**：当前场景中出现的角色列表
2. **地点**：当前场景发生的地点
3. **时间**：当前场景发生的时间
4. **氛围/情绪**：当前场景的整体氛围

## 输出格式
请以 JSON 格式输出场景信息：
{
  "charactersInScene": ["角色名1", "角色名2"],
  "location": "地点描述",
  "time": "时间描述",
  "mood": "氛围描述"
}`;

    const userPrompt = `# 当前作品角色
${context.project.characters.map(c => `${c.name}：${c.profile.background || '暂无描述'}`).join('\n')}

# 当前章节内容
${context.currentChapterContent || '(当前章节为空)'}`

    return { systemPrompt, userPrompt };
  }

  private static buildCharactersInfo(characters: Character[]): string {
    if (!characters || characters.length === 0) {
      return '（暂无角色设定）';
    }

    return characters
      .slice(0, 10) // 限制角色数量
      .map(c => {
        let info = `【${c.name}】`;
        if (c.profile.personality && c.profile.personality.length > 0) {
          info += `性格特点：${c.profile.personality.join('、')}`;
        }
        if (c.profile.background) {
          info += ` | 背景：${c.profile.background}`;
        }
        if (c.profile.appearance) {
          info += ` | 外貌：${c.profile.appearance}`;
        }
        return info;
      })
      .join('\n');
  }

  private static buildWorldInfo(worldSchema: Project['worldSchema']): string {
    if (!worldSchema) {
      return '（暂无世界观设定）';
    }

    let info = '';

    if (worldSchema.locations && worldSchema.locations.length > 0) {
      info += '## 地点\n';
      info += worldSchema.locations
        .slice(0, 5)
        .map(l => `- ${l.name}：${l.description || '暂无描述'}`)
        .join('\n');
      info += '\n';
    }

    if (worldSchema.rules && worldSchema.rules.length > 0) {
      info += '## 世界规则\n';
      info += worldSchema.rules
        .filter(r => !r.locked)
        .slice(0, 5)
        .map(r => `- ${r.name}：${r.description}`)
        .join('\n');
      info += '\n';
    }

    if (worldSchema.factions && worldSchema.factions.length > 0) {
      info += '## 势力\n';
      info += worldSchema.factions
        .slice(0, 5)
        .map(f => `- ${f.name}：${f.description || '暂无描述'}`)
        .join('\n');
      info += '\n';
    }

    return info || '（暂无详细世界观设定）';
  }

  private static buildForeshadowInfo(foreshadows: Foreshadow[]): string {
    if (!foreshadows || foreshadows.length === 0) {
      return '（暂无伏笔设定）';
    }

    return foreshadows
      .filter(f => f.status !== 'resolved')
      .slice(0, 10)
      .map(f => {
        const statusMap: Record<string, string> = {
          buried: '已埋设',
          hinted: '已暗示',
          foreshadowed: '已铺垫',
        };
        return `- ${f.hint}（${statusMap[f.status] || f.status}）`;
      })
      .join('\n');
  }
}

/**
 * 获取内容语言设置
 */
function getContentLanguage(): string {
  try {
    // 在客户端代码中动态获取 settings store
    const settingsStore = useSettingsStore();
    return settingsStore.contentLanguage || 'zh-CN';
  } catch {
    return 'zh-CN';
  }
}

export type { AIWriteMode } from './types';

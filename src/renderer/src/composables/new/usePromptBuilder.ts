/**
 * Prompt 构建器
 * 基于 webnovel-writer-master 的 Prompt 工程系统
 * 
 * Prompt 构建器负责：
 * - 构建各种写作场景的 Prompt
 * - 优化 Prompt 结构
 * - 管理 Prompt 模板
 */

import { ref, computed } from 'vue';
import type { ChapterContract, MasterContract } from '@/types/contract';

// ============================================================
// 类型定义
// ============================================================

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  type: PromptType;
  template: string;
  variables: string[];
}

export type PromptType = 
  | 'chapter_writing'    // 章节写作
  | 'chapter_rewrite'    // 章节重写
  | 'outline_generation' // 大纲生成
  | 'character_profile'  // 角色塑造
  | 'world_setting'     // 世界观设定
  | 'hook_generation'    // 钩子生成
  | 'coolpoint_generation' // 爽点生成
  | 'quality_review'     // 质量审查
  | 'summary_generation'; // 摘要生成

export interface PromptConfig {
  // 温度设置
  temperature: number;
  // 最大 token
  maxTokens: number;
  // Top P
  topP: number;
  // 频率惩罚
  frequencyPenalty: number;
  // 存在惩罚
  presencePenalty: number;
}

export interface PromptContext {
  projectMeta?: {
    title: string;
    genre: string;
    targetWordCount: number;
  };
  coreSetting?: string;
  contractSummary?: string;
  chapterContext?: {
    number: number;
    title: string;
    cbn?: string;
    cpns?: string[];
    cen?: string;
  };
  memorySummary?: string;
  previousChapterSummary?: string;
  characterStates?: string;
  foreshadowSummary?: string;
  customContext?: Record<string, string>;
}

// ============================================================
// 模板定义
// ============================================================

const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'chapter-writing-v1',
    name: '章节写作模板 v1',
    description: '标准章节写作 Prompt',
    type: 'chapter_writing',
    template: `【角色】
你是一位专业的中文网络小说作家，擅长创作都市、玄幻、修仙等类型的小说。
你的文笔流畅生动，情节紧凑有张力，人物形象鲜明。

【项目信息】
标题：{{title}}
题材：{{genre}}
目标字数：{{targetWordCount}}字

【核心设定】
{{coreSetting}}

【合同约束】
{{contractSummary}}

【当前章节】
{{chapterContext}}

【近几章摘要】
{{memorySummary}}

【写作要求】
1. 字数控制在 {{minWords}}-{{maxWords}} 字之间
2. 保持与前文的自然衔接
3. 推进主线/感情线发展
4. 适时插入爽点元素
5. 章节结尾必须留下悬念

请开始写作：`,
    variables: [
      'title', 'genre', 'targetWordCount', 'coreSetting', 
      'contractSummary', 'chapterContext', 'memorySummary',
      'minWords', 'maxWords'
    ],
  },
  {
    id: 'chapter-rewrite-v1',
    name: '章节重写模板 v1',
    description: '基于质量反馈的章节重写',
    type: 'chapter_rewrite',
    template: `【角色】
你是一位专业的中文网络小说作家，擅长修改和优化小说内容。

【原文】
{{originalContent}}

【修改要求】
{{rewriteRequirements}}

【问题反馈】
{{qualityFeedback}}

【写作要求】
1. 保持原文的核心情节不变
2. 解决指出的问题
3. 提升整体质量
4. 保持章节长度适中

请进行修改：`,
    variables: ['originalContent', 'rewriteRequirements', 'qualityFeedback'],
  },
  {
    id: 'outline-generation-v1',
    name: '大纲生成模板 v1',
    description: '生成故事大纲',
    type: 'outline_generation',
    template: `【角色】
你是一位专业的小说大纲设计师，擅长创作引人入胜的故事结构。

【基本信息】
标题：{{title}}
题材：{{genres}}
目标字数：{{targetWordCount}}字

【核心元素】
{{elements}}

【期望的爽点类型】
{{coolPointTypes}}

【写作风格】
{{writingStyle}}

【输出要求】
请生成完整的四幕结构大纲，包括：
1. 故事核心理念
2. 四幕结构详细设计
3. 主要角色设定（至少3个）
4. 核心冲突设计
5. 伏笔规划（至少3个）
6. 章节概要（前30章）

输出格式请使用 JSON。`,
    variables: ['title', 'genres', 'targetWordCount', 'elements', 'coolPointTypes', 'writingStyle'],
  },
  {
    id: 'hook-generation-v1',
    name: '钩子生成模板 v1',
    description: '生成章节钩子',
    type: 'hook_generation',
    template: `【角色】
你是一位专业的悬念设计专家，擅长创作引人入胜的故事钩子。

【题材】
{{genre}}

【当前情境】
{{currentSituation}}

【钩子类型偏好】
{{preferredHookTypes}}

【生成要求】
请生成 {{count}} 个适合当前情境的钩子，要求：
1. 类型多样
2. 悬念感强
3. 与情境契合

输出格式：
类型：xxx
描述：xxx
悬念点：xxx`,
    variables: ['genre', 'currentSituation', 'preferredHookTypes', 'count'],
  },
  {
    id: 'summary-generation-v1',
    name: '摘要生成模板 v1',
    description: '生成章节摘要',
    type: 'summary_generation',
    template: `【角色】
你是一位专业的小说编辑，擅长提炼章节要点。

【章节内容】
{{chapterContent}}

【要求】
请生成一段简洁的章节摘要（100-200字），包含：
1. 本章主要事件
2. 关键转折
3. 伏笔/悬念

摘要：`,
    variables: ['chapterContent'],
  },
];

// ============================================================
// Composable 定义
// ============================================================

export function usePromptBuilder() {
  // 配置
  const config = ref<PromptConfig>({
    temperature: 0.7,
    maxTokens: 4000,
    topP: 0.9,
    frequencyPenalty: 0.0,
    presencePenalty: 0.0,
  });

  // 状态
  const templates = ref<PromptTemplate[]>([...PROMPT_TEMPLATES]);
  const lastBuiltPrompt = ref<string | null>(null);

  // ============================================================
  // 模板管理
  // ============================================================

  /**
   * 获取模板
   */
  function getTemplate(id: string): PromptTemplate | undefined {
    return templates.value.find(t => t.id === id);
  }

  /**
   * 获取指定类型的模板
   */
  function getTemplatesByType(type: PromptType): PromptTemplate[] {
    return templates.value.filter(t => t.type === type);
  }

  /**
   * 添加模板
   */
  function addTemplate(template: Omit<PromptTemplate, 'id'>): PromptTemplate {
    const newTemplate: PromptTemplate = {
      ...template,
      id: `custom-${Date.now()}`,
    };
    templates.value.push(newTemplate);
    return newTemplate;
  }

  /**
   * 删除模板
   */
  function removeTemplate(id: string): void {
    const index = templates.value.findIndex(t => t.id === id);
    if (index >= 0) {
      templates.value.splice(index, 1);
    }
  }

  // ============================================================
  // Prompt 构建
  // ============================================================

  /**
   * 构建章节写作 Prompt
   */
  function buildChapterWritingPrompt(context: PromptContext & {
    minWords?: number;
    maxWords?: number;
  }): string {
    const template = getTemplate('chapter-writing-v1') || PROMPT_TEMPLATES[0];
    
    const variables: Record<string, string> = {
      title: context.projectMeta?.title || '未命名',
      genre: context.projectMeta?.genre || '都市',
      targetWordCount: String(context.projectMeta?.targetWordCount || 300000),
      coreSetting: context.coreSetting || '无',
      contractSummary: context.contractSummary || '无',
      chapterContext: buildChapterContext(context.chapterContext),
      memorySummary: context.memorySummary || '无',
      minWords: String(context.minWords || 2000),
      maxWords: String(context.maxWords || 5000),
    };

    const prompt = replaceVariables(template.template, variables);
    lastBuiltPrompt.value = prompt;
    return prompt;
  }

  /**
   * 构建章节重写 Prompt
   */
  function buildChapterRewritePrompt(params: {
    originalContent: string;
    rewriteRequirements: string;
    qualityFeedback: string;
  }): string {
    const template = getTemplate('chapter-rewrite-v1') || PROMPT_TEMPLATES[1];
    
    const variables: Record<string, string> = {
      originalContent: params.originalContent,
      rewriteRequirements: params.rewriteRequirements,
      qualityFeedback: params.qualityFeedback,
    };

    const prompt = replaceVariables(template.template, variables);
    lastBuiltPrompt.value = prompt;
    return prompt;
  }

  /**
   * 构建大纲生成 Prompt
   */
  function buildOutlineGenerationPrompt(params: {
    title: string;
    genres: string[];
    targetWordCount: number;
    elements: string[];
    coolPointTypes?: string[];
    writingStyle?: string;
  }): string {
    const template = getTemplate('outline-generation-v1') || PROMPT_TEMPLATES[2];
    
    const variables: Record<string, string> = {
      title: params.title,
      genres: params.genres.join('、'),
      targetWordCount: String(params.targetWordCount),
      elements: params.elements.join('\n- '),
      coolPointTypes: params.coolPointTypes?.join('、') || '打脸、装逼、成长',
      writingStyle: params.writingStyle || '简洁有力，画面感强',
    };

    const prompt = replaceVariables(template.template, variables);
    lastBuiltPrompt.value = prompt;
    return prompt;
  }

  /**
   * 构建钩子生成 Prompt
   */
  function buildHookGenerationPrompt(params: {
    genre: string;
    currentSituation: string;
    preferredHookTypes?: string[];
    count?: number;
  }): string {
    const template = getTemplate('hook-generation-v1') || PROMPT_TEMPLATES[3];
    
    const variables: Record<string, string> = {
      genre: params.genre,
      currentSituation: params.currentSituation,
      preferredHookTypes: params.preferredHookTypes?.join('、') || '悬念、反转',
      count: String(params.count || 3),
    };

    const prompt = replaceVariables(template.template, variables);
    lastBuiltPrompt.value = prompt;
    return prompt;
  }

  /**
   * 构建摘要生成 Prompt
   */
  function buildSummaryGenerationPrompt(chapterContent: string): string {
    const template = getTemplate('summary-generation-v1') || PROMPT_TEMPLATES[4];
    
    const variables: Record<string, string> = {
      chapterContent,
    };

    const prompt = replaceVariables(template.template, variables);
    lastBuiltPrompt.value = prompt;
    return prompt;
  }

  /**
   * 构建自定义 Prompt
   */
  function buildCustomPrompt(
    templateStr: string,
    variables: Record<string, string>
  ): string {
    const prompt = replaceVariables(templateStr, variables);
    lastBuiltPrompt.value = prompt;
    return prompt;
  }

  // ============================================================
  // 辅助函数
  // ============================================================

  /**
   * 替换变量
   */
  function replaceVariables(template: string, variables: Record<string, string>): string {
    let result = template;
    
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    return result;
  }

  /**
   * 构建章节上下文
   */
  function buildChapterContext(chapterContext?: PromptContext['chapterContext']): string {
    if (!chapterContext) return '无';

    const lines: string[] = [];
    lines.push(`章节号：第${chapterContext.number}章`);
    lines.push(`标题：${chapterContext.title}`);

    if (chapterContext.cbn) {
      lines.push(`\n起始情境：${chapterContext.cbn}`);
    }

    if (chapterContext.cpns && chapterContext.cpns.length > 0) {
      lines.push('\n推进节点：');
      chapterContext.cpns.forEach((cpn, i) => {
        lines.push(`${i + 1}. ${cpn}`);
      });
    }

    if (chapterContext.cen) {
      lines.push(`\n结尾要求：${chapterContext.cen}`);
    }

    return lines.join('\n');
  }

  /**
   * 优化 Prompt
   */
  function optimizePrompt(prompt: string): string {
    let optimized = prompt;

    // 移除多余的空行
    optimized = optimized.replace(/\n{3,}/g, '\n\n');

    // 规范化空格
    optimized = optimized.replace(/[ \t]+/g, ' ');

    // 移除未填充的变量
    optimized = optimized.replace(/\{\{[^}]+\}\}/g, '');

    return optimized.trim();
  }

  /**
   * 估算 token 数量
   */
  function estimateTokens(text: string): number {
    // 粗略估计：1 token ≈ 2 字符
    return Math.ceil(text.length / 2);
  }

  // ============================================================
  // 配置
  // ============================================================

  /**
   * 更新配置
   */
  function updateConfig(updates: Partial<PromptConfig>): void {
    config.value = { ...config.value, ...updates };
  }

  // ============================================================
  // 返回
  // ============================================================

  return {
    // 配置
    config,
    updateConfig,

    // 状态
    templates,
    lastBuiltPrompt,

    // 模板管理
    getTemplate,
    getTemplatesByType,
    addTemplate,
    removeTemplate,

    // Prompt 构建
    buildChapterWritingPrompt,
    buildChapterRewritePrompt,
    buildOutlineGenerationPrompt,
    buildHookGenerationPrompt,
    buildSummaryGenerationPrompt,
    buildCustomPrompt,

    // 工具
    optimizePrompt,
    estimateTokens,
  };
}

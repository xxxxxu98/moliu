/**
 * Quick Outline Generator
 * Enhanced outline generator with genre templates and knowledge base
 */

import { AIClient, type Message } from 'multi-ai-sdk';
import { getSDKProvider, type ProviderType } from '@/config/ai-providers';
import { OutlineSchema, type Outline } from '../schemas/outline.schema';
import { contractValidator } from '../contract';
import { csvKnowledgeBase, getGenreTemplate, buildGenreSpecificPrompt } from '../knowledge';
import { buildQuickOutlinePrompt } from '../prompts';
import { extractPureText, generateId } from '../utils';
import type { GenerationResult, GenerationStrategy } from '../types';

/**
 * 快速生成选项
 */
export interface QuickGenerateOptions {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  wordCountRange?: string;
  genre?: string;
  generateCount?: number;
  maxRetries?: number;
}

/**
 * 快速大纲生成器
 */
export class QuickOutlineGenerator {
  private client: AIClient | null = null;
  private provider: ProviderType;
  private model: string;
  private baseUrl: string;
  private apiKey: string;
  
  constructor(
    provider: ProviderType,
    apiKey: string,
    baseUrl?: string,
    model?: string,
  ) {
    this.provider = provider;
    this.model = model || '';
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || '';
    this.initClient();
  }
  
  private initClient() {
    const sdkProvider = getSDKProvider(this.provider);
    
    const config: any = {
      provider: sdkProvider,
      contextWindowSafe: true,
    };
    
    if (sdkProvider !== 'ollama' && this.apiKey) {
      config.apiKey = this.apiKey;
    }
    
    if (this.model) {
      config.model = this.model;
    }
    
    this.client = new AIClient(config);
    
    if (this.client && this.baseUrl) {
      this.client.adapter.baseUrl = this.baseUrl.replace(/\/$/, '');
    }
  }
  
  /**
   * 生成大纲
   */
  async generate(
    prompt: string,
    options: QuickGenerateOptions = {},
    onProgress?: (message: string) => void,
  ): Promise<GenerationResult<Outline[]>> {
    const {
      temperature = 0.7,
      topP = 0.9,
      maxTokens = 8192,
      wordCountRange = '50万-100万字',
      genre,
      generateCount = 3,
      maxRetries = 2,
    } = options;
    
    const warnings: string[] = [];
    const errors: string[] = [];
    
    try {
      // 1. 加载知识库
      await csvKnowledgeBase.loadAll();
      
      // 2. 获取题材模板
      const template = genre ? getGenreTemplate(genre) : undefined;
      if (template) {
        warnings.push(`使用题材模板：${template.name}`);
      }
      
      // 3. 构建提示词
      const { system, user } = buildQuickOutlinePrompt({
        seed: prompt,
        genre,
        wordCountRange,
        template,
        generateCount,
      });
      
      // 4. 尝试 JSON Mode 生成
      onProgress?.('正在生成大纲...');
      const jsonResult = await this.tryJSONMode(system, user, {
        temperature,
        topP,
        maxTokens,
      });
      
      if (jsonResult.success && jsonResult.data) {
        // 5. 验证大纲
        const validation = this.validateOutlines(jsonResult.data);
        
        if (validation.valid) {
          return {
            success: true,
            data: validation.outlines,
            warnings: [...warnings, ...validation.warnings],
            errors: [],
            strategy: 'json-mode',
          };
        }
        
        warnings.push(...validation.warnings);
      }
      
      // 6. 尝试 Markdown 模式
      onProgress?.('JSON Mode 失败，尝试 Markdown 模式...');
      const markdownResult = await this.tryMarkdownMode(system, user, {
        temperature,
        topP,
        maxTokens,
      });
      
      if (markdownResult.success && markdownResult.data) {
        return {
          success: true,
          data: markdownResult.data,
          warnings: [...warnings, ...markdownResult.warnings],
          errors: [],
          strategy: markdownResult.strategy as GenerationStrategy,
        };
      }
      
      // 7. 尝试备用策略
      warnings.push(...(markdownResult.warnings || []));
      
      if (maxRetries > 0) {
        onProgress?.('重试生成...');
        return this.generate(prompt, { ...options, maxRetries: maxRetries - 1 }, onProgress);
      }
      
      return {
        success: false,
        data: undefined,
        warnings,
        errors: ['所有生成策略均失败'],
        strategy: 'json-mode',
      };
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        data: undefined,
        warnings,
        errors: [`生成失败: ${errorMsg}`],
        strategy: 'json-mode',
      };
    }
  }
  
  /**
   * 流式生成
   */
  async *generateStream(
    prompt: string,
    options: QuickGenerateOptions = {},
  ): AsyncGenerator<{ chunk: string; fullContent: string; outlines?: Outline[] }> {
    const {
      temperature = 0.7,
      topP = 0.9,
      maxTokens = 8192,
      wordCountRange = '50万-100万字',
      genre,
      generateCount = 3,
    } = options;
    
    const { system, user } = buildQuickOutlinePrompt({
      seed: prompt,
      genre,
      wordCountRange,
      generateCount,
    });
    
    const messages: Message[] = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
    
    let fullContent = '';
    
    try {
      const stream = this.client!.stream(messages, {
        maxTokens,
        temperature,
        topP,
      } as any);
      
      for await (const chunk of stream) {
        if (chunk.content) {
          fullContent += chunk.content;
          yield { chunk: chunk.content, fullContent };
        }
        if (chunk.done) {
          break;
        }
      }
      
      // 解析大纲
      const parsed = this.parseContent(fullContent);
      if (parsed.success && parsed.outlines) {
        yield { chunk: '', fullContent, outlines: parsed.outlines };
      }
      
    } catch (error) {
      console.error('[QuickOutlineGenerator] Stream error:', error);
    }
  }
  
  /**
   * JSON Mode 尝试
   */
  private async tryJSONMode(
    system: string,
    user: string,
    params: { temperature: number; topP: number; maxTokens: number },
  ): Promise<GenerationResult<Outline[]>> {
    try {
      const messages: Message[] = [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ];
      
      const response = await this.client!.chat(messages, {
        maxTokens: params.maxTokens,
        temperature: params.temperature,
        topP: params.topP,
        response_format: { type: 'json_object' },
      } as any);
      
      const content = extractPureText(
        typeof response === 'string' ? response : JSON.stringify(response),
      );
      
      const parsed = this.parseContent(content);
      
      if (parsed.success && parsed.outlines) {
        return {
          success: true,
          data: parsed.outlines,
          warnings: [],
          errors: [],
          strategy: 'json-mode',
        };
      }
      
      return {
        success: false,
        data: undefined,
        warnings: parsed.warnings,
        errors: parsed.errors,
        strategy: 'json-mode',
      };
      
    } catch (error) {
      return {
        success: false,
        data: undefined,
        warnings: [],
        errors: [`JSON Mode 失败: ${error instanceof Error ? error.message : String(error)}`],
        strategy: 'json-mode',
      };
    }
  }
  
  /**
   * Markdown 模式尝试
   */
  private async tryMarkdownMode(
    system: string,
    user: string,
    params: { temperature: number; topP: number; maxTokens: number },
  ): Promise<GenerationResult<Outline[]> & { strategy?: GenerationStrategy }> {
    try {
      // 移除 JSON 格式要求的修改版系统提示词
      const markdownSystem = system.replace(
        /- 输出纯JSON格式.*?\n/,
        '- 使用 Markdown 格式输出大纲\n',
      ).replace(
        /- 不要输出任何其他内容/,
        '',
      );
      
      const messages: Message[] = [
        { role: 'system', content: markdownSystem },
        { role: 'user', content: user },
      ];
      
      const response = await this.client!.chat(messages, {
        maxTokens: params.maxTokens,
        temperature: params.temperature,
        topP: params.topP,
      } as any);
      
      const content = extractPureText(
        typeof response === 'string' ? response : JSON.stringify(response),
      );
      
      // 尝试提取 JSON
      const parsed = this.extractAndParseJSON(content);
      
      if (parsed.success && parsed.outlines) {
        return {
          success: true,
          data: parsed.outlines,
          warnings: [],
          errors: [],
          strategy: 'markdown-regex',
        };
      }
      
      // 尝试从 Markdown 解析
      const markdownParsed = this.parseMarkdownOutline(content);
      
      if (markdownParsed.success && markdownParsed.outlines) {
        return {
          success: true,
          data: markdownParsed.outlines,
          warnings: markdownParsed.warnings,
          errors: [],
          strategy: 'markdown-remark',
        };
      }
      
      return {
        success: false,
        data: undefined,
        warnings: [...(parsed.warnings || []), ...(markdownParsed.warnings || [])],
        errors: [...(parsed.errors || []), ...(markdownParsed.errors || [])],
        strategy: 'markdown-remark',
      };
      
    } catch (error) {
      return {
        success: false,
        data: undefined,
        warnings: [],
        errors: [`Markdown 模式失败: ${error instanceof Error ? error.message : String(error)}`],
        strategy: 'markdown-regex',
      };
    }
  }
  
  /**
   * 解析内容
   */
  private parseContent(content: string): GenerationResult<Outline[]> {
    const warnings: string[] = [];
    const errors: string[] = [];
    
    try {
      // 尝试提取 JSON
      const extracted = this.extractAndParseJSON(content);
      
      if (extracted.success && extracted.outlines) {
        return {
          success: true,
          data: extracted.outlines,
          warnings,
          errors: [],
          strategy: 'json-mode',
        };
      }
      
      warnings.push(...(extracted.warnings || []));
      errors.push(...(extracted.errors || []));
      
      return {
        success: false,
        data: undefined,
        warnings,
        errors,
        strategy: 'json-mode',
      };
      
    } catch (error) {
      return {
        success: false,
        data: undefined,
        warnings,
        errors: [`解析失败: ${error instanceof Error ? error.message : String(error)}`],
        strategy: 'json-mode',
      };
    }
  }
  
  /**
   * 提取并解析 JSON
   */
  private extractAndParseJSON(content: string): GenerationResult<Outline[]> {
    const warnings: string[] = [];
    const errors: string[] = [];
    
    try {
      // 尝试直接解析
      let jsonStr = content.trim();
      
      // 移除 markdown 代码块
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      
      // 移除引号包裹
      if (jsonStr.startsWith('"') && jsonStr.endsWith('"')) {
        jsonStr = jsonStr.slice(1, -1).replace(/\\"/g, '"');
      }
      
      // 尝试解析
      const parsed = JSON.parse(jsonStr);
      let outlines: any[] = [];
      
      if (Array.isArray(parsed)) {
        outlines = parsed;
      } else if (parsed.outlines) {
        outlines = parsed.outlines;
      } else if (parsed.data) {
        outlines = parsed.data;
      } else {
        outlines = [parsed];
      }
      
      // 添加 ID 和验证
      const validatedOutlines: Outline[] = [];
      
      for (const outline of outlines) {
        try {
          const validated = OutlineSchema.parse({
            ...outline,
            id: outline.id || generateId('outline'),
          });
          validatedOutlines.push(validated);
        } catch (e) {
          warnings.push(`大纲验证失败: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      
      if (validatedOutlines.length > 0) {
        return {
          success: true,
          data: validatedOutlines,
          warnings,
          errors: [],
          strategy: 'json-mode',
        };
      }
      
      return {
        success: false,
        data: undefined,
        warnings,
        errors: ['没有有效的大纲数据'],
        strategy: 'json-mode',
      };
      
    } catch (error) {
      return {
        success: false,
        data: undefined,
        warnings,
        errors: [`JSON 解析失败: ${error instanceof Error ? error.message : String(error)}`],
        strategy: 'json-mode',
      };
    }
  }
  
  /**
   * 解析 Markdown 大纲
   */
  private parseMarkdownOutline(content: string): GenerationResult<Outline[]> {
    const warnings: string[] = [];
    const errors: string[] = [];
    
    const outlines: Outline[] = [];
    
    // 简单按 # 分割大纲
    const sections = content.split(/(?=^#{1,3} )/m);
    
    for (const section of sections) {
      if (!section.trim()) continue;
      
      try {
        const outline = this.parseMarkdownSection(section);
        if (outline) {
          outlines.push(outline);
        }
      } catch (e) {
        warnings.push(`解析章节失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    
    if (outlines.length > 0) {
      return {
        success: true,
        data: outlines,
        warnings,
        errors: [],
        strategy: 'markdown-remark',
      };
    }
    
    return {
      success: false,
      data: undefined,
      warnings,
      errors: ['无法从 Markdown 解析大纲'],
      strategy: 'markdown-remark',
    };
  }
  
  /**
   * 解析单个 Markdown 章节
   */
  private parseMarkdownSection(section: string): Outline | null {
    const lines = section.trim().split('\n');
    
    if (lines.length < 3) return null;
    
    const outline: Partial<Outline> = {
      id: generateId('outline'),
      chapters: [],
      characters: [],
      foreshadows: [],
    };
    
    let currentSection = '';
    let currentContent: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('# ')) {
        outline.title = trimmed.slice(2).trim();
      } else if (trimmed.startsWith('## ')) {
        currentSection = trimmed.slice(3).trim().toLowerCase();
        currentContent = [];
      } else if (trimmed.startsWith('### ')) {
        // 子章节，暂不处理
      } else if (trimmed.startsWith('- ')) {
        currentContent.push(trimmed.slice(2).trim());
      } else if (trimmed && currentSection) {
        currentContent.push(trimmed);
      }
    }
    
    if (!outline.title) {
      outline.title = '未命名大纲';
    }
    
    outline.synopsis = currentContent.join(' ').slice(0, 200);
    
    return outline as Outline;
  }
  
  /**
   * 验证大纲
   */
  private validateOutlines(outlines: Outline[]): { valid: boolean; outlines: Outline[]; warnings: string[] } {
    const warnings: string[] = [];
    const validated: Outline[] = [];
    
    for (const outline of outlines) {
      const result = contractValidator.validateOutline(outline);
      
      if (result.isValid) {
        validated.push(outline);
      } else {
        warnings.push(...result.violations.map(v => v.description));
        
        // 如果有警告但没有阻塞错误，仍然接受
        const blockingViolations = result.violations.filter(v => v.severity === 'blocking');
        if (blockingViolations.length === 0) {
          validated.push(outline);
        }
      }
    }
    
    return {
      valid: validated.length > 0,
      outlines: validated,
      warnings,
    };
  }
  
  /**
   * 更新配置
   */
  updateConfig(apiKey: string, baseUrl?: string, model?: string) {
    this.apiKey = apiKey;
    if (baseUrl) this.baseUrl = baseUrl;
    if (model) this.model = model;
    this.initClient();
  }
}

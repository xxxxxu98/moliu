/**
 * Markdown Outline Generator
 * Generates outlines in Markdown format for better model compatibility
 */

import { extractPureText } from '../utils';
import { AIClient, type Message } from 'multi-ai-sdk';
import { getSDKProvider, type ProviderType } from '@/config/ai-providers';

/**
 * 生成选项
 */
export interface MarkdownGenerateOptions {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  wordCountRange?: string;
}

/**
 * Markdown 生成器
 * 负责生成 Markdown 格式的大纲
 */
export class MarkdownOutlineGenerator {
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

    const config: {
      provider: any;
      apiKey?: string;
      baseUrl?: string;
      model?: string;
      maxTokens?: number;
      contextWindowSafe?: boolean;
    } = {
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
      (this.client as any).adapter.baseUrl = this.baseUrl.replace(/\/$/, '');
    }
  }

  /**
   * 生成 Markdown 大纲
   */
  async generate(
    prompt: string,
    options: MarkdownGenerateOptions = {},
    onProgress?: (message: string) => void,
  ): Promise<string> {
    const {
      temperature = 0.7,
      topP = 0.9,
      maxTokens = 8192,
      wordCountRange = '50万-100万字',
    } = options;

    const systemPrompt = this.buildSystemPrompt(wordCountRange);
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `用户的创意种子：${prompt}` },
    ];

    onProgress?.('正在生成大纲...');

    try {
      const response = await this.client!.chat(messages, {
        maxTokens,
        temperature,
        topP,
      } as any);

      const rawContent = extractPureText(
        typeof response === 'string' ? response : JSON.stringify(response),
      );

      onProgress?.('大纲生成完成，正在解析...');
      return rawContent;
    } catch (error) {
      console.error('[MarkdownOutlineGenerator] Generation failed:', error);
      throw error;
    }
  }

  /**
   * 流式生成 Markdown 大纲
   */
  async *generateStream(
    prompt: string,
    options: MarkdownGenerateOptions = {},
  ): AsyncGenerator<{ chunk: string; fullContent: string }> {
    const {
      temperature = 0.7,
      topP = 0.9,
      maxTokens = 8192,
      wordCountRange = '50万-100万字',
    } = options;

    const systemPrompt = this.buildSystemPrompt(wordCountRange);
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `用户的创意种子：${prompt}` },
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
    } catch (error) {
      console.error('[MarkdownOutlineGenerator] Stream generation failed:', error);
      throw error;
    }
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(wordCountRange: string): string {
    return `你是一位专业的小说创作顾问。根据用户的创意种子，生成结构清晰的故事大纲。

请严格按照以下 Markdown 格式输出大纲，使用标准 Markdown 语法：

# 标题
[故事标题]

## 简介
[60-80字的核心冲突和主题]

## 题材标签
- 标签1
- 标签2

## 字数预估
${wordCountRange}

## 四幕结构
### 第一幕：建置
[40-60字，介绍主角和世界观]

### 第二幕A：对抗（上）
[40-60字，主角遭遇冲突]

### 第二幕B：对抗（下）
[40-60字，冲突升级]

### 第三幕：结局
[40-60字，问题解决]

## 世界观设定
### 地点
- [地点名]：[描述15-30字]

### 势力
- [势力名]：[描述20字]

### 规则/力量体系
- [规则名]：[描述20字]

## 角色
### 角色名（主角/反派/导师等）
[20-40字的角色描述，包括身份和核心特质]

## 章节大纲
### 第1章：章节标题
[一句话概括本章内容]

### 第2章：章节标题
[一句话概括本章内容]

[继续列出5-8章]

## 伏笔
- [伏笔1]
- [伏笔2]

## 子情节（如有）
- [子情节1]

【要求】
- 语言简洁，避免冗长描写
- 严格遵循上述 Markdown 格式
- 章节标题格式统一为"第X章：标题"
- 每个部分都要有实质内容
- 章节数控制在5-8章`;
  }

  /**
   * 更新配置
   */
  updateConfig(
    apiKey: string,
    baseUrl?: string,
    model?: string,
  ) {
    this.apiKey = apiKey;
    if (baseUrl) this.baseUrl = baseUrl;
    if (model) this.model = model;
    this.initClient();
  }

  /**
   * 获取端点
   */
  getEndpoint(): string {
    return this.baseUrl;
  }

  /**
   * 获取请求头
   */
  getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }
}

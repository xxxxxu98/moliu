/**
 * AI Provider Service
 * 使用 multi-ai-sdk 统一处理 AI API 调用
 */

import {
  AIClient,
  type ProviderName,
} from 'multi-ai-sdk';
import { getDefaultModels, getDefaultBaseUrl } from './ai-client';

// Re-export from ai-client for convenience
export { getDefaultModels, getDefaultBaseUrl };

// 支持的提供商类型（与 multi-ai-sdk 保持一致）
export type AIProviderType = 'openai' | 'anthropic' | 'gemini' | 'moonshot' | 'deepseek' | 'ollama' | 'groq' | 'qwen' | 'mistral' | 'cohere' | 'nvidia' | 'perplexity' | 'together' | 'cerebras' | 'azure' | 'grok' | 'fireworks' | 'zhipu';

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface TestResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  models?: string[];
  responseTime?: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
}

/**
 * Get the effective base URL for a provider
 */
export function getBaseUrl(provider: string, customUrl?: string): string {
  return customUrl?.trim() || getDefaultBaseUrl(provider);
}

/**
 * 从原始响应中提取纯文本内容
 * 某些 SDK 可能返回原始 SSE 行而不是纯文本，需要统一处理
 */
function extractPureText(rawContent: string): string {
  // 检测是否包含 SSE JSON 格式
  if (rawContent.includes('"object":"chat.completion.chunk"') || 
      (rawContent.includes('"choices"') && rawContent.includes('"delta"'))) {
    const texts: string[] = [];
    const lines = rawContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        const jsonStr = trimmed.slice(6);
        if (jsonStr && jsonStr !== '[DONE]') {
          try {
            const obj = JSON.parse(jsonStr);
            if (obj.choices?.[0]?.delta?.content) {
              texts.push(obj.choices[0].delta.content);
            }
          } catch {
            texts.push(jsonStr);
          }
        }
      } else if (trimmed && trimmed !== '[DONE]') {
        try {
          const obj = JSON.parse(trimmed);
          if (obj.choices?.[0]?.delta?.content) {
            texts.push(obj.choices[0].delta.content);
          }
        } catch {
          texts.push(trimmed);
        }
      }
    }
    return texts.join('');
  }
  return rawContent;
}

// System prompt for outline generation
const OUTLINE_SYSTEM_PROMPT = `你是一位专业的小说创作顾问和故事架构师。你的任务是根据用户提供的创意种子，生成多个独特的故事大纲。

请生成2-3个不同风格的故事大纲，每个大纲包含：

**【章节数量要求 - 非常重要】**
章节数量必须根据预估字数精确计算：
- 50万字 → 生成 125-166 章
- 100万字 → 生成 250-333 章  
- 200万字 → 生成 500-666 章
- 以此类推，按每章 3000-4000 字计算

**【摘要详细度要求】**
- 前30章：详细摘要（200-500字），描述核心事件、冲突发展和角色互动
- 第31章起：简短标题+一句话概括（50-100字）

**【禁止行为】**
- ❌ 不要只生成前10-20章作为"示例"
- ❌ 不要省略中间章节
- ❌ 必须生成该预估字数对应的全部章节数量
- ✅ 每个大纲都必须包含完整的所有章节

1. 标题：一个吸引人的故事标题
2. 简介：200字以内的故事概述
3. 结构：按照四幕式结构描述
   - 第一幕：建置（介绍背景和主要冲突）
   - 第二幕上：对抗（主角面临的挑战）
   - 第二幕下：危机（最困难的时刻）
   - 第三幕：解决（成长和结局）
4. 主要角色：2-3个核心角色，包括名字、角色定位、简要描述
5. 伏笔设定：2-3个贯穿全文的伏笔或悬念
6. 预估字数：50万-200万字

请用JSON格式返回，结构如下：
{
  "outlines": [
    {
      "title": "标题",
      "synopsis": "简介",
      "structure": {
        "act1": "第一幕内容",
        "act2a": "第二幕上内容",
        "act2b": "第二幕下内容",
        "act3": "第三幕内容"
      },
      "characters": [
        {"name": "角色名", "role": "角色定位", "description": "角色描述"}
      ],
      "foreshadows": ["伏笔1", "伏笔2"],
      "estimatedWordCount": 预估字数,
      "chapters": [
        {
          "title": "第一章：章节标题",
          "summary": "章节摘要：前30章200-500字详细，后续章节50-100字简短",
          "keyEvents": ["关键事件1", "关键事件2"],
          "involvedCharacters": ["角色名"]
        }
        // ... 必须包含预估字数对应的全部章节
      ]
    }
  ]
}

请确保生成的故事大纲具有独特性，避免套路化，富有创意。**特别注意：每个大纲的chapters数组必须包含完整的所有章节，不要省略任何章节。**`;

/**
 * Stream outline generation using multi-ai-sdk
 */
export async function generateOutlineStream(
  event: Electron.IpcMainInvokeEvent,
  prompt: string,
  provider: string,
  config: {
    apiKey: string;
    baseUrl?: string;
    model?: string;
    temperature?: number;
    topP?: number;
  }
): Promise<void> {
  const baseUrl = getBaseUrl(provider, config.baseUrl);
  // 优先使用用户配置的模型，否则使用厂商推荐的第一个模型
  const model = config.model?.trim() || getDefaultModels(provider)[0] || 'gpt-4o';
  // 使用用户配置的参数，否则使用默认值
  const temperature = config.temperature ?? 0.8;
  const topP = config.topP ?? 0.9;

  try {
    // Ollama 不需要真实的 API key
    const apiKey = provider === 'ollama' ? 'dummy' : config.apiKey;

    const client = new AIClient({
      provider: provider as ProviderName,
      apiKey,
      baseUrl: baseUrl || undefined,
      timeout: 60000,
      maxRetries: 2,
    });

    // 构建消息
    const messages = [
      { role: 'system' as const, content: OUTLINE_SYSTEM_PROMPT },
      { role: 'user' as const, content: `用户的创意种子：${prompt}` },
    ];

    // 使用流式 API
    const stream = client.stream(messages, {
      model,
      temperature,
      topP,
    });

    let fullContent = '';

    for await (const chunk of stream) {
      if (chunk.content) {
        fullContent += chunk.content;
        event.sender.send('ai:outline-chunk', { content: chunk.content, fullContent });
      }
      if (chunk.done) {
        break;
      }
    }

    event.sender.send('ai:outline-done', {});

    // 解析 JSON 结果
    try {
        // 从原始 SSE 数据中提取纯文本内容
      const pureText = extractPureText(fullContent);
      
      // 清理 [DONE] 标记和空白字符
      const cleanedContent = pureText.replace(/\[DONE\]\s*$/g, '').trim();
      
      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        event.sender.send('ai:outline-complete', { result });
      } else {
        // 尝试清理常见格式问题后重试
        const cleanedForJson = cleanedContent
          .replace(/,\s*\]/g, ']')
          .replace(/,\s*\}/g, '}');
        const retryMatch = cleanedForJson.match(/\{[\s\S]*\}/);
        if (retryMatch) {
          const result = JSON.parse(retryMatch[0]);
          event.sender.send('ai:outline-complete', { result });
        } else {
          event.sender.send('ai:outline-error', { error: 'Failed to parse AI response' });
        }
      }
    } catch (e) {
      event.sender.send('ai:outline-error', { error: 'Failed to parse AI response as JSON' });
    }

  } catch (error) {
    event.sender.send('ai:outline-error', {
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

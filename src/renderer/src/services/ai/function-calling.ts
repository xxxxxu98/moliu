/**
 * Function Calling Service
 * 提供跨 Provider 的统一 Function Calling 接口
 * 支持 OpenAI、Claude（通过工具使用）、Gemini 等
 */

import type { ProviderType } from '@/config/ai-providers';

/**
 * Function Calling 的参数定义
 */
export interface FunctionParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  enum?: string[];
  items?: FunctionParameter;
  properties?: Record<string, FunctionParameter>;
  required?: string[];
}

/**
 * Function 定义
 */
export interface FunctionDef {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, FunctionParameter>;
    required?: string[];
  };
}

/**
 * Function Calling 结果
 */
export interface FunctionCallResult {
  success: boolean;
  result?: any;
  error?: string;
  provider: ProviderType;
}

/**
 * 大纲生成的 Function Calling Schema
 * 这是给 AI 看的 schema，不是 TypeScript 类型
 */
export const OUTLINE_FUNCTION_SCHEMA: FunctionDef = {
  name: 'generate_story_outline',
  description: '根据用户提供的创意种子，生成多个独特且详尽的故事大纲。每个大纲包含标题、简介、世界观设定、剧情结构、角色、伏笔等信息。',
  parameters: {
    type: 'object',
    properties: {
      outlines: {
        type: 'array',
        description: '故事大纲数组，包含2-3个不同风格的大纲',
        items: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: '故事标题'
            },
            genres: {
              type: 'array',
              description: '题材标签，如：仙侠、武侠、言情、悬疑、科幻等',
              items: {
                type: 'string'
              }
            },
            synopsis: {
              type: 'string',
              description: '300-500字的故事简介，包含世界观、主要冲突和核心主题'
            },
            worldSetting: {
              type: 'object',
              description: '世界观设定',
              properties: {
                locations: {
                  type: 'array',
                  description: '地点列表，3-5个关键地点',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string', description: '地点名称' },
                      description: { type: 'string', description: '地点描述' },
                      level: { 
                        type: 'string', 
                        enum: ['world', 'continent', 'country', 'city', 'district', 'special'],
                        description: '地点层级' 
                      },
                      parentName: { type: 'string', description: '上级地点名称（可选）' }
                    },
                    required: ['name']
                  }
                },
                factions: {
                  type: 'array',
                  description: '势力列表，2-4个主要势力',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string', description: '势力名称' },
                      description: { type: 'string', description: '势力描述' },
                      parentName: { type: 'string', description: '上级势力名称（可选）' },
                      allies: { type: 'array', items: { type: 'string' }, description: '友好势力名称' },
                      enemies: { type: 'array', items: { type: 'string' }, description: '敌对势力名称' }
                    },
                    required: ['name']
                  }
                },
                rules: {
                  type: 'array',
                  description: '规则列表，2-4个核心规则',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string', description: '规则名称' },
                      description: { type: 'string', description: '规则描述' },
                      category: {
                        type: 'string',
                        enum: ['cultivation', 'magic', 'social', 'physics', 'custom'],
                        description: '规则类别'
                      },
                      relatedRuleNames: { type: 'array', items: { type: 'string' }, description: '关联规则名称' }
                    },
                    required: ['name']
                  }
                }
              },
              required: ['locations', 'factions', 'rules']
            },
            structure: {
              type: 'object',
              description: '四幕式剧情结构',
              properties: {
                act1: { type: 'string', description: '第一幕：建置' },
                act2a: { type: 'string', description: '第二幕上：对抗' },
                act2b: { type: 'string', description: '第二幕下：危机' },
                act3: { type: 'string', description: '第三幕：解决' }
              },
              required: ['act1', 'act2a', 'act2b', 'act3']
            },
            subplots: {
              type: 'array',
              description: '子情节列表，2-3个支线情节',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: '子情节标题' },
                  description: { type: 'string', description: '子情节描述' },
                  relatedCharacters: { type: 'array', items: { type: 'string' }, description: '涉及角色名称' },
                  chapterRange: { type: 'array', items: { type: 'number' }, description: '章节范围 [起始, 结束]' },
                  purpose: { type: 'string', description: '子情节目的' }
                },
                required: ['title', 'description']
              }
            },
            chapters: {
              type: 'array',
              description: '章节级大纲，必须生成完整的所有章节。章节数量计算规则：50万字≈125-166章，100万字≈250-333章，200万字≈500-666章。前30章需要详细摘要（200-500字），后续章节用简短标题+一句话概括（50-100字）。',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: '章节标题' },
                  summary: { type: 'string', description: '章节摘要：前30章200-500字详细描述，后续章节50-100字简短概括' },
                  keyEvents: { type: 'array', items: { type: 'string' }, description: '关键事件，2-3个' },
                  involvedCharacters: { type: 'array', items: { type: 'string' }, description: '涉及角色' }
                },
                required: ['title', 'summary']
              }
            },
            characters: {
              type: 'array',
              description: '角色列表，3-5个核心角色',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: '角色名称' },
                  role: { type: 'string', description: '角色定位（主角、反派、导师等）' },
                  description: { type: 'string', description: '角色描述' },
                  personality: { type: 'array', items: { type: 'string' }, description: '性格特点' },
                  appearance: { type: 'string', description: '外貌特征' },
                  abilities: { type: 'array', items: { type: 'string' }, description: '特殊能力' },
                  background: { type: 'string', description: '背景故事' },
                  relationships: {
                    type: 'array',
                    description: '人物关系',
                    items: {
                      type: 'object',
                      properties: {
                        targetName: { type: 'string', description: '关联角色名称' },
                        type: { 
                          type: 'string',
                          enum: ['friend', 'enemy', 'family', 'lover', 'rival', 'mentor', 'student', 'alliance', 'neutral'],
                          description: '关系类型'
                        },
                        description: { type: 'string', description: '关系描述' }
                      },
                      required: ['targetName', 'type']
                    }
                  }
                },
                required: ['name', 'role']
              }
            },
            foreshadows: {
              type: 'array',
              description: '伏笔列表，4-5个',
              items: {
                type: 'object',
                properties: {
                  hint: { type: 'string', description: '伏笔内容' },
                  type: { 
                    type: 'string',
                    enum: ['item', 'dialogue', 'event', 'mystery'],
                    description: '伏笔类型'
                  },
                  suggestedChapter: { type: 'number', description: '建议揭晓章节' }
                },
                required: ['hint', 'type']
              }
            },
            estimatedWordCount: {
              type: 'number',
              description: '预估字数'
            }
          },
          required: ['title', 'genres', 'synopsis', 'worldSetting', 'structure', 'characters', 'foreshadows', 'estimatedWordCount', 'chapters']
        }
      }
    },
    required: ['outlines']
  }
};

/**
 * 将 schema 转换为 OpenAI 格式
 */
export function toOpenAISchema(schema: FunctionDef): any {
  return {
    type: 'function',
    function: {
      name: schema.name,
      description: schema.description,
      parameters: schema.parameters
    }
  };
}

/**
 * 将 schema 转换为 Anthropic Tools 格式
 */
export function toAnthropicSchema(schema: FunctionDef): any {
  return {
    name: schema.name,
    description: schema.description,
    input_schema: schema.parameters
  };
}

/**
 * 检查 Provider 是否支持 Function Calling
 * OpenAI, Claude, Gemini, DeepSeek 等都支持
 */
export function supportsFunctionCalling(provider: ProviderType): boolean {
  const supportedProviders: ProviderType[] = [
    'openai', 'anthropic', 'gemini', 'deepseek', 'moonshot', 
    'qwen', 'groq', 'mistral', 'cohere', 'nvidia', 
    'perplexity', 'together', 'cerebras', 'grok', 'fireworks', 'zhipu'
  ];
  // Ollama 从 0.1.25+ 支持 function calling
  // Azure 需要特殊配置
  return supportedProviders.includes(provider) || provider === 'ollama';
}

/**
 * 检查 Provider 是否需要特殊的 Function Calling 实现
 */
export function needsCustomFunctionCalling(provider: ProviderType): boolean {
  // Anthropic 使用不同的 API
  return provider === 'anthropic';
}

/**
 * 获取 Provider 的 API 版本路径
 */
export function getFunctionCallingEndpoint(provider: ProviderType, baseUrl: string): string {
  // 确保 baseUrl 不以斜杠结尾
  const cleanBase = baseUrl.replace(/\/$/, '');
  
  switch (provider) {
    case 'anthropic':
      return `${cleanBase}/v1/messages`;
    case 'gemini':
      return `${cleanBase}/models:generateContent`;
    default:
      return `${cleanBase}/v1/chat/completions`;
  }
}

/**
 * 获取 Provider 的 Function Calling Header
 */
export function getFunctionCallingHeaders(provider: ProviderType, apiKey: string): Record<string, string> {
  switch (provider) {
    case 'anthropic':
      return {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      };
    case 'gemini':
      return {
        'Content-Type': 'application/json'
      };
    default:
      return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      };
  }
}

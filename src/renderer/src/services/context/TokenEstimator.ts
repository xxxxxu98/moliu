/**
 * L3 上下文层 - Token 估算器
 *
 * 中文约 1 token ≈ 1.5 字符，英文约 1 token ≈ 0.75 词。
 * 与 prompt-builder.ts 的 estimateTokens 保持一致口径，但独立可测。
 */

import { countWords as countWordsShared } from '@/services/writing/utils';

// ============================================================
// Token 估算
// ============================================================

const CHINESE_CHARS_PER_TOKEN = 1.5;
const ENGLISH_WORDS_PER_TOKEN = 0.75;

/** 估算文本的 token 数。 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  const otherChars = text.length - chineseChars - (text.match(/[a-zA-Z]/g) || []).length;
  return Math.ceil(
    chineseChars / CHINESE_CHARS_PER_TOKEN +
    englishWords / ENGLISH_WORDS_PER_TOKEN +
    otherChars / 4,
  );
}

/** 字数统计：与编辑器 / 写作管线统一，按字符串长度。 */
export function countWords(text: string): number {
  return countWordsShared(text);
}

// ============================================================
// 模型上下文窗口
// ============================================================

/** 常见模型的上下文窗口大小（token）。 */
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // OpenAI
  'gpt-4': 8192,
  'gpt-4-turbo': 128000,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-3.5-turbo': 16385,
  // Anthropic
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,
  'claude-3-5-sonnet': 200000,
  'claude-3-5-haiku': 200000,
  'claude-sonnet-4': 200000,
  // Google
  'gemini-1.5-pro': 1000000,
  'gemini-1.5-flash': 1000000,
  'gemini-2.0-flash': 1000000,
  // DeepSeek
  'deepseek-chat': 64000,
  'deepseek-reasoner': 64000,
  // Moonshot
  'moonshot-v1-8k': 8000,
  'moonshot-v1-32k': 32000,
  'moonshot-v1-128k': 128000,
};

/** 默认上下文窗口（未知模型用）。 */
export const DEFAULT_CONTEXT_WINDOW = 32000;

/** 默认输出预留比例（30% 给输出）。 */
export const DEFAULT_OUTPUT_RESERVE_RATIO = 0.3;

/**
 * 根据模型名计算可用输入 token 预算。
 * @param modelName 模型名（模糊匹配）
 * @param outputReserveRatio 输出预留比例
 */
export function getInputTokenBudget(
  modelName?: string,
  outputReserveRatio: number = DEFAULT_OUTPUT_RESERVE_RATIO,
): number {
  const window = lookupContextWindow(modelName);
  return Math.floor(window * (1 - outputReserveRatio));
}

/** 模糊匹配模型上下文窗口。 */
function lookupContextWindow(modelName?: string): number {
  if (!modelName) return DEFAULT_CONTEXT_WINDOW;
  const lower = modelName.toLowerCase();
  // 精确匹配
  if (MODEL_CONTEXT_WINDOWS[modelName]) return MODEL_CONTEXT_WINDOWS[modelName];
  if (MODEL_CONTEXT_WINDOWS[lower]) return MODEL_CONTEXT_WINDOWS[lower];
  // 模糊匹配
  for (const [key, size] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (lower.includes(key) || key.includes(lower)) return size;
  }
  return DEFAULT_CONTEXT_WINDOW;
}

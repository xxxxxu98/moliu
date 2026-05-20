/**
 * Outline Service Utilities
 */

/**
 * 从原始响应中提取纯文本内容
 * 某些 SDK 可能返回原始 SSE 行而不是纯文本，需要统一处理
 */
export function extractPureText(rawContent: string): string {
  // 检测是否包含 SSE JSON 格式
  if (
    rawContent.includes('"object":"chat.completion.chunk"') ||
    (rawContent.includes('"choices"') && rawContent.includes('"delta"'))
  ) {
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

/**
 * 生成唯一 ID
 */
export function generateId(prefix: string = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 规范化数组
 */
export function normalizeArray<T>(arr: unknown): T[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((item) => (typeof item === 'string' ? item : String(item)) as T).filter(Boolean) as T[];
}

/**
 * 延迟执行
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 重试包装器
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    delayMs?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {},
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000, onRetry } = options;
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        onRetry?.(attempt, lastError);
        await delay(delayMs * attempt);
      }
    }
  }

  throw lastError!;
}

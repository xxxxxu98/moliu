/**
 * Outline Service Utilities
 */

/**
 * 规范化角色名
 */
export function normalizeCharacterName(name: string): string {
  return String(name || '')
    .trim()
    .replace(/^\*\*(.*?)\*\*$/, '$1')
    .replace(/^['"“”‘’《【(（\[]+|['"“”‘’》】)）\]]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 规范化角色类型
 */
export function normalizeCharacterRole(role: string): '主角' | '女主' | '导师' | '反派' | '配角' {
  if (!role) return '配角';
  const r = role.toLowerCase();
  if (r.includes('女主') || r.includes('女一')) return '女主';
  if (r.includes('主角') || r.includes('protagonist') || r.includes('hero') || r.includes('男主') || r.includes('男一')) return '主角';
  if (r.includes('反派') || r.includes('antagonist') || r.includes('敌人') || r.includes('villain') || r.includes('boss')) return '反派';
  if (r.includes('导师') || r.includes('mentor') || r.includes('师父') || r.includes('师尊') || r.includes('师傅')) return '导师';
  if (r.includes('配角') || r.includes('supporting') || r.includes('secondary') || r.includes('minor') || r.includes('小角色') || r.includes('龙套') || r.includes('伙伴') || r.includes('宠物') || r.includes('坐骑') || r.includes('灵兽') || r.includes('comrade') || r.includes('companion') || r.includes('pet')) return '配角';
  return '配角';
}

/**
 * 规范化伏笔类型
 */
export function normalizeForeshadowType(type: string): 'item' | 'dialogue' | 'event' | 'mystery' {
  if (!type) return 'mystery';
  const t = type.toLowerCase();
  if (t.includes('道具') || t.includes('物品') || t.includes('item')) return 'item';
  if (t.includes('对话') || t.includes('dialogue')) return 'dialogue';
  if (t.includes('事件') || t.includes('event')) return 'event';
  return 'mystery';
}

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

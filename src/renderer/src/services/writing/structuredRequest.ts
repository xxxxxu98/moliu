/**
 * StructuredAI 单次请求执行器：App（active provider）与真实冒烟（配置文件凭证）共用。
 *
 * 两侧只在「service 从哪来」上不同；system 拼装、温度档、请求级超时、jsonMode、
 * RawText 原文透传、结构化 JSON 解析、trace 原文挂载全部收敛在这里，
 * 避免一侧修复另一侧遗漏（2026-10-12 RawText 只修冒烟侧的教训）。
 */

import type { StructuredAIRequest } from '@/types/story-runtime';
import { robustJsonParse } from '@/utils/json-parser';

import {
  AI_AUXILIARY_REQUEST_TIMEOUT_MS,
  AI_SINGLE_REQUEST_TIMEOUT_MS,
} from './chapterWritePresets';

/** 结构化请求所需的最小 AI 服务形状（UnifiedAIService.complete 子集） */
export interface StructuredCompletionService {
  complete(
    prompt: string,
    options?: {
      temperature?: number;
      system?: string;
      signal?: AbortSignal;
      jsonMode?: boolean;
    }
  ): Promise<string>;
}

/** 原生文本契约：消费方自行解析（如蓝图块、逐行节拍），不追加 JSON 指令、不开 jsonMode */
export const RAW_TEXT_SCHEMA_NAME = 'RawText';

/**
 * 解析模型返回的结构化 JSON（对象优先，其次数组）。
 * SupplementParagraphs 允许纯文本段落兜底；其余失败抛出带原文片段的错误。
 */
export function parseStructuredJson(raw: string, schemaName?: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
  const parsed = robustJsonParse(trimmed, { expectedType: 'object', enableCompletion: true });
  if (parsed.success && parsed.data !== undefined) {
    return parsed.data;
  }
  const asArray = robustJsonParse(trimmed, { expectedType: 'array', enableCompletion: true });
  if (asArray.success && asArray.data !== undefined) {
    return asArray.data;
  }
  if (
    schemaName === 'SupplementParagraphs' &&
    trimmed.length >= 20 &&
    !/^[{[]/u.test(trimmed) &&
    !/^```/u.test(trimmed)
  ) {
    return {
      paragraphs: trimmed
        .split(/\n+/u)
        .map(item => item.trim())
        .filter(Boolean),
    };
  }
  const detail = parsed.warnings?.slice(-2).join('；') || asArray.warnings?.slice(-2).join('；');
  // 剥离控制字符，避免模型输出中的换行/转义注入日志或 UI。
  const rawSnippet = `\n--- AI 原始返回（前 300 字）---\n${trimmed
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    .slice(0, 300)}`;
  throw new Error(
    (detail ? `AI 返回的结构化 JSON 无法解析：${detail}` : 'AI 未返回可解析的结构化 JSON') +
      rawSnippet
  );
}

/**
 * 执行一次 StructuredAI 请求。
 *
 * - scene-draft 用长超时档与 0.65 创作温度，其余辅助请求用短超时档与 0.2；
 * - RawText 不开 jsonMode、原文直接交 parse（JSON 解析会把恰好像 JSON 的文本转成
 *   对象，文本解析器随即崩溃——2026-10-12 r22b「raw.matchAll is not a function」）；
 * - 模型原文挂到返回对象 __rawResponse，供 RecordingStructuredAI 写 trace 后剥离。
 */
export async function executeStructuredRequest<T>(
  service: StructuredCompletionService,
  request: StructuredAIRequest<T>,
  signal?: AbortSignal
): Promise<unknown> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  const timeoutController = new AbortController();
  const requestTimeoutMs =
    request.purpose === 'scene-draft' ? AI_SINGLE_REQUEST_TIMEOUT_MS : AI_AUXILIARY_REQUEST_TIMEOUT_MS;
  const timeoutTimer = setTimeout(() => timeoutController.abort(), requestTimeoutMs);
  const combined = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;
  try {
    const isRawText = request.schemaName === RAW_TEXT_SCHEMA_NAME;
    const raw = await service.complete(request.prompt, {
      system: [
        request.system,
        `schemaName=${request.schemaName}`,
        isRawText
          ? '按 system 指令的原生文本格式输出，不要 JSON。'
          : '只输出合法 JSON 对象，不要 Markdown 代码块，不要前后解释文字。',
      ].join('\n'),
      temperature: request.purpose === 'scene-draft' ? 0.65 : 0.2,
      signal: combined,
      jsonMode: !isRawText,
    });
    const result = isRawText
      ? request.parse(raw)
      : request.parse(parseStructuredJson(raw, request.schemaName));
    if (result && (typeof result === 'object' || typeof result === 'function')) {
      try {
        (result as Record<string, unknown>).__rawResponse = raw;
      } catch {
        /* 只读属性则忽略，不阻塞主流程 */
      }
    }
    return result;
  } finally {
    clearTimeout(timeoutTimer);
  }
}

import type { ProviderType } from '@/config/ai-providers';
import { AIServiceFactory } from '@/services/ai/factory';
import {
  AI_AUXILIARY_REQUEST_TIMEOUT_MS,
  AI_SINGLE_REQUEST_TIMEOUT_MS,
} from '@/services/writing/chapterWritePresets';
import type { StructuredAI, StructuredAIRequest } from '@/types/story-runtime';
import { robustJsonParse } from '@/utils/json-parser';

import {
  resolveContinueWriteRealConfig,
  type ResolvedRealAiConfig,
} from './continueWriteRealConfig';

function parseStructuredJson(raw: string, schemaName?: string): unknown {
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
  // 附上 AI 原始返回片段，让 trace 能直接定位模型输出（此前只记录解析摘要，无法排查）。
  // 剥离控制字符，避免模型输出中的换行/转义注入日志或 UI。
  const rawSnippet = `\n--- AI 原始返回（前 300 字）---\n${trimmed
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    .slice(0, 300)}`;
  throw new Error(
    (detail
      ? `AI 返回的结构化 JSON 无法解析：${detail}`
      : 'AI 未返回可解析的结构化 JSON') + rawSnippet
  );
}

export type RealAiEnvConfig = Pick<
  ResolvedRealAiConfig,
  'provider' | 'apiKey' | 'model' | 'baseUrl'
>;

/** 读取配置文件（及可选环境变量覆盖） */
export function readRealAiEnvConfig(): RealAiEnvConfig {
  const resolved = resolveContinueWriteRealConfig();
  return {
    provider: resolved.provider,
    apiKey: resolved.apiKey,
    model: resolved.model,
    baseUrl: resolved.baseUrl,
  };
}

export function createRealStructuredAI(
  config: RealAiEnvConfig,
  signal?: AbortSignal
): StructuredAI {
  const service = AIServiceFactory.createService(
    config.provider as ProviderType,
    config.apiKey,
    config.baseUrl,
    config.model
  );

  // 对齐 ChapterWritingPipeline.createStructuredAIFromActiveProvider：
  // 直接调 service.complete，不包 withTransientRetry（真实 App 无此层）。
  // 瞬态重试由 LongFormWritingEngine.runStepWithTransientRetry（步骤级）+
  // 批量层错误分级重试兜住，与生产一致。
  // 超时护栏作为环境保护（防 AI hang 死拖垮整个冒烟到 vitest 超时）。
  // scene-draft 单章需生成 2000 字以上正文，部分慢模型（如 deepseek-v4-flash）单次请求
  // 实测可达 3-5 分钟甚至更长，过短的超时会误杀正常长输出（曾连续触发 socket hang up）。
  // 与生产路径（createStructuredAIFromActiveProvider）共用 AI_SINGLE_REQUEST_TIMEOUT_MS，
  // 避免「测试能跑通、生产超时」的不对称；瞬态失败仍由上层重试兜住。
  // 注意：依赖此 AI 的 vitest 用例超时必须 ≥ 此值，否则 hung request 会先撞测试超时。
  return {
    async generate<T>(request: StructuredAIRequest<T>): Promise<unknown> {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const timeoutController = new AbortController();
      const requestTimeoutMs = request.purpose === 'scene-draft'
        ? AI_SINGLE_REQUEST_TIMEOUT_MS
        : AI_AUXILIARY_REQUEST_TIMEOUT_MS;
      const timeoutTimer = setTimeout(
        () => timeoutController.abort(),
        requestTimeoutMs,
      );
      const combined = signal
        ? AbortSignal.any([signal, timeoutController.signal])
        : timeoutController.signal;
      try {
        const raw = await service.complete(request.prompt, {
          system: [
            request.system,
            `schemaName=${request.schemaName}`,
            '只输出合法 JSON 对象，不要 Markdown 代码块，不要前后解释文字。',
          ].join('\n'),
          temperature: request.purpose === 'scene-draft' ? 0.65 : 0.2,
          signal: combined,
          jsonMode: true,
        });
        const parsed = parseStructuredJson(raw, request.schemaName);
        const result = request.parse(parsed);
        // 把模型原始文本挂在返回对象上供 RecordingStructuredAI 写入 trace.rawResponse。
        // recorder 会读取后剥离该字段，下游消费方零感知；非对象返回值（如基本类型）忽略。
        // 与 ChapterWritingPipeline.createStructuredAIFromActiveProvider 同口径。
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
    },
  };
}

/** 用配置文件 / App 默认模型构造 StructuredAI */
export function createRealStructuredAIFromEnv(signal?: AbortSignal): StructuredAI {
  return createRealStructuredAI(readRealAiEnvConfig(), signal);
}

export function isRealAiEnabled(): boolean {
  const flag = (process.env.REAL_AI || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

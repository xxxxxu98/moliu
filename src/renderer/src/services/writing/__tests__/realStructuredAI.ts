import type { ProviderType } from '@/config/ai-providers';
import { AIServiceFactory } from '@/services/ai/factory';
import type { StructuredAI, StructuredAIRequest } from '@/types/story-runtime';
import { robustJsonParse } from '@/utils/json-parser';

import {
  resolveContinueWriteRealConfig,
  type ResolvedRealAiConfig,
} from './continueWriteRealConfig';

function parseStructuredJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
  const parsed = robustJsonParse(trimmed, { expectedType: 'object', enableCompletion: true });
  if (parsed.success && parsed.data !== undefined) {
    return parsed.data;
  }
  const asArray = robustJsonParse(trimmed, { expectedType: 'array', enableCompletion: true });
  if (asArray.success && asArray.data !== undefined) {
    return asArray.data;
  }
  const detail = parsed.warnings?.slice(-2).join('；') || asArray.warnings?.slice(-2).join('；');
  throw new Error(
    detail ? `AI 返回的结构化 JSON 无法解析：${detail}` : 'AI 未返回可解析的结构化 JSON'
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

  return {
    async generate<T>(request: StructuredAIRequest<T>): Promise<unknown> {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const raw = await service.complete(request.prompt, {
        system: [
          request.system,
          `schemaName=${request.schemaName}`,
          '只输出合法 JSON 对象，不要 Markdown 代码块，不要前后解释文字。',
        ].join('\n'),
        temperature: request.purpose === 'scene-draft' ? 0.65 : 0.2,
        signal,
      });
      const parsed = parseStructuredJson(raw);
      return request.parse(parsed);
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

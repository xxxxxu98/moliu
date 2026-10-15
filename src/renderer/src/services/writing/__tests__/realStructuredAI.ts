/**
 * 真实冒烟的 AI 注入点：用 temp 配置文件凭证构造 StructuredAI 与 agent 多轮 transport。
 *
 * 与 App 的唯一差异是 AI 服务来源（配置文件 vs active provider）；单次请求的
 * system 拼装/温度/超时/jsonMode/解析全部复用 structuredRequest.executeStructuredRequest。
 */
import type { ProviderType } from '@/config/ai-providers';
import { AIServiceFactory } from '@/services/ai/factory';
import type { AgentLoopTransport } from '@/services/story-runtime';
import { AI_AUXILIARY_REQUEST_TIMEOUT_MS } from '@/services/writing/chapterWritePresets';
import { executeStructuredRequest } from '@/services/writing/structuredRequest';
import type { StructuredAI, StructuredAIRequest } from '@/types/story-runtime';

import {
  resolveContinueWriteRealConfig,
  type ResolvedRealAiConfig,
} from './continueWriteRealConfig';

export type RealAiEnvConfig = Pick<
  ResolvedRealAiConfig,
  'provider' | 'apiKey' | 'model' | 'baseUrl' | 'maxTokens'
>;

/** 读取配置文件（及可选环境变量覆盖） */
export function readRealAiEnvConfig(): RealAiEnvConfig {
  const resolved = resolveContinueWriteRealConfig();
  return {
    provider: resolved.provider,
    apiKey: resolved.apiKey,
    model: resolved.model,
    baseUrl: resolved.baseUrl,
    maxTokens: resolved.maxTokens,
  };
}

/**
 * 构造真实 StructuredAI。不包 withTransientRetry（App 无此层）：瞬态重试由
 * LongFormWritingEngine 步骤级重试 + 批量层错误分级重试兜住，与生产一致。
 */
export function createRealStructuredAI(
  config: RealAiEnvConfig,
  signal?: AbortSignal
): StructuredAI {
  const service = AIServiceFactory.createService(
    config.provider as ProviderType,
    config.apiKey,
    config.baseUrl,
    config.model,
    undefined,
    // 镜像 App 厂商 generationConfig.maxTokens：仅该厂商在 App 设置里配置了才透传
    config.maxTokens
      ? { temperature: 0.7, topP: 0.9, frequencyPenalty: 0, presencePenalty: 0, maxTokens: config.maxTokens }
      : undefined,
  );
  return {
    async generate<T>(request: StructuredAIRequest<T>): Promise<unknown> {
      return executeStructuredRequest(service, request, signal);
    },
  };
}

/** 用配置文件 / App 默认模型构造 StructuredAI */
export function createRealStructuredAIFromEnv(signal?: AbortSignal): StructuredAI {
  return createRealStructuredAI(readRealAiEnvConfig(), signal);
}

/**
 * 用同份冒烟配置构造 agent 检索循环的真实多轮 transport。
 * 与 createRealStructuredAI 同口径:直接走 UnifiedAIService.chatComplete
 * (复用 complete 的瞬态重试/降级护栏),请求级超时用辅助档。
 */
export function createRealAgentLoopTransport(
  config: RealAiEnvConfig,
  signal?: AbortSignal
): AgentLoopTransport {
  const service = AIServiceFactory.createService(
    config.provider as ProviderType,
    config.apiKey,
    config.baseUrl,
    config.model,
    undefined,
    config.maxTokens
      ? { temperature: 0.7, topP: 0.9, frequencyPenalty: 0, presencePenalty: 0, maxTokens: config.maxTokens }
      : undefined,
  );
  return {
    async send(messages, options) {
      if (signal?.aborted || options?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const timeoutController = new AbortController();
      const timeoutTimer = setTimeout(
        () => timeoutController.abort(),
        AI_AUXILIARY_REQUEST_TIMEOUT_MS,
      );
      const inner = options?.signal ?? signal;
      const combined = inner
        ? AbortSignal.any([inner, timeoutController.signal])
        : timeoutController.signal;
      try {
        return await service.chatComplete(messages, {
          temperature: 0.2,
          signal: combined,
          jsonMode: true,
        });
      } finally {
        clearTimeout(timeoutTimer);
      }
    },
  };
}

/** REAL_AI=1/true/yes 时启用真实 AI 冒烟 */
export function isRealAiEnabled(): boolean {
  const flag = (process.env.REAL_AI || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

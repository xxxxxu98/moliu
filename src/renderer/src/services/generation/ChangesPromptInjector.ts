/**
 * L4 生成层 - CHANGES 协议提示注入器
 *
 * 职责：在 draft prompt 末尾强制要求 AI 输出 CHANGES 协议载荷（结构化 diff）。
 *
 * 位置感知原则：协议要求必须放 prompt 结尾（LLM 最关注尾部指令），
 * 这与 L3 ContextAssembler 的拼装策略一致。
 */

import { buildChangesProtocolPrompt } from '../state/ChangesProtocol';

export interface PromptInjectionResult {
  /** 注入 CHANGES 协议要求后的完整 prompt */
  prompt: string;
}

export interface InjectOptions {
  /** 是否包含示例（首次推荐 true，重试时关 false 省 token） */
  includeExamples?: boolean;
}

/**
 * 把 CHANGES 协议要求注入到 draft prompt 末尾。
 */
export class ChangesPromptInjector {
  inject(basePrompt: string, options: InjectOptions = {}): PromptInjectionResult {
    const { includeExamples = true } = options;
    const protocolPrompt = buildChangesProtocolPrompt({ includeExamples });
    return {
      prompt: `${basePrompt}\n\n${protocolPrompt}`,
    };
  }
}

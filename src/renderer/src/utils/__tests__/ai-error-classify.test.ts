/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import {
  classifyError,
  isTransientError,
  isRetryableError,
  isAbortedError,
  backoffDelayMs,
  retryBackoffDelayMs,
  parseAllowedTemperature,
} from '../ai-error-classify';

/** 模拟 multi-ai-sdk 的 AIError（name 恒为 'AIError'，带 status） */
function makeAiError(message: string, status?: number): Error {
  const err = new Error(message);
  err.name = 'AIError';
  Object.assign(err, { status });
  return err;
}

/** 模拟 fetch 失败抛出的原生 TypeError（无 status） */
function makeFetchTypeError(message: string): TypeError {
  return new TypeError(message);
}

/** 模拟超时护栏 / 用户取消产生的 AbortError */
function makeAbortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

describe('classifyError', () => {
  describe('aborted（用户主动取消）', () => {
    it('signal.aborted===true 时任何错误都归为 aborted', () => {
      const ctrl = new AbortController();
      ctrl.abort();
      const result = classifyError(new Error('任意错误'), ctrl.signal);
      expect(result.kind).toBe('aborted');
      expect(result.retryable).toBe(false);
      expect(result.transient).toBe(false);
    });

    it('AbortError + signal 已 abort 归为 aborted（而非 timeout）', () => {
      const ctrl = new AbortController();
      ctrl.abort();
      const result = classifyError(makeAbortError(), ctrl.signal);
      expect(result.kind).toBe('aborted');
    });

    it('isAbortedError 配合 signal 工作', () => {
      const ctrl = new AbortController();
      ctrl.abort();
      expect(isAbortedError(makeAbortError(), ctrl.signal)).toBe(true);
      expect(isAbortedError(makeAbortError())).toBe(false); // 无 signal 不算用户取消
    });
  });

  describe('timeout（超时护栏）', () => {
    it('AbortError 但 signal 未 abort 归为 timeout', () => {
      const ctrl = new AbortController(); // 未 abort
      const result = classifyError(makeAbortError(), ctrl.signal);
      expect(result.kind).toBe('timeout');
      expect(result.retryable).toBe(true);
      expect(result.transient).toBe(true);
    });

    it('AbortError 无 signal 归为 timeout（保守视为可重试）', () => {
      const result = classifyError(makeAbortError());
      expect(result.kind).toBe('timeout');
    });

    it('message 含 timeout 文案归为 timeout', () => {
      const result = classifyError(new Error('请求超时'));
      expect(result.kind).toBe('timeout');
    });
  });

  describe('network（网络瞬时错误）', () => {
    it('TypeError(fetch failed) 归为 network', () => {
      const result = classifyError(makeFetchTypeError('fetch failed'));
      expect(result.kind).toBe('network');
      expect(result.retryable).toBe(true);
      expect(result.transient).toBe(true);
    });

    it('ERR_CONNECTION_CLOSED 文案归为 network', () => {
      const result = classifyError(new Error('ERR_CONNECTION_CLOSED'));
      expect(result.kind).toBe('network');
    });

    it('ECONNRESET 文案归为 network', () => {
      const result = classifyError(new Error('socket hang up: ECONNRESET'));
      expect(result.kind).toBe('network');
    });

    // multi-ai-sdk 适配器在响应体为空时抛 AIError("Response body is null")（无 status），
    // 本质是网关/流式断连的瞬态症状，必须走重试而非误判为 unknown（持久、不可重试）。
    it('Response body is null 归为 network（瞬态、可重试）', () => {
      const result = classifyError(new Error('Response body is null'));
      expect(result.kind).toBe('network');
      expect(result.retryable).toBe(true);
      expect(result.transient).toBe(true);
    });

    // 大纲请求层（unified-generator.callStructuredTextMode）对流正常结束但 0 字正文
    // 抛「API 未返回内容」。矩阵实测 minimax/glm 网关抖动会这样返回；与 length_capped
    // 的确定性截断不同，必须瞬态重试，否则一次空响应就废掉整步。
    it('API 未返回内容 归为 network（瞬态、可重试）', () => {
      const result = classifyError(new Error('API 未返回内容'));
      expect(result.kind).toBe('network');
      expect(result.retryable).toBe(true);
      expect(result.transient).toBe(true);
    });

    it('大纲输出被长度上限截断仍归为 length_capped（确定性、不重试）', () => {
      const result = classifyError(new Error('大纲输出被长度上限截断：正文 82 字、推理 9599 字'));
      expect(result.kind).toBe('length_capped');
      expect(result.retryable).toBe(false);
      expect(result.transient).toBe(false);
    });
  });

  describe('parseAllowedTemperature（网关温度约束）', () => {
    // kimi-k3 OpenAI 兼容层实测：400 invalid temperature: only 1 is allowed for this model。
    // 参数约束必须解析后改值重试，同参数重试只会复现。
    it('「only 1 is allowed for this model」解析为 1', () => {
      expect(
        parseAllowedTemperature(
          new Error('invalid temperature: only 1 is allowed for this model'),
        ),
      ).toBe(1);
    });

    it('「temperature must be 1」解析为 1', () => {
      expect(parseAllowedTemperature(new Error('temperature must be 1 for this model'))).toBe(1);
    });

    it('其它 temperature 报错（如区间越界未给值）返回 null', () => {
      expect(
        parseAllowedTemperature(new Error('temperature must be between 0 and 2')),
      ).toBeNull();
    });

    it('非温度错误返回 null', () => {
      expect(parseAllowedTemperature(new Error('API 请求失败: 429 too many requests'))).toBeNull();
    });
  });

  describe('HTTP 状态码分类（multi-ai-sdk AIError）', () => {
    it('429 归为 rate_limit', () => {
      const result = classifyError(makeAiError('Too Many Requests', 429));
      expect(result.kind).toBe('rate_limit');
      expect(result.retryable).toBe(true);
    });

    it('包装后的「请求失败: 429」文案也归为 rate_limit', () => {
      const result = classifyError(
        new Error('API 请求失败: 429 {"error":{"code":"1302","message":"您的账户已达到速率限制，请您控制请求频率"}}'),
      );
      expect(result.kind).toBe('rate_limit');
      expect(result.transient).toBe(true);
    });

    it('500/502/503 归为 server', () => {
      for (const status of [500, 502, 503]) {
        const result = classifyError(makeAiError(`API error ${status}`, status));
        expect(result.kind).toBe('server');
        expect(result.retryable).toBe(true);
      }
    });

    it('401/403 归为 auth', () => {
      for (const status of [401, 403]) {
        const result = classifyError(makeAiError('Unauthorized', status));
        expect(result.kind).toBe('auth');
        expect(result.retryable).toBe(false);
      }
    });

    it('400/404/422 归为 provider', () => {
      for (const status of [400, 404, 422]) {
        const result = classifyError(makeAiError('Bad request', status));
        expect(result.kind).toBe('provider');
        expect(result.retryable).toBe(false);
      }
    });
  });

  describe('truncated（JSON 截断）', () => {
    it('Unexpected end of JSON input 归为 truncated', () => {
      const result = classifyError(new Error('Unexpected end of JSON input'));
      expect(result.kind).toBe('truncated');
      expect(result.retryable).toBe(true);
    });

    it('AI 返回的结构化 JSON 无法解析 归为 truncated', () => {
      const result = classifyError(
        new Error('AI 返回的结构化 JSON 无法解析：括号不匹配')
      );
      expect(result.kind).toBe('truncated');
    });

    // SceneDraftEngine.coerceSceneDraft 在模型未返回正文段落时抛此错（文案刻意含
    // 「AI 未返回可解析的结构化 JSON」以命中 TRUNCATED_RE）。空段落多半是流式响应
    // 中途断开 / 模型只返回标题的连带症状，应归类为 truncated 走重试，而非 unknown。
    it('场景未返回可用正文段落 归为 truncated（瞬态、可重试）', () => {
      const result = classifyError(
        new Error('场景 chapter-1:CBN 未返回可用正文段落（AI 未返回可解析的结构化 JSON）')
      );
      expect(result.kind).toBe('truncated');
      expect(result.retryable).toBe(true);
      expect(result.transient).toBe(true);
    });
  });

  describe('length_capped（finish_reason=length 确定性截断）', () => {
    // 撞厂商输出上限是确定性失败：同参数重试必然复现，重试只会白烧几分钟长请求。
    // 文案来自 readOpenAiCompatibleStream（unified-generator.ts）与 unified.service.ts。
    it('大纲输出被长度上限截断 归为 length_capped（非瞬态、不可重试）', () => {
      const result = classifyError(
        new Error('大纲输出被长度上限截断：正文 0 字、推理 12000 字（输出预算全部消耗在推理上）')
      );
      expect(result.kind).toBe('length_capped');
      expect(result.retryable).toBe(false);
      expect(result.transient).toBe(false);
    });

    it('AI 输出被长度上限截断（unified.service 文案）同样归为 length_capped', () => {
      const result = classifyError(
        new Error('AI 输出被长度上限截断：仅收到 120 字')
      );
      expect(result.kind).toBe('length_capped');
      expect(result.transient).toBe(false);
    });

    // 网关中途 RST 是真瞬态（连接问题而非输出上限），必须保持可重试
    it('流式响应提前中断仍归为 truncated（瞬态、可重试）', () => {
      const result = classifyError(
        new Error('大纲流式响应提前中断：已收到 5200 字，未见结束标记')
      );
      expect(result.kind).toBe('truncated');
      expect(result.retryable).toBe(true);
      expect(result.transient).toBe(true);
    });
  });

  describe('schema（结构校验失败）', () => {
    it('结构校验失败前缀归为 schema', () => {
      const result = classifyError(
        new Error('事实提取结果 结构校验失败: expected array, received undefined')
      );
      expect(result.kind).toBe('schema');
      expect(result.retryable).toBe(false);
      expect(result.transient).toBe(false);
    });

    it('expected array received undefined 归为 schema', () => {
      const result = classifyError(
        new Error('deltas: expected array, received undefined')
      );
      expect(result.kind).toBe('schema');
    });
  });

  describe('review（审核未通过）', () => {
    it('审查服务不可用与“内容未通过”分类隔离', () => {
      const result = classifyError(
        new Error('[review-unavailable] 语义审查不可用：fetch failed'),
      );
      expect(result.kind).toBe('review_unavailable');
      expect(result.retryable).toBe(false);
      expect(result.transient).toBe(false);
    });

    it('严格门禁未通过 归为 review', () => {
      const result = classifyError(new Error('严格门禁未通过，章节未提交'));
      expect(result.kind).toBe('review');
      expect(result.retryable).toBe(false);
    });

    it('严格连续性门禁未通过 归为 review', () => {
      const result = classifyError(new Error('严格连续性门禁未通过'));
      expect(result.kind).toBe('review');
    });
  });

  describe('wordcount（字数不足）', () => {
    it('字数严重不足 归为 wordcount', () => {
      const result = classifyError(
        new Error('字数严重不足：当前约 800 字，至少需 3000 字')
      );
      expect(result.kind).toBe('wordcount');
      expect(result.retryable).toBe(false);
    });

    it('word-count-short id 归为 wordcount', () => {
      const result = classifyError(new Error('word-count-short:800/3000'));
      expect(result.kind).toBe('wordcount');
    });

    it('字数超限和 word-count-over 归为 wordcount', () => {
      expect(classifyError(new Error('字数严重超限：当前约 2824 字')).kind).toBe('wordcount');
      expect(classifyError(new Error('word-count-over:2824/2300')).kind).toBe('wordcount');
    });
  });

  describe('rate_limit（配额文案）', () => {
    it('quota 文案归为 rate_limit', () => {
      const result = classifyError(new Error('insufficient_quota: 余额不足'));
      expect(result.kind).toBe('rate_limit');
    });
  });

  describe('unknown（兜底）', () => {
    it('无法识别的错误归为 unknown 且不可重试', () => {
      const result = classifyError(new Error('一些奇怪的错误 xyz'));
      expect(result.kind).toBe('unknown');
      expect(result.retryable).toBe(false);
      expect(result.transient).toBe(false);
    });

    it('字符串错误也能分类', () => {
      const result = classifyError('网络断开 disconnected');
      expect(result.kind).toBe('network');
    });

    it('null 兜底为 unknown', () => {
      const result = classifyError(null);
      expect(result.kind).toBe('unknown');
    });
  });
});

describe('便捷谓词', () => {
  it('isTransientError', () => {
    expect(isTransientError(makeFetchTypeError('fetch failed'))).toBe(true);
    expect(isTransientError(new Error('结构校验失败: x'))).toBe(false);
  });

  it('isRetryableError', () => {
    expect(isRetryableError(makeAiError('Server error', 500))).toBe(true);
    expect(isRetryableError(new Error('严格门禁未通过'))).toBe(false);
  });
});

describe('backoffDelayMs', () => {
  it('批量层默认基数 4000，封顶 30000', () => {
    expect(backoffDelayMs(1)).toBe(4000);
    expect(backoffDelayMs(2)).toBe(8000);
    expect(backoffDelayMs(3)).toBe(16000);
    expect(backoffDelayMs(4)).toBe(30000); // 32000 封顶
    expect(backoffDelayMs(5)).toBe(30000);
  });

  it('AI 调用层短退避 base=1000', () => {
    expect(backoffDelayMs(1, 1000)).toBe(1000);
    expect(backoffDelayMs(2, 1000)).toBe(2000);
    expect(backoffDelayMs(3, 1000)).toBe(4000);
  });

  it('自定义上限生效', () => {
    expect(backoffDelayMs(5, 4000, 60000)).toBe(60000);
  });
});

describe('retryBackoffDelayMs（kind 感知退避）', () => {
  // 账户级 429 下短退避只会连吃 429 耗尽重试额度（实测 ARK 6/6 模块全触发），
  // 限流固定 15s/30s/60s/120s，与其余瞬态错误的默认基数互不干扰。
  it('rate_limit 走 15s 起步、120s 封顶，忽略调用方基数', () => {
    expect(retryBackoffDelayMs('rate_limit', 1)).toBe(15_000);
    expect(retryBackoffDelayMs('rate_limit', 2)).toBe(30_000);
    expect(retryBackoffDelayMs('rate_limit', 3)).toBe(60_000);
    expect(retryBackoffDelayMs('rate_limit', 4, 2000, 10_000)).toBe(120_000);
  });

  it('非限流瞬态错误沿用调用方基数与上限', () => {
    expect(retryBackoffDelayMs('network', 1, 2000, 10_000)).toBe(2000);
    expect(retryBackoffDelayMs('timeout', 3, 2000, 10_000)).toBe(8000);
    expect(retryBackoffDelayMs('server', 1)).toBe(4000);
  });
});

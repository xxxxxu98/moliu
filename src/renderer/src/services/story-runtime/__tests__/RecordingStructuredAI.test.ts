import { describe, expect, it } from 'vitest';

import { RecordingStructuredAI } from '../RecordingStructuredAI';
import type { StructuredAI, StructuredAIRequest } from '@/types/story-runtime';

/**
 * RecordingStructuredAI 的最小 inner：把 __rawResponse 挂到返回对象上，
 * 模拟 ChapterWritingPipeline / realStructuredAI 的真实行为。
 */
function makeInnerWithRaw(rawText: string, parsed: Record<string, unknown>): StructuredAI {
  return {
    async generate<T>(request: StructuredAIRequest<T>): Promise<unknown> {
      const result = { ...parsed };
      // 与生产实现同口径：把 raw 文本挂到 __rawResponse 字段
      (result as Record<string, unknown>).__rawResponse = rawText;
      return request.parse(result);
    },
  };
}

describe('RecordingStructuredAI rawResponse 捕获', () => {
  it('从返回对象剥离 __rawResponse 写入 trace.rawResponse，下游不再含该字段', async () => {
    const recorder = new RecordingStructuredAI(
      makeInnerWithRaw('{"a":1} 原始模型文本', { a: 1 }),
      { runId: 'test-raw-1', persist: false }
    );
    // parse 透传：让 generate 返回带 __rawResponse 的对象
    const result = (await recorder.generate({
      purpose: 'scene-draft',
      schemaName: 'SceneDraft',
      system: 'sys',
      prompt: 'p',
      parse: v => v,
    })) as Record<string, unknown>;

    // 下游拿到的 result 不应再含 __rawResponse（recorder 已剥离）
    expect(result.__rawResponse).toBeUndefined();
    expect(result.a).toBe(1);

    const records = recorder.getRecords();
    expect(records).toHaveLength(1);
    expect(records[0].rawResponse).toBe('{"a":1} 原始模型文本');
    expect(records[0].response).toEqual({ a: 1 });
  });

  it('返回对象无 __rawResponse 时 rawResponse 为 undefined（兼容旧 inner）', async () => {
    const inner: StructuredAI = {
      async generate<T>(request: StructuredAIRequest<T>): Promise<unknown> {
        return request.parse({ b: 2 });
      },
    };
    const recorder = new RecordingStructuredAI(inner, {
      runId: 'test-raw-2',
      persist: false,
    });
    await recorder.generate({
      purpose: 'chapter-judge',
      schemaName: 'ChapterJudgeResult',
      system: 'sys',
      prompt: 'p',
      parse: v => v,
    });
    const records = recorder.getRecords();
    expect(records[0].rawResponse).toBeUndefined();
    expect(records[0].response).toEqual({ b: 2 });
  });

  it('空字符串 rawResponse 视为无原文（不写空串）', async () => {
    const recorder = new RecordingStructuredAI(makeInnerWithRaw('', { a: 1 }), {
      runId: 'test-raw-3',
      persist: false,
    });
    await recorder.generate({
      purpose: 'fact-extraction',
      schemaName: 'ExtractedFacts',
      system: 'sys',
      prompt: 'p',
      parse: v => v,
    });
    expect(recorder.getRecords()[0].rawResponse).toBeUndefined();
  });

  it('基本类型返回值（非对象）不挂 rawResponse，也不报错', async () => {
    // parse 可能返回基本类型（如 string），__rawResponse 无法挂载，recorder 应静默跳过
    const inner: StructuredAI = {
      async generate<T>(request: StructuredAIRequest<T>): Promise<unknown> {
        return request.parse('just-a-string' as unknown);
      },
    };
    const recorder = new RecordingStructuredAI(inner, {
      runId: 'test-raw-4',
      persist: false,
    });
    const result = await recorder.generate({
      purpose: 'fulfillment-check',
      schemaName: 'FulfillmentCheckResult',
      system: 'sys',
      prompt: 'p',
      parse: v => v,
    });
    expect(result).toBe('just-a-string');
    expect(recorder.getRecords()[0].rawResponse).toBeUndefined();
  });

  it('错误路径不写 rawResponse（保持原 error 字段语义）', async () => {
    const inner: StructuredAI = {
      async generate(): Promise<unknown> {
        throw new Error('AI 返回的结构化 JSON 无法解析');
      },
    };
    const recorder = new RecordingStructuredAI(inner, {
      runId: 'test-raw-5',
      persist: false,
    });
    await expect(
      recorder.generate({
        purpose: 'scene-draft',
        schemaName: 'SceneDraft',
        system: 'sys',
        prompt: 'p',
        parse: v => v,
      })
    ).rejects.toThrow('AI 返回的结构化 JSON 无法解析');
    const records = recorder.getRecords();
    expect(records[0].error).toContain('AI 返回的结构化 JSON 无法解析');
    expect(records[0].rawResponse).toBeUndefined();
  });
});

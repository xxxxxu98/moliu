import type { StructuredAI, StructuredAIRequest } from '@/types/story-runtime';

export interface AiTraceRecord {
  seq: number;
  runId: string;
  purpose: StructuredAIRequest<unknown>['purpose'];
  schemaName: string;
  system: string;
  prompt: string;
  response?: unknown;
  /**
   * 模型返回的原始文本（未 parse 前）。response 已是 parse 后的对象/值，
   * 排障时往往需要看原文（定位模型是否截断、JSON 结构偏差等）。
   * 由调用方（ChapterWritingPipeline / realStructuredAI）把 raw 文本挂到
   * 返回对象的 __rawResponse 字段传入；recorder 读取后从此处剥离，避免污染下游。
   */
  rawResponse?: string;
  error?: string;
  ms: number;
  at: string;
  /** 实际调用模型（真 AI 冒烟等场景写入，便于多跑次对比） */
  model?: string;
  provider?: string;
}

/**
 * 内部约定字段名：StructuredAI 实现可把模型原始返回文本挂在返回对象上，
 * RecordingStructuredAI 会读取并写入 trace 的 rawResponse，然后剥离该字段。
 * 用 Symbol 太重（跨模块/序列化不一致），这里用一个明确带 __ 前缀的字符串约定，
 * 仅在 trace 启用路径上出现，对正常 StructuredAI（无此字段）零影响。
 */
export const RAW_RESPONSE_KEY = '__rawResponse';

type WithRawResponse = { [RAW_RESPONSE_KEY]?: unknown };

export interface RecordingStructuredAIOptions {
  runId?: string;
  /** 默认 true：尝试写入 temp/ai-traces；浏览器无 fs 时仅内存 */
  persist?: boolean;
  traceDir?: string;
  model?: string;
  provider?: string;
}

function canUseNodeFs(): boolean {
  return (
    typeof process !== 'undefined' &&
    typeof process.versions === 'object' &&
    typeof process.versions.node === 'string'
  );
}

/**
 * 包装 StructuredAI，记录全链路 purpose/prompt/response，供自测与 Agent 排障。
 */
export class RecordingStructuredAI implements StructuredAI {
  readonly runId: string;
  readonly model?: string;
  readonly provider?: string;
  private readonly persist: boolean;
  private readonly traceDir: string;
  private readonly records: AiTraceRecord[] = [];
  private seq = 0;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly inner: StructuredAI,
    options?: RecordingStructuredAIOptions
  ) {
    this.runId = options?.runId ?? `run-${Date.now()}`;
    this.model = options?.model;
    this.provider = options?.provider;
    this.persist = options?.persist !== false;
    this.traceDir = options?.traceDir ?? 'temp/ai-traces';
  }

  getRecords(): readonly AiTraceRecord[] {
    return this.records;
  }

  getTraceFilePath(): string {
    return `${this.traceDir}/${this.runId}.jsonl`;
  }

  async generate<T>(request: StructuredAIRequest<T>): Promise<unknown> {
    const seq = ++this.seq;
    const started = Date.now();
    try {
      const response = await this.inner.generate(request);
      // 调用方（ChapterWritingPipeline / realStructuredAI）可把模型原始文本挂在
      // __rawResponse 字段上供排障。recorder 读取后从此处剥离，避免污染下游消费方。
      const rawResponse = this.extractRawResponse(response);
      const record: AiTraceRecord = {
        seq,
        runId: this.runId,
        purpose: request.purpose,
        schemaName: request.schemaName,
        system: request.system,
        prompt: request.prompt,
        response,
        rawResponse,
        ms: Date.now() - started,
        at: new Date().toISOString(),
        model: this.model,
        provider: this.provider,
      };
      this.records.push(record);
      this.enqueuePersist(record);
      return response;
    } catch (error) {
      const record: AiTraceRecord = {
        seq,
        runId: this.runId,
        purpose: request.purpose,
        schemaName: request.schemaName,
        system: request.system,
        prompt: request.prompt,
        error: error instanceof Error ? error.message : String(error),
        ms: Date.now() - started,
        at: new Date().toISOString(),
        model: this.model,
        provider: this.provider,
      };
      this.records.push(record);
      this.enqueuePersist(record);
      throw error;
    }
  }

  /**
   * 从返回对象上剥离 __rawResponse 字段（若存在），返回原始文本。
   * 仅在 response 是对象/数组元素为对象时才剥离；基本类型（string/number/null）忽略。
   * 剥离后调用方拿到的 response 不再含此临时字段，下游消费方零感知。
   */
  private extractRawResponse(response: unknown): string | undefined {
    if (!response || typeof response !== 'object') return undefined;
    const holder = response as WithRawResponse;
    const raw = holder[RAW_RESPONSE_KEY];
    if (typeof raw !== 'string' || raw.length === 0) return undefined;
    // 从原对象上删除，避免污染下游（JSON.stringify、zod schema 校验、状态投影等）
    try {
      delete holder[RAW_RESPONSE_KEY];
    } catch {
      /* 只读属性则忽略，不阻塞 trace */
    }
    return raw;
  }

  private enqueuePersist(record: AiTraceRecord): void {
    if (!this.persist || !canUseNodeFs()) {
      if (import.meta.env?.DEV) {
        console.debug('[AiTrace]', record.purpose, record.schemaName, `seq=${record.seq}`);
      }
      return;
    }
    this.writeQueue = this.writeQueue.then(async () => {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const filePath = path.resolve(this.getTraceFilePath());
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');
    });
  }

  /** 测试用：等待落盘完成 */
  async flush(): Promise<void> {
    await this.writeQueue;
  }
}

/** DEV 下给 Pipeline 用的开关：显式 true / Vite DEV */
export function shouldEnableAiTrace(explicit?: boolean): boolean {
  if (explicit === true) return true;
  if (explicit === false) return false;
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
}

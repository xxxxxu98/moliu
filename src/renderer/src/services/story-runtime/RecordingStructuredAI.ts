import type { StructuredAI, StructuredAIRequest } from '@/types/story-runtime';

export interface AiTraceRecord {
  seq: number;
  runId: string;
  purpose: StructuredAIRequest<unknown>['purpose'];
  schemaName: string;
  system: string;
  prompt: string;
  response?: unknown;
  error?: string;
  ms: number;
  at: string;
  /** 实际调用模型（真 AI 冒烟等场景写入，便于多跑次对比） */
  model?: string;
  provider?: string;
}

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
      const record: AiTraceRecord = {
        seq,
        runId: this.runId,
        purpose: request.purpose,
        schemaName: request.schemaName,
        system: request.system,
        prompt: request.prompt,
        response,
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

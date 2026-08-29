import type { AgentLoopTransport, AgentMessage } from './AgentLoopRunner';

/**
 * Agent 检索循环的 trace 包装(docs/agent-loop-refactor.md §9)。
 *
 * 每轮 send 记一条 JSONL 到 temp/ai-traces/${runId}.jsonl(与
 * RecordingStructuredAI 同目录同格式,purpose=agent-research),循环结束
 * 由调用方再记一条汇总。出现连续性 Finding 时可直接翻 trace 看
 * 「模型当时查没查、查到什么」,归因从「猜」变「看记录」。
 */
export class RecordingAgentLoopTransport implements AgentLoopTransport {
  private seq = 0;
  private writeQueue: Promise<void> = Promise.resolve();
  readonly runId: string;

  constructor(
    private readonly inner: AgentLoopTransport,
    private readonly options?: {
      runId?: string;
      persist?: boolean;
      traceDir?: string;
      model?: string;
      provider?: string;
    }
  ) {
    this.runId = this.options?.runId ?? `agent-${Date.now()}`;
  }

  getTraceFilePath(): string {
    return `${this.options?.traceDir ?? 'temp/ai-traces'}/${this.runId}.jsonl`;
  }

  async send(
    messages: AgentMessage[],
    options?: { signal?: AbortSignal }
  ): Promise<string> {
    const seq = ++this.seq;
    const started = Date.now();
    const system = messages.find(message => message.role === 'system')?.content ?? '';
    const lastInput = [...messages].reverse().find(message => message.role === 'user')?.content ?? '';
    try {
      const response = await this.inner.send(messages, options);
      this.enqueuePersist({
        seq,
        purpose: 'agent-research' as const,
        schemaName: 'AgentResearchRound',
        system: system.slice(0, 2000),
        prompt: lastInput.slice(0, 4000),
        rawResponse: response,
        ms: Date.now() - started,
      });
      return response;
    } catch (error) {
      this.enqueuePersist({
        seq,
        purpose: 'agent-research' as const,
        schemaName: 'AgentResearchRound',
        system: system.slice(0, 2000),
        prompt: lastInput.slice(0, 4000),
        error: error instanceof Error ? error.message : String(error),
        ms: Date.now() - started,
      });
      throw error;
    }
  }

  /** 循环结束后记录汇总(dossier stats + transcript 概览) */
  recordSummary(summary: Record<string, unknown>): void {
    this.enqueuePersist({
      seq: ++this.seq,
      purpose: 'agent-research' as const,
      schemaName: 'AgentResearchSummary',
      system: '',
      prompt: '',
      response: summary,
      ms: 0,
    });
  }

  private enqueuePersist(record: Record<string, unknown>): void {
    if (this.options?.persist === false || !canUseNodeFs()) {
      return;
    }
    const line = {
      seq: record.seq,
      runId: this.runId,
      purpose: record.purpose,
      schemaName: record.schemaName,
      system: record.system,
      prompt: record.prompt,
      response: record.response,
      rawResponse: record.rawResponse,
      error: record.error,
      ms: record.ms,
      at: new Date().toISOString(),
      model: this.options?.model,
      provider: this.options?.provider,
    };
    this.writeQueue = this.writeQueue.then(async () => {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const filePath = path.resolve(this.getTraceFilePath());
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.appendFile(filePath, `${JSON.stringify(line)}\n`, 'utf8');
    });
  }

  /** 测试用:等待落盘完成 */
  async flush(): Promise<void> {
    await this.writeQueue;
  }
}

function canUseNodeFs(): boolean {
  return (
    typeof process !== 'undefined' &&
    typeof process.versions === 'object' &&
    typeof process.versions.node === 'string'
  );
}

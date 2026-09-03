/**
 * 大纲生成 trace 工具（P1-2）。
 *
 * 复用续写链路 RecordingStructuredAI 的 trace 格式（AiTraceRecord 同构），
 * 但 purpose 用大纲专用类别，避免耦合续写的 StructuredAIRequest 枚举。
 *
 * 设计：
 * - 非阻塞：trace 写入失败不影响主流程（catch 后 console.warn）
 * - 串行化：同一 runId 的多次追加按顺序写，不交错
 * - 浏览器无 fs 时退化为 DEV console.debug
 *
 * 使用：
 *   const tracer = createOutlineTracer({ runId: 'outline-expand-xxx' });
 *   tracer.record({ purpose: 'outline-expand', system, prompt, response, ms });
 *   await tracer.flush();
 */

export type OutlineTracePurpose =
  | 'outline-direction'  // generateDirections()
  | 'outline-expand'     // expandDirection()
  | 'outline-agent'      // OutlineAgent 多轮修复回合（每轮一条）
  | 'outline-roll';      // rollOutlineForward() 滚动续纲批次

export interface OutlineTraceRecord {
  seq: number;
  runId: string;
  purpose: OutlineTracePurpose;
  system: string;
  prompt: string;
  response?: string;
  error?: string;
  ms: number;
  at: string;
  model?: string;
  provider?: string;
}

export interface OutlineTracer {
  record(record: Omit<OutlineTraceRecord, 'seq' | 'runId' | 'at'>): void;
  flush(): Promise<void>;
}

interface OutlineTracerOptions {
  runId?: string;
  traceDir?: string;
  model?: string;
  provider?: string;
}

function canUseNodeFs(): boolean {
  return (
    typeof process !== 'undefined' &&
    typeof globalThis.require === 'function'
  ) || (
    typeof process !== 'undefined' &&
    typeof process.versions?.node === 'string'
  );
}

/**
 * 创建大纲生成 tracer。
 * runId 为空时返回 no-op tracer（生产环境默认不写盘，与续写 shouldEnableAiTrace 口径一致）。
 */
export function createOutlineTracer(options: OutlineTracerOptions = {}): OutlineTracer {
  const runId = options.runId || '';
  const traceDir = options.traceDir || 'temp/ai-traces';
  let seq = 0;
  let writeQueue: Promise<void> = Promise.resolve();

  if (!runId || !canUseNodeFs()) {
    return {
      record(record) {
        try {
          if (import.meta.env?.DEV) {
            // eslint-disable-next-line no-console
            console.debug('[OutlineTrace]', record.purpose, `ms=${record.ms}`, record.error ?? '');
          }
        } catch {
          /* noop */
        }
      },
      async flush() {
        /* noop */
      },
    };
  }

  const filePath = `${traceDir}/${runId}.jsonl`;

  return {
    record(record) {
      seq += 1;
      const full: OutlineTraceRecord = {
        ...record,
        seq,
        runId,
        at: new Date().toISOString(),
        model: options.model,
        provider: options.provider,
      };
      writeQueue = writeQueue
        .then(async () => {
          const fs = await import('node:fs/promises');
          const path = await import('node:path');
          const resolved = path.resolve(filePath);
          await fs.mkdir(path.dirname(resolved), { recursive: true });
          await fs.appendFile(resolved, `${JSON.stringify(full)}\n`, 'utf8');
        })
        .catch(err => {
          // trace 失败绝不影响主流程
          // eslint-disable-next-line no-console
          console.warn('[OutlineTrace] 写入失败，已忽略:', err instanceof Error ? err.message : String(err));
        });
    },
    async flush() {
      await writeQueue;
    },
  };
}

/**
 * 工具调用管线(docs/agent-architecture-refactor.md P1 工具管线钩子):包住任一 AgentToolkit,统一承担:
 * 1. 错误归一化——致命错误(AgentToolFatalError)与用户取消原样冒泡,其余异常转成 {ok:false,error} 回喂模型;
 * 2. 耗时与结果观测——每次调用的 ms/ok/error 推给可注入的 observer,trace 与统计共用这一个出口;
 * 3. 只包装不改语义——参数校验与分发仍在工具箱(TableToolkit)内,管线不解释工具参数。
 *
 * 约束:不发 AI 请求、不落库。observer 抛错不吞掉(由调用方修),以免观测静默失效。
 * observer 不接收工具参数:改稿正文等大字段已在循环 transcript 里,不重复写入观测数据。
 */
import {
  AgentToolFatalError,
  isAbortError,
  type AgentToolkit,
  type ToolCallResult,
  type ToolDescriptor,
} from './AgentToolkit';

/** 单次工具调用的观测记录 */
export interface ToolCallRecord {
  tool: string;
  ok: boolean;
  ms: number;
  /** ok=false 时的失败原因(工具返回的 error,或归一化后的异常信息) */
  error?: string;
}

export type ToolCallObserver = (record: ToolCallRecord) => void;

export interface ToolPipelineOptions {
  onCall?: ToolCallObserver;
  /** 时钟注入(测试用),缺省 Date.now */
  now?: () => number;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 工具调用管线:实现 AgentToolkit,可直接交给 AgentLoopRunner 使用 */
export class ToolPipeline implements AgentToolkit {
  constructor(
    private readonly toolkit: AgentToolkit,
    private readonly options: ToolPipelineOptions = {}
  ) {}

  listTools(): ToolDescriptor[] {
    return this.toolkit.listTools();
  }

  has(tool: string): boolean {
    return this.toolkit.has(tool);
  }

  toolNames(): string[] {
    return this.toolkit.toolNames();
  }

  async call(tool: string, args: unknown): Promise<ToolCallResult> {
    const now = this.options.now ?? Date.now;
    const started = now();
    let result: ToolCallResult;
    try {
      result = await this.toolkit.call(tool, args);
    } catch (error) {
      if (error instanceof AgentToolFatalError || isAbortError(error)) {
        this.observe({ tool, ok: false, ms: now() - started, error: describeError(error) });
        throw error;
      }
      result = { ok: false, error: describeError(error) };
    }
    this.observe(
      result.ok
        ? { tool, ok: true, ms: now() - started }
        : { tool, ok: false, ms: now() - started, error: result.error }
    );
    return result;
  }

  private observe(record: ToolCallRecord): void {
    this.options.onCall?.(record);
  }
}

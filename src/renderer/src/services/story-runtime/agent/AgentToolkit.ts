/**
 * Agent 工具箱通用契约（docs/agent-architecture-refactor.md §2.1）。
 *
 * AgentLoopRunner 只依赖本接口：一个循环器、多套工具箱（Book 只读 / Writer 暂存写 / Outline 暂存写）。
 * 约束：
 * - 工具全部表驱动注册（listTools 即协议说明书），新增工具零改动循环器；
 * - 工具不得直接落库——写类工具只能写进 StagedArtifact，提交由确定性 commit 链完成；
 * - 参数校验失败必须返回 `{ok:false,error}` 而不是抛错，错误文本是给模型看的纠偏信息。
 */

export type ToolCallResult =
  | { ok: true; result: unknown; truncated?: boolean }
  | { ok: false; error: string };

export interface ToolDescriptor {
  name: string;
  description: string;
  /** 参数示例（JSON 文本），直接渲染进系统任务书 */
  args: string;
  /**
   * 是否按「工具名+参数」去重（缺省 true）。
   * 只读查询保持 true 以驱动停滞检测；依赖暂存状态的工具（run_checks / revise）必须设 false，
   * 否则改稿后无法用相同参数重新校验。
   */
  dedupe?: boolean;
}

export interface AgentToolkit {
  listTools(): ToolDescriptor[];
  has(tool: string): boolean;
  toolNames(): string[];
  call(tool: string, args: unknown): Promise<ToolCallResult>;
}

/**
 * 工具执行中的致命错误：runner 不会把它转成 `{ok:false}` 回喂模型，而是原样冒泡终止循环。
 * 用于「继续循环没有意义」的场景（如审查链不可用、持久化端口损坏），普通参数/业务错误请返回 `{ok:false,error}`。
 */
export class AgentToolFatalError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AgentToolFatalError';
  }
}

/** 截断超长文本并加省略号（工具结果回喂模型前的统一裁剪） */
export function clipText(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 读取非空字符串参数；空串/非字符串视为缺省 */
export function readStringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/** 读取整数参数并夹到 [min,max]；非数值回落 fallback */
export function readIntArg(
  args: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number
): number {
  const value = Number(args[key]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

/** 读取字符串数组参数；过滤空项，非数组返回空数组 */
export function readStringArrayArg(args: Record<string, unknown>, key: string): string[] {
  const value = args[key];
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

/**
 * 组合多个工具箱：按注册顺序解析工具名，先命中者执行。
 * 用于 WriterToolkit = BookToolkit(六读) + 写/校验工具，避免继承耦合。
 */
export class CompositeToolkit implements AgentToolkit {
  constructor(private readonly parts: AgentToolkit[]) {
    const seen = new Set<string>();
    for (const part of parts) {
      for (const name of part.toolNames()) {
        if (seen.has(name)) {
          throw new Error(`CompositeToolkit 工具名冲突:${name}`);
        }
        seen.add(name);
      }
    }
  }

  listTools(): ToolDescriptor[] {
    return this.parts.flatMap(part => part.listTools());
  }

  has(tool: string): boolean {
    return this.parts.some(part => part.has(tool));
  }

  toolNames(): string[] {
    return this.parts.flatMap(part => part.toolNames());
  }

  async call(tool: string, args: unknown): Promise<ToolCallResult> {
    const owner = this.parts.find(part => part.has(tool));
    if (!owner) {
      return { ok: false, error: `未知工具:${tool}。可用:${this.toolNames().join('/')}` };
    }
    return owner.call(tool, args);
  }
}

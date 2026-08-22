/**
 * 流式空闲 watchdog：检测「连接挂着但 chunk 停止到达」的网关挂死。
 *
 * 背景（2026-08-21 反重力网关实测）：上游 403 重试风暴期间网关代理线程整体挂起，
 * 连接保持 ESTABLISHED 但一个字节都不再返回。总超时（30 分钟）+ reader.read()
 * 无限期阻塞叠加，导致管线静默干等 35 分钟零输出、零重试。SSE 正常生成时
 * chunk 间隔为毫秒级，推理型模型的「思考间隙」也只有秒级——分钟级零 chunk
 * 只能是挂死，应当按瞬态超时处理尽快放弃并进入退避重试。
 *
 * 两处消费方：
 * - outline 侧 readOpenAiCompatibleStream：直接 await readWithIdleTimeout(reader, ms)
 * - unified.service streamChatText：for-await 包 withStreamIdleDeadline（超时抛错并 cancel 流）
 */

/** 默认空闲上限：正常流式生成的 chunk 间隔远低于此值；默认 3 分钟覆盖慢模型长思考。 */
export const STREAM_IDLE_TIMEOUT_MS = readIdleTimeoutFromEnv();

const STREAM_IDLE_TIMEOUT_LABEL = '流式响应空闲超时';

function readIdleTimeoutFromEnv(): number {
  // 与 utils/env.ts 的 readPositiveIntEnv 同口径，但本文件可能被 node 侧脚本引用，
  // 保持零依赖直接读 process.env（node 场景安全；renderer 场景本模块仅在被
  // 调用时才执行此行，且 vitest/Electron 均有 process 垫片）。
  const raw = typeof process !== 'undefined' ? process.env?.MOLIU_STREAM_IDLE_TIMEOUT_MS : undefined;
  const parsed = typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 180_000;
}

/**
 * 给 ReadableStreamDefaultReader.read() 包一层空闲超时。
 * 每个 chunk 到达即重置计时；超过 idleMs 没有任何字节到达时抛出带
 * STREAM_IDLE_TIMEOUT_LABEL 的超时错误（ai-error-classify 按 timeout 瞬态归类）。
 *
 * 注意：抛错时必须由调用方 cancel reader / 底层连接（浏览器无法从内部终止 fetch body）。
 */
export async function readWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  idleMs: number = STREAM_IDLE_TIMEOUT_MS
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${STREAM_IDLE_TIMEOUT_LABEL}：${idleMs}ms 内未收到任何数据块`)),
          idleMs
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * 给「异步迭代 / 任意长 await」包一层空闲 deadline：超时执行 onDeadline
 * （如 cancel 流），并抛出统一的空闲超时错误。用于 SDK 流（多 chunk 但无 reader 句柄）。
 *
 * 用法：
 *   const guard = createStreamIdleGuard(() => stream.cancel());
 *   try { for await (const chunk of stream) { guard.touch(); ... } }
 *   finally { guard.dispose(); }
 */
export interface StreamIdleGuard {
  /** 收到任何 chunk/进展时调用，重置空闲计时 */
  touch(): void;
  /** 释放定时器；迭代正常结束后必须调用 */
  dispose(): void;
}

export function createStreamIdleGuard(
  onDeadline: () => void,
  idleMs: number = STREAM_IDLE_TIMEOUT_MS
): StreamIdleGuard {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fire = (): void => {
    onDeadline();
  };
  const arm = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(fire, idleMs);
  };
  const touch = (): void => {
    arm();
  };
  arm();
  return {
    touch,
    dispose(): void {
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}

/** watchdog 超时错误的统一文案前缀（供 ai-error-classify 识别） */
export const STREAM_IDLE_TIMEOUT_MESSAGE_PREFIX = STREAM_IDLE_TIMEOUT_LABEL;

/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import {
  readWithIdleTimeout,
  createStreamIdleGuard,
  STREAM_IDLE_TIMEOUT_MS,
} from '../streamIdleWatchdog';

function makeStringReader(
  chunks: string[],
  delays: number[] = []
): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      const delay = delays[index] ?? 0;
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      controller.enqueue(encoder.encode(chunks[index]));
      index += 1;
    },
  });
  return stream.getReader();
}

describe('readWithIdleTimeout', () => {
  it('正常流式 chunk 间隔在阈值内时原样读取', async () => {
    const reader = makeStringReader(['data: a\n\n', 'data: b\n\n'], [10, 10]);
    const first = await readWithIdleTimeout(reader, 1000);
    expect(first.done).toBe(false);
    expect(new TextDecoder().decode(first.value)).toBe('data: a\n\n');
    const second = await readWithIdleTimeout(reader, 1000);
    expect(second.done).toBe(false);
    const end = await readWithIdleTimeout(reader, 1000);
    expect(end.done).toBe(true);
  });

  it('chunk 间隔超过阈值时抛出「空闲超时」错误', async () => {
    const reader = makeStringReader(['data: a\n\n', 'data: b\n\n'], [0, 5000]);
    const first = await readWithIdleTimeout(reader, 1000);
    expect(first.done).toBe(false);
    await expect(readWithIdleTimeout(reader, 1000)).rejects.toThrow(/空闲超时/);
    void reader.cancel().catch(() => {});
  });

  it('默认空闲阈值导出为正整数', () => {
    expect(STREAM_IDLE_TIMEOUT_MS).toBeGreaterThan(0);
  });
});

describe('createStreamIdleGuard', () => {
  it('touch 重置计时，超时触发 onDeadline 一次', async () => {
    let fired = 0;
    const guard = createStreamIdleGuard(() => { fired += 1; }, 80);
    expect(fired).toBe(0);
    await new Promise(resolve => setTimeout(resolve, 30));
    guard.touch(); // 重置
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(fired).toBe(0); // 还未到期
    await new Promise(resolve => setTimeout(resolve, 90));
    expect(fired).toBe(1); // 80ms 无 touch 触发一次
    guard.dispose();
  });

  it('dispose 后不再触发', async () => {
    let fired = 0;
    const guard = createStreamIdleGuard(() => { fired += 1; }, 50);
    guard.dispose();
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(fired).toBe(0);
  });
});

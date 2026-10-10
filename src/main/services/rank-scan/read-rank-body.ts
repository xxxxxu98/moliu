/**
 * 读取榜单响应并限制体积。
 *
 * 先看 Content-Length，再按块累计，超过上限就取消读取。
 */

import { RANK_FETCH_MAX_BYTES } from './constants';

/** 传输层失败，调用方记成榜单没采到 */
export function rankHttpError(message: string): Error {
  const error = new Error(message);
  error.name = 'RankHttpError';
  return error;
}

/** 把响应体读成字节，超过上限抛 RankHttpError */
export async function readRankBody(
  response: Response,
  maxBytes = RANK_FETCH_MAX_BYTES,
): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw rankHttpError('榜单响应过大');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw rankHttpError('榜单响应过大');
    return bytes;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw rankHttpError('榜单响应过大');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** 起点、七猫用 UTF-8；晋江页面是 GBK */
export function decodeRankBytes(bytes: Uint8Array, encoding: 'utf-8' | 'gbk'): string {
  return new TextDecoder(encoding).decode(bytes);
}

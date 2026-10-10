/**
 * 渲染进程的榜单采集入口。
 *
 * 只走 preload 的 rank:scan。没有 Electron 通道时返回 no-channel，雷达继续用经验判断。
 */

import type { RankScanRequest, RankScanResult } from '@/types/rank-scan';
import { sanitizeRankScanResult } from './rank-scan-result';

function unavailable(failure: RankScanResult['failure']): RankScanResult {
  return {
    availability: 'unavailable',
    fetchedAt: new Date().toISOString(),
    sampleCount: 0,
    boards: [],
    failure,
  };
}

/** 按开题筛选采集公开榜。通道缺失或回包损坏时不抛错，交给经验洞察 */
export async function scanPublicRanks(request: RankScanRequest): Promise<RankScanResult> {
  const invoke = typeof window !== 'undefined' ? window.electronAPI?.scanRanks : undefined;
  if (!invoke) return unavailable('no-channel');

  try {
    const sanitized = sanitizeRankScanResult(await invoke(request));
    return sanitized ?? unavailable('invoke-failed');
  } catch (error) {
    console.warn('[rank-scan] 榜单采集失败', error);
    return unavailable('invoke-failed');
  }
}

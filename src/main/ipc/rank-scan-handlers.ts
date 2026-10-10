/**
 * 公开榜单采集 IPC。
 *
 * 只接受本应用窗口的 invoke，入参限制为平台筛选。
 */

import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { rankScanRequestSchema } from '../services/rank-scan/schemas';
import { scanRanks } from '../services/rank-scan/scan-ranks';

/** 题材雷达采集通道 */
export const RANK_SCAN_CHANNEL = 'rank:scan';

export interface RankScanHandlerRegistration {
  dispose: () => void;
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const senderUrl = event.senderFrame?.url ?? '';
  const isTrusted =
    senderUrl.startsWith('file://') ||
    senderUrl.startsWith('http://localhost:') ||
    senderUrl.startsWith('https://localhost:');
  if (!isTrusted) {
    throw new Error('拒绝来自非受信渲染页面的榜单采集请求');
  }
}

/** 注册 rank:scan。重复调用前会先卸掉旧 handler，适配主进程热更新 */
export function registerRankScanHandlers(): RankScanHandlerRegistration {
  ipcMain.removeHandler(RANK_SCAN_CHANNEL);
  ipcMain.handle(RANK_SCAN_CHANNEL, (event, input: unknown) => {
    assertTrustedSender(event);
    return scanRanks(rankScanRequestSchema.parse(input ?? {}));
  });

  return {
    dispose: () => {
      ipcMain.removeHandler(RANK_SCAN_CHANNEL);
    },
  };
}

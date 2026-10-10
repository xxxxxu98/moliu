/**
 * rank:scan 只接受受信窗口和平台筛选。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const ipcMock = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handlers,
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler);
      }),
      removeHandler: vi.fn((channel: string) => {
        handlers.delete(channel);
      }),
    },
  };
});

const scanMock = vi.hoisted(() =>
  vi.fn(async () => ({
    availability: 'unavailable' as const,
    fetchedAt: '2026-10-10T00:00:00.000Z',
    sampleCount: 0,
    boards: [],
  })),
);

vi.mock('electron', () => ({ ipcMain: ipcMock.ipcMain }));
vi.mock('../../services/rank-scan/scan-ranks', () => ({ scanRanks: scanMock }));

import { RANK_SCAN_CHANNEL, registerRankScanHandlers } from '../rank-scan-handlers';

describe('rank scan IPC', () => {
  afterEach(() => {
    ipcMock.handlers.clear();
    vi.clearAllMocks();
  });

  it('rejects untrusted senders and unknown platforms', async () => {
    const registration = registerRankScanHandlers();
    const handler = ipcMock.handlers.get(RANK_SCAN_CHANNEL);
    const trusted = { senderFrame: { url: 'file:///app/index.html' } };
    const evil = { senderFrame: { url: 'https://evil.test/app' } };

    expect(() => handler?.(evil, {})).toThrow(/非受信/);
    expect(() => handler?.(trusted, { platform: 'https://evil.test' })).toThrow();
    await expect(handler?.(trusted, { platform: 'qidian', audience: 'male' })).resolves.toMatchObject({
      availability: 'unavailable',
    });
    expect(scanMock).toHaveBeenCalledWith({ platform: 'qidian', audience: 'male' });

    registration.dispose();
    expect(ipcMock.handlers.size).toBe(0);
  });
});

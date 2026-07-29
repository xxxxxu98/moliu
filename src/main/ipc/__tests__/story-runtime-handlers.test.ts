import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
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

vi.mock('electron', () => ({ ipcMain: ipcMock.ipcMain }));

import { STORY_RUNTIME_CHANNELS, registerStoryRuntimeHandlers } from '../story-runtime-handlers';

describe('story-runtime IPC handlers', () => {
  let userDataPath: string | undefined;

  afterEach(() => {
    ipcMock.handlers.clear();
    vi.clearAllMocks();
    if (userDataPath) {
      rmSync(userDataPath, { recursive: true, force: true });
      userDataPath = undefined;
    }
  });

  it('只注册 invoke/handle 通道并校验参数', () => {
    userDataPath = mkdtempSync(path.join(tmpdir(), 'moliu-story-ipc-'));
    const registration = registerStoryRuntimeHandlers(userDataPath);
    const bootstrapHandler = ipcMock.handlers.get(STORY_RUNTIME_CHANNELS.bootstrap);
    const healthHandler = ipcMock.handlers.get(STORY_RUNTIME_CHANNELS.health);
    const trustedEvent = { senderFrame: { url: 'file:///app/index.html' } };

    expect(ipcMock.handlers.size).toBe(Object.keys(STORY_RUNTIME_CHANNELS).length);
    expect(bootstrapHandler).toBeDefined();
    expect(() =>
      bootstrapHandler?.(trustedEvent, { projectId: '../valid-but-safe' })
    ).not.toThrow();
    expect(() => bootstrapHandler?.(trustedEvent, { projectId: '' })).toThrow();
    expect(healthHandler?.(trustedEvent, '../valid-but-safe')).toMatchObject({
      ok: true,
      foreignKeys: true,
    });

    registration.dispose();
    expect(ipcMock.handlers.size).toBe(0);
  });
});

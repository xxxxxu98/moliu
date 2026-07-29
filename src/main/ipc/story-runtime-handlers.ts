import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import {
  acceptedCommitInputSchema,
  bootstrapInputSchema,
  completeOutboxInputSchema,
  projectIdSchema,
  queryInputSchema,
  readOutboxInputSchema,
  upsertInputSchema,
} from '../services/story-runtime/schemas';
import { StoryRuntimeDatabaseManager, StoryRuntimeRepository } from '../services/story-runtime';

export const STORY_RUNTIME_CHANNELS = {
  bootstrap: 'story-runtime:bootstrap',
  upsert: 'story-runtime:upsert',
  query: 'story-runtime:query',
  commitAccepted: 'story-runtime:commit-accepted',
  readOutbox: 'story-runtime:outbox-read',
  completeOutbox: 'story-runtime:outbox-complete',
  health: 'story-runtime:health',
} as const;

export interface StoryRuntimeHandlerRegistration {
  databaseManager: StoryRuntimeDatabaseManager;
  repository: StoryRuntimeRepository;
  dispose: () => void;
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const senderUrl = event.senderFrame?.url ?? '';
  const isTrusted =
    senderUrl.startsWith('file://') ||
    senderUrl.startsWith('http://localhost:') ||
    senderUrl.startsWith('https://localhost:');
  if (!isTrusted) {
    throw new Error('拒绝来自非受信渲染页面的 Story Runtime 请求');
  }
}

export function registerStoryRuntimeHandlers(
  userDataPath: string
): StoryRuntimeHandlerRegistration {
  const databaseManager = new StoryRuntimeDatabaseManager(userDataPath);
  const repository = new StoryRuntimeRepository(databaseManager);
  const channels = Object.values(STORY_RUNTIME_CHANNELS);

  for (const channel of channels) {
    ipcMain.removeHandler(channel);
  }

  ipcMain.handle(STORY_RUNTIME_CHANNELS.bootstrap, (event, input: unknown) => {
    assertTrustedSender(event);
    return repository.bootstrap(bootstrapInputSchema.parse(input));
  });
  ipcMain.handle(STORY_RUNTIME_CHANNELS.upsert, (event, input: unknown) => {
    assertTrustedSender(event);
    return repository.upsert(upsertInputSchema.parse(input));
  });
  ipcMain.handle(STORY_RUNTIME_CHANNELS.query, (event, input: unknown) => {
    assertTrustedSender(event);
    return repository.query(queryInputSchema.parse(input));
  });
  ipcMain.handle(STORY_RUNTIME_CHANNELS.commitAccepted, (event, input: unknown) => {
    assertTrustedSender(event);
    return repository.commitAccepted(acceptedCommitInputSchema.parse(input));
  });
  ipcMain.handle(STORY_RUNTIME_CHANNELS.readOutbox, (event, input: unknown) => {
    assertTrustedSender(event);
    return repository.readOutbox(readOutboxInputSchema.parse(input));
  });
  ipcMain.handle(STORY_RUNTIME_CHANNELS.completeOutbox, (event, input: unknown) => {
    assertTrustedSender(event);
    return repository.completeOutbox(completeOutboxInputSchema.parse(input));
  });
  ipcMain.handle(STORY_RUNTIME_CHANNELS.health, (event, projectId: unknown) => {
    assertTrustedSender(event);
    return repository.health(projectIdSchema.parse(projectId));
  });

  return {
    databaseManager,
    repository,
    dispose: () => {
      for (const channel of channels) {
        ipcMain.removeHandler(channel);
      }
      databaseManager.closeAll();
    },
  };
}

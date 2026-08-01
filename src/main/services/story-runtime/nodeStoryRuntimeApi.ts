/**
 * 将同步 StoryRuntimeRepository 包装为异步 StoryRuntimeAPI。
 * App IPC handler 与 Node/vitest 冒烟共用同一 Repository 实现。
 */
import { StoryRuntimeDatabaseManager } from './database';
import { StoryRuntimeRepository } from './repository';
import type { StoryRuntimeAPI } from './types';

export interface NodeStoryRuntimeApiHandle {
  api: StoryRuntimeAPI;
  repository: StoryRuntimeRepository;
  databaseManager: StoryRuntimeDatabaseManager;
  userDataPath: string;
  dispose: () => void;
}

export function createNodeStoryRuntimeApi(userDataPath: string): NodeStoryRuntimeApiHandle {
  const databaseManager = new StoryRuntimeDatabaseManager(userDataPath);
  const repository = new StoryRuntimeRepository(databaseManager);

  const api: StoryRuntimeAPI = {
    bootstrap: async input => repository.bootstrap(input),
    upsert: async input => repository.upsert(input),
    query: async input => repository.query(input),
    commitAccepted: async input => repository.commitAccepted(input),
    readOutbox: async input => repository.readOutbox(input),
    completeOutbox: async input => repository.completeOutbox(input),
    health: async projectId => repository.health(projectId),
  };

  return {
    api,
    repository,
    databaseManager,
    userDataPath,
    dispose: () => databaseManager.closeAll(),
  };
}

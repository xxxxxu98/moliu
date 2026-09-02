import { contextBridge, ipcRenderer } from 'electron';
import type { StoryRuntimeAPI } from './main/services/story-runtime';

export interface ElectronAPI {
  storyRuntime: StoryRuntimeAPI;

  // Project
  getProject: (id: string) => Promise<unknown>;
  listProjects: () => Promise<unknown>;
  saveProject: (project: unknown) => Promise<unknown>;
  updateProject: (id: string, updates: unknown) => Promise<unknown>;
  createProject: (data: unknown) => Promise<unknown>;
  deleteProject: (id: string) => Promise<unknown>;

  // Chapter
  loadChapter: (id: string) => Promise<unknown>;
  saveChapter: (data: { projectId: string; chapter: unknown }) => Promise<{ success: boolean; error?: string }>;
  listChapters: (projectId: string) => Promise<unknown>;

  // AI
  testAIConnection: (provider: string, config: { apiKey: string; baseUrl?: string; model?: string }) => Promise<{ success: boolean; error?: string; errorCode?: string; models?: string[]; responseTime?: number }>;

  // Memory - Characters
  updateCharacter: (data: { projectId: string; character: unknown }) => Promise<{ success: boolean; error?: string }>;
  deleteCharacter: (data: { projectId: string; characterId: string }) => Promise<{ success: boolean; error?: string }>;
  listCharacters: (projectId: string) => Promise<unknown>;

  // Memory - Foreshadows
  updateForeshadow: (data: { projectId: string; foreshadow: unknown }) => Promise<{ success: boolean; error?: string }>;
  deleteForeshadow: (data: { projectId: string; foreshadowId: string }) => Promise<{ success: boolean; error?: string }>;
  listForeshadows: (projectId: string) => Promise<unknown>;

  // Memory - Search
  searchMemory: (data: { projectId: string; query: string }) => Promise<{ characters: unknown[]; foreshadows: unknown[] }>;

  // Memory Files - File System Backup
  saveMemoryFile: (data: { projectId: string; filePath: string; content: string }) => Promise<{ success: boolean; error?: string }>;
  loadMemoryFile: (data: { projectId: string; filePath: string }) => Promise<string | null>;
  listMemoryFiles: (data: { projectId: string; basePath: string }) => Promise<string[]>;
  deleteMemoryFile: (data: { projectId: string; filePath: string }) => Promise<{ success: boolean; error?: string }>;

  // Settings
  getSettings: () => Promise<unknown>;
  saveSettings: (settings: unknown) => Promise<unknown>;
  getAIProviders: () => Promise<unknown>;
  saveAIProviders: (providers: unknown) => Promise<unknown>;
}

const api: ElectronAPI = {
  storyRuntime: {
    bootstrap: input => ipcRenderer.invoke('story-runtime:bootstrap', input),
    upsert: input => ipcRenderer.invoke('story-runtime:upsert', input),
    query: input => ipcRenderer.invoke('story-runtime:query', input),
    commitAccepted: input =>
      ipcRenderer.invoke('story-runtime:commit-accepted', input),
    readOutbox: input => ipcRenderer.invoke('story-runtime:outbox-read', input),
    completeOutbox: input =>
      ipcRenderer.invoke('story-runtime:outbox-complete', input),
    health: projectId => ipcRenderer.invoke('story-runtime:health', projectId),
  },

  // Project
  getProject: (id: string) => ipcRenderer.invoke('project:get', id),
  listProjects: () => ipcRenderer.invoke('project:list'),
  saveProject: (project: unknown) => ipcRenderer.invoke('project:save', project),
  updateProject: (id: string, updates: unknown) => ipcRenderer.invoke('project:update', id, updates),
  createProject: (data: unknown) => ipcRenderer.invoke('project:create', data),
  deleteProject: (id: string) => ipcRenderer.invoke('project:delete', id),

  // Chapter
  loadChapter: (id: string) => ipcRenderer.invoke('chapter:load', id),
  saveChapter: (data: { projectId: string; chapter: unknown }) =>
    ipcRenderer.invoke('chapter:save', data),
  listChapters: (projectId: string) => ipcRenderer.invoke('chapter:list', projectId),

  // AI
  testAIConnection: (provider: string, config: unknown) =>
    ipcRenderer.invoke('ai:test', provider, config),

  // Memory - Characters
  updateCharacter: (data: { projectId: string; character: unknown }) =>
    ipcRenderer.invoke('character:update', data),
  deleteCharacter: (data: { projectId: string; characterId: string }) =>
    ipcRenderer.invoke('character:delete', data),
  listCharacters: (projectId: string) => ipcRenderer.invoke('character:list', projectId),

  // Memory - Foreshadows
  updateForeshadow: (data: { projectId: string; foreshadow: unknown }) =>
    ipcRenderer.invoke('foreshadow:update', data),
  deleteForeshadow: (data: { projectId: string; foreshadowId: string }) =>
    ipcRenderer.invoke('foreshadow:delete', data),
  listForeshadows: (projectId: string) => ipcRenderer.invoke('foreshadow:list', projectId),

  // Memory - Search
  searchMemory: (data: { projectId: string; query: string }) =>
    ipcRenderer.invoke('memory:search', data),

  // Memory Files - File System Backup
  saveMemoryFile: (data: { projectId: string; filePath: string; content: string }) =>
    ipcRenderer.invoke('memory:file:save', data),
  loadMemoryFile: (data: { projectId: string; filePath: string }) =>
    ipcRenderer.invoke('memory:file:load', data),
  listMemoryFiles: (data: { projectId: string; basePath: string }) =>
    ipcRenderer.invoke('memory:file:list', data),
  deleteMemoryFile: (data: { projectId: string; filePath: string }) =>
    ipcRenderer.invoke('memory:file:delete', data),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),
  getAIProviders: () => ipcRenderer.invoke('ai-providers:get'),
  saveAIProviders: (providers: unknown) => ipcRenderer.invoke('ai-providers:save', providers),
};

contextBridge.exposeInMainWorld('electronAPI', api);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

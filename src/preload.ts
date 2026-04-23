import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
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
  deleteChapter: (data: { projectId: string; chapterId: string }) => Promise<{ success: boolean; error?: string }>;

  // AI
  generateText: (params: unknown) => Promise<unknown>;
  checkConsistency: (text: string) => Promise<unknown>;
  testAIConnection: (provider: string, config: { apiKey: string; baseUrl?: string; model?: string }) => Promise<{ success: boolean; error?: string; errorCode?: string; models?: string[]; responseTime?: number }>;
  generateOutline: (params: {
    prompt: string;
    provider: string;
    config: {
      apiKey: string;
      baseUrl?: string;
      model?: string;
      maxTokens?: number;
      temperature?: number;
      topP?: number;
    };
  }) => Promise<void>;

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

  // Settings
  getSettings: () => Promise<unknown>;
  saveSettings: (settings: unknown) => Promise<unknown>;
  getAIProviders: () => Promise<unknown>;
  saveAIProviders: (providers: unknown) => Promise<unknown>;

  // Events
  onAIStream: (callback: (chunk: string) => void) => () => void;
  onProjectUpdate: (callback: (data: unknown) => void) => () => void;
  onGenerationProgress: (callback: (progress: number) => void) => () => void;
  onOutlineChunk: (callback: (data: { content: string; fullContent: string }) => void) => () => void;
  onOutlineDone: (callback: () => void) => () => void;
  onOutlineComplete: (callback: (data: { result: any }) => void) => () => void;
  onOutlineError: (callback: (data: { error: string }) => void) => () => void;
}

const api: ElectronAPI = {
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
  deleteChapter: (data: { projectId: string; chapterId: string }) =>
    ipcRenderer.invoke('chapter:delete', data),

  // AI
  generateText: (params: unknown) => ipcRenderer.invoke('ai:generate', params),
  checkConsistency: (text: string) => ipcRenderer.invoke('ai:check', text),
  testAIConnection: (provider: string, config: unknown) =>
    ipcRenderer.invoke('ai:test', provider, config),
  generateOutline: (params) => ipcRenderer.invoke('ai:generate-outline', params),

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

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),
  getAIProviders: () => ipcRenderer.invoke('ai-providers:get'),
  saveAIProviders: (providers: unknown) => ipcRenderer.invoke('ai-providers:save', providers),

  // Events
  onAIStream: (callback: (chunk: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, chunk: string) => callback(chunk);
    ipcRenderer.on('ai:stream', handler);
    return () => ipcRenderer.removeListener('ai:stream', handler);
  },

  onProjectUpdate: (callback: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('project:update', handler);
    return () => ipcRenderer.removeListener('project:update', handler);
  },

  onGenerationProgress: (callback: (progress: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: number) =>
      callback(progress);
    ipcRenderer.on('generation:progress', handler);
    return () => ipcRenderer.removeListener('generation:progress', handler);
  },

  // Outline generation streaming events
  onOutlineChunk: (callback: (data: { content: string; fullContent: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { content: string; fullContent: string }) => callback(data);
    ipcRenderer.on('ai:outline-chunk', handler);
    return () => ipcRenderer.removeListener('ai:outline-chunk', handler);
  },

  onOutlineDone: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('ai:outline-done', handler);
    return () => ipcRenderer.removeListener('ai:outline-done', handler);
  },

  onOutlineComplete: (callback: (data: { result: any }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { result: any }) => callback(data);
    ipcRenderer.on('ai:outline-complete', handler);
    return () => ipcRenderer.removeListener('ai:outline-complete', handler);
  },

  onOutlineError: (callback: (data: { error: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { error: string }) => callback(data);
    ipcRenderer.on('ai:outline-error', handler);
    return () => ipcRenderer.removeListener('ai:outline-error', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

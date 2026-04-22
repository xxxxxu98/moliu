import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  // Project
  loadProject: (id: string) => Promise<unknown>;
  listProjects: () => Promise<unknown>;
  saveProject: (project: unknown) => Promise<unknown>;
  createProject: (data: unknown) => Promise<unknown>;

  // Chapter
  loadChapter: (id: string) => Promise<unknown>;
  saveChapter: (data: unknown) => Promise<unknown>;
  listChapters: (projectId: string) => Promise<unknown>;

  // AI
  generateText: (params: unknown) => Promise<unknown>;
  checkConsistency: (text: string) => Promise<unknown>;
  testAIConnection: (provider: string, config: unknown) => Promise<unknown>;

  // Memory
  searchMemory: (query: string) => Promise<unknown>;
  updateCharacter: (character: unknown) => Promise<unknown>;
  updateForeshadow: (foreshadow: unknown) => Promise<unknown>;

  // Settings
  getSettings: () => Promise<unknown>;
  saveSettings: (settings: unknown) => Promise<unknown>;

  // Events
  onAIStream: (callback: (chunk: string) => void) => () => void;
  onProjectUpdate: (callback: (data: unknown) => void) => () => void;
  onGenerationProgress: (callback: (progress: number) => void) => () => void;
}

const api: ElectronAPI = {
  // Project
  loadProject: (id: string) => ipcRenderer.invoke('project:load', id),
  listProjects: () => ipcRenderer.invoke('project:list'),
  saveProject: (project: unknown) => ipcRenderer.invoke('project:save', project),
  createProject: (data: unknown) => ipcRenderer.invoke('project:create', data),

  // Chapter
  loadChapter: (id: string) => ipcRenderer.invoke('chapter:load', id),
  saveChapter: (data: unknown) => ipcRenderer.invoke('chapter:save', data),
  listChapters: (projectId: string) => ipcRenderer.invoke('chapter:list', projectId),

  // AI
  generateText: (params: unknown) => ipcRenderer.invoke('ai:generate', params),
  checkConsistency: (text: string) => ipcRenderer.invoke('ai:check', text),
  testAIConnection: (provider: string, config: unknown) =>
    ipcRenderer.invoke('ai:test', provider, config),

  // Memory
  searchMemory: (query: string) => ipcRenderer.invoke('memory:search', query),
  updateCharacter: (character: unknown) =>
    ipcRenderer.invoke('character:update', character),
  updateForeshadow: (foreshadow: unknown) =>
    ipcRenderer.invoke('foreshadow:update', foreshadow),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),

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
};

contextBridge.exposeInMainWorld('electronAPI', api);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import Store from 'electron-store';
import { testAIProvider, generateOutlineStream, type AIProviderType } from './main/services/ai-providers';
import { testConnection } from './main/services/ai-client';
import { encryptApiKey, decryptApiKey, isEncrypted } from './main/crypto';

// Remove default application menu for cleaner UI
Menu.setApplicationMenu(null);

// Initialize electron-store for persistent settings
const settingsStore = new Store({
  name: 'moliu-settings',
  defaults: {
    settings: {
      theme: 'system',
      accentColor: '#6366f1',
      locale: 'zh-CN',
      contentLanguage: 'zh-CN',
      autoSave: true,
      autoSaveInterval: 30,
      streamOutput: true,
      fontSize: 16,
      lineHeight: 1.8,
      defaultModel: 'openai-gpt-4o',
    },
    aiProviders: [],
  },
});

// Initialize electron-store for projects
const projectStore = new Store({
  name: 'moliu-projects',
  defaults: {
    projects: [],
  },
});

// Types
interface Project {
  id: string;
  name: string;
  description: string;
  genre: string[];
  wordCount: number;
  status: 'planning' | 'writing' | 'paused' | 'completed';
  volumes: Volume[];
  chapters: Chapter[];
  characters: any[];
  worldSchema: WorldSchema;
  foreshadows: any[];
  plotOutline: any[];
  createdAt: string;
  updatedAt: string;
}

interface Volume {
  id: string;
  name: string;
  orderIndex: number;
}

interface Chapter {
  id: string;
  volumeId: string;
  title: string;
  content: string;
  wordCount: number;
  orderIndex: number;
  version: number;
  status: 'draft' | 'editing' | 'final';
  createdAt: string;
  updatedAt: string;
}

interface WorldSchema {
  locations: any[];
  rules: any[];
  factions: any[];
}

interface Character {
  id: string;
  name: string;
  role: string;
  description: string;
  appearance?: string;
  personality?: string;
  background?: string;
  motivation?: string;
  arc?: string;
  relationships?: any[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface Foreshadow {
  id: string;
  title: string;
  description: string;
  type: 'mystery' | 'prophecy' | 'hint' | 'symbol' | 'character' | 'plot';
  hintChapterId?: string;
  revealChapterId?: string;
  status: 'planted' | 'developing' | 'revealed' | 'resolved';
  createdAt: string;
  updatedAt: string;
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 1200,
    minWidth: 1200,
    minHeight: 800,
    title: '墨流 - AI小说创作助手',
    icon: path.join(__dirname, '../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// IPC Handlers for Settings
ipcMain.handle('settings:get', () => {
  return settingsStore.get('settings');
});

ipcMain.handle('settings:save', (_event, settings) => {
  settingsStore.set('settings', settings);
  return { success: true };
});

// IPC Handlers for AI Providers with encryption
interface StoredProvider {
  id: string;
  name: string;
  provider: string;
  apiKey: string; // Stored encrypted
  baseUrl?: string;
  enabled: boolean;
  modelName: string;
  maxTokens: number;
  generationConfig?: {
    temperature: number;
    topP: number;
    frequencyPenalty: number;
    presencePenalty: number;
  };
  isValid?: boolean;
}

ipcMain.handle('ai-providers:get', () => {
  const stored = settingsStore.get('aiProviders') as StoredProvider[] || [];
  // Decrypt API keys before sending to renderer
  return stored.map(p => ({
    ...p,
    apiKey: decryptApiKey(p.apiKey),
  }));
});

ipcMain.handle('ai-providers:save', (_event, providers: StoredProvider[]) => {
  // Encrypt API keys before storing
  const encrypted = providers.map(p => ({
    ...p,
    apiKey: encryptApiKey(p.apiKey),
  }));
  settingsStore.set('aiProviders', encrypted);
  return { success: true };
});

ipcMain.handle('ai:test', async (_event, provider: string, config: { apiKey: string; baseUrl?: string }) => {
  return await testConnection(provider, config.apiKey, config.baseUrl);
});

// IPC Handlers for Projects
ipcMain.handle('project:list', () => {
  const projects = projectStore.get('projects') as Project[];
  return projects || [];
});

ipcMain.handle('project:get', (_event, id: string) => {
  const projects = projectStore.get('projects') as Project[];
  return projects.find(p => p.id === id) || null;
});

ipcMain.handle('project:create', (_event, project: Project) => {
  const projects = projectStore.get('projects') as Project[];
  const newProject = {
    ...project,
    id: project.id || `proj-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  projects.push(newProject);
  projectStore.set('projects', projects);
  return newProject;
});

ipcMain.handle('project:save', (_event, project: Project) => {
  const projects = projectStore.get('projects') as Project[];
  const index = projects.findIndex(p => p.id === project.id);
  if (index >= 0) {
    projects[index] = {
      ...project,
      updatedAt: new Date().toISOString(),
    };
  } else {
    projects.push({
      ...project,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  projectStore.set('projects', projects);
  return { success: true };
});

ipcMain.handle('project:update', (_event, id: string, updates: Partial<Project>) => {
  const projects = projectStore.get('projects') as Project[];
  const index = projects.findIndex(p => p.id === id);
  if (index >= 0) {
    projects[index] = {
      ...projects[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    projectStore.set('projects', projects);
    return projects[index];
  }
  return null;
});

ipcMain.handle('project:delete', (_event, id: string) => {
  const projects = projectStore.get('projects') as Project[];
  const filtered = projects.filter(p => p.id !== id);
  projectStore.set('projects', filtered);
  return { success: true };
});

// IPC Handler for AI Outline Generation (Streaming)
ipcMain.handle('ai:generate-outline', async (event, { prompt, provider, config }: { 
  prompt: string; 
  provider: string; 
  config: { apiKey: string; baseUrl?: string };
}) => {
  try {
    await generateOutlineStream(event, prompt, provider, config);
  } catch (error) {
    event.sender.send('ai:outline-error', { error: String(error) });
  }
});

// IPC Handlers for Chapters
ipcMain.handle('chapter:load', (_event, id: string) => {
  const projects = projectStore.get('projects') as Project[];
  for (const project of projects) {
    const chapter = project.chapters?.find(c => c.id === id);
    if (chapter) {
      return chapter;
    }
  }
  return null;
});

ipcMain.handle('chapter:save', (_event, data: { projectId: string; chapter: Chapter }) => {
  const { projectId, chapter } = data;
  const projects = projectStore.get('projects') as Project[];
  const projectIndex = projects.findIndex(p => p.id === projectId);

  if (projectIndex < 0) {
    return { success: false, error: 'Project not found' };
  }

  const project = projects[projectIndex];
  if (!project.chapters) {
    project.chapters = [];
  }

  const chapterIndex = project.chapters.findIndex(c => c.id === chapter.id);
  const now = new Date().toISOString();

  if (chapterIndex >= 0) {
    project.chapters[chapterIndex] = {
      ...chapter,
      updatedAt: now,
    };
  } else {
    project.chapters.push({
      ...chapter,
      createdAt: chapter.createdAt || now,
      updatedAt: now,
    });
  }

  project.updatedAt = now;
  projectStore.set('projects', projects);
  return { success: true };
});

ipcMain.handle('chapter:list', (_event, projectId: string) => {
  const projects = projectStore.get('projects') as Project[];
  const project = projects.find(p => p.id === projectId);

  if (!project) {
    return [];
  }

  return project.chapters || [];
});

// IPC Handlers for Memory (Characters & Foreshadows)
ipcMain.handle('character:update', (_event, data: { projectId: string; character: Character }) => {
  const { projectId, character } = data;
  const projects = projectStore.get('projects') as Project[];
  const projectIndex = projects.findIndex(p => p.id === projectId);

  if (projectIndex < 0) {
    return { success: false, error: 'Project not found' };
  }

  const project = projects[projectIndex];
  if (!project.characters) {
    project.characters = [];
  }

  const characterIndex = project.characters.findIndex((c: Character) => c.id === character.id);
  const now = new Date().toISOString();

  if (characterIndex >= 0) {
    project.characters[characterIndex] = {
      ...character,
      updatedAt: now,
    };
  } else {
    project.characters.push({
      ...character,
      createdAt: character.createdAt || now,
      updatedAt: now,
    });
  }

  project.updatedAt = now;
  projectStore.set('projects', projects);
  return { success: true };
});

ipcMain.handle('foreshadow:update', (_event, data: { projectId: string; foreshadow: Foreshadow }) => {
  const { projectId, foreshadow } = data;
  const projects = projectStore.get('projects') as Project[];
  const projectIndex = projects.findIndex(p => p.id === projectId);

  if (projectIndex < 0) {
    return { success: false, error: 'Project not found' };
  }

  const project = projects[projectIndex];
  if (!project.foreshadows) {
    project.foreshadows = [];
  }

  const foreshadowIndex = project.foreshadows.findIndex((f: Foreshadow) => f.id === foreshadow.id);
  const now = new Date().toISOString();

  if (foreshadowIndex >= 0) {
    project.foreshadows[foreshadowIndex] = {
      ...foreshadow,
      updatedAt: now,
    };
  } else {
    project.foreshadows.push({
      ...foreshadow,
      createdAt: foreshadow.createdAt || now,
      updatedAt: now,
    });
  }

  project.updatedAt = now;
  projectStore.set('projects', projects);
  return { success: true };
});

ipcMain.handle('memory:search', (_event, data: { projectId: string; query: string }) => {
  const { projectId, query } = data;
  const projects = projectStore.get('projects') as Project[];
  const project = projects.find(p => p.id === projectId);

  if (!project) {
    return { characters: [], foreshadows: [] };
  }

  const searchTerm = query.toLowerCase();
  const results = {
    characters: [] as Character[],
    foreshadows: [] as Foreshadow[],
  };

  // Search characters
  if (project.characters) {
    results.characters = project.characters.filter((c: Character) => {
      return (
        c.name?.toLowerCase().includes(searchTerm) ||
        c.description?.toLowerCase().includes(searchTerm) ||
        c.personality?.toLowerCase().includes(searchTerm) ||
        c.background?.toLowerCase().includes(searchTerm) ||
        c.motivation?.toLowerCase().includes(searchTerm) ||
        c.notes?.toLowerCase().includes(searchTerm)
      );
    });
  }

  // Search foreshadows
  if (project.foreshadows) {
    results.foreshadows = project.foreshadows.filter((f: Foreshadow) => {
      return (
        f.title?.toLowerCase().includes(searchTerm) ||
        f.description?.toLowerCase().includes(searchTerm)
      );
    });
  }

  return results;
});

ipcMain.handle('character:delete', (_event, data: { projectId: string; characterId: string }) => {
  const { projectId, characterId } = data;
  const projects = projectStore.get('projects') as Project[];
  const projectIndex = projects.findIndex(p => p.id === projectId);

  if (projectIndex < 0) {
    return { success: false, error: 'Project not found' };
  }

  const project = projects[projectIndex];
  if (!project.characters) {
    return { success: false, error: 'No characters found' };
  }

  const characterIndex = project.characters.findIndex((c: Character) => c.id === characterId);
  if (characterIndex < 0) {
    return { success: false, error: 'Character not found' };
  }

  project.characters.splice(characterIndex, 1);
  project.updatedAt = new Date().toISOString();
  projectStore.set('projects', projects);
  return { success: true };
});

ipcMain.handle('character:list', (_event, projectId: string) => {
  const projects = projectStore.get('projects') as Project[];
  const project = projects.find(p => p.id === projectId);

  if (!project) {
    return [];
  }

  return project.characters || [];
});

ipcMain.handle('foreshadow:delete', (_event, data: { projectId: string; foreshadowId: string }) => {
  const { projectId, foreshadowId } = data;
  const projects = projectStore.get('projects') as Project[];
  const projectIndex = projects.findIndex(p => p.id === projectId);

  if (projectIndex < 0) {
    return { success: false, error: 'Project not found' };
  }

  const project = projects[projectIndex];
  if (!project.foreshadows) {
    return { success: false, error: 'No foreshadows found' };
  }

  const foreshadowIndex = project.foreshadows.findIndex((f: Foreshadow) => f.id === foreshadowId);
  if (foreshadowIndex < 0) {
    return { success: false, error: 'Foreshadow not found' };
  }

  project.foreshadows.splice(foreshadowIndex, 1);
  project.updatedAt = new Date().toISOString();
  projectStore.set('projects', projects);
  return { success: true };
});

ipcMain.handle('foreshadow:list', (_event, projectId: string) => {
  const projects = projectStore.get('projects') as Project[];
  const project = projects.find(p => p.id === projectId);

  if (!project) {
    return [];
  }

  return project.foreshadows || [];
});

ipcMain.handle('chapter:delete', (_event, data: { projectId: string; chapterId: string }) => {
  const { projectId, chapterId } = data;
  const projects = projectStore.get('projects') as Project[];
  const projectIndex = projects.findIndex(p => p.id === projectId);

  if (projectIndex < 0) {
    return { success: false, error: 'Project not found' };
  }

  const project = projects[projectIndex];
  if (!project.chapters) {
    return { success: false, error: 'No chapters found' };
  }

  const chapterIndex = project.chapters.findIndex((c: Chapter) => c.id === chapterId);
  if (chapterIndex < 0) {
    return { success: false, error: 'Chapter not found' };
  }

  project.chapters.splice(chapterIndex, 1);
  project.updatedAt = new Date().toISOString();
  projectStore.set('projects', projects);
  return { success: true };
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

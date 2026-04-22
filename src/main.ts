import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import Store from 'electron-store';
import { testAIProvider, generateOutlineStream, type AIProviderType } from './main/services/ai-providers';

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

ipcMain.handle('ai-providers:get', () => {
  return settingsStore.get('aiProviders');
});

ipcMain.handle('ai-providers:save', (_event, providers) => {
  settingsStore.set('aiProviders', providers);
  return { success: true };
});

ipcMain.handle('ai:test', async (_event, provider: AIProviderType, config: { apiKey: string; baseUrl?: string }) => {
  return await testAIProvider(provider, config);
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

ipcMain.handle('project:delete', (_event, id: string) => {
  const projects = projectStore.get('projects') as Project[];
  const filtered = projects.filter(p => p.id !== id);
  projectStore.set('projects', filtered);
  return { success: true };
});

// IPC Handler for AI Outline Generation (Streaming)
ipcMain.handle('ai:generate-outline', async (event, { prompt, provider, config }: { prompt: string; provider: AIProviderType; config: { apiKey: string; baseUrl?: string } }) => {
  try {
    await generateOutlineStream(event, prompt, provider, config);
  } catch (error) {
    event.sender.send('ai:outline-error', { error: String(error) });
  }
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

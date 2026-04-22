import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import Store from 'electron-store';

// Initialize electron-store for persistent settings
const store = new Store({
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
  return store.get('settings');
});

ipcMain.handle('settings:save', (_event, settings) => {
  store.set('settings', settings);
  return { success: true };
});

ipcMain.handle('ai-providers:get', () => {
  return store.get('aiProviders');
});

ipcMain.handle('ai-providers:save', (_event, providers) => {
  store.set('aiProviders', providers);
  return { success: true };
});

ipcMain.handle('ai:test', async (_event, provider: string, config: { apiKey: string; baseUrl?: string }) => {
  try {
    // Simulate API test - in production, this would make a real request
    await new Promise(resolve => setTimeout(resolve, 1000));
    // For now, just return success for non-empty API keys
    return { success: !!config.apiKey };
  } catch {
    return { success: false, error: 'Connection failed' };
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

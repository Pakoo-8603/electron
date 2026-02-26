import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { registerIpcHandlers } from './ipc';
import { SyncService } from './sync-service';
import { getConfig, getStoredPassword, getSyncSettings } from './store';

const syncService = new SyncService();

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  registerIpcHandlers();

  const config = getConfig();
  const syncSettings = getSyncSettings();
  const password = await getStoredPassword();
  syncService.start(config, password, syncSettings);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  syncService.stop();
});

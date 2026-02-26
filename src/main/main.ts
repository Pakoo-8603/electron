import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { registerIpcHandlers } from './ipc';
import { SyncService } from './sync-service';
import { getDevices, getSelectedDeviceId, getStoredPassword, getSyncSettings } from './store';

const syncService = new SyncService();

function createWindow() {
  const win = new BrowserWindow({
    width: 1300,
    height: 820,
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

  const devices = getDevices();
  const selectedId = getSelectedDeviceId();
  const selectedDevice = devices.find((item) => item.id === selectedId) ?? devices[0];
  const syncSettings = getSyncSettings();
  const password = await getStoredPassword(selectedDevice.id);

  syncService.start(selectedDevice.config, password, syncSettings);

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

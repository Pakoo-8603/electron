import path from 'node:path';
import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron';
import Store from 'electron-store';
import { GatewayDatabase } from './db/database.js';
import { DeviceManager } from './gateway/device-manager.js';
import { registerIpc } from './ipc/channels.js';
import type { GatewaySettings } from '../shared/types.js';

const settingsStore = new Store<GatewaySettings>({
  defaults: {
    tenantId: 'demo-tenant',
    siteId: 'demo-site',
    backendUrl: 'https://example.com',
    apiToken: 'replace-token',
    batchSize: 100,
    flushIntervalSeconds: 5,
    listenerPort: 9876,
    heartbeatTimeoutSeconds: 30
  }
});

let windowRef: BrowserWindow | null = null;
let tray: Tray | null = null;
let manager: DeviceManager;

const createWindow = async () => {
  windowRef = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'dist/main/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await windowRef.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await windowRef.loadFile(path.join(app.getAppPath(), 'dist/renderer/index.html'));
  }
};

const createTray = () => {
  tray = new Tray(nativeImage.createEmpty());
  const menu = Menu.buildFromTemplate([
    { label: 'Abrir UI', click: () => windowRef?.show() },
    { label: 'Reiniciar conexiones', click: () => manager.stop().then(() => manager.start()) },
    { type: 'separator' },
    { label: 'Salir', click: () => app.quit() }
  ]);
  tray.setToolTip('Hikvision Gateway');
  tray.setContextMenu(menu);
};

app.whenReady().then(async () => {
  const db = new GatewayDatabase();
  manager = new DeviceManager(db, settingsStore.store);
  registerIpc(manager, db, () => settingsStore.store);
  await manager.start();
  await createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  // keep background behavior via tray
});

app.on('before-quit', async () => {
  if (manager) await manager.stop();
});

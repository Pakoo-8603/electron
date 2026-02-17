import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } from 'electron';
import path from 'node:path';
import Store from 'electron-store';
import log from 'electron-log';
import { GatewayDatabase } from '../db/database';
import { CredentialStore } from '../services/credentialStore';
import { DeviceManager } from '../services/deviceManager';
import { HttpListenerServer } from '../connectors/httpListenerServer';
import { OutboxSync } from '../services/outboxSync';
import { DeviceConfig, GatewaySettings } from '../../shared/types';

const configStore = new Store<{ settings: GatewaySettings | null }>({ defaults: { settings: null } });
const credentials = new CredentialStore();

let db: GatewayDatabase;
let manager: DeviceManager;
let outbox: OutboxSync;
let listener: HttpListenerServer;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    webPreferences: {
      preload: path.join(__dirname, '../ipc/preload.js')
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) void mainWindow.loadURL(devUrl);
  else void mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
}

function setupTray(): void {
  tray = new Tray(nativeImage.createEmpty());
  const refresh = () => {
    const status = manager.status(outbox.getLatency());
    const hasDisconnected = status.devices.some((d) => d.status === 'disconnected');
    const label = hasDisconnected ? 'Gateway (degraded)' : 'Gateway (healthy)';
    tray?.setToolTip(label);

    tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Abrir UI', click: () => mainWindow?.show() },
        {
          label: 'Reiniciar conexiones',
          click: () => {
            manager.stopAll();
            void manager.startAll();
          }
        },
        { label: 'Salir', click: () => app.quit() }
      ])
    );
  };

  setInterval(refresh, 5000);
  refresh();
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => configStore.get('settings'));
  ipcMain.handle('settings:set', async (_e, settings: GatewaySettings) => {
    configStore.set('settings', settings);
    await listener.stop();
    await listener.start(settings.listenerPort);
    return true;
  });

  ipcMain.handle('devices:list', () => db.getDevices());
  ipcMain.handle('devices:save', async (_e, device: Omit<DeviceConfig, 'passwordRef' | 'createdAt'> & { password: string }) => {
    const passwordRef = await credentials.savePassword(device.id, device.password);
    db.upsertDevice({ ...device, passwordRef, createdAt: new Date().toISOString() });
    await manager.startDevice({ ...device, passwordRef, createdAt: new Date().toISOString() });
    return true;
  });

  ipcMain.handle('devices:delete', async (_e, id: string) => {
    const device = db.getDevices().find((d) => d.id === id);
    if (device) await credentials.deletePassword(device.passwordRef);
    db.deleteDevice(id);
    return true;
  });

  ipcMain.handle('gateway:status', () => manager.status(outbox.getLatency()));
  ipcMain.handle('events:recent', () => db.getRecentEvents(200));
}

app.whenReady().then(async () => {
  log.initialize();

  db = await GatewayDatabase.create();
  manager = new DeviceManager(db, credentials, () => (configStore.get('settings') as GatewaySettings | null));
  outbox = new OutboxSync(db, () => (configStore.get('settings') as GatewaySettings | null));
  listener = new HttpListenerServer(async (payload) => {
    const defaultDevice = db.getDevices()[0];
    if (!defaultDevice) return;
    await manager.ingestRawEvent(defaultDevice.id, payload);
  });

  registerIpc();
  createWindow();
  setupTray();

  const settings = configStore.get('settings') as GatewaySettings | null;
  if (settings) await listener.start(settings.listenerPort);
  await manager.startAll();
  outbox.start();
});

app.on('window-all-closed', (e) => e.preventDefault());

app.on('before-quit', async () => {
  outbox?.stop();
  manager?.stopAll();
  await listener?.stop();
});

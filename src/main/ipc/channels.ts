import { ipcMain } from 'electron';
import type { GatewaySettings } from '../../shared/types.js';
import type { DeviceManager } from '../gateway/device-manager.js';
import type { GatewayDatabase } from '../db/database.js';

export const registerIpc = (manager: DeviceManager, db: GatewayDatabase, getSettings: () => GatewaySettings) => {
  ipcMain.handle('gateway:get-state', async () => ({
    devices: manager.listDevices(),
    statuses: manager.getStatuses(),
    recentEvents: db.recentEvents(200),
    queueDepth: manager.queueDepth(),
    cloudLatency: manager.cloudLatency(),
    settings: getSettings()
  }));

  ipcMain.handle('gateway:upsert-device', async (_, device) => manager.upsertDevice(device));
  ipcMain.handle('gateway:test-device', async (_, deviceId: string) => manager.testConnection(deviceId));
};

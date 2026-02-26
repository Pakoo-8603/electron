import { contextBridge, ipcRenderer } from 'electron';
import type { GatewayConfig, SearchUsersPayload } from '../shared/types';

const api = {
  getConfig: () => ipcRenderer.invoke('gateway:get-config'),
  saveConfig: (payload: { config: GatewayConfig; password?: string }) => ipcRenderer.invoke('gateway:save-config', payload),
  testConnection: (payload: { config: GatewayConfig; password?: string }) => ipcRenderer.invoke('gateway:test-connection', payload),
  listUsers: (payload: { config: GatewayConfig; password?: string; search: SearchUsersPayload }) => ipcRenderer.invoke('gateway:list-users', payload),
  probe: (payload: { host: string; username: string; password: string; tlsInsecure: boolean }) => ipcRenderer.invoke('gateway:probe', payload)
};

contextBridge.exposeInMainWorld('hikvisionGateway', api);

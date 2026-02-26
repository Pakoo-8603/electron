import { contextBridge, ipcRenderer } from 'electron';
import type { ManagedDevice, SearchUsersPayload } from '../shared/types';

const api = {
  getState: () => ipcRenderer.invoke('gateway:get-state'),
  createDevice: () => ipcRenderer.invoke('gateway:create-device'),
  saveDevice: (payload: { device: ManagedDevice; password?: string }) => ipcRenderer.invoke('gateway:save-device', payload),
  deleteDevice: (payload: { deviceId: string }) => ipcRenderer.invoke('gateway:delete-device', payload),
  selectDevice: (payload: { deviceId: string }) => ipcRenderer.invoke('gateway:select-device', payload),
  testConnection: (payload: { deviceId: string; password?: string }) => ipcRenderer.invoke('gateway:test-connection', payload),
  listUsers: (payload: { deviceId: string; password?: string; search: SearchUsersPayload }) => ipcRenderer.invoke('gateway:list-users', payload),
  probe: (payload: { deviceId: string; password?: string }) => ipcRenderer.invoke('gateway:probe', payload)
};

contextBridge.exposeInMainWorld('hikvisionGateway', api);

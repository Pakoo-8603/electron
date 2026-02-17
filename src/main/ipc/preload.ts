import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('gatewayApi', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings: unknown) => ipcRenderer.invoke('settings:set', settings),
  listDevices: () => ipcRenderer.invoke('devices:list'),
  saveDevice: (device: unknown) => ipcRenderer.invoke('devices:save', device),
  deleteDevice: (id: string) => ipcRenderer.invoke('devices:delete', id),
  getStatus: () => ipcRenderer.invoke('gateway:status'),
  getRecentEvents: () => ipcRenderer.invoke('events:recent')
});

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('gatewayApi', {
  getState: () => ipcRenderer.invoke('gateway:get-state'),
  upsertDevice: (device: unknown) => ipcRenderer.invoke('gateway:upsert-device', device),
  testDevice: (deviceId: string) => ipcRenderer.invoke('gateway:test-device', deviceId)
});

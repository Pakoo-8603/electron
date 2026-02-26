import type { ManagedDevice, SearchUsersPayload } from '../shared/types';

declare global {
  interface Window {
    hikvisionGateway: {
      getState: () => Promise<{ devices: ManagedDevice[]; selectedDeviceId: string; hasStoredPasswordByDevice: Record<string, boolean> }>;
      createDevice: () => Promise<{ device: ManagedDevice; devices: ManagedDevice[] }>;
      saveDevice: (payload: { device: ManagedDevice; password?: string }) => Promise<{ ok: boolean; keytarAvailable: boolean }>;
      deleteDevice: (payload: { deviceId: string }) => Promise<{ ok: boolean; devices?: ManagedDevice[]; selectedDeviceId?: string; message?: string }>;
      selectDevice: (payload: { deviceId: string }) => Promise<{ device: ManagedDevice; hasStoredPassword: boolean }>;
      testConnection: (payload: { deviceId: string; password?: string }) => Promise<any>;
      listUsers: (payload: { deviceId: string; password?: string; search: SearchUsersPayload }) => Promise<any>;
      probe: (payload: { deviceId: string; password?: string }) => Promise<any>;
    };
  }
}

export {};

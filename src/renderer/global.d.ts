import type { GatewayConfig, SearchUsersPayload } from '../shared/types';

declare global {
  interface Window {
    hikvisionGateway: {
      getConfig: () => Promise<{ config: GatewayConfig; hasStoredPassword: boolean }>;
      saveConfig: (payload: { config: GatewayConfig; password?: string }) => Promise<{ ok: boolean; keytarAvailable: boolean }>;
      testConnection: (payload: { config: GatewayConfig; password?: string }) => Promise<any>;
      listUsers: (payload: { config: GatewayConfig; password?: string; search: SearchUsersPayload }) => Promise<any>;
      probe: (payload: { host: string; username: string; password: string; tlsInsecure: boolean }) => Promise<any>;
    };
  }
}

export {};

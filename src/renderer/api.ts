import type {
  DeviceAccessLog,
  DeviceConfig,
  DeviceDirectoryUser,
  DeviceStatus,
  GatewaySettings,
  NormalizedEvent
} from '../shared/types.js';

type DeviceInput = Omit<DeviceConfig, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; password?: string };

export interface GatewayState {
  devices: DeviceConfig[];
  statuses: DeviceStatus[];
  recentEvents: NormalizedEvent[];
  queueDepth: number;
  cloudLatency?: number;
  settings: GatewaySettings;
}

export interface GatewayApi {
  getState: () => Promise<GatewayState>;
  upsertDevice: (device: DeviceInput) => Promise<DeviceConfig>;
  testDevice: (deviceId: string) => Promise<{ ok: boolean; status: number; body: string }>;
  getDeviceUsers: (deviceId: string) => Promise<DeviceDirectoryUser[]>;
  getDeviceAccessLogs: (deviceId: string) => Promise<DeviceAccessLog[]>;
}

const defaultState: GatewayState = {
  devices: [],
  statuses: [],
  recentEvents: [],
  queueDepth: 0,
  cloudLatency: undefined,
  settings: {
    tenantId: 'demo-tenant',
    siteId: 'demo-site',
    backendUrl: 'https://example.com',
    apiToken: 'replace-token',
    batchSize: 100,
    flushIntervalSeconds: 5,
    listenerPort: 9876,
    heartbeatTimeoutSeconds: 30
  }
};

const mockState: GatewayState = { ...defaultState };

const createMockGatewayApi = (): GatewayApi => ({
  async getState() {
    return structuredClone(mockState);
  },
  async upsertDevice(device) {
    const now = new Date().toISOString();
    const created: DeviceConfig = {
      ...device,
      id: device.id ?? crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    mockState.devices = [created, ...mockState.devices.filter((d) => d.id !== created.id)];
    mockState.statuses = [
      {
        deviceId: created.id,
        connected: false,
        mode: created.mode,
        reconnectCount: 0,
        lastError: 'Modo navegador: sin conexión a proceso Electron (mock local activo)'
      },
      ...mockState.statuses.filter((s) => s.deviceId !== created.id)
    ];
    return created;
  },
  async testDevice() {
    return { ok: false, status: 503, body: 'No disponible en mock navegador.' };
  },
  async getDeviceUsers() {
    return [];
  },
  async getDeviceAccessLogs() {
    return [];
  }
});

export const isElectronBridgeAvailable = () => typeof window !== 'undefined' && !!window.gatewayApi;

export const gatewayApi: GatewayApi = isElectronBridgeAvailable()
  ? (window.gatewayApi as GatewayApi)
  : createMockGatewayApi();

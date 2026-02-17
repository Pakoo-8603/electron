export type TransportProtocol = 'http' | 'https';
export type DeviceMode = 'auto' | 'alertStream' | 'httpPush' | 'polling';

export interface DeviceConfig {
  id: string;
  name: string;
  ip: string;
  port: number;
  protocol: TransportProtocol;
  username: string;
  mode: DeviceMode;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GatewaySettings {
  tenantId: string;
  siteId: string;
  backendUrl: string;
  apiToken: string;
  batchSize: number;
  flushIntervalSeconds: number;
  listenerPort: number;
  heartbeatTimeoutSeconds: number;
}

export interface NormalizedEvent {
  eventId: string;
  deviceId: string;
  siteId: string;
  timestampDevice: string;
  timestampGateway: string;
  eventType: string;
  personId?: string;
  personName?: string;
  verifyMode?: string;
  doorNo?: number;
  direction?: 'in' | 'out' | 'unknown';
  imagePath?: string;
  rawPayload: string;
}

export interface DeviceStatus {
  deviceId: string;
  connected: boolean;
  mode: DeviceMode;
  lastEventAt?: string;
  lastError?: string;
  reconnectCount: number;
}

export interface OutboxRow {
  id: number;
  eventId: string;
  payload: string;
  status: 'pending' | 'sent' | 'failed';
  retryCount: number;
  nextRetryAt: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GatewayHealth {
  queueDepth: number;
  eventsPerMinute: number;
  cloudLatencyMs?: number;
  reconnections: number;
  lastSyncAt?: string;
}

export type EventMode = 'auto' | 'alertStream' | 'httpPush' | 'polling';

export interface DeviceConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: 'http' | 'https';
  username: string;
  passwordRef: string;
  eventMode: EventMode;
  enabled: boolean;
  createdAt: string;
}

export interface GatewaySettings {
  tenantId: string;
  siteId: string;
  backendUrl: string;
  backendToken: string;
  listenerPort: number;
}

export interface NormalizedEvent {
  event_id: string;
  device_id: string;
  site_id: string;
  timestamp_device: string;
  timestamp_gateway: string;
  event_type: string;
  person_id?: string;
  person_name?: string;
  verify_mode?: string;
  door_no?: string;
  direction?: 'in' | 'out';
  image_path?: string;
  raw_payload: string;
}

export interface DeviceHealth {
  deviceId: string;
  status: 'connected' | 'disconnected' | 'degraded';
  lastEventAt?: string;
  lastError?: string;
  reconnectCount: number;
}

export interface AppStatus {
  queueSize: number;
  cloudLatencyMs: number | null;
  eventsPerMin: number;
  devices: DeviceHealth[];
}

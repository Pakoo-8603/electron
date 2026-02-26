export type GatewayProtocol = 'http' | 'https';

export interface GatewayConfig {
  host: string;
  port: number;
  protocol: GatewayProtocol;
  username: string;
  tlsInsecure: boolean;
  rememberPassword: boolean;
  timeoutMs: number;
}

export interface ManagedDevice {
  id: string;
  name: string;
  config: GatewayConfig;
}

export interface SearchUsersPayload {
  searchResultPosition: number;
  maxResults: number;
  fuzzySearch?: string;
}

export interface RequestLog {
  timestamp: string;
  status: number | null;
  durationMs: number;
  url: string;
  method: 'GET' | 'POST';
  message?: string;
}

export interface DeviceInfoResult {
  ok: boolean;
  status: number;
  url: string;
  durationMs: number;
  raw: string;
  json?: unknown;
  parsedFromXml?: boolean;
}

export interface SearchUsersResult {
  ok: boolean;
  status: number;
  url: string;
  durationMs: number;
  json?: unknown;
  raw?: string;
}

export interface GatewayError {
  message: string;
  code?: string;
  status?: number;
  details?: unknown;
}

export interface ProbeResult {
  protocol: GatewayProtocol;
  port: number;
  success: boolean;
  status?: number;
  message?: string;
}

export interface SyncSettings {
  enabled: boolean;
  intervalMinutes: number;
  endpoint: string;
  token: string;
}

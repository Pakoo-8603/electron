import { AlertStreamClient } from '../connectors/alertStreamClient';
import { HikvisionClient } from '../connectors/hikvisionClient';
import { GatewayDatabase } from '../db/database';
import { CredentialStore } from './credentialStore';
import { normalizeEvent } from './normalizer';
import { AppStatus, DeviceConfig, DeviceHealth, GatewaySettings } from '../../shared/types';

type StreamHandle = { stream: AlertStreamClient; pollTimer?: NodeJS.Timeout; health: DeviceHealth };

export class DeviceManager {
  private handles = new Map<string, StreamHandle>();
  private eventsWindow: number[] = [];

  constructor(
    private readonly db: GatewayDatabase,
    private readonly credentials: CredentialStore,
    private readonly getSettings: () => GatewaySettings | null
  ) {}

  async startAll(): Promise<void> {
    const devices = this.db.getDevices().filter((d) => d.enabled);
    await Promise.all(devices.map((d) => this.startDevice(d)));
  }

  stopAll(): void {
    for (const handle of this.handles.values()) {
      handle.stream.stop();
      if (handle.pollTimer) clearInterval(handle.pollTimer);
    }
    this.handles.clear();
  }

  async testDeviceConnection(device: DeviceConfig): Promise<boolean> {
    const password = await this.credentials.getPassword(device.passwordRef);
    const client = new HikvisionClient(device, password);
    return client.testConnection();
  }

  async startDevice(device: DeviceConfig): Promise<void> {
    const existing = this.handles.get(device.id);
    if (existing) {
      existing.stream.stop();
      if (existing.pollTimer) clearInterval(existing.pollTimer);
      this.handles.delete(device.id);
    }

    const password = await this.credentials.getPassword(device.passwordRef);
    const client = new HikvisionClient(device, password);
    const health: DeviceHealth = { deviceId: device.id, status: 'disconnected', reconnectCount: 0 };
    const stream = new AlertStreamClient(client);

    stream.on('status', (status, error) => {
      health.status = status;
      if (status === 'disconnected') {
        health.reconnectCount += 1;
        health.lastError = error;
      }
    });

    stream.on('event', (payload) => this.ingestRawEvent(device.id, payload));

    if (device.eventMode === 'polling') {
      const pollTimer = setInterval(() => void this.pollEvents(client, device.id), 15000);
      this.handles.set(device.id, { stream, pollTimer, health });
      await this.pollEvents(client, device.id);
      return;
    }

    this.handles.set(device.id, { stream, health });
    stream.start();
  }

  async ingestRawEvent(deviceId: string, payload: string): Promise<void> {
    const settings = this.getSettings();
    if (!settings) return;
    const event = normalizeEvent({ payload, deviceId, siteId: settings.siteId });
    const inserted = this.db.insertEvent(event);
    if (inserted) {
      const health = this.handles.get(deviceId)?.health;
      if (health) health.lastEventAt = new Date().toISOString();
      this.eventsWindow.push(Date.now());
      this.eventsWindow = this.eventsWindow.filter((t) => Date.now() - t < 60000);
    }
  }

  status(cloudLatencyMs: number | null): AppStatus {
    return {
      queueSize: this.db.outboxSize(),
      cloudLatencyMs,
      eventsPerMin: this.eventsWindow.length,
      devices: [...this.handles.values()].map((h) => h.health)
    };
  }

  private async pollEvents(client: HikvisionClient, deviceId: string): Promise<void> {
    try {
      const response = await client.get('/ISAPI/AccessControl/AcsEvent?format=json');
      if (response.statusCode >= 400) throw new Error(`poll failed ${response.statusCode}`);
      await this.ingestRawEvent(deviceId, response.body);
    } catch (error) {
      const health = this.handles.get(deviceId)?.health;
      if (health) {
        health.status = 'degraded';
        health.lastError = error instanceof Error ? error.message : String(error);
      }
    }
  }
}

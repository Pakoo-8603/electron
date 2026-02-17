import { randomUUID } from 'node:crypto';
import type { DeviceConfig, DeviceStatus, GatewaySettings } from '../../shared/types.js';
import { normalizeEvent } from '../../shared/schema.js';
import { GatewayDatabase } from '../db/database.js';
import { getDevicePassword, saveDevicePassword } from '../services/secure-store.js';
import { AlertStreamClient } from './alert-stream-client.js';
import { HttpListenerServer } from './http-listener-server.js';
import { OutboxSync } from './outbox-sync.js';
import { isapiRequest } from './isapi-client.js';
import { logger } from '../utils/logger.js';

export class DeviceManager {
  private statuses = new Map<string, DeviceStatus>();
  private streams = new Map<string, AlertStreamClient>();
  private listener: HttpListenerServer;
  private outbox: OutboxSync;

  constructor(private readonly db: GatewayDatabase, private readonly settings: GatewaySettings) {
    this.listener = new HttpListenerServer({
      settings,
      onEvent: (event) => this.handleEvent(event)
    });
    this.outbox = new OutboxSync(db, settings);
  }

  async start() {
    await this.listener.start();
    this.outbox.start();
    for (const device of this.db.listDevices().filter((d) => d.enabled)) {
      await this.startDevice(device);
    }
  }

  async stop() {
    for (const stream of this.streams.values()) stream.stop();
    this.outbox.stop();
    await this.listener.stop();
  }

  listDevices() {
    return this.db.listDevices();
  }

  getStatuses(): DeviceStatus[] {
    return [...this.statuses.values()];
  }

  queueDepth() {
    return this.db.queueDepth();
  }

  cloudLatency() {
    return this.outbox.getCloudLatency();
  }

  async upsertDevice(input: Omit<DeviceConfig, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; password?: string }) {
    const now = new Date().toISOString();
    const device: DeviceConfig = {
      ...input,
      id: input.id ?? randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    this.db.upsertDevice(device);
    if (input.password) await saveDevicePassword(device.id, input.password);
    if (device.enabled) await this.startDevice(device);
    return device;
  }

  async testConnection(deviceId: string) {
    const device = this.db.listDevices().find((entry) => entry.id === deviceId);
    if (!device) throw new Error('Device not found');
    const password = await getDevicePassword(deviceId);
    if (!password) throw new Error('Missing password');

    const baseUrl = `${device.protocol}://${device.ip}:${device.port}`;
    const response = await isapiRequest(baseUrl, '/ISAPI/System/deviceInfo', 'GET', {
      username: device.username,
      password
    });

    return { ok: response.ok, status: response.status, body: await response.text() };
  }

  private async startDevice(device: DeviceConfig) {
    const password = await getDevicePassword(device.id);
    if (!password) return;

    if (device.mode === 'httpPush') {
      this.statuses.set(device.id, { deviceId: device.id, connected: true, mode: device.mode, reconnectCount: 0 });
      return;
    }

    if (device.mode === 'polling') {
      const baseUrl = `${device.protocol}://${device.ip}:${device.port}`;
      setInterval(async () => {
        try {
          const response = await isapiRequest(baseUrl, '/ISAPI/AccessControl/AcsEvent?format=json', 'GET', {
            username: device.username,
            password
          });
          if (!response.ok) return;
          const payload = await response.text();
          this.handleEvent(normalizeEvent(device.id, this.settings.siteId, payload));
        } catch (error) {
          logger.warn({ err: error, deviceId: device.id }, 'polling error');
        }
      }, 10000);
      this.statuses.set(device.id, { deviceId: device.id, connected: true, mode: device.mode, reconnectCount: 0 });
      return;
    }

    const stream = new AlertStreamClient({
      device,
      settings: this.settings,
      credentials: { username: device.username, password },
      onEvent: (event) => this.handleEvent(event),
      onStatus: (connected, error) => {
        const previous = this.statuses.get(device.id);
        this.statuses.set(device.id, {
          deviceId: device.id,
          connected,
          mode: 'alertStream',
          lastEventAt: previous?.lastEventAt,
          lastError: error,
          reconnectCount: connected ? (previous?.reconnectCount ?? 0) : (previous?.reconnectCount ?? 0) + 1
        });
      }
    });
    this.streams.set(device.id, stream);
    stream.start().catch((error) => logger.error({ err: error }, 'stream terminated'));
  }

  private handleEvent(event: any) {
    this.db.saveEvent(event);
    const status = this.statuses.get(event.deviceId);
    this.statuses.set(event.deviceId, {
      deviceId: event.deviceId,
      connected: status?.connected ?? true,
      mode: status?.mode ?? 'auto',
      reconnectCount: status?.reconnectCount ?? 0,
      lastEventAt: event.timestampGateway,
      lastError: status?.lastError
    });
  }
}

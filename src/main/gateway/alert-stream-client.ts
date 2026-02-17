import { setTimeout as wait } from 'node:timers/promises';
import { normalizeEvent } from '../../shared/schema.js';
import type { DeviceConfig, GatewaySettings, NormalizedEvent } from '../../shared/types.js';
import { logger } from '../utils/logger.js';
import { isapiRequest, type IsapiCredentials } from './isapi-client.js';

interface AlertStreamOptions {
  device: DeviceConfig;
  settings: GatewaySettings;
  credentials: IsapiCredentials;
  onEvent: (event: NormalizedEvent) => void;
  onStatus: (connected: boolean, error?: string) => void;
}

export class AlertStreamClient {
  private running = false;
  private reconnectAttempt = 0;

  constructor(private readonly options: AlertStreamOptions) {}

  async start() {
    this.running = true;
    while (this.running) {
      try {
        await this.connectOnce();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.options.onStatus(false, message);
        this.reconnectAttempt += 1;
        const delay = Math.min(30, 2 ** this.reconnectAttempt) + Math.random();
        logger.warn({ deviceId: this.options.device.id, delay }, 'alertStream reconnect');
        await wait(delay * 1000);
      }
    }
  }

  stop() {
    this.running = false;
  }

  private async connectOnce() {
    const baseUrl = `${this.options.device.protocol}://${this.options.device.ip}:${this.options.device.port}`;
    const response = await isapiRequest(
      baseUrl,
      '/ISAPI/Event/notification/alertStream',
      'GET',
      this.options.credentials
    );

    if (!response.ok || !response.body) {
      throw new Error(`alertStream failed ${response.status}`);
    }

    this.options.onStatus(true);
    this.reconnectAttempt = 0;

    const contentType = response.headers.get('content-type') ?? '';
    const boundary = contentType.match(/boundary=([^;]+)/i)?.[1]?.replace(/"/g, '') ?? '--boundary';

    let buffer = '';
    let lastChunkAt = Date.now();
    const heartbeatMs = this.options.settings.heartbeatTimeoutSeconds * 1000;

    for await (const chunk of response.body as any as AsyncIterable<Uint8Array>) {
      if (!this.running) break;
      lastChunkAt = Date.now();
      buffer += Buffer.from(chunk).toString('utf8');

      const segments = buffer.split(`--${boundary}`);
      buffer = segments.pop() ?? '';

      for (const segment of segments) {
        const payload = segment.split('\r\n\r\n').slice(1).join('\r\n\r\n').trim();
        if (!payload) continue;
        const event = normalizeEvent(this.options.device.id, this.options.settings.siteId, payload);
        this.options.onEvent(event);
      }

      if (Date.now() - lastChunkAt > heartbeatMs) {
        throw new Error('alertStream heartbeat timeout');
      }
    }
  }
}

import { setInterval } from 'node:timers';
import { gzipSync } from 'node:zlib';
import { fetch } from 'undici';
import type { GatewaySettings } from '../../shared/types.js';
import type { GatewayDatabase } from '../db/database.js';
import { logger } from '../utils/logger.js';

export class OutboxSync {
  private timer?: NodeJS.Timeout;
  private lastLatency?: number;

  constructor(private readonly db: GatewayDatabase, private readonly settings: GatewaySettings) {}

  start() {
    this.timer = setInterval(() => {
      this.flush().catch((error) => logger.error({ err: error }, 'outbox flush failed'));
    }, this.settings.flushIntervalSeconds * 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  getCloudLatency() {
    return this.lastLatency;
  }

  async flush() {
    const batch = this.db.pendingOutbox(this.settings.batchSize);
    if (!batch.length) return;

    const payload = JSON.stringify(batch.map((row) => JSON.parse(row.payload)));
    const body = gzipSync(payload);
    const started = Date.now();

    const response = await fetch(`${this.settings.backendUrl}/gateway/events/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        Authorization: `Bearer ${this.settings.apiToken}`,
        'X-Tenant-Id': this.settings.tenantId,
        'X-Site-Id': this.settings.siteId
      },
      body
    });

    this.lastLatency = Date.now() - started;

    if (response.ok) {
      this.db.markOutboxSent(batch.map((row) => row.id));
      return;
    }

    for (const row of batch) {
      const retries = row.retryCount + 1;
      const delay = Math.min(300, 2 ** retries + Math.random() * 3);
      this.db.markOutboxFailed(row.id, `HTTP ${response.status}`, retries, delay);
    }
  }
}

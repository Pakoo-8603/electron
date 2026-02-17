import { gzipSync } from 'node:zlib';
import { GatewayDatabase } from '../db/database';
import { GatewaySettings } from '../../shared/types';

export class OutboxSync {
  private timer?: NodeJS.Timeout;
  private latencyMs: number | null = null;

  constructor(private readonly db: GatewayDatabase, private readonly getSettings: () => GatewaySettings | null) {}

  start(intervalMs = 5000): void {
    this.stop();
    this.timer = setInterval(() => void this.flush(), intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  getLatency(): number | null {
    return this.latencyMs;
  }

  async flush(batchSize = 50): Promise<void> {
    const settings = this.getSettings();
    if (!settings) return;

    const items = this.db.getPendingOutbox(batchSize);
    if (items.length === 0) return;

    const events = items
      .map((item) => ({ item, event: this.db.getEventById(item.event_id) }))
      .filter((x): x is { item: { id: number; event_id: string; retry_count: number }; event: NonNullable<ReturnType<GatewayDatabase['getEventById']>> } => Boolean(x.event));

    const payload = JSON.stringify({ tenant_id: settings.tenantId, site_id: settings.siteId, events: events.map((e) => e.event) });
    const started = Date.now();

    try {
      const res = await fetch(`${settings.backendUrl}/gateway/events/batch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.backendToken}`,
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip'
        },
        body: gzipSync(payload)
      });
      this.latencyMs = Date.now() - started;

      if (!res.ok) throw new Error(`Cloud responded ${res.status}`);
      this.db.markOutboxSent(events.map((e) => e.item.id));
    } catch (error) {
      for (const e of events) {
        this.db.markOutboxFailed(e.item.id, e.item.retry_count + 1, error instanceof Error ? error.message : String(error));
      }
    }
  }
}

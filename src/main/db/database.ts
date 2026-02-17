import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';
import { DeviceConfig, NormalizedEvent } from '../../shared/types';

export class GatewayDatabase {
  private db: Database.Database;

  constructor(dbPath = path.join(app.getPath('userData'), 'gateway.db')) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        protocol TEXT NOT NULL,
        username TEXT NOT NULL,
        password_ref TEXT NOT NULL,
        event_mode TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        site_id TEXT NOT NULL,
        timestamp_device TEXT NOT NULL,
        timestamp_gateway TEXT NOT NULL,
        event_type TEXT NOT NULL,
        person_id TEXT,
        person_name TEXT,
        verify_mode TEXT,
        door_no TEXT,
        direction TEXT,
        image_path TEXT,
        raw_payload TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending',
        retry_count INTEGER NOT NULL DEFAULT 0,
        next_retry_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  getDevices(): DeviceConfig[] {
    const rows = this.db.prepare('SELECT * FROM devices ORDER BY created_at DESC').all() as any[];
    return rows.map(this.mapDevice);
  }

  upsertDevice(device: DeviceConfig): void {
    this.db.prepare(`
      INSERT INTO devices (id, name, host, port, protocol, username, password_ref, event_mode, enabled, created_at)
      VALUES (@id, @name, @host, @port, @protocol, @username, @passwordRef, @eventMode, @enabled, @createdAt)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        host=excluded.host,
        port=excluded.port,
        protocol=excluded.protocol,
        username=excluded.username,
        password_ref=excluded.password_ref,
        event_mode=excluded.event_mode,
        enabled=excluded.enabled
    `).run({ ...device, enabled: device.enabled ? 1 : 0 });
  }

  deleteDevice(id: string): void {
    this.db.prepare('DELETE FROM devices WHERE id = ?').run(id);
  }

  insertEvent(event: NormalizedEvent): boolean {
    const tx = this.db.transaction(() => {
      const inserted = this.db.prepare(`
        INSERT OR IGNORE INTO events (
          event_id, device_id, site_id, timestamp_device, timestamp_gateway, event_type,
          person_id, person_name, verify_mode, door_no, direction, image_path, raw_payload
        ) VALUES (
          @event_id, @device_id, @site_id, @timestamp_device, @timestamp_gateway, @event_type,
          @person_id, @person_name, @verify_mode, @door_no, @direction, @image_path, @raw_payload
        )
      `).run(event);

      if (inserted.changes > 0) {
        const now = new Date().toISOString();
        this.db.prepare(`
          INSERT INTO outbox (event_id, status, created_at, updated_at)
          VALUES (?, 'pending', ?, ?)
          ON CONFLICT(event_id) DO NOTHING
        `).run(event.event_id, now, now);
      }

      return inserted.changes > 0;
    });

    return tx();
  }

  getRecentEvents(limit = 200): NormalizedEvent[] {
    return this.db.prepare('SELECT * FROM events ORDER BY timestamp_gateway DESC LIMIT ?').all(limit) as NormalizedEvent[];
  }

  getPendingOutbox(limit = 100): Array<{ id: number; event_id: string; retry_count: number }> {
    return this.db.prepare(`
      SELECT id, event_id, retry_count
      FROM outbox
      WHERE status IN ('pending','failed')
        AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
      ORDER BY id ASC LIMIT ?
    `).all(limit) as Array<{ id: number; event_id: string; retry_count: number }>;
  }

  getEventById(eventId: string): NormalizedEvent | undefined {
    return this.db.prepare('SELECT * FROM events WHERE event_id = ?').get(eventId) as NormalizedEvent | undefined;
  }

  markOutboxSent(ids: number[]): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare("UPDATE outbox SET status='sent', updated_at=? WHERE id=?");
    const tx = this.db.transaction((list: number[]) => list.forEach((id) => stmt.run(now, id)));
    tx(ids);
  }

  markOutboxFailed(id: number, retryCount: number, message: string): void {
    const next = new Date(Date.now() + Math.min(300000, 1000 * 2 ** retryCount)).toISOString();
    this.db.prepare(`
      UPDATE outbox
      SET status='failed', retry_count=?, last_error=?, next_retry_at=?, updated_at=?
      WHERE id=?
    `).run(retryCount, message.slice(0, 500), next, new Date().toISOString(), id);
  }

  outboxSize(): number {
    const row = this.db.prepare("SELECT COUNT(*) as total FROM outbox WHERE status != 'sent'").get() as { total: number };
    return row.total;
  }

  private mapDevice(row: any): DeviceConfig {
    return {
      id: row.id,
      name: row.name,
      host: row.host,
      port: row.port,
      protocol: row.protocol,
      username: row.username,
      passwordRef: row.password_ref,
      eventMode: row.event_mode,
      enabled: Boolean(row.enabled),
      createdAt: row.created_at
    };
  }
}

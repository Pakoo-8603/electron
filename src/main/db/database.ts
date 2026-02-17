import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';
import type { DeviceConfig, NormalizedEvent, OutboxRow } from '../../shared/types.js';

export class GatewayDatabase {
  private db: Database.Database;

  constructor() {
    const dbPath = path.join(app.getPath('userData'), 'gateway.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ip TEXT NOT NULL,
        port INTEGER NOT NULL,
        protocol TEXT NOT NULL,
        username TEXT NOT NULL,
        mode TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
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
        door_no INTEGER,
        direction TEXT,
        image_path TEXT,
        raw_payload TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        payload TEXT NOT NULL,
        status TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        next_retry_at TEXT NOT NULL,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_outbox_status_retry ON outbox(status, next_retry_at);
    `);
  }

  listDevices(): DeviceConfig[] {
    const rows = this.db.prepare('SELECT * FROM devices ORDER BY created_at DESC').all() as any[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      ip: row.ip,
      port: row.port,
      protocol: row.protocol,
      username: row.username,
      mode: row.mode,
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  upsertDevice(device: DeviceConfig) {
    this.db.prepare(`
      INSERT INTO devices (id, name, ip, port, protocol, username, mode, enabled, created_at, updated_at)
      VALUES (@id, @name, @ip, @port, @protocol, @username, @mode, @enabled, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        ip=excluded.ip,
        port=excluded.port,
        protocol=excluded.protocol,
        username=excluded.username,
        mode=excluded.mode,
        enabled=excluded.enabled,
        updated_at=excluded.updated_at
    `).run({ ...device, enabled: device.enabled ? 1 : 0 });
  }

  deleteDevice(deviceId: string) {
    this.db.prepare('DELETE FROM devices WHERE id = ?').run(deviceId);
  }

  saveEvent(event: NormalizedEvent) {
    this.db.prepare(`
      INSERT OR IGNORE INTO events (
        event_id, device_id, site_id, timestamp_device, timestamp_gateway,
        event_type, person_id, person_name, verify_mode, door_no, direction, image_path, raw_payload
      ) VALUES (
        @eventId, @deviceId, @siteId, @timestampDevice, @timestampGateway,
        @eventType, @personId, @personName, @verifyMode, @doorNo, @direction, @imagePath, @rawPayload
      )
    `).run(event);

    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT OR IGNORE INTO outbox (event_id, payload, status, retry_count, next_retry_at, created_at, updated_at)
      VALUES (?, ?, 'pending', 0, ?, ?, ?)
    `).run(event.eventId, JSON.stringify(event), now, now, now);
  }

  recentEvents(limit = 200): NormalizedEvent[] {
    return this.db
      .prepare('SELECT * FROM events ORDER BY timestamp_gateway DESC LIMIT ?')
      .all(limit)
      .map((row: any) => ({
        eventId: row.event_id,
        deviceId: row.device_id,
        siteId: row.site_id,
        timestampDevice: row.timestamp_device,
        timestampGateway: row.timestamp_gateway,
        eventType: row.event_type,
        personId: row.person_id,
        personName: row.person_name,
        verifyMode: row.verify_mode,
        doorNo: row.door_no,
        direction: row.direction,
        imagePath: row.image_path,
        rawPayload: row.raw_payload
      }));
  }

  pendingOutbox(limit: number): OutboxRow[] {
    const now = new Date().toISOString();
    return this.db
      .prepare(`SELECT * FROM outbox WHERE status IN ('pending','failed') AND next_retry_at <= ? ORDER BY id ASC LIMIT ?`)
      .all(now, limit)
      .map((row: any) => ({
        id: row.id,
        eventId: row.event_id,
        payload: row.payload,
        status: row.status,
        retryCount: row.retry_count,
        nextRetryAt: row.next_retry_at,
        lastError: row.last_error,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
  }

  markOutboxSent(ids: number[]) {
    if (!ids.length) return;
    const now = new Date().toISOString();
    const stmt = this.db.prepare('UPDATE outbox SET status = ?, updated_at = ? WHERE id = ?');
    const tx = this.db.transaction((rows: number[]) => rows.forEach((id) => stmt.run('sent', now, id)));
    tx(ids);
  }

  markOutboxFailed(id: number, error: string, retryCount: number, delaySeconds: number) {
    const now = new Date();
    const next = new Date(now.getTime() + delaySeconds * 1000).toISOString();
    this.db
      .prepare('UPDATE outbox SET status = ?, retry_count = ?, last_error = ?, next_retry_at = ?, updated_at = ? WHERE id = ?')
      .run('failed', retryCount, error.slice(0, 1500), next, now.toISOString(), id);
  }

  queueDepth() {
    const row = this.db.prepare("SELECT count(*) as total FROM outbox WHERE status IN ('pending', 'failed')").get() as { total: number };
    return row.total;
  }
}

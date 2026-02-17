import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import initSqlJs, { Database } from 'sql.js';
import { DeviceConfig, NormalizedEvent } from '../../shared/types';

export class GatewayDatabase {
  private db!: Database;
  private dbPath: string;

  private constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  static async create(dbPath = path.join(app.getPath('userData'), 'gateway.sqlite')): Promise<GatewayDatabase> {
    const instance = new GatewayDatabase(dbPath);
    const SQL = await initSqlJs({
      locateFile: (file) => path.join(process.cwd(), 'node_modules/sql.js/dist', file)
    });

    const fileBuffer = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : undefined;
    instance.db = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();
    instance.migrate();
    instance.persist();
    return instance;
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
    const rows = this.queryAll('SELECT * FROM devices ORDER BY created_at DESC');
    return rows.map((row) => this.mapDevice(row));
  }

  upsertDevice(device: DeviceConfig): void {
    this.exec(
      `INSERT INTO devices (id, name, host, port, protocol, username, password_ref, event_mode, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name,
         host=excluded.host,
         port=excluded.port,
         protocol=excluded.protocol,
         username=excluded.username,
         password_ref=excluded.password_ref,
         event_mode=excluded.event_mode,
         enabled=excluded.enabled`,
      [
        device.id,
        device.name,
        device.host,
        device.port,
        device.protocol,
        device.username,
        device.passwordRef,
        device.eventMode,
        device.enabled ? 1 : 0,
        device.createdAt
      ]
    );
    this.persist();
  }

  deleteDevice(id: string): void {
    this.exec('DELETE FROM devices WHERE id = ?', [id]);
    this.persist();
  }

  insertEvent(event: NormalizedEvent): boolean {
    this.exec('BEGIN');
    this.exec(
      `INSERT OR IGNORE INTO events (event_id, device_id, site_id, timestamp_device, timestamp_gateway, event_type,
      person_id, person_name, verify_mode, door_no, direction, image_path, raw_payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.event_id,
        event.device_id,
        event.site_id,
        event.timestamp_device,
        event.timestamp_gateway,
        event.event_type,
        event.person_id || null,
        event.person_name || null,
        event.verify_mode || null,
        event.door_no || null,
        event.direction || null,
        event.image_path || null,
        event.raw_payload
      ]
    );

    const inserted = this.queryOne('SELECT changes() as changes');
    if ((inserted?.changes ?? 0) > 0) {
      const now = new Date().toISOString();
      this.exec(
        `INSERT OR IGNORE INTO outbox (event_id, status, created_at, updated_at)
         VALUES (?, 'pending', ?, ?)`,
        [event.event_id, now, now]
      );
    }
    this.exec('COMMIT');
    this.persist();
    return (inserted?.changes ?? 0) > 0;
  }

  getRecentEvents(limit = 200): NormalizedEvent[] {
    return this.queryAll('SELECT * FROM events ORDER BY timestamp_gateway DESC LIMIT ?', [limit]) as NormalizedEvent[];
  }

  getPendingOutbox(limit = 100): Array<{ id: number; event_id: string; retry_count: number }> {
    return this.queryAll(
      `SELECT id, event_id, retry_count
       FROM outbox
       WHERE status IN ('pending','failed')
         AND (next_retry_at IS NULL OR next_retry_at <= ?)
       ORDER BY id ASC LIMIT ?`,
      [new Date().toISOString(), limit]
    ) as Array<{ id: number; event_id: string; retry_count: number }>;
  }

  getEventById(eventId: string): NormalizedEvent | undefined {
    return this.queryOne('SELECT * FROM events WHERE event_id = ?', [eventId]) as NormalizedEvent | undefined;
  }

  markOutboxSent(ids: number[]): void {
    const now = new Date().toISOString();
    ids.forEach((id) => this.exec("UPDATE outbox SET status='sent', updated_at=? WHERE id=?", [now, id]));
    this.persist();
  }

  markOutboxFailed(id: number, retryCount: number, message: string): void {
    const next = new Date(Date.now() + Math.min(300000, 1000 * 2 ** retryCount)).toISOString();
    this.exec(
      `UPDATE outbox
       SET status='failed', retry_count=?, last_error=?, next_retry_at=?, updated_at=?
       WHERE id=?`,
      [retryCount, message.slice(0, 500), next, new Date().toISOString(), id]
    );
    this.persist();
  }

  outboxSize(): number {
    const row = this.queryOne("SELECT COUNT(*) as total FROM outbox WHERE status != 'sent'") as { total: number } | undefined;
    return row?.total ?? 0;
  }

  private exec(sql: string, params: unknown[] = []): void {
    this.db.run(sql, params);
  }

  private queryAll(sql: string, params: unknown[] = []): Record<string, any>[] {
    const stmt = this.db.prepare(sql, params);
    const rows: Record<string, any>[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  private queryOne(sql: string, params: unknown[] = []): Record<string, any> | undefined {
    const rows = this.queryAll(sql, params);
    return rows[0];
  }

  private persist(): void {
    const data = this.db.export();
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  private mapDevice(row: Record<string, any>): DeviceConfig {
    return {
      id: String(row.id),
      name: String(row.name),
      host: String(row.host),
      port: Number(row.port),
      protocol: row.protocol as 'http' | 'https',
      username: String(row.username),
      passwordRef: String(row.password_ref),
      eventMode: row.event_mode as DeviceConfig['eventMode'],
      enabled: Boolean(row.enabled),
      createdAt: String(row.created_at)
    };
  }
}

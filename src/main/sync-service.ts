import cron, { type ScheduledTask } from 'node-cron';
import type { GatewayConfig, SyncSettings } from '../shared/types';
import { HikvisionClient } from './hikvision-client';

export class SyncService {
  private task: ScheduledTask | null = null;

  start(config: GatewayConfig, password: string, settings: SyncSettings) {
    if (!settings.enabled) return;
    this.stop();

    const everyNMinutes = Math.max(1, Math.floor(settings.intervalMinutes));
    this.task = cron.schedule(`*/${everyNMinutes} * * * *`, async () => {
      const client = new HikvisionClient(config, password);
      const [deviceInfo, users] = await Promise.all([
        client.getDeviceInfo(),
        client.searchUsers({ searchResultPosition: 0, maxResults: 30, fuzzySearch: '' })
      ]);

      await fetch(settings.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.token}`
        },
        body: JSON.stringify({
          syncedAt: new Date().toISOString(),
          config: { ...config, password: undefined },
          deviceInfo,
          users
        })
      });
    });
  }

  stop() {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
  }
}

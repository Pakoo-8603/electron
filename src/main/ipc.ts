import { ipcMain } from 'electron';
import type { GatewayConfig, ProbeResult, SearchUsersPayload } from '../shared/types';
import { HikvisionClient } from './hikvision-client';
import { clearStoredPassword, getConfig, getStoredPassword, isKeytarAvailable, setConfig, setStoredPassword } from './store';

async function resolvePassword(rawPassword: string | undefined) {
  if (rawPassword && rawPassword.length > 0) return rawPassword;
  return getStoredPassword();
}

export function registerIpcHandlers() {
  ipcMain.handle('gateway:get-config', async () => {
    const config = getConfig();
    const hasStoredPassword = Boolean(await getStoredPassword());
    return { config, hasStoredPassword };
  });

  ipcMain.handle('gateway:save-config', async (_, payload: { config: GatewayConfig; password?: string }) => {
    setConfig(payload.config);

    if (payload.config.rememberPassword && payload.password) {
      await setStoredPassword(payload.password);
    }

    if (!payload.config.rememberPassword) {
      await clearStoredPassword();
    }

    return { ok: true, keytarAvailable: isKeytarAvailable() };
  });

  ipcMain.handle('gateway:test-connection', async (_, payload: { config: GatewayConfig; password?: string }) => {
    const password = await resolvePassword(payload.password);
    const client = new HikvisionClient(payload.config, password);
    return client.getDeviceInfo();
  });

  ipcMain.handle('gateway:list-users', async (_, payload: { config: GatewayConfig; password?: string; search: SearchUsersPayload }) => {
    const password = await resolvePassword(payload.password);
    const client = new HikvisionClient(payload.config, password);
    return client.searchUsers(payload.search);
  });

  ipcMain.handle('gateway:probe', async (_, payload: { host: string; username: string; password: string; tlsInsecure: boolean }) => {
    const candidates: Array<Pick<GatewayConfig, 'protocol' | 'port'>> = [
      { protocol: 'https', port: 443 },
      { protocol: 'http', port: 80 },
      { protocol: 'https', port: 80 },
      { protocol: 'http', port: 443 }
    ];

    const results: ProbeResult[] = [];
    for (const candidate of candidates) {
      const config: GatewayConfig = {
        host: payload.host,
        username: payload.username,
        tlsInsecure: payload.tlsInsecure,
        rememberPassword: false,
        timeoutMs: 4000,
        protocol: candidate.protocol,
        port: candidate.port
      };

      const client = new HikvisionClient(config, payload.password);
      const probe = await client.getDeviceInfo();
      results.push({
        protocol: candidate.protocol,
        port: candidate.port,
        success: Boolean(probe.result),
        status: probe.result?.status ?? probe.error?.status,
        message: probe.error?.message
      });

      if (probe.result) break;
    }

    return results;
  });
}

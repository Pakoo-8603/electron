import { randomUUID } from 'node:crypto';
import { ipcMain } from 'electron';
import type { GatewayConfig, ManagedDevice, ProbeResult, SearchUsersPayload } from '../shared/types';
import { HikvisionClient } from './hikvision-client';
import { clearStoredPassword, getDevices, getSelectedDeviceId, getStoredPassword, isKeytarAvailable, setDevices, setSelectedDeviceId, setStoredPassword } from './store';

function getDeviceById(deviceId: string): ManagedDevice {
  const devices = getDevices();
  return devices.find((device) => device.id === deviceId) ?? devices[0];
}

async function resolvePassword(deviceId: string, rawPassword: string | undefined) {
  if (rawPassword && rawPassword.length > 0) return rawPassword;
  return getStoredPassword(deviceId);
}

export function registerIpcHandlers() {
  ipcMain.handle('gateway:get-state', async () => {
    const devices = getDevices();
    const selectedDeviceId = getSelectedDeviceId();

    const passwordMap: Record<string, boolean> = {};
    for (const device of devices) {
      passwordMap[device.id] = Boolean(await getStoredPassword(device.id));
    }

    return {
      devices,
      selectedDeviceId,
      hasStoredPasswordByDevice: passwordMap
    };
  });

  ipcMain.handle('gateway:save-device', async (_, payload: { device: ManagedDevice; password?: string }) => {
    const devices = getDevices();
    const index = devices.findIndex((item) => item.id === payload.device.id);
    const nextDevices = [...devices];

    if (index >= 0) {
      nextDevices[index] = payload.device;
    } else {
      const id = payload.device.id || randomUUID();
      nextDevices.push({ ...payload.device, id });
    }

    setDevices(nextDevices);
    setSelectedDeviceId(payload.device.id);

    if (payload.device.config.rememberPassword && payload.password) {
      await setStoredPassword(payload.device.id, payload.password);
    }

    if (!payload.device.config.rememberPassword) {
      await clearStoredPassword(payload.device.id);
    }

    return { ok: true, keytarAvailable: isKeytarAvailable() };
  });

  ipcMain.handle('gateway:create-device', async () => {
    const device: ManagedDevice = {
      id: randomUUID(),
      name: 'Nuevo dispositivo',
      config: {
        host: '',
        port: 443,
        protocol: 'https',
        username: 'admin',
        tlsInsecure: true,
        rememberPassword: false,
        timeoutMs: 8000
      }
    };

    const nextDevices = [...getDevices(), device];
    setDevices(nextDevices);
    setSelectedDeviceId(device.id);

    return { device, devices: nextDevices };
  });

  ipcMain.handle('gateway:delete-device', async (_, payload: { deviceId: string }) => {
    const devices = getDevices();
    const nextDevices = devices.filter((item) => item.id !== payload.deviceId);

    if (nextDevices.length === 0) {
      return { ok: false, message: 'Debe existir al menos un dispositivo.' };
    }

    setDevices(nextDevices);
    await clearStoredPassword(payload.deviceId);

    const selected = getSelectedDeviceId();
    if (selected === payload.deviceId) {
      setSelectedDeviceId(nextDevices[0].id);
    }

    return { ok: true, devices: nextDevices, selectedDeviceId: getSelectedDeviceId() };
  });

  ipcMain.handle('gateway:select-device', async (_, payload: { deviceId: string }) => {
    const target = getDeviceById(payload.deviceId);
    setSelectedDeviceId(target.id);
    const hasStoredPassword = Boolean(await getStoredPassword(target.id));
    return { device: target, hasStoredPassword };
  });

  ipcMain.handle('gateway:test-connection', async (_, payload: { deviceId: string; password?: string }) => {
    const device = getDeviceById(payload.deviceId);
    const password = await resolvePassword(device.id, payload.password);
    const client = new HikvisionClient(device.config, password);
    return client.getDeviceInfo();
  });

  ipcMain.handle('gateway:list-users', async (_, payload: { deviceId: string; password?: string; search: SearchUsersPayload }) => {
    const device = getDeviceById(payload.deviceId);
    const password = await resolvePassword(device.id, payload.password);
    const client = new HikvisionClient(device.config, password);
    return client.searchUsers(payload.search);
  });

  ipcMain.handle('gateway:probe', async (_, payload: { deviceId: string; password?: string }) => {
    const selected = getDeviceById(payload.deviceId);
    const candidates: Array<Pick<GatewayConfig, 'protocol' | 'port'>> = [
      { protocol: 'https', port: 443 },
      { protocol: 'http', port: 80 },
      { protocol: 'https', port: 80 },
      { protocol: 'http', port: 443 }
    ];

    const password = await resolvePassword(selected.id, payload.password);
    const results: ProbeResult[] = [];
    for (const candidate of candidates) {
      const config: GatewayConfig = {
        ...selected.config,
        protocol: candidate.protocol,
        port: candidate.port,
        timeoutMs: 4000
      };

      const client = new HikvisionClient(config, password);
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

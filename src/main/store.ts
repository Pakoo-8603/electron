import Store from 'electron-store';
import type { GatewayConfig, ManagedDevice, SyncSettings } from '../shared/types';

const PASSWORD_SERVICE = 'electron-hikvision-gateway';

interface AppStoreSchema {
  devices: ManagedDevice[];
  selectedDeviceId: string;
  sync: SyncSettings;
}

const defaultConfig: GatewayConfig = {
  host: '',
  port: 443,
  protocol: 'https',
  username: 'admin',
  tlsInsecure: true,
  rememberPassword: false,
  timeoutMs: 8000
};

const defaultDevice: ManagedDevice = {
  id: 'default-device',
  name: 'Dispositivo principal',
  config: defaultConfig
};

const defaults: AppStoreSchema = {
  devices: [defaultDevice],
  selectedDeviceId: defaultDevice.id,
  sync: {
    enabled: false,
    intervalMinutes: 15,
    endpoint: 'https://mi-servidor.com/api/hikvision/sync',
    token: ''
  }
};

const rawStore = new Store<AppStoreSchema>({ defaults }) as any;

function normalizeDevices(devices: ManagedDevice[]): ManagedDevice[] {
  if (!devices || devices.length === 0) {
    return [defaultDevice];
  }
  return devices;
}

export function getDevices(): ManagedDevice[] {
  return normalizeDevices(rawStore.get('devices'));
}

export function setDevices(devices: ManagedDevice[]): void {
  rawStore.set('devices', normalizeDevices(devices));
}

export function getSelectedDeviceId(): string {
  return rawStore.get('selectedDeviceId') || defaultDevice.id;
}

export function setSelectedDeviceId(selectedDeviceId: string): void {
  rawStore.set('selectedDeviceId', selectedDeviceId);
}

export function getSyncSettings(): SyncSettings {
  return rawStore.get('sync');
}

let keytarModule: { getPassword: Function; setPassword: Function; deletePassword: Function } | null = null;

function getKeytar() {
  if (keytarModule !== null) {
    return keytarModule;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    keytarModule = require('keytar');
  } catch {
    keytarModule = null;
  }
  return keytarModule;
}

function passwordAccountForDevice(deviceId: string): string {
  return `hikvision-device-password:${deviceId}`;
}

export function isKeytarAvailable(): boolean {
  return Boolean(getKeytar());
}

export async function getStoredPassword(deviceId: string): Promise<string> {
  const keytar = getKeytar();
  if (!keytar) return '';

  return (await keytar.getPassword(PASSWORD_SERVICE, passwordAccountForDevice(deviceId))) ?? '';
}

export async function setStoredPassword(deviceId: string, password: string): Promise<void> {
  const keytar = getKeytar();
  if (!keytar) return;

  await keytar.setPassword(PASSWORD_SERVICE, passwordAccountForDevice(deviceId), password);
}

export async function clearStoredPassword(deviceId: string): Promise<void> {
  const keytar = getKeytar();
  if (!keytar) return;

  await keytar.deletePassword(PASSWORD_SERVICE, passwordAccountForDevice(deviceId));
}

import Store from 'electron-store';
import type { GatewayConfig, SyncSettings } from '../shared/types';

const PASSWORD_SERVICE = 'electron-hikvision-gateway';
const PASSWORD_ACCOUNT = 'hikvision-device-password';

interface AppStoreSchema {
  config: GatewayConfig;
  sync: SyncSettings;
}

const defaults: AppStoreSchema = {
  config: {
    host: '',
    port: 443,
    protocol: 'https',
    username: 'admin',
    tlsInsecure: true,
    rememberPassword: false,
    timeoutMs: 8000
  },
  sync: {
    enabled: false,
    intervalMinutes: 15,
    endpoint: 'https://mi-servidor.com/api/hikvision/sync',
    token: ''
  }
};

const rawStore = new Store<AppStoreSchema>({ defaults }) as any;

export function getConfig(): GatewayConfig {
  return rawStore.get('config');
}

export function setConfig(config: GatewayConfig): void {
  rawStore.set('config', config);
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

export function isKeytarAvailable(): boolean {
  return Boolean(getKeytar());
}

export async function getStoredPassword(): Promise<string> {
  const keytar = getKeytar();
  if (!keytar) return '';

  return (await keytar.getPassword(PASSWORD_SERVICE, PASSWORD_ACCOUNT)) ?? '';
}

export async function setStoredPassword(password: string): Promise<void> {
  const keytar = getKeytar();
  if (!keytar) return;

  await keytar.setPassword(PASSWORD_SERVICE, PASSWORD_ACCOUNT, password);
}

export async function clearStoredPassword(): Promise<void> {
  const keytar = getKeytar();
  if (!keytar) return;

  await keytar.deletePassword(PASSWORD_SERVICE, PASSWORD_ACCOUNT);
}

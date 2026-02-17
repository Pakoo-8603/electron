import crypto from 'node:crypto';
import Store from 'electron-store';
import { safeStorage } from 'electron';

const secretStore = new Store<Record<string, string>>({ name: 'secrets' });

export class CredentialStore {
  async savePassword(deviceId: string, password: string): Promise<string> {
    const ref = `device:${deviceId}:${crypto.randomUUID()}`;
    const encoded = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(password).toString('base64')
      : Buffer.from(password, 'utf8').toString('base64');
    secretStore.set(ref, encoded);
    return ref;
  }

  async getPassword(ref: string): Promise<string> {
    const value = secretStore.get(ref);
    if (!value || typeof value !== 'string') throw new Error(`No password stored for ${ref}`);

    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(value, 'base64'));
    }
    return Buffer.from(value, 'base64').toString('utf8');
  }

  async deletePassword(ref: string): Promise<void> {
    secretStore.delete(ref);
  }
}

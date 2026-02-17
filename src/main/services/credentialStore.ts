import keytar from 'keytar';
import crypto from 'node:crypto';

const SERVICE_NAME = 'hikvision-gateway';

export class CredentialStore {
  async savePassword(deviceId: string, password: string): Promise<string> {
    const ref = `device:${deviceId}:${crypto.randomUUID()}`;
    await keytar.setPassword(SERVICE_NAME, ref, password);
    return ref;
  }

  async getPassword(ref: string): Promise<string> {
    const value = await keytar.getPassword(SERVICE_NAME, ref);
    if (!value) throw new Error(`No password stored for ${ref}`);
    return value;
  }

  async deletePassword(ref: string): Promise<void> {
    await keytar.deletePassword(SERVICE_NAME, ref);
  }
}

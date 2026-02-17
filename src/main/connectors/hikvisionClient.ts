import DigestClient from 'digest-fetch';
import { DeviceConfig } from '../../shared/types';

export class HikvisionClient {
  private digest: DigestClient;

  constructor(private readonly device: DeviceConfig, private readonly password: string) {
    this.digest = new DigestClient(this.device.username, this.password);
  }

  private baseUrl(): string {
    return `${this.device.protocol}://${this.device.host}:${this.device.port}`;
  }

  async get(path: string): Promise<{ statusCode: number; body: string; headers: Record<string, string> }> {
    const url = `${this.baseUrl()}${path}`;
    const response = await this.digest.fetch(url, { method: 'GET' });
    const body = await response.text();
    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    return { statusCode: response.status, body, headers };
  }

  async testConnection(): Promise<boolean> {
    const res = await this.get('/ISAPI/System/deviceInfo');
    return res.statusCode >= 200 && res.statusCode < 300;
  }

  async put(path: string, body: string, contentType = 'application/xml'): Promise<number> {
    const response = await this.digest.fetch(`${this.baseUrl()}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body
    });
    return response.status;
  }

  async openAlertStream(path = '/ISAPI/Event/notification/alertStream'): Promise<Response> {
    return this.digest.fetch(`${this.baseUrl()}${path}`, {
      method: 'GET',
      headers: { Accept: 'multipart/mixed' }
    });
  }
}

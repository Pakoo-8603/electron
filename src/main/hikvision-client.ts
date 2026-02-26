import DigestFetch from 'digest-fetch';
import { XMLParser } from 'fast-xml-parser';
import http from 'node:http';
import https from 'node:https';
import type { DeviceInfoResult, GatewayConfig, GatewayError, RequestLog, SearchUsersPayload, SearchUsersResult } from '../shared/types';

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

export class HikvisionClient {
  private readonly config: GatewayConfig;
  private readonly password: string;
  private readonly digestClient: DigestFetch;

  constructor(config: GatewayConfig, password: string) {
    this.config = config;
    this.password = password;
    this.digestClient = new DigestFetch(config.username, password, { algorithm: 'MD5' });
  }

  private baseUrl() {
    return `${this.config.protocol}://${this.config.host}:${this.config.port}`;
  }

  private agent() {
    if (this.config.protocol === 'https') {
      return new https.Agent({ rejectUnauthorized: !this.config.tlsInsecure });
    }
    return new http.Agent();
  }

  private async request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ text: string; status: number; url: string; durationMs: number; log: RequestLog }> {
    const controller = new AbortController();
    const startedAt = Date.now();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    const url = `${this.baseUrl()}${path}`;

    try {
      const response = await this.digestClient.fetch(url, {
        method,
        body: body ? JSON.stringify(body) : undefined,
        headers: {
          Accept: 'application/json, application/xml, text/xml, */*',
          'Content-Type': 'application/json'
        },
        agent: this.agent(),
        signal: controller.signal
      } as RequestInit & { agent: http.Agent | https.Agent });

      const text = await response.text();
      const durationMs = Date.now() - startedAt;

      return {
        text,
        status: response.status,
        url,
        durationMs,
        log: {
          timestamp: new Date().toISOString(),
          status: response.status,
          durationMs,
          url,
          method
        }
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      throw this.toGatewayError(error, url, durationMs, method);
    } finally {
      clearTimeout(timeout);
    }
  }

  private toGatewayError(error: unknown, url: string, durationMs: number, method: 'GET' | 'POST'): GatewayError & { log: RequestLog } {
    const fallback = {
      message: 'Error desconocido al consultar dispositivo Hikvision.',
      code: 'UNKNOWN'
    };

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          message: `Timeout de ${this.config.timeoutMs}ms al consultar ${url}`,
          code: 'TIMEOUT',
          log: {
            timestamp: new Date().toISOString(),
            status: null,
            durationMs,
            url,
            method,
            message: 'timeout'
          }
        };
      }

      const networkCode = (error as Error & { code?: string }).code;
      if (networkCode) {
        return {
          message: `Error de red (${networkCode}) al consultar ${url}`,
          code: networkCode,
          log: {
            timestamp: new Date().toISOString(),
            status: null,
            durationMs,
            url,
            method,
            message: networkCode
          }
        };
      }

      return {
        message: error.message,
        code: fallback.code,
        log: {
          timestamp: new Date().toISOString(),
          status: null,
          durationMs,
          url,
          method,
          message: error.message
        }
      };
    }

    return {
      ...fallback,
      log: {
        timestamp: new Date().toISOString(),
        status: null,
        durationMs,
        url,
        method,
        message: fallback.message
      }
    };
  }

  async getDeviceInfo(): Promise<{ result?: DeviceInfoResult; error?: GatewayError; log: RequestLog }> {
    try {
      const response = await this.request('GET', '/ISAPI/System/deviceInfo');
      if (response.status < 200 || response.status >= 300) {
        return {
          log: response.log,
          error: {
            message: `Respuesta no exitosa (${response.status}) en deviceInfo`,
            status: response.status,
            details: response.text
          }
        };
      }

      let parsedFromXml = false;
      let json: unknown;

      try {
        json = JSON.parse(response.text);
      } catch {
        parsedFromXml = true;
        json = xmlParser.parse(response.text);
      }

      return {
        log: response.log,
        result: {
          ok: true,
          status: response.status,
          url: response.url,
          durationMs: response.durationMs,
          raw: response.text,
          json,
          parsedFromXml
        }
      };
    } catch (error) {
      const gatewayError = error as GatewayError & { log: RequestLog };
      return { error: gatewayError, log: gatewayError.log };
    }
  }

  async searchUsers(payload: SearchUsersPayload): Promise<{ result?: SearchUsersResult; error?: GatewayError; log: RequestLog }> {
    const body = {
      UserInfoSearchCond: {
        searchID: '1',
        searchResultPosition: payload.searchResultPosition,
        maxResults: payload.maxResults,
        fuzzySearch: payload.fuzzySearch ?? ''
      }
    };

    try {
      const response = await this.request('POST', '/ISAPI/AccessControl/UserInfo/Search?format=json', body);
      if (response.status < 200 || response.status >= 300) {
        return {
          log: response.log,
          error: {
            message: `Respuesta no exitosa (${response.status}) en UserInfo/Search`,
            status: response.status,
            details: response.text
          }
        };
      }

      return {
        log: response.log,
        result: {
          ok: true,
          status: response.status,
          url: response.url,
          durationMs: response.durationMs,
          json: JSON.parse(response.text),
          raw: response.text
        }
      };
    } catch (error) {
      const gatewayError = error as GatewayError & { log: RequestLog };
      return { error: gatewayError, log: gatewayError.log };
    }
  }
}

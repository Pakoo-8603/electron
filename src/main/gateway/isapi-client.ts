import { createHash } from 'node:crypto';
import { fetch } from 'undici';

export interface IsapiCredentials {
  username: string;
  password: string;
}

const basicAuth = (username: string, password: string) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

const md5 = (value: string) => createHash('md5').update(value).digest('hex');

const digestHeader = (
  method: string,
  uri: string,
  credentials: IsapiCredentials,
  challenge: string
): string | undefined => {
  const realm = challenge.match(/realm="([^"]+)"/)?.[1];
  const nonce = challenge.match(/nonce="([^"]+)"/)?.[1];
  const qop = challenge.match(/qop="?([^,"]+)"?/)?.[1] ?? 'auth';
  if (!realm || !nonce) return undefined;

  const nc = '00000001';
  const cnonce = md5(`${Date.now()}${Math.random()}`).slice(0, 16);
  const ha1 = md5(`${credentials.username}:${realm}:${credentials.password}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);

  return `Digest username="${credentials.username}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;
};

export const isapiRequest = async (
  baseUrl: string,
  endpoint: string,
  method: string,
  credentials: IsapiCredentials,
  body?: string
): Promise<Response> => {
  const url = `${baseUrl}${endpoint}`;
  let response = await fetch(url, {
    method,
    headers: { Authorization: basicAuth(credentials.username, credentials.password), 'Content-Type': 'application/xml' },
    body
  });

  if (response.status === 401) {
    const challenge = response.headers.get('www-authenticate') ?? '';
    const digest = digestHeader(method, endpoint, credentials, challenge);
    if (digest) {
      response = await fetch(url, {
        method,
        headers: { Authorization: digest, 'Content-Type': 'application/xml' },
        body
      });
    }
  }

  return response as unknown as Response;
};

import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import type { NormalizedEvent } from './types.js';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

const toDirection = (value?: string): NormalizedEvent['direction'] => {
  if (!value) return 'unknown';
  const normalized = value.toLowerCase();
  if (normalized.includes('in')) return 'in';
  if (normalized.includes('out')) return 'out';
  return 'unknown';
};

const hashEvent = (input: string) => createHash('sha256').update(input).digest('hex');

export const normalizeEvent = (deviceId: string, siteId: string, payload: string): NormalizedEvent => {
  const gatewayTimestamp = new Date().toISOString();
  let parsed: Record<string, any> = {};

  try {
    parsed = payload.trim().startsWith('{') ? JSON.parse(payload) : parser.parse(payload);
  } catch {
    parsed = { raw: payload };
  }

  const root = parsed.EventNotificationAlert ?? parsed.event ?? parsed;
  const timestampDevice = root.dateTime ?? root.timestamp ?? gatewayTimestamp;
  const personIdRaw = root.employeeNoString ?? root.cardNo ?? root.personId;
  const personId = personIdRaw !== undefined ? String(personIdRaw) : undefined;
  const eventType = root.eventType ?? root.majorEventType ?? root.eventDescription ?? 'unknown';

  const dedupeCore = [
    deviceId,
    timestampDevice,
    eventType,
    personId ?? '',
    root.serialNo ?? root.eventId ?? ''
  ].join('|');

  return {
    eventId: hashEvent(dedupeCore),
    deviceId,
    siteId,
    timestampDevice,
    timestampGateway: gatewayTimestamp,
    eventType,
    personId,
    personName: root.name,
    verifyMode: root.currentVerifyMode ?? root.verifyMode,
    doorNo: Number(root.doorNo) || undefined,
    direction: toDirection(root.direction ?? root.entryDirection),
    rawPayload: payload
  };
};

export const isDuplicateWindow = (
  candidate: NormalizedEvent,
  existing: Pick<NormalizedEvent, 'eventId' | 'timestampDevice'>,
  toleranceSeconds = 3
): boolean => {
  if (candidate.eventId === existing.eventId) return true;
  const a = Date.parse(candidate.timestampDevice);
  const b = Date.parse(existing.timestampDevice);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.abs(a - b) <= toleranceSeconds * 1000;
};

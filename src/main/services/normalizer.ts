import crypto from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { NormalizedEvent } from '../../shared/types';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ''
});

export function parseRawPayload(payload: string): Record<string, unknown> {
  const trimmed = payload.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }
  return parser.parse(trimmed) as Record<string, unknown>;
}

export function normalizeEvent(params: {
  payload: string;
  deviceId: string;
  siteId: string;
}): NormalizedEvent {
  const parsed = parseRawPayload(params.payload);
  const eventCandidate = (parsed.EventNotificationAlert as Record<string, unknown>) || parsed;
  const major = String(eventCandidate.major || eventCandidate.eventType || 'unknown');
  const minor = String(eventCandidate.minor || eventCandidate.subEventType || 'unknown');
  const deviceTs = String(eventCandidate.dateTime || eventCandidate.timestamp || new Date().toISOString());
  const personId = eventCandidate.employeeNoString || eventCandidate.cardNo || eventCandidate.userId;
  const verifyMode = eventCandidate.currentVerifyMode || eventCandidate.verifyMode;
  const door = eventCandidate.doorNo;
  const directionRaw = String(eventCandidate.inAndOutType || '').toLowerCase();
  const direction = directionRaw.includes('in') ? 'in' : directionRaw.includes('out') ? 'out' : undefined;

  const base = `${params.deviceId}|${deviceTs}|${major}|${minor}|${personId ?? ''}|${door ?? ''}`;
  const eventId = crypto.createHash('sha256').update(base).digest('hex');

  return {
    event_id: eventId,
    device_id: params.deviceId,
    site_id: params.siteId,
    timestamp_device: deviceTs,
    timestamp_gateway: new Date().toISOString(),
    event_type: mapEventType(major, minor),
    person_id: personId ? String(personId) : undefined,
    person_name: eventCandidate.name ? String(eventCandidate.name) : undefined,
    verify_mode: verifyMode ? String(verifyMode) : undefined,
    door_no: door ? String(door) : undefined,
    direction,
    raw_payload: params.payload
  };
}

function mapEventType(major: string, minor: string): string {
  const normalized = `${major}:${minor}`.toLowerCase();
  if (normalized.includes('access') && normalized.includes('granted')) return 'accessGranted';
  if (normalized.includes('access') && normalized.includes('denied')) return 'accessDenied';
  if (normalized.includes('dooropen')) return 'doorOpen';
  return normalized;
}

export function shouldDedupe(candidate: NormalizedEvent, existing: Pick<NormalizedEvent, 'event_id' | 'timestamp_device'> | undefined): boolean {
  if (!existing) return false;
  if (existing.event_id === candidate.event_id) return true;
  const delta = Math.abs(new Date(existing.timestamp_device).getTime() - new Date(candidate.timestamp_device).getTime());
  return delta <= 5000;
}

import { describe, expect, it } from 'vitest';
import { normalizeEvent, shouldDedupe } from '../src/main/services/normalizer';

describe('normalizer', () => {
  it('normalizes XML access event', () => {
    const raw = `<EventNotificationAlert><major>accessControl</major><minor>accessGranted</minor><dateTime>2025-01-01T10:00:00Z</dateTime><employeeNoString>42</employeeNoString></EventNotificationAlert>`;
    const event = normalizeEvent({ payload: raw, deviceId: 'dev-1', siteId: 'site-1' });

    expect(event.event_type).toBe('accessGranted');
    expect(event.person_id).toBe('42');
    expect(event.event_id).toHaveLength(64);
  });

  it('dedupes same event id', () => {
    const base = normalizeEvent({ payload: '{"eventType":"accessGranted","timestamp":"2025-01-01T10:00:00Z"}', deviceId: 'dev', siteId: 'site' });
    expect(shouldDedupe(base, { event_id: base.event_id, timestamp_device: base.timestamp_device })).toBe(true);
  });
});

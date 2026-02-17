import { describe, expect, it } from 'vitest';
import { isDuplicateWindow, normalizeEvent } from '../src/shared/schema.js';

describe('normalizeEvent', () => {
  it('normalizes XML alert payload', () => {
    const payload = `
      <EventNotificationAlert>
        <dateTime>2025-02-01T08:00:00Z</dateTime>
        <eventType>accessGranted</eventType>
        <employeeNoString>1001</employeeNoString>
        <name>Ana</name>
        <currentVerifyMode>face</currentVerifyMode>
        <doorNo>1</doorNo>
        <direction>in</direction>
      </EventNotificationAlert>
    `;

    const normalized = normalizeEvent('dev-1', 'site-1', payload);
    expect(normalized.deviceId).toBe('dev-1');
    expect(normalized.personId).toBe('1001');
    expect(normalized.eventType).toBe('accessGranted');
    expect(normalized.direction).toBe('in');
  });

  it('dedupes by event id and timestamp window', () => {
    const a = normalizeEvent('dev-1', 'site-1', '{"timestamp":"2025-02-01T08:00:00Z","eventType":"doorOpen"}');
    const b = { ...a, timestampDevice: '2025-02-01T08:00:02Z' };
    expect(isDuplicateWindow(a, b)).toBe(true);
  });
});

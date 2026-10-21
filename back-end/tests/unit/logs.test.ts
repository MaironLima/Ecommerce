import { describe, it, expect } from 'vitest';
import { logQuerySchema, matches, resolveRange } from '../../src/modules/admin/logs.js';

const q = (over: Record<string, unknown> = {}) => logQuerySchema.parse(over);
const entry = { level: 'warn', event: 'http.request', message: 'POST /auth/login 401', method: 'POST', path: '/auth/login', status: 401, uid: 'u_abc', requestId: 'r-1' };

describe('Logs viewer - filters', () => {
  it('matches everything with no filters', () => {
    expect(matches(entry, q())).toBe(true);
  });

  it('filters by status family (4xx) and exact status', () => {
    expect(matches(entry, q({ status: '4xx' }))).toBe(true);
    expect(matches(entry, q({ status: '5xx' }))).toBe(false);
    expect(matches(entry, q({ status: '401' }))).toBe(true);
    expect(matches(entry, q({ status: '404' }))).toBe(false);
    expect(matches({ event: 'cron.started' }, q({ status: '4xx' }))).toBe(false);
  });

  it('filters by level, event (or message), method, user and request', () => {
    expect(matches(entry, q({ level: 'error' }))).toBe(false);
    expect(matches(entry, q({ event: 'http.request' }))).toBe(true);
    expect(matches({ message: 'audit' }, q({ event: 'audit' }))).toBe(true);
    expect(matches(entry, q({ method: 'GET' }))).toBe(false);
    expect(matches(entry, q({ uid: 'u_other' }))).toBe(false);
    expect(matches(entry, q({ requestId: 'r-1' }))).toBe(true);
  });

  it('free text searches the whole entry, case-insensitively', () => {
    expect(matches(entry, q({ q: 'AUTH/LOGIN' }))).toBe(true);
    expect(matches(entry, q({ q: 'checkout' }))).toBe(false);
  });

  it('rejects malformed filters', () => {
    expect(() => q({ status: 'abc' })).toThrow();
    expect(() => q({ from: '21/10/2026' })).toThrow();
    expect(() => q({ source: '../../etc/passwd' })).toThrow();
    expect(() => q({ limit: 5000 })).toThrow();
  });
});

describe('Logs viewer - date range', () => {
  const now = new Date('2026-10-21T15:00:00');

  it('defaults to the last 7 days', () => {
    expect(resolveRange(undefined, undefined, now)).toEqual({ start: '2026-10-15', end: '2026-10-21' });
  });

  it('rejects inverted ranges and ranges over 31 days', () => {
    expect(() => resolveRange('2026-10-21', '2026-10-01')).toThrow(/before/);
    expect(() => resolveRange('2026-01-01', '2026-10-01')).toThrow(/31 days/);
  });
});

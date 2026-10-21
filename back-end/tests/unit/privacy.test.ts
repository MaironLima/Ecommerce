import { describe, it, expect } from 'vitest';
import { maskEmail, maskIp, pseudonymize, redact, scrubString } from '../../src/common/utils/privacy.js';

describe('LGPD - maskEmail', () => {
  it('keeps first letter and domain only', () => {
    expect(maskEmail('customer@store.com')).toBe('c***@store.com');
  });

  it('masks every e-mail inside free text', () => {
    expect(maskEmail('from ana@x.io to bob@y.com')).toBe('from a***@x.io to b***@y.com');
  });
});

describe('LGPD - maskIp', () => {
  it('zeroes the last IPv4 octet (also IPv4-mapped IPv6)', () => {
    expect(maskIp('192.168.10.77')).toBe('192.168.10.0');
    expect(maskIp('::ffff:10.0.0.9')).toBe('10.0.0.0');
  });

  it('keeps only the IPv6 network prefix', () => {
    expect(maskIp('2804:14d:5c81:8a2b:1:2:3:4')).toBe('2804:14d:5c81::');
  });

  it('leaves loopback and undefined alone', () => {
    expect(maskIp('::1')).toBe('::1');
    expect(maskIp(undefined)).toBeUndefined();
  });
});

describe('LGPD - pseudonymize', () => {
  it('is stable, prefixed and does not contain the id', () => {
    const a = pseudonymize('user-123');
    expect(a).toMatch(/^u_[0-9a-f]{16}$/);
    expect(a).toBe(pseudonymize('user-123'));
    expect(a).not.toContain('user-123');
    expect(pseudonymize('user-456')).not.toBe(a);
  });
});

describe('LGPD - redact', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ1MSJ9.c2lnbmF0dXJl';

  it('removes credentials and secrets by key, at any depth', () => {
    const out = redact({
      password: 'hunter2',
      newPassword: 'x',
      accessToken: 't',
      headers: { authorization: 'Bearer abc', cookie: 'refreshToken=1' },
      nested: { deeper: { client_secret: 'pi_secret' } },
    }) as any;
    expect(out.password).toBe('[REDACTED]');
    expect(out.newPassword).toBe('[REDACTED]');
    expect(out.accessToken).toBe('[REDACTED]');
    expect(out.headers.authorization).toBe('[REDACTED]');
    expect(out.headers.cookie).toBe('[REDACTED]');
    expect(out.nested.deeper.client_secret).toBe('[REDACTED]');
  });

  it('removes address, document and payment fields', () => {
    const out = redact({ street: 'Rua A', zip_code: '01000-000', cpf: '123', card: '4242', shipping_address: { city: 'SP' }, phone: '9' }) as any;
    for (const k of ['street', 'zip_code', 'cpf', 'card', 'shipping_address', 'phone']) expect(out[k]).toBe('[REDACTED]');
  });

  it('masks e-mail and IP fields instead of dropping them', () => {
    expect(redact({ email: 'jane@store.com', ip: '200.1.2.3' })).toEqual({ email: 'j***@store.com', ip: '200.1.2.0' });
  });

  it('keeps operational fields readable (statusCode, errorCode, status)', () => {
    expect(redact({ statusCode: 404, errorCode: 'NOT_FOUND', status: 404, durationMs: 3 })).toEqual({
      statusCode: 404,
      errorCode: 'NOT_FOUND',
      status: 404,
      durationMs: 3,
    });
  });

  it('scrubs tokens, bearer headers, card numbers and e-mails hidden in strings', () => {
    const text = scrubString(`token ${jwt} header Bearer abc.def card 4242 4242 4242 4242 mail x@y.com`);
    expect(text).not.toContain(jwt);
    expect(text).not.toContain('abc.def');
    expect(text).not.toContain('4242 4242');
    expect(text).toContain('x***@y.com');
  });

  it('survives cycles and errors', () => {
    const a: any = { name: 'a' };
    a.self = a;
    expect((redact(a) as any).self).toBe('[Truncated]');
    expect(redact(new Error('fail for x@y.com'))).toEqual({ name: 'Error', message: 'fail for x***@y.com' });
  });
});

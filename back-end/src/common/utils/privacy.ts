// LGPD helpers: data minimization (mask), pseudonymization (HMAC) and redaction for anything that reaches a log.
import crypto from 'crypto';

const REDACTED = '[REDACTED]';

// Keys whose values are never logged (credentials, secrets, payment and address data).
// Ambiguous words (code, number, rg, pass) only match as the whole key, so statusCode/errorCode stay readable.
const SENSITIVE_KEY =
  /password|passwd|^pass$|token|secret|authorization|cookie|api_?key|signature|^(code|otp|verification_?code)$|card|cvc|cvv|iban|cpf|cnpj|^rg$|phone|street|^number$|complement|district|zip|^cep$|shipping_address|^address(es)?$|birth/i;
const EMAIL_KEY = /^e?mail$|email/i;
const IP_KEY = /^(ip|ips|remote_?addr|x-forwarded-for)$/i;

const EMAIL_RE = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const JWT_RE = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const BEARER_RE = /Bearer\s+[\w.-]+/gi;
const CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;

export function maskEmail(email: string) {
  return email.replace(EMAIL_RE, '$1***@$2');
}

// IPv4: drop last octet. IPv6: keep first 3 groups. Enough for abuse analysis, not to identify a person.
export function maskIp(ip: string | undefined) {
  if (!ip) return undefined;
  const v4 = ip.replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return v4.replace(/\.\d+$/, '.0');
  if (ip === '::1') return ip; // loopback identifies nobody
  return ip.split(':').filter(Boolean).slice(0, 3).join(':') + '::';
}

// Stable pseudonym for a user id: lets us correlate a user's events without storing who they are.
// Re-identification needs the secret + database access (LGPD art. 13 §4).
export function pseudonymize(id: string | undefined) {
  if (!id) return undefined;
  const secret = process.env.LOG_HASH_SECRET || process.env.JWT_SECRET || 'dev-log-secret';
  return 'u_' + crypto.createHmac('sha256', secret).update(id).digest('hex').slice(0, 16);
}

export function scrubString(value: string) {
  return maskEmail(value).replace(BEARER_RE, 'Bearer ' + REDACTED).replace(JWT_RE, REDACTED).replace(CARD_RE, REDACTED);
}

// Deep copy with sensitive values removed/masked. Safe on cycles and very deep objects.
export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (value instanceof Error) return { name: value.name, message: scrubString(value.message) };
  if (depth > 6 || seen.has(value)) return '[Truncated]';
  seen.add(value);

  if (Array.isArray(value)) return value.map(v => redact(v, depth + 1, seen));

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (EMAIL_KEY.test(key) && typeof v === 'string') out[key] = maskEmail(v);
    else if (IP_KEY.test(key) && typeof v === 'string') out[key] = maskIp(v);
    else if (SENSITIVE_KEY.test(key)) out[key] = REDACTED;
    else out[key] = redact(v, depth + 1, seen);
  }
  return out;
}

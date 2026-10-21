// Log viewer for the admin hub: reads the rotated JSON-lines files (including .gz archives) and filters them.
// Everything in these files was already redacted by the logger, so nothing new is exposed here.
import fs from 'fs/promises';
import path from 'path';
import { gunzipSync } from 'zlib';
import * as z from 'zod';
import { LOG_DIR } from '../../common/utils/logger.js';
import { HttpError } from '../../common/utils/errors.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 31;

export const logQuerySchema = z.object({
  source: z.enum(['app', 'error', 'access']).default('app'),
  from: z.string().regex(DATE).optional(),
  to: z.string().regex(DATE).optional(),
  level: z.enum(['error', 'warn', 'info', 'http']).optional(),
  event: z.string().max(80).optional(),
  status: z.string().regex(/^([1-5]xx|[1-5]\d\d)$/, 'status must be like 404 or 4xx').optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
  requestId: z.string().max(64).optional(),
  uid: z.string().max(40).optional(),
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type LogQuery = z.infer<typeof logQuerySchema>;
export type LogEntry = Record<string, unknown> & { timestamp?: string; level?: string; event?: string; message?: string };

// Rotated files are named with the server's local date (winston-daily-rotate-file default).
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function resolveRange(from?: string, to?: string, now = new Date()) {
  const end = to ?? localDay(now);
  const start = from ?? localDay(new Date(new Date(`${end}T12:00:00`).getTime() - 6 * 86_400_000));
  const days = (Date.parse(end) - Date.parse(start)) / 86_400_000;
  if (days < 0) throw new HttpError(400, '"from" must be before "to"', 'INVALID_RANGE');
  if (days > MAX_RANGE_DAYS) throw new HttpError(400, `Range is limited to ${MAX_RANGE_DAYS} days`, 'INVALID_RANGE');
  return { start, end };
}

// Pure: applies every filter to already-parsed entries (unit-tested).
export function matches(e: LogEntry, f: LogQuery) {
  if (f.level && e.level !== f.level) return false;
  if (f.event && e.event !== f.event && e.message !== f.event) return false;
  if (f.method && e.method !== f.method) return false;
  if (f.requestId && e.requestId !== f.requestId) return false;
  if (f.uid && e.uid !== f.uid) return false;
  if (f.status) {
    const s = String(e.status ?? '');
    if (f.status.endsWith('xx') ? s[0] !== f.status[0] || s.length !== 3 : s !== f.status) return false;
  }
  if (f.q && !JSON.stringify(e).toLowerCase().includes(f.q.toLowerCase())) return false;
  return true;
}

async function readEntries(file: string): Promise<LogEntry[]> {
  const raw = await fs.readFile(path.join(LOG_DIR, file));
  const text = file.endsWith('.gz') ? gunzipSync(raw).toString('utf8') : raw.toString('utf8');
  const entries: LogEntry[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // partial line while the file is being written — skip
    }
  }
  return entries;
}

// ponytail: reads the whole date range into memory (fine for a single server's daily files);
// at higher volume ship logs to Loki/Elasticsearch and query there.
export async function searchLogs(query: LogQuery) {
  const { start, end } = resolveRange(query.from, query.to);
  const pattern = new RegExp(`^${query.source}-(\\d{4}-\\d{2}-\\d{2})\\.log(\\.gz)?$`);

  let names: string[] = [];
  try {
    names = await fs.readdir(LOG_DIR);
  } catch {
    names = []; // no logs written yet
  }
  const files = names
    .map(name => ({ name, day: name.match(pattern)?.[1] }))
    .filter((f): f is { name: string; day: string } => !!f.day && f.day >= start && f.day <= end);

  const all = (await Promise.all(files.map(f => readEntries(f.name)))).flat();
  all.sort((a, b) => String(b.timestamp ?? '').localeCompare(String(a.timestamp ?? '')));

  const filtered = all.filter(e => matches(e, query));
  const count = (key: 'event' | 'level') =>
    Object.entries(all.reduce<Record<string, number>>((acc, e) => {
      const v = (key === 'event' ? e.event ?? e.message : e.level) as string | undefined;
      if (v) acc[v] = (acc[v] ?? 0) + 1;
      return acc;
    }, {}))
      .sort((a, b) => b[1] - a[1])
      .map(([value, total]) => ({ value, total }));

  return {
    range: { from: start, to: end },
    total: filtered.length,
    page: query.page,
    pages: Math.max(1, Math.ceil(filtered.length / query.limit)),
    entries: filtered.slice((query.page - 1) * query.limit, query.page * query.limit),
    facets: { events: count('event'), levels: count('level') },
  };
}

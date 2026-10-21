import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { gzipSync } from 'zlib';
import { api, createUser, prisma, resetDb } from './helpers.js';

const day = (offset = 0) => {
  const d = new Date(Date.now() + offset * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const lines = (entries: object[]) => entries.map(e => JSON.stringify(e)).join('\n') + '\n';

let admin: Awaited<ReturnType<typeof createUser>>;
let superadmin: Awaited<ReturnType<typeof createUser>>;
let customer: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
  await resetDb();
  [admin, superadmin, customer] = await Promise.all([createUser('ADMIN'), createUser('SUPERADMIN'), createUser()]);

  // Real files in the format the logger writes: today's plain file + yesterday's rotated .gz archive.
  const dir = process.env.LOG_DIR as string;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `app-${day()}.log`), lines([
    { timestamp: new Date().toISOString(), level: 'warn', event: 'auth.login.failed', message: 'auth.login.failed', email: 'c***@store.com', requestId: 'req-today' },
    { timestamp: new Date().toISOString(), level: 'http', event: 'http.request', message: 'GET /products 200', method: 'GET', path: '/products', status: 200, requestId: 'req-today' },
  ]) + '{"broken json line');
  fs.writeFileSync(path.join(dir, `app-${day(-1)}.log.gz`), gzipSync(lines([
    { timestamp: new Date(Date.now() - 86_400_000).toISOString(), level: 'error', event: 'request.unhandled_error', message: 'boom', status: 500, uid: 'u_123' },
  ])));
  fs.writeFileSync(path.join(dir, `access-${day()}.log`), lines([{ timestamp: new Date().toISOString(), level: 'info', message: 'access', clientIp: '203.0.113.7', status: 200 }]));
});

describe('Integration - admin log viewer', () => {
  it('reads plain and gzipped files, newest first, skipping corrupt lines', async () => {
    const res = await api().get('/admin/logs').set('Authorization', admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.entries[0].timestamp >= res.body.entries[2].timestamp).toBe(true);
    expect(res.body.entries.at(-1).event).toBe('request.unhandled_error');
  });

  it('filters and returns facets for the dropdowns', async () => {
    const res = await api().get('/admin/logs').query({ status: '5xx' }).set('Authorization', admin.auth);
    expect(res.body.entries.map((e: any) => e.event)).toEqual(['request.unhandled_error']);
    expect(res.body.facets.events.map((f: any) => f.value)).toEqual(expect.arrayContaining(['auth.login.failed', 'http.request']));

    const byRequest = await api().get('/admin/logs').query({ requestId: 'req-today' }).set('Authorization', admin.auth);
    expect(byRequest.body.total).toBe(2);
  });

  it('paginates', async () => {
    const res = await api().get('/admin/logs').query({ limit: 2, page: 2 }).set('Authorization', admin.auth);
    expect(res.body).toMatchObject({ page: 2, pages: 2 });
    expect(res.body.entries).toHaveLength(1);
  });

  it('is closed to customers and validates input', async () => {
    expect((await api().get('/admin/logs').set('Authorization', customer.auth)).status).toBe(403);
    expect((await api().get('/admin/logs').query({ from: '2020-01-01' }).set('Authorization', admin.auth)).status).toBe(400);
  });

  it('access log (full IP) is SUPERADMIN-only and every read is audited', async () => {
    expect((await api().get('/admin/logs').query({ source: 'access' }).set('Authorization', admin.auth)).status).toBe(403);

    const res = await api().get('/admin/logs').query({ source: 'access' }).set('Authorization', superadmin.auth);
    expect(res.status).toBe(200);
    expect(res.body.entries[0].clientIp).toBe('203.0.113.7');
    expect(await prisma.auditLog.count({ where: { action: 'ACCESS_LOG_VIEW', actor_id: superadmin.user.id } })).toBe(1);
  });
});

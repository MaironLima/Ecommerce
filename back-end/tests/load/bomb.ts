// Load / stress ("bomb") suite. Self-contained: seeds the test DB, boots the API on a random port and attacks it.
//   npm run test:load          (env: LOAD_DURATION=10 LOAD_CONNECTIONS=50 LOAD_P99_MS=1500)
// Exits 1 if any threshold breaks.
import autocannon from 'autocannon';
import type { AddressInfo } from 'net';
import { prepareTestDb } from '../support/test-db.js';

const DURATION = Number(process.env.LOAD_DURATION ?? 10);
const CONNECTIONS = Number(process.env.LOAD_CONNECTIONS ?? 50);
const P99_MS = Number(process.env.LOAD_P99_MS ?? 1500);

const url = await prepareTestDb({ seed: true });
Object.assign(process.env, { DATABASE_URL: url, MAIL_USER: '', MAIL_PASSWORD: '', STRIPE_SECRET_KEY: '', LOG_LEVEL: 'warn', LOG_DIR: (await import('path')).join((await import('os')).tmpdir(), 'ecommerce-load-logs') });
delete process.env.RATE_LIMIT_AUTH; // the brute-force scenario must face the production limit

const { createApp } = await import('../../src/appFactory.js');
const { prisma } = await import('../../src/libs/prisma.js');
const bcrypt = (await import('bcrypt')).default;
const jwt = (await import('jsonwebtoken')).default;

const server = createApp().listen(0);
const base = `http://localhost:${(server.address() as AddressInfo).port}`;

const failures: string[] = [];
const rows: Record<string, unknown>[] = [];

async function blast(name: string, path: string, headers: Record<string, string> = {}) {
  const r = await autocannon({ url: base + path, connections: CONNECTIONS, duration: DURATION, headers });
  const p99 = r.latency.p99;
  rows.push({ scenario: name, 'req/s': Math.round(r.requests.average), 'p50 ms': r.latency.p50, 'p99 ms': p99, errors: r.errors, timeouts: r.timeouts, non2xx: r.non2xx, total: r.requests.total });
  if (r.errors || r.timeouts) failures.push(`${name}: ${r.errors} errors / ${r.timeouts} timeouts`);
  if (r.non2xx) failures.push(`${name}: ${r.non2xx} non-2xx responses`);
  if (p99 > P99_MS) failures.push(`${name}: p99 ${p99}ms > ${P99_MS}ms`);
}

const customer = await prisma.user.findUniqueOrThrow({ where: { email: 'customer@store.com' } });
const auth = { Authorization: `Bearer ${jwt.sign({ userId: customer.id, role: 'CUSTOMER' }, process.env.JWT_SECRET as string)}` };
const product = await prisma.product.findFirstOrThrow();

console.log(`\nLoad: ${CONNECTIONS} connections × ${DURATION}s per scenario against ${base}\n`);
await blast('health', '/health');
await blast('catalog list', '/products?category=all&page=1');
await blast('full-text search', '/products/search?q=headphones');
await blast('product detail', `/products/${product.id}`);
await blast('categories', '/catalog/category');
await blast('my orders (auth)', '/orders', auth);
await blast('notifications (auth)', '/notifications', auth);
console.table(rows);

// --- Brute force bomb: login rate limit must kick in and nothing may crash.
const attempts = await Promise.all(
  Array.from({ length: 40 }, () =>
    fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'customer@store.com', password: 'guess' }) }).then(r => r.status),
  ),
);
const limited = attempts.filter(s => s === 429).length;
console.log(`brute force: ${attempts.length} attempts → ${limited}×429, ${attempts.filter(s => s === 401).length}×401, ${attempts.filter(s => s >= 500).length}×5xx`);
if (limited < attempts.length - 5) failures.push(`brute force: only ${limited} of ${attempts.length} attempts were rate limited`);
if (attempts.some(s => s >= 500 || s === 202)) failures.push('brute force: unexpected 5xx or successful login');

// --- Overselling race: N buyers grab the last units of one variant at the same instant.
const STOCK = 5;
const BUYERS = 20;
const variant = await prisma.productVariant.create({ data: { product_id: product.id, attributes: { edition: 'limited' }, stock: STOCK, price_override: 10 } });
const hash = await bcrypt.hash('x', 4);
const buyers = await Promise.all(
  Array.from({ length: BUYERS }, (_, i) =>
    prisma.user.create({ data: { email: `race-${i}-${Date.now()}@test.com`, name: `Racer ${i}`, role: 'CUSTOMER', password: hash } }),
  ),
);
const results = await Promise.all(
  buyers.map(u =>
    fetch(`${base}/cart`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${jwt.sign({ userId: u.id, role: 'CUSTOMER' }, process.env.JWT_SECRET as string)}` },
      body: JSON.stringify({ variant_id: variant.id, quantity: 1 }),
    }).then(r => r.status),
  ),
);
const finalStock = (await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock;
const reserved = await prisma.inventoryReservation.aggregate({ where: { variant_id: variant.id }, _sum: { quantity: true } });
const won = results.filter(s => s === 201).length;
console.log(`overselling race: ${BUYERS} buyers, stock ${STOCK} → ${won} succeeded, final stock ${finalStock}, reserved ${reserved._sum.quantity ?? 0}`);
if (won !== STOCK || finalStock !== 0 || (reserved._sum.quantity ?? 0) !== STOCK) failures.push(`overselling: ${won} reservations for ${STOCK} units (final stock ${finalStock})`);
if (results.some(s => s >= 500)) failures.push('overselling race: 5xx responses');

server.close();
await prisma.$disconnect();

if (failures.length) {
  console.error('\nFAILED thresholds:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('\nAll load thresholds passed.');
process.exit(0);

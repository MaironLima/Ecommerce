// Creates/migrates/resets the dedicated test database used by integration, E2E and load tests.
// CLI: `tsx tests/support/test-db.ts [--seed]`
import 'dotenv/config';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import pg from 'pg';

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function testDatabaseUrl() {
  if (process.env.DATABASE_URL_TEST) return process.env.DATABASE_URL_TEST;
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('Set DATABASE_URL (or DATABASE_URL_TEST) in back-end/.env');
  const url = new URL(base);
  const name = decodeURIComponent(url.pathname.slice(1));
  if (/test/i.test(name)) return base; // already pointing at a test database
  url.pathname = `${name}-test`;
  return url.toString();
}

// Guard: these helpers TRUNCATE everything, so they only ever touch a database whose name says "test".
function assertTestDb(url: string) {
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!/test/i.test(name)) throw new Error(`Refusing to reset "${name}": test database name must contain "test"`);
  return name;
}

// The test database is disposable: recreate it so every run starts from the migrations, with no leftovers.
async function recreate(url: string, name: string) {
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const quoted = `"${name.replace(/"/g, '')}"`;
    await client.query(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${quoted}`);
  } finally {
    await client.end();
  }
}

export async function truncateAll(url = testDatabaseUrl()) {
  assertTestDb(url);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    );
    if (rows.length) {
      await client.query(`TRUNCATE ${rows.map(r => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await client.end();
  }
}

export async function prepareTestDb({ seed = false } = {}) {
  const url = testDatabaseUrl();
  const name = assertTestDb(url);
  await recreate(url, name);
  const env = { ...process.env, DATABASE_URL: url };
  run('npx prisma migrate deploy', env);
  if (seed) run('npx tsx prisma/seed.ts', env);
  return url;
}

function run(cmd: string, env: NodeJS.ProcessEnv) {
  try {
    execSync(cmd, { cwd: BACKEND_DIR, env, stdio: 'pipe' });
  } catch (e: any) {
    throw new Error(`"${cmd}" failed:\n${e.stdout?.toString() ?? ''}${e.stderr?.toString() ?? ''}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  prepareTestDb({ seed: process.argv.includes('--seed') })
    .then(url => console.log(`test database ready: ${new URL(url).pathname.slice(1)}`))
    .catch(e => {
      console.error(e.message);
      process.exit(1);
    });
}

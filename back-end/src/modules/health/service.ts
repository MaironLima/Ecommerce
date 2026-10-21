import { prisma } from '../../libs/prisma.js';

export function pingService() {
  return { ping: 'ok' };
}

export async function healthService() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'up', latencyMs: Date.now() - started, uptimeS: Math.round(process.uptime()) };
  } catch {
    return { status: 'degraded', database: 'down', latencyMs: Date.now() - started, uptimeS: Math.round(process.uptime()) };
  }
}

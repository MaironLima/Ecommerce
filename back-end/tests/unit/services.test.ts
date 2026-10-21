import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const { sendMailMock } = vi.hoisted(() => ({ sendMailMock: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: sendMailMock }) } }));

vi.mock('../../src/libs/prisma.js', () => {
  const prisma: any = {
    user: { findUnique: vi.fn() },
    notification: { create: vi.fn(), updateMany: vi.fn() },
    inventoryReservation: { findMany: vi.fn(), deleteMany: vi.fn() },
    productVariant: { update: vi.fn() },
  };
  prisma.$transaction = vi.fn((fn: (tx: any) => unknown) => fn(prisma));
  return { prisma };
});

import { prisma } from '../../src/libs/prisma.js';
import { sendMail } from '../../src/config/mail.js';
import { markReadService, notify } from '../../src/modules/notifications/services.js';
import { releaseExpiredReservations } from '../../src/modules/stock/services.js';
import { HttpError, handleError } from '../../src/common/utils/errors.js';

const db = prisma as any;

const fakeRes = () => {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

beforeEach(() => vi.clearAllMocks());

describe('Mail - sendMail', () => {
  it('never throws when SMTP fails (checkout must not break)', async () => {
    sendMailMock.mockRejectedValueOnce(new Error('SMTP down'));
    await expect(sendMail('a@b.com', 's', '<p/>')).resolves.toBeUndefined();
  });
});

describe('Notifications - notify', () => {
  it('stores the in-app notification and e-mails when asked', async () => {
    db.user.findUnique.mockResolvedValue({ email: 'jane@store.com', name: 'Jane' });
    await notify('u1', 'ORDER_PAID', 'Paid!', { subject: 'Paid', link: '/profile', linkLabel: 'See' });
    expect(db.notification.create).toHaveBeenCalledWith({ data: { user_id: 'u1', type: 'ORDER_PAID', message: 'Paid!', read: false } });
    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'jane@store.com', subject: 'Paid' }));
  });

  it('skips e-mail when not requested and does nothing for unknown users', async () => {
    db.user.findUnique.mockResolvedValueOnce({ email: 'jane@store.com', name: 'Jane' });
    await notify('u1', 'ORDER_CREATED', 'Created');
    expect(sendMailMock).not.toHaveBeenCalled();

    db.user.findUnique.mockResolvedValueOnce(null);
    await notify('ghost', 'ORDER_CREATED', 'Created');
    expect(db.notification.create).toHaveBeenCalledTimes(1);
  });

  it('markRead only touches the owner notification (404 otherwise)', async () => {
    db.notification.updateMany.mockResolvedValue({ count: 0 });
    await expect(markReadService('u1', 'n-of-someone-else')).rejects.toMatchObject({ status: 404 });
    expect(db.notification.updateMany).toHaveBeenCalledWith({ where: { id: 'n-of-someone-else', user_id: 'u1' }, data: { read: true } });
  });
});

describe('Stock - releaseExpiredReservations', () => {
  it('returns expired quantities to stock, grouped by variant', async () => {
    db.inventoryReservation.findMany.mockResolvedValue([
      { id: 'r1', variant_id: 'v1', quantity: 2 },
      { id: 'r2', variant_id: 'v1', quantity: 1 },
      { id: 'r3', variant_id: 'v2', quantity: 5 },
    ]);
    db.inventoryReservation.deleteMany.mockResolvedValue({ count: 3 });

    await expect(releaseExpiredReservations()).resolves.toEqual({ released: 3 });
    expect(db.productVariant.update).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { stock: { increment: 3 } } });
    expect(db.productVariant.update).toHaveBeenCalledWith({ where: { id: 'v2' }, data: { stock: { increment: 5 } } });
  });

  it('is a no-op when nothing expired', async () => {
    db.inventoryReservation.findMany.mockResolvedValue([]);
    await expect(releaseExpiredReservations()).resolves.toEqual({ released: 0 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe('Errors - handleError', () => {
  it('maps HttpError to its status and code', () => {
    const res = fakeRes();
    handleError(res, new HttpError(409, 'dup', 'ALREADY_REVIEWED'));
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'dup', code: 'ALREADY_REVIEWED' });
  });

  it('maps Zod errors to 400 VALIDATION with the first message', () => {
    const res = fakeRes();
    const err = z.object({ rating: z.number().max(5, 'too high') }).safeParse({ rating: 9 }).error;
    handleError(res, err);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'too high', code: 'VALIDATION' });
  });

  it('falls back to 400 for plain errors', () => {
    const res = fakeRes();
    handleError(res, new Error('boom'));
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('Stock - reserveStock (atomic, no overselling)', () => {
  it('decrements only when enough stock remains, in a single conditional UPDATE', async () => {
    const { reserveStock } = await import('../../src/modules/stock/services.js');
    const tx = { productVariant: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } } as any;
    await reserveStock(tx, 'v1', 2);
    expect(tx.productVariant.updateMany).toHaveBeenCalledWith({ where: { id: 'v1', stock: { gte: 2 } }, data: { stock: { decrement: 2 } } });
  });

  it('throws 409 OUT_OF_STOCK when the row no longer has enough stock', async () => {
    const { reserveStock } = await import('../../src/modules/stock/services.js');
    const tx = { productVariant: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } } as any;
    await expect(reserveStock(tx, 'v1', 1)).rejects.toMatchObject({ status: 409, code: 'OUT_OF_STOCK' });
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import { api, createPaidOrder, createProduct, createUser, prisma, resetDb } from './helpers.js';

const address = { label: 'Home', street: 'Av. Paulista', number: '1000', city: 'São Paulo', state: 'SP', zip_code: '01310-100' };

describe('Integration - profile, addresses, notifications', () => {
  let me: Awaited<ReturnType<typeof createUser>>;
  let other: Awaited<ReturnType<typeof createUser>>;
  let addressId: string;

  beforeAll(async () => {
    await resetDb();
    me = await createUser();
    other = await createUser();
  });

  it('address CRUD', async () => {
    const created = await api().post('/users/me/addresses').set('Authorization', me.auth).send(address);
    expect(created.status).toBe(201);
    expect(created.body.country).toBe('BR');
    addressId = created.body.id;

    const updated = await api().put(`/users/me/addresses/${addressId}`).set('Authorization', me.auth).send({ ...address, number: '2000' });
    expect(updated.body.number).toBe('2000');

    const list = await api().get('/users/me/addresses').set('Authorization', me.auth);
    expect(list.body.addresses).toHaveLength(1);
  });

  it('validates required address fields', async () => {
    const res = await api().post('/users/me/addresses').set('Authorization', me.auth).send({ ...address, city: '' });
    expect(res.status).toBe(400);
  });

  it("cannot read, edit or delete someone else's address", async () => {
    expect((await api().get('/users/me/addresses').set('Authorization', other.auth)).body.addresses).toHaveLength(0);
    expect((await api().put(`/users/me/addresses/${addressId}`).set('Authorization', other.auth).send(address)).status).toBe(404);
    expect((await api().delete(`/users/me/addresses/${addressId}`).set('Authorization', other.auth)).status).toBe(404);
    expect((await api().delete(`/users/me/addresses/${addressId}`).set('Authorization', me.auth)).status).toBe(204);
  });

  it('updates the profile name', async () => {
    const res = await api().patch('/users/me').set('Authorization', me.auth).send({ name: 'Renamed User' });
    expect(res.body.name).toBe('Renamed User');
  });

  it('marks notifications as read (only my own)', async () => {
    const mine = await prisma.notification.create({ data: { user_id: me.user.id, type: 'ORDER_PAID', message: 'm1', read: false } });
    await prisma.notification.create({ data: { user_id: me.user.id, type: 'ORDER_PAID', message: 'm2', read: false } });

    expect((await api().patch(`/notifications/${mine.id}/read`).set('Authorization', other.auth)).status).toBe(404);
    expect((await api().patch(`/notifications/${mine.id}/read`).set('Authorization', me.auth)).status).toBe(204);
    await api().patch('/notifications/read-all').set('Authorization', me.auth);

    const list = await api().get('/notifications').set('Authorization', me.auth);
    expect(list.body.notifications.every((n: any) => n.read)).toBe(true);
  });
});

describe('Integration - admin analytics & RBAC', () => {
  let admin: Awaited<ReturnType<typeof createUser>>;
  let superadmin: Awaited<ReturnType<typeof createUser>>;
  let customer: Awaited<ReturnType<typeof createUser>>;

  beforeAll(async () => {
    await resetDb();
    admin = await createUser('ADMIN');
    superadmin = await createUser('SUPERADMIN');
    customer = await createUser();

    const a = await createProduct({ title: 'Analytic A', price: 100, category: 'alpha', stock: 3 });
    const b = await createProduct({ title: 'Analytic B', price: 50, category: 'beta', stock: 20 });
    await createPaidOrder(customer.user.id, a.variant, 'Analytic A', 100, 2); // 200
    await createPaidOrder(customer.user.id, b.variant, 'Analytic B', 50, 1); // 50
    await prisma.order.create({ data: { user_id: customer.user.id, status: 'CANCELLED', total: 999 } });
  });

  it('computes KPIs from paid orders only', async () => {
    const res = await api().get('/admin/analytics').set('Authorization', admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ revenue: 250, paidOrders: 2, totalOrders: 3, users: 3, averageOrderValue: 125, conversionRate: 66.67 });
    expect(res.body.topProducts[0]).toMatchObject({ title: 'Analytic A', units: 2, revenue: 200 });
    expect(res.body.revenueByCategory).toEqual([
      { category: 'alpha', revenue: 200 },
      { category: 'beta', revenue: 50 },
    ]);
    expect(res.body.lowStock.map((v: any) => v.title)).toEqual(['Analytic A']);
    expect(res.body.salesByDay).toHaveLength(30);
    expect(res.body.salesByMonth).toHaveLength(12);
    expect(res.body.salesByDay.at(-1).revenue).toBe(250);
  });

  it('filters orders by status', async () => {
    const res = await api().get('/admin/orders?status=CANCELLED').set('Authorization', admin.auth);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0].customer.email).toMatch(/^\w\*\*\*@/); // masked (LGPD minimization)
    expect((await api().get('/admin/orders?status=WHATEVER').set('Authorization', admin.auth)).status).toBe(400);
  });

  it('enforces the 3 RBAC levels on role changes', async () => {
    expect((await api().patch(`/admin/users/${customer.user.id}/role`).set('Authorization', customer.auth).send({ role: 'ADMIN' })).status).toBe(403);
    expect((await api().patch(`/admin/users/${customer.user.id}/role`).set('Authorization', admin.auth).send({ role: 'ADMIN' })).status).toBe(403);

    const ok = await api().patch(`/admin/users/${customer.user.id}/role`).set('Authorization', superadmin.auth).send({ role: 'ADMIN' });
    expect(ok.body.role).toBe('ADMIN');

    const self = await api().patch(`/admin/users/${superadmin.user.id}/role`).set('Authorization', superadmin.auth).send({ role: 'CUSTOMER' });
    expect(self.status).toBe(400);

    const audit = await api().get('/admin/audit').set('Authorization', admin.auth);
    expect(audit.body.logs[0]).toMatchObject({ action: 'USER_ROLE_CHANGE', entity_id: customer.user.id, metadata: { from: 'CUSTOMER', to: 'ADMIN' } });
    expect(audit.body.logs[0].actor_sync).not.toHaveProperty('email');
  });

  it('lists users without password hashes', async () => {
    const res = await api().get('/admin/users').set('Authorization', admin.auth);
    expect(res.body.users).toHaveLength(3);
    expect(res.body.users.every((u: any) => u.password === undefined)).toBe(true);
  });
});

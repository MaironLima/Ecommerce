import { describe, it, expect, beforeAll } from 'vitest';
import { api, createUser, prisma, resetDb } from './helpers.js';

beforeAll(resetDb);

describe('Integration - auth & session', () => {
  const email = 'new.user@test.com';
  const password = 'secret123';

  it('registers, hashes the password and sets an HttpOnly refresh cookie', async () => {
    const res = await api().post('/auth/register').send({ email, password, name: 'New User' });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTypeOf('string');

    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/refreshToken=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.password).not.toBe(password);
    expect(user.role).toBe('CUSTOMER');
  });

  it('rejects a duplicate e-mail', async () => {
    const res = await api().post('/auth/register').send({ email, password, name: 'Again' });
    expect(res.status).toBe(400);
  });

  it('logs in and the refresh cookie issues a new access token', async () => {
    const login = await api().post('/auth/login').send({ email, password });
    expect(login.status).toBe(202);

    const refresh = await api().post('/auth/refresh').set('Cookie', login.headers['set-cookie'] as unknown as string[]);
    expect(refresh.status).toBe(202);
    expect(refresh.body.accessToken).toBeTypeOf('string');

    const me = await api().get('/users/me').set('Authorization', `Bearer ${refresh.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email, role: 'CUSTOMER' });
    expect(me.body.password).toBeUndefined();
  });

  it('answers wrong e-mail and wrong password with the same generic 401', async () => {
    const wrongPass = await api().post('/auth/login').send({ email, password: 'nope' });
    const wrongMail = await api().post('/auth/login').send({ email: 'ghost@test.com', password });
    expect(wrongPass.status).toBe(401);
    expect(wrongMail.status).toBe(401);
    expect(wrongPass.body.error).toBe(wrongMail.body.error);
  });

  it('rejects a forged token', async () => {
    const res = await api().get('/users/me').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });

  it('changes the password only with the current one', async () => {
    const { auth } = await createUser();
    const wrong = await api().patch('/users/me/password').set('Authorization', auth).send({ currentPassword: 'bad', newPassword: 'another1' });
    expect(wrong.status).toBe(400);
    const ok = await api().patch('/users/me/password').set('Authorization', auth).send({ currentPassword: 'Password123!', newPassword: 'another1' });
    expect(ok.status).toBe(200);
  });

  it('returns an X-Request-Id on every response and reuses a valid incoming one', async () => {
    const id = '3f2c1d4e-1111-4222-8333-944455556666';
    const res = await api().get('/ping').set('X-Request-Id', id);
    expect(res.headers['x-request-id']).toBe(id);
    const fresh = await api().get('/ping').set('X-Request-Id', 'not-a-uuid; drop table');
    expect(fresh.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('reports database health', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });
});

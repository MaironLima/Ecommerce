import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

vi.mock('../../src/libs/prisma.js', () => {
  return {
    prisma: {
      user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    },
  };
});

vi.mock('jsonwebtoken', () => {
  const sign = vi.fn();
  const verify = vi.fn();
  return { default: { sign, verify } };
});

vi.mock('bcrypt', () => {
  const hash = vi.fn();
  const compare = vi.fn();
  return { default: { hash, compare }, hash, compare };
});

vi.mock('nodemailer', () => {
  const sendMail = vi.fn().mockResolvedValue({});
  const createTransport = vi.fn().mockReturnValue({ sendMail });
  return { default: { createTransport } };
});

import { prisma } from '../../src/libs/prisma.js';
import { pingService } from '../../src/modules/health/service.js';
import {
  registerService,
  loginService,
  refreshService,
} from '../../src/modules/auth/services.js';
import { createApp } from '../../src/appFactory.js';

const mockedPrismaUser = prisma.user as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

const app = () => createApp();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(jwt.sign).mockImplementation(
    (payload: unknown) => `token-${JSON.stringify(payload)}` as unknown as string,
  );
});

describe('Unit - health/service.pingService', () => {
  it('returns { ping: "ok" }', () => {
    expect(pingService()).toEqual({ ping: 'ok' });
  });
});

describe('Unit - auth/registerService', () => {
  it('creates a user and returns access + refresh tokens', async () => {
    mockedPrismaUser.findUnique.mockResolvedValue(null);
    mockedPrismaUser.create.mockResolvedValue({ id: 'u1', email: 'a@b.com', name: 'Alice', password: 'h', role: 'CUSTOMER' });
    vi.mocked(bcrypt.hash).mockResolvedValue('hashed-pw' as never);

    const result = await registerService('a@b.com', 'secret123', 'Alice');

    expect(mockedPrismaUser.findUnique).toHaveBeenCalledWith({ where: { email: 'a@b.com' } });
    expect(mockedPrismaUser.create).toHaveBeenCalledOnce();
    expect(result.accessToken).toBeTypeOf('string');
    expect(result.refreshToken).toBeTypeOf('string');
  });

  it('throws when email already in use', async () => {
    mockedPrismaUser.findUnique.mockResolvedValue({ id: 'u2', email: 'dup@b.com' });

    await expect(registerService('dup@b.com', 'secret123', 'Bob')).rejects.toThrow(
      'Email already in use',
    );
    expect(mockedPrismaUser.create).not.toHaveBeenCalled();
  });
});

describe('Unit - auth/loginService', () => {
  it('returns tokens and name on valid credentials', async () => {
    mockedPrismaUser.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      name: 'Alice',
      password: 'hashed',
      role: 'CUSTOMER',
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const result = await loginService('a@b.com', 'secret123');

    expect(result.name).toBe('Alice');
    expect(result.accessToken).toBeTypeOf('string');
    expect(result.refreshToken).toBeTypeOf('string');
  });

  it('throws when user not found', async () => {
    mockedPrismaUser.findUnique.mockResolvedValue(null);
    await expect(loginService('none@b.com', 'x')).rejects.toThrow('Invalid email or password');
  });

  it('throws on wrong password', async () => {
    mockedPrismaUser.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      name: 'Alice',
      password: 'hashed',
      role: 'CUSTOMER',
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    await expect(loginService('a@b.com', 'wrong')).rejects.toThrow('Invalid email or password');
  });
});

describe('Unit - auth/refreshService', () => {
  it('returns a new access token for a valid refresh token', async () => {
    vi.mocked(jwt.verify).mockReturnValue({ userId: 'u1' } as never);
    const result = await refreshService('valid-refresh');
    expect(result.newAccessToken).toBeTypeOf('string');
    expect(vi.mocked(jwt.verify)).toHaveBeenCalledWith('valid-refresh', 'test-refresh-secret');
  });
});

describe('API - GET /ping', () => {
  it('responds 200 with { ping: "ok" }', async () => {
    const res = await request(app()).get('/ping');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ping: 'ok' });
  });
});

describe('API - POST /auth/register', () => {
  it('201 on valid registration and returns accessToken + name', async () => {
    mockedPrismaUser.findUnique.mockResolvedValue(null);
    mockedPrismaUser.create.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      name: 'Alice',
      password: 'h',
      role: 'CUSTOMER',
    });
    vi.mocked(bcrypt.hash).mockResolvedValue('hashed' as never);

    const res = await request(app()).post('/auth/register').send({
      email: 'a@b.com',
      password: 'secret123',
      name: 'Alice',
    });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('User registered successfully');
    expect(res.body.name).toBe('Alice');
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('400 on duplicate email', async () => {
    mockedPrismaUser.findUnique.mockResolvedValue({ id: 'u2', email: 'dup@b.com' });

    const res = await request(app()).post('/auth/register').send({
      email: 'dup@b.com',
      password: 'secret123',
      name: 'Bob',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Email already in use');
  });

  it('400 on invalid body (short name)', async () => {
    const res = await request(app()).post('/auth/register').send({
      email: 'a@b.com',
      password: 'secret123',
      name: 'Al',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Too few characters in the name!');
  });
});

describe('API - POST /auth/login', () => {
  it('202 on valid login', async () => {
    mockedPrismaUser.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      name: 'Alice',
      password: 'h',
      role: 'CUSTOMER',
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const res = await request(app()).post('/auth/login').send({
      email: 'a@b.com',
      password: 'secret123',
    });

    expect(res.status).toBe(202);
    expect(res.body.name).toBe('Alice');
    expect(res.body.accessToken).toBeTypeOf('string');
  });

  it('401 when email is missing', async () => {
    const res = await request(app()).post('/auth/login').send({ password: 'x' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('The email is missing');
  });
});

describe('API - POST /auth/refresh', () => {
  it('401 when no refresh token cookie is present', async () => {
    const res = await request(app()).post('/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Without refresh token');
  });
});

describe('API - GET /uploads', () => {
  it('400 when path query param is missing', async () => {
    const res = await request(app()).get('/uploads');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Parameter "path" is required');
  });

  it('404 when file does not exist on disk', async () => {
    const res = await request(app()).get('/uploads?path=nonexistent-file.webp');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('File not found');
  });
});

describe('API - unknown route', () => {
  it('404 on unknown path', async () => {
    const res = await request(app()).get('/this-route-does-not-exist');
    expect(res.status).toBe(404);
  });
});
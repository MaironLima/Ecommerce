import { hash } from 'bcrypt';
import bcrypt from 'bcrypt';
import { prisma } from '../../libs/prisma.js';
import { JWT_SECRET, REFRESH_SECRET } from '../../config/env.js';
import jwt from 'jsonwebtoken';
import { sendMail } from '../../config/mail.js';

export const codes: Record<string, number> = {};

export async function registerService(email: string, password: string, name: string) {
  const alrUsedEmail = await prisma.user.findUnique({ where: { email: email } });
  if (alrUsedEmail) throw new Error('Email already in use');

  const hashedPassword = await hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
      role: 'CUSTOMER',
    },
  });

  if (!JWT_SECRET) throw new Error('The token not is defined');
  if (!REFRESH_SECRET) throw new Error('Cookies not is defined');

  const accessToken = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: '15m',
  });
  const refreshToken = jwt.sign({ userId: user.id }, REFRESH_SECRET, { expiresIn: '1d' });

  return { accessToken, refreshToken };
}

export async function loginService(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email } });
  if (!user) throw new Error('Invalid email or password');

  const passwordCheck = await bcrypt.compare(password, user.password);

  if (!passwordCheck) throw new Error('Invalid email or password');
  if (!JWT_SECRET) throw new Error('The token not is defined');
  if (!REFRESH_SECRET) throw new Error('Cookies not is defined');

  const accessToken = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: '15m',
  });
  const refreshToken = jwt.sign({ userId: user.id }, REFRESH_SECRET, { expiresIn: '1d' });

  return { accessToken, refreshToken, name: user.name };
}

export async function refreshService(refreshToken: string) {
  if (!JWT_SECRET) {
    throw new Error('The token is not defined');
  }

  if (!REFRESH_SECRET) {
    throw new Error('Refresh secret is not defined');
  }

  const refreshVerify = jwt.verify(
    refreshToken,
    REFRESH_SECRET,
  ) as { userId: string };

  if (!refreshVerify?.userId) {
    throw new Error('Session expired');
  }

  const user = await prisma.user.findUnique({
    where: {
      id: refreshVerify.userId,
    },
    select: {
      id: true,
      role: true,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const newAccessToken = jwt.sign(
    {
      userId: user.id,
      role: user.role,
    },
    JWT_SECRET,
    {
      expiresIn: '15m',
    },
  );

  return {
    newAccessToken,
  };
}

export async function recoverEmailService(email: string) {
  const emailVerify = await prisma.user.findFirst({ where: { email: email } });
  if (!emailVerify) throw new Error('Email not found');

  const code = Math.floor(100000 + Math.random() * 900000);
  codes[email] = code;

  await sendMail(email, 'Your verification code', `<p>Your verification code is: <strong>${code}</strong></p>`);
}

export async function recoverCodeService(email: string) {
  const user = await prisma.user.findUnique({ where: { email: email } });
  if (!user) throw new Error('Account is incorrect');

  if (!JWT_SECRET) throw new Error('The token not is defined');
  if (!REFRESH_SECRET) throw new Error('Cookies not is defined');

  const accessToken = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ userId: user.id }, REFRESH_SECRET, { expiresIn: '1d' });

  return { accessToken, refreshToken, name: user.name };
}

export async function recoverPasswordService(accessToken: string, newPassword: string) {
  if (!JWT_SECRET) throw new Error('The token not is defined');
  const payload = jwt.verify(accessToken, JWT_SECRET) as { userId: string };

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) throw new Error('User not found');

  const passwordCheck = await bcrypt.compare(newPassword, user.password);
  if (passwordCheck) throw new Error('Cannot be the same password as the previous one');

  const hashedNewPassword = await hash(newPassword, 12);

  await prisma.user.update({
    where: user,
    data: {
      password: hashedNewPassword,
    },
  });

  return { name: user.name };
}

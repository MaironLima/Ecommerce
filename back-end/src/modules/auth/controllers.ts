import { Request, Response } from 'express';
import {
  codes,
  loginService,
  recoverCodeService,
  recoverEmailService,
  recoverPasswordService,
  refreshService,
  registerService,
} from './services.js';
import { codeSchema, emailSchema, passwordSchema, userSchema } from './dto.js';
import type { CookieOptions } from 'express';
import logger from '../../common/utils/logger.js';

// Refresh token lives only in an HttpOnly cookie (not readable by JS); SameSite mitigates CSRF.
const refreshCookie: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 24 * 60 * 60 * 1000,
};


export const registerController = async (req: Request, res: Response) => {
  try {
    const parsed = userSchema.safeParse(req.body);

    if (!parsed.success) {
      const firstMessage = parsed.error.issues[0]?.message || 'Validation error';
      return res.status(400).json({ error: firstMessage });
    }

    const { email, password, name } = parsed.data;
    const { accessToken, refreshToken } = await registerService(email, password, name);
    res.cookie('refreshToken', refreshToken, refreshCookie);

    logger.info('auth.register', { event: 'auth.register', email });
    res.status(201).json({ message: 'User registered successfully', name, accessToken });
  } catch (e) {
    logger.warn('auth.register.failed', { event: 'auth.register.failed', email: req.body?.email, reason: (e as Error)?.message });
    return res
      .status(400)
      .json({ error: e instanceof Error ? e.message : 'Internal server error' });
  }
};

export const loginController = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email) throw new Error('The email is missing');
    if (!password) throw new Error('The password is missing');

    const loginResult = await loginService(email, password);
    if (!loginResult) throw new Error('Login failed');

    const { accessToken, refreshToken, name } = loginResult;
    res.cookie('refreshToken', refreshToken, refreshCookie);

    logger.info('auth.login.success', { event: 'auth.login.success', email });
    res.status(202).json({ message: 'User logged successfully', name, accessToken });
  } catch (e) {
    logger.warn('auth.login.failed', { event: 'auth.login.failed', email: req.body?.email, reason: (e as Error)?.message });
    return res
      .status(401)
      .json({ error: e instanceof Error ? e.message : 'Internal server error' });
  }
};

export const logoutController = async (req: Request, res: Response) => {
  try {
    const { maxAge: _maxAge, ...clearOptions } = refreshCookie;
    res.clearCookie('refreshToken', clearOptions);
    res.removeHeader('Authorization');

    logger.info('auth.logout', { event: 'auth.logout' });
    res.status(202).json({ message: 'Cookies was cleared' });
  } catch (e) {
    return res
      .status(500)
      .json({ error: e instanceof Error ? e.message : 'Internal server error' });
  }
};

export const refreshController = async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) throw new Error('Without refresh token');

    const { newAccessToken } = await refreshService(refreshToken);
    if (!newAccessToken) throw new Error('Failed to refresh access token');

    res
      .status(202)
      .json({ message: 'Access token refreshed successfully', accessToken: newAccessToken });
  } catch (e) {
    logger.warn('auth.refresh.failed', { event: 'auth.refresh.failed', reason: (e as Error)?.message });
    return res
      .status(401)
      .json({ error: e instanceof Error ? e.message : 'Internal server error' });
  }
};

export const recoverEmailController = async (req: Request, res: Response) => {
  try {
    const parsed = emailSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstMessage = parsed.error.issues[0]?.message || 'Validation error';
      return res.status(400).json({ error: firstMessage });
    }

    const { email } = parsed.data;

    await recoverEmailService(email);

    logger.info('auth.recover.requested', { event: 'auth.recover.requested', email });
    res.status(202).json({ message: 'Code sent' });
  } catch (e) {
    logger.warn('auth.recover.failed', { event: 'auth.recover.failed', email: req.body?.email, reason: (e as Error)?.message });
    return res
      .status(500)
      .json({ error: e instanceof Error ? e.message : 'Internal server error' });
  }
};

export const recoverCodeController = async (req: Request, res: Response) => {
  try {
    const parsed = codeSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstMessage = parsed.error.issues[0]?.message || 'Validation error';
      return res.status(400).json({ error: firstMessage });
    }

    const { code, email } = parsed.data;

    if (!codes[email]) throw new Error('No code generated for this email');
    if (codes[email] !== Number(code)) throw new Error('Invalid code');

    const { accessToken, refreshToken, name } = await recoverCodeService(email);
    res.cookie('refreshToken', refreshToken, refreshCookie);

    logger.info('auth.recover.verified', { event: 'auth.recover.verified', email });
    res.status(202).json({ message: 'Valide code', accessToken, name });
  } catch (e) {
    logger.warn('auth.recover.code_invalid', { event: 'auth.recover.code_invalid', email: req.body?.email, reason: (e as Error)?.message });
    return res
      .status(400)
      .json({ error: e instanceof Error ? e.message : 'Internal server error' });
  }
};

export const recoverPasswordController = async (req: Request, res: Response) => {
  try {
    const parsed = passwordSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstMessage = parsed.error.issues[0]?.message || 'Validation error';
      return res.status(400).json({ error: firstMessage });
    }

    const { newPassword } = parsed.data;
    const accessToken = (req.headers.authorization ?? '').replace(/^Bearer /, '');

    const { name } = await recoverPasswordService(accessToken, newPassword);

    logger.info('auth.password.reset', { event: 'auth.password.reset' });
    res.status(202).json({ message: 'Password changed successfuly', name });
  } catch (e) {
    return res
      .status(500)
      .json({ error: e instanceof Error ? e.message : 'Internal server error' });
  }
};

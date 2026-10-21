import nodemailer from 'nodemailer';
import { MAIL_PASSWORD, MAIL_USER } from './env.js';
import logger from '../common/utils/logger.js';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: MAIL_USER, pass: MAIL_PASSWORD },
});

// Sends an e-mail without ever breaking the caller's flow: a dead SMTP must not fail a checkout.
export async function sendMail(to: string, subject: string, html: string) {
  if (!MAIL_USER || !MAIL_PASSWORD) {
    logger.warn('mail.skipped', { event: 'mail.skipped', email: to, subject, reason: 'SMTP not configured' });
    return;
  }
  try {
    await transporter.sendMail({ from: `E-commerce <${MAIL_USER}>`, to, subject, html });
    logger.info('mail.sent', { event: 'mail.sent', email: to, subject });
  } catch (e) {
    logger.error('mail.failed', { event: 'mail.failed', email: to, subject, reason: (e as Error).message });
  }
}

import { prisma } from '../../libs/prisma.js';
import { sendMail } from '../../config/mail.js';
import { FRONTEND_URL } from '../../config/env.js';
import { HttpError } from '../../common/utils/errors.js';
import logger from '../../common/utils/logger.js';

export type NotificationType =
  | 'ORDER_CREATED'
  | 'ORDER_PAID'
  | 'REVIEW_APPROVED'
  | 'RETURN_APPROVED'
  | 'RETURN_REJECTED'
  | 'RETURN_REFUNDED';

function emailTemplate(name: string, message: string, link: string, linkLabel: string) {
  return `
    <p>Hello ${name},</p>
    <p>${message}</p>
    <p><a href="${FRONTEND_URL}${link}">${linkLabel}</a></p>
    <p>Best regards,<br>E-commerce Team</p>`;
}

// In-app notification + optional e-mail. Never throws to the caller's flow (mail errors are logged in sendMail).
export async function notify(
  userId: string,
  type: NotificationType,
  message: string,
  email?: { subject: string; link: string; linkLabel: string },
) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  if (!user) return;

  await prisma.notification.create({ data: { user_id: userId, type, message, read: false } });
  logger.info('notification.created', { event: 'notification.created', type, channels: email ? ['in_app', 'email'] : ['in_app'] });

  if (email) {
    await sendMail(user.email, email.subject, emailTemplate(user.name, message, email.link, email.linkLabel));
  }
}

export async function listNotificationsService(userId: string) {
  return prisma.notification.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    take: 50,
  });
}

export async function markReadService(userId: string, id: string) {
  const { count } = await prisma.notification.updateMany({ where: { id, user_id: userId }, data: { read: true } });
  if (count === 0) throw new HttpError(404, 'Notification not found', 'NOT_FOUND');
}

export async function markAllReadService(userId: string) {
  await prisma.notification.updateMany({ where: { user_id: userId, read: false }, data: { read: true } });
}

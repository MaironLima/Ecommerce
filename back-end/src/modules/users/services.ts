import type { z } from 'zod';
import { prisma } from '../../libs/prisma.js';
import { HttpError } from '../../common/utils/errors.js';
import type { addressSchema } from './dto.js';

type AddressInput = z.infer<typeof addressSchema>;

// zod gives `undefined` for omitted optionals; Prisma (exactOptionalPropertyTypes) wants them absent or null.
const toAddressData = (a: AddressInput) => ({ ...a, complement: a.complement ?? null, district: a.district ?? null });

export async function getMeService(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, created_at: true },
  });
  if (!user) throw new HttpError(404, 'User not found', 'NOT_FOUND');
  return user;
}

export async function updateMeService(userId: string, name: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { name },
    select: { id: true, name: true, email: true, role: true },
  });
}

export async function listAddressesService(userId: string) {
  return prisma.address.findMany({ where: { user_id: userId }, orderBy: { created_at: 'asc' } });
}

export async function createAddressService(userId: string, data: AddressInput) {
  return prisma.address.create({ data: { ...toAddressData(data), user_id: userId } });
}

async function ownAddress(userId: string, id: string) {
  const address = await prisma.address.findFirst({ where: { id, user_id: userId }, select: { id: true } });
  if (!address) throw new HttpError(404, 'Address not found', 'NOT_FOUND');
}

export async function updateAddressService(userId: string, id: string, data: AddressInput) {
  await ownAddress(userId, id);
  return prisma.address.update({ where: { id }, data: toAddressData(data) });
}

export async function deleteAddressService(userId: string, id: string) {
  await ownAddress(userId, id);
  await prisma.address.delete({ where: { id } });
}

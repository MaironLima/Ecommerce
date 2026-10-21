import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import request from 'supertest';
import { prisma } from '../../src/libs/prisma.js';
import { createApp } from '../../src/appFactory.js';
import { truncateAll } from '../support/test-db.js';

export const app = createApp();
export const api = () => request(app);
export const resetDb = () => truncateAll();

const uid = () => crypto.randomUUID().slice(0, 8);

export async function createUser(role: 'CUSTOMER' | 'ADMIN' | 'SUPERADMIN' = 'CUSTOMER', password = 'Password123!') {
  const user = await prisma.user.create({
    data: { email: `${role.toLowerCase()}-${uid()}@test.com`, name: `Test ${role}`, role, password: await bcrypt.hash(password, 4) },
  });
  const token = jwt.sign({ userId: user.id, role }, process.env.JWT_SECRET as string, { expiresIn: '15m' });
  return { user, token, auth: `Bearer ${token}` };
}

export async function createProduct({ title = `Product ${uid()}`, price = 50, stock = 10, category = 'testing', description = 'A product for tests' } = {}) {
  const cat = await prisma.category.upsert({ where: { name: category }, update: {}, create: { name: category } });
  const product = await prisma.product.create({
    data: {
      title,
      description,
      base_price: price,
      main_image: 'test.webp',
      product_category: { create: { category_id: cat.id } },
      product_variant: { create: { attributes: { size: 'M' }, stock, price_override: price } },
    },
    include: { product_variant: true },
  });
  return { product, variant: product.product_variant[0]! };
}

export async function createPaidOrder(userId: string, variant: { id: string }, title: string, price = 50, quantity = 1, createdAt = new Date()) {
  return prisma.order.create({
    data: {
      user_id: userId,
      status: 'PAID',
      total: price * quantity,
      created_at: createdAt,
      order_item: {
        create: { variant_id: variant.id, quantity, unit_price_snapshot: price, product_title_snapshot: title, variant_attributes_snapshot: { size: 'M' } },
      },
    },
  });
}

export const stockOf = async (variantId: string) => (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock;

export { prisma };

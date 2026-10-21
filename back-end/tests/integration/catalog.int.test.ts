import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { api, createPaidOrder, createProduct, createUser, prisma, resetDb } from './helpers.js';

let admin: Awaited<ReturnType<typeof createUser>>;
let customer: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
  await resetDb();
  admin = await createUser('ADMIN');
  customer = await createUser();
  await createProduct({ title: 'Wireless Headphones', description: 'Noise cancelling over-ear headphones', category: 'electronics', price: 200 });
  await createProduct({ title: 'Cotton Shirt', description: 'Organic cotton t-shirt', category: 'clothing', price: 20 });
});

describe('Integration - catalog', () => {
  it('lists products sorted by price', async () => {
    const res = await api().get('/products').query({ sort: 'ascending price', category: 'all' });
    expect(res.status).toBe(200);
    expect(res.body.results.map((p: any) => p.title)).toEqual(['Cotton Shirt', 'Wireless Headphones']);
  });

  it('filters by category (case-insensitive)', async () => {
    const res = await api().get('/products').query({ category: 'Electronics' });
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].title).toBe('Wireless Headphones');
  });

  it('full-text search uses the DB trigger (search_vector) and tolerates typos', async () => {
    const exact = await api().get('/products/search').query({ q: 'headphones' });
    expect(exact.body[0]).toMatchObject({ title: 'Wireless Headphones' });
    expect(exact.body[0].id).toBeTypeOf('string');

    const typo = await api().get('/products/search').query({ q: 'headphnes' });
    expect(typo.body.map((p: any) => p.title)).toContain('Wireless Headphones');
  });

  it('product detail only exposes approved reviews', async () => {
    const { product, variant } = await createProduct({ title: 'Reviewed Lamp' });
    const buyer2 = await createUser();
    await createPaidOrder(customer.user.id, variant, product.title);
    await createPaidOrder(buyer2.user.id, variant, product.title);
    await prisma.review.create({ data: { product_id: product.id, user_id: customer.user.id, rating: 5, title: 'Approved', moderated: true } });
    await prisma.review.create({ data: { product_id: product.id, user_id: buyer2.user.id, rating: 1, title: 'Pending', moderated: false } });

    const res = await api().get(`/products/${product.id}`);
    expect(res.body.result.review.map((r: any) => r.title)).toEqual(['Approved']);
  });
});

describe('Integration - catalog admin (RBAC + uploads + audit)', () => {
  const image = () => sharp({ create: { width: 10, height: 10, channels: 3, background: '#7c3aed' } }).png().toBuffer();

  it('customer cannot create products (403)', async () => {
    const res = await api().post('/products').set('Authorization', customer.auth).field('title', 'Hack');
    expect(res.status).toBe(403);
  });

  it('admin creates a product with an image converted to WebP, and it is audited', async () => {
    const res = await api()
      .post('/products')
      .set('Authorization', admin.auth)
      .field('title', 'Admin Created Desk')
      .field('description', 'Standing desk')
      .field('basePrice', '300')
      .field('category', 'furniture')
      .field('stock', '4')
      .field('attributes', JSON.stringify({ color: 'oak' }))
      .attach('mainImage', await image(), { filename: 'desk.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    const product = await prisma.product.findUniqueOrThrow({ where: { id: res.body.id }, include: { product_variant: true } });
    expect(product.main_image).toMatch(/\.webp$/);
    expect(product.product_variant[0]).toMatchObject({ stock: 4 });

    const audit = await prisma.auditLog.findFirst({ where: { action: 'PRODUCT_CREATE', entity_id: product.id } });
    expect(audit?.actor_id).toBe(admin.user.id);
  });

  it('rejects product creation without the mandatory image', async () => {
    const res = await api().post('/products').set('Authorization', admin.auth).field('title', 'No image');
    expect(res.status).toBe(400);
  });

  it('refuses to delete a product that has orders (409) but deletes unsold ones', async () => {
    const sold = await createProduct({ title: 'Sold Item' });
    await createPaidOrder(customer.user.id, sold.variant, sold.product.title);
    expect((await api().delete(`/products/${sold.product.id}`).set('Authorization', admin.auth)).status).toBe(409);

    const unsold = await createProduct({ title: 'Unsold Item' });
    expect((await api().delete(`/products/${unsold.product.id}`).set('Authorization', admin.auth)).status).toBe(204);
    expect(await prisma.product.findUnique({ where: { id: unsold.product.id } })).toBeNull();
  });

  it('admin updates variant stock', async () => {
    const { variant } = await createProduct({ title: 'Variant Edit' });
    const res = await api().put(`/variants/${variant.id}`).set('Authorization', admin.auth).send({ stock: '0' });
    expect(res.status).toBe(200);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock).toBe(0);
  });
});

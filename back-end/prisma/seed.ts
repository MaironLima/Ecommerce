// Seeds a demo store: 3 roles, catalog with variants + generated images, orders, reviews, notifications.
// Idempotent: users are upserted; catalog/orders are only created when the catalog is empty.
import bcrypt from 'bcrypt';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { prisma } from '../src/libs/prisma.js';

const PASSWORD = 'Password123!';
const UPLOAD_DIR = path.resolve(process.cwd(), 'imagens', 'uploads');

const USERS = [
  { email: 'superadmin@store.com', name: 'Super Admin', role: 'SUPERADMIN' },
  { email: 'admin@store.com', name: 'Store Admin', role: 'ADMIN' },
  { email: 'customer@store.com', name: 'Jane Customer', role: 'CUSTOMER' },
  { email: 'john@store.com', name: 'John Buyer', role: 'CUSTOMER' },
] as const;

type Seed = { title: string; description: string; price: number; category: string; hue: number; variants: [Record<string, string>, number][] };

const PRODUCTS: Seed[] = [
  { title: 'Aurora Wireless Headphones', description: 'Over-ear wireless headphones with active noise cancelling and 40h battery.', price: 199.9, category: 'electronics', hue: 250, variants: [[{ color: 'black' }, 12], [{ color: 'white' }, 4]] },
  { title: 'Pulse Smartwatch', description: 'Fitness smartwatch with heart rate, GPS and sleep tracking.', price: 149.0, category: 'electronics', hue: 220, variants: [[{ size: '40mm' }, 8], [{ size: '44mm' }, 3]] },
  { title: 'Nimbus Mechanical Keyboard', description: 'Hot-swappable mechanical keyboard with RGB backlight.', price: 89.5, category: 'electronics', hue: 280, variants: [[{ switch: 'red' }, 20], [{ switch: 'brown' }, 0]] },
  { title: 'Classic Cotton T-Shirt', description: 'Soft 100% organic cotton t-shirt, relaxed fit.', price: 24.9, category: 'clothing', hue: 200, variants: [[{ size: 'S', color: 'navy' }, 30], [{ size: 'M', color: 'navy' }, 25], [{ size: 'L', color: 'navy' }, 2]] },
  { title: 'Trail Runner Sneakers', description: 'Lightweight running shoes with grippy outsole for trails.', price: 119.0, category: 'clothing', hue: 160, variants: [[{ size: '40' }, 6], [{ size: '42' }, 9]] },
  { title: 'Ceramic Pour-Over Coffee Set', description: 'Handmade ceramic dripper with two matching cups.', price: 45.0, category: 'home', hue: 30, variants: [[{ color: 'sand' }, 15]] },
  { title: 'Linen Throw Blanket', description: 'Breathable stonewashed linen blanket for all seasons.', price: 69.9, category: 'home', hue: 340, variants: [[{ color: 'sage' }, 7], [{ color: 'clay' }, 5]] },
  { title: 'The Pragmatic Builder', description: 'A practical book about building reliable software, one small step at a time.', price: 34.9, category: 'books', hue: 10, variants: [[{ format: 'paperback' }, 40], [{ format: 'hardcover' }, 1]] },
];

async function makeImage(title: string, hue: number) {
  const name = `seed-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.webp`;
  const file = path.join(UPLOAD_DIR, name);
  if (fs.existsSync(file)) return name;
  const words = title.split(' ');
  const lines = [words.slice(0, 2).join(' '), words.slice(2).join(' ')].filter(Boolean);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},70%,62%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},70%,42%)"/>
    </linearGradient></defs>
    <rect width="800" height="800" fill="url(#g)"/>
    <circle cx="400" cy="320" r="150" fill="white" fill-opacity="0.18"/>
    ${lines.map((l, i) => `<text x="400" y="${560 + i * 70}" font-family="Arial, sans-serif" font-size="56" font-weight="700" fill="white" text-anchor="middle">${l}</text>`).join('')}
  </svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 80 }).toFile(file);
  return name;
}

const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);

async function main() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const hash = await bcrypt.hash(PASSWORD, 12);

  const users: Record<string, string> = {};
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role },
      create: { email: u.email, name: u.name, role: u.role, password: hash },
    });
    users[u.email] = user.id;
  }
  console.log(`users ready (password: ${PASSWORD})`);

  if ((await prisma.product.count()) > 0) {
    console.log('catalog already present, skipping products/orders');
    return;
  }

  const variantsByProduct: { productId: string; title: string; variants: { id: string; attributes: Record<string, string>; price: number }[] }[] = [];

  for (const p of PRODUCTS) {
    const image = await makeImage(p.title, p.hue);
    const category = await prisma.category.upsert({ where: { name: p.category }, update: {}, create: { name: p.category } });
    const product = await prisma.product.create({
      data: {
        title: p.title,
        description: p.description,
        base_price: p.price,
        main_image: image,
        product_category: { create: { category_id: category.id } },
        product_variant: { create: p.variants.map(([attributes, stock]) => ({ attributes, stock, price_override: p.price })) },
      },
      include: { product_variant: true },
    });
    variantsByProduct.push({
      productId: product.id,
      title: product.title,
      variants: product.product_variant.map(v => ({ id: v.id, attributes: v.attributes as Record<string, string>, price: p.price })),
    });
  }
  console.log(`${PRODUCTS.length} products created`);

  // Paid orders spread over the last ~5 months so the dashboard charts have shape.
  const buyers = [users['customer@store.com']!, users['john@store.com']!];
  let created = 0;
  for (let i = 0; i < 24; i++) {
    const product = variantsByProduct[(i * 3) % variantsByProduct.length]!;
    const variant = product.variants[i % product.variants.length]!;
    const qty = 1 + (i % 3);
    const status = i === 22 ? 'PENDING' : i === 23 ? 'CANCELLED' : 'PAID';
    await prisma.order.create({
      data: {
        user_id: buyers[i % 2]!,
        status,
        total: Math.round(variant.price * qty * 100) / 100,
        currency: 'usd',
        created_at: daysAgo((i * 6) % 150),
        order_item: {
          create: {
            variant_id: variant.id,
            quantity: qty,
            unit_price_snapshot: variant.price,
            product_title_snapshot: product.title,
            variant_attributes_snapshot: variant.attributes,
          },
        },
      },
    });
    created++;
  }
  console.log(`${created} orders created`);

  // Reviews only from real buyers (same rule as the API).
  const reviews = [
    { email: 'customer@store.com', product: 0, rating: 5, title: 'Amazing sound', comment: 'Best headphones I have owned.', moderated: true },
    { email: 'john@store.com', product: 3, rating: 4, title: 'Comfy shirt', comment: 'Fits well, washes nicely.', moderated: true },
    { email: 'customer@store.com', product: 6, rating: 5, title: 'So cozy', comment: 'Perfect for the couch.', moderated: true },
    { email: 'john@store.com', product: 1, rating: 3, title: 'Good, not great', comment: 'Battery could last longer.', moderated: false },
  ];
  for (const r of reviews) {
    const userId = users[r.email]!;
    const product = variantsByProduct[r.product]!;
    const bought = await prisma.orderItem.findFirst({
      where: { order_sync: { user_id: userId, status: 'PAID' }, variant_sync: { product_id: product.productId } },
    });
    if (!bought) continue;
    await prisma.review.create({
      data: { product_id: product.productId, user_id: userId, rating: r.rating, title: r.title, comment: r.comment, moderated: r.moderated },
    });
  }

  await prisma.address.create({
    data: { user_id: users['customer@store.com']!, label: 'Home', street: 'Av. Paulista', number: '1000', city: 'São Paulo', state: 'SP', zip_code: '01310-100', country: 'BR' },
  });

  await prisma.notification.create({
    data: { user_id: users['customer@store.com']!, type: 'ORDER_PAID', message: 'Welcome! Your demo orders are ready to be reviewed.', read: false },
  });

  console.log('reviews, address and notifications created');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

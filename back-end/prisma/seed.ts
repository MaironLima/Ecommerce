// Seeds a demo store: 3 roles, catalog with variants + generated images, orders, reviews, notifications, audit trail.
// Idempotent: users are upserted; catalog/orders are only created when the catalog is empty.
import bcrypt from 'bcrypt';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { prisma } from '../src/libs/prisma.js';

const PASSWORD = 'Password123!';
const UPLOAD_DIR = path.resolve(process.cwd(), 'images', 'uploads');

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

  if ((await prisma.product.count()) > 0) console.log('catalog already present, skipping products/orders');
  else await seedCatalog(users);
  await seedAudit(users);
  await seedReturns(users);
}

async function seedCatalog(users: Record<string, string>) {
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

// Admin trail for the /admin/audit screen. Only when the table is empty, so re-running the seed adds nothing.
// Metadata follows the LGPD rules of the real audit() helper: no e-mails, addresses or credentials.
async function seedAudit(users: Record<string, string>) {
  if ((await prisma.auditLog.count()) > 0) return;
  const superadmin = users['superadmin@store.com']!;
  const admin = users['admin@store.com']!;
  const products = await prisma.product.findMany({ take: 4, orderBy: { created_at: 'asc' }, include: { product_variant: { take: 1 } } });
  const review = await prisma.review.findFirst({ where: { moderated: true } });

  const entries: { actor_id: string | null; action: string; entity_type: string; entity_id?: string; metadata?: object; created_at: Date }[] = [
    { actor_id: superadmin, action: 'USER_ROLE_CHANGE', entity_type: 'User', entity_id: admin, metadata: { from: 'CUSTOMER', to: 'ADMIN' }, created_at: daysAgo(30) },
    ...products.map((p, i) => ({ actor_id: admin, action: 'PRODUCT_CREATE', entity_type: 'Product', entity_id: p.id, metadata: { title: p.title }, created_at: daysAgo(28 - i) })),
    ...products.slice(0, 2).map((p, i) => ({ actor_id: admin, action: 'PRODUCT_UPDATE', entity_type: 'Product', entity_id: p.id, metadata: { base_price: Number(p.base_price) }, created_at: daysAgo(14 - i) })),
    ...products.flatMap(p => p.product_variant.slice(0, 1)).slice(0, 2).map((v, i) => ({ actor_id: admin, action: 'VARIANT_UPDATE', entity_type: 'ProductVariant', entity_id: v.id, metadata: { stock: v.stock }, created_at: daysAgo(10 - i) })),
    ...(review ? [{ actor_id: admin, action: 'REVIEW_APPROVE', entity_type: 'Review', entity_id: review.id, created_at: daysAgo(7) }] : []),
    { actor_id: admin, action: 'REVIEW_DELETE', entity_type: 'Review', entity_id: '00000000-0000-4000-8000-000000000001', created_at: daysAgo(5) },
    { actor_id: superadmin, action: 'ACCESS_LOG_VIEW', entity_type: 'Logs', metadata: { from: daysAgo(9).toISOString().slice(0, 10), to: daysAgo(2).toISOString().slice(0, 10) }, created_at: daysAgo(2) },
    { actor_id: admin, action: 'PRODUCT_DELETE', entity_type: 'Product', entity_id: '00000000-0000-4000-8000-000000000002', created_at: daysAgo(1) },
  ];
  await prisma.auditLog.createMany({ data: entries });
  console.log(`${entries.length} audit log entries created`);
}

// Returns in a few states for /admin/returns. The newest customer order is left alone so the request flow can be tried.
async function seedReturns(users: Record<string, string>) {
  if ((await prisma.returnRequest.count()) > 0) return;
  const paid = (email: string) =>
    prisma.order.findMany({ where: { user_id: users[email]!, status: 'PAID' }, orderBy: { created_at: 'desc' }, include: { order_item: true } });
  const [customer, john] = await Promise.all([paid('customer@store.com'), paid('john@store.com')]);

  const make = async (order: (typeof customer)[number] | undefined, status: 'REQUESTED' | 'REFUNDED' | 'REJECTED', reason: 'REGRET' | 'DEFECTIVE' | 'WRONG_ITEM', extra: object = {}) => {
    const item = order?.order_item[0];
    if (!order || !item) return 0;
    await prisma.returnRequest.create({
      data: {
        order_id: order.id,
        user_id: order.user_id,
        status,
        reason,
        refund_amount: item.unit_price_snapshot,
        created_at: new Date(order.created_at.getTime() + 24 * 60 * 60 * 1000),
        resolved_at: status === 'REQUESTED' ? null : new Date(order.created_at.getTime() + 3 * 24 * 60 * 60 * 1000),
        return_item: { create: { order_item_id: item.id, quantity: 1 } },
        ...extra,
      },
    });
    if (status === 'REFUNDED') {
      await prisma.order.update({ where: { id: order.id }, data: { status: item.quantity > 1 ? 'PARTIALLY_REFUNDED' : 'REFUNDED' } });
    }
    return 1;
  };

  const created =
    (await make(john[0], 'REQUESTED', 'DEFECTIVE', { comment: 'Arrived with a torn seam.' })) +
    (await make(customer[1], 'REFUNDED', 'REGRET')) +
    (await make(customer[2], 'REJECTED', 'WRONG_ITEM', { admin_note: 'Item received was the one ordered (photos checked).' }));
  console.log(`${created} return requests created`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

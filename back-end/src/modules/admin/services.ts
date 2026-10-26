import { pool } from '../../config/db.js';
import { prisma } from '../../libs/prisma.js';
import { HttpError } from '../../common/utils/errors.js';
import { maskEmail } from '../../common/utils/privacy.js';
import type { OrderStatus, Permissions } from '../../generated/enums.js';

const LOW_STOCK_THRESHOLD = 5;

// Pure: derived KPIs from raw counts (unit-tested).
export function summarize(raw: { revenue: number; paidOrders: number; totalOrders: number; users: number }) {
  return {
    revenue: round2(raw.revenue),
    paidOrders: raw.paidOrders,
    totalOrders: raw.totalOrders,
    users: raw.users,
    averageOrderValue: raw.paidOrders ? round2(raw.revenue / raw.paidOrders) : 0,
    conversionRate: raw.totalOrders ? round2((raw.paidOrders / raw.totalOrders) * 100) : 0,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function analyticsService() {
  const [totals, users, daily, monthly, topProducts, lowStock, byCategory] = await Promise.all([
    pool.query(`
      -- Partially refunded orders still count as sales; their refunded part is taken out of revenue.
      SELECT COALESCE(SUM(total) FILTER (WHERE status IN ('PAID', 'PARTIALLY_REFUNDED')), 0)
               - (SELECT COALESCE(SUM(r.refund_amount), 0) FROM return_request r JOIN orders ro ON ro.id = r.order_id
                  WHERE r.status = 'REFUNDED' AND ro.status = 'PARTIALLY_REFUNDED') AS revenue,
             COUNT(*) FILTER (WHERE status IN ('PAID', 'PARTIALLY_REFUNDED')) AS paid_orders,
             COUNT(*) AS total_orders
      FROM orders`),
    pool.query(`SELECT COUNT(*) AS users FROM "user"`),
    pool.query(`
      SELECT to_char(d, 'YYYY-MM-DD') AS date,
             COALESCE(SUM(o.total), 0) AS revenue,
             COUNT(o.id) AS orders
      -- created_at is stored in UTC (Prisma), so the calendar is built in UTC too.
      FROM generate_series((now() AT TIME ZONE 'UTC')::date - 29, (now() AT TIME ZONE 'UTC')::date, interval '1 day') d
      LEFT JOIN orders o ON o.status IN ('PAID', 'PARTIALLY_REFUNDED') AND o.created_at::date = d::date
      GROUP BY d ORDER BY d`),
    pool.query(`
      SELECT to_char(m, 'YYYY-MM') AS month,
             COALESCE(SUM(o.total), 0) AS revenue,
             COUNT(o.id) AS orders
      FROM generate_series(date_trunc('month', now() AT TIME ZONE 'UTC') - interval '11 months', date_trunc('month', now() AT TIME ZONE 'UTC'), interval '1 month') m
      LEFT JOIN orders o ON o.status IN ('PAID', 'PARTIALLY_REFUNDED') AND date_trunc('month', o.created_at) = m
      GROUP BY m ORDER BY m`),
    pool.query(`
      SELECT v.product_id, MAX(oi.product_title_snapshot) AS title,
             SUM(oi.quantity) AS units,
             SUM(oi.quantity * oi.unit_price_snapshot) AS revenue
      FROM order_item oi
      JOIN orders o ON o.id = oi.order_id AND o.status IN ('PAID', 'PARTIALLY_REFUNDED')
      JOIN product_variant v ON v.id = oi.variant_id
      GROUP BY v.product_id
      ORDER BY units DESC
      LIMIT 5`),
    pool.query(
      `SELECT v.id, v.product_id, p.title, v.attributes, v.stock
       FROM product_variant v JOIN product p ON p.id = v.product_id
       WHERE v.stock <= $1
       ORDER BY v.stock ASC, p.title
       LIMIT 20`,
      [LOW_STOCK_THRESHOLD],
    ),
    pool.query(`
      SELECT c.name AS category, SUM(oi.quantity * oi.unit_price_snapshot) AS revenue
      FROM order_item oi
      JOIN orders o ON o.id = oi.order_id AND o.status IN ('PAID', 'PARTIALLY_REFUNDED')
      JOIN product_variant v ON v.id = oi.variant_id
      JOIN product_category pc ON pc.product_id = v.product_id
      JOIN category c ON c.id = pc.category_id
      GROUP BY c.name
      ORDER BY revenue DESC`),
  ]);

  const t = totals.rows[0];
  const num = (v: unknown) => Number(v ?? 0);

  return {
    summary: summarize({
      revenue: num(t.revenue),
      paidOrders: num(t.paid_orders),
      totalOrders: num(t.total_orders),
      users: num(users.rows[0].users),
    }),
    salesByDay: daily.rows.map(r => ({ date: r.date, revenue: num(r.revenue), orders: num(r.orders) })),
    salesByMonth: monthly.rows.map(r => ({ month: r.month, revenue: num(r.revenue), orders: num(r.orders) })),
    topProducts: topProducts.rows.map(r => ({
      productId: r.product_id,
      title: r.title,
      units: num(r.units),
      revenue: round2(num(r.revenue)),
    })),
    lowStock: lowStock.rows.map(r => ({
      variantId: r.id,
      productId: r.product_id,
      title: r.title,
      attributes: r.attributes,
      stock: num(r.stock),
    })),
    revenueByCategory: byCategory.rows.map(r => ({ category: r.category, revenue: round2(num(r.revenue)) })),
  };
}

export async function listUsersService() {
  const users = await prisma.user.findMany({
    orderBy: { created_at: 'desc' },
    select: { id: true, name: true, email: true, role: true, created_at: true, _count: { select: { order: true } } },
  });
  return users.map(({ _count, ...u }) => ({ ...u, orders: _count.order }));
}

export async function changeRoleService(actorId: string, userId: string, role: Permissions) {
  if (actorId === userId) throw new HttpError(400, 'You cannot change your own role', 'SELF_ROLE_CHANGE');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user) throw new HttpError(404, 'User not found', 'NOT_FOUND');
  const updated = await prisma.user.update({ where: { id: userId }, data: { role }, select: { id: true, role: true } });
  return { ...updated, previousRole: user.role };
}

const shipTo = (a: unknown) => {
  if (!a || typeof a !== 'object') return null;
  const { city, state } = a as { city?: string; state?: string };
  return { city: city ?? null, state: state ?? null };
};

export async function listOrdersAdminService(status?: OrderStatus) {
  const orders = await prisma.order.findMany({
    where: status ? { status } : {},
    orderBy: { created_at: 'desc' },
    take: 200,
    include: {
      user_sync: { select: { name: true, email: true } },
      order_item: { select: { quantity: true, product_title_snapshot: true, unit_price_snapshot: true } },
    },
  });
  return orders.map(o => ({
    id: o.id,
    status: o.status,
    total: Number(o.total),
    currency: o.currency,
    created_at: o.created_at,
    // LGPD minimization: the list only needs city/state and a masked e-mail, never the full address.
    shipping_address: shipTo(o.shipping_address),
    customer: { name: o.user_sync.name, email: maskEmail(o.user_sync.email) },
    items: o.order_item,
  }));
}

export async function listAuditService() {
  return prisma.auditLog.findMany({
    orderBy: { created_at: 'desc' },
    take: 100,
    // Only what the screen shows: no actor e-mail. Metadata was already redacted when written.
    select: { id: true, action: true, entity_type: true, entity_id: true, metadata: true, created_at: true, actor_sync: { select: { name: true, role: true } } },
  });
}

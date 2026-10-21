import { pool } from '../../config/db.js';
import { prisma } from '../../libs/prisma.js';
import { HttpError } from '../../common/utils/errors.js';
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
      SELECT COALESCE(SUM(total) FILTER (WHERE status = 'PAID'), 0) AS revenue,
             COUNT(*) FILTER (WHERE status = 'PAID') AS paid_orders,
             COUNT(*) AS total_orders
      FROM orders`),
    pool.query(`SELECT COUNT(*) AS users FROM "user"`),
    pool.query(`
      SELECT to_char(d, 'YYYY-MM-DD') AS date,
             COALESCE(SUM(o.total), 0) AS revenue,
             COUNT(o.id) AS orders
      -- created_at is stored in UTC (Prisma), so the calendar is built in UTC too.
      FROM generate_series((now() AT TIME ZONE 'UTC')::date - 29, (now() AT TIME ZONE 'UTC')::date, interval '1 day') d
      LEFT JOIN orders o ON o.status = 'PAID' AND o.created_at::date = d::date
      GROUP BY d ORDER BY d`),
    pool.query(`
      SELECT to_char(m, 'YYYY-MM') AS month,
             COALESCE(SUM(o.total), 0) AS revenue,
             COUNT(o.id) AS orders
      FROM generate_series(date_trunc('month', now() AT TIME ZONE 'UTC') - interval '11 months', date_trunc('month', now() AT TIME ZONE 'UTC'), interval '1 month') m
      LEFT JOIN orders o ON o.status = 'PAID' AND date_trunc('month', o.created_at) = m
      GROUP BY m ORDER BY m`),
    pool.query(`
      SELECT v.product_id, MAX(oi.product_title_snapshot) AS title,
             SUM(oi.quantity) AS units,
             SUM(oi.quantity * oi.unit_price_snapshot) AS revenue
      FROM order_item oi
      JOIN orders o ON o.id = oi.order_id AND o.status = 'PAID'
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
      JOIN orders o ON o.id = oi.order_id AND o.status = 'PAID'
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
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new HttpError(404, 'User not found', 'NOT_FOUND');
  return prisma.user.update({ where: { id: userId }, data: { role }, select: { id: true, role: true } });
}

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
    shipping_address: o.shipping_address,
    customer: o.user_sync,
    items: o.order_item,
  }));
}

export async function listAuditService() {
  return prisma.auditLog.findMany({
    orderBy: { created_at: 'desc' },
    take: 100,
    include: { actor_sync: { select: { name: true, email: true } } },
  });
}

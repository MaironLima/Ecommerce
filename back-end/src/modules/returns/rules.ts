// Pure return/refund rules (no DB), shared by the services and unit tests.

export const RETURN_WINDOW_DAYS = Number(process.env.RETURN_WINDOW_DAYS ?? 7);

// Statuses that still "hold" quantity: a cancelled or rejected request frees its items again.
export const HOLDING_STATUSES = ['REQUESTED', 'APPROVED', 'RECEIVED', 'REFUNDED'] as const;
export const OPEN_STATUSES = ['REQUESTED', 'APPROVED', 'RECEIVED'] as const;

// ponytail: the window starts at order creation (paid within ~30 min of it); switch to delivered_at once shipping exists.
export function returnDeadline(orderCreatedAt: Date, days = RETURN_WINDOW_DAYS) {
  return new Date(orderCreatedAt.getTime() + days * 24 * 60 * 60 * 1000);
}

type Item = { id: string; quantity: number; unit_price_snapshot: number };
type Ret = { status: string; return_item: { order_item_id: string; quantity: number }[] };

// How many units of each order item can still be returned.
export function remainingQuantities(items: Item[], returns: Ret[]) {
  const left = new Map(items.map((i) => [i.id, i.quantity]));
  for (const r of returns) {
    if (!(HOLDING_STATUSES as readonly string[]).includes(r.status)) continue;
    for (const ri of r.return_item) left.set(ri.order_item_id, (left.get(ri.order_item_id) ?? 0) - ri.quantity);
  }
  return left;
}

// Refund in cents, computed from the price snapshots (never from client input).
export function refundCents(items: Item[], requested: { order_item_id: string; quantity: number }[]) {
  const price = new Map(items.map((i) => [i.id, i.unit_price_snapshot]));
  return requested.reduce((sum, r) => sum + Math.round((price.get(r.order_item_id) ?? 0) * 100) * r.quantity, 0);
}

// Order status once some units were refunded.
export function statusAfterRefund(items: Item[], returns: Ret[]) {
  const refunded = returns.filter((r) => r.status === 'REFUNDED');
  const left = remainingQuantities(items, refunded);
  return [...left.values()].every((q) => q <= 0) ? ('REFUNDED' as const) : ('PARTIALLY_REFUNDED' as const);
}

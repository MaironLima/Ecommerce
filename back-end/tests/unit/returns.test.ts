import { describe, it, expect } from 'vitest';
import { refundCents, remainingQuantities, returnDeadline, statusAfterRefund } from '../../src/modules/returns/rules.js';

const items = [
  { id: 'a', quantity: 3, unit_price_snapshot: 19.99 },
  { id: 'b', quantity: 1, unit_price_snapshot: 0.1 },
];
const ret = (status: string, ...lines: [string, number][]) => ({
  status,
  return_item: lines.map(([order_item_id, quantity]) => ({ order_item_id, quantity })),
});

describe('returns rules', () => {
  it('deadline is 7 days after the order', () => {
    expect(returnDeadline(new Date('2026-10-01T10:00:00Z')).toISOString()).toBe('2026-10-08T10:00:00.000Z');
  });

  it('cancelled and rejected requests free their quantity again', () => {
    const left = remainingQuantities(items, [ret('REQUESTED', ['a', 1]), ret('REFUNDED', ['a', 1]), ret('CANCELLED', ['a', 1]), ret('REJECTED', ['b', 1])]);
    expect(left.get('a')).toBe(1);
    expect(left.get('b')).toBe(1);
  });

  it('refund is computed in cents from the price snapshot', () => {
    expect(refundCents(items, [{ order_item_id: 'a', quantity: 3 }, { order_item_id: 'b', quantity: 1 }])).toBe(5997 + 10);
  });

  it('order is REFUNDED only when every unit was refunded', () => {
    expect(statusAfterRefund(items, [ret('REFUNDED', ['a', 3])])).toBe('PARTIALLY_REFUNDED');
    expect(statusAfterRefund(items, [ret('REFUNDED', ['a', 3]), ret('REQUESTED', ['b', 1])])).toBe('PARTIALLY_REFUNDED');
    expect(statusAfterRefund(items, [ret('REFUNDED', ['a', 2]), ret('REFUNDED', ['a', 1], ['b', 1])])).toBe('REFUNDED');
  });
});

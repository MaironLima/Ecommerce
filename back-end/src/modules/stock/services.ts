import { prisma } from "../../libs/prisma.js";
import { HttpError } from "../../common/utils/errors.js";

export async function releaseExpiredReservations() {
  const now = new Date();

  const expired = await prisma.inventoryReservation.findMany({
    where: { expires_at: { lt: now } },
    select: { id: true, variant_id: true, quantity: true },
  });

  if (expired.length === 0) return { released: 0 };

  return prisma.$transaction(async (tx) => {
    const variantStockDelta = new Map<string, number>();
    for (const r of expired) {
      variantStockDelta.set(
        r.variant_id,
        (variantStockDelta.get(r.variant_id) ?? 0) + r.quantity,
      );
    }

    for (const [variantId, totalQty] of variantStockDelta) {
      await tx.productVariant.update({
        where: { id: variantId },
        data: { stock: { increment: totalQty } },
      });
    }

    const { count } = await tx.inventoryReservation.deleteMany({
      where: { id: { in: expired.map(r => r.id) } },
    });

    return { released: count };
  });
}
type StockTx = Pick<typeof prisma, 'productVariant'>;

// Atomic reservation: the UPDATE only matches while enough stock remains, so concurrent buyers can't oversell
// (a read-then-decrement lets two transactions see the same stock). Postgres locks the row and re-checks the WHERE.
export async function reserveStock(tx: StockTx, variantId: string, quantity: number, message = 'Insufficient stock') {
  const { count } = await tx.productVariant.updateMany({
    where: { id: variantId, stock: { gte: quantity } },
    data: { stock: { decrement: quantity } },
  });
  if (count === 0) throw new HttpError(409, message, 'OUT_OF_STOCK');
}

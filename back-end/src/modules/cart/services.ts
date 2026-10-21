import { prisma } from "../../libs/prisma.js";
import { reserveStock } from "../stock/services.js";

const RESERVATION_TTL_MS = 15 * 60 * 1000;

function reservationExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + RESERVATION_TTL_MS);
}

export async function cartAddService(userId: string, variantId: string, quantity: number = 1) {
  return prisma.$transaction(async (tx) => {
    const cart = await tx.cart.upsert({
      where: { user_id: userId },
      update: {},
      create: { user_id: userId },
    });

    const variant = await tx.productVariant.findUniqueOrThrow({
      where: { id: variantId },
      include: { product_sync: { select: { base_price: true } } },
    });

    const unitPrice = variant.price_override
      ? Number(variant.price_override)
      : Number(variant.product_sync.base_price);

    const existing = await tx.cartItem.findFirst({
      where: { cart_id: cart.id, variant_id: variantId },
      include: { inventory_reservation: true },
    });

    if (existing) {
      await reserveStock(tx, variantId, quantity);

      const updated = await tx.cartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + quantity },
      });

      if (existing.inventory_reservation) {
        await tx.inventoryReservation.update({
          where: { id: existing.inventory_reservation.id },
          data: {
            quantity: existing.inventory_reservation.quantity + quantity,
            expires_at: reservationExpiry(),
          },
        });
      } else {
        await tx.inventoryReservation.create({
          data: {
            variant_id: variantId,
            cart_item_id: updated.id,
            quantity,
            expires_at: reservationExpiry(),
          },
        });
      }

      return updated;
    }

    const created = await tx.cartItem.create({
      data: {
        cart_id: cart.id,
        variant_id: variantId,
        quantity,
        unit_price_snapshot: unitPrice,
      },
    });

    await reserveStock(tx, variantId, quantity);

    await tx.inventoryReservation.create({
      data: {
        variant_id: variantId,
        cart_item_id: created.id,
        quantity,
        expires_at: reservationExpiry(),
      },
    });

    return created;
  });
}

export async function cartGetService(userId: string) {
  return prisma.cart.findFirst({
    where: { user_id: userId },
    include: {
      cart_item: {
        include: {
          variant_sync: {
            include: { product_sync: { select: { id: true, title: true } } },
          },
        },
      },
    },
  });
}

export async function cartPutService(userId: string, itemId: string, quantity: number) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.cartItem.findFirstOrThrow({
      where: { id: itemId, cart_sync: { user_id: userId } },
      include: { inventory_reservation: true, variant_sync: true },
    });

    if (quantity === item.quantity) return item;

    const currentlyHeld = item.inventory_reservation?.quantity ?? 0;
    const delta = quantity - currentlyHeld;

    if (delta > 0) {
      await reserveStock(tx, item.variant_id, delta);
    } else if (delta < 0) {
      await tx.productVariant.update({
        where: { id: item.variant_id },
        data: { stock: { increment: -delta } },
      });
    }

    if (item.inventory_reservation) {
      await tx.inventoryReservation.update({
        where: { id: item.inventory_reservation.id },
        data: { quantity, expires_at: reservationExpiry() },
      });
    } else {
      await tx.inventoryReservation.create({
        data: {
          variant_id: item.variant_id,
          cart_item_id: item.id,
          quantity,
          expires_at: reservationExpiry(),
        },
      });
    }

    return tx.cartItem.update({
      where: { id: item.id },
      data: { quantity },
    });
  });
}

export async function cartDeleteService(userId: string, itemId: string) {
  await prisma.$transaction(async (tx) => {
    const item = await tx.cartItem.findFirstOrThrow({
      where: { id: itemId, cart_sync: { user_id: userId } },
      include: { inventory_reservation: true },
    });

    if (item.inventory_reservation) {
      await tx.productVariant.update({
        where: { id: item.variant_id },
        data: { stock: { increment: item.inventory_reservation.quantity } },
      });

      await tx.inventoryReservation.delete({
        where: { id: item.inventory_reservation.id },
      });
    }

    await tx.cartItem.delete({ where: { id: item.id } });
  });
}
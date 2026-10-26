-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'PARTIALLY_REFUNDED';

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReturnReason" AS ENUM ('REGRET', 'DEFECTIVE', 'WRONG_ITEM', 'NOT_AS_DESCRIBED', 'OTHER');

-- CreateTable
CREATE TABLE "return_request" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" "ReturnReason" NOT NULL,
    "comment" VARCHAR(500),
    "refund_amount" DECIMAL(10,2) NOT NULL,
    "stripe_refund_id" TEXT,
    "admin_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "return_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_item" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "return_item_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "return_item_quantity_positive" CHECK ("quantity" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "return_request_stripe_refund_id_key" ON "return_request"("stripe_refund_id");
CREATE INDEX "return_request_order_id_idx" ON "return_request"("order_id");
CREATE INDEX "return_request_status_created_at_idx" ON "return_request"("status", "created_at");

-- At most one open request per order, enforced by the database.
CREATE UNIQUE INDEX "return_request_one_open_per_order" ON "return_request"("order_id") WHERE "status" IN ('REQUESTED', 'APPROVED', 'RECEIVED');

-- AddForeignKey
ALTER TABLE "return_request" ADD CONSTRAINT "return_request_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_request" ADD CONSTRAINT "return_request_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_item" ADD CONSTRAINT "return_item_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "return_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "return_item" ADD CONSTRAINT "return_item_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

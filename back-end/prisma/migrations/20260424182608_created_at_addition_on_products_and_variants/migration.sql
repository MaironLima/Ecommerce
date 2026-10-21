-- Required by idx_product_title_trgm
CREATE EXTENSION IF NOT EXISTS pg_trgm;

/*
  Warnings:

  - Added the required column `updated_at` to the `product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `product_variant` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "product" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "search_vector" tsvector,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "product_variant" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "idx_product_search" ON "product" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "idx_product_title_trgm" ON "product" USING GIN ("title" gin_trgm_ops);

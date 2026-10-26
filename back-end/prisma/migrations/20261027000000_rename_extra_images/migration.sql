-- Rename only (no data change): Portuguese "imagens" -> English "images".
ALTER TABLE "extra_imagens" RENAME TO "extra_images";
ALTER TABLE "extra_images" RENAME CONSTRAINT "extra_imagens_pkey" TO "extra_images_pkey";
ALTER TABLE "extra_images" RENAME CONSTRAINT "extra_imagens_product_id_fkey" TO "extra_images_product_id_fkey";

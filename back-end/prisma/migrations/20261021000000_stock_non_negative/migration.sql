-- Safety net against overselling: stock can never go below zero, whatever the code path.
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_stock_non_negative" CHECK ("stock" >= 0);

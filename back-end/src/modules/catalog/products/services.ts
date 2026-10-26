import { pool } from '../../../config/db';
import { prisma } from '../../../libs/prisma';
import { HttpError } from '../../../common/utils/errors.js';

export type SortOption = 'most recent' | 'ascending price' | 'descending price';

export async function productsService(
  sort: string = 'most recent',
  limit = 20,
  offset = 0,
  category: string = 'all',
) {
  const formatedSort = sort.toLowerCase().trim();
  const formatedCategory = category.toLowerCase().trim();

  let orderBy: string;

  if (formatedSort === 'ascending price') {
    orderBy = 'p.base_price ASC';
  } else if (formatedSort === 'descending price') {
    orderBy = 'p.base_price DESC';
  } else {
    orderBy = 'p.created_at DESC';
  }

  let sql: string;

  if (formatedCategory === 'all') {
    sql = `
      SELECT
        p.id,
        p.title,
        p.description,
        p.base_price,
        p.main_image,
        p.created_at
      FROM product p
      ORDER BY ${orderBy}
      LIMIT $1 OFFSET $2;
    `;

    const { rows } = await pool.query(sql, [limit, offset]);
    return { rows };
  } else {
    sql = `
      SELECT
        p.id,
        p.title,
        p.description,
        p.base_price,
        p.main_image,
        p.created_at
      FROM product p
      JOIN product_category pc ON pc.product_id = p.id
      JOIN category c ON c.id = pc.category_id
      WHERE LOWER(c.name) = $1
      ORDER BY ${orderBy}
      LIMIT $2 OFFSET $3;
    `;

    const { rows } = await pool.query(sql, [formatedCategory, limit, offset]);
    return { rows };
  }
}

export async function productsSearchService(
  query: string,
  sort: SortOption = 'most recent',
  limit = 20,
  offset = 0,
) {
  let orderBy = '';
  if (sort === 'ascending price') {
    orderBy = ', base_price ASC';
  } else if (sort === 'descending price') {
    orderBy = ', base_price DESC';
  } else {
    orderBy = '';
  }

  const sql = `
    SELECT
      id,
      title,
      description,
      base_price,
      main_image,
      COALESCE(
        ts_rank(search_vector, websearch_to_tsquery('english', $1)), 
        0
      ) AS rank,
      GREATEST(
        similarity(title, $1),
        word_similarity(title, $1),
        similarity(description, $1),
        word_similarity(description, $1)
      ) AS sim
    FROM product
    WHERE 
      search_vector @@ websearch_to_tsquery('english', $1)
      OR word_similarity(title, $1) > 0.3
      OR word_similarity(description, $1) > 0.3
      OR similarity(description, $1) > 0.3
    ORDER BY 
      (search_vector @@ websearch_to_tsquery('english', $1))::int DESC,
      GREATEST(
        similarity(title, $1),
        word_similarity(title, $1),
        similarity(description, $1),
        word_similarity(description, $1)
      ) DESC${orderBy}
    LIMIT $2 OFFSET $3;
  `;

  const { rows } = await pool.query(sql, [query, limit, offset]);

  return rows;
}

export async function productsGetService(id: string) {
  const result = await prisma.product.findUnique({
    where: { id },
    include: {
      extra_images: true,
      product_category: { include: { category_sync: { select: { name: true } } } },
      review: {
        where: {
          moderated: true,
        },
        select: {
          id: true,
          rating: true,
          title: true,
          comment: true,
          created_at: true,

          id_sync: {
            select: {
              name: true
            }
          }
        },
      },
    },
  });

  if (!result) throw new Error("Can't find the product");

  return { result };
}

export async function productsAddService(
  title: string,
  description: string,
  basePrice: string,
  category: string,
  attributes: Record<string, string>,
  stock: string,
  mainImagePath: string,
  extraImagesPaths: string[],
) {
  return prisma.$transaction(async tx => {
    const product = await tx.product.create({
      data: {
        title: title,
        description: description,
        base_price: Number(basePrice),
        main_image: mainImagePath,
        product_variant: {
          create: {
            attributes: attributes,
            stock: Number(stock),
            price_override: Number(basePrice),
          },
        },
      },
    });
    if (!product) throw new Error('It was not possible to create the product');

    let categoryRecord = await tx.category.findFirst({ where: { name: category } });
    if (!categoryRecord) {
      categoryRecord = await tx.category.create({
        data: {
          name: category,
        },
      });
    }
    const categoryRelation = await tx.productCategory.create({
      data: {
        product_id: product.id,
        category_id: categoryRecord.id,
      },
    });
    if (!categoryRelation)
      throw new Error('It was not possible relation the product with the category');

    if (extraImagesPaths && extraImagesPaths.length > 0) {
      const images = await tx.extraImages.createMany({
        data: extraImagesPaths.map(imgPath => ({
          product_id: product.id,
          path: [imgPath],
          width: 800,
          height: 800,
          optimized: true,
        })),
      });
      if (images.count === 0) {
        throw new Error('It was not possible to sync extra images to the product');
      }
    }

    return product;
  });
}

export async function productsAttService(
  id: string,
  title: string | undefined,
  description: string | undefined,
  basePrice: string | undefined,
  category: string | undefined,
  mainImagePath: string | undefined,
  extraImagesPaths: string[] | undefined,
) {
  return prisma.$transaction(async tx => {
    const currentProduct = await tx.product.findUnique({ where: { id } });
    if (!currentProduct) throw new Error('Product not found');

    const updateData: any = {};
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (basePrice) updateData.base_price = Number(basePrice);
    if (mainImagePath) updateData.main_image = mainImagePath;

    const updatedProduct = await tx.product.update({
      where: { id },
      data: updateData,
    });
    if (!updatedProduct) throw new Error('Product not found');

    if (category) {
      let categoryRecord = await tx.category.findFirst({ where: { name: category } });
      if (!categoryRecord) {
        categoryRecord = await tx.category.create({ data: { name: category } });
      }

      await tx.productCategory.deleteMany({ where: { product_id: id } });
      await tx.productCategory.create({
        data: {
          product_id: id,
          category_id: categoryRecord.id,
        },
      });
    }

    if (extraImagesPaths && extraImagesPaths.length > 0) {
      await tx.extraImages.deleteMany({ where: { product_id: id } });
      const images = await tx.extraImages.createMany({
        data: extraImagesPaths.map(imgPath => ({
          product_id: id,
          path: [imgPath],
          width: 800,
          height: 800,
          optimized: true,
        })),
      });
      if (images.count === 0) throw new Error('Could not update the extra images');
    }
  });
}

export async function productsDeleteService(id: string) {
  return prisma.$transaction(async tx => {
    const variants = await tx.productVariant.findMany({ where: { product_id: id } });
    const variantIds = variants.map(v => v.id);

    // Orders keep an FK to the variant (purchase history must survive), so sold products can't be hard-deleted.
    const sold = await tx.orderItem.count({ where: { variant_id: { in: variantIds } } });
    if (sold > 0) {
      throw new HttpError(409, 'This product has orders and cannot be deleted. Set its stock to 0 instead.', 'PRODUCT_HAS_ORDERS');
    }

    if (variantIds.length > 0) {
      await tx.cartItem.deleteMany({ where: { variant_id: { in: variantIds } } });
      await tx.inventoryReservation.deleteMany({ where: { variant_id: { in: variantIds } } });
    }

    await tx.review.deleteMany({ where: { product_id: id } });
    await tx.productVariant.deleteMany({ where: { product_id: id } });
    await tx.productCategory.deleteMany({ where: { product_id: id } });
    await tx.extraImages.deleteMany({ where: { product_id: id } });
    await tx.product.deleteMany({ where: { id } });
  });
}

export async function productsDeleteAllService() {
  try {
    const products = await prisma.product.findMany({ select: { id: true } });

    for (const product of products) {
      try {
        await productsDeleteService(product.id);
      } catch (e) {
        if ((e as HttpError).code !== 'PRODUCT_HAS_ORDERS') throw e; // keep sold products
      }
    }
  } catch (error) {
    throw error;
  }
}

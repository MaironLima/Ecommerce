import { Request, Response } from 'express';
import {
  productsAddService,
  productsAttService,
  productsDeleteAllService,
  productsDeleteService,
  productsGetService,
  productsSearchService,
  productsService,
  SortOption,
} from './services';
import { productSchema, productAttSchema } from './dto';
import { audit } from '../../../common/utils/audit.js';
import { handleError } from '../../../common/utils/errors.js';

const actorOf = (req: Request) => (req as any).user?.userId as string | undefined;

export const productsController = async (req: Request, res: Response) => {
  try {
    const sort = (req.query.sort as SortOption) || 'relevance';
    const pageRaw = Number(req.query.page);
    const category = String(req.query.category ?? 'all') || 'all';
    const page = !pageRaw || isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;

    const { rows } = await productsService(sort, 20, (page - 1) * 20, category);

    res.status(200).json({ results: rows });
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'Error listing products' });
  }
};

export const productsGetController = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) throw new Error('ID not founded');

    const { result } = await productsGetService(id);

    res.status(200).json({ result });
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'Error searching for the item' });
  }
};

export const productsSearchController = async (req: Request, res: Response) => {
  try {
    const query = String(req.query.q || '');
    const sort = (req.query.sort as any) || 'relevance';
    const page = Number(req.query.page || 1);

    const result = await productsSearchService(query, sort, 20, (page - 1) * 20);

    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'Invalid search' });
  }
};

export const productsAddController = async (req: Request, res: Response) => {
  try {
    const parsed = productSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstMessage = parsed.error.issues[0]?.message || 'Validation error';
      return res.status(400).json({ error: firstMessage });
    }

    const { title, description, basePrice, category, stock } = parsed.data;
    if (!title) throw new Error('Without title');
    if (!basePrice) throw new Error('Without base price');
    if (!category) throw new Error('Without category');
    if (!stock) throw new Error('Without stock');

    const attributes = typeof req.body.attributes === 'string' 
      ? JSON.parse(req.body.attributes) 
      : req.body.attributes;
      
    if (!attributes) throw new Error('Without Attributes');

    const mainImageWebp = req.body.mainImageWebp; 
    const extraImagesWebp = req.body.extraImagesWebp || []; 

    if (!mainImageWebp) throw new Error('Without main image');

    const product = await productsAddService(
      title,
      description,
      basePrice,
      category,
      attributes,
      stock,
      mainImageWebp,     
      extraImagesWebp,    
    );

    await audit(actorOf(req), 'PRODUCT_CREATE', 'Product', product.id, { title });
    res.status(201).json({ message: 'Product added successfully', id: product.id });
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'It was not possible to create the product' });
  }
};

export const productAttController = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) throw new Error('ID not provided');

    const parsed = productAttSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstMessage = parsed.error.issues[0]?.message || 'Validation error';
      return res.status(400).json({ error: firstMessage });
    }
    const { title, description, basePrice, category } = parsed.data;

    const mainImageWebp = req.body.mainImageWebp;
    const extraImagesWebp = req.body.extraImagesWebp || [];

    const mainImagePath = mainImageWebp || undefined;
    const extraImagesPaths = extraImagesWebp.length > 0 ? extraImagesWebp : undefined;

    await productsAttService(
      id,
      title,
      description,
      basePrice,
      category,
      mainImagePath,
      extraImagesPaths,
    );

    await audit(actorOf(req), 'PRODUCT_UPDATE', 'Product', id, parsed.data);
    res.status(200).json({ message: 'The product has been updated' });
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'Internal server error' });
  }
};

export const productDeleteController = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) throw new Error('ID not provided');

    await productsDeleteService(id);
    await audit(actorOf(req), 'PRODUCT_DELETE', 'Product', id);

    res.status(204).send();
  } catch (e: any) {
    handleError(res, e);
  }
};

export const productDeleteAllController = async (req: Request, res: Response) => {
  try {

    await productsDeleteAllService();
    await audit(actorOf(req), 'PRODUCT_DELETE_ALL', 'Product');

    res.status(204).send();
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'Cannot delete the product' });
  }
};

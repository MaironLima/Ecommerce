import { Request, Response } from 'express';
import { variantAddSchema, variantAttSchema } from './dto';
import { variantAddService, variantAttService, variantGetService } from './services';
import { audit } from '../../../common/utils/audit.js';

export async function variantGetController(req: Request, res: Response) {
  try {
    const id = req.params.id;
    if (!id) throw new Error('ID not provided');

    const variants = await variantGetService(id);

    res.status(201).json({ variants });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
}

export async function variantAddController(req: Request, res: Response) {
  try {
    const id = req.params.id;
    if (!id) throw new Error('ID not provided');

    const body = Object.fromEntries(Object.entries(req.body));
    const parsed = variantAddSchema.safeParse(body);
    if (!parsed.success) {
      const firstMessage = parsed.error.issues[0]?.message || 'Validation error';
      return res.status(400).json({ error: firstMessage });
    }

    const { stock, priceOverride } = parsed.data;
    if (!stock) throw new Error('Without stock');
    if (!priceOverride) throw new Error('Without price override');

    let attributes = undefined;
    if (body.attributes) {
      attributes = typeof body.attributes === 'string' ? JSON.parse(body.attributes) : body.attributes;
      if (!attributes) throw new Error('Without Attributes');
    }

    await variantAddService(id, attributes, stock, priceOverride);
    await audit((req as any).user?.userId, 'VARIANT_CREATE', 'Product', id, { attributes, stock, priceOverride });

    res.status(201).json({ message: 'The variation has been created' });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
}
export async function variantAttController(req: Request, res: Response) {
  try {
    const variantId = req.params.id;
    if (!variantId) throw new Error('variant ID not provided');
    
    const body = Object.fromEntries(Object.entries(req.body));
    const parsed = variantAttSchema.safeParse(body);
    if (!parsed.success) {
      const firstMessage = parsed.error.issues[0]?.message || 'Validation error';
      return res.status(400).json({ error: firstMessage });
    }

    const { stock, priceOverride } = parsed.data;
    let attributes = undefined;
    if (body.attributes) {
      attributes = typeof body.attributes === 'string' ? JSON.parse(body.attributes) : body.attributes;
    }
    await variantAttService(variantId, attributes, stock, priceOverride);
    await audit((req as any).user?.userId, 'VARIANT_UPDATE', 'ProductVariant', variantId, { attributes, stock, priceOverride });

    res.status(200).json({ message: 'The variation has been updated' });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
}

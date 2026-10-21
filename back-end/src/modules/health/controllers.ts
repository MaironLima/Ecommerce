import { healthService, pingService } from './service.js';
import { Request, Response } from 'express';

export const pingController = (_req: Request, res: Response) => {
  const { ping } = pingService();
  res.json({ ping });
};

export const healthController = async (_req: Request, res: Response) => {
  const health = await healthService();
  res.status(health.database === 'up' ? 200 : 503).json(health);
};

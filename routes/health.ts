import { Request, Response } from 'express';

export async function healthCheck(req: Request, res: Response) {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'BRAVOS BRASIL API',
  });
}

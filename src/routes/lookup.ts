import { Router, type Request, type Response } from 'express';

import { lookupQrLocal } from '../core/localBridge.js';
import { getOrCreateCentralPiece } from '../core/industrialCore.js';

export const lookupRouter = Router();

lookupRouter.get('/:qr', (req: Request, res: Response) => {
  const qr = String(req.params.qr).toLowerCase();
  const result = lookupQrLocal(qr);
  if (!result) {
    res.status(404).json({ error: 'QR não encontrado' });
    return;
  }
  const central = getOrCreateCentralPiece(qr);
  res.json({ ...result, syncStatus: central?.syncStatus ?? 'OUT_OF_SYNC' });
});

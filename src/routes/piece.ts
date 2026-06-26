import { Router, type Request, type Response } from 'express';

import {
  appendCentralLog,
  getOrCreateCentralPiece,
  updateCentralPiece,
} from '../core/industrialCore.js';
import { emitIndustrialEvent } from '../events/eventBus.js';
import {
  broadcastPieceConflict,
  broadcastPieceSynced,
  broadcastPieceUpdate,
} from '../realtime/wsServer.js';

export const pieceRouter = Router();

pieceRouter.get('/:qr', (req: Request, res: Response) => {
  const qr = String(req.params.qr).toLowerCase();
  const piece = getOrCreateCentralPiece(qr);
  if (!piece) {
    res.status(404).json({ error: 'Peça não encontrada' });
    return;
  }
  res.json({ piece });
});

pieceRouter.post('/:qr/update', (req: Request, res: Response) => {
  const qr = String(req.params.qr).toLowerCase();
  try {
    const { piece, diff } = updateCentralPiece(qr, req.body?.piece ?? req.body, req.body?.source ?? 'LOCAL');
    const eventType = piece.syncStatus === 'CONFLICT' ? 'piece.conflict' : 'piece.synced';
    emitIndustrialEvent(eventType, { qr, syncStatus: piece.syncStatus, diff });
    if (piece.syncStatus === 'CONFLICT') {
      broadcastPieceConflict(qr, { piece, diff });
    } else {
      broadcastPieceSynced(qr, { piece, diff });
    }
    broadcastPieceUpdate(qr, { piece, diff });
    res.json({ ok: true, piece, diff });
  } catch (e) {
    res.status(404).json({ error: e instanceof Error ? e.message : 'Erro' });
  }
});

pieceRouter.post('/:qr/log', (req: Request, res: Response) => {
  const qr = String(req.params.qr).toLowerCase();
  const entry = req.body?.log ?? req.body;
  const piece = appendCentralLog(qr, entry);
  if (!piece) {
    res.status(404).json({ error: 'Peça não encontrada' });
    return;
  }
  emitIndustrialEvent('piece.updated', { qr, log: entry });
  broadcastPieceUpdate(qr, { piece, log: entry });
  res.json({ ok: true, piece });
});

import { Router, type Request, type Response } from 'express';

import { getOrCreateCentralPiece, updateCentralPiece } from '../core/industrialCore.js';
import { emitIndustrialEvent } from '../events/eventBus.js';
import { broadcastSessionEnded, broadcastSessionStarted } from '../realtime/wsServer.js';

export const sessionRouter = Router();

sessionRouter.post('/start', (req: Request, res: Response) => {
  const { qr, user, sessionId } = req.body ?? {};
  if (!qr) {
    res.status(400).json({ error: 'qr obrigatório' });
    return;
  }
  const safeQr = String(qr).toLowerCase();
  const piece = getOrCreateCentralPiece(safeQr);
  if (!piece) {
    res.status(404).json({ error: 'Peça não encontrada' });
    return;
  }
  const sid = sessionId ?? `sess-${Date.now()}`;
  const sessions = [
    ...(piece.sessions as unknown[]),
    {
      sessionId: sid,
      user: user ?? 'operador-local',
      startedAt: new Date().toISOString(),
      endedAt: null,
      piecesWorked: [piece.pieceName],
    },
  ];
  const { piece: updated } = updateCentralPiece(safeQr, { ...piece, sessions }, 'CENTRAL');
  emitIndustrialEvent('session.started', { qr: safeQr, sessionId: sid, user });
  emitIndustrialEvent('operator.sessionStarted', { qr: safeQr, sessionId: sid, user });
  broadcastSessionStarted(safeQr, { piece: updated, sessionId: sid });
  res.json({ ok: true, piece: updated });
});

sessionRouter.post('/end', (req: Request, res: Response) => {
  const { qr, sessionId } = req.body ?? {};
  if (!qr) {
    res.status(400).json({ error: 'qr obrigatório' });
    return;
  }
  const safeQr = String(qr).toLowerCase();
  const piece = getOrCreateCentralPiece(safeQr);
  if (!piece) {
    res.status(404).json({ error: 'Peça não encontrada' });
    return;
  }
  const now = new Date().toISOString();
  const sessions = (piece.sessions as Array<{ sessionId: string; endedAt: string | null }>).map((s) =>
    s.sessionId === sessionId || (!sessionId && s.endedAt === null) ? { ...s, endedAt: now } : s
  );
  const { piece: updated } = updateCentralPiece(safeQr, { ...piece, sessions }, 'CENTRAL');
  emitIndustrialEvent('session.ended', { qr: safeQr, sessionId });
  emitIndustrialEvent('operator.sessionEnded', { qr: safeQr, sessionId });
  broadcastSessionEnded(safeQr, { piece: updated, sessionId });
  res.json({ ok: true, piece: updated });
});

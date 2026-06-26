import { Router, type Request, type Response } from 'express';

import {
  assignPieceToWorkstation,
  heartbeatWorkstation,
  listWorkstations,
  releaseWorkstationPiece,
} from '../core/workstations.js';

export const workstationRouter = Router();

workstationRouter.get('/', (_req: Request, res: Response) => {
  res.json({ workstations: listWorkstations() });
});

workstationRouter.post('/heartbeat', (req: Request, res: Response) => {
  const id = String(req.body?.id ?? req.body?.workstationId ?? '');
  if (!id) {
    res.status(400).json({ error: 'id obrigatório' });
    return;
  }
  const ws = heartbeatWorkstation(id);
  if (!ws) {
    res.status(404).json({ error: 'Estação não encontrada' });
    return;
  }
  res.json({ ok: true, workstation: ws });
});

workstationRouter.post('/assign', (req: Request, res: Response) => {
  const id = String(req.body?.id ?? req.body?.workstationId ?? '');
  const qr = req.body?.qr != null ? String(req.body.qr).toLowerCase() : null;
  if (!id) {
    res.status(400).json({ error: 'id obrigatório' });
    return;
  }
  const ws = assignPieceToWorkstation(id, qr);
  if (!ws) {
    res.status(404).json({ error: 'Estação não encontrada' });
    return;
  }
  res.json({ ok: true, workstation: ws });
});

workstationRouter.post('/release', (req: Request, res: Response) => {
  const id = String(req.body?.id ?? req.body?.workstationId ?? '');
  if (!id) {
    res.status(400).json({ error: 'id obrigatório' });
    return;
  }
  const ws = releaseWorkstationPiece(id);
  if (!ws) {
    res.status(404).json({ error: 'Estação não encontrada' });
    return;
  }
  res.json({ ok: true, workstation: ws });
});

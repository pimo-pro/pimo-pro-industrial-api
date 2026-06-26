import { Router, type Request, type Response } from 'express';

import {
  cncJobFinished,
  cncJobStarted,
  drillJobFinished,
  drillJobStarted,
  orlarJobFinished,
  orlarJobStarted,
} from '../hardware/machineBridge.js';
import { processQrScan } from '../hardware/qrBridge.js';

export const hardwareRouter = Router();

hardwareRouter.post('/qr/scan', (req: Request, res: Response) => {
  const result = processQrScan({
    qr: String(req.body?.qr ?? ''),
    workstationId: req.body?.workstationId ? String(req.body.workstationId) : undefined,
    source: req.body?.source ?? 'tcp',
  });
  if (!result.ok) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
});

hardwareRouter.post('/machine/cnc/start', (req: Request, res: Response) => {
  const qr = String(req.body?.qr ?? '');
  if (!qr) {
    res.status(400).json({ error: 'qr obrigatório' });
    return;
  }
  cncJobStarted(qr, req.body?.workstationId);
  res.json({ ok: true, event: 'machine.jobStarted', operation: 'CNC', qr });
});

hardwareRouter.post('/machine/cnc/finish', (req: Request, res: Response) => {
  const qr = String(req.body?.qr ?? '');
  if (!qr) {
    res.status(400).json({ error: 'qr obrigatório' });
    return;
  }
  cncJobFinished(qr, req.body?.workstationId);
  res.json({ ok: true, event: 'machine.jobFinished', operation: 'CNC', qr });
});

hardwareRouter.post('/machine/orlar/start', (req: Request, res: Response) => {
  const qr = String(req.body?.qr ?? '');
  if (!qr) {
    res.status(400).json({ error: 'qr obrigatório' });
    return;
  }
  orlarJobStarted(qr, req.body?.workstationId);
  res.json({ ok: true, event: 'machine.jobStarted', operation: 'ORLAR', qr });
});

hardwareRouter.post('/machine/orlar/finish', (req: Request, res: Response) => {
  const qr = String(req.body?.qr ?? '');
  if (!qr) {
    res.status(400).json({ error: 'qr obrigatório' });
    return;
  }
  orlarJobFinished(qr, req.body?.workstationId);
  res.json({ ok: true, event: 'machine.jobFinished', operation: 'ORLAR', qr });
});

hardwareRouter.post('/machine/drill/start', (req: Request, res: Response) => {
  const qr = String(req.body?.qr ?? '');
  if (!qr) {
    res.status(400).json({ error: 'qr obrigatório' });
    return;
  }
  drillJobStarted(qr, req.body?.workstationId);
  res.json({ ok: true, event: 'machine.jobStarted', operation: 'DRILL', qr });
});

hardwareRouter.post('/machine/drill/finish', (req: Request, res: Response) => {
  const qr = String(req.body?.qr ?? '');
  if (!qr) {
    res.status(400).json({ error: 'qr obrigatório' });
    return;
  }
  drillJobFinished(qr, req.body?.workstationId);
  res.json({ ok: true, event: 'machine.jobFinished', operation: 'DRILL', qr });
});

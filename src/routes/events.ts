import { Router, type Request, type Response } from 'express';

import { getRecentEvents, replayEvents } from '../events/eventBus.js';

export const eventsRouter = Router();

eventsRouter.get('/', (req: Request, res: Response) => {
  const since = req.query.since ? String(req.query.since) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  const events = since ? replayEvents(since) : getRecentEvents(limit);
  res.json({ events: events.slice(-limit) });
});

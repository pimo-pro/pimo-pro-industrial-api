import { Router, type Request, type Response } from 'express';

import { getProjectCentral, listAllCentralPieces, listFactories } from '../core/industrialCore.js';

export const projectRouter = Router();

projectRouter.get('/:user/:project', (req: Request, res: Response) => {
  const user = decodeURIComponent(String(req.params.user));
  const project = decodeURIComponent(String(req.params.project));
  const central = getProjectCentral(user, project);
  const pieces = listAllCentralPieces().filter(
    (p) =>
      p.route.user.toUpperCase() === user.toUpperCase() &&
      p.route.project.toUpperCase() === project.toUpperCase()
  );
  const factories = listFactories();
  const syncSummary = {
    inSync: pieces.filter((p) => p.syncStatus === 'IN_SYNC').length,
    outOfSync: pieces.filter((p) => p.syncStatus === 'OUT_OF_SYNC').length,
    conflict: pieces.filter((p) => p.syncStatus === 'CONFLICT').length,
  };
  res.json({ project: central, pieces, factories, syncSummary });
});

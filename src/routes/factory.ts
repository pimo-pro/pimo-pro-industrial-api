import { Router, type Request, type Response } from 'express';

import { listAllCentralPieces, listFactories } from '../core/industrialCore.js';
import { listWorkstations } from '../core/workstations.js';
import { getRecentEvents } from '../events/eventBus.js';
import { getConnectedClientCount } from '../realtime/wsServer.js';

export const factoryRouter = Router();

factoryRouter.get('/floor', (_req: Request, res: Response) => {
  const pieces = listAllCentralPieces();
  const workstations = listWorkstations();
  const factories = listFactories();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const completedToday = pieces.filter(
    (p) => p.pieceStatus === 'DONE' && p.lastUpdatedAt && p.lastUpdatedAt >= todayStart
  );

  const activeAlerts = pieces.flatMap((p) =>
    ((p.alerts as unknown[]) ?? []).map((a) => ({
      ...(a as Record<string, unknown>),
      qr: p.qr,
      pieceName: p.pieceName,
    }))
  );

  const activeAnomalies = pieces.flatMap((p) =>
    ((p.anomalies as unknown[]) ?? []).map((a) => ({
      ...(a as Record<string, unknown>),
      qr: p.qr,
      pieceName: p.pieceName,
    }))
  );

  const operatorMap = new Map<string, { pieces: number; ops: number; minutes: number }>();
  for (const p of pieces) {
    for (const session of (p.sessions as Array<{ user?: string; activeMinutes?: number; operationsCompleted?: number; piecesWorked?: string[] }>) ?? []) {
      const user = session.user ?? 'unknown';
      const entry = operatorMap.get(user) ?? { pieces: 0, ops: 0, minutes: 0 };
      entry.pieces += session.piecesWorked?.length ?? 1;
      entry.ops += session.operationsCompleted ?? 0;
      entry.minutes += session.activeMinutes ?? 0;
      operatorMap.set(user, entry);
    }
  }

  const opDurations = new Map<string, number[]>();
  for (const p of pieces) {
    for (const log of (p.logs as Array<{ operation?: string; action?: string }>) ?? []) {
      if (log.action !== 'DONE' || !log.operation) continue;
      const arr = opDurations.get(log.operation) ?? [];
      arr.push(1);
      opDurations.set(log.operation, arr);
    }
  }

  const avgOpMinutes = [...opDurations.entries()].map(([operation, times]) => ({
    operation,
    avgMinutes: times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0,
    count: times.length,
  }));

  const atRisk = pieces.filter((p) => {
    const progress = p.progressPercent ?? 0;
    const hasHighAnomaly = ((p.anomalies as Array<{ severity?: string }>) ?? []).some((a) => a.severity === 'HIGH');
    return progress < 50 && p.pieceStatus === 'IN_PROGRESS' || hasHighAnomaly;
  });

  const syncSummary = {
    inSync: pieces.filter((p) => p.syncStatus === 'IN_SYNC').length,
    outOfSync: pieces.filter((p) => p.syncStatus === 'OUT_OF_SYNC').length,
    conflict: pieces.filter((p) => p.syncStatus === 'CONFLICT').length,
  };

  const piecesInProcess = workstations
    .filter((w) => w.currentPiece)
    .map((w) => ({ workstationId: w.id, type: w.type, qr: w.currentPiece }));

  res.json({
    workstations,
    piecesInProcess,
    completedToday: completedToday.map((p) => ({
      qr: p.qr,
      pieceName: p.pieceName,
      progressPercent: p.progressPercent,
      lastUpdatedAt: p.lastUpdatedAt,
    })),
    activeAlerts,
    activeAnomalies,
    operatorProductivity: [...operatorMap.entries()].map(([operator, stats]) => ({
      operator,
      ...stats,
    })),
    avgOpMinutes,
    atRiskPieces: atRisk.map((p) => ({
      qr: p.qr,
      pieceName: p.pieceName,
      progressPercent: p.progressPercent,
      pieceStatus: p.pieceStatus,
    })),
    syncSummary,
    factories,
    wsClients: getConnectedClientCount(),
    recentEvents: getRecentEvents(50),
  });
});

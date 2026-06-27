import { getActiveAlerts } from './alerts';
import { DEFAULT_OPERATIONS } from './operations';
import { countWorkOrders } from './pieceState';
import type {
  EmployeeStats,
  FactorySummary,
  IndustrialAlert,
  IndustrialAnomaly,
  IndustrialBoxSummary,
  OperationStats,
  PieceFlagItem,
  PieceJson,
  PieceRiskItem,
  PieceSyncItem,
  ProjectDashboard,
  SyncSummary,
  TrackingStatus,
} from '../types/piece';

type BoxInput = {
  boxSlug: string;
  boxId: string;
  boxName: string;
  pieceCount: number;
  pieceJsons: PieceJson[];
};

const RISK_CODES = new Set(['STALE_IN_PROGRESS', 'LONG_SESSION', 'MISSING_DIMENSIONS']);
const INCONSISTENCY_CODES = new Set([
  'MISSING_MATERIAL',
  'MISSING_DRILL_DATA',
  'INCOMPLETE_ORLA',
  'SYNC_PROGRESS_MISMATCH',
]);

export function buildProjectDashboard(
  meta: {
    user: string;
    project: string;
    projectId: string;
    projectDisplayName: string;
  },
  boxes: BoxInput[]
): ProjectDashboard {
  const allPieces = boxes.flatMap((b) => b.pieceJsons);
  const pieceBoxMap = new Map<string, string>();
  for (const box of boxes) {
    for (const p of box.pieceJsons) {
      pieceBoxMap.set(p.pieceName, box.boxSlug);
    }
  }

  const totalPieces = allPieces.length;
  const statusCount = (status: TrackingStatus) =>
    allPieces.filter((p) => p.pieceStatus === status).length;

  const completedPieces = statusCount('DONE');
  const pendingPieces = statusCount('PENDING');
  const inProgressPieces = statusCount('IN_PROGRESS');

  const progressPercent =
    totalPieces > 0
      ? Math.round(allPieces.reduce((sum, p) => sum + p.progressPercent, 0) / totalPieces)
      : 0;

  let totalWorkOrders = 0;
  let completedWorkOrders = 0;
  for (const p of allPieces) {
    const c = countWorkOrders(p.workOrders);
    totalWorkOrders += c.total;
    completedWorkOrders += c.completed;
  }

  const employeeMap = new Map<
    string,
    { pieces: Set<string>; minutes: number; ops: number }
  >();

  const opMinutesMap = new Map<string, number[]>();

  for (const p of allPieces) {
    for (const log of p.logs) {
      if (log.action !== 'DONE') continue;
      const arr = opMinutesMap.get(log.operation) ?? [];
      arr.push(1);
      opMinutesMap.set(log.operation, arr);
    }
    for (const session of p.sessions) {
      const entry = employeeMap.get(session.user) ?? {
        pieces: new Set<string>(),
        minutes: 0,
        ops: 0,
      };
      for (const pn of session.piecesWorked) entry.pieces.add(pn);
      entry.minutes += session.activeMinutes ?? 0;
      entry.ops += session.operationsCompleted ?? p.logs.filter((l) => l.action === 'DONE').length;
      employeeMap.set(session.user, entry);
    }
  }

  const operationStats: OperationStats[] = DEFAULT_OPERATIONS.map((op) => {
    const mins = opMinutesMap.get(op.name) ?? [];
    return {
      operation: op.name,
      completedPieces: allPieces.filter((p) =>
        p.workOrders.find((w) => w.operation === op.name && w.status === 'DONE')
      ).length,
      totalPieces,
      avgMinutes: mins.length > 0 ? Math.round(mins.length / allPieces.length) || 1 : undefined,
    };
  });

  const employeeStats: EmployeeStats[] = Array.from(employeeMap.entries()).map(
    ([user, data]) => ({
      user,
      piecesWorked: data.pieces.size,
      totalMinutes: Math.round(data.minutes),
      productivityPerHour:
        data.minutes > 0 ? Math.round((data.pieces.size / data.minutes) * 60 * 10) / 10 : 0,
      avgMinutesPerOperation: data.ops > 0 ? Math.round(data.minutes / data.ops) : undefined,
    })
  );

  const boxSummaries: IndustrialBoxSummary[] = boxes.map((box) => {
    const completed = box.pieceJsons.filter((p) => p.pieceStatus === 'DONE').length;
    const pending = box.pieceJsons.filter((p) => p.pieceStatus === 'PENDING').length;
    const inProgress = box.pieceJsons.filter((p) => p.pieceStatus === 'IN_PROGRESS').length;
    const percent =
      box.pieceJsons.length > 0
        ? Math.round(
            box.pieceJsons.reduce((s, p) => s + p.progressPercent, 0) / box.pieceJsons.length
          )
        : 0;

    return {
      boxSlug: box.boxSlug,
      boxId: box.boxId,
      boxName: box.boxName,
      pieceCount: box.pieceCount,
      completedPieces: completed,
      pendingPieces: pending,
      inProgressPieces: inProgress,
      progressPercent: percent,
    };
  });

  const allAnomalies: IndustrialAnomaly[] = allPieces.flatMap((p) =>
    (p.anomalies ?? []).map((a) => ({ ...a, message: `${p.pieceName}: ${a.message}` }))
  );

  const allAlerts: IndustrialAlert[] = allPieces.flatMap((p) => p.alerts ?? []);
  const activeAlerts = getActiveAlerts(allAlerts).slice(0, 20);

  const atRiskPieces: PieceRiskItem[] = [];
  const inconsistentPieces: PieceFlagItem[] = [];
  const overridePieces: PieceFlagItem[] = [];

  for (const p of allPieces) {
    const boxSlug = pieceBoxMap.get(p.pieceName) ?? 'C1';
    for (const a of p.anomalies ?? []) {
      if (RISK_CODES.has(a.anomalyCode)) {
        atRiskPieces.push({
          pieceName: p.pieceName,
          boxSlug,
          reason: a.message,
          severity: a.severity,
        });
      }
      if (INCONSISTENCY_CODES.has(a.anomalyCode)) {
        inconsistentPieces.push({
          pieceName: p.pieceName,
          boxSlug,
          detail: a.message,
        });
      }
    }
    const overrideCount = p.logs.filter((l) => l.override).length;
    if (overrideCount > 0) {
      overridePieces.push({
        pieceName: p.pieceName,
        boxSlug,
        detail: `${overrideCount} override(s)`,
      });
    }
    if (p.pieceStatus === 'IN_PROGRESS' && (p.intelligence?.estimatedMinutesRemaining ?? 0) > 120) {
      atRiskPieces.push({
        pieceName: p.pieceName,
        boxSlug,
        reason: 'Tempo estimado restante elevado',
        severity: 'MEDIUM',
      });
    }
  }

  let totalWorkMinutes = 0;
  for (const p of allPieces) {
    totalWorkMinutes += p.sessions.reduce((s, x) => s + (x.activeMinutes ?? 0), 0);
  }

  const syncSummary: SyncSummary = {
    inSync: allPieces.filter((p) => p.syncStatus === 'IN_SYNC').length,
    outOfSync: allPieces.filter((p) => !p.syncStatus || p.syncStatus === 'OUT_OF_SYNC').length,
    conflict: allPieces.filter((p) => p.syncStatus === 'CONFLICT').length,
  };

  const outOfSyncPieces: PieceSyncItem[] = [];
  const conflictPieces: PieceSyncItem[] = [];
  for (const box of boxes) {
    for (const p of box.pieceJsons) {
      const item: PieceSyncItem = {
        pieceName: p.pieceName,
        boxSlug: box.boxSlug,
        qr: p.qr,
        syncStatus: p.syncStatus ?? 'OUT_OF_SYNC',
        source: p.source,
        syncedAt: p.syncedAt,
      };
      if (p.syncStatus === 'CONFLICT') conflictPieces.push(item);
      else if (p.syncStatus !== 'IN_SYNC') outOfSyncPieces.push(item);
    }
  }

  const factoryMap = new Map<string, FactorySummary>();
  for (const p of allPieces) {
    const fid = p.factoryId ?? 'F1';
    const cur = factoryMap.get(fid) ?? {
      factoryId: fid,
      nome: fid === 'F1' ? 'Fábrica Principal' : fid,
      localizacao: 'Local',
      sessoesAtivas: 0,
      produtividadeAgregada: 0,
    };
    cur.sessoesAtivas += p.sessions.filter((s) => !s.endedAt).length;
    cur.produtividadeAgregada += p.intelligence?.productivityScore ?? 0;
    factoryMap.set(fid, cur);
  }
  const factories = Array.from(factoryMap.values()).map((f) => ({
    ...f,
    produtividadeAgregada:
      allPieces.filter((p) => (p.factoryId ?? 'F1') === f.factoryId).length > 0
        ? Math.round(
            f.produtividadeAgregada / allPieces.filter((p) => (p.factoryId ?? 'F1') === f.factoryId).length
          )
        : 0,
  }));

  return {
    ...meta,
    totalPieces,
    completedPieces,
    pendingPieces,
    inProgressPieces,
    progressPercent,
    totalWorkOrders,
    completedWorkOrders,
    totalWorkMinutes: Math.round(totalWorkMinutes),
    boxes: boxSummaries,
    operationStats,
    employeeStats,
    activeAlerts,
    anomalies: allAnomalies.slice(0, 30),
    atRiskPieces,
    inconsistentPieces,
    overridePieces,
    syncSummary,
    factories,
    outOfSyncPieces,
    conflictPieces,
  };
}

export function pieceSummaryFromJson(pieceJson: PieceJson) {
  const c = countWorkOrders(pieceJson.workOrders);
  return {
    status: pieceJson.pieceStatus,
    progressPercent: pieceJson.progressPercent,
    operationsDone: c.completed,
    operationsTotal: pieceJson.workOrders.length,
    alertCount: (pieceJson.alerts ?? []).filter((a) => !a.dismissed && a.type !== 'INFO').length,
  };
}

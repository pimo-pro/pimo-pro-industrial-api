import { buildProjectDashboard } from '../../core/dashboardAggregator';
import type { IndustrialAnomaly, PieceJson, ProjectDashboard } from '../../types/piece';

export interface SupervisorStationKpi {
  station: string;
  pendingTasks: number;
  inProgressTasks: number;
  completedTasks: number;
}

export interface SupervisorQualityKpi {
  openRework: number;
  rejectedPieces: number;
  approvedInspections: number;
  blockingInspections: number;
}

export interface SupervisorTimeKpi {
  activeSessions: number;
  totalActiveMinutes: number;
  avgProductivityPerHour: number;
}

export interface SupervisorAlertItem {
  pieceName: string;
  boxSlug: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  message: string;
  timestamp: string;
}

export interface SupervisorDashboardSnapshot {
  project: ProjectDashboard;
  stationKpis: SupervisorStationKpi[];
  qualityKpi: SupervisorQualityKpi;
  timeKpi: SupervisorTimeKpi;
  delayedPieces: Array<{ pieceName: string; boxSlug: string; reason: string }>;
  anomalyPieces: Array<{ pieceName: string; boxSlug: string; anomalies: IndustrialAnomaly[] }>;
  alerts: SupervisorAlertItem[];
}

type BoxInput = {
  boxSlug: string;
  pieceJsons: PieceJson[];
};

function countQuality(pieces: PieceJson[]): SupervisorQualityKpi {
  let openRework = 0;
  let rejectedPieces = 0;
  let approvedInspections = 0;
  let blockingInspections = 0;

  for (const piece of pieces) {
    for (const r of piece.reworkRequests ?? []) {
      if (r.status === 'open' || r.status === 'in_progress') openRework++;
    }
    for (const q of piece.qualityInspections ?? []) {
      if (q.decision === 'approved') approvedInspections++;
      if (q.decision === 'rejected') {
        blockingInspections++;
        rejectedPieces++;
      }
      if (q.decision === 'rework') blockingInspections++;
    }
  }

  return { openRework, rejectedPieces, approvedInspections, blockingInspections };
}

function countTime(pieces: PieceJson[]): SupervisorTimeKpi {
  let activeSessions = 0;
  let totalActiveMinutes = 0;
  let productivitySum = 0;
  let productivityCount = 0;

  for (const piece of pieces) {
    for (const s of piece.sessions) {
      if (s.endedAt === null) activeSessions++;
      totalActiveMinutes += s.activeMinutes ?? 0;
      if (s.productivityPerHour) {
        productivitySum += s.productivityPerHour;
        productivityCount++;
      }
    }
  }

  return {
    activeSessions,
    totalActiveMinutes,
    avgProductivityPerHour:
      productivityCount > 0 ? Math.round((productivitySum / productivityCount) * 10) / 10 : 0,
  };
}

function buildStationKpis(pieces: PieceJson[]): SupervisorStationKpi[] {
  const map = new Map<string, SupervisorStationKpi>();

  for (const piece of pieces) {
    for (const wo of piece.workOrders) {
      const key = wo.operation;
      const row = map.get(key) ?? {
        station: key,
        pendingTasks: 0,
        inProgressTasks: 0,
        completedTasks: 0,
      };
      if (wo.status === 'DONE') row.completedTasks++;
      else if (piece.pieceStatus === 'IN_PROGRESS') row.inProgressTasks++;
      else row.pendingTasks++;
      map.set(key, row);
    }
  }

  return [...map.values()];
}

export function buildSupervisorSnapshot(
  meta: {
    user: string;
    project: string;
    projectId: string;
    projectDisplayName: string;
  },
  boxes: BoxInput[]
): SupervisorDashboardSnapshot {
  const pieceBoxMap = new Map<string, string>();
  for (const box of boxes) {
    for (const p of box.pieceJsons) {
      pieceBoxMap.set(p.pieceName, box.boxSlug);
    }
  }

  const allPieces = boxes.flatMap((b) => b.pieceJsons);
  const project = buildProjectDashboard(
    meta,
    boxes.map((b) => ({
      boxSlug: b.boxSlug,
      boxId: b.boxSlug,
      boxName: b.boxSlug,
      pieceCount: b.pieceJsons.length,
      pieceJsons: b.pieceJsons,
    }))
  );

  const delayedPieces = project.atRiskPieces.map((p: { pieceName: string; boxSlug: string; reason: string }) => ({
    pieceName: p.pieceName,
    boxSlug: p.boxSlug,
    reason: p.reason,
  }));

  const anomalyPieces = allPieces
    .filter((p) => (p.anomalies?.length ?? 0) > 0)
    .map((p) => ({
      pieceName: p.pieceName,
      boxSlug: pieceBoxMap.get(p.pieceName) ?? '',
      anomalies: p.anomalies ?? [],
    }));

  const alerts: SupervisorAlertItem[] = [];
  for (const piece of allPieces) {
    const boxSlug = pieceBoxMap.get(piece.pieceName) ?? '';
    for (const a of piece.alerts ?? []) {
      if (a.dismissed) continue;
      alerts.push({
        pieceName: piece.pieceName,
        boxSlug,
        severity: a.type === 'ERRO' ? 'HIGH' : a.type === 'ALERTA' ? 'MEDIUM' : 'LOW',
        message: a.message,
        timestamp: a.timestamp,
      });
    }
  }

  alerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    project,
    stationKpis: buildStationKpis(allPieces),
    qualityKpi: countQuality(allPieces),
    timeKpi: countTime(allPieces),
    delayedPieces,
    anomalyPieces,
    alerts: alerts.slice(0, 50),
  };
}
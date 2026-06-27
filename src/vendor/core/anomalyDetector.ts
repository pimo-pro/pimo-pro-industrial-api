import type { IndustrialAnomaly, OperationName, PieceJson } from '../types/piece';

const STALE_IN_PROGRESS_MS = 72 * 60 * 60 * 1000;
const LONG_SESSION_MS = 4 * 60 * 60 * 1000;
const OVERRIDE_FREQ_THRESHOLD = 2;

function now(): string {
  return new Date().toISOString();
}

export function detectAnomalies(piece: PieceJson): IndustrialAnomaly[] {
  const anomalies: IndustrialAnomaly[] = [];
  const ts = now();

  const overrideLogs = piece.logs.filter((l) => l.override || l.action === 'OVERRIDE');
  if (overrideLogs.length >= OVERRIDE_FREQ_THRESHOLD) {
    anomalies.push({
      anomalyCode: 'FREQUENT_OVERRIDES',
      severity: overrideLogs.length >= 4 ? 'HIGH' : 'MEDIUM',
      message: `${overrideLogs.length} overrides registados — verificar formação ou regras.`,
      timestamp: ts,
    });
  }

  const overrideByOp = new Map<OperationName, number>();
  for (const log of overrideLogs) {
    overrideByOp.set(log.operation, (overrideByOp.get(log.operation) ?? 0) + 1);
  }
  for (const [op, count] of overrideByOp) {
    if (count >= 2) {
      anomalies.push({
        anomalyCode: 'REPEATED_ORDER_VIOLATION',
        severity: 'MEDIUM',
        message: `Ordem incorrecta repetida em ${op} (${count}x).`,
        timestamp: ts,
        operation: op,
      });
    }
  }

  if (piece.pieceStatus === 'IN_PROGRESS' && piece.lastUpdatedAt) {
    const stale = Date.now() - new Date(piece.lastUpdatedAt).getTime();
    if (stale > STALE_IN_PROGRESS_MS) {
      anomalies.push({
        anomalyCode: 'STALE_IN_PROGRESS',
        severity: 'HIGH',
        message: `Peça em IN_PROGRESS há mais de ${Math.round(stale / 3600000)}h sem actualização.`,
        timestamp: ts,
      });
    }
  }

  const activeSession = piece.sessions.find((s) => s.endedAt === null);
  if (activeSession) {
    const duration = Date.now() - new Date(activeSession.startedAt).getTime();
    if (duration > LONG_SESSION_MS) {
      anomalies.push({
        anomalyCode: 'LONG_SESSION',
        severity: 'MEDIUM',
        message: `Sessão activa há ${Math.round(duration / 3600000)}h.`,
        timestamp: ts,
      });
    }
  }

  if (piece.width <= 0 || piece.height <= 0 || piece.thickness <= 0) {
    anomalies.push({
      anomalyCode: 'MISSING_DIMENSIONS',
      severity: 'HIGH',
      message: 'Medidas industriais em falta ou inválidas.',
      timestamp: ts,
    });
  }

  if (!piece.material || piece.material === '—') {
    anomalies.push({
      anomalyCode: 'MISSING_MATERIAL',
      severity: 'MEDIUM',
      message: 'Material industrial não definido.',
      timestamp: ts,
    });
  }

  const drillWo = piece.workOrders.find((w) => w.operation === 'DRILL');
  if (drillWo?.required && piece.holes.length === 0 && drillWo.status !== 'DONE') {
    anomalies.push({
      anomalyCode: 'MISSING_DRILL_DATA',
      severity: 'LOW',
      message: 'DRILL obrigatório mas sem furos definidos.',
      timestamp: ts,
      operation: 'DRILL',
    });
  }

  if (piece.orla.hasOrla && piece.orla.edges.length === 0) {
    anomalies.push({
      anomalyCode: 'INCOMPLETE_ORLA',
      severity: 'MEDIUM',
      message: 'Orla activa mas sem lados definidos.',
      timestamp: ts,
      operation: 'ORLAR',
    });
  }

  const progressFromWo = piece.workOrders.filter((w) => w.required && w.status === 'DONE').length;
  const expectedProgress = piece.workOrders.filter((w) => w.required).length;
  const computedPct =
    expectedProgress > 0 ? Math.round((progressFromWo / expectedProgress) * 100) : 0;
  if (Math.abs(computedPct - piece.progressPercent) > 5) {
    anomalies.push({
      anomalyCode: 'SYNC_PROGRESS_MISMATCH',
      severity: 'LOW',
      message: `progressPercent (${piece.progressPercent}%) desalinhado do cálculo (${computedPct}%).`,
      timestamp: ts,
    });
  }

  return anomalies;
}

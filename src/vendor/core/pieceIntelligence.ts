import type { PieceJson } from '../types/piece';

const DEFAULT_MIN_PER_OP = 15;

/** Estima tempo restante com base em WO pendentes e histórico de logs. */
export function estimateMinutesRemaining(piece: PieceJson): number {
  const pending = piece.workOrders.filter((w) => w.required && w.status !== 'DONE');
  if (pending.length === 0) return 0;

  const doneLogs = piece.logs.filter((l) => l.action === 'DONE');
  let avgMin = DEFAULT_MIN_PER_OP;
  if (doneLogs.length >= 2) {
    const span =
      new Date(doneLogs[doneLogs.length - 1]!.timestamp).getTime() -
      new Date(doneLogs[0]!.timestamp).getTime();
    avgMin = Math.max(5, Math.round(span / doneLogs.length / 60000));
  }

  return pending.length * avgMin;
}

export function computeProductivityScore(piece: PieceJson): number {
  if (piece.pieceStatus === 'DONE') return 100;
  const required = piece.workOrders.filter((w) => w.required);
  const done = required.filter((w) => w.status === 'DONE').length;
  const overridePenalty = piece.logs.filter((l) => l.override).length * 5;
  const anomalyPenalty = (piece.anomalies?.length ?? 0) * 8;
  const base = required.length > 0 ? Math.round((done / required.length) * 100) : 0;
  return Math.max(0, Math.min(100, base - overridePenalty - anomalyPenalty));
}

export function averageMinutesPerOperation(piece: PieceJson): number {
  const doneLogs = piece.logs.filter((l) => l.action === 'DONE');
  if (doneLogs.length < 2) return DEFAULT_MIN_PER_OP;
  const span =
    new Date(doneLogs[doneLogs.length - 1]!.timestamp).getTime() -
    new Date(doneLogs[0]!.timestamp).getTime();
  return Math.max(1, Math.round(span / doneLogs.length / 60000));
}

export function buildPieceIntelligence(
  piece: PieceJson,
  suggestions: string[]
): PieceJson['intelligence'] {
  return {
    estimatedMinutesRemaining: estimateMinutesRemaining(piece),
    productivityScore: computeProductivityScore(piece),
    averageMinutesPerOperation: averageMinutesPerOperation(piece),
    suggestions,
  };
}

import type { OperationName, PieceJson, TrackingStatus, WorkOrder } from '../types/piece';

export function computeProgressPercent(workOrders: WorkOrder[]): number {
  const required = workOrders.filter((w) => w.required);
  if (required.length === 0) return 0;
  const done = required.filter((w) => w.status === 'DONE').length;
  return Math.round((done / required.length) * 100);
}

export function computePieceStatus(workOrders: WorkOrder[]): TrackingStatus {
  const required = workOrders.filter((w) => w.required);
  if (required.length === 0) return 'PENDING';
  const doneCount = required.filter((w) => w.status === 'DONE').length;
  if (doneCount === 0) return 'PENDING';
  if (doneCount === required.length) return 'DONE';
  return 'IN_PROGRESS';
}

export function syncPieceState(
  piece: PieceJson,
  user: string,
  lastOperation?: OperationName | null
): PieceJson {
  const pieceStatus = computePieceStatus(piece.workOrders);
  const progressPercent = computeProgressPercent(piece.workOrders);
  const now = new Date().toISOString();

  return {
    ...piece,
    pieceStatus,
    progressPercent,
    lastOperation: lastOperation !== undefined ? lastOperation : piece.lastOperation,
    lastUpdatedAt: now,
    lastUpdatedBy: user,
  };
}

export function countWorkOrders(workOrders: WorkOrder[]): { total: number; completed: number } {
  const required = workOrders.filter((w) => w.required);
  return {
    total: required.length,
    completed: required.filter((w) => w.status === 'DONE').length,
  };
}

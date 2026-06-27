import { computePieceStatus } from './pieceState';
import type { OperationName, PieceJson, WorkOrder } from '../types/piece';

function findLastOperation(workOrders: WorkOrder[]): OperationName | null {
  const done = workOrders.filter((w) => w.status === 'DONE' && w.doneAt);
  if (done.length === 0) return null;
  done.sort((a, b) => new Date(b.doneAt!).getTime() - new Date(a.doneAt!).getTime());
  return done[0]!.operation;
}

/** Recalcula pieceStatus, lastOperation e metadados de actualização. */
export function recalculateAutoStatus(
  piece: PieceJson,
  user: string = piece.lastUpdatedBy ?? 'sistema'
): PieceJson {
  const pieceStatus = computePieceStatus(piece.workOrders);
  const lastOperation = findLastOperation(piece.workOrders);
  const now = new Date().toISOString();

  return {
    ...piece,
    pieceStatus,
    lastOperation,
    lastUpdatedAt: now,
    lastUpdatedBy: user,
  };
}

export { computePieceStatus };

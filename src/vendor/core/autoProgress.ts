import { computeProgressPercent } from './pieceState';
import type { PieceJson } from '../types/piece';

/** Calcula e aplica progressPercent com base nas WO concluídas. */
export function recalculateAutoProgress(piece: PieceJson): PieceJson {
  return {
    ...piece,
    progressPercent: computeProgressPercent(piece.workOrders),
  };
}

export { computeProgressPercent };

import { applyIndustrialIntelligence } from '../../core/intelligencePipeline';
import { migratePieceJson } from '../../core/pieceNormalizer';
import { appendLog } from '../../core/trackingLogs';
import { createReworkOnPiece } from '../rework/actions';
import type { PieceJson } from '../../types/piece';

import type { CreateQualityInspectionInput, QualityInspection } from './types';

export function createQualityInspectionRecord(
  pieceId: string,
  input: CreateQualityInspectionInput
): QualityInspection {
  const createdAt = new Date().toISOString();
  return {
    id: `${pieceId}:quality:${createdAt}`,
    pieceId,
    decision: input.decision,
    points: input.points ?? [],
    inspectorId: input.inspectorId,
    reason: input.reason,
    notes: input.notes,
    createdAt,
  };
}

export function isQualityBlocking(inspection: QualityInspection): boolean {
  return inspection.decision === 'rework' || inspection.decision === 'rejected';
}

export function registerQualityInspection(
  piece: PieceJson,
  input: CreateQualityInspectionInput,
  user?: string
): PieceJson {
  const normalized = migratePieceJson(piece);
  const inspection = createQualityInspectionRecord(normalized.pieceName, input);
  const operator = user ?? input.inspectorId ?? 'supervisor';

  let next: PieceJson = {
    ...normalized,
    qualityInspections: [...(normalized.qualityInspections ?? []), inspection],
    logs: appendLog(normalized.logs, {
      operation: normalized.lastOperation ?? 'MONTAGEM',
      action: 'DONE',
      user: operator,
      notes: `QC: ${inspection.decision}${inspection.reason ? ` — ${inspection.reason}` : ''}`,
    }),
  };

  if (inspection.decision === 'rework') {
    next = createReworkOnPiece(next, {
      reason: inspection.reason ?? 'Retrabalho após inspeção de qualidade',
      origin: 'quality',
      requestedBy: operator,
    });
  }

  if (inspection.decision === 'rejected') {
    next = {
      ...next,
      pieceStatus: 'IN_PROGRESS',
      alerts: [
        ...(next.alerts ?? []),
        {
          type: 'ERRO',
          message: inspection.reason ?? 'Peça rejeitada na inspeção de qualidade',
          timestamp: inspection.createdAt,
          pieceName: next.pieceName,
        },
      ],
    };
  }

  return applyIndustrialIntelligence(next, operator);
}

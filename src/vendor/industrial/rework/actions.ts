import { applyIndustrialIntelligence } from '../../core/intelligencePipeline';
import { migratePieceJson } from '../../core/pieceNormalizer';
import { appendLog } from '../../core/trackingLogs';
import type { OperationName, PieceJson } from '../../types/piece';

import type { CreateReworkInput, ReworkRequest, ReworkStatus } from './types';

function createReworkRecord(pieceId: string, input: CreateReworkInput): ReworkRequest {
  const createdAt = new Date().toISOString();
  return {
    id: `${pieceId}:rework:${createdAt}`,
    pieceId,
    reason: input.reason,
    origin: input.origin ?? 'operator',
    fromOperationId: input.fromOperationId,
    toOperationId: input.toOperationId,
    requestedBy: input.requestedBy,
    operatorId: input.operatorId,
    status: 'open',
    createdAt,
  };
}

function reopenWorkOrdersFrom(
  piece: PieceJson,
  fromOperation?: string
): PieceJson['workOrders'] {
  if (!fromOperation) return piece.workOrders;

  const order: OperationName[] = [
    'NISTING',
    'MANUAL',
    'CNC',
    'DRILL',
    'ORLAR',
    'MONTAGEM',
    'EMBALAGEM',
    'LIMPEZAS',
  ];
  const idx = order.indexOf(fromOperation as OperationName);
  if (idx < 0) return piece.workOrders;

  const reopen = new Set(order.slice(idx));
  return piece.workOrders.map((wo: PieceJson['workOrders'][number]) =>
    reopen.has(wo.operation)
      ? { ...wo, status: 'PENDING', doneAt: null, doneBy: null, override: false }
      : wo
  );
}

export function createReworkOnPiece(
  piece: PieceJson,
  input: CreateReworkInput,
  user?: string
): PieceJson {
  const normalized = migratePieceJson(piece);
  const request = createReworkRecord(normalized.pieceName, input);
  const operator = user ?? input.requestedBy ?? 'operador';

  const workOrders = reopenWorkOrdersFrom(normalized, input.toOperationId ?? input.fromOperationId);

  let next: PieceJson = {
    ...normalized,
    workOrders,
    reworkRequests: [...(normalized.reworkRequests ?? []), request],
    pieceStatus: 'IN_PROGRESS',
    logs: appendLog(normalized.logs, {
      operation: (input.toOperationId as OperationName) ?? normalized.lastOperation ?? 'MONTAGEM',
      action: 'START',
      user: operator,
      notes: `Rework: ${input.reason}`,
    }),
    alerts: [
      ...(normalized.alerts ?? []),
      {
        type: 'AVISO',
        message: `Retrabalho aberto: ${input.reason}`,
        timestamp: request.createdAt,
        pieceName: normalized.pieceName,
        operation: (input.toOperationId as OperationName) ?? undefined,
      },
    ],
  };

  return applyIndustrialIntelligence(next, operator);
}

export function updateReworkStatus(
  piece: PieceJson,
  reworkId: string,
  status: ReworkStatus,
  resolvedBy?: string
): PieceJson {
  const normalized = migratePieceJson(piece);
  const now = new Date().toISOString();
  const terminal = status === 'resolved' || status === 'rejected';

  const reworkRequests = (normalized.reworkRequests ?? []).map((r: ReworkRequest) =>
    r.id === reworkId
      ? {
          ...r,
          status,
          resolvedBy: resolvedBy ?? r.resolvedBy,
          updatedAt: now,
          resolvedAt: terminal ? now : r.resolvedAt,
        }
      : r
  );

  return applyIndustrialIntelligence(
    {
      ...normalized,
      reworkRequests,
      logs: terminal
        ? appendLog(normalized.logs, {
            operation: normalized.lastOperation ?? 'MONTAGEM',
            action: 'DONE',
            user: resolvedBy ?? 'supervisor',
            notes: `Rework ${status}: ${reworkId}`,
          })
        : normalized.logs,
    },
    resolvedBy
  );
}

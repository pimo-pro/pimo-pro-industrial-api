import { applyIndustrialIntelligence } from './intelligencePipeline';
import { checkOperationPriority } from './priorityRules';
import { appendLog } from './trackingLogs';
import { recordPieceInActiveSession, DEFAULT_OPERATOR } from './sessions';
import { migratePieceJson } from './pieceNormalizer';
import type { OperationName, PieceJson, WorkOrder } from '../types/piece';

export interface CompleteWorkOrderOptions {
  user?: string;
  override?: boolean;
  notes?: string;
}

export interface CompleteWorkOrderResult {
  piece: PieceJson;
  blocked: boolean;
  message?: string;
  requiresOverride?: boolean;
}

function isDone(wo: WorkOrder): boolean {
  return wo.status === 'DONE';
}

export function getWorkOrder(piece: PieceJson, operation: OperationName): WorkOrder | undefined {
  return piece.workOrders.find((w) => w.operation === operation);
}

export function completeWorkOrder(
  piece: PieceJson,
  operation: OperationName,
  options: CompleteWorkOrderOptions = {}
): CompleteWorkOrderResult {
  const user = options.user ?? DEFAULT_OPERATOR;
  const normalized = migratePieceJson(piece);
  const existing = getWorkOrder(normalized, operation);

  if (!existing) {
    return { piece: normalized, blocked: true, message: 'Operação não encontrada.' };
  }

  if (isDone(existing)) {
    return undoWorkOrder(normalized, operation, options);
  }

  const check = checkOperationPriority(normalized.workOrders, operation);
  if (!check.allowed && !options.override) {
    return {
      piece: normalized,
      blocked: true,
      message: check.message,
      requiresOverride: check.requiresOverride,
    };
  }

  const now = new Date().toISOString();
  const workOrders = normalized.workOrders.map((wo) => {
    if (wo.operation !== operation) return wo;
    return {
      ...wo,
      status: 'DONE' as const,
      doneAt: now,
      doneBy: user,
      override: options.override ?? false,
      notes: options.notes ?? wo.notes,
    };
  });

  let next: PieceJson = {
    ...normalized,
    workOrders,
    logs: appendLog(normalized.logs, {
      operation,
      action: options.override ? 'OVERRIDE' : 'DONE',
      user,
      override: options.override ?? false,
      notes: options.notes ?? (options.override ? `Override: ${operation}` : ''),
      timestamp: now,
    }),
  };

  next = recordPieceInActiveSession(next);
  next = applyIndustrialIntelligence(next, user);

  return { piece: next, blocked: false };
}

export function undoWorkOrder(
  piece: PieceJson,
  operation: OperationName,
  options: CompleteWorkOrderOptions = {}
): CompleteWorkOrderResult {
  const user = options.user ?? DEFAULT_OPERATOR;
  const normalized = migratePieceJson(piece);
  const now = new Date().toISOString();

  const workOrders = normalized.workOrders.map((wo) => {
    if (wo.operation !== operation) return wo;
    return {
      ...wo,
      status: 'PENDING' as const,
      doneAt: null,
      doneBy: null,
      override: false,
    };
  });

  let next: PieceJson = {
    ...normalized,
    workOrders,
    logs: appendLog(normalized.logs, {
      operation,
      action: 'UNDO',
      user,
      timestamp: now,
    }),
  };

  next = applyIndustrialIntelligence(next, user);
  return { piece: next, blocked: false };
}

export function applyPieceUpdate(piece: PieceJson, user?: string): PieceJson {
  return applyIndustrialIntelligence(migratePieceJson(piece), user);
}

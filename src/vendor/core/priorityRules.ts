import type { OperationName, WorkOrder } from '../types/piece';

export interface PriorityCheckResult {
  allowed: boolean;
  message?: string;
  requiresOverride?: boolean;
  blockingOperations?: OperationName[];
}

/**
 * Cadeia fixa Fase 2:
 * ORLAR → DRILL → CNC → MONTAGEM → EMBALAGEM
 */
const PREREQUISITE_CHAINS: Partial<Record<OperationName, OperationName[]>> = {
  DRILL: ['ORLAR'],
  CNC: ['ORLAR', 'DRILL'],
  MONTAGEM: ['ORLAR', 'DRILL', 'CNC'],
  EMBALAGEM: ['ORLAR', 'DRILL', 'CNC', 'MONTAGEM'],
};

function isWoDone(workOrders: WorkOrder[], operation: OperationName): boolean {
  const wo = workOrders.find((w) => w.operation === operation);
  if (!wo) return true;
  if (!wo.required) return true;
  return wo.status === 'DONE';
}

export function getPrerequisites(target: OperationName): OperationName[] {
  return PREREQUISITE_CHAINS[target] ?? [];
}

export function checkOperationPriority(
  workOrders: WorkOrder[],
  target: OperationName
): PriorityCheckResult {
  const prerequisites = getPrerequisites(target);
  const blocking = prerequisites.filter((op) => !isWoDone(workOrders, op));

  if (blocking.length === 0) {
    return { allowed: true };
  }

  const labels = blocking.join(', ');
  return {
    allowed: false,
    requiresOverride: true,
    blockingOperations: blocking,
    message: `Deve concluir ${labels} antes de ${target}.`,
  };
}

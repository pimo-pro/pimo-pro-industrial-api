import type { OperationName } from '../types/piece';

export const DEFAULT_OPERATIONS: Array<{ name: OperationName; required: boolean }> = [
  { name: 'NISTING', required: true },
  { name: 'MANUAL', required: false },
  { name: 'CNC', required: true },
  { name: 'DRILL', required: true },
  { name: 'ORLAR', required: true },
  { name: 'MONTAGEM', required: true },
  { name: 'EMBALAGEM', required: true },
  { name: 'LIMPEZAS', required: false },
];

export const WO_PREFIX = 'WO-';

export function workOrderLabel(operation: OperationName): string {
  return `${WO_PREFIX}${operation}`;
}

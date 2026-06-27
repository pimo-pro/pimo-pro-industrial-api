import { getPrerequisites } from './priorityRules';
import type { OperationName, PieceJson } from '../types/piece';
import { DEFAULT_OPERATOR } from './sessions';

export interface AutoResolveSuggestion {
  operation: OperationName;
  action: 'AUTO_COMPLETE' | 'SUGGEST';
  reason: string;
}

const AUTO_SYSTEM = 'auto-resolver';

/** Marca WO como concluída automaticamente (operações triviais). */
function autoCompleteWo(
  piece: PieceJson,
  operation: OperationName,
  reason: string
): PieceJson {
  const now = new Date().toISOString();
  const workOrders = piece.workOrders.map((wo) => {
    if (wo.operation !== operation || wo.status === 'DONE') return wo;
    return {
      ...wo,
      status: 'DONE' as const,
      doneAt: now,
      doneBy: AUTO_SYSTEM,
      notes: reason,
    };
  });
  return { ...piece, workOrders };
}

/** Aplica resoluções automáticas e devolve sugestões para UI. */
export function applyAutoResolver(piece: PieceJson): { piece: PieceJson; suggestions: string[] } {
  let next = piece;
  const suggestions: string[] = [];

  if (!next.orla.hasOrla) {
    const orlar = next.workOrders.find((w) => w.operation === 'ORLAR');
    if (orlar && orlar.status !== 'DONE') {
      next = autoCompleteWo(next, 'ORLAR', 'auto: peça sem orla');
      suggestions.push('ORLAR marcada automaticamente — peça sem orla.');
    }
  }

  const manual = next.workOrders.find((w) => w.operation === 'MANUAL');
  if (manual && !manual.required && manual.status !== 'DONE') {
    next = autoCompleteWo(next, 'MANUAL', 'auto: operação manual opcional');
    suggestions.push('MANUAL concluída automaticamente — operação opcional.');
  }

  if (!next.holes.length) {
    const drill = next.workOrders.find((w) => w.operation === 'DRILL');
    if (drill && drill.status !== 'DONE' && drill.required) {
      suggestions.push('Peça sem furos — pode concluir DRILL quando aplicável.');
    }
  }

  for (const wo of next.workOrders) {
    if (wo.status === 'DONE') continue;
    const prereqs = getPrerequisites(wo.operation);
    const pending = prereqs.filter(
      (op) => next.workOrders.find((w) => w.operation === op)?.status !== 'DONE'
    );
    if (pending.length > 0) {
      suggestions.push(`Antes de ${wo.operation}, concluir: ${pending.join(' → ')}.`);
    }
  }

  return { piece: next, suggestions: [...new Set(suggestions)] };
}

export function getAutoResolveSuggestions(piece: PieceJson): AutoResolveSuggestion[] {
  const out: AutoResolveSuggestion[] = [];
  if (!piece.orla.hasOrla) {
    out.push({ operation: 'ORLAR', action: 'AUTO_COMPLETE', reason: 'Sem orla na peça' });
  }
  const manual = piece.workOrders.find((w) => w.operation === 'MANUAL');
  if (manual && !manual.required) {
    out.push({ operation: 'MANUAL', action: 'AUTO_COMPLETE', reason: 'Operação opcional' });
  }
  return out;
}

export { AUTO_SYSTEM, DEFAULT_OPERATOR };

import { recalculateAutoStatus } from './autoStatus';
import { recalculateAutoProgress } from './autoProgress';
import { applyAutoResolver } from './autoResolver';
import { detectAnomalies } from './anomalyDetector';
import { generateAlerts } from './alerts';
import { buildPieceIntelligence } from './pieceIntelligence';
import { enrichSessionMetrics } from './sessions';
import type { PieceJson } from '../types/piece';

/**
 * Pipeline Fase 3 — aplicar após migração/base de piece.json.
 */
export function applyIndustrialIntelligence(
  piece: PieceJson,
  user?: string
): PieceJson {
  let p = piece;
  const { piece: resolved, suggestions } = applyAutoResolver(p);
  p = resolved;

  p = recalculateAutoStatus(p, user ?? p.lastUpdatedBy ?? 'sistema');
  p = recalculateAutoProgress(p);
  p = enrichSessionMetrics(p);

  const anomalies = detectAnomalies(p);
  const alerts = generateAlerts(p, anomalies);
  const intelligence = buildPieceIntelligence(p, suggestions);

  return {
    ...p,
    anomalies,
    alerts,
    intelligence,
  };
}

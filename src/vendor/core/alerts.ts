import type { IndustrialAlert, IndustrialAnomaly, PieceJson } from '../types/piece';

function now(): string {
  return new Date().toISOString();
}

export function generateAlerts(piece: PieceJson, anomalies: IndustrialAnomaly[]): IndustrialAlert[] {
  const alerts: IndustrialAlert[] = [];
  const ts = now();

  for (const a of anomalies) {
    let type: IndustrialAlert['type'] = 'AVISO';
    if (a.severity === 'HIGH') type = a.anomalyCode.includes('MISSING') ? 'ERRO' : 'ALERTA';
    if (a.severity === 'LOW') type = 'AVISO';

    alerts.push({
      type,
      message: a.message,
      timestamp: a.timestamp,
      operation: a.operation,
      pieceName: piece.pieceName,
    });
  }

  const recentOverrides = piece.logs.filter(
    (l) => l.action === 'OVERRIDE' && Date.now() - new Date(l.timestamp).getTime() < 86400000
  );
  for (const log of recentOverrides) {
    alerts.push({
      type: 'ALERTA',
      message: `WO fora de ordem: ${log.operation} (${log.notes || 'override'})`,
      timestamp: log.timestamp,
      operation: log.operation,
      pieceName: piece.pieceName,
    });
  }

  if (piece.pieceStatus === 'DONE') {
    alerts.push({
      type: 'INFO',
      message: `Peça ${piece.pieceName} concluída (${piece.progressPercent}%).`,
      timestamp: ts,
      pieceName: piece.pieceName,
    });
  }

  const activeSession = piece.sessions.find((s) => s.endedAt === null);
  if (activeSession) {
    const duration = Date.now() - new Date(activeSession.startedAt).getTime();
    if (duration > 2 * 60 * 60 * 1000) {
      alerts.push({
        type: 'AVISO',
        message: `Tempo excessivo na sessão actual (${Math.round(duration / 60000)} min).`,
        timestamp: ts,
        pieceName: piece.pieceName,
      });
    }
  }

  const seen = new Set<string>();
  return alerts.filter((a) => {
    const key = `${a.type}:${a.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getActiveAlerts(alerts: IndustrialAlert[]): IndustrialAlert[] {
  return alerts.filter((a) => !a.dismissed && a.type !== 'INFO');
}

export function alertSeverityClass(type: IndustrialAlert['type']): string {
  switch (type) {
    case 'ERRO':
      return 'alert-error';
    case 'ALERTA':
      return 'alert-warning';
    case 'AVISO':
      return 'alert-info';
    default:
      return 'alert-success';
  }
}

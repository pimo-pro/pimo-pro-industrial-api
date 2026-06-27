import type { PieceJson, PieceSession } from '../types/piece';

export const DEFAULT_OPERATOR = 'operador-local';

const IDLE_GAP_MS = 30 * 60 * 1000;

export function createSessionId(): string {
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function startSession(piece: PieceJson, user: string = DEFAULT_OPERATOR): PieceJson {
  const active = piece.sessions.find((s) => s.endedAt === null);
  if (active) return piece;

  const session: PieceSession = {
    sessionId: createSessionId(),
    user,
    startedAt: new Date().toISOString(),
    endedAt: null,
    piecesWorked: [piece.pieceName],
  };

  return { ...piece, sessions: [...piece.sessions, session] };
}

export function recordPieceInActiveSession(piece: PieceJson): PieceJson {
  const sessions = piece.sessions.map((s) => {
    if (s.endedAt !== null) return s;
    const worked = s.piecesWorked.includes(piece.pieceName)
      ? s.piecesWorked
      : [...s.piecesWorked, piece.pieceName];
    return { ...s, piecesWorked: worked };
  });
  return { ...piece, sessions };
}

export function endActiveSession(piece: PieceJson): PieceJson {
  const now = new Date().toISOString();
  const sessions = piece.sessions.map((s) =>
    s.endedAt === null ? { ...s, endedAt: now } : s
  );
  return { ...piece, sessions };
}

export function getActiveSession(piece: PieceJson): PieceSession | null {
  return piece.sessions.find((s) => s.endedAt === null) ?? null;
}

/** Fase 3 — calcula métricas por sessão (tempo activo, produtividade). */
export function enrichSessionMetrics(piece: PieceJson): PieceJson {
  const doneOps = piece.logs.filter((l) => l.action === 'DONE').length;

  const sessions = piece.sessions.map((session) => {
    const start = new Date(session.startedAt).getTime();
    const end = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
    const totalMinutes = Math.max(0, Math.round((end - start) / 60000));

    let activeMinutes = totalMinutes;
    let idleMinutes = 0;
    const sessionLogs = piece.logs.filter((l) => {
      const t = new Date(l.timestamp).getTime();
      return t >= start && t <= end;
    });
    if (sessionLogs.length >= 2) {
      let gapIdle = 0;
      for (let i = 1; i < sessionLogs.length; i++) {
        const gap =
          new Date(sessionLogs[i]!.timestamp).getTime() -
          new Date(sessionLogs[i - 1]!.timestamp).getTime();
        if (gap > IDLE_GAP_MS) gapIdle += gap;
      }
      idleMinutes = Math.round(gapIdle / 60000);
      activeMinutes = Math.max(0, totalMinutes - idleMinutes);
    }

    const piecesCount = Math.max(1, session.piecesWorked.length);
    const productivityPerHour =
      activeMinutes > 0 ? Math.round((piecesCount / activeMinutes) * 60 * 10) / 10 : 0;
    const avgMinutesPerPiece =
      piecesCount > 0 ? Math.round((activeMinutes / piecesCount) * 10) / 10 : 0;

    return {
      ...session,
      activeMinutes,
      idleMinutes,
      operationsCompleted: session.endedAt ? doneOps : undefined,
      productivityPerHour,
      avgMinutesPerPiece,
    };
  });

  return { ...piece, sessions };
}

export function getSessionSummary(piece: PieceJson) {
  const sessions = piece.sessions;
  const totalActive = sessions.reduce((s, x) => s + (x.activeMinutes ?? 0), 0);
  const totalOps = piece.logs.filter((l) => l.action === 'DONE').length;
  return {
    sessionCount: sessions.length,
    totalActiveMinutes: totalActive,
    avgMinutesPerOperation: totalOps > 0 ? Math.round(totalActive / totalOps) : 0,
  };
}

import { applyIndustrialIntelligence } from './intelligencePipeline';
import { DEFAULT_OPERATIONS } from './operations';
import type {
  LegacyTrackingLogEntry,
  OperationName,
  PieceJson,
  PieceSession,
  TrackingLogEntry,
  WorkOrder,
} from '../types/piece';

export function createDefaultWorkOrders(): WorkOrder[] {
  return DEFAULT_OPERATIONS.map((op) => ({
    operation: op.name,
    status: 'PENDING',
    required: op.required,
    doneAt: null,
    doneBy: null,
    override: false,
    notes: '',
  }));
}

function migrateLogs(raw: PieceJson): TrackingLogEntry[] {
  if (Array.isArray(raw.logs) && raw.logs.length > 0 && 'action' in raw.logs[0]!) {
    return raw.logs as TrackingLogEntry[];
  }

  const legacy = raw.tracking?.logs ?? [];
  return legacy.map((l: LegacyTrackingLogEntry) => ({
    operation: l.operation,
    action: l.override ? 'OVERRIDE' : 'DONE',
    timestamp: l.finishedAt ?? l.startedAt,
    user: l.user,
    override: l.override ?? false,
    notes: l.notes ?? '',
  }));
}

function migrateSessions(raw: PieceJson): PieceSession[] {
  if (Array.isArray(raw.sessions) && raw.sessions.length > 0 && 'sessionId' in raw.sessions[0]!) {
    return raw.sessions as PieceSession[];
  }

  return (raw.sessions as Array<{ id?: string; sessionId?: string; user: string; startedAt: string; endedAt: string | null }>).map(
    (s) => ({
      sessionId: s.sessionId ?? s.id ?? `sess-migrated-${s.startedAt}`,
      user: s.user,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      piecesWorked: [],
    })
  );
}

function migrateWorkOrders(raw: PieceJson): WorkOrder[] {
  if (Array.isArray(raw.workOrders) && raw.workOrders.length > 0) {
    return raw.workOrders;
  }

  const legacyOps = raw.tracking?.operations;
  if (legacyOps?.length) {
    return legacyOps.map((op) => ({
      operation: op.name,
      status: op.done ? 'DONE' : 'PENDING',
      required: op.required,
      doneAt: op.doneAt,
      doneBy: op.doneBy,
      override: false,
      notes: '',
    }));
  }

  return createDefaultWorkOrders();
}

/** Migra estrutura v1→v3 sem correr inteligência. */
export function migratePieceJson(raw: PieceJson): PieceJson {
  const workOrders = migrateWorkOrders(raw);
  const logs = migrateLogs(raw);
  const sessions = migrateSessions(raw);

  return {
    pieceName: raw.pieceName,
    qr: raw.qr,
    material: raw.material,
    thickness: raw.thickness,
    width: raw.width,
    height: raw.height,
    holes: raw.holes ?? [],
    orla: raw.orla ?? { hasOrla: false, edges: [], type: '' },
    pieceStatus: raw.pieceStatus ?? raw.tracking?.status ?? 'PENDING',
    progressPercent: raw.progressPercent ?? 0,
    lastOperation: raw.lastOperation ?? findLastOperation(workOrders),
    lastUpdatedAt: raw.lastUpdatedAt ?? null,
    lastUpdatedBy: raw.lastUpdatedBy ?? null,
    workOrders,
    logs,
    sessions,
    notes: raw.notes ?? [],
    anomalies: raw.anomalies ?? [],
    alerts: raw.alerts ?? [],
    qualityInspections: raw.qualityInspections ?? [],
    reworkRequests: raw.reworkRequests ?? [],
    intelligence: raw.intelligence,
    factoryId: raw.factoryId ?? 'F1',
    syncedAt: raw.syncedAt ?? null,
    syncStatus: raw.syncStatus ?? 'OUT_OF_SYNC',
    source: raw.source ?? 'LOCAL',
    tracking: raw.tracking,
  };
}

/** Normaliza piece.json e aplica inteligência industrial (idempotente). */
export function normalizePieceJson(raw: PieceJson): PieceJson {
  return applyIndustrialIntelligence(migratePieceJson(raw), raw.lastUpdatedBy ?? undefined);
}

function findLastOperation(workOrders: WorkOrder[]): OperationName | null {
  const done = workOrders.filter((w) => w.status === 'DONE' && w.doneAt);
  if (done.length === 0) return null;
  done.sort((a, b) => new Date(b.doneAt!).getTime() - new Date(a.doneAt!).getTime());
  return done[0]!.operation;
}

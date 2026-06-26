import fs from 'fs';
import path from 'path';

import {
  FACTORIES_ROOT,
  factoryPath,
  pieceCentralPath,
  projectCentralPath,
  PIECES_ROOT,
  PROJECTS_ROOT,
} from '../paths.js';
import { lookupQrLocal, readLocalPiece } from './localBridge.js';
import type {
  CentralPieceJson,
  DataSource,
  FactoryJson,
  PieceRoute,
  ProjectCentralJson,
  SyncDiff,
  SyncStatus,
} from '../types.js';

const DEFAULT_FACTORY_ID = 'F1';

function readJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function checksum(piece: Record<string, unknown>): string {
  const core = JSON.stringify({
    status: piece.pieceStatus,
    progress: piece.progressPercent,
    wo: piece.workOrders,
    logs: (piece.logs as unknown[])?.length,
  });
  let h = 0;
  for (let i = 0; i < core.length; i++) h = (h * 31 + core.charCodeAt(i)) | 0;
  return `c${Math.abs(h).toString(16)}`;
}

export function ensureDefaultFactory(): FactoryJson {
  const fp = factoryPath(DEFAULT_FACTORY_ID);
  const existing = readJson<FactoryJson>(fp);
  if (existing) return existing;
  const factory: FactoryJson = {
    factoryId: DEFAULT_FACTORY_ID,
    nome: 'Fábrica Principal',
    localizacao: 'Local',
    funcionarios: ['operador-local'],
    maquinas: ['CNC-1', 'DRILL-1'],
    sessoesAtivas: 0,
    produtividadeAgregada: 0,
    updatedAt: new Date().toISOString(),
  };
  writeJson(fp, factory);
  return factory;
}

export function toCentralPiece(
  raw: Record<string, unknown>,
  route: PieceRoute,
  qr: string,
  source: DataSource,
  syncStatus: SyncStatus = 'IN_SYNC'
): CentralPieceJson {
  const now = new Date().toISOString();
  return {
    ...(raw as Omit<CentralPieceJson, 'factoryId' | 'syncedAt' | 'syncStatus' | 'source' | 'route' | 'qr'>),
    qr,
    factoryId: DEFAULT_FACTORY_ID,
    syncedAt: now,
    syncStatus,
    source,
    route: { ...route, projectId: route.projectId },
  } as CentralPieceJson;
}

export function getOrCreateCentralPiece(qr: string): CentralPieceJson | null {
  const safeQr = qr.toLowerCase();
  const existing = readJson<CentralPieceJson>(pieceCentralPath(safeQr));
  if (existing) return existing;

  const lookup = lookupQrLocal(safeQr);
  if (!lookup) return null;

  const local = readLocalPiece(lookup);
  if (!local) {
    const minimal = {
      pieceName: lookup.pieceName,
      qr: lookup.qr,
      material: '—',
      thickness: 0,
      width: 0,
      height: 0,
      holes: [],
      orla: { hasOrla: false, edges: [], type: '' },
      pieceStatus: 'PENDING',
      progressPercent: 0,
      lastOperation: null,
      lastUpdatedAt: null,
      lastUpdatedBy: null,
      workOrders: [],
      logs: [],
      sessions: [],
      notes: [],
      anomalies: [],
      alerts: [],
    };
    const central = toCentralPiece(minimal, lookup, lookup.qr, 'CENTRAL', 'OUT_OF_SYNC');
    writeJson(pieceCentralPath(safeQr), central);
    return central;
  }

  const central = toCentralPiece(
    { ...local, qr: lookup.qr },
    { ...lookup, projectId: lookup.projectId },
    lookup.qr,
    'LOCAL',
    'IN_SYNC'
  );
  writeJson(pieceCentralPath(safeQr), central);
  return central;
}

export function updateCentralPiece(
  qr: string,
  mutation: Record<string, unknown>,
  source: DataSource = 'LOCAL'
): { piece: CentralPieceJson; diff: SyncDiff[] } {
  const safeQr = qr.toLowerCase();
  const current = getOrCreateCentralPiece(safeQr);
  if (!current) throw new Error('Peça não encontrada');

  const localTs = mutation.lastUpdatedAt ? new Date(String(mutation.lastUpdatedAt)).getTime() : 0;
  const centralTs = current.lastUpdatedAt ? new Date(current.lastUpdatedAt).getTime() : 0;

  const diff: SyncDiff[] = [];
  let syncStatus: SyncStatus = 'IN_SYNC';

  if (localTs > 0 && centralTs > 0 && localTs !== centralTs) {
    if (localTs > centralTs) {
      diff.push({ field: 'lastUpdatedAt', local: mutation.lastUpdatedAt, central: current.lastUpdatedAt });
    } else if (centralTs > localTs) {
      syncStatus = 'OUT_OF_SYNC';
      diff.push({ field: 'lastUpdatedAt', local: mutation.lastUpdatedAt, central: current.lastUpdatedAt });
    }
  }

  const merged = {
    ...current,
    ...mutation,
    qr: safeQr,
    factoryId: current.factoryId ?? DEFAULT_FACTORY_ID,
    route: current.route,
    syncedAt: new Date().toISOString(),
    source,
    syncStatus,
  } as CentralPieceJson;

  const localCs = checksum(mutation);
  const centralCs = checksum(current as unknown as Record<string, unknown>);
  if (localCs !== centralCs && localTs > 0 && centralTs > 0 && Math.abs(localTs - centralTs) < 60000) {
    merged.syncStatus = 'CONFLICT';
    diff.push({ field: 'checksum', local: localCs, central: centralCs });
  }

  writeJson(pieceCentralPath(safeQr), merged);
  return { piece: merged, diff };
}

export function appendCentralLog(qr: string, logEntry: unknown): CentralPieceJson | null {
  const piece = getOrCreateCentralPiece(qr);
  if (!piece) return null;
  const logs = [...(piece.logs as unknown[]), logEntry];
  return updateCentralPiece(qr, { ...piece, logs }, 'CENTRAL').piece;
}

export function getProjectCentral(user: string, project: string): ProjectCentralJson {
  const piecesDir = path.join(PIECES_ROOT);
  const qrCodes: string[] = [];
  let totalProgress = 0;
  let count = 0;

  if (fs.existsSync(piecesDir)) {
    for (const qrDir of fs.readdirSync(piecesDir)) {
      const pj = readJson<CentralPieceJson>(path.join(piecesDir, qrDir, 'piece.json'));
      if (!pj?.route) continue;
      if (pj.route.user.toUpperCase() !== user.toUpperCase()) continue;
      if (pj.route.project.toUpperCase() !== project.toUpperCase()) continue;
      qrCodes.push(pj.qr);
      totalProgress += pj.progressPercent ?? 0;
      count++;
    }
  }

  const projectId = `${user}_${project}`;
  const payload: ProjectCentralJson = {
    projectId,
    user,
    project,
    projectDisplayName: project,
    pieceCount: count,
    progressPercent: count > 0 ? Math.round(totalProgress / count) : 0,
    factoryId: DEFAULT_FACTORY_ID,
    syncedAt: new Date().toISOString(),
    qrCodes,
  };
  writeJson(projectCentralPath(projectId), payload);
  return payload;
}

export function listFactories(): FactoryJson[] {
  ensureDefaultFactory();
  if (!fs.existsSync(FACTORIES_ROOT)) return [];
  return fs
    .readdirSync(FACTORIES_ROOT)
    .map((id: string) => readJson<FactoryJson>(factoryPath(id)))
    .filter((f): f is FactoryJson => f !== null);
}

export function listAllCentralPieces(): CentralPieceJson[] {
  if (!fs.existsSync(PIECES_ROOT)) return [];
  return fs
    .readdirSync(PIECES_ROOT)
    .map((qr: string) => readJson<CentralPieceJson>(pieceCentralPath(qr)))
    .filter((p): p is CentralPieceJson => p !== null);
}

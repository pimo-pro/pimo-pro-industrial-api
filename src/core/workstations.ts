import fs from 'fs';

import { workstationPath, WORKSTATIONS_ROOT } from '../paths.js';
import { emitIndustrialEvent } from '../events/eventBus.js';
import {
  broadcastWorkstationOffline,
  broadcastWorkstationOnline,
} from '../realtime/wsServer.js';

export type WorkstationType = 'CNC' | 'ORLAR' | 'DRILL' | 'MONTAGEM' | 'EMBALAGEM';
export type WorkstationStatus = 'ONLINE' | 'OFFLINE';

export interface WorkstationJson {
  id: string;
  type: WorkstationType;
  status: WorkstationStatus;
  currentPiece: string | null;
  lastHeartbeat: string;
  factoryId: string;
}

const HEARTBEAT_TIMEOUT_MS = 30_000;

function readJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(WORKSTATIONS_ROOT, { recursive: true });
  const dir = filePath.replace(/[/\\][^/\\]+$/, '');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export function ensureDefaultWorkstations(): WorkstationJson[] {
  const defaults: Array<{ id: string; type: WorkstationType }> = [
    { id: 'WS-CNC-01', type: 'CNC' },
    { id: 'WS-ORLAR-01', type: 'ORLAR' },
    { id: 'WS-DRILL-01', type: 'DRILL' },
    { id: 'WS-MONTAGEM-01', type: 'MONTAGEM' },
    { id: 'WS-EMBALAGEM-01', type: 'EMBALAGEM' },
  ];

  const out: WorkstationJson[] = [];
  const now = new Date().toISOString();
  for (const d of defaults) {
    const fp = workstationPath(d.id);
    const existing = readJson<WorkstationJson>(fp);
    if (existing) {
      out.push(existing);
      continue;
    }
    const ws: WorkstationJson = {
      id: d.id,
      type: d.type,
      status: 'OFFLINE',
      currentPiece: null,
      lastHeartbeat: now,
      factoryId: 'F1',
    };
    writeJson(fp, ws);
    out.push(ws);
  }
  return out;
}

export function listWorkstations(): WorkstationJson[] {
  ensureDefaultWorkstations();
  markStaleOffline();
  if (!fs.existsSync(WORKSTATIONS_ROOT)) return [];
  return fs
    .readdirSync(WORKSTATIONS_ROOT)
    .map((dir: string) => readJson<WorkstationJson>(workstationPath(dir)))
    .filter((w: WorkstationJson | null): w is WorkstationJson => w !== null);
}

function markStaleOffline(): void {
  const now = Date.now();
  for (const ws of listWorkstationsRaw()) {
    const last = new Date(ws.lastHeartbeat).getTime();
    if (ws.status === 'ONLINE' && now - last > HEARTBEAT_TIMEOUT_MS) {
      const updated = { ...ws, status: 'OFFLINE' as WorkstationStatus, currentPiece: null };
      writeJson(workstationPath(ws.id), updated);
      emitIndustrialEvent('workstation.offline', { workstationId: ws.id, reason: 'heartbeat_timeout' });
      broadcastWorkstationOffline(ws.id, updated);
    }
  }
}

function listWorkstationsRaw(): WorkstationJson[] {
  if (!fs.existsSync(WORKSTATIONS_ROOT)) return [];
  return fs
    .readdirSync(WORKSTATIONS_ROOT)
    .map((dir: string) => readJson<WorkstationJson>(workstationPath(dir)))
    .filter((w: WorkstationJson | null): w is WorkstationJson => w !== null);
}

export function heartbeatWorkstation(id: string): WorkstationJson | null {
  const fp = workstationPath(id);
  let ws = readJson<WorkstationJson>(fp);
  const wasOffline = !ws || ws.status === 'OFFLINE';
  if (!ws) {
    ensureDefaultWorkstations();
    ws = readJson<WorkstationJson>(fp);
  }
  if (!ws) return null;

  const updated: WorkstationJson = {
    ...ws,
    status: 'ONLINE',
    lastHeartbeat: new Date().toISOString(),
  };
  writeJson(fp, updated);
  emitIndustrialEvent('workstation.heartbeat', { workstationId: id, status: 'ONLINE' });
  if (wasOffline) {
    emitIndustrialEvent('workstation.online', { workstationId: id });
    broadcastWorkstationOnline(id, updated);
  }
  return updated;
}

export function assignPieceToWorkstation(id: string, qr: string | null): WorkstationJson | null {
  const fp = workstationPath(id);
  const ws = readJson<WorkstationJson>(fp);
  if (!ws) return null;

  const updated: WorkstationJson = {
    ...ws,
    currentPiece: qr,
    status: 'ONLINE',
    lastHeartbeat: new Date().toISOString(),
  };
  writeJson(fp, updated);
  emitIndustrialEvent('workstation.assigned', { workstationId: id, qr });
  return updated;
}

export function releaseWorkstationPiece(id: string): WorkstationJson | null {
  return assignPieceToWorkstation(id, null);
}

export function getWorkstation(id: string): WorkstationJson | null {
  return readJson<WorkstationJson>(workstationPath(id));
}

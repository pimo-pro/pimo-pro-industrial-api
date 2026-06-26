import {
  appendCentralLog,
  getOrCreateCentralPiece,
  updateCentralPiece,
} from '../core/industrialCore.js';
import { assignPieceToWorkstation, releaseWorkstationPiece } from '../core/workstations.js';
import { emitIndustrialEvent } from '../events/eventBus.js';
import { broadcastPieceUpdate } from '../realtime/wsServer.js';

type MachineOp = 'CNC' | 'ORLAR' | 'DRILL';

const OP_MAP: Record<MachineOp, string> = {
  CNC: 'CNC',
  ORLAR: 'ORLAR',
  DRILL: 'DRILL',
};

function completeWorkOrderOnPiece(
  qr: string,
  operation: string,
  user: string
): ReturnType<typeof updateCentralPiece> | null {
  const piece = getOrCreateCentralPiece(qr);
  if (!piece) return null;

  const workOrders = (piece.workOrders as Array<Record<string, unknown>>).map((wo) => {
    if (wo.operation !== operation) return wo;
    if (wo.status === 'DONE') return wo;
    return {
      ...wo,
      status: 'DONE',
      doneAt: new Date().toISOString(),
      doneBy: user,
    };
  });

  const logs = [
    ...(piece.logs as unknown[]),
    {
      operation,
      action: 'DONE',
      timestamp: new Date().toISOString(),
      user,
      override: false,
      notes: `Máquina ${operation}`,
    },
  ];

  const doneCount = workOrders.filter((w) => w.status === 'DONE').length;
  const total = workOrders.filter((w) => w.required !== false).length;
  const progressPercent = total > 0 ? Math.round((doneCount / total) * 100) : piece.progressPercent;

  return updateCentralPiece(qr, {
    ...piece,
    workOrders,
    logs,
    progressPercent,
    lastOperation: operation,
    lastUpdatedAt: new Date().toISOString(),
    lastUpdatedBy: user,
    pieceStatus: progressPercent >= 100 ? 'DONE' : 'IN_PROGRESS',
  }, 'CENTRAL');
}

function jobEvent(
  type: 'machine.jobStarted' | 'machine.jobFinished',
  op: MachineOp,
  qr: string,
  workstationId?: string
): void {
  emitIndustrialEvent(type, { qr, operation: op, workstationId: workstationId ?? null });
  broadcastPieceUpdate(qr, { machineEvent: type, operation: op });
}

export function cncJobStarted(qr: string, workstationId = 'WS-CNC-01'): void {
  const safeQr = qr.toLowerCase();
  if (workstationId) assignPieceToWorkstation(workstationId, safeQr);
  appendCentralLog(safeQr, {
    operation: 'CNC',
    action: 'START',
    timestamp: new Date().toISOString(),
    user: 'machine-cnc',
    override: false,
    notes: 'CNC job started',
  });
  jobEvent('machine.jobStarted', 'CNC', safeQr, workstationId);
}

export function cncJobFinished(qr: string, workstationId = 'WS-CNC-01'): void {
  const safeQr = qr.toLowerCase();
  completeWorkOrderOnPiece(safeQr, OP_MAP.CNC, 'machine-cnc');
  if (workstationId) releaseWorkstationPiece(workstationId);
  jobEvent('machine.jobFinished', 'CNC', safeQr, workstationId);
}

export function orlarJobStarted(qr: string, workstationId = 'WS-ORLAR-01'): void {
  const safeQr = qr.toLowerCase();
  if (workstationId) assignPieceToWorkstation(workstationId, safeQr);
  appendCentralLog(safeQr, {
    operation: 'ORLAR',
    action: 'START',
    timestamp: new Date().toISOString(),
    user: 'machine-orlar',
    override: false,
    notes: 'Orladora job started',
  });
  jobEvent('machine.jobStarted', 'ORLAR', safeQr, workstationId);
}

export function orlarJobFinished(qr: string, workstationId = 'WS-ORLAR-01'): void {
  const safeQr = qr.toLowerCase();
  completeWorkOrderOnPiece(safeQr, OP_MAP.ORLAR, 'machine-orlar');
  if (workstationId) releaseWorkstationPiece(workstationId);
  jobEvent('machine.jobFinished', 'ORLAR', safeQr, workstationId);
}

export function drillJobStarted(qr: string, workstationId = 'WS-DRILL-01'): void {
  const safeQr = qr.toLowerCase();
  if (workstationId) assignPieceToWorkstation(workstationId, safeQr);
  appendCentralLog(safeQr, {
    operation: 'DRILL',
    action: 'START',
    timestamp: new Date().toISOString(),
    user: 'machine-drill',
    override: false,
    notes: 'Furação job started',
  });
  jobEvent('machine.jobStarted', 'DRILL', safeQr, workstationId);
}

export function drillJobFinished(qr: string, workstationId = 'WS-DRILL-01'): void {
  const safeQr = qr.toLowerCase();
  completeWorkOrderOnPiece(safeQr, OP_MAP.DRILL, 'machine-drill');
  if (workstationId) releaseWorkstationPiece(workstationId);
  jobEvent('machine.jobFinished', 'DRILL', safeQr, workstationId);
}

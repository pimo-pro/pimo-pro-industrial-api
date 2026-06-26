import { lookupQrLocal } from '../core/localBridge.js';
import { assignPieceToWorkstation } from '../core/workstations.js';
import { emitIndustrialEvent } from '../events/eventBus.js';
import { broadcastPieceUpdate } from '../realtime/wsServer.js';

export interface QrScanInput {
  qr: string;
  workstationId?: string;
  source?: 'serial' | 'usb' | 'tcp' | 'manual';
}

export interface QrScanResult {
  ok: boolean;
  qr: string;
  lookup?: {
    user: string;
    project: string;
    box: string;
    pieceName: string;
    projectId?: string;
  };
  workstationId?: string;
  error?: string;
}

/** Recebe QR de leitor físico (serial/USB/TCP) ou simulação HTTP. */
export function processQrScan(input: QrScanInput): QrScanResult {
  const qr = String(input.qr ?? '').trim().toLowerCase();
  if (!qr) return { ok: false, qr: '', error: 'QR vazio' };

  const lookup = lookupQrLocal(qr);
  if (!lookup) {
    return { ok: false, qr, error: 'QR não encontrado' };
  }

  if (input.workstationId) {
    assignPieceToWorkstation(input.workstationId, qr);
  }

  emitIndustrialEvent('piece.scanned', {
    qr,
    workstationId: input.workstationId ?? null,
    source: input.source ?? 'tcp',
    route: lookup,
  });

  broadcastPieceUpdate(qr, { scanned: true, route: lookup, workstationId: input.workstationId });

  return {
    ok: true,
    qr,
    lookup: {
      user: lookup.user,
      project: lookup.project,
      box: lookup.box,
      pieceName: lookup.pieceName,
      projectId: lookup.projectId,
    },
    workstationId: input.workstationId,
  };
}

/** Simula leitura via porta TCP (stub — evento HTTP). */
export function simulateTcpQrScan(qr: string, workstationId: string): QrScanResult {
  return processQrScan({ qr, workstationId, source: 'tcp' });
}

/** Simula leitura via porta serial/USB (stub). */
export function simulateSerialQrScan(qr: string, workstationId: string): QrScanResult {
  return processQrScan({ qr, workstationId, source: 'serial' });
}

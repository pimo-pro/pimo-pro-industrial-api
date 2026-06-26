import WebSocket, { WebSocketServer } from 'ws';

import { onIndustrialEvent } from '../events/eventBus.js';
import type { IndustrialEvent } from '../events/types.js';

export type WsClientMessage =
  | { action: 'subscribe'; channel: string }
  | { action: 'unsubscribe'; channel: string }
  | { action: 'ping' };

export type WsServerMessage =
  | { type: 'connected'; clientId: string }
  | { type: 'subscribed'; channel: string }
  | { type: 'pong' }
  | { type: 'event'; event: IndustrialEvent }
  | { type: 'piece.updated'; qr: string; payload: unknown }
  | { type: 'piece.synced'; qr: string; payload: unknown }
  | { type: 'piece.conflict'; qr: string; payload: unknown }
  | { type: 'project.updated'; projectId: string; payload: unknown }
  | { type: 'session.started'; qr: string; payload: unknown }
  | { type: 'session.ended'; qr: string; payload: unknown }
  | { type: 'workstation.online'; workstationId: string; payload: unknown }
  | { type: 'workstation.offline'; workstationId: string; payload: unknown };

type ClientState = {
  id: string;
  socket: WebSocket;
  channels: Set<string>;
};

const clients = new Map<WebSocket, ClientState>();
let clientCounter = 0;
let busUnsubscribe: (() => void) | null = null;

function send(socket: WebSocket, message: WsServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function broadcast(channel: string, message: WsServerMessage): void {
  const key = channel.toLowerCase();
  for (const client of clients.values()) {
    if (client.channels.has(key) || client.channels.has('global')) {
      send(client.socket, message);
    }
  }
}

export function broadcastPieceUpdate(qr: string, payload: unknown): void {
  const qrNorm = qr.toLowerCase();
  const msg: WsServerMessage = { type: 'piece.updated', qr: qrNorm, payload };
  broadcast(`piece:${qrNorm}`, msg);
  broadcast('factory', msg);
}

export function broadcastPieceSynced(qr: string, payload: unknown): void {
  const qrNorm = qr.toLowerCase();
  const msg: WsServerMessage = { type: 'piece.synced', qr: qrNorm, payload };
  broadcast(`piece:${qrNorm}`, msg);
  broadcast('factory', msg);
}

export function broadcastPieceConflict(qr: string, payload: unknown): void {
  const qrNorm = qr.toLowerCase();
  const msg: WsServerMessage = { type: 'piece.conflict', qr: qrNorm, payload };
  broadcast(`piece:${qrNorm}`, msg);
  broadcast('factory', msg);
}

export function broadcastProjectUpdate(projectId: string, payload: unknown): void {
  const msg: WsServerMessage = { type: 'project.updated', projectId, payload };
  broadcast(`project:${projectId}`, msg);
  broadcast('factory', msg);
}

export function broadcastSessionStarted(qr: string, payload: unknown): void {
  const msg: WsServerMessage = { type: 'session.started', qr: qr.toLowerCase(), payload };
  broadcast(`piece:${qr.toLowerCase()}`, msg);
  broadcast('factory', msg);
}

export function broadcastSessionEnded(qr: string, payload: unknown): void {
  const msg: WsServerMessage = { type: 'session.ended', qr: qr.toLowerCase(), payload };
  broadcast(`piece:${qr.toLowerCase()}`, msg);
  broadcast('factory', msg);
}

export function broadcastWorkstationOnline(workstationId: string, payload: unknown): void {
  const msg: WsServerMessage = { type: 'workstation.online', workstationId, payload };
  broadcast('workstations', msg);
  broadcast('factory', msg);
}

export function broadcastWorkstationOffline(workstationId: string, payload: unknown): void {
  const msg: WsServerMessage = { type: 'workstation.offline', workstationId, payload };
  broadcast('workstations', msg);
  broadcast('factory', msg);
}

export function subscribePiece(qr: string, socket: WebSocket): void {
  const client = clients.get(socket);
  if (client) client.channels.add(`piece:${qr.toLowerCase()}`);
}

export function subscribeProject(projectId: string, socket: WebSocket): void {
  const client = clients.get(socket);
  if (client) client.channels.add(`project:${projectId}`);
}

export function attachWebSocketServer(wss: WebSocketServer): void {
  if (busUnsubscribe) busUnsubscribe();

  busUnsubscribe = onIndustrialEvent((event) => {
    const channelMap: Record<string, string[]> = {
      'piece.updated': event.payload.qr ? [`piece:${String(event.payload.qr).toLowerCase()}`, 'factory'] : ['factory'],
      'piece.synced': event.payload.qr ? [`piece:${String(event.payload.qr).toLowerCase()}`, 'factory'] : ['factory'],
      'piece.conflict': event.payload.qr ? [`piece:${String(event.payload.qr).toLowerCase()}`, 'factory'] : ['factory'],
      'piece.scanned': event.payload.qr ? [`piece:${String(event.payload.qr).toLowerCase()}`, 'factory'] : ['factory'],
      'project.updated': event.payload.projectId
        ? [`project:${event.payload.projectId}`, 'factory']
        : ['factory'],
      'session.started': event.payload.qr ? [`piece:${String(event.payload.qr).toLowerCase()}`, 'factory'] : ['factory'],
      'session.ended': event.payload.qr ? [`piece:${String(event.payload.qr).toLowerCase()}`, 'factory'] : ['factory'],
      'workstation.heartbeat': ['workstations', 'factory'],
      'workstation.online': ['workstations', 'factory'],
      'workstation.offline': ['workstations', 'factory'],
      'workstation.assigned': ['workstations', 'factory'],
      'machine.jobStarted': ['factory'],
      'machine.jobFinished': ['factory'],
      'operator.sessionStarted': ['factory'],
      'operator.sessionEnded': ['factory'],
    };

    const channels = channelMap[event.type] ?? ['factory'];
    const msg: WsServerMessage = { type: 'event', event };
    for (const ch of channels) broadcast(ch, msg);
  });

  wss.on('connection', (socket: WebSocket) => {
    const id = `ws-${++clientCounter}`;
    const state: ClientState = { id, socket, channels: new Set(['global']) };
    clients.set(socket, state);
    send(socket, { type: 'connected', clientId: id });

    socket.on('message', (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(String(raw)) as WsClientMessage;
        if (msg.action === 'ping') {
          send(socket, { type: 'pong' });
          return;
        }
        if (msg.action === 'subscribe' && msg.channel) {
          state.channels.add(msg.channel.toLowerCase());
          send(socket, { type: 'subscribed', channel: msg.channel });
          return;
        }
        if (msg.action === 'unsubscribe' && msg.channel) {
          state.channels.delete(msg.channel.toLowerCase());
        }
      } catch {
        /* ignore */
      }
    });

    socket.on('close', () => clients.delete(socket));
  });
}

export function getConnectedClientCount(): number {
  return clients.size;
}

import fs from 'fs';
import path from 'path';

import { EVENTS_LOG_PATH } from '../paths.js';
import type { IndustrialEvent, IndustrialEventType } from './types.js';

type EventListener = (event: IndustrialEvent) => void;

const listeners = new Set<EventListener>();
const recentEvents: IndustrialEvent[] = [];
const MAX_RECENT = 500;

function ensureLogDir(): void {
  fs.mkdirSync(path.dirname(EVENTS_LOG_PATH), { recursive: true });
}

function appendToLog(event: IndustrialEvent): void {
  try {
    ensureLogDir();
    fs.appendFileSync(EVENTS_LOG_PATH, `${JSON.stringify(event)}\n`, 'utf8');
  } catch {
    /* ignore log errors */
  }
}

export function emitIndustrialEvent(
  type: IndustrialEventType,
  payload: Record<string, unknown>
): IndustrialEvent {
  const event: IndustrialEvent = {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    timestamp: new Date().toISOString(),
    payload,
  };

  recentEvents.push(event);
  if (recentEvents.length > MAX_RECENT) recentEvents.shift();
  appendToLog(event);

  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      /* ignore listener errors */
    }
  }

  return event;
}

export function onIndustrialEvent(listener: EventListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRecentEvents(limit = 100): IndustrialEvent[] {
  return recentEvents.slice(-limit);
}

export function replayEvents(since?: string): IndustrialEvent[] {
  if (!fs.existsSync(EVENTS_LOG_PATH)) return getRecentEvents();
  const sinceTs = since ? new Date(since).getTime() : 0;
  const lines = fs.readFileSync(EVENTS_LOG_PATH, 'utf8').trim().split('\n').filter(Boolean);
  const events: IndustrialEvent[] = [];
  for (const line of lines) {
    try {
      const evt = JSON.parse(line) as IndustrialEvent;
      if (!sinceTs || new Date(evt.timestamp).getTime() >= sinceTs) events.push(evt);
    } catch {
      /* skip */
    }
  }
  return events.slice(-MAX_RECENT);
}

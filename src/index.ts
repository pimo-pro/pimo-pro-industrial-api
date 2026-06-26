import http from 'node:http';

import cors from 'cors';
import express from 'express';
import { WebSocketServer } from 'ws';

import { authStub } from './auth.js';
import { ensureDefaultFactory } from './core/industrialCore.js';
import { ensureDefaultWorkstations } from './core/workstations.js';
import { eventsRouter } from './routes/events.js';
import { factoryRouter } from './routes/factory.js';
import { hardwareRouter } from './routes/hardware.js';
import { lookupRouter } from './routes/lookup.js';
import { pieceRouter } from './routes/piece.js';
import { projectRouter } from './routes/project.js';
import { sessionRouter } from './routes/session.js';
import { workstationRouter } from './routes/workstation.js';
import { attachWebSocketServer } from './realtime/wsServer.js';

const HOST = '0.0.0.0';
const PORT = Number.parseInt(process.env.PORT ?? '5180', 10);

const app = express();
const corsOrigin = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
app.use(
  cors(
    corsOrigin?.length
      ? { origin: corsOrigin, credentials: true }
      : undefined
  )
);
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'pimo-pro-industrial-api', phase: 5, realtime: true });
});

app.use('/api', authStub);
app.use('/api/piece', pieceRouter);
app.use('/api/project', projectRouter);
app.use('/api/session', sessionRouter);
app.use('/api/lookup', lookupRouter);
app.use('/api/workstation', workstationRouter);
app.use('/api/factory', factoryRouter);
app.use('/api/hardware', hardwareRouter);
app.use('/api/events', eventsRouter);

ensureDefaultFactory();
ensureDefaultWorkstations();

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
attachWebSocketServer(wss);

server.listen(PORT, HOST, () => {
  console.log(`PIMO Industrial API (Fase 5) listening on ${HOST}:${PORT}`);
  console.log(`WebSocket: ws://${HOST}:${PORT}/ws`);
  if (process.env.RENDER && process.env.PORT === '5180') {
    console.warn(
      'AVISO: PORT=5180 no Render — remover PORT das env vars; o Render injecta o porto automaticamente.'
    );
  }
  console.log('Tokens: supervisor=pimo-industrial-dev-token | operador=pimo-industrial-operator-token');
});

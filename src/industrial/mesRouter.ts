import fs from 'node:fs';
import path from 'node:path';

import { Router, type Request, type Response } from 'express';

import { SGPI_PATHS } from '../config/storagePaths.js';
import { fetchAndCacheRemoteProject, writeCachedProject } from './remoteProjects.js';
import { buildProjectDashboard, pieceSummaryFromJson } from '../vendor/core/dashboardAggregator.js';
import { createDefaultWorkOrders, normalizePieceJson } from '../vendor/core/pieceNormalizer.js';
import {
  listCanonicalIndustrialProjects,
  prepareIndustrialProject,
  registerOrUpdateProject,
  type SgpiPrepareResult,
} from '../vendor/core/projectManager.js';
import { applyPieceUpdate, completeWorkOrder, undoWorkOrder } from '../vendor/core/workOrders.js';
import { endActiveSession, startSession } from '../vendor/core/sessions.js';
import { registerQualityInspection } from '../vendor/industrial/quality/actions.js';
import { createReworkOnPiece, updateReworkStatus } from '../vendor/industrial/rework/actions.js';
import { buildSupervisorSnapshot } from '../vendor/industrial/supervisor/snapshot.js';
import type { OperationName } from '../vendor/types/piece.js';
import {
  boxToSlug,
  generateEtiquetaCode,
  pieceNameFromItem,
  toRouteSlug,
} from '../vendor/core/pieceNaming.js';
import type {
  BoxDetail,
  IndustrialPieceSummary,
  IndustrialProjectSummary,
  PieceDetailResponse,
  PieceHole,
  PieceJson,
  PieceOrla,
  QrLookupResult,
  TrackingStatus,
} from '../vendor/types/piece.js';

const { projetosRoot: PROJETOS_ROOT, pimoProjectsRoot: PIMO_PROJECTS_ROOT } = SGPI_PATHS;

type CutListItem = {
  id: string;
  nome?: string;
  tipo?: string;
  boxId?: string;
  material?: string;
  espessura?: number;
  dimensoes?: { largura?: number; altura?: number; profundidade?: number };
  drillHoles?: Array<{
    x: number;
    y: number;
    diameter: number;
    depth: number;
    holeType?: string;
  }>;
  shortCode?: string;
  pieceNumber?: number;
  metadata?: Record<string, unknown>;
};

type BoxModule = {
  id: string;
  nome?: string;
  cutList?: CutListItem[];
};

type SavedProject = {
  id: string;
  name: string;
  ownerId?: string;
  ownerName?: string;
  updatedAt?: string;
  deleted?: boolean;
  snapshot?: {
    projectState?: {
      projectName?: string;
      cutList?: CutListItem[];
      boxes?: BoxModule[];
      pieceObservacoes?: Record<string, Array<{ id?: string; text?: string; createdAt?: string }>>;
      rules?: { qrcode?: { reiniciarContagemEm99?: boolean } };
    };
  };
};

type ParsedProject = {
  record: SavedProject;
  user: string;
  project: string;
  projectDisplayName: string;
  boxes: Array<{ boxId: string; boxSlug: string; boxName: string; items: CutListItem[] }>;
  allItems: Array<CutListItem & { boxSlug: string; boxName: string; pieceName: string }>;
};

function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function listProjectFiles(): string[] {
  if (!fs.existsSync(PIMO_PROJECTS_ROOT)) return [];
  return fs
    .readdirSync(PIMO_PROJECTS_ROOT)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .map((f) => path.join(PIMO_PROJECTS_ROOT, f));
}

function aggregateCutlist(project: SavedProject): CutListItem[] {
  const state = project.snapshot?.projectState;
  if (!state) return [];
  if (Array.isArray(state.cutList) && state.cutList.length > 0) return state.cutList;
  const fromBoxes: CutListItem[] = [];
  for (const box of state.boxes ?? []) {
    for (const item of box.cutList ?? []) {
      fromBoxes.push({ ...item, boxId: item.boxId ?? box.id });
    }
  }
  return fromBoxes;
}

function hasIndustrialProduction(project: SavedProject): boolean {
  const items = aggregateCutlist(project);
  if (items.length === 0) return false;
  return items.some(
    (i) =>
      Boolean(i.shortCode) ||
      Boolean(i.drillHoles?.length) ||
      Boolean(i.metadata?.industrialLabel)
  );
}

function parseProject(record: SavedProject): ParsedProject | null {
  if (record.deleted) return null;
  const state = record.snapshot?.projectState;
  const projectDisplayName = state?.projectName ?? record.name ?? 'Projeto';
  const user = toRouteSlug(record.ownerName ?? record.ownerId ?? 'UTILIZADOR');
  const project = toRouteSlug(projectDisplayName);
  const boxesRaw = state?.boxes ?? [];
  const cutList = aggregateCutlist(record);

  const boxMap = new Map<string, { boxId: string; boxSlug: string; boxName: string; items: CutListItem[] }>();

  boxesRaw.forEach((box, index) => {
    const boxSlug = boxToSlug(box.nome ?? `Caixa ${index + 1}`, index);
    boxMap.set(box.id, {
      boxId: box.id,
      boxSlug,
      boxName: box.nome ?? `Caixa ${index + 1}`,
      items: [],
    });
  });

  if (boxMap.size === 0 && cutList.length > 0) {
    boxMap.set('default', { boxId: 'default', boxSlug: 'C1', boxName: 'Caixa 1', items: [] });
  }

  cutList.forEach((item) => {
    const boxId = item.boxId ?? boxesRaw[0]?.id ?? 'default';
    let entry = boxMap.get(boxId);
    if (!entry) {
      const index = boxMap.size;
      entry = {
        boxId,
        boxSlug: `C${index + 1}`,
        boxName: `Caixa ${index + 1}`,
        items: [],
      };
      boxMap.set(boxId, entry);
    }
    entry.items.push(item);
  });

  const boxes = Array.from(boxMap.values());
  const allItems = boxes.flatMap((b) =>
    b.items.map((item, idx) => ({
      ...item,
      boxSlug: b.boxSlug,
      boxName: b.boxName,
      pieceName: pieceNameFromItem(item),
      pieceNumber: item.pieceNumber ?? idx + 1,
    }))
  );

  return { record, user, project, projectDisplayName, boxes, allItems };
}

function pieceJsonPath(user: string, project: string, box: string, pieceName: string): string {
  return path.join(PROJETOS_ROOT, user, project, box, pieceName, 'piece.json');
}

function readPieceJson(user: string, project: string, box: string, pieceName: string): PieceJson | null {
  const raw = readJsonFile<PieceJson>(pieceJsonPath(user, project, box, pieceName));
  return raw ? normalizePieceJson(raw) : null;
}

function inferOrla(item: CutListItem): PieceOrla {
  const tipo = String(item.tipo ?? '').toLowerCase();
  const noOrla = tipo.includes('costa') || tipo === 'fundo' || tipo === 'cos';
  if (noOrla) {
    return { hasOrla: false, edges: [], type: '' };
  }
  return { hasOrla: true, edges: ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'], type: 'PVC_1mm' };
}

function extractHoles(item: CutListItem): PieceHole[] {
  return (item.drillHoles ?? []).map((h, i) => ({
    id: `h${i + 1}`,
    type: h.holeType ?? 'DRILL',
    diameter: h.diameter,
    x: h.x,
    y: h.y,
    depth: h.depth,
    confirmed: false,
  }));
}

function buildInitialPieceJson(
  item: CutListItem & { pieceName: string; boxName: string },
  projectDisplayName: string,
  pieceIndex: number
): PieceJson {
  const width = item.dimensoes?.largura ?? 0;
  const height = item.dimensoes?.altura ?? 0;
  const thickness = item.espessura ?? item.dimensoes?.profundidade ?? 0;
  const qr =
    item.shortCode ??
    generateEtiquetaCode(projectDisplayName, item.boxName, item.nome ?? item.pieceName, pieceIndex + 1);

  return normalizePieceJson({
    pieceName: item.pieceName,
    qr,
    material: item.material ?? '—',
    thickness,
    width,
    height,
    holes: extractHoles(item),
    orla: inferOrla(item),
    pieceStatus: 'PENDING',
    progressPercent: 0,
    lastOperation: null,
    lastUpdatedAt: null,
    lastUpdatedBy: null,
    workOrders: createDefaultWorkOrders(),
    logs: [],
    sessions: [],
    notes: [],
    anomalies: [],
    alerts: [],
    factoryId: 'F1',
    syncedAt: null,
    syncStatus: 'OUT_OF_SYNC',
    source: 'LOCAL',
  });
}

function ensurePieceJson(parsed: ParsedProject, boxSlug: string, pieceName: string): PieceJson | null {
  const box = parsed.boxes.find((b) => b.boxSlug.toUpperCase() === boxSlug.toUpperCase());
  if (!box) return null;

  const itemIndex = box.items.findIndex(
    (i) => pieceNameFromItem(i).toUpperCase() === pieceName.toUpperCase()
  );
  if (itemIndex < 0) return null;

  const item = box.items[itemIndex]!;
  const enriched = {
    ...item,
    pieceName: pieceNameFromItem(item),
    boxName: box.boxName,
  };

  const existing = readPieceJson(parsed.user, parsed.project, box.boxSlug, pieceName);
  if (existing) return existing;

  const initial = buildInitialPieceJson(enriched, parsed.projectDisplayName, itemIndex);
  writeJsonFile(pieceJsonPath(parsed.user, parsed.project, box.boxSlug, pieceName), initial);
  return initial;
}

function pieceStatus(pieceJson: PieceJson | null): TrackingStatus {
  if (!pieceJson) return 'PENDING';
  return pieceJson.pieceStatus;
}

function findParsedProject(user: string, project: string): ParsedProject | null {
  const registry = readJsonFile<{ sources: Record<string, { user: string; project: string }> }>(
    path.join(PROJETOS_ROOT, '_sgpi', 'registry.json')
  );

  if (registry?.sources) {
    for (const [sourceId, mapped] of Object.entries(registry.sources)) {
      if (
        mapped.user.toUpperCase() !== user.toUpperCase() ||
        mapped.project.toUpperCase() !== project.toUpperCase()
      ) {
        continue;
      }
      for (const file of listProjectFiles()) {
        const record = readJsonFile<SavedProject>(file);
        if (!record || record.id !== sourceId) continue;
        const parsed = parseProject(record);
        if (parsed) return { ...parsed, user: mapped.user, project: mapped.project };
      }
    }
  }

  for (const file of listProjectFiles()) {
    const record = readJsonFile<SavedProject>(file);
    if (!record || !hasIndustrialProduction(record)) continue;
    const parsed = parseProject(record);
    if (!parsed) continue;
    if (parsed.user.toUpperCase() === user.toUpperCase() && parsed.project.toUpperCase() === project.toUpperCase()) {
      return parsed;
    }
  }
  return null;
}

function findAllIndustrialProjects(): IndustrialProjectSummary[] {
  return listCanonicalIndustrialProjects(SGPI_PATHS);
}

function buildPieceSummary(item: CutListItem & { pieceName: string }, pieceJson: PieceJson | null): IndustrialPieceSummary {
  const summary = pieceJson ? pieceSummaryFromJson(pieceJson) : null;
  return {
    pieceName: item.pieceName,
    pieceRef: item.pieceName,
    qr: pieceJson?.qr ?? item.shortCode,
    material: pieceJson?.material ?? item.material ?? '—',
    thickness: pieceJson?.thickness ?? item.espessura ?? 0,
    width: pieceJson?.width ?? item.dimensoes?.largura ?? 0,
    height: pieceJson?.height ?? item.dimensoes?.altura ?? 0,
    status: summary?.status ?? pieceStatus(pieceJson),
    progressPercent: summary?.progressPercent ?? 0,
    operationsDone: summary?.operationsDone ?? 0,
    operationsTotal: summary?.operationsTotal ?? 8,
    alertCount: summary?.alertCount ?? 0,
  };
}

function lookupQr(qrCode: string): QrLookupResult | null {
  const needle = qrCode.toLowerCase();
  for (const file of listProjectFiles()) {
    const record = readJsonFile<SavedProject>(file);
    if (!record) continue;
    const parsed = parseProject(record);
    if (!parsed) continue;

    for (const box of parsed.boxes) {
      for (const item of box.items) {
        const pn = pieceNameFromItem(item);
        const pj = readPieceJson(parsed.user, parsed.project, box.boxSlug, pn);
        const qr = pj?.qr ?? item.shortCode;
        if (qr && qr.toLowerCase() === needle) {
          return { user: parsed.user, project: parsed.project, box: box.boxSlug, pieceName: pn, qr };
        }
      }
    }
  }

  if (!fs.existsSync(PROJETOS_ROOT)) return null;
  for (const user of fs.readdirSync(PROJETOS_ROOT)) {
    if (user.startsWith('_')) continue;
    const userPath = path.join(PROJETOS_ROOT, user);
    if (!fs.statSync(userPath).isDirectory()) continue;
    for (const project of fs.readdirSync(userPath)) {
      if (project.startsWith('_') || project === 'project-meta.json') continue;
      const projectPath = path.join(userPath, project);
      if (!fs.statSync(projectPath).isDirectory()) continue;
      for (const box of fs.readdirSync(projectPath)) {
        if (box.startsWith('_')) continue;
        const boxPath = path.join(projectPath, box);
        if (!fs.statSync(boxPath).isDirectory()) continue;
        for (const pieceDir of fs.readdirSync(boxPath)) {
          const pj = readJsonFile<PieceJson>(path.join(boxPath, pieceDir, 'piece.json'));
          if (pj?.qr && pj.qr.toLowerCase() === needle) {
            return { user, project, box, pieceName: pieceDir, qr: pj.qr };
          }
        }
      }
    }
  }
  return null;
}

export function createIndustrialRouter(): Router {
  const router = Router();

  router.get('/projects', (_req, res) => {
    res.json({ projects: findAllIndustrialProjects() });
  });

  router.post('/sgpi/prepare', (req, res) => {
    const body = req.body as {
      ownerName?: string;
      ownerId?: string;
      projectDisplayName?: string;
      sourceProjectId?: string | null;
    };
    const prepared = prepareIndustrialProject(SGPI_PATHS, {
      ownerName: body.ownerName,
      ownerId: body.ownerId,
      projectDisplayName: body.projectDisplayName ?? 'Projeto',
      sourceProjectId: body.sourceProjectId ?? null,
    });
    res.json({ ok: true, prepared });
  });

  router.post('/sgpi/register', async (req, res) => {
    const body = req.body as {
      prepared?: SgpiPrepareResult;
      sourceProjectId?: string | null;
      projectRecord?: SavedProject;
    };
    const prepared = body.prepared;
    if (!prepared) {
      res.status(400).json({ error: 'prepared obrigatório' });
      return;
    }

    const sourceId = body.sourceProjectId ?? prepared.sourceProjectId;
    if (body.projectRecord?.id) {
      writeCachedProject(body.projectRecord);
    } else if (sourceId) {
      await fetchAndCacheRemoteProject(sourceId);
    }

    const meta = registerOrUpdateProject(SGPI_PATHS, {
      ...prepared,
      sourceProjectId: sourceId,
    });
    res.json({ ok: true, meta });
  });

  router.get('/qr/:qrCode', (req, res) => {
    const result = lookupQr(decodeURIComponent(req.params.qrCode));
    if (!result) {
      res.status(404).json({ error: 'QR não encontrado' });
      return;
    }
    res.json(result);
  });

  router.get('/projects/:user/:project', (req, res) => {
    const user = decodeURIComponent(req.params.user);
    const project = decodeURIComponent(req.params.project);
    const parsed = findParsedProject(user, project);
    if (!parsed) {
      res.status(404).json({ error: 'Projeto não encontrado' });
      return;
    }

    const boxInputs = parsed.boxes.map((box) => {
      const pieceJsons: PieceJson[] = [];
      for (const item of box.items) {
        const pn = pieceNameFromItem(item);
        const pj = ensurePieceJson(parsed, box.boxSlug, pn);
        if (pj) pieceJsons.push(pj);
      }
      return {
        boxSlug: box.boxSlug,
        boxId: box.boxId,
        boxName: box.boxName,
        pieceCount: box.items.length,
        pieceJsons,
      };
    });

    const dashboard = buildProjectDashboard(
      {
        user: parsed.user,
        project: parsed.project,
        projectId: parsed.record.id,
        projectDisplayName: parsed.projectDisplayName,
      },
      boxInputs
    );
    res.json(dashboard);
  });

  router.get('/projects/:user/:project/:boxSlug', (req, res) => {
    const user = decodeURIComponent(req.params.user);
    const project = decodeURIComponent(req.params.project);
    const boxSlug = decodeURIComponent(req.params.boxSlug);
    const parsed = findParsedProject(user, project);
    if (!parsed) {
      res.status(404).json({ error: 'Projeto não encontrado' });
      return;
    }

    const box = parsed.boxes.find((b) => b.boxSlug.toUpperCase() === boxSlug.toUpperCase());
    if (!box) {
      res.status(404).json({ error: 'Caixa não encontrada' });
      return;
    }

    const pieces = box.items.map((item) => {
      const pn = pieceNameFromItem(item);
      const pj = ensurePieceJson(parsed, box.boxSlug, pn);
      return buildPieceSummary({ ...item, pieceName: pn }, pj);
    });

    const detail: BoxDetail = {
      user: parsed.user,
      project: parsed.project,
      projectId: parsed.record.id,
      boxSlug: box.boxSlug,
      boxName: box.boxName,
      pieces,
    };
    res.json(detail);
  });

  router.get('/projects/:user/:project/:boxSlug/:pieceName', (req, res) => {
    const user = decodeURIComponent(req.params.user);
    const project = decodeURIComponent(req.params.project);
    const boxSlug = decodeURIComponent(req.params.boxSlug);
    const pieceName = decodeURIComponent(req.params.pieceName);
    const parsed = findParsedProject(user, project);
    if (!parsed) {
      res.status(404).json({ error: 'Projeto não encontrado' });
      return;
    }

    const box = parsed.boxes.find((b) => b.boxSlug.toUpperCase() === boxSlug.toUpperCase());
    if (!box) {
      res.status(404).json({ error: 'Caixa não encontrada' });
      return;
    }

    const item = box.items.find((i) => pieceNameFromItem(i).toUpperCase() === pieceName.toUpperCase());
    if (!item) {
      res.status(404).json({ error: 'Peça não encontrada' });
      return;
    }

    const pj = ensurePieceJson(parsed, box.boxSlug, pieceName);
    if (!pj) {
      res.status(404).json({ error: 'Peça não encontrada' });
      return;
    }

    const response: PieceDetailResponse = {
      user: parsed.user,
      project: parsed.project,
      projectId: parsed.record.id,
      boxSlug: box.boxSlug,
      boxName: box.boxName,
      pieceJson: normalizePieceJson(pj),
      sourceItemId: item.id,
    };
    res.json(response);
  });

  router.put('/projects/:user/:project/:boxSlug/:pieceName/piece.json', (req, res) => {
    const user = decodeURIComponent(req.params.user);
    const project = decodeURIComponent(req.params.project);
    const boxSlug = decodeURIComponent(req.params.boxSlug);
    const pieceName = decodeURIComponent(req.params.pieceName);
    const parsed = findParsedProject(user, project);
    if (!parsed) {
      res.status(404).json({ error: 'Projeto não encontrado' });
      return;
    }

    const parsedJson = applyPieceUpdate(normalizePieceJson(req.body as PieceJson));
    writeJsonFile(pieceJsonPath(parsed.user, parsed.project, boxSlug, pieceName), parsedJson);
    res.json({ ok: true, pieceJson: parsedJson });
  });

  router.get('/projects/:user/:project/supervisor', (req, res) => {
    const user = decodeURIComponent(req.params.user);
    const project = decodeURIComponent(req.params.project);
    const parsed = findParsedProject(user, project);
    if (!parsed) {
      res.status(404).json({ error: 'Projeto não encontrado' });
      return;
    }

    const boxInputs = parsed.boxes.map((box) => {
      const pieceJsons: PieceJson[] = [];
      for (const item of box.items) {
        const pn = pieceNameFromItem(item);
        const pj = ensurePieceJson(parsed, box.boxSlug, pn);
        if (pj) pieceJsons.push(normalizePieceJson(pj));
      }
      return { boxSlug: box.boxSlug, pieceJsons };
    });

    const snapshot = buildSupervisorSnapshot(
      {
        user: parsed.user,
        project: parsed.project,
        projectId: parsed.record.id,
        projectDisplayName: parsed.projectDisplayName,
      },
      boxInputs
    );
    res.json(snapshot);
  });

  router.post('/projects/:user/:project/:boxSlug/:pieceName/work-orders/:operation', (req, res) => {
    handlePieceMutation(req, res, (current, body) => {
      const operation = routeParam(req.params.operation) as OperationName;
      const payload = body as {
        action?: 'complete' | 'undo';
        user?: string;
        override?: boolean;
        notes?: string;
      };
      const result =
        payload.action === 'undo'
          ? undoWorkOrder(current, operation, { user: payload.user, notes: payload.notes })
          : completeWorkOrder(current, operation, {
              user: payload.user,
              override: payload.override,
              notes: payload.notes,
            });
      if (result.blocked) {
        res.status(409).json({ error: result.message, requiresOverride: result.requiresOverride });
        return null;
      }
      return result.piece;
    });
  });

  router.post('/projects/:user/:project/:boxSlug/:pieceName/sessions', (req, res) => {
    handlePieceMutation(req, res, (current, body) => {
      const payload = body as { action?: 'start' | 'end'; user?: string };
      return payload.action === 'end' ? endActiveSession(current) : startSession(current, payload.user);
    });
  });

  router.post('/projects/:user/:project/:boxSlug/:pieceName/quality', (req, res) => {
    handlePieceMutation(req, res, (current, body) => {
      const payload = body as {
        decision: 'approved' | 'rework' | 'rejected';
        points?: import('../vendor/industrial/quality/types.js').QualityInspectionPoint[];
        inspectorId?: string;
        reason?: string;
        notes?: string;
      };
      return registerQualityInspection(current, payload, payload.inspectorId);
    });
  });

  router.post('/projects/:user/:project/:boxSlug/:pieceName/rework', (req, res) => {
    handlePieceMutation(req, res, (current, body) => {
      const payload = body as {
        reason: string;
        origin?: 'quality' | 'operator' | 'cnc' | 'drill' | 'assembly' | 'packaging';
        fromOperationId?: string;
        toOperationId?: string;
        requestedBy?: string;
      };
      return createReworkOnPiece(current, payload, payload.requestedBy);
    });
  });

  router.post('/projects/:user/:project/:boxSlug/:pieceName/rework/:reworkId/resolve', (req, res) => {
    handlePieceMutation(req, res, (current, body) => {
      const reworkId = routeParam(req.params.reworkId);
      const payload = body as {
        status?: 'resolved' | 'rejected' | 'in_progress';
        resolvedBy?: string;
      };
      return updateReworkStatus(current, reworkId, payload.status ?? 'resolved', payload.resolvedBy);
    });
  });

  return router;
}

function routeParam(value: string | string[]): string {
  return decodeURIComponent(Array.isArray(value) ? value[0]! : value);
}

function handlePieceMutation(
  req: Request,
  res: Response,
  mutate: (current: PieceJson, body: unknown) => PieceJson | null
): void {
  const user = routeParam(req.params.user);
  const project = routeParam(req.params.project);
  const boxSlug = routeParam(req.params.boxSlug);
  const pieceName = routeParam(req.params.pieceName);
  const parsed = findParsedProject(user, project);
  if (!parsed) {
    res.status(404).json({ error: 'Projeto não encontrado' });
    return;
  }

  const box = parsed.boxes.find((b) => b.boxSlug.toUpperCase() === boxSlug.toUpperCase());
  if (!box) {
    res.status(404).json({ error: 'Caixa não encontrada' });
    return;
  }

  const current = ensurePieceJson(parsed, box.boxSlug, pieceName);
  if (!current) {
    res.status(404).json({ error: 'Peça não encontrada' });
    return;
  }

  const updated = mutate(current, req.body);
  if (updated === null) return;

  const normalized = applyPieceUpdate(normalizePieceJson(updated));
  writeJsonFile(pieceJsonPath(parsed.user, parsed.project, box.boxSlug, pieceName), normalized);
  res.json({ ok: true, pieceJson: normalized });
}

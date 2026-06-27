import fs from 'node:fs';
import path from 'node:path';

import { buildProjectDashboard, pieceSummaryFromJson } from './dashboardAggregator';
import { createDefaultWorkOrders, normalizePieceJson } from './pieceNormalizer';
import {
  boxToSlug,
  generateEtiquetaCode,
  pieceNameFromItem,
  toRouteSlug,
} from './pieceNaming';
import type { IndustrialProjectSummary, PieceJson, SyncStatus, TrackingStatus } from '../types/piece';

export type SgpiMode = 'CREATE' | 'UPDATE';

export interface ProjectMetadata {
  user: string;
  project: string;
  projectDisplayName: string;
  sourceProjectId: string | null;
  mode: SgpiMode;
  createdAt: string;
  updatedAt: string;
  pieceCount: number;
  completedPieces: number;
  progressPercent: number;
  syncStatus: SyncStatus;
}

export interface SgpiPrepareInput {
  ownerName?: string;
  ownerId?: string;
  projectDisplayName: string;
  sourceProjectId?: string | null;
}

export interface SgpiPrepareResult {
  mode: SgpiMode;
  user: string;
  project: string;
  projectDisplayName: string;
  sourceProjectId: string | null;
  targetProject: string;
}

export interface SgpiRegisterInput extends SgpiPrepareResult {
  sourceProjectId: string | null;
}

type RegistryFile = {
  sources: Record<string, { user: string; project: string }>;
};

type CutListItem = {
  id: string;
  nome?: string;
  tipo?: string;
  boxId?: string;
  material?: string;
  espessura?: number;
  dimensoes?: { largura?: number; altura?: number; profundidade?: number };
  drillHoles?: Array<{ x: number; y: number; diameter: number; depth: number; holeType?: string }>;
  shortCode?: string;
  pieceNumber?: number;
  metadata?: Record<string, unknown>;
};

type BoxModule = { id: string; nome?: string; cutList?: CutListItem[] };

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

export type ProjectManagerPaths = {
  projetosRoot: string;
  pimoProjectsRoot: string;
};

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

function registryPath(root: string): string {
  return path.join(root, '_sgpi', 'registry.json');
}

function projectMetaPath(root: string, user: string, project: string): string {
  return path.join(root, user, project, 'project-meta.json');
}

function projectDir(root: string, user: string, project: string): string {
  return path.join(root, user, project);
}

function pieceJsonPath(root: string, user: string, project: string, box: string, pieceName: string): string {
  return path.join(root, user, project, box, pieceName, 'piece.json');
}

function readRegistry(root: string): RegistryFile {
  return readJson<RegistryFile>(registryPath(root)) ?? { sources: {} };
}

function writeRegistry(root: string, registry: RegistryFile): void {
  writeJson(registryPath(root), registry);
}

function listProjectDirsForUser(root: string, user: string): string[] {
  const userDir = path.join(root, user);
  if (!fs.existsSync(userDir)) return [];
  return fs
    .readdirSync(userDir)
    .filter((name) => {
      if (name.startsWith('_') || name.startsWith('.')) return false;
      return fs.statSync(path.join(userDir, name)).isDirectory();
    });
}

/** Verifica se existe pasta/entrada em /PROJETOS/{USER}/{PROJECT}. */
export function checkIfProjectExists(
  paths: ProjectManagerPaths,
  user: string,
  projectName: string
): boolean {
  const userSlug = toRouteSlug(user);
  const projectSlug = toRouteSlug(projectName);
  return fs.existsSync(projectDir(paths.projetosRoot, userSlug, projectSlug));
}

/** Gera nome único: COZINHA_A → COZINHA_A_1 → COZINHA_A_2 … */
export function generateUniqueProjectName(
  paths: ProjectManagerPaths,
  user: string,
  projectName: string
): string {
  const userSlug = toRouteSlug(user);
  const base = toRouteSlug(projectName);
  const existing = new Set(listProjectDirsForUser(paths.projetosRoot, userSlug).map((n) => n.toUpperCase()));

  if (!existing.has(base.toUpperCase())) return base;

  let index = 1;
  while (existing.has(`${base}_${index}`.toUpperCase())) {
    index += 1;
  }
  return `${base}_${index}`;
}

function listSavedProjectFiles(pimoRoot: string): string[] {
  if (!fs.existsSync(pimoRoot)) return [];
  return fs
    .readdirSync(pimoRoot)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .map((f) => path.join(pimoRoot, f));
}

function findSavedProjectById(pimoRoot: string, id: string): SavedProject | null {
  for (const file of listSavedProjectFiles(pimoRoot)) {
    const record = readJson<SavedProject>(file);
    if (record?.id === id && !record.deleted) return record;
  }
  return null;
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

function parseSavedProject(record: SavedProject): ParsedProject | null {
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

function readProjectMetadata(paths: ProjectManagerPaths, user: string, project: string): ProjectMetadata | null {
  return readJson<ProjectMetadata>(projectMetaPath(paths.projetosRoot, user, project));
}

export function prepareIndustrialProject(
  paths: ProjectManagerPaths,
  input: SgpiPrepareInput
): SgpiPrepareResult {
  const user = toRouteSlug(input.ownerName ?? input.ownerId ?? 'UTILIZADOR');
  const baseSlug = toRouteSlug(input.projectDisplayName);
  const sourceProjectId = input.sourceProjectId ?? null;
  const registry = readRegistry(paths.projetosRoot);

  if (sourceProjectId && registry.sources[sourceProjectId]) {
    const mapped = registry.sources[sourceProjectId]!;
    return {
      mode: 'UPDATE',
      user: mapped.user,
      project: mapped.project,
      projectDisplayName: input.projectDisplayName,
      sourceProjectId,
      targetProject: mapped.project,
    };
  }

  if (sourceProjectId) {
    const metaDir = listProjectDirsForUser(paths.projetosRoot, user).find((dir) => {
      const meta = readProjectMetadata(paths, user, dir);
      return meta?.sourceProjectId === sourceProjectId;
    });
    if (metaDir) {
      return {
        mode: 'UPDATE',
        user,
        project: metaDir,
        projectDisplayName: input.projectDisplayName,
        sourceProjectId,
        targetProject: metaDir,
      };
    }

    const baseExists = checkIfProjectExists(paths, user, baseSlug);
    if (baseExists) {
      const metaOnBase = readProjectMetadata(paths, user, baseSlug);
      if (!metaOnBase || metaOnBase.sourceProjectId === sourceProjectId) {
        return {
          mode: metaOnBase ? 'UPDATE' : 'CREATE',
          user,
          project: baseSlug,
          projectDisplayName: input.projectDisplayName,
          sourceProjectId,
          targetProject: baseSlug,
        };
      }
      const targetProject = generateUniqueProjectName(paths, user, baseSlug);
      return {
        mode: 'CREATE',
        user,
        project: targetProject,
        projectDisplayName: input.projectDisplayName,
        sourceProjectId,
        targetProject,
      };
    }

    return {
      mode: 'CREATE',
      user,
      project: baseSlug,
      projectDisplayName: input.projectDisplayName,
      sourceProjectId,
      targetProject: baseSlug,
    };
  }

  const baseExists = checkIfProjectExists(paths, user, baseSlug);
  const targetProject = baseExists ? generateUniqueProjectName(paths, user, baseSlug) : baseSlug;
  return {
    mode: 'CREATE',
    user,
    project: targetProject,
    projectDisplayName: input.projectDisplayName,
    sourceProjectId,
    targetProject,
  };
}

function extractHoles(item: CutListItem) {
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

function inferOrla(item: CutListItem): PieceJson['orla'] {
  const tipo = String(item.tipo ?? '').toLowerCase();
  const noOrla = tipo.includes('costa') || tipo === 'fundo' || tipo === 'cos';
  if (noOrla) return { hasOrla: false, edges: [], type: '' };
  return { hasOrla: true, edges: ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'], type: 'PVC_1mm' };
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

function mergePieceFromCutlist(existing: PieceJson, item: CutListItem & { pieceName: string; boxName: string }, projectDisplayName: string, pieceIndex: number): PieceJson {
  const fresh = buildInitialPieceJson(item, projectDisplayName, pieceIndex);
  return normalizePieceJson({
    ...fresh,
    pieceStatus: existing.pieceStatus,
    progressPercent: existing.progressPercent,
    lastOperation: existing.lastOperation,
    lastUpdatedAt: existing.lastUpdatedAt ?? new Date().toISOString(),
    lastUpdatedBy: existing.lastUpdatedBy,
    workOrders: existing.workOrders,
    logs: existing.logs,
    sessions: existing.sessions,
    notes: existing.notes,
    anomalies: existing.anomalies,
    alerts: existing.alerts,
    qualityInspections: existing.qualityInspections,
    reworkRequests: existing.reworkRequests,
    intelligence: existing.intelligence,
    qr: existing.qr || fresh.qr,
    syncStatus: existing.syncStatus ?? 'OUT_OF_SYNC',
    syncedAt: existing.syncedAt,
    source: existing.source ?? 'LOCAL',
    factoryId: existing.factoryId ?? 'F1',
  });
}

export function updateProjectMetadata(
  paths: ProjectManagerPaths,
  meta: Omit<ProjectMetadata, 'updatedAt'> & { updatedAt?: string }
): ProjectMetadata {
  const now = meta.updatedAt ?? new Date().toISOString();
  const payload: ProjectMetadata = { ...meta, updatedAt: now };
  writeJson(projectMetaPath(paths.projetosRoot, meta.user, meta.project), payload);
  return payload;
}

export function registerOrUpdateProject(
  paths: ProjectManagerPaths,
  prepared: SgpiRegisterInput
): ProjectMetadata {
  const { user, targetProject, sourceProjectId, projectDisplayName, mode } = prepared;

  let saved: SavedProject | null = null;
  if (sourceProjectId) {
    saved = findSavedProjectById(paths.pimoProjectsRoot, sourceProjectId);
  }
  if (!saved) {
    for (const file of listSavedProjectFiles(paths.pimoProjectsRoot)) {
      const record = readJson<SavedProject>(file);
      if (!record || record.deleted) continue;
      const parsed = parseSavedProject(record);
      if (!parsed) continue;
      if (
        parsed.user.toUpperCase() === user.toUpperCase() &&
        toRouteSlug(parsed.projectDisplayName).toUpperCase() === toRouteSlug(projectDisplayName).toUpperCase()
      ) {
        saved = record;
        break;
      }
    }
  }

  const parsed = saved ? parseSavedProject(saved) : null;
  if (!parsed || parsed.allItems.length === 0) {
    const existingMeta = readProjectMetadata(paths, user, targetProject);
    if (existingMeta) return existingMeta;
    return updateProjectMetadata(paths, {
      user,
      project: targetProject,
      projectDisplayName,
      sourceProjectId,
      mode,
      createdAt: new Date().toISOString(),
      pieceCount: 0,
      completedPieces: 0,
      progressPercent: 0,
      syncStatus: 'OUT_OF_SYNC',
    });
  }

  fs.mkdirSync(projectDir(paths.projetosRoot, user, targetProject), { recursive: true });

  const pieceJsons: PieceJson[] = [];
  for (const item of parsed.allItems) {
    const existing = readJson<PieceJson>(
      pieceJsonPath(paths.projetosRoot, user, targetProject, item.boxSlug, item.pieceName)
    );
    const pieceIndex = parsed.allItems.indexOf(item);
    const enriched = { ...item, boxName: item.boxName, pieceName: item.pieceName };
    const next = existing
      ? mergePieceFromCutlist(normalizePieceJson(existing), enriched, parsed.projectDisplayName, pieceIndex)
      : buildInitialPieceJson(enriched, parsed.projectDisplayName, pieceIndex);
    writeJson(pieceJsonPath(paths.projetosRoot, user, targetProject, item.boxSlug, item.pieceName), next);
    pieceJsons.push(next);
  }

  const completedPieces = pieceJsons.filter((p) => p.pieceStatus === 'DONE').length;
  const progressPercent =
    pieceJsons.length > 0
      ? Math.round(pieceJsons.reduce((s, p) => s + p.progressPercent, 0) / pieceJsons.length)
      : 0;

  const priorMeta = readProjectMetadata(paths, user, targetProject);
  const meta = updateProjectMetadata(paths, {
    user,
    project: targetProject,
    projectDisplayName: parsed.projectDisplayName,
    sourceProjectId: sourceProjectId ?? saved?.id ?? null,
    mode: priorMeta ? 'UPDATE' : mode,
    createdAt: priorMeta?.createdAt ?? new Date().toISOString(),
    pieceCount: pieceJsons.length,
    completedPieces,
    progressPercent,
    syncStatus: priorMeta?.syncStatus ?? 'OUT_OF_SYNC',
  });

  const registry = readRegistry(paths.projetosRoot);
  const sid = sourceProjectId ?? saved?.id;
  if (sid) {
    registry.sources[sid] = { user, project: targetProject };
    writeRegistry(paths.projetosRoot, registry);
  }

  return meta;
}

export function listCanonicalIndustrialProjects(
  paths: ProjectManagerPaths
): IndustrialProjectSummary[] {
  const registry = readRegistry(paths.projetosRoot);
  const seenRoutes = new Set<string>();
  const out: IndustrialProjectSummary[] = [];

  const addFromMeta = (user: string, project: string, record?: SavedProject) => {
    const routeKey = `${user.toUpperCase()}/${project.toUpperCase()}`;
    if (seenRoutes.has(routeKey)) return;
    seenRoutes.add(routeKey);

    const meta = readProjectMetadata(paths, user, project);
    if (!meta && !record) return;

    let pieceJsons: PieceJson[] = [];
    const projectPath = projectDir(paths.projetosRoot, user, project);
    if (fs.existsSync(projectPath)) {
      for (const box of fs.readdirSync(projectPath)) {
        if (box.startsWith('_') || box === 'project-meta.json') continue;
        const boxPath = path.join(projectPath, box);
        if (!fs.statSync(boxPath).isDirectory()) continue;
        for (const pieceName of fs.readdirSync(boxPath)) {
          const pj = readJson<PieceJson>(path.join(boxPath, pieceName, 'piece.json'));
          if (pj) pieceJsons.push(normalizePieceJson(pj));
        }
      }
    }

    const completedPieces = pieceJsons.filter((p) => p.pieceStatus === 'DONE').length;
    const progressPercent =
      meta?.progressPercent ??
      (pieceJsons.length > 0
        ? Math.round(pieceJsons.reduce((s, p) => s + p.progressPercent, 0) / pieceJsons.length)
        : 0);

    out.push({
      user,
      project,
      projectId: meta?.sourceProjectId ?? record?.id ?? `${user}_${project}`,
      projectDisplayName: meta?.projectDisplayName ?? project,
      ownerName: record?.ownerName ?? user,
      boxCount: new Set(pieceJsons.map((p) => p.pieceName)).size,
      pieceCount: meta?.pieceCount ?? pieceJsons.length,
      completedPieces: meta?.completedPieces ?? completedPieces,
      progressPercent,
      updatedAt: meta?.updatedAt ?? record?.updatedAt ?? new Date().toISOString(),
    });
  };

  for (const file of listSavedProjectFiles(paths.pimoProjectsRoot)) {
    const record = readJson<SavedProject>(file);
    if (!record?.snapshot?.projectState) continue;
    const items = aggregateCutlist(record);
    const hasIndustrial = items.some(
      (i) => Boolean(i.shortCode) || Boolean(i.drillHoles?.length) || Boolean(i.metadata?.industrialLabel)
    );
    if (!hasIndustrial) continue;

    const mapped = registry.sources[record.id];
    if (mapped) {
      addFromMeta(mapped.user, mapped.project, record);
      continue;
    }

    const parsed = parseSavedProject(record);
    if (!parsed) continue;

    const metaDir = listProjectDirsForUser(paths.projetosRoot, parsed.user).find((dir) => {
      const meta = readProjectMetadata(paths, parsed.user, dir);
      return meta?.sourceProjectId === record.id;
    });
    if (metaDir) {
      addFromMeta(parsed.user, metaDir, record);
      continue;
    }

    const routeKey = `${parsed.user.toUpperCase()}/${parsed.project.toUpperCase()}`;
    if (seenRoutes.has(routeKey)) continue;
    seenRoutes.add(routeKey);

    const pieceJsons: PieceJson[] = [];
    for (const item of parsed.allItems) {
      const pj = readJson<PieceJson>(
        pieceJsonPath(paths.projetosRoot, parsed.user, parsed.project, item.boxSlug, item.pieceName)
      );
      if (pj) pieceJsons.push(normalizePieceJson(pj));
    }
    const completedPieces = pieceJsons.filter((p) => p.pieceStatus === 'DONE').length;
    const progressPercent =
      pieceJsons.length > 0
        ? Math.round(pieceJsons.reduce((s, p) => s + p.progressPercent, 0) / pieceJsons.length)
        : 0;

    out.push({
      user: parsed.user,
      project: parsed.project,
      projectId: record.id,
      projectDisplayName: parsed.projectDisplayName,
      ownerName: record.ownerName ?? parsed.user,
      boxCount: parsed.boxes.length,
      pieceCount: parsed.allItems.length,
      completedPieces,
      progressPercent,
      updatedAt: record.updatedAt ?? new Date().toISOString(),
    });
  }

  for (const user of fs.existsSync(paths.projetosRoot) ? fs.readdirSync(paths.projetosRoot) : []) {
    if (user.startsWith('_')) continue;
    const userPath = path.join(paths.projetosRoot, user);
    if (!fs.statSync(userPath).isDirectory()) continue;
    for (const project of listProjectDirsForUser(paths.projetosRoot, user)) {
      addFromMeta(user, project);
    }
  }

  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function resolveIndustrialProject(
  paths: ProjectManagerPaths,
  user: string,
  project: string,
  sourceProjectId?: string | null
): { user: string; project: string; record: SavedProject | null; parsed: ParsedProject | null } | null {
  const registry = readRegistry(paths.projetosRoot);
  if (sourceProjectId && registry.sources[sourceProjectId]) {
    const mapped = registry.sources[sourceProjectId]!;
    const record = findSavedProjectById(paths.pimoProjectsRoot, sourceProjectId);
    const parsed = record ? parseSavedProject(record) : null;
    return { user: mapped.user, project: mapped.project, record, parsed };
  }

  for (const file of listSavedProjectFiles(paths.pimoProjectsRoot)) {
    const record = readJson<SavedProject>(file);
    if (!record || record.deleted) continue;
    const parsed = parseSavedProject(record);
    if (!parsed) continue;
    if (
      parsed.user.toUpperCase() === user.toUpperCase() &&
      parsed.project.toUpperCase() === project.toUpperCase()
    ) {
      const meta = listProjectDirsForUser(paths.projetosRoot, parsed.user).find((dir) => {
        const m = readProjectMetadata(paths, parsed.user, dir);
        return m?.sourceProjectId === record.id;
      });
      if (meta) {
        return { user: parsed.user, project: meta, record, parsed };
      }
      return { user: parsed.user, project: parsed.project, record, parsed };
    }
  }

  return null;
}

export function pieceStatus(pieceJson: PieceJson | null): TrackingStatus {
  if (!pieceJson) return 'PENDING';
  return pieceJson.pieceStatus;
}

export { parseSavedProject, pieceSummaryFromJson, buildProjectDashboard };

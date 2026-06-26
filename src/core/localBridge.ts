import fs from 'fs';
import path from 'path';

import { LOCAL_PROJETOS_ROOT, LOCAL_PIMO_PROJECTS } from '../paths.js';
import type { PieceRoute, QrLookupResult } from '../types.js';

function readJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function toRouteSlug(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase() || 'X';
}

function pieceNameFromItem(item: { nome?: string; tipo?: string }): string {
  const tipo = String(item.tipo ?? '').trim();
  const map: Record<string, string> = {
    lateral_direita: 'LAT_DIR',
    lateral_esquerda: 'LAT_ESQ',
    cima: 'TOP',
    fundo: 'FND',
    COSTA: 'COS',
  };
  if (map[tipo]) return map[tipo]!;
  const nome = String(item.nome ?? '').trim();
  return nome ? toRouteSlug(nome) : 'PECA';
}

function boxToSlug(boxName: string, index: number): string {
  const match = String(boxName).match(/\b(\d+)\s*$/);
  if (match) return `C${match[1]}`;
  return `C${index + 1}`;
}

function generateEtiquetaCode(projectName: string, boxName: string, pieceName: string, n: number): string {
  const low = (s: string) => String(s || '').toLowerCase().replace(/\s/g, '');
  const proj = low(projectName).slice(0, 5).padEnd(3, 'x');
  const box = low(boxName).slice(0, 2).padEnd(2, 'x');
  const piece = low(pieceName).slice(0, 3).padEnd(3, 'x');
  const num = n < 10 ? String(n).padStart(2, '0') : String(n).padStart(3, '0');
  return `${proj}${box}${piece}${num}`.slice(0, 14);
}

type CutItem = {
  id?: string;
  nome?: string;
  tipo?: string;
  boxId?: string;
  shortCode?: string;
  pieceNumber?: number;
  dimensoes?: { largura?: number; altura?: number };
  espessura?: number;
  material?: string;
  drillHoles?: unknown[];
  metadata?: Record<string, unknown>;
};

type SavedProject = {
  id: string;
  name: string;
  ownerName?: string;
  snapshot?: {
    projectState?: {
      projectName?: string;
      cutList?: CutItem[];
      boxes?: Array<{ id: string; nome?: string; cutList?: CutItem[] }>;
    };
  };
};

function listProjectFiles(): string[] {
  if (!fs.existsSync(LOCAL_PIMO_PROJECTS)) return [];
  return fs
    .readdirSync(LOCAL_PIMO_PROJECTS)
    .filter((f: string) => f.endsWith('.json') && f !== 'index.json')
    .map((f: string) => path.join(LOCAL_PIMO_PROJECTS, f));
}

export function lookupQrLocal(qrCode: string): QrLookupResult | null {
  const needle = qrCode.toLowerCase();

  for (const file of listProjectFiles()) {
    const record = readJson<SavedProject>(file);
    if (!record?.snapshot?.projectState) continue;
    const state = record.snapshot.projectState;
    const user = toRouteSlug(record.ownerName ?? 'UTILIZADOR');
    const project = toRouteSlug(state.projectName ?? record.name);
    const boxes = state.boxes ?? [];
    const cutList = state.cutList?.length
      ? state.cutList
      : boxes.flatMap((b, i) =>
          (b.cutList ?? []).map((item) => ({
            ...item,
            boxId: item.boxId ?? b.id,
            _boxNome: b.nome ?? `Caixa ${i + 1}`,
          }))
        );

    for (let idx = 0; idx < cutList.length; idx++) {
      const item = cutList[idx]!;
      const boxId = item.boxId ?? boxes[0]?.id ?? 'default';
      const boxIndex = boxes.findIndex((b) => b.id === boxId);
      const boxNome =
        (item as CutItem & { _boxNome?: string })._boxNome ??
        boxes[boxIndex]?.nome ??
        `Caixa ${boxIndex + 1}`;
      const boxSlug = boxToSlug(boxNome, boxIndex >= 0 ? boxIndex : 0);
      const pn = pieceNameFromItem(item);
      const qr =
        item.shortCode ??
        generateEtiquetaCode(state.projectName ?? record.name, boxNome, item.nome ?? pn, idx + 1);
      if (qr.toLowerCase() === needle) {
        return { user, project, box: boxSlug, pieceName: pn, qr, projectId: record.id };
      }
    }
  }

  if (fs.existsSync(LOCAL_PROJETOS_ROOT)) {
    for (const userDir of fs.readdirSync(LOCAL_PROJETOS_ROOT)) {
      const userPath = path.join(LOCAL_PROJETOS_ROOT, userDir);
      if (!fs.statSync(userPath).isDirectory()) continue;
      for (const projDir of fs.readdirSync(userPath)) {
        const projPath = path.join(userPath, projDir);
        if (!fs.statSync(projPath).isDirectory()) continue;
        for (const boxDir of fs.readdirSync(projPath)) {
          const boxPath = path.join(projPath, boxDir);
          if (!fs.statSync(boxPath).isDirectory()) continue;
          for (const pieceDir of fs.readdirSync(boxPath)) {
            const pjPath = path.join(boxPath, pieceDir, 'piece.json');
            const pj = readJson<{ qr?: string }>(pjPath);
            if (pj?.qr?.toLowerCase() === needle) {
              return {
                user: userDir,
                project: projDir,
                box: boxDir,
                pieceName: pieceDir,
                qr: pj.qr!,
              };
            }
          }
        }
      }
    }
  }

  return null;
}

export function readLocalPiece(route: PieceRoute): Record<string, unknown> | null {
  const filePath = path.join(
    LOCAL_PROJETOS_ROOT,
    route.user,
    route.project,
    route.box,
    route.pieceName,
    'piece.json'
  );
  return readJson(filePath);
}

export function writeLocalPiece(route: PieceRoute, piece: Record<string, unknown>): void {
  const dir = path.join(LOCAL_PROJETOS_ROOT, route.user, route.project, route.box, route.pieceName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'piece.json'), JSON.stringify(piece, null, 2), 'utf8');
}

export function listLocalPiecesForProject(user: string, project: string): Array<{ route: PieceRoute; piece: Record<string, unknown> }> {
  const out: Array<{ route: PieceRoute; piece: Record<string, unknown> }> = [];
  const base = path.join(LOCAL_PROJETOS_ROOT, user, project);
  if (!fs.existsSync(base)) return out;
  for (const box of fs.readdirSync(base)) {
    const boxPath = path.join(base, box);
    if (!fs.statSync(boxPath).isDirectory()) continue;
    for (const pieceName of fs.readdirSync(boxPath)) {
      const pj = readJson<Record<string, unknown>>(path.join(boxPath, pieceName, 'piece.json'));
      if (pj) {
        out.push({
          route: { user, project, box, pieceName },
          piece: pj,
        });
      }
    }
  }
  return out;
}

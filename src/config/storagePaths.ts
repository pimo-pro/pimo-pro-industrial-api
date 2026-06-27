import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, '../..');

/** Raiz de dados persistentes (Render disk / VPS volume). */
export const DATA_ROOT =
  process.env.DATA_ROOT?.trim() ||
  (process.env.RENDER ? path.join('/var/data', 'pimo-industrial') : path.join(API_ROOT, 'data'));

/** PROJETOS/{user}/{project}/… — estado MES local (piece.json, SGPI). */
export const PROJETOS_ROOT =
  process.env.PROJETOS_ROOT?.trim() || path.join(DATA_ROOT, 'PROJETOS');

/** Cache de projectos de design (JSON) — espelho de pimo.pro ou dev local. */
export const PIMO_PROJECTS_ROOT =
  process.env.PIMO_PROJECTS_ROOT?.trim() || path.join(DATA_ROOT, 'pimo-projects');

/** industrial-core/ — peças centrais, factories, workstations. */
export const INDUSTRIAL_CORE_ROOT =
  process.env.INDUSTRIAL_CORE_ROOT?.trim() || path.join(DATA_ROOT, 'industrial-core');

export const SGPI_PATHS = {
  projetosRoot: PROJETOS_ROOT,
  pimoProjectsRoot: PIMO_PROJECTS_ROOT,
};

export function ensureStorageDirs(): void {
  for (const dir of [DATA_ROOT, PROJETOS_ROOT, PIMO_PROJECTS_ROOT, INDUSTRIAL_CORE_ROOT]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.mkdirSync(path.join(PROJETOS_ROOT, '_sgpi'), { recursive: true });
}

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, '..');

export const INDUSTRIAL_CORE_ROOT = path.join(API_ROOT, 'industrial-core');
export const PIECES_ROOT = path.join(INDUSTRIAL_CORE_ROOT, 'pieces');
export const PROJECTS_ROOT = path.join(INDUSTRIAL_CORE_ROOT, 'projects');
export const FACTORIES_ROOT = path.join(INDUSTRIAL_CORE_ROOT, 'factories');
export const WORKSTATIONS_ROOT = path.join(INDUSTRIAL_CORE_ROOT, 'workstations');
export const EVENTS_LOG_PATH = path.join(INDUSTRIAL_CORE_ROOT, 'events', 'event-log.ndjson');

export const LOCAL_PROJETOS_ROOT = path.resolve(API_ROOT, '..', 'pimo-pro-industrial', 'data', 'PROJETOS');
export const LOCAL_PIMO_PROJECTS = path.resolve(API_ROOT, '..', 'pimo-criativo', 'data', 'projects');

export function pieceCentralPath(qr: string): string {
  const safe = qr.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return path.join(PIECES_ROOT, safe, 'piece.json');
}

export function projectCentralPath(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9-_]/g, '_');
  return path.join(PROJECTS_ROOT, safe, 'project.json');
}

export function factoryPath(factoryId: string): string {
  return path.join(FACTORIES_ROOT, factoryId, 'factory.json');
}

export function workstationPath(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9-_]/g, '_');
  return path.join(WORKSTATIONS_ROOT, safe, 'workstation.json');
}

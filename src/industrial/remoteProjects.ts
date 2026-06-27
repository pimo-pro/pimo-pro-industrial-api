import fs from 'node:fs';
import path from 'node:path';

import { PIMO_PROJECTS_ROOT } from '../config/storagePaths.js';

type RemoteProjectPayload = {
  id?: string;
  name?: string;
  ownerId?: string;
  ownerName?: string;
  snapshot?: unknown;
  deleted?: boolean;
};

const DEFAULT_PROJECTS_API =
  process.env.PIMO_PROJECTS_API_URL?.trim() || 'https://pimo.pro/api/projects/index.php';

function projectFilePath(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(PIMO_PROJECTS_ROOT, `project-${safe}.json`);
}

export function writeCachedProject(record: RemoteProjectPayload): void {
  const id = record.id?.trim();
  if (!id) return;
  fs.mkdirSync(PIMO_PROJECTS_ROOT, { recursive: true });
  fs.writeFileSync(projectFilePath(id), JSON.stringify(record, null, 2), 'utf8');
}

export function readCachedProject(id: string): RemoteProjectPayload | null {
  const file = projectFilePath(id);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as RemoteProjectPayload;
  } catch {
    return null;
  }
}

/** Obtém projecto de design da API pimo.pro e grava em cache local para SGPI. */
export async function fetchAndCacheRemoteProject(sourceProjectId: string): Promise<boolean> {
  if (!sourceProjectId.trim()) return false;

  const cached = readCachedProject(sourceProjectId);
  if (cached?.snapshot) return true;

  const url = `${DEFAULT_PROJECTS_API}?action=load&id=${encodeURIComponent(sourceProjectId)}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return false;
    const payload = (await res.json()) as { project?: RemoteProjectPayload; status?: string };
    const project = payload.project;
    if (!project?.id || !project.snapshot) return false;
    writeCachedProject(project);
    return true;
  } catch {
    return false;
  }
}

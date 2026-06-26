export type SyncStatus = 'IN_SYNC' | 'OUT_OF_SYNC' | 'CONFLICT' | 'SYNCING';
export type DataSource = 'LOCAL' | 'CENTRAL';

export interface PieceRoute {
  user: string;
  project: string;
  box: string;
  pieceName: string;
  projectId?: string;
}

export interface CentralPieceJson {
  pieceName: string;
  qr: string;
  material: string;
  thickness: number;
  width: number;
  height: number;
  holes: unknown[];
  orla: unknown;
  pieceStatus: string;
  progressPercent: number;
  lastOperation: string | null;
  lastUpdatedAt: string | null;
  lastUpdatedBy: string | null;
  workOrders: unknown[];
  logs: unknown[];
  sessions: unknown[];
  notes: unknown[];
  anomalies: unknown[];
  alerts: unknown[];
  intelligence?: unknown;
  factoryId: string;
  syncedAt: string;
  syncStatus: SyncStatus;
  source: DataSource;
  route: PieceRoute;
}

export interface FactoryJson {
  factoryId: string;
  nome: string;
  localizacao: string;
  funcionarios: string[];
  maquinas: string[];
  sessoesAtivas: number;
  produtividadeAgregada: number;
  updatedAt: string;
}

export interface ProjectCentralJson {
  projectId: string;
  user: string;
  project: string;
  projectDisplayName: string;
  pieceCount: number;
  progressPercent: number;
  factoryId: string;
  syncedAt: string;
  qrCodes: string[];
}

export interface SyncDiff {
  field: string;
  local: unknown;
  central: unknown;
}

export interface QrLookupResult {
  user: string;
  project: string;
  box: string;
  pieceName: string;
  qr: string;
  projectId?: string;
}

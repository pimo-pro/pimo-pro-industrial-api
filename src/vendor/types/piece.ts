export type TrackingStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE';

export type OperationName =
  | 'NISTING'
  | 'MANUAL'
  | 'CNC'
  | 'DRILL'
  | 'ORLAR'
  | 'MONTAGEM'
  | 'EMBALAGEM'
  | 'LIMPEZAS';

export type WoStatus = 'PENDING' | 'DONE';
export type LogAction = 'START' | 'DONE' | 'UNDO' | 'OVERRIDE';
export type OrlaEdge = 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
export type AnomalySeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type AlertType = 'ALERTA' | 'AVISO' | 'ERRO' | 'INFO';
export type SyncStatus = 'IN_SYNC' | 'OUT_OF_SYNC' | 'CONFLICT' | 'SYNCING';
export type DataSource = 'LOCAL' | 'CENTRAL';

export type QualityDecision = 'approved' | 'rework' | 'rejected';
export type QualityInspectionPoint =
  | 'dimensions'
  | 'material'
  | 'drilling'
  | 'edge_band'
  | 'assembly'
  | 'packaging';

export interface QualityInspection {
  id: string;
  pieceId: string;
  decision: QualityDecision;
  points: QualityInspectionPoint[];
  inspectorId?: string;
  reason?: string;
  notes?: string;
  createdAt: string;
}

export type ReworkStatus = 'open' | 'in_progress' | 'resolved' | 'rejected';
export type ReworkOrigin = 'quality' | 'operator' | 'cnc' | 'drill' | 'assembly' | 'packaging';

export interface ReworkRequest {
  id: string;
  pieceId: string;
  reason: string;
  origin: ReworkOrigin;
  fromOperationId?: string;
  toOperationId?: string;
  status: ReworkStatus;
  requestedBy?: string;
  operatorId?: string;
  resolvedBy?: string;
  createdAt: string;
  updatedAt?: string;
  resolvedAt?: string;
}

export interface PieceHole {
  id: string;
  type: string;
  diameter: number;
  x: number;
  y: number;
  depth: number;
  confirmed?: boolean;
}

export interface PieceOrla {
  hasOrla: boolean;
  edges: OrlaEdge[];
  type: string;
}

export interface WorkOrder {
  operation: OperationName;
  status: WoStatus;
  required: boolean;
  doneAt: string | null;
  doneBy: string | null;
  override: boolean;
  notes: string;
}

export interface TrackingLogEntry {
  operation: OperationName;
  action: LogAction;
  timestamp: string;
  user: string;
  override: boolean;
  notes: string;
}

export interface PieceSession {
  sessionId: string;
  user: string;
  startedAt: string;
  endedAt: string | null;
  piecesWorked: string[];
  /** Fase 3 — métricas calculadas */
  activeMinutes?: number;
  idleMinutes?: number;
  operationsCompleted?: number;
  productivityPerHour?: number;
  avgMinutesPerPiece?: number;
}

export interface PieceNote {
  id: string;
  text: string;
  createdAt: string;
  author?: string;
}

export interface IndustrialAnomaly {
  anomalyCode: string;
  severity: AnomalySeverity;
  message: string;
  timestamp: string;
  operation?: OperationName;
}

export interface IndustrialAlert {
  type: AlertType;
  message: string;
  timestamp: string;
  operation?: OperationName;
  pieceName?: string;
  dismissed?: boolean;
}

export interface PieceIntelligence {
  estimatedMinutesRemaining: number;
  productivityScore: number;
  averageMinutesPerOperation: number;
  suggestions: string[];
}

/** @deprecated Fase 1 */
export interface LegacyTrackingOperation {
  name: OperationName;
  required: boolean;
  done: boolean;
  doneAt: string | null;
  doneBy: string | null;
}

/** @deprecated Fase 1 */
export interface LegacyTrackingLogEntry {
  operation: OperationName;
  user: string;
  startedAt: string;
  finishedAt: string | null;
  notes?: string;
  override?: boolean;
}

export interface PieceJson {
  pieceName: string;
  qr?: string;
  material: string;
  thickness: number;
  width: number;
  height: number;
  holes: PieceHole[];
  orla: PieceOrla;

  pieceStatus: TrackingStatus;
  progressPercent: number;
  lastOperation: OperationName | null;
  lastUpdatedAt: string | null;
  lastUpdatedBy: string | null;

  workOrders: WorkOrder[];
  logs: TrackingLogEntry[];
  sessions: PieceSession[];
  notes: PieceNote[];

  /** Fase 3 — inteligência industrial */
  anomalies: IndustrialAnomaly[];
  alerts: IndustrialAlert[];
  intelligence?: PieceIntelligence;

  /** Fase 5.3 — qualidade e retrabalho */
  qualityInspections?: QualityInspection[];
  reworkRequests?: ReworkRequest[];

  /** Fase 4 — sincronização central */
  factoryId?: string;
  syncedAt?: string | null;
  syncStatus?: SyncStatus;
  source?: DataSource;

  tracking?: {
    status: TrackingStatus;
    operations: LegacyTrackingOperation[];
    logs: LegacyTrackingLogEntry[];
  };
}

export interface IndustrialProjectSummary {
  user: string;
  project: string;
  projectId: string;
  projectDisplayName: string;
  ownerName: string;
  boxCount: number;
  pieceCount: number;
  completedPieces: number;
  progressPercent: number;
  updatedAt: string;
}

export interface IndustrialBoxSummary {
  boxSlug: string;
  boxId: string;
  boxName: string;
  pieceCount: number;
  completedPieces: number;
  pendingPieces: number;
  inProgressPieces: number;
  progressPercent: number;
}

export interface OperationStats {
  operation: OperationName;
  completedPieces: number;
  totalPieces: number;
  avgMinutes?: number;
}

export interface EmployeeStats {
  user: string;
  piecesWorked: number;
  totalMinutes: number;
  productivityPerHour: number;
  avgMinutesPerOperation?: number;
}

export interface PieceRiskItem {
  pieceName: string;
  boxSlug: string;
  reason: string;
  severity: AnomalySeverity;
}

export interface PieceFlagItem {
  pieceName: string;
  boxSlug: string;
  detail: string;
}

export interface FactorySummary {
  factoryId: string;
  nome: string;
  localizacao: string;
  sessoesAtivas: number;
  produtividadeAgregada: number;
}

export interface SyncSummary {
  inSync: number;
  outOfSync: number;
  conflict: number;
}

export interface PieceSyncItem {
  pieceName: string;
  boxSlug: string;
  qr?: string;
  syncStatus: SyncStatus;
  source?: DataSource;
  syncedAt?: string | null;
}

export interface ProjectDashboard {
  user: string;
  project: string;
  projectId: string;
  projectDisplayName: string;
  totalPieces: number;
  completedPieces: number;
  pendingPieces: number;
  inProgressPieces: number;
  progressPercent: number;
  totalWorkOrders: number;
  completedWorkOrders: number;
  totalWorkMinutes: number;
  boxes: IndustrialBoxSummary[];
  operationStats: OperationStats[];
  employeeStats: EmployeeStats[];
  /** Fase 3 */
  activeAlerts: IndustrialAlert[];
  anomalies: IndustrialAnomaly[];
  atRiskPieces: PieceRiskItem[];
  inconsistentPieces: PieceFlagItem[];
  overridePieces: PieceFlagItem[];
  /** Fase 4 */
  syncSummary: SyncSummary;
  factories: FactorySummary[];
  outOfSyncPieces: PieceSyncItem[];
  conflictPieces: PieceSyncItem[];
}

export interface IndustrialPieceSummary {
  pieceName: string;
  pieceRef: string;
  qr?: string;
  material: string;
  thickness: number;
  width: number;
  height: number;
  status: TrackingStatus;
  progressPercent: number;
  operationsDone: number;
  operationsTotal: number;
  alertCount?: number;
}

export interface BoxDetail {
  user: string;
  project: string;
  projectId: string;
  boxSlug: string;
  boxName: string;
  pieces: IndustrialPieceSummary[];
}

export interface PieceDetailResponse {
  user: string;
  project: string;
  projectId: string;
  boxSlug: string;
  boxName: string;
  pieceJson: PieceJson;
  sourceItemId?: string;
}

export interface QrLookupResult {
  user: string;
  project: string;
  box: string;
  pieceName: string;
  qr?: string;
  syncStatus?: SyncStatus;
}

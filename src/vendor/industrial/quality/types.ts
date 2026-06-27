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

export interface CreateQualityInspectionInput {
  decision: QualityDecision;
  points?: QualityInspectionPoint[];
  inspectorId?: string;
  reason?: string;
  notes?: string;
}

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

export interface CreateReworkInput {
  reason: string;
  origin?: ReworkOrigin;
  fromOperationId?: string;
  toOperationId?: string;
  requestedBy?: string;
  operatorId?: string;
}

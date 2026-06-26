export type IndustrialEventType =
  | 'piece.updated'
  | 'piece.synced'
  | 'piece.conflict'
  | 'piece.scanned'
  | 'project.updated'
  | 'session.started'
  | 'session.ended'
  | 'workstation.heartbeat'
  | 'workstation.online'
  | 'workstation.offline'
  | 'workstation.assigned'
  | 'machine.jobStarted'
  | 'machine.jobFinished'
  | 'operator.sessionStarted'
  | 'operator.sessionEnded';

export interface IndustrialEvent {
  id: string;
  type: IndustrialEventType;
  timestamp: string;
  payload: Record<string, unknown>;
}

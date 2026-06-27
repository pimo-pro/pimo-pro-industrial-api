import type { LogAction, OperationName, TrackingLogEntry } from '../types/piece';

export function appendLog(
  logs: TrackingLogEntry[],
  entry: {
    operation: OperationName;
    action: LogAction;
    user: string;
    override?: boolean;
    notes?: string;
    timestamp?: string;
  }
): TrackingLogEntry[] {
  return [
    ...logs,
    {
      operation: entry.operation,
      action: entry.action,
      timestamp: entry.timestamp ?? new Date().toISOString(),
      user: entry.user,
      override: entry.override ?? false,
      notes: entry.notes ?? '',
    },
  ];
}

export function logsTotalMinutes(logs: TrackingLogEntry[]): number {
  const doneLogs = logs.filter((l) => l.action === 'DONE');
  if (doneLogs.length < 2) return 0;
  const first = new Date(doneLogs[0]!.timestamp).getTime();
  const last = new Date(doneLogs[doneLogs.length - 1]!.timestamp).getTime();
  return Math.max(0, Math.round((last - first) / 60000));
}

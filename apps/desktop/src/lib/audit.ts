const ACTION_LABELS: Record<string, string> = {
  profile_created: 'Profile created',
  profile_updated: 'Profile updated',
  monitoring_run_started: 'Monitoring run started',
  monitoring_run_completed: 'Monitoring run completed',
  report_exported: 'Report exported',
  privacy_mode_set: 'Privacy mode changed',
  data_exported: 'Data exported',
  data_deleted: 'All local data deleted'
};

/** Turn an audit action key into a human-readable label. */
export function formatAuditAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ');
}

/** Format an ISO timestamp for display, falling back to the raw value. */
export function formatAuditTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toLocaleString();
}

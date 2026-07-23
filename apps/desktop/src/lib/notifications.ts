// Pure notification-decision logic, kept separate from the React/Tauri effect so it
// can be unit-tested without a DOM. Firstlight's stance is calm and non-alarmist:
// one quiet notification per check, never in the middle of the night, always optional.

// Quiet hours: no OS notifications late night / early morning.
export const QUIET_START_HOUR = 23; // 11pm
export const QUIET_END_HOUR = 8; // 8am

export function isQuietHours(now: Date): boolean {
  const hour = now.getHours();
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

export type NotificationDecision = {
  notify: boolean;
  // Run id to store as the "last notified" marker, or null to leave it unchanged.
  // Null during quiet hours so the alert can still fire once quiet hours end.
  advanceMarkerTo: number | null;
};

export function decideNotification(params: {
  latestRunId: number;
  hasFindings: boolean;
  lastNotifiedId: number;
  enabled: boolean;
  now: Date;
}): NotificationDecision {
  const { latestRunId, hasFindings, lastNotifiedId, enabled, now } = params;

  // First observation: set the baseline without notifying for historical runs.
  if (lastNotifiedId === 0) return { notify: false, advanceMarkerTo: latestRunId };

  // Nothing newer than what we've already handled.
  if (latestRunId <= lastNotifiedId) return { notify: false, advanceMarkerTo: null };

  // A newer completed run exists.
  if (!hasFindings) return { notify: false, advanceMarkerTo: latestRunId };
  if (!enabled) return { notify: false, advanceMarkerTo: latestRunId };
  if (isQuietHours(now)) return { notify: false, advanceMarkerTo: null };

  return { notify: true, advanceMarkerTo: latestRunId };
}

import { useEffect, useRef } from 'react';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

import { api } from './api';
import type { MonitoringRun } from './types';

const POLL_INTERVAL_MS = 60_000;
const LAST_NOTIFIED_RUN_KEY = 'firstlight.lastNotifiedRunId';

function latestCompletedRun(runs: MonitoringRun[]): MonitoringRun | null {
  let latest: MonitoringRun | null = null;
  for (const run of runs) {
    if (run.status !== 'completed') continue;
    if (!latest || run.id > latest.id) latest = run;
  }
  return latest;
}

function readLastNotifiedId(): number {
  const raw = window.localStorage.getItem(LAST_NOTIFIED_RUN_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function writeLastNotifiedId(runId: number) {
  window.localStorage.setItem(LAST_NOTIFIED_RUN_KEY, String(runId));
}

async function ensureNotificationPermission(): Promise<boolean> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const result = await requestPermission();
      granted = result === 'granted';
    }
    return granted;
  } catch {
    // Not running inside the Tauri shell (e.g. browser dev) — skip notifications.
    return false;
  }
}

function buildNotificationBody(run: MonitoringRun): string {
  const parts: string[] = [];
  if (run.new_findings_count > 0) {
    parts.push(`${run.new_findings_count} new`);
  }
  if (run.changed_findings_count > 0) {
    parts.push(`${run.changed_findings_count} changed`);
  }
  const summary = parts.length > 0 ? parts.join(' and ') : 'updated results';
  return `Background monitoring found ${summary}. Open Firstlight to review. Every finding still needs clinician review.`;
}

/**
 * Polls for completed monitoring runs and raises a native OS notification when a
 * new scheduled run surfaces findings. Runs while the webview is alive, including
 * when the window is hidden to the tray, so the user is alerted in the background.
 */
export function useBackgroundMonitoring() {
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    let timer: number | undefined;
    let permissionReady = false;

    async function poll() {
      try {
        const runs = await api.getRuns();
        const latest = latestCompletedRun(runs);
        if (!latest) return;

        const lastNotified = readLastNotifiedId();

        // First observation: set the baseline without notifying for history.
        if (lastNotified === 0) {
          writeLastNotifiedId(latest.id);
          return;
        }

        const hasFindings = latest.new_findings_count > 0 || latest.changed_findings_count > 0;
        if (latest.id > lastNotified && hasFindings) {
          if (!permissionReady) {
            permissionReady = await ensureNotificationPermission();
          }
          if (permissionReady) {
            sendNotification({
              title: 'Firstlight found new research',
              body: buildNotificationBody(latest),
            });
          }
          writeLastNotifiedId(latest.id);
        } else if (latest.id > lastNotified) {
          // Newer run with nothing new to surface — advance the marker quietly.
          writeLastNotifiedId(latest.id);
        }
      } catch {
        // Backend not ready or transient error — try again on the next tick.
      }
    }

    void poll();
    timer = window.setInterval(() => {
      if (!cancelled) void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, []);
}

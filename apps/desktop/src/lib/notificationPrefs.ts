import { useSyncExternalStore } from 'react';

// Whether Firstlight may raise OS notifications when a background check finds
// something new. Stored locally (a device preference, like the language mode), so
// it needs no backend round-trip and mirrors the useSyncExternalStore pattern in
// `languageMode.ts`. Defaults to on.

const STORAGE_KEY = 'firstlight.notificationsEnabled';

function readInitial(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

let current: boolean = readInitial();
const listeners = new Set<() => void>();

export function getNotificationsEnabled(): boolean {
  return current;
}

export function setNotificationsEnabled(enabled: boolean): void {
  current = enabled;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Best-effort persistence; the in-memory value still drives the UI.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNotificationsEnabled(): boolean {
  return useSyncExternalStore(subscribe, () => current, () => current);
}

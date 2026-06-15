import { useSyncExternalStore } from 'react';

export type LanguageMode = 'plain' | 'clinical';

const STORAGE_KEY = 'firstlight.languageMode';

function readInitial(): LanguageMode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'clinical' ? 'clinical' : 'plain';
  } catch {
    return 'plain';
  }
}

let current: LanguageMode = readInitial();
const listeners = new Set<() => void>();

export function setLanguageMode(mode: LanguageMode): void {
  current = mode;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Persistence is best-effort; the in-memory value still drives the UI.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLanguageMode(): LanguageMode {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current
  );
}

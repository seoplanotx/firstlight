/** Open an https URL in the user's default browser (Tauri shell when available, window.open in dev). */
export async function openExternal(url: string): Promise<void> {
  if (!url.startsWith('https://')) {
    return;
  }
  try {
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(url);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Open a locally saved file or its containing folder with the OS default handler
 * via the Tauri shell. Returns false when it is not available (e.g. dev browser),
 * so callers can fall back to showing the path.
 */
export async function openLocalPath(path: string): Promise<boolean> {
  if (!path) return false;
  try {
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(path);
    return true;
  } catch {
    return false;
  }
}

/** The containing directory of a file path (handles both POSIX and Windows separators). */
export function fileDirectory(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return idx > 0 ? path.slice(0, idx) : path;
}

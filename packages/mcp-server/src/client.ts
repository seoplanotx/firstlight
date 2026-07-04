// Thin HTTP client for the Firstlight local MCP gateway.
//
// This module only ever talks to the dedicated, consent-gated read-only
// namespace (/api/mcp) on 127.0.0.1 — never to the app's other local routes.

export const NOT_RUNNING_MESSAGE =
  "Firstlight isn't running. Open the Firstlight app (it lives in the menu bar / system tray) and try again.";

export const ACCESS_OFF_MESSAGE =
  'Claude Desktop access is turned off in Firstlight. Turn it on in Firstlight Settings → Claude Desktop connection.';

export const BAD_CODE_MESSAGE =
  "The connection code doesn't match. Generate a new code in Firstlight Settings → Claude Desktop connection, then update it in this extension's settings.";

function baseUrl(): string {
  const port = process.env.FIRSTLIGHT_API_PORT?.trim() || '17845';
  return `http://127.0.0.1:${port}/api/mcp`;
}

function authHeaders(): Record<string, string> {
  const token = process.env.FIRSTLIGHT_MCP_TOKEN?.trim() || '';
  return { Authorization: `Bearer ${token}` };
}

async function detailFrom(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === 'string' && body.detail.trim()) {
      return body.detail;
    }
  } catch {
    // Non-JSON error body; use the fallback.
  }
  return fallback;
}

export async function firstlightGet(
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<unknown> {
  const url = new URL(`${baseUrl()}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await fetch(url, { headers: authHeaders() });
  } catch {
    throw new Error(NOT_RUNNING_MESSAGE);
  }

  if (response.status === 403) {
    throw new Error(ACCESS_OFF_MESSAGE);
  }
  if (response.status === 401) {
    throw new Error(BAD_CODE_MESSAGE);
  }
  if (response.status === 404 || response.status === 422) {
    throw new Error(await detailFrom(response, `Firstlight could not answer that (${response.status}).`));
  }
  if (!response.ok) {
    throw new Error(`Firstlight returned an unexpected error (${response.status}).`);
  }
  return response.json();
}

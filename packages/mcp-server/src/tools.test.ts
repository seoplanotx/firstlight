import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ACCESS_OFF_MESSAGE,
  BAD_CODE_MESSAGE,
  NOT_RUNNING_MESSAGE,
} from './client.js';
import {
  getDeidentifiedCaseContext,
  getFinding,
  getFirstlightStatus,
  listMonitoringRuns,
  listRecentFindings,
} from './tools.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('firstlight tools', () => {
  it('returns status payload as formatted JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ app_name: 'Firstlight', has_profile: true }));
    vi.stubGlobal('fetch', fetchMock);

    const text = await getFirstlightStatus();

    expect(JSON.parse(text)).toEqual({ app_name: 'Firstlight', has_profile: true });
    const url = fetchMock.mock.calls[0]![0] as URL;
    expect(url.toString()).toBe('http://127.0.0.1:17845/api/mcp/status');
  });

  it('sends the connection code as a bearer token and honors the port override', async () => {
    vi.stubEnv('FIRSTLIGHT_MCP_TOKEN', 'secret-code');
    vi.stubEnv('FIRSTLIGHT_API_PORT', '27845');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await listMonitoringRuns(5);

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('http://127.0.0.1:27845/api/mcp/runs?limit=5');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-code');
  });

  it('serializes findings filters and omits undefined ones', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ total: 0, items: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await listRecentFindings({ finding_type: 'clinical_trials', limit: 10 });

    const url = fetchMock.mock.calls[0]![0] as URL;
    expect(url.searchParams.get('finding_type')).toBe('clinical_trials');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.has('query')).toBe(false);
  });

  it('maps connection failures to the not-running message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('ECONNREFUSED')));

    await expect(getFirstlightStatus()).rejects.toThrow(NOT_RUNNING_MESSAGE);
  });

  it('maps 403 to the access-off message and 401 to the bad-code message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'off' }, 403)));
    await expect(getDeidentifiedCaseContext()).rejects.toThrow(ACCESS_OFF_MESSAGE);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'bad' }, 401)));
    await expect(getDeidentifiedCaseContext()).rejects.toThrow(BAD_CODE_MESSAGE);
  });

  it('surfaces backend detail messages for 404s', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ detail: 'No patient profile exists in Firstlight yet.' }, 404))
    );

    await expect(getFinding(99)).rejects.toThrow('No patient profile exists in Firstlight yet.');
  });
});

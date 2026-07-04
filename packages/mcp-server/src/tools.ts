import { firstlightGet } from './client.js';

// Handlers return the JSON payload from the local gateway as pretty-printed
// text. Everything is read-only; scope framing lives in the tool descriptions
// registered in index.ts.

export async function getFirstlightStatus(): Promise<string> {
  return JSON.stringify(await firstlightGet('/status'), null, 2);
}

export interface ListFindingsArgs {
  finding_type?: string;
  query?: string;
  limit?: number;
}

export async function listRecentFindings(args: ListFindingsArgs = {}): Promise<string> {
  const payload = await firstlightGet('/findings', {
    finding_type: args.finding_type,
    query: args.query,
    limit: args.limit,
  });
  return JSON.stringify(payload, null, 2);
}

export async function getFinding(findingId: number): Promise<string> {
  return JSON.stringify(await firstlightGet(`/findings/${findingId}`), null, 2);
}

export async function getDeidentifiedCaseContext(): Promise<string> {
  return JSON.stringify(await firstlightGet('/case-context'), null, 2);
}

export async function getLatestClinicianSummary(): Promise<string> {
  return JSON.stringify(await firstlightGet('/clinician-summary'), null, 2);
}

export async function listMonitoringRuns(limit?: number): Promise<string> {
  return JSON.stringify(await firstlightGet('/runs', { limit }), null, 2);
}

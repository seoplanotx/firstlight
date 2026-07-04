import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import {
  getDeidentifiedCaseContext,
  getFinding,
  getFirstlightStatus,
  getLatestClinicianSummary,
  listMonitoringRuns,
  listRecentFindings,
} from './tools.js';

function manifestVersion(): string {
  try {
    const manifest = JSON.parse(readFileSync(join(__dirname, '..', 'manifest.json'), 'utf-8')) as {
      version?: string;
    };
    return manifest.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

async function run(fn: () => Promise<string>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: await fn() }] };
  } catch (error) {
    return {
      content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
      isError: true,
    };
  }
}

const READ_ONLY = { readOnlyHint: true } as const;

const server = new McpServer({ name: 'firstlight', version: manifestVersion() });

server.registerTool(
  'get_firstlight_status',
  {
    title: 'Check Firstlight status',
    description:
      'Check the local Firstlight app: version, whether a patient profile exists, monitoring status, and which ' +
      'research sources are enabled. Firstlight is an information monitoring tool whose findings are for ' +
      'discussion with an oncology team — it never determines treatment or trial eligibility.',
    annotations: READ_ONLY,
  },
  () => run(() => getFirstlightStatus())
);

server.registerTool(
  'list_recent_findings',
  {
    title: 'List recent Firstlight findings',
    description:
      "List research findings Firstlight surfaced for the user's case: clinical trials, literature, and drug " +
      'updates from public sources, each with deterministic match rationale, cautions, and source links. ' +
      'Findings are leads for clinician review, never recommendations or eligibility determinations.',
    inputSchema: {
      finding_type: z
        .string()
        .optional()
        .describe("Filter by type: 'clinical_trials', 'literature', 'drug_updates', or 'biomarker'."),
      query: z.string().optional().describe('Free-text filter over titles and summaries.'),
      limit: z.number().int().min(1).max(50).optional().describe('Maximum findings to return (default 20).'),
    },
    annotations: READ_ONLY,
  },
  (args) => run(() => listRecentFindings(args))
);

server.registerTool(
  'get_finding',
  {
    title: 'Get one finding in detail',
    description:
      'Get one Firstlight finding in full detail by finding_id: source data, evidence snippets, why it surfaced, ' +
      'why it may not fit, and known gaps. Present the cautions together with the rationale — a finding is ' +
      'something to discuss with the oncology team, not medical advice.',
    inputSchema: {
      finding_id: z.number().int().describe('The finding_id from list_recent_findings.'),
    },
    annotations: READ_ONLY,
  },
  (args) => run(() => getFinding(args.finding_id))
);

server.registerTool(
  'get_deidentified_case_context',
  {
    title: 'Get de-identified case context',
    description:
      "Get the de-identified outline of the user's case, exactly as Firstlight's privacy boundary allows: cancer " +
      'type, coarse stage group, biomarkers, state-level location, and travel radius. Identifying details never ' +
      'cross this boundary. Use it to discuss findings concretely without asking the user to retype their situation.',
    annotations: READ_ONLY,
  },
  () => run(() => getDeidentifiedCaseContext())
);

server.registerTool(
  'get_latest_clinician_summary',
  {
    title: 'Get the clinician summary',
    description:
      "Get Firstlight's clinician-facing summary: prioritized trial and research findings, cautious discussion " +
      'questions, and known data gaps — the same content the user can bring to their oncology visit.',
    annotations: READ_ONLY,
  },
  () => run(() => getLatestClinicianSummary())
);

server.registerTool(
  'list_monitoring_runs',
  {
    title: 'List monitoring runs',
    description:
      'List recent Firstlight monitoring runs: when public research sources were checked and how many findings ' +
      'were new or changed.',
    inputSchema: {
      limit: z.number().int().min(1).max(50).optional().describe('Maximum runs to return (default 10).'),
    },
    annotations: READ_ONLY,
  },
  (args) => run(() => listMonitoringRuns(args.limit))
);

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();

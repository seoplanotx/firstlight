import type {
  AIProvider,
  AppSettings,
  AuditEvent,
  BootstrapInfo,
  ClinicianSummary,
  Dashboard,
  DataDeletionSummary,
  Finding,
  FindingAction,
  HealthResponse,
  McpAccessStatus,
  McpEnableResponse,
  MonitoringRun,
  OnboardingState,
  PatientProfile,
  PlainLanguageResponse,
  ProviderConfig,
  ReportExport,
  ReportList,
  ReportOutline,
  ReportType,
  SourceConfig
} from './types';

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:17845';

export class ApiError extends Error {
  status: number;
  body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function humanizeField(loc: unknown): string {
  if (!Array.isArray(loc)) return '';
  const field = [...loc].reverse().find((part) => typeof part === 'string' && part !== 'body');
  if (typeof field !== 'string') return '';
  const words = field.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// FastAPI validation errors (422) carry `detail` as a list of {loc, msg}.
// Turn them into a readable sentence instead of "Request failed: 422".
function validationMessage(detail: unknown[]): string {
  const parts = detail
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const { loc, msg } = item as { loc?: unknown; msg?: unknown };
      const message = typeof msg === 'string' ? msg.replace(/^Value error, /, '') : '';
      const field = humanizeField(loc);
      return field && message ? `${field}: ${message}` : message;
    })
    .filter(Boolean);
  return parts.length ? `Please check: ${parts.join('; ')}.` : '';
}

function errorMessageFromBody(body: unknown, fallback: string): string {
  if (typeof body === 'string' && body.trim()) {
    return body;
  }
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }
    if (Array.isArray(detail)) {
      const message = validationMessage(detail);
      if (message) return message;
    }
    if (detail && typeof detail === 'object' && 'message' in detail) {
      const message = (detail as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }
  }
  return fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    },
    ...init
  });

  if (!response.ok) {
    const fallback = `Request failed: ${response.status}`;
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await response.json();
      throw new ApiError(errorMessageFromBody(body, fallback), response.status, body);
    }

    const text = await response.text();
    throw new ApiError(errorMessageFromBody(text, fallback), response.status, text);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

/** Binary sibling of `request` — keeps `ApiError` and the backend's `detail` intact. */
async function requestBlob(path: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}/api${path}`);

  if (!response.ok) {
    const fallback = `Request failed: ${response.status}`;
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await response.json();
      throw new ApiError(errorMessageFromBody(body, fallback), response.status, body);
    }

    const text = await response.text();
    throw new ApiError(errorMessageFromBody(text, fallback), response.status, text);
  }

  return response.blob();
}

/** "8:30" / "08:30:00" → "08:30"; anything unparseable is passed through for the API to explain. */
export function normalizeRunTime(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return value;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return value;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

// Callers often spread the whole settings read model back into a PUT. Send only
// the fields the update schema accepts, with the run time in the strict HH:MM form.
const SETTINGS_UPDATE_KEYS = [
  'default_profile_id',
  'daily_run_time',
  'default_report_style',
  'default_report_length',
  'demo_profile_enabled',
  'privacy_mode',
  'deidentified_ai_disclosure_acknowledged',
  'active_ai_provider'
] as const;

export function toSettingsUpdate(payload: Partial<AppSettings>): Partial<AppSettings> {
  const update: Partial<AppSettings> = {};
  for (const key of SETTINGS_UPDATE_KEYS) {
    if (payload[key] !== undefined) {
      (update as Record<string, unknown>)[key] = payload[key];
    }
  }
  if (update.daily_run_time !== undefined) {
    update.daily_run_time = normalizeRunTime(update.daily_run_time);
  }
  return update;
}

export const api = {
  getBootstrap: () => request<BootstrapInfo>('/bootstrap'),
  getOnboardingState: () => request<OnboardingState>('/onboarding/state'),
  completeOnboarding: (payload: Record<string, unknown>) =>
    request<OnboardingState>('/onboarding/complete', { method: 'POST', body: JSON.stringify(payload) }),
  createDemoProfile: () => request<{ profile_id: number }>('/onboarding/demo-profile', { method: 'POST' }),

  getProfiles: () => request<PatientProfile[]>('/profiles'),
  getActiveProfile: () => request<PatientProfile | null>('/profiles/active'),
  createProfile: (payload: PatientProfile) => request<PatientProfile>('/profiles', { method: 'POST', body: JSON.stringify(payload) }),
  updateProfile: (id: number, payload: PatientProfile) =>
    request<PatientProfile>(`/profiles/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  getSettings: () => request<AppSettings>('/settings'),
  updateSettings: (payload: Partial<AppSettings>) =>
    request<AppSettings>('/settings', { method: 'PUT', body: JSON.stringify(toSettingsUpdate(payload)) }),
  getProviderConfig: (provider: AIProvider = 'openrouter') =>
    request<ProviderConfig | null>(`/settings/provider/${provider}`),
  saveProviderConfig: (provider: AIProvider, payload: Record<string, unknown>) =>
    request<ProviderConfig>(`/settings/provider/${provider}/save`, { method: 'POST', body: JSON.stringify(payload) }),
  testProviderKey: (provider: AIProvider, payload: Record<string, unknown>) =>
    request<{ ok: boolean; message: string; discovered_models: string[] }>(`/settings/provider/${provider}/test`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getProviderModels: (provider: AIProvider = 'openrouter') => request<string[]>(`/settings/provider/${provider}/models`),

  getMcpAccess: () => request<McpAccessStatus>('/settings/mcp'),
  enableMcpAccess: () => request<McpEnableResponse>('/settings/mcp/enable', { method: 'POST' }),
  disableMcpAccess: () => request<McpAccessStatus>('/settings/mcp/disable', { method: 'POST' }),

  getSources: () => request<SourceConfig[]>('/sources'),
  updateSource: (id: number, payload: Partial<SourceConfig>) =>
    request<SourceConfig>(`/sources/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  getHealth: () => request<HealthResponse>('/health'),
  getDashboard: () => request<Dashboard>('/dashboard'),
  triggerRun: (payload?: Record<string, unknown>) =>
    request<MonitoringRun>('/runs/trigger', { method: 'POST', body: JSON.stringify(payload || {}) }),
  getRuns: () => request<MonitoringRun[]>('/runs'),

  getFindings: (params?: { finding_type?: string; q?: string; profile_id?: number; include_dismissed?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.finding_type) query.set('finding_type', params.finding_type);
    if (params?.q) query.set('q', params.q);
    if (typeof params?.profile_id === 'number') query.set('profile_id', String(params.profile_id));
    if (params?.include_dismissed) query.set('include_dismissed', 'true');
    return request<{ total: number; items: Finding[] }>(`/findings${query.toString() ? `?${query.toString()}` : ''}`);
  },
  setFindingAction: (findingId: number, action: FindingAction) =>
    request<Finding>(`/findings/${findingId}/action`, { method: 'POST', body: JSON.stringify({ action }) }),
  generatePlainLanguage: (findingId: number) =>
    request<PlainLanguageResponse>(`/findings/${findingId}/plain-language`, { method: 'POST' }),
  setFindingActionsBulk: (findingIds: number[], action: FindingAction) =>
    request<{ total: number; items: Finding[] }>('/findings/actions/bulk', {
      method: 'POST',
      body: JSON.stringify({ finding_ids: findingIds, action })
    }),
  activateProfile: (id: number) => request<PatientProfile>(`/profiles/${id}/activate`, { method: 'POST' }),
  extractProfileFromText: (text: string, allowAi = false) =>
    request<{
      cancer_type?: string | null;
      subtype?: string | null;
      stage_or_context?: string | null;
      biomarkers: Array<{ name: string; variant?: string | null; status?: string | null; notes?: string | null }>;
      therapy_history: Array<{
        therapy_name: string;
        therapy_type?: string | null;
        line_of_therapy?: string | null;
        status?: string | null;
        notes?: string | null;
      }>;
      notes?: string | null;
      warnings: string[];
      ai_status: string;
      ai_message?: string | null;
    }>('/profiles/extract-from-text', { method: 'POST', body: JSON.stringify({ text, allow_ai: allowAi }) }),

  getClinicianSummary: (profileId?: number) =>
    request<ClinicianSummary>(
      `/clinician-summary${typeof profileId === 'number' ? `?profile_id=${profileId}` : ''}`
    ),

  getReports: () => request<ReportList>('/reports'),
  getReportPreview: (reportType: ReportType, profileId?: number) =>
    request<ReportOutline>(
      `/reports/preview?report_type=${reportType}${typeof profileId === 'number' ? `&profile_id=${profileId}` : ''}`
    ),
  generateReport: (payload: {
    report_type: ReportType;
    profile_id?: number;
    appointment_date?: string;
    appointment_clinician?: string;
  }) => request<ReportExport>('/reports/generate', { method: 'POST', body: JSON.stringify(payload) }),
  deleteReport: (reportId: number) => request<void>(`/reports/${reportId}`, { method: 'DELETE' }),
  downloadReport: (reportId: number) => requestBlob(`/reports/${reportId}/download`),

  getAuditLog: () => request<{ events: AuditEvent[] }>('/data/audit-log'),
  deleteAllData: () => request<DataDeletionSummary>('/data/delete', { method: 'POST' }),
  exportAllData: () => requestBlob('/data/export')
};

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportsPage } from './ReportsPage';
import { api } from '../lib/api';
import type { ClinicianSummary, ReportExport } from '../lib/types';

vi.mock('../lib/api', () => ({
  api: {
    getReports: vi.fn(),
    generateReport: vi.fn(),
    downloadReport: vi.fn(),
    getFindings: vi.fn(),
    getClinicianSummary: vi.fn()
  }
}));

const mockedApi = vi.mocked(api);

function buildReport(overrides: Partial<ReportExport> = {}): ReportExport {
  return {
    id: 1,
    report_type: 'appointment_prep',
    status: 'completed',
    file_path: '/reports/prep.pdf',
    generated_at: '2026-06-21T12:00:00Z',
    summary_json: {},
    ...overrides
  };
}

const summary: ClinicianSummary = {
  generated_at: '2026-06-01T00:00:00Z',
  case_header: {
    cancer_type: 'breast cancer',
    stage_or_context: 'Stage 4',
    biomarkers: [{ name: 'HER2' }],
    lines_of_therapy: [], // Treatment line missing -> should surface in readiness
    would_consider: [],
    would_not_consider: []
  },
  case_framing: { text: 'framing', generation: { mode: 'local_only', status: 'deterministic_fallback' } },
  trial_findings: [],
  research_findings: [],
  discussion_questions: ['What are my trial options?', 'Any new targeted therapies?'],
  data_gaps: [],
  disclaimer: 'Review with your care team.'
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ReportsPage />
    </MemoryRouter>
  );
}

describe('ReportsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockedApi.getReports.mockResolvedValue([buildReport()]);
    mockedApi.generateReport.mockResolvedValue(buildReport());
    mockedApi.getFindings.mockResolvedValue({ total: 0, items: [] });
    mockedApi.getClinicianSummary.mockResolvedValue(summary);
  });

  it('labels the appointment prep report type in history', async () => {
    renderPage();
    expect((await screen.findAllByText('Appointment Prep Sheet')).length).toBeGreaterThan(0);
  });

  it('leads with intent, runs the guided prep, and generates an appointment prep sheet', async () => {
    renderPage();
    await screen.findByText('What are you preparing for?');

    await userEvent.click(screen.getByRole('button', { name: /an upcoming appointment/i }));

    // Guided prep surfaces questions and a missing-profile-detail heads-up.
    expect(await screen.findByText(/getting ready/i)).toBeInTheDocument();
    expect(screen.getByText('What are my trial options?')).toBeInTheDocument();
    expect(screen.getByText(/Treatment line/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /create appointment prep sheet/i }));

    await waitFor(() =>
      expect(mockedApi.generateReport).toHaveBeenCalledWith({ report_type: 'appointment_prep' })
    );

    // Success state shows a readiness summary derived from saved findings + questions.
    expect(await screen.findByText(/your report is ready/i)).toBeInTheDocument();
    expect(screen.getByText(/Includes 0 saved findings and 2 questions/i)).toBeInTheDocument();
  });

  it('maps the "quick update" intent to a daily summary report', async () => {
    mockedApi.generateReport.mockResolvedValue(buildReport({ report_type: 'daily_summary' }));
    renderPage();
    await screen.findByText('What are you preparing for?');

    await userEvent.click(screen.getByRole('button', { name: /a quick update to share/i }));
    await userEvent.click(await screen.findByRole('button', { name: /create daily summary report/i }));

    await waitFor(() =>
      expect(mockedApi.generateReport).toHaveBeenCalledWith({ report_type: 'daily_summary' })
    );
  });

  it('regenerates an existing report from its history entry', async () => {
    renderPage();
    await screen.findAllByText('Appointment Prep Sheet');

    await userEvent.click(screen.getByRole('button', { name: /generate updated version/i }));

    await waitFor(() =>
      expect(mockedApi.generateReport).toHaveBeenCalledWith({ report_type: 'appointment_prep' })
    );
  });
});

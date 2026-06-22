import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportsPage } from './ReportsPage';
import { api } from '../lib/api';
import type { ReportExport } from '../lib/types';

vi.mock('../lib/api', () => ({
  api: {
    getReports: vi.fn(),
    generateReport: vi.fn(),
    downloadReport: vi.fn()
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

describe('ReportsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.getReports.mockResolvedValue([buildReport()]);
    mockedApi.generateReport.mockResolvedValue(buildReport());
  });

  it('labels the appointment prep report type in history', async () => {
    render(<ReportsPage />);
    expect((await screen.findAllByText('Appointment Prep Sheet')).length).toBeGreaterThan(0);
  });

  it('generates an appointment prep sheet from the third button', async () => {
    render(<ReportsPage />);
    await screen.findAllByText('Appointment Prep Sheet');

    await userEvent.click(screen.getByRole('button', { name: /make appointment prep sheet/i }));

    await waitFor(() =>
      expect(mockedApi.generateReport).toHaveBeenCalledWith({ report_type: 'appointment_prep' })
    );
    expect(await screen.findByText(/Appointment Prep Sheet generated locally/i)).toBeInTheDocument();
  });
});

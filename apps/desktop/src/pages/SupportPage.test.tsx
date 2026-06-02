import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupportPage } from './SupportPage';
import { api } from '../lib/api';
import type { BootstrapInfo } from '../lib/types';

vi.mock('../lib/api', () => ({
  api: {
    getAuditLog: vi.fn(),
    exportAllData: vi.fn(),
    deleteAllData: vi.fn()
  }
}));

const bootstrap: BootstrapInfo = {
  app_name: 'OncoWatch',
  app_version: '0.1.0',
  disclaimer: 'Not medical advice.',
  onboarding_completed: true,
  active_profile_id: 1,
  config_dir: '/config',
  data_dir: '/data',
  logs_dir: '/logs',
  reports_dir: '/reports',
  monitoring_mode: 'while_open',
  privacy_summary: 'Local-only',
  product_scope: 'Monitoring tool'
};

const mockedApi = vi.mocked(api);

describe('SupportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Prevent jsdom from attempting (unimplemented) navigation on download clicks.
    HTMLAnchorElement.prototype.click = vi.fn();
    mockedApi.getAuditLog.mockResolvedValue({
      events: [{ timestamp: '2026-06-02T10:00:00Z', action: 'profile_created', detail: { profile_id: 1 } }]
    });
    mockedApi.exportAllData.mockResolvedValue(new Blob(['{}'], { type: 'application/json' }));
  });

  it('renders audit events from the log', async () => {
    render(<SupportPage bootstrap={bootstrap} />);
    expect(await screen.findByText('Profile created')).toBeInTheDocument();
  });

  it('exports data and triggers a local download', async () => {
    mockedApi.exportAllData.mockResolvedValue(new Blob(['{}'], { type: 'application/json' }));
    const createObjectURL = vi.fn(() => 'blob:test');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;

    render(<SupportPage bootstrap={bootstrap} />);
    await screen.findByText('Profile created');
    await userEvent.click(screen.getByRole('button', { name: /export my data/i }));

    await waitFor(() => expect(mockedApi.exportAllData).toHaveBeenCalledTimes(1));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/exported to a local JSON file/i)).toBeInTheDocument();
  });

  it('deletes all data after the user confirms', async () => {
    mockedApi.deleteAllData.mockResolvedValue({
      profiles: 1,
      findings: 2,
      monitoring_runs: 0,
      reports: 1,
      report_files_removed: 1
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<SupportPage bootstrap={bootstrap} />);
    await screen.findByText('Profile created');
    await userEvent.click(screen.getByRole('button', { name: /delete all my data/i }));

    await waitFor(() => expect(mockedApi.deleteAllData).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Deleted 1 profile/i)).toBeInTheDocument();
  });

  it('does not delete when the user cancels the confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<SupportPage bootstrap={bootstrap} />);
    await screen.findByText('Profile created');
    await userEvent.click(screen.getByRole('button', { name: /delete all my data/i }));

    expect(mockedApi.deleteAllData).not.toHaveBeenCalled();
  });
});

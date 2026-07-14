import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OnboardingWizard } from './OnboardingWizard';
import { api } from '../../lib/api';
import type { AppSettings, HealthResponse, SourceConfig } from '../../lib/types';

vi.mock('../../lib/api', () => ({
  api: {
    getSettings: vi.fn(),
    getSources: vi.fn(),
    getHealth: vi.fn(),
    createProfile: vi.fn(),
    updateSettings: vi.fn(),
    updateSource: vi.fn(),
    completeOnboarding: vi.fn()
  }
}));

const mockedApi = vi.mocked(api);

const settings: AppSettings = {
  daily_run_time: '08:30',
  default_report_style: 'clinical',
  default_report_length: 'daily_summary',
  demo_profile_enabled: false,
  privacy_mode: 'local_only',
  deidentified_ai_disclosure_acknowledged: false
};

const sources: SourceConfig[] = [
  {
    id: 1,
    category: 'clinical_trials',
    name: 'ClinicalTrials.gov',
    connector_key: 'clinicaltrials_gov',
    enabled: true,
    settings_json: {}
  }
];

const okHealth: HealthResponse = {
  checked_at: '2026-06-01T00:00:00Z',
  overall_ok: true,
  items: [{ key: 'storage', label: 'Local storage', ok: true, message: 'Ready', severity: 'info', blocking: true }]
};

describe('OnboardingWizard progressive flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.getSettings.mockResolvedValue(settings);
    mockedApi.getSources.mockResolvedValue(sources);
    mockedApi.getHealth.mockResolvedValue(okHealth);
    mockedApi.createProfile.mockResolvedValue({ id: 7, ...settings } as never);
    mockedApi.updateSettings.mockResolvedValue(settings as never);
    mockedApi.updateSource.mockResolvedValue(sources[0] as never);
    mockedApi.completeOnboarding.mockResolvedValue({} as never);
  });

  it('collects only essential fields on the profile step (advanced fields are deferred)', async () => {
    render(<OnboardingWizard onCompleted={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: /start setup/i }));

    // Essentials shown.
    expect(screen.getByLabelText('Cancer type')).toBeInTheDocument();
    expect(screen.getByText('Location')).toBeInTheDocument();
    // Deferred "improve matching later" fields are not on the essentials step.
    expect(screen.queryByText('Biomarkers / mutations')).not.toBeInTheDocument();
    expect(screen.queryByText('Therapy history')).not.toBeInTheDocument();
    expect(screen.queryByText('Stage / disease context')).not.toBeInTheDocument();
  });

  it('requires a privacy confirmation before leaving the sources step', async () => {
    const onCompleted = vi.fn().mockResolvedValue(undefined);
    render(<OnboardingWizard onCompleted={onCompleted} />);

    await userEvent.click(await screen.findByRole('button', { name: /start setup/i }));
    await userEvent.type(screen.getByLabelText('Cancer type'), 'breast cancer');
    await userEvent.click(screen.getByRole('button', { name: /save and continue/i }));

    // On the sources & privacy step, continuing without the confirmation is blocked.
    await screen.findByText('Enabled real sources');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByText(/confirm you understand/i)).toBeInTheDocument();

    // Confirm privacy, continue to the health check, run it, and finish.
    await userEvent.click(screen.getByRole('checkbox', { name: /stays on this computer/i }));
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    await userEvent.click(await screen.findByRole('button', { name: /run health check/i }));
    await userEvent.click(await screen.findByRole('button', { name: /^continue$/i }));

    await userEvent.click(await screen.findByRole('button', { name: /open dashboard/i }));
    await waitFor(() => expect(mockedApi.completeOnboarding).toHaveBeenCalled());
    expect(mockedApi.createProfile).toHaveBeenCalled();
    expect(onCompleted).toHaveBeenCalled();
  });
});

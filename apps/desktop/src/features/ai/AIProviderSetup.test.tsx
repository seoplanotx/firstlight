import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AIProviderSetup } from './AIProviderSetup';
import { api } from '../../lib/api';
import type { AppSettings, ProviderConfig } from '../../lib/types';

vi.mock('../../lib/api', () => ({
  api: {
    getProviderConfig: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    saveProviderConfig: vi.fn(),
    testProviderKey: vi.fn()
  }
}));

vi.mock('../../lib/external', () => ({
  openExternal: vi.fn()
}));

const mockedApi = vi.mocked(api);

const baseSettings: AppSettings = {
  daily_run_time: '08:30',
  default_report_style: 'clinical',
  default_report_length: 'daily_summary',
  demo_profile_enabled: false,
  privacy_mode: 'local_only',
  deidentified_ai_disclosure_acknowledged: false,
  active_ai_provider: 'openrouter'
};

function providerConfig(overrides: Partial<ProviderConfig>): ProviderConfig {
  return {
    id: 1,
    provider_key: 'anthropic',
    display_name: 'Anthropic (Claude)',
    is_configured: true,
    selected_model: 'claude-sonnet-4-6',
    last_test_success: true,
    ...overrides
  } as ProviderConfig;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.getProviderConfig.mockResolvedValue(null);
  mockedApi.getSettings.mockResolvedValue(baseSettings);
  mockedApi.updateSettings.mockResolvedValue(baseSettings);
});

describe('AIProviderSetup', () => {
  it('recommends Anthropic by default and swaps provider help on switch', async () => {
    render(<AIProviderSetup />);

    expect(await screen.findByPlaceholderText('sk-ant-...')).toBeInTheDocument();
    expect(screen.getByText('Anthropic API key')).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByDisplayValue('Anthropic (Claude) — direct (recommended)'),
      'openrouter'
    );

    expect(await screen.findByPlaceholderText('sk-or-...')).toBeInTheDocument();
    expect(screen.getByText('OpenRouter API key')).toBeInTheDocument();
  });

  it('saves the key under the selected provider and makes it the active provider', async () => {
    mockedApi.saveProviderConfig.mockResolvedValue(
      providerConfig({ provider_key: 'anthropic' })
    );

    render(<AIProviderSetup />);

    await userEvent.type(await screen.findByPlaceholderText('sk-ant-...'), 'sk-ant-test-123');
    await userEvent.click(screen.getByRole('button', { name: 'Save AI settings' }));

    await waitFor(() => {
      expect(mockedApi.saveProviderConfig).toHaveBeenCalledWith(
        'anthropic',
        expect.objectContaining({
          provider_key: 'anthropic',
          display_name: 'Anthropic (Claude)',
          selected_model: 'claude-sonnet-4-6',
          api_key: 'sk-ant-test-123'
        })
      );
    });
    await waitFor(() => {
      expect(mockedApi.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ active_ai_provider: 'anthropic' })
      );
    });
    expect(await screen.findByText(/AI assist will use Anthropic/)).toBeInTheDocument();
  });

  it('shows the saved-key banner for the provider that is configured', async () => {
    mockedApi.getProviderConfig.mockImplementation(async (provider = 'openrouter') =>
      provider === 'anthropic' ? providerConfig({ provider_key: 'anthropic' }) : null
    );
    mockedApi.getSettings.mockResolvedValue({ ...baseSettings, active_ai_provider: 'anthropic' });

    render(<AIProviderSetup />);

    expect(await screen.findByText(/Anthropic \(Claude\)\s+key saved\./)).toBeInTheDocument();
    expect(screen.getAllByText(/claude-sonnet-4-6/).length).toBeGreaterThan(0);
  });

  it('tests the key against the selected provider', async () => {
    mockedApi.testProviderKey.mockResolvedValue({
      ok: true,
      message: 'API key looks valid.',
      discovered_models: ['claude-sonnet-4-6', 'claude-opus-4-8']
    });

    render(<AIProviderSetup />);

    await userEvent.type(await screen.findByPlaceholderText('sk-ant-...'), 'sk-ant-test-123');
    await userEvent.click(screen.getByRole('button', { name: 'Test key' }));

    await waitFor(() => {
      expect(mockedApi.testProviderKey).toHaveBeenCalledWith(
        'anthropic',
        expect.objectContaining({ api_key: 'sk-ant-test-123' })
      );
    });
    expect(await screen.findByText('API key looks valid.')).toBeInTheDocument();
  });
});

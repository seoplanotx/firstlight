import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AIProviderSetup } from './AIProviderSetup';
import { api } from '../../lib/api';
import type { AppSettings, ProviderConfig } from '../../lib/types';

vi.mock('../../lib/api', () => ({
  api: {
    getProviderConfig: vi.fn(),
    getProviderModels: vi.fn(),
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
  mockedApi.getProviderModels.mockResolvedValue([]);
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

  it('offers frontier-lab models for OpenRouter', async () => {
    render(<AIProviderSetup />);

    await userEvent.selectOptions(
      await screen.findByDisplayValue('Anthropic (Claude) — direct (recommended)'),
      'openrouter'
    );

    const modelSelect = await screen.findByLabelText('AI model');
    const options = Array.from(modelSelect.querySelectorAll('option')).map((o) => o.value);
    // Spans multiple frontier labs, not just the old four-model list.
    expect(options).toEqual(
      expect.arrayContaining([
        'anthropic/claude-sonnet-5',
        'openai/gpt-5.6-sol',
        'google/gemini-3.1-pro-preview',
        'x-ai/grok-4.5',
        'deepseek/deepseek-v4-pro',
        'moonshotai/kimi-k3',
        'qwen/qwen3.7-max'
      ])
    );
    // Plus an explicit escape hatch for anything not listed.
    expect(options).toContain('__custom__');
  });

  it('lets you paste any model ID and saves it verbatim', async () => {
    mockedApi.saveProviderConfig.mockResolvedValue(
      providerConfig({ provider_key: 'openrouter', selected_model: 'moonshotai/kimi-k9-preview' })
    );

    render(<AIProviderSetup />);

    await userEvent.selectOptions(
      await screen.findByDisplayValue('Anthropic (Claude) — direct (recommended)'),
      'openrouter'
    );

    // Switch the picker to free-text entry and paste an id that is not in the list.
    await userEvent.selectOptions(screen.getByLabelText('AI model'), '__custom__');
    await userEvent.type(screen.getByLabelText('Custom model ID'), 'moonshotai/kimi-k9-preview');

    await userEvent.type(screen.getByPlaceholderText('sk-or-...'), 'sk-or-test-123');
    await userEvent.click(screen.getByRole('button', { name: 'Save AI settings' }));

    await waitFor(() => {
      expect(mockedApi.saveProviderConfig).toHaveBeenCalledWith(
        'openrouter',
        expect.objectContaining({
          provider_key: 'openrouter',
          selected_model: 'moonshotai/kimi-k9-preview'
        })
      );
    });
  });
});

import { useEffect, useState } from 'react';

import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import { openExternal } from '../../lib/external';
import type { AIProvider, ProviderConfig } from '../../lib/types';

type ProviderMeta = {
  label: string;
  optionLabel: string;
  displayName: string;
  keyLabel: string;
  keyPlaceholder: string;
  keysUrl: string;
  keysButton: string;
  helpTitle: string;
  helpSteps: string[];
  recommendedModels: string[];
};

export const PROVIDER_META: Record<AIProvider, ProviderMeta> = {
  anthropic: {
    label: 'Anthropic (Claude)',
    optionLabel: 'Anthropic (Claude) — direct (recommended)',
    displayName: 'Anthropic (Claude)',
    keyLabel: 'Anthropic API key',
    keyPlaceholder: 'sk-ant-...',
    keysUrl: 'https://console.anthropic.com/settings/keys',
    keysButton: 'Open console.anthropic.com in your browser',
    helpTitle: 'Get an Anthropic API key (about 2 minutes):',
    helpSteps: [
      'Create an account at console.anthropic.com — email or Google sign-in works.',
      'Open Settings → API keys and choose Create Key. Name it anything, like “Firstlight”.',
      'Copy the key that starts with sk-ant- and paste it here. Add a few dollars of credit under Billing — typical briefings cost only pennies.',
    ],
    recommendedModels: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5'],
  },
  openrouter: {
    label: 'OpenRouter',
    optionLabel: 'OpenRouter — one key, many models',
    displayName: 'OpenRouter',
    keyLabel: 'OpenRouter API key',
    keyPlaceholder: 'sk-or-...',
    keysUrl: 'https://openrouter.ai/settings/keys',
    keysButton: 'Open openrouter.ai/keys in your browser',
    helpTitle: 'Get a free OpenRouter API key (about 2 minutes):',
    helpSteps: [
      'Create an account at openrouter.ai — email or Google sign-in works.',
      'Open Keys from your account menu, then choose Create Key. Name it anything, like “Firstlight”.',
      'Copy the key that starts with sk-or- and paste it here. Add a few dollars of credit on the same page — typical briefings cost only pennies.',
    ],
    recommendedModels: [
      'anthropic/claude-sonnet-4.6',
      'openai/gpt-4.1-mini',
      'google/gemini-2.5-pro',
      'meta-llama/llama-4-maverick',
    ],
  },
};

type Props = {
  onConfigured?: (config: ProviderConfig) => void;
};

function mergeModels(provider: AIProvider, discovered: string[]): string[] {
  const merged = [...PROVIDER_META[provider].recommendedModels];
  for (const id of discovered) {
    if (!merged.includes(id)) {
      merged.push(id);
    }
  }
  return merged;
}

export function AIProviderSetup({ onConfigured }: Props) {
  const [provider, setProvider] = useState<AIProvider>('anthropic');
  const [configs, setConfigs] = useState<Partial<Record<AIProvider, ProviderConfig | null>>>({});
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(PROVIDER_META.anthropic.recommendedModels[0]);
  const [models, setModels] = useState<string[]>(PROVIDER_META.anthropic.recommendedModels);
  const [testNotice, setTestNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [savedNotice, setSavedNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const meta = PROVIDER_META[provider];
  const config = configs[provider] ?? null;

  function applyProvider(next: AIProvider, loaded: Partial<Record<AIProvider, ProviderConfig | null>>) {
    const existing = loaded[next] ?? null;
    setProvider(next);
    setApiKey('');
    setTestNotice('');
    setSavedNotice('');
    setErrorMessage('');
    const selected = existing?.selected_model || PROVIDER_META[next].recommendedModels[0];
    setModel(selected);
    setModels(mergeModels(next, existing?.selected_model ? [existing.selected_model] : []));
  }

  useEffect(() => {
    async function load() {
      const loaded: Partial<Record<AIProvider, ProviderConfig | null>> = {};
      for (const key of ['anthropic', 'openrouter'] as AIProvider[]) {
        try {
          loaded[key] = await api.getProviderConfig(key);
        } catch {
          // Provider config is optional; the form still works without it.
          loaded[key] = null;
        }
      }
      setConfigs(loaded);
      let initial: AIProvider = 'anthropic';
      try {
        const settings = await api.getSettings();
        if (settings.active_ai_provider && loaded[settings.active_ai_provider]?.is_configured) {
          initial = settings.active_ai_provider;
        } else if (loaded.anthropic?.is_configured) {
          initial = 'anthropic';
        } else if (loaded.openrouter?.is_configured) {
          initial = 'openrouter';
        }
      } catch {
        // Settings are optional here; default recommendation stands.
      }
      applyProvider(initial, loaded);
    }

    void load();
  }, []);

  async function testKey() {
    setErrorMessage('');
    setTestNotice('');
    setSavedNotice('');
    if (!apiKey.trim()) {
      setErrorMessage(`Paste your ${meta.label} API key first.`);
      return;
    }
    setBusy(true);
    try {
      const result = await api.testProviderKey(provider, { api_key: apiKey.trim(), model });
      if (result.ok) {
        setTestNotice(result.message || 'API key looks valid.');
        if (result.discovered_models.length > 0) {
          setModels(mergeModels(provider, result.discovered_models));
        }
      } else {
        setErrorMessage(result.message || `${meta.label} rejected this key.`);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, `Could not reach ${meta.label} to test the key.`));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setErrorMessage('');
    setSavedNotice('');
    if (!apiKey.trim() && !config?.is_configured) {
      setErrorMessage(`Paste your ${meta.label} API key before saving.`);
      return;
    }
    setBusy(true);
    try {
      const saved = await api.saveProviderConfig(provider, {
        provider_key: provider,
        display_name: meta.displayName,
        selected_model: model,
        api_key: apiKey.trim() || null
      });
      setConfigs((current) => ({ ...current, [provider]: saved }));
      setApiKey('');
      try {
        const settings = await api.getSettings();
        await api.updateSettings({ ...settings, active_ai_provider: provider });
      } catch {
        // The key is saved even if selecting the active provider fails.
      }
      setSavedNotice(
        `Saved. The key is encrypted and stored only on this computer. AI assist will use ${meta.label}.`
      );
      onConfigured?.(saved);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, `Could not save the ${meta.label} settings.`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="ai-provider">AI provider</label>
        <select
          id="ai-provider"
          aria-describedby="ai-provider-hint"
          value={provider}
          onChange={(e) => applyProvider(e.target.value as AIProvider, configs)}
        >
          {(Object.keys(PROVIDER_META) as AIProvider[]).map((key) => (
            <option key={key} value={key}>
              {PROVIDER_META[key].optionLabel}
            </option>
          ))}
        </select>
        <div className="field-hint" id="ai-provider-hint">
          Anthropic (Claude) is the recommended direct connection. OpenRouter also works and can route to other
          models. Either way, the key stays on this computer.
        </div>
      </div>

      {config?.is_configured && (
        <div className="callout">
          <strong>{meta.label} key saved.</strong> Model: {config.selected_model || 'not selected'}
          {config.last_test_success != null && (
            <> · last test {config.last_test_success ? 'passed' : 'failed'}</>
          )}
          . Paste a new key below only if you want to replace it.
        </div>
      )}

      <div className="help-steps">
        <strong>{meta.helpTitle}</strong>
        <ol>
          {meta.helpSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <button type="button" className="ghost-button" onClick={() => void openExternal(meta.keysUrl)}>
          {meta.keysButton}
        </button>
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="ai-key">{meta.keyLabel}</label>
          <input
            id="ai-key"
            type="password"
            placeholder={meta.keyPlaceholder}
            autoComplete="off"
            aria-describedby="ai-key-hint"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="ai-model">AI model</label>
          <select id="ai-model" value={model} onChange={(e) => setModel(e.target.value)}>
            {models.map((id) => (
              <option key={id} value={id}>
                {id === meta.recommendedModels[0] ? `${id} (recommended)` : id}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="muted" id="ai-key-hint">
        The recommended model handles clinical text carefully at a low cost. The key is encrypted, stays on this
        computer, and is only used when AI assist is turned on.
      </p>

      {errorMessage && <div className="callout callout-danger" role="alert">{errorMessage}</div>}
      {testNotice && <div className="callout" role="status">{testNotice}</div>}
      {savedNotice && <div className="callout" role="status">{savedNotice}</div>}

      <div className="button-row">
        <button type="button" className="ghost-button" disabled={busy} onClick={() => void testKey()}>
          {busy ? 'Working...' : 'Test key'}
        </button>
        <button type="button" className="primary-button" disabled={busy} onClick={() => void save()}>
          {busy ? 'Working...' : 'Save AI settings'}
        </button>
      </div>
    </div>
  );
}

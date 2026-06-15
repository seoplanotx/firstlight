import { useEffect, useState } from 'react';

import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import { openExternal } from '../../lib/external';
import type { ProviderConfig } from '../../lib/types';

export const RECOMMENDED_MODELS = [
  'anthropic/claude-sonnet-4.6',
  'openai/gpt-4.1-mini',
  'google/gemini-2.5-pro',
  'meta-llama/llama-4-maverick'
];

type Props = {
  onConfigured?: (config: ProviderConfig) => void;
};

function mergeModels(discovered: string[]): string[] {
  const merged = [...RECOMMENDED_MODELS];
  for (const id of discovered) {
    if (!merged.includes(id)) {
      merged.push(id);
    }
  }
  return merged;
}

export function OpenRouterSetup({ onConfigured }: Props) {
  const [config, setConfig] = useState<ProviderConfig | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(RECOMMENDED_MODELS[0]);
  const [models, setModels] = useState<string[]>(RECOMMENDED_MODELS);
  const [testNotice, setTestNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [savedNotice, setSavedNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const existing = await api.getProviderConfig();
        if (existing) {
          setConfig(existing);
          if (existing.selected_model) {
            setModel(existing.selected_model);
            setModels(mergeModels([existing.selected_model]));
          }
        }
      } catch {
        // Provider config is optional; the form still works without it.
      }
    }

    void load();
  }, []);

  async function testKey() {
    setErrorMessage('');
    setTestNotice('');
    setSavedNotice('');
    if (!apiKey.trim()) {
      setErrorMessage('Paste your OpenRouter API key first.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.testOpenRouterKey({ api_key: apiKey.trim(), model });
      if (result.ok) {
        setTestNotice(result.message || 'API key looks valid.');
        if (result.discovered_models.length > 0) {
          setModels(mergeModels(result.discovered_models));
        }
      } else {
        setErrorMessage(result.message || 'OpenRouter rejected this key.');
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not reach OpenRouter to test the key.'));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setErrorMessage('');
    setSavedNotice('');
    if (!apiKey.trim() && !config?.is_configured) {
      setErrorMessage('Paste your OpenRouter API key before saving.');
      return;
    }
    setBusy(true);
    try {
      const saved = await api.saveProviderConfig({
        provider_key: 'openrouter',
        display_name: 'OpenRouter',
        selected_model: model,
        api_key: apiKey.trim() || null
      });
      setConfig(saved);
      setApiKey('');
      setSavedNotice('Saved. The key is encrypted and stored only on this computer.');
      onConfigured?.(saved);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not save the OpenRouter settings.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {config?.is_configured && (
        <div className="callout">
          <strong>OpenRouter key saved.</strong> Model: {config.selected_model || 'not selected'}
          {config.last_test_success != null && (
            <> · last test {config.last_test_success ? 'passed' : 'failed'}</>
          )}
          . Paste a new key below only if you want to replace it.
        </div>
      )}

      <div className="help-steps">
        <strong>Get a free OpenRouter API key (about 2 minutes):</strong>
        <ol>
          <li>
            Create an account at <strong>openrouter.ai</strong> — email or Google sign-in works.
          </li>
          <li>
            Open <strong>Keys</strong> from your account menu (or use the button below), then choose{' '}
            <strong>Create Key</strong>. Name it anything, like &ldquo;Firstlight&rdquo;.
          </li>
          <li>
            Copy the key that starts with <code>sk-or-</code> and paste it here. Add a few dollars of credit on the same
            page — typical briefings cost only pennies.
          </li>
        </ol>
        <button type="button" className="ghost-button" onClick={() => void openExternal('https://openrouter.ai/settings/keys')}>
          Open openrouter.ai/keys in your browser
        </button>
      </div>

      <div className="form-grid">
        <div className="field">
          <label>OpenRouter API key</label>
          <input
            type="password"
            placeholder="sk-or-..."
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
        <div className="field">
          <label>AI model</label>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {models.map((id) => (
              <option key={id} value={id}>
                {id === RECOMMENDED_MODELS[0] ? `${id} (recommended)` : id}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="muted">
        The recommended model handles clinical text carefully at a low cost. The key is encrypted, stays on this
        computer, and is only used when AI assist is turned on.
      </p>

      {errorMessage && <div className="callout callout-danger">{errorMessage}</div>}
      {testNotice && <div className="callout">{testNotice}</div>}
      {savedNotice && <div className="callout">{savedNotice}</div>}

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

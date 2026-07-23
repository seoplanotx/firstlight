import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { Finding } from '../lib/types';

type PlainLanguageBlockProps = {
  finding: Finding;
};

// Optional, on-demand plain-language explanation of a finding's PUBLIC source text.
// Self-contained: it manages its own request state so no parent needs to thread it.
// When AI assist is off/unavailable the backend returns a calm status message instead
// of an error, which we surface as a quiet hint (never a red alarm).
export function PlainLanguageBlock({ finding }: PlainLanguageBlockProps) {
  const [summary, setSummary] = useState<string | null>(finding.plain_language_summary ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleExplain() {
    setLoading(true);
    setMessage(null);
    try {
      const result = await api.generatePlainLanguage(finding.id);
      const text = result.finding?.plain_language_summary ?? null;
      if (text) {
        setSummary(text);
      } else if (result.message) {
        setMessage(result.message);
      }
    } catch (err) {
      setMessage(
        err instanceof ApiError ? err.message : 'Could not create a plain-language summary right now.'
      );
    } finally {
      setLoading(false);
    }
  }

  if (summary) {
    return (
      <div className="support-card plain-language-block">
        <div className="support-card-label">In plain language</div>
        <p className="multiline">{summary}</p>
        <p className="plain-language-disclaimer">
          A plain-language summary of the public source, created by the optional AI helper. This is not
          medical advice; please review anything important with your care team.
        </p>
      </div>
    );
  }

  return (
    <div className="plain-language-block">
      <button
        type="button"
        className="ghost-button"
        onClick={handleExplain}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? 'Explaining...' : 'Explain in plain language'}
      </button>
      {message && (
        <p className="plain-language-hint" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

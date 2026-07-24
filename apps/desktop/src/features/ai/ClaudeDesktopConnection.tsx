import { useEffect, useState } from 'react';

import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type { McpAccessStatus } from '../../lib/types';

const CAN_SEE = [
  'Research findings Firstlight surfaced (trials, papers, drug updates) with sources and match rationale',
  'A de-identified case outline: cancer type, coarse stage group, biomarkers, state-level location',
  'The clinician summary content and monitoring run history',
];

const NEVER_SEES = [
  'Name, date of birth, contact details, or exact location',
  'Doctor, clinic, or hospital names',
  'Private notes, files, or the activity log',
];

export function ClaudeDesktopConnection() {
  const [status, setStatus] = useState<McpAccessStatus | null>(null);
  const [connectionCode, setConnectionCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function load() {
    setErrorMessage('');
    try {
      setStatus(await api.getMcpAccess());
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not load the Claude Desktop connection status.'));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function enable() {
    setBusy(true);
    setErrorMessage('');
    setCopied(false);
    try {
      const result = await api.enableMcpAccess();
      setConnectionCode(result.connection_code);
      setStatus({ enabled: true, has_token: true });
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not turn on Claude Desktop access.'));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setErrorMessage('');
    setCopied(false);
    try {
      setStatus(await api.disableMcpAccess());
      setConnectionCode('');
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not turn off Claude Desktop access.'));
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(connectionCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (!status) {
    return errorMessage ? <div className="callout callout-danger" role="alert">{errorMessage}</div> : <div className="muted" role="status">Loading…</div>;
  }

  return (
    <div className="stack">
      {errorMessage && <div className="callout callout-danger" role="alert">{errorMessage}</div>}

      <div className="callout">
        <strong>What Claude can see when this is on:</strong>
        <ul>
          {CAN_SEE.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <strong>What Claude can never see:</strong>
        <ul>
          {NEVER_SEES.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className="muted">
          Anything shared this way goes to Claude under Anthropic's terms, like Mode 2 AI assist. Every finding still
          requires clinician review.
        </div>
      </div>

      {!status.enabled && (
        <div className="button-row">
          <button className="primary-button" onClick={enable} disabled={busy}>
            Turn on and get a connection code
          </button>
        </div>
      )}

      {status.enabled && connectionCode && (
        <div className="stack">
          <div className="callout">
            <strong>Your connection code (shown once):</strong>
            <div>
              <code data-testid="mcp-connection-code">{connectionCode}</code>
            </div>
            <div className="muted">
              Install the Firstlight extension in Claude Desktop (Settings → Extensions), then paste this code into the
              extension's settings. Firstlight only stores an encrypted copy, so copy it now.
            </div>
          </div>
          <div className="button-row">
            <button className="secondary-button" onClick={copyCode} disabled={busy}>
              {copied ? 'Copied' : 'Copy code'}
            </button>
          </div>
        </div>
      )}

      {status.enabled && (
        <div className="button-row">
          <button className="secondary-button" onClick={enable} disabled={busy}>
            Generate a new code
          </button>
          <button className="secondary-button" onClick={disable} disabled={busy}>
            Turn off Claude Desktop access
          </button>
        </div>
      )}
    </div>
  );
}

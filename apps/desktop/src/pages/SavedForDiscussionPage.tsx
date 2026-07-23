import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { FindingSummaryCard } from '../components/FindingSummaryCard';
import { PageErrorState } from '../components/PageErrorState';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import type { Finding, FindingAction } from '../lib/types';

// The visit-prep shortlist. Everything marked "Ask the doctor about this"
// collects here, inside Doctor Visit, so saving during review feeds the
// summary and reports directly.
export function SavedForDiscussionPage() {
  const [items, setItems] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingId, setPendingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setErrorMessage('');
    try {
      const result = await api.getFindings();
      setItems(result.items.filter((item) => item.user_action === 'discuss'));
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not load your saved findings.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleAction(findingId: number, action: FindingAction) {
    setPendingId(findingId);
    try {
      await api.setFindingAction(findingId, action);
      await load();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not update this item.'));
    } finally {
      setPendingId(null);
    }
  }

  if (loading) return <div className="loading-block" role="status">Loading saved findings…</div>;
  if (errorMessage && items.length === 0) {
    return <PageErrorState title="Nothing to show yet" message={errorMessage} onRetry={load} />;
  }

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Your shortlist</div>
          <h1>Saved for discussion</h1>
          <p className="page-lede">
            Everything you have marked to raise at the next visit, in one place. When you are ready, continue to
            Questions &amp; summary to turn these into a visit sheet.
          </p>
        </div>
        <div className="page-header-actions">
          <Link className="secondary-button" to="/clinician">
            Build the summary
          </Link>
        </div>
      </div>

      {errorMessage && <div className="callout callout-danger" role="alert">{errorMessage}</div>}

      <Card
        title="Saved findings"
        description="Remove anything that no longer belongs, or open its source to read more."
        action={<span className="section-counter">{items.length} saved</span>}
      >
        {items.length === 0 ? (
          <EmptyState
            title="Nothing saved yet"
            message='In Discoveries, choose "Ask the doctor about this" on anything worth raising and it will collect here.'
          />
        ) : (
          <div className="finding-list">
            {items.map((item) => (
              <FindingSummaryCard
                key={item.id}
                finding={item}
                showWhy
                onAction={(action) => handleAction(item.id, action)}
                actionPending={pendingId === item.id}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

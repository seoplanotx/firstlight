import { useEffect, useState } from 'react';

import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { FindingSummaryCard } from '../components/FindingSummaryCard';
import { PageErrorState } from '../components/PageErrorState';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import type { Finding, FindingAction } from '../lib/types';

export function UpdatesPage() {
  const [items, setItems] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingId, setPendingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setErrorMessage('');
    try {
      const result = await api.getFindings({ finding_type: 'literature' });
      setItems(result.items);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not load research updates.'));
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

  if (loading) return <div className="loading-block" role="status">Loading research updates...</div>;
  if (errorMessage && items.length === 0) {
    return <PageErrorState title="Nothing to show yet" message={errorMessage} onRetry={load} />;
  }

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">From PubMed &amp; Europe PMC</div>
          <h1>Research Updates</h1>
          <p className="page-lede">
            New research from PubMed and Europe PMC in one calm list, each with a short excerpt and the reason it came up.
          </p>
        </div>
        <div className="page-header-actions">
          <span className="section-counter">{items.length} found</span>
        </div>
      </div>

      {errorMessage && <div className="callout callout-danger" role="alert">{errorMessage}</div>}

      <Card
        title="Research"
        description="Each item keeps the evidence excerpt and the plain reason it came up side by side."
      >
        {items.length === 0 ? (
          <EmptyState title="No research yet" message="Run a check to pull in new research." />
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

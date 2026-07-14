import { useEffect, useState } from 'react';

import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { FindingSummaryCard } from '../components/FindingSummaryCard';
import { PageErrorState } from '../components/PageErrorState';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import type { Finding, FindingAction } from '../lib/types';

export function TrialMatchesPage() {
  const [items, setItems] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingId, setPendingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setErrorMessage('');
    try {
      const result = await api.getFindings({ finding_type: 'clinical_trials' });
      setItems(result.items);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not load trials.'));
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
      setErrorMessage(getErrorMessage(error, 'Could not update this trial.'));
    } finally {
      setPendingId(null);
    }
  }

  if (loading) return <div className="loading-block" role="status">Loading trials...</div>;
  if (errorMessage && items.length === 0) {
    return <PageErrorState title="No trials to show yet" message={errorMessage} onRetry={load} />;
  }

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">From ClinicalTrials.gov</div>
          <h1>Trials to Consider</h1>
          <p className="page-lede">
            Trials that may relate to the details you entered. None of this confirms eligibility — it is a starting point
            to review with the care team.
          </p>
        </div>
        <div className="page-header-actions">
          <span className="section-counter">{items.length} found</span>
        </div>
      </div>

      {errorMessage && <div className="callout callout-danger" role="alert">{errorMessage}</div>}

      <Card
        title="Possible trials"
        description="Look at recruitment status, what is being tested, and what is still unknown before treating anything as a fit."
      >
        {items.length === 0 ? (
          <EmptyState title="No trials yet" message="Trials will appear here after you run a check." />
        ) : (
          <div className="finding-list">
            {items.map((item) => (
              <FindingSummaryCard
                key={item.id}
                finding={item}
                showWhy
                showMatchingMeta
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

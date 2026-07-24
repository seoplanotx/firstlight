import { useEffect, useState } from 'react';

import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { FindingSummaryCard } from '../components/FindingSummaryCard';
import { PageErrorState } from '../components/PageErrorState';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import { useFindingUndo } from '../lib/useFindingUndo';
import type { Finding } from '../lib/types';

export function TrialMatchesPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [items, setItems] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

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

  const { pendingId, undo, act, undoLast } = useFindingUndo(load, setErrorMessage);

  if (loading) return <div className="loading-block" role="status">Loading trials…</div>;
  if (errorMessage && items.length === 0) {
    return <PageErrorState title="No trials to show yet" message={errorMessage} onRetry={load} />;
  }

  const actions = <span className="section-counter">{items.length} found</span>;

  const content = (
    <>
      {errorMessage && <div className="callout callout-caution" role="alert">{errorMessage}</div>}

      {undo && (
        <div className="callout undo-callout" role="status">
          <span>{undo.message}</span>
          <button className="link-button" type="button" onClick={undoLast}>
            Undo
          </button>
        </div>
      )}

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
                onAction={(action) => act(item, action)}
                actionPending={pendingId === item.id}
              />
            ))}
          </div>
        )}
      </Card>
    </>
  );

  if (embedded) {
    return (
      <>
        <div className="section-toolbar">{actions}</div>
        {content}
      </>
    );
  }

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">From ClinicalTrials.gov</div>
          <h1>Trials</h1>
          <p className="page-lede">
            Trials that may relate to the details you entered. None of this confirms eligibility — it is a starting point
            to review with the care team.
          </p>
        </div>
        <div className="page-header-actions">{actions}</div>
      </div>
      {content}
    </div>
  );
}

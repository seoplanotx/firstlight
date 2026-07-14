import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { FindingSummaryCard } from '../components/FindingSummaryCard';
import { PageErrorState } from '../components/PageErrorState';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import type { Finding, FindingAction } from '../lib/types';
import { FindingsPage } from './FindingsPage';
import { TrialMatchesPage } from './TrialMatchesPage';
import { UpdatesPage } from './UpdatesPage';

export type DiscoveriesTab = 'all' | 'trials' | 'research' | 'saved';

const TABS: { key: DiscoveriesTab; label: string; to: string }[] = [
  { key: 'all', label: 'All', to: '/discoveries' },
  { key: 'trials', label: 'Trials', to: '/trials' },
  { key: 'research', label: 'Research', to: '/updates' },
  { key: 'saved', label: 'Saved for discussion', to: '/saved-findings' }
];

// A calm read of everything already saved for the doctor, so families can see
// their shortlist in one place without hunting through the review workflow.
function SavedForDiscussion() {
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

  if (loading) return <div className="loading-block">Loading saved findings…</div>;
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
            Everything you have marked to raise at the next visit, in one place. When you are ready, open Doctor Visit to
            turn these into a summary.
          </p>
        </div>
        <div className="page-header-actions">
          <Link className="secondary-button" to="/doctor-visit">
            Go to Doctor Visit
          </Link>
        </div>
      </div>

      {errorMessage && <div className="callout callout-danger">{errorMessage}</div>}

      <Card
        title="Saved findings"
        description="Remove anything that no longer belongs, or open its source to read more."
        action={<span className="section-counter">{items.length} saved</span>}
      >
        {items.length === 0 ? (
          <EmptyState
            title="Nothing saved yet"
            message='In the "All" tab, mark anything worth raising and it will collect here.'
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

export function DiscoveriesPage({ activeTab }: { activeTab: DiscoveriesTab }) {
  return (
    <div className="page-stack">
      <nav className="section-tabs" aria-label="Discoveries views">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            to={tab.to}
            className={activeTab === tab.key ? 'section-tab active' : 'section-tab'}
            aria-current={activeTab === tab.key ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {activeTab === 'all' && <FindingsPage />}
      {activeTab === 'trials' && <TrialMatchesPage />}
      {activeTab === 'research' && <UpdatesPage />}
      {activeTab === 'saved' && <SavedForDiscussion />}
    </div>
  );
}

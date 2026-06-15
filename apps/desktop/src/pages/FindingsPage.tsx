import { useEffect, useMemo, useRef, useState } from 'react';

import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { FindingSummaryCard } from '../components/FindingSummaryCard';
import { PageErrorState } from '../components/PageErrorState';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import type { Finding, FindingAction } from '../lib/types';

type SortKey = 'relevance' | 'newest';

const UNDO_TIMEOUT_MS = 8000;

const ACTION_CONFIRMATIONS: Record<FindingAction, string> = {
  discuss: 'Added to your list for the doctor.',
  dismissed: 'Set aside.',
  none: 'Moved back to your list.'
};

function findingTimestamp(item: Finding): number {
  return new Date(item.published_at || item.retrieved_at).getTime();
}

export function FindingsPage() {
  const [items, setItems] = useState<Finding[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('relevance');
  const [includeDismissed, setIncludeDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [undo, setUndo] = useState<{ id: number; previous: FindingAction; message: string } | null>(null);
  const undoTimer = useRef<number | null>(null);

  function clearUndoTimer() {
    if (undoTimer.current !== null) {
      window.clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
  }

  useEffect(() => clearUndoTimer, []);

  async function load() {
    setLoading(true);
    setErrorMessage('');
    try {
      const result = await api.getFindings({ include_dismissed: includeDismissed });
      setItems(result.items);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not load what we found.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeDismissed]);

  async function applyAction(findingId: number, action: FindingAction, previous: FindingAction, offerUndo: boolean) {
    setPendingId(findingId);
    try {
      await api.setFindingAction(findingId, action);
      await load();
      clearUndoTimer();
      if (offerUndo && previous !== action) {
        setUndo({ id: findingId, previous, message: ACTION_CONFIRMATIONS[action] });
        undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_TIMEOUT_MS);
      } else {
        setUndo(null);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not update this item.'));
    } finally {
      setPendingId(null);
    }
  }

  function handleAction(finding: Finding, action: FindingAction) {
    void applyAction(finding.id, action, finding.user_action, true);
  }

  function handleUndo() {
    if (!undo) return;
    const target = undo;
    setUndo(null);
    clearUndoTimer();
    void applyAction(target.id, target.previous, 'none', false);
  }

  const visible = useMemo(() => {
    const filtered = items.filter((item) => {
      const matchesFilter =
        filter === 'discuss'
          ? item.user_action === 'discuss'
          : filter
            ? item.type === filter
            : true;
      const matchesQuery = query
        ? [
            item.title,
            item.normalized_summary || '',
            item.raw_summary || '',
            item.primary_evidence_snippet || '',
            item.trial_recruitment_status || '',
            item.trial_sponsor || '',
            item.trial_intervention_summary || '',
            item.trial_phases.join(' ')
          ]
            .join(' ')
            .toLowerCase()
            .includes(query.toLowerCase())
        : true;
      return matchesFilter && matchesQuery;
    });

    // 'relevance' (default) preserves the backend ranking from
    // rank_findings_for_briefing, which weighs status, relevance label, trial
    // recruitment, and freshness before score — richer than score alone.
    if (sortKey === 'newest') {
      return [...filtered].sort((a, b) => findingTimestamp(b) - findingTimestamp(a));
    }
    return filtered;
  }, [items, query, filter, sortKey]);

  const filterOptions = useMemo(
    () => [
      { value: '', label: 'Everything' },
      { value: 'clinical_trials', label: 'Trials' },
      { value: 'literature', label: 'Research' },
      { value: 'discuss', label: 'To discuss' }
    ],
    []
  );

  const discussCount = useMemo(() => items.filter((item) => item.user_action === 'discuss').length, [items]);
  const isFiltered = Boolean(query || filter);

  function clearSearch() {
    setQuery('');
    setFilter('');
  }

  if (loading) return <div className="loading-block">Loading…</div>;
  if (errorMessage && items.length === 0) {
    return <PageErrorState title="Nothing to show yet" message={errorMessage} onRetry={load} />;
  }

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Everything Firstlight found</div>
          <h1>What's New</h1>
          <p className="page-lede">
            Search and skim everything Firstlight has found. Mark anything you want to raise at the next visit, and set
            aside the things that are not relevant.
          </p>
        </div>
        <div className="page-header-actions">
          <span className="section-counter">{visible.length} shown</span>
        </div>
      </div>

      {errorMessage && <div className="callout callout-danger">{errorMessage}</div>}

      {undo && (
        <div className="callout undo-callout" role="status">
          <span>{undo.message}</span>
          <button className="link-button" type="button" onClick={handleUndo}>
            Undo
          </button>
        </div>
      )}

      <Card title="Find something specific" description="Search stays on this computer and runs over what Firstlight has already found.">
        <div className="toolbar toolbar-wide">
          <input
            placeholder="Search by trial, drug, sponsor, phase, or any words in the summary"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="toolbar-sort">
            <span className="muted">Sort by</span>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
              <option value="relevance">Most relevant</option>
              <option value="newest">Newest</option>
            </select>
          </label>
        </div>
        <div className="filter-chip-row">
          {filterOptions.map((option) => (
            <button
              key={option.value || 'all'}
              className={filter === option.value ? 'filter-chip active' : 'filter-chip'}
              onClick={() => setFilter(option.value)}
              type="button"
            >
              {option.label}
              {option.value === 'discuss' && discussCount > 0 ? ` (${discussCount})` : ''}
            </button>
          ))}
        </div>
        <label className="toggle-row dismissed-toggle">
          <input type="checkbox" checked={includeDismissed} onChange={(e) => setIncludeDismissed(e.target.checked)} />
          <div>
            <strong>Show items I set aside</strong>
            <div className="muted">Items you marked "not relevant" are hidden by default. Turn this on to review or restore them.</div>
          </div>
        </label>
      </Card>

      <Card title="Results" description="Each item keeps its source, evidence excerpt, and the plain reason it came up.">
        {visible.length === 0 ? (
          isFiltered ? (
            <EmptyState
              title="No matches"
              message={
                query
                  ? `Nothing matched “${query}”${filter ? ' with these filters' : ''}. Try different words or clear the search.`
                  : 'Nothing matched the current filters.'
              }
              action={
                <button className="secondary-button" type="button" onClick={clearSearch}>
                  Clear search and filters
                </button>
              }
            />
          ) : (
            <EmptyState title="Nothing here yet" message="Run a check from Today to see what Firstlight finds." />
          )
        ) : (
          <div className="finding-list">
            {visible.map((item) => (
              <FindingSummaryCard
                key={item.id}
                finding={item}
                showWhy
                onAction={(action) => handleAction(item, action)}
                actionPending={pendingId === item.id}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';

import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { FindingSummaryCard } from '../components/FindingSummaryCard';
import { PageErrorState } from '../components/PageErrorState';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import type { Finding, FindingAction, SourceConfig } from '../lib/types';

type SortKey = 'relevance' | 'newest';
type DateRangeKey = 'any' | '7d' | '30d' | '90d';

const STORAGE_KEY = 'firstlight.findingsPrefs';
const UNDO_TIMEOUT_MS = 8000;

const ACTION_CONFIRMATIONS: Record<FindingAction, string> = {
  discuss: 'Added to your list for the doctor.',
  dismissed: 'Set aside.',
  none: 'Moved back to your list.'
};

type FindingsPrefs = {
  query: string;
  filter: string;
  sortKey: SortKey;
  includeDismissed: boolean;
  sourceFilter: string;
  dateRange: DateRangeKey;
};

function readPrefs(): FindingsPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { query: '', filter: '', sortKey: 'relevance', includeDismissed: false, sourceFilter: '', dateRange: 'any' };
    }
    const parsed = JSON.parse(raw) as Partial<FindingsPrefs>;
    return {
      query: typeof parsed.query === 'string' ? parsed.query : '',
      filter: typeof parsed.filter === 'string' ? parsed.filter : '',
      sortKey: parsed.sortKey === 'newest' ? 'newest' : 'relevance',
      includeDismissed: Boolean(parsed.includeDismissed),
      sourceFilter: typeof parsed.sourceFilter === 'string' ? parsed.sourceFilter : '',
      dateRange: parsed.dateRange === '7d' || parsed.dateRange === '30d' || parsed.dateRange === '90d' ? parsed.dateRange : 'any'
    };
  } catch {
    return { query: '', filter: '', sortKey: 'relevance', includeDismissed: false, sourceFilter: '', dateRange: 'any' };
  }
}

function findingTimestamp(item: Finding): number {
  return new Date(item.published_at || item.retrieved_at).getTime();
}

function withinDateRange(item: Finding, range: DateRangeKey): boolean {
  if (range === 'any') return true;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return findingTimestamp(item) >= cutoff;
}

export function FindingsPage() {
  const initial = readPrefs();
  const [items, setItems] = useState<Finding[]>([]);
  const [sources, setSources] = useState<SourceConfig[]>([]);
  const [query, setQuery] = useState(initial.query);
  const [filter, setFilter] = useState(initial.filter);
  const [sortKey, setSortKey] = useState<SortKey>(initial.sortKey);
  const [includeDismissed, setIncludeDismissed] = useState(initial.includeDismissed);
  const [sourceFilter, setSourceFilter] = useState(initial.sourceFilter);
  const [dateRange, setDateRange] = useState<DateRangeKey>(initial.dateRange);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [undo, setUndo] = useState<{ id: number; previous: FindingAction; message: string } | null>(null);
  const undoTimer = useRef<number | null>(null);

  function clearUndoTimer() {
    if (undoTimer.current !== null) {
      window.clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
  }

  useEffect(() => clearUndoTimer, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ query, filter, sortKey, includeDismissed, sourceFilter, dateRange })
      );
    } catch {
      // best-effort
    }
  }, [query, filter, sortKey, includeDismissed, sourceFilter, dateRange]);

  async function load() {
    setLoading(true);
    setErrorMessage('');
    try {
      const [result, sourceResult] = await Promise.all([
        api.getFindings({ include_dismissed: includeDismissed }),
        api.getSources()
      ]);
      setItems(result.items);
      setSources(sourceResult);
      setSelected(new Set());
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

  async function handleBulk(action: FindingAction) {
    if (selected.size === 0) return;
    setBulkBusy(true);
    setErrorMessage('');
    try {
      await api.setFindingActionsBulk([...selected], action);
      setUndo(null);
      await load();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not update the selected items.'));
    } finally {
      setBulkBusy(false);
    }
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
      const matchesSource = sourceFilter ? item.source_name === sourceFilter : true;
      const matchesDate = withinDateRange(item, dateRange);
      return matchesFilter && matchesQuery && matchesSource && matchesDate;
    });

    if (sortKey === 'newest') {
      return [...filtered].sort((a, b) => findingTimestamp(b) - findingTimestamp(a));
    }
    return filtered;
  }, [items, query, filter, sortKey, sourceFilter, dateRange]);

  const filterOptions = useMemo(
    () => [
      { value: '', label: 'Everything' },
      { value: 'clinical_trials', label: 'Trials' },
      { value: 'literature', label: 'Research' },
      { value: 'discuss', label: 'To discuss' }
    ],
    []
  );

  const sourceOptions = useMemo(() => {
    const names = new Set<string>();
    sources.forEach((source) => names.add(source.name));
    items.forEach((item) => names.add(item.source_name));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [sources, items]);

  const discussCount = useMemo(() => items.filter((item) => item.user_action === 'discuss').length, [items]);
  const isFiltered = Boolean(query || filter || sourceFilter || dateRange !== 'any');

  function clearSearch() {
    setQuery('');
    setFilter('');
    setSourceFilter('');
    setDateRange('any');
  }

  function toggleSelected(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(visible.map((item) => item.id)));
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

      <Card title="Find something specific" description="Search stays on this computer. Your sort and filters are remembered on this device.">
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
          <label className="toolbar-sort">
            <span className="muted">Source</span>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <option value="">All sources</option>
              {sourceOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="toolbar-sort">
            <span className="muted">Date</span>
            <select value={dateRange} onChange={(e) => setDateRange(e.target.value as DateRangeKey)}>
              <option value="any">Any time</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
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

      {selected.size > 0 && (
        <Card title="Bulk actions" description={`${selected.size} selected`}>
          <div className="button-row">
            <button className="primary-button" type="button" disabled={bulkBusy} onClick={() => void handleBulk('discuss')}>
              Mark to discuss
            </button>
            <button className="secondary-button" type="button" disabled={bulkBusy} onClick={() => void handleBulk('dismissed')}>
              Set aside
            </button>
            <button className="secondary-button" type="button" disabled={bulkBusy} onClick={() => void handleBulk('none')}>
              Clear action
            </button>
            <button className="link-button" type="button" onClick={() => setSelected(new Set())}>
              Clear selection
            </button>
          </div>
        </Card>
      )}

      <Card
        title="Results"
        description="Each item keeps its source, evidence excerpt, and the plain reason it came up."
        action={
          visible.length > 0 ? (
            <button className="secondary-button" type="button" onClick={selectAllVisible}>
              Select all shown
            </button>
          ) : undefined
        }
      >
        {visible.length === 0 ? (
          isFiltered ? (
            <EmptyState
              title="No matches"
              message={
                query
                  ? `Nothing matched “${query}”${filter || sourceFilter || dateRange !== 'any' ? ' with these filters' : ''}. Try different words or clear the search.`
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
              <div key={item.id} className="finding-select-row">
                <label className="finding-select">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleSelected(item.id)}
                    aria-label={`Select ${item.title}`}
                  />
                </label>
                <FindingSummaryCard
                  finding={item}
                  showWhy
                  onAction={(action) => handleAction(item, action)}
                  actionPending={pendingId === item.id}
                />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

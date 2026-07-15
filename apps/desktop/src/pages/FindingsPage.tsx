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
type ReviewMode = 'needs_review' | 'archive';
type ViewMode = 'queue' | 'list';

const STORAGE_KEY = 'firstlight.findingsPrefs';
const UNDO_TIMEOUT_MS = 8000;

const MODE_ACTION: Record<ReviewMode, FindingAction> = {
  needs_review: 'none',
  archive: 'dismissed'
};

const ACTION_CONFIRMATIONS: Record<FindingAction, string> = {
  discuss: 'Saved for Discussion — waiting in Doctor Visit.',
  dismissed: 'Set aside.',
  none: 'Moved back to your review list.'
};

type FindingsPrefs = {
  query: string;
  filter: string;
  sortKey: SortKey;
  sourceFilter: string;
  dateRange: DateRangeKey;
  mode: ReviewMode;
  view: ViewMode;
  filtersOpen: boolean;
};

const DEFAULT_PREFS: FindingsPrefs = {
  query: '',
  filter: '',
  sortKey: 'relevance',
  sourceFilter: '',
  dateRange: 'any',
  mode: 'needs_review',
  view: 'queue',
  filtersOpen: false
};

function readPrefs(): FindingsPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<FindingsPrefs>;
    return {
      query: typeof parsed.query === 'string' ? parsed.query : '',
      filter: typeof parsed.filter === 'string' ? parsed.filter : '',
      sortKey: parsed.sortKey === 'newest' ? 'newest' : 'relevance',
      sourceFilter: typeof parsed.sourceFilter === 'string' ? parsed.sourceFilter : '',
      dateRange:
        parsed.dateRange === '7d' || parsed.dateRange === '30d' || parsed.dateRange === '90d' ? parsed.dateRange : 'any',
      mode: parsed.mode === 'archive' ? 'archive' : 'needs_review',
      view: parsed.view === 'list' ? 'list' : 'queue',
      filtersOpen: Boolean(parsed.filtersOpen)
    };
  } catch {
    return { ...DEFAULT_PREFS };
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

const MODE_TABS: { value: ReviewMode; label: string }[] = [
  { value: 'needs_review', label: 'Needs review' },
  { value: 'archive', label: 'Archive' }
];

const FILTER_OPTIONS = [
  { value: '', label: 'Everything' },
  { value: 'clinical_trials', label: 'Trials' },
  { value: 'literature', label: 'Research' }
];

export function FindingsPage() {
  const initial = readPrefs();
  const [items, setItems] = useState<Finding[]>([]);
  const [sources, setSources] = useState<SourceConfig[]>([]);
  const [query, setQuery] = useState(initial.query);
  const [filter, setFilter] = useState(initial.filter);
  const [sortKey, setSortKey] = useState<SortKey>(initial.sortKey);
  const [sourceFilter, setSourceFilter] = useState(initial.sourceFilter);
  const [dateRange, setDateRange] = useState<DateRangeKey>(initial.dateRange);
  const [mode, setMode] = useState<ReviewMode>(initial.mode);
  const [view, setView] = useState<ViewMode>(initial.view);
  const [filtersOpen, setFiltersOpen] = useState(initial.filtersOpen);
  const [queueIndex, setQueueIndex] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [undo, setUndo] = useState<{ id: number; previous: FindingAction; message: string } | null>(null);
  const undoTimer = useRef<number | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const viewRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const queueCardRef = useRef<HTMLDivElement | null>(null);
  const queueNavigated = useRef(false);

  function clearUndoTimer() {
    if (undoTimer.current !== null) {
      window.clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
  }

  useEffect(() => {
    return () => {
      clearUndoTimer();
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ query, filter, sortKey, sourceFilter, dateRange, mode, view, filtersOpen })
      );
    } catch {
      // best-effort
    }
  }, [query, filter, sortKey, sourceFilter, dateRange, mode, view, filtersOpen]);

  async function load() {
    setLoading(true);
    setErrorMessage('');
    try {
      // Load everything, including set-aside items, so all three review modes and
      // their counts stay accurate without reloading when the mode changes.
      const [result, sourceResult] = await Promise.all([
        api.getFindings({ include_dismissed: true }),
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
  }, []);

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
    const modeAction = MODE_ACTION[mode];
    const filtered = items.filter((item) => {
      if (item.user_action !== modeAction) return false;
      const matchesType = filter ? item.type === filter : true;
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
      return matchesType && matchesQuery && matchesSource && matchesDate;
    });

    if (sortKey === 'newest') {
      return [...filtered].sort((a, b) => findingTimestamp(b) - findingTimestamp(a));
    }
    return filtered;
  }, [items, query, filter, sortKey, sourceFilter, dateRange, mode]);

  // Keep the review-queue pointer within bounds as items leave the list.
  useEffect(() => {
    setQueueIndex((current) => {
      if (visible.length === 0) return 0;
      return Math.min(current, visible.length - 1);
    });
  }, [visible.length]);

  // After Back/Next, move focus to the freshly shown card so keyboard and
  // screen-reader users land on the new finding instead of a stale button.
  // The guard keeps focus untouched on initial load.
  useEffect(() => {
    if (!queueNavigated.current) return;
    queueCardRef.current?.focus({ preventScroll: false });
  }, [queueIndex]);

  const sourceOptions = useMemo(() => {
    const names = new Set<string>();
    sources.forEach((source) => names.add(source.name));
    items.forEach((item) => names.add(item.source_name));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [sources, items]);

  const modeCounts = useMemo(
    () => ({
      needs_review: items.filter((item) => item.user_action === 'none').length,
      archive: items.filter((item) => item.user_action === 'dismissed').length
    }),
    [items]
  );

  const isFiltered = Boolean(query || filter || sourceFilter || dateRange !== 'any');
  const activeFilterCount =
    (query ? 1 : 0) + (filter ? 1 : 0) + (sourceFilter ? 1 : 0) + (dateRange !== 'any' ? 1 : 0);

  function clearSearch() {
    setQuery('');
    setFilter('');
    setSourceFilter('');
    setDateRange('any');
  }

  function changeMode(next: ReviewMode) {
    setMode(next);
    setSelected(new Set());
    setQueueIndex(0);
  }

  function handleTablistKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const currentIndex = MODE_TABS.findIndex((tab) => tab.value === mode);
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (currentIndex + delta + MODE_TABS.length) % MODE_TABS.length;
    changeMode(MODE_TABS[nextIndex].value);
    tabRefs.current[nextIndex]?.focus();
  }

  function handleViewKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next: ViewMode = view === 'queue' ? 'list' : 'queue';
    setView(next);
    viewRefs.current[next === 'queue' ? 0 : 1]?.focus();
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

  if (loading) return <div className="loading-block" role="status">Loading…</div>;
  if (errorMessage && items.length === 0) {
    return <PageErrorState title="Nothing to show yet" message={errorMessage} onRetry={load} />;
  }

  const useQueue = mode === 'needs_review' && view === 'queue';
  const emptyForMode: Record<ReviewMode, { title: string; message: string }> = {
    needs_review: {
      title: "You're all caught up",
      message: 'Nothing is waiting for review. New items will appear here after your next check.'
    },
    archive: {
      title: 'Nothing set aside',
      message: 'Items you mark "not relevant" move here. You can always restore them.'
    }
  };
  const queueCurrent = visible[queueIndex];

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Everything Firstlight found</div>
          <h1>What's New</h1>
          <p className="page-lede">
            Work through new findings one at a time, keep the ones worth raising at the next visit, and set aside the
            rest.
          </p>
        </div>
        <div className="page-header-actions">
          <span className="section-counter">{visible.length} shown</span>
        </div>
      </div>

      {errorMessage && <div className="callout callout-danger" role="alert">{errorMessage}</div>}

      {undo && (
        <div className="callout undo-callout" role="status">
          <span>{undo.message}</span>
          <button className="link-button" type="button" onClick={handleUndo}>
            Undo
          </button>
        </div>
      )}

      <div className="mode-tabs" role="tablist" aria-label="Review status" onKeyDown={handleTablistKeyDown}>
        {MODE_TABS.map((tab, index) => (
          <button
            key={tab.value}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={mode === tab.value}
            tabIndex={mode === tab.value ? 0 : -1}
            className={mode === tab.value ? 'mode-tab active' : 'mode-tab'}
            onClick={() => changeMode(tab.value)}
          >
            <span className="mode-tab-label">{tab.label}</span>
            <span className="mode-tab-count">{modeCounts[tab.value]}</span>
          </button>
        ))}
      </div>

      <div className="findings-controls">
        {mode === 'needs_review' && visible.length > 0 && (
          <div className="segmented" role="group" aria-label="How to review" onKeyDown={handleViewKeyDown}>
            <button
              ref={(node) => {
                viewRefs.current[0] = node;
              }}
              type="button"
              className={view === 'queue' ? 'segmented-option active' : 'segmented-option'}
              aria-pressed={view === 'queue'}
              onClick={() => setView('queue')}
            >
              One at a time
            </button>
            <button
              ref={(node) => {
                viewRefs.current[1] = node;
              }}
              type="button"
              className={view === 'list' ? 'segmented-option active' : 'segmented-option'}
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
            >
              Full list
            </button>
          </div>
        )}
        <button
          type="button"
          className={filtersOpen ? 'secondary-button filters-toggle active' : 'secondary-button filters-toggle'}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          {filtersOpen ? 'Hide filters' : 'Filters'}
          {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
      </div>

      {filtersOpen && (
        <Card
          title="Find something specific"
          description="Search stays on this computer. Your sort and filters are remembered on this device."
        >
          <div className="toolbar toolbar-wide">
            <input
              id="findings-search"
              aria-label="Search findings"
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
            {FILTER_OPTIONS.map((option) => (
              <button
                key={option.value || 'all'}
                className={filter === option.value ? 'filter-chip active' : 'filter-chip'}
                onClick={() => setFilter(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          {isFiltered && (
            <button className="link-button" type="button" onClick={clearSearch}>
              Clear search and filters
            </button>
          )}
        </Card>
      )}

      {selected.size > 0 && (
        <Card title="Handle several findings at once" description={`${selected.size} selected`}>
          <div className="button-row">
            <button className="primary-button" type="button" disabled={bulkBusy} onClick={() => void handleBulk('discuss')}>
              Save for Discussion
            </button>
            <button className="secondary-button" type="button" disabled={bulkBusy} onClick={() => void handleBulk('dismissed')}>
              Set aside
            </button>
            <button className="secondary-button" type="button" disabled={bulkBusy} onClick={() => void handleBulk('none')}>
              Move back to review
            </button>
            <button className="link-button" type="button" onClick={() => setSelected(new Set())}>
              Clear selection
            </button>
          </div>
        </Card>
      )}

      {useQueue ? (
        <Card
          title="Review one at a time"
          description="Decide on each finding, then move to the next. This is the calmest way to get through what's new."
        >
          {visible.length === 0 ? (
            <EmptyState
              title={isFiltered ? 'No matches' : emptyForMode.needs_review.title}
              message={
                isFiltered
                  ? query
                    ? `Nothing matched “${query}”${filter || sourceFilter || dateRange !== 'any' ? ' with these filters' : ''}.`
                    : 'Nothing matched the current filters.'
                  : emptyForMode.needs_review.message
              }
              action={
                isFiltered ? (
                  <button className="secondary-button" type="button" onClick={clearSearch}>
                    Clear search and filters
                  </button>
                ) : undefined
              }
            />
          ) : queueCurrent ? (
            <div className="review-queue">
              <div className="review-queue-stepper">
                <span className="section-counter" aria-live="polite">
                  {queueIndex + 1} of {visible.length}
                </span>
                <div className="review-queue-progress" aria-hidden="true">
                  <div
                    className="review-queue-progress-bar"
                    style={{ width: `${((queueIndex + 1) / visible.length) * 100}%` }}
                  />
                </div>
              </div>
              <div ref={queueCardRef} tabIndex={-1}>
                <FindingSummaryCard
                  key={queueCurrent.id}
                  finding={queueCurrent}
                  showWhy
                  onAction={(action) => handleAction(queueCurrent, action)}
                  actionPending={pendingId === queueCurrent.id}
                />
              </div>
              <div className="button-row review-queue-nav">
                <button
                  className="ghost-button"
                  type="button"
                  disabled={queueIndex === 0}
                  onClick={() => {
                    queueNavigated.current = true;
                    setQueueIndex((current) => Math.max(0, current - 1));
                  }}
                >
                  Back
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={queueIndex >= visible.length - 1}
                  onClick={() => {
                    queueNavigated.current = true;
                    setQueueIndex((current) => Math.min(visible.length - 1, current + 1));
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : (
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
              <EmptyState title={emptyForMode[mode].title} message={emptyForMode[mode].message} />
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
      )}
    </div>
  );
}

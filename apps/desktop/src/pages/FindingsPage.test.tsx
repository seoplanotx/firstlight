import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FindingsPage } from './FindingsPage';
import { api } from '../lib/api';
import type { Finding } from '../lib/types';

vi.mock('../lib/api', () => ({
  api: {
    getFindings: vi.fn(),
    getSources: vi.fn(),
    setFindingAction: vi.fn(),
    setFindingActionsBulk: vi.fn()
  }
}));

const mockedApi = vi.mocked(api);

function buildFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 1,
    profile_id: 1,
    type: 'clinical_trials',
    title: 'A finding',
    source_name: 'ClinicalTrials.gov',
    source_url: 'https://clinicaltrials.gov/study/NCT1',
    external_identifier: 'NCT1',
    retrieved_at: '2026-06-01T00:00:00Z',
    structured_tags: [],
    raw_summary: 'Summary.',
    normalized_summary: 'Summary.',
    confidence: 'medium',
    score: 50,
    relevance_label: 'Worth reviewing',
    status: 'new',
    user_action: 'none',
    matching_gaps: [],
    match_debug: {},
    llm_metadata: {},
    evidence_items: [],
    trial_phases: [],
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...overrides
  };
}

const lowScoreRecent = buildFinding({
  id: 1,
  title: 'Low score, newer',
  score: 30,
  published_at: '2026-06-10T00:00:00Z',
  updated_at: '2026-06-10T00:00:00Z'
});
const highScoreOlder = buildFinding({
  id: 2,
  title: 'High score, older',
  score: 90,
  published_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z'
});

function findingTitles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.finding-title')).map((el) => el.textContent || '');
}

describe('FindingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockedApi.getFindings.mockResolvedValue({ total: 2, items: [highScoreOlder, lowScoreRecent] });
    mockedApi.getSources.mockResolvedValue([
      {
        id: 1,
        category: 'clinical_trials',
        name: 'ClinicalTrials.gov',
        connector_key: 'clinicaltrials_gov',
        enabled: true,
        settings_json: {}
      }
    ]);
    mockedApi.setFindingAction.mockResolvedValue(buildFinding());
  });

  it('defaults to Needs review and steps through findings one at a time', async () => {
    render(<FindingsPage />);
    await screen.findByText('High score, older');

    // Queue view shows a single card with a "1 of N" stepper.
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(screen.queryByText('Low score, newer')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    expect(screen.getByText('Low score, newer')).toBeInTheDocument();
  });

  it('preserves the backend ranking in the full list and re-sorts by date for Newest', async () => {
    const { container } = render(<FindingsPage />);
    await screen.findByText('High score, older');

    await userEvent.click(screen.getByRole('button', { name: /full list/i }));
    expect(findingTitles(container)).toEqual(['High score, older', 'Low score, newer']);

    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    await userEvent.selectOptions(screen.getByDisplayValue('Most relevant'), 'newest');
    expect(findingTitles(container)).toEqual(['Low score, newer', 'High score, older']);
  });

  it('keeps saved-for-discussion items out of review and archived findings in their own tab', async () => {
    const saved = buildFinding({ id: 3, title: 'Saved item', user_action: 'discuss' });
    const archived = buildFinding({ id: 4, title: 'Archived item', user_action: 'dismissed' });
    mockedApi.getFindings.mockResolvedValue({ total: 3, items: [highScoreOlder, saved, archived] });

    render(<FindingsPage />);
    await screen.findByText('High score, older');
    // Saved items live in Doctor Visit -> Saved for Discussion, not in a review tab here.
    expect(screen.queryByText('Saved item')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /saved/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /archive/i }));
    expect(await screen.findByText('Archived item')).toBeInTheDocument();
    expect(screen.queryByText('High score, older')).not.toBeInTheDocument();
  });

  it('confirms an action and restores the previous state on undo', async () => {
    render(<FindingsPage />);
    await screen.findByText('High score, older');

    const card = screen.getByText('High score, older').closest('.finding-item') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: /not relevant/i }));

    await waitFor(() => expect(mockedApi.setFindingAction).toHaveBeenCalledWith(2, 'dismissed'));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/set aside/i);

    await userEvent.click(within(status).getByRole('button', { name: /undo/i }));
    await waitFor(() => expect(mockedApi.setFindingAction).toHaveBeenLastCalledWith(2, 'none'));
  });

  it('echoes the query in the empty state and clears it on demand', async () => {
    render(<FindingsPage />);
    await screen.findByText('High score, older');

    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    await userEvent.type(screen.getByPlaceholderText(/search by trial/i), 'zzz-no-match');
    expect(await screen.findByText(/zzz-no-match/)).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: /clear search and filters/i })[0]);
    expect(screen.getByText('High score, older')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FindingSummaryCard } from './FindingSummaryCard';
import type { Finding } from '../lib/types';

function buildFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 1,
    profile_id: 1,
    type: 'clinical_trials',
    title: 'EGFR-directed therapy after osimertinib progression',
    source_name: 'ClinicalTrials.gov',
    source_url: 'https://clinicaltrials.gov/study/NCT123',
    external_identifier: 'NCT123',
    retrieved_at: '2026-06-01T00:00:00Z',
    structured_tags: [],
    raw_summary: 'A study summary.',
    normalized_summary: 'A recruiting Phase 2 study for metastatic EGFR-mutated NSCLC.',
    why_it_surfaced: 'Matches your cancer type and EGFR biomarker.',
    why_it_may_not_fit: 'Eligibility may exclude prior osimertinib.',
    confidence: 'medium',
    score: 42,
    relevance_label: 'Worth reviewing',
    status: 'new',
    matching_gaps: [],
    match_debug: {},
    llm_metadata: {},
    evidence_items: [],
    primary_evidence_label: 'Eligibility criteria excerpt',
    primary_evidence_snippet: 'Inclusion: metastatic EGFR-mutated NSCLC.',
    trial_phases: ['Phase 2'],
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...overrides
  };
}

describe('FindingSummaryCard', () => {
  it('renders the title, type label, and conservative relevance badge', () => {
    render(<FindingSummaryCard finding={buildFinding()} />);
    expect(screen.getByText('EGFR-directed therapy after osimertinib progression')).toBeInTheDocument();
    expect(screen.getAllByText('Clinical trial').length).toBeGreaterThan(0);
    expect(screen.getByText('Worth reviewing')).toBeInTheDocument();
  });

  it('shows rationale only when showWhy is enabled', () => {
    const { rerender } = render(<FindingSummaryCard finding={buildFinding()} showWhy={false} />);
    expect(screen.queryByText('Why it surfaced')).not.toBeInTheDocument();

    rerender(<FindingSummaryCard finding={buildFinding()} showWhy />);
    expect(screen.getByText('Why it surfaced')).toBeInTheDocument();
    expect(screen.getByText('Matches your cancer type and EGFR biomarker.')).toBeInTheDocument();
  });

  it('renders the evidence snippet and a source link', () => {
    render(<FindingSummaryCard finding={buildFinding()} />);
    expect(screen.getByText('Inclusion: metastatic EGFR-mutated NSCLC.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /open source record/i });
    expect(link).toHaveAttribute('href', 'https://clinicaltrials.gov/study/NCT123');
  });
});

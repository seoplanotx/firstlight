import type { BadgeTone } from '../components/Badge';
import type { LanguageMode } from './languageMode';

// Plain-language wording for the family-facing default, with the clinical
// register preserved for users who turn it on in Settings.
const RELEVANCE_PLAIN_LABELS: Record<string, string> = {
  'High relevance': 'Strong match',
  'Worth reviewing': 'Worth a look',
  'Low confidence': 'Possible match',
  'Insufficient data': 'Not enough detail yet'
};

const STATUS_PLAIN_LABELS: Record<string, string> = {
  new: 'New',
  changed: 'Updated',
  unchanged: 'Seen before',
  seen: 'Seen before'
};

export function formatStatusLabel(status: string, mode: LanguageMode = 'clinical') {
  if (mode === 'plain') {
    return STATUS_PLAIN_LABELS[status] || status.replace(/_/g, ' ');
  }
  return status.replace(/_/g, ' ').toUpperCase();
}

export function formatRelevanceLabel(relevanceLabel: string, mode: LanguageMode = 'clinical') {
  if (mode === 'plain') {
    return RELEVANCE_PLAIN_LABELS[relevanceLabel] || relevanceLabel;
  }
  return relevanceLabel;
}

export function formatFindingTypeLabel(type: string) {
  if (type === 'clinical_trials') return 'Clinical trial';
  if (type === 'drug_updates') return 'Drug update';
  if (type === 'literature') return 'Literature';
  if (type === 'biomarker') return 'Biomarker';
  return type.replace(/_/g, ' ');
}

export function typeTone(type: string): BadgeTone {
  if (type === 'clinical_trials') return 'info';
  if (type === 'drug_updates') return 'warning';
  if (type === 'biomarker') return 'success';
  return 'neutral';
}

export function statusTone(status: string): BadgeTone {
  if (status === 'new') return 'info';
  if (status === 'changed') return 'warning';
  return 'neutral';
}

export function relevanceTone(relevanceLabel: string): BadgeTone {
  if (relevanceLabel === 'High relevance') return 'success';
  if (relevanceLabel === 'Worth reviewing') return 'info';
  if (relevanceLabel === 'Low confidence') return 'warning';
  // "Insufficient data" is a low-information signal, not an alarm: red is
  // reserved for blockers, so keep this neutral.
  return 'neutral';
}

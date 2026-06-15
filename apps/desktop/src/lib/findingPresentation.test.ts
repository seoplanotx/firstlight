import { describe, expect, it } from 'vitest';
import {
  formatFindingTypeLabel,
  formatRelevanceLabel,
  formatStatusLabel,
  relevanceTone,
  statusTone,
  typeTone
} from './findingPresentation';

describe('findingPresentation', () => {
  it('labels known finding types and humanizes unknown ones', () => {
    expect(formatFindingTypeLabel('clinical_trials')).toBe('Clinical trial');
    expect(formatFindingTypeLabel('literature')).toBe('Literature');
    expect(formatFindingTypeLabel('mystery_source')).toBe('mystery source');
  });

  it('uppercases status labels in the clinical register', () => {
    expect(formatStatusLabel('new')).toBe('NEW');
    expect(formatStatusLabel('changed')).toBe('CHANGED');
  });

  it('uses plain-language wording when plain mode is requested', () => {
    expect(formatStatusLabel('new', 'plain')).toBe('New');
    expect(formatStatusLabel('changed', 'plain')).toBe('Updated');
    expect(formatRelevanceLabel('Worth reviewing', 'plain')).toBe('Worth a look');
    expect(formatRelevanceLabel('Insufficient data', 'plain')).toBe('Not enough detail yet');
    // Clinical mode preserves the original labels.
    expect(formatRelevanceLabel('Worth reviewing', 'clinical')).toBe('Worth reviewing');
  });

  it('maps relevance labels to conservative tones', () => {
    expect(relevanceTone('High relevance')).toBe('success');
    expect(relevanceTone('Worth reviewing')).toBe('info');
    expect(relevanceTone('Low confidence')).toBe('warning');
    // Red is reserved for blockers; a low-information signal stays neutral.
    expect(relevanceTone('Insufficient data')).toBe('neutral');
  });

  it('maps type and status tones', () => {
    expect(typeTone('clinical_trials')).toBe('info');
    expect(typeTone('something_else')).toBe('neutral');
    expect(statusTone('new')).toBe('info');
    expect(statusTone('seen')).toBe('neutral');
  });
});

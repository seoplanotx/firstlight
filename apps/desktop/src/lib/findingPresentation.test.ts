import { describe, expect, it } from 'vitest';
import {
  formatFindingTypeLabel,
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

  it('uppercases status labels', () => {
    expect(formatStatusLabel('new')).toBe('NEW');
    expect(formatStatusLabel('changed')).toBe('CHANGED');
  });

  it('maps relevance labels to conservative tones', () => {
    expect(relevanceTone('High relevance')).toBe('success');
    expect(relevanceTone('Worth reviewing')).toBe('info');
    expect(relevanceTone('Low confidence')).toBe('warning');
    expect(relevanceTone('Insufficient data')).toBe('danger');
  });

  it('maps type and status tones', () => {
    expect(typeTone('clinical_trials')).toBe('info');
    expect(typeTone('something_else')).toBe('neutral');
    expect(statusTone('new')).toBe('info');
    expect(statusTone('seen')).toBe('neutral');
  });
});

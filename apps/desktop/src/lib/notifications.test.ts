import { describe, expect, it } from 'vitest';
import { decideNotification, isQuietHours } from './notifications';

const at = (hour: number) => new Date(2026, 0, 1, hour, 0, 0);

describe('isQuietHours', () => {
  it('suppresses late night and early morning', () => {
    expect(isQuietHours(at(23))).toBe(true);
    expect(isQuietHours(at(0))).toBe(true);
    expect(isQuietHours(at(3))).toBe(true);
    expect(isQuietHours(at(7))).toBe(true);
  });

  it('allows daytime and evening', () => {
    expect(isQuietHours(at(8))).toBe(false);
    expect(isQuietHours(at(12))).toBe(false);
    expect(isQuietHours(at(22))).toBe(false);
  });
});

describe('decideNotification', () => {
  const base = { latestRunId: 5, hasFindings: true, lastNotifiedId: 3, enabled: true, now: at(12) };

  it('baselines the first observation without notifying', () => {
    expect(decideNotification({ ...base, lastNotifiedId: 0 })).toEqual({ notify: false, advanceMarkerTo: 5 });
  });

  it('does nothing when no newer run exists', () => {
    expect(decideNotification({ ...base, latestRunId: 3 })).toEqual({ notify: false, advanceMarkerTo: null });
  });

  it('notifies for a newer run with findings during the day', () => {
    expect(decideNotification(base)).toEqual({ notify: true, advanceMarkerTo: 5 });
  });

  it('advances quietly when the newer run has nothing to surface', () => {
    expect(decideNotification({ ...base, hasFindings: false })).toEqual({ notify: false, advanceMarkerTo: 5 });
  });

  it('respects the off switch by advancing without notifying', () => {
    expect(decideNotification({ ...base, enabled: false })).toEqual({ notify: false, advanceMarkerTo: 5 });
  });

  it('holds during quiet hours so it can fire once they end', () => {
    expect(decideNotification({ ...base, now: at(3) })).toEqual({ notify: false, advanceMarkerTo: null });
  });
});

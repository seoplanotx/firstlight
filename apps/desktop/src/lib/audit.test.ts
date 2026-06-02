import { describe, expect, it } from 'vitest';
import { formatAuditAction, formatAuditTimestamp } from './audit';

describe('formatAuditAction', () => {
  it('maps known actions to readable labels', () => {
    expect(formatAuditAction('profile_created')).toBe('Profile created');
    expect(formatAuditAction('monitoring_run_completed')).toBe('Monitoring run completed');
    expect(formatAuditAction('data_deleted')).toBe('All local data deleted');
  });

  it('humanizes unknown actions by replacing underscores', () => {
    expect(formatAuditAction('some_new_event')).toBe('some new event');
  });
});

describe('formatAuditTimestamp', () => {
  it('formats a valid ISO timestamp', () => {
    const formatted = formatAuditTimestamp('2026-06-02T10:00:00Z');
    expect(formatted).not.toBe('2026-06-02T10:00:00Z');
    expect(formatted.length).toBeGreaterThan(0);
  });

  it('returns the raw value when the timestamp is invalid', () => {
    expect(formatAuditTimestamp('not-a-date')).toBe('not-a-date');
  });
});

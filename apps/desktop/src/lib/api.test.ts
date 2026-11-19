import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, normalizeRunTime, toSettingsUpdate } from './api';
import { formatLocalDate } from './appointmentPrefs';
import type { AppSettings } from './types';

describe('settings payloads', () => {
  it('normalizes run times to strict HH:MM', () => {
    expect(normalizeRunTime('8:30')).toBe('08:30');
    expect(normalizeRunTime('08:30:00')).toBe('08:30');
    expect(normalizeRunTime('23:05')).toBe('23:05');
    expect(normalizeRunTime('')).toBe('');
  });

  it('sends only update-schema fields', () => {
    const read = {
      id: 1,
      daily_run_time: '7:15',
      default_report_style: 'clinical',
      default_report_length: 'daily_summary',
      demo_profile_enabled: false,
      privacy_mode: 'local_only',
      deidentified_ai_disclosure_acknowledged: false,
      timezone_label: 'local',
      last_health_check_at: '2026-01-01T00:00:00Z'
    } as AppSettings;
    const update = toSettingsUpdate(read);
    expect(update).not.toHaveProperty('id');
    expect(update).not.toHaveProperty('timezone_label');
    expect(update.daily_run_time).toBe('07:15');
  });
});

describe('error messages', () => {
  afterEach(() => vi.restoreAllMocks());

  it('turns FastAPI validation errors into readable text', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: [{ loc: ['body', 'daily_run_time'], msg: "String should match pattern '^([01]\\d|2[0-3]):[0-5]\\d$'" }]
        }),
        { status: 422, headers: { 'content-type': 'application/json' } }
      )
    );
    await expect(api.getSettings()).rejects.toThrow(/Please check: Daily run time: String should match pattern/);
  });
});

describe('formatLocalDate', () => {
  it('keeps the calendar day the user picked', () => {
    expect(formatLocalDate('2026-07-28')).toBe(new Date(2026, 6, 28).toLocaleDateString());
  });
});

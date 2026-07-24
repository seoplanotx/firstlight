import { expect, test } from '@playwright/test';

test('first launch onboarding reaches the dashboard and support surface', async ({ page }) => {
  // Inputs wired to a <datalist> (e.g. Cancer type) expose the ARIA combobox
  // role rather than textbox, so target the underlying control directly.
  const fieldTextbox = (label: string) =>
    page
      .locator('.field')
      .filter({ has: page.getByText(label, { exact: true }) })
      .locator('input, textarea')
      .first();

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'A steady trial and literature briefing routine.' })).toBeVisible();

  await page.getByRole('button', { name: 'Start setup' }).click();

  await fieldTextbox('Who is this profile for?').fill('Smoke profile');
  await fieldTextbox('Cancer type').fill('Non-small cell lung cancer');
  await page.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page.getByText('Enabled real sources')).toBeVisible();
  // The sources step now requires acknowledging the local-only privacy promise.
  await page.getByRole('checkbox', { name: /I understand my information stays/ }).check();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'Run health check' }).click();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'Open dashboard' }).click();

  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Monitoring for Smoke profile/)).toBeVisible();
  await expect(page.getByText('Automatic runs happen only while Firstlight is open.', { exact: true })).toBeVisible();

  await page.goto('/#/support');
  await expect(page.getByRole('heading', { name: 'About / Support' })).toBeVisible();
  await expect(page.getByText('Local storage')).toBeVisible();

  // Honest-scope surface and data-ownership controls (Workstreams B + F).
  await expect(page.getByRole('heading', { name: "What Firstlight is — and isn't" })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export my data' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Delete all my data' })).toBeVisible();

  // The activity log should record the profile created during onboarding.
  await expect(page.getByText('Profile created')).toBeVisible({ timeout: 15_000 });

  // Exporting writes a local JSON copy through the real backend.
  await page.getByRole('button', { name: 'Export my data' }).click();
  await expect(page.getByText(/exported to a local JSON file/i)).toBeVisible({ timeout: 15_000 });
});

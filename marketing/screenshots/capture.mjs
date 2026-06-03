// Capture real Coffey product screenshots with headless Chromium.
//
//   node marketing/screenshots/capture.mjs onboarding   # pre-onboarding welcome
//   node marketing/screenshots/capture.mjs app           # the eight main screens
//
// Requires the Vite dev server + local backend running (see capture.sh).
// Uses puppeteer-core + @sparticuz/chromium so no browser CDN download is needed.
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import fs from 'node:fs';

chromium.setGraphicsMode = false;

const BASE = process.env.SHOT_BASE || 'http://127.0.0.1:1421';
const OUT = process.env.SHOT_OUT || 'marketing/screenshots/raw';
const phase = process.argv[2] || 'app';

fs.mkdirSync(OUT, { recursive: true });

const APP_ROUTES = [
  ['dashboard', '/', 'Dashboard'],
  ['findings', '/findings', 'Findings'],
  ['trials', '/trials', 'Trial'],
  ['updates', '/updates', 'Updates'],
  ['reports', '/reports', 'Reports'],
  ['profile', '/profile', 'Profile'],
  ['settings', '/settings', 'Settings'],
  ['support', '/support', 'Support'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
  executablePath: await chromium.executablePath(),
  headless: chromium.headless,
});
const page = await browser.newPage();
await page.setViewport({ width: 1360, height: 900, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('  pageerror:', e.message));

async function waitForText(text, timeout = 20000) {
  try {
    await page.waitForFunction(
      (t) => document.body && document.body.innerText.includes(t),
      { timeout },
      text
    );
  } catch {
    console.log(`  (text "${text}" not found)`);
  }
}

async function shoot(name, hash, waitText) {
  await page.goto(`${BASE}/#${hash}`, { waitUntil: 'networkidle0', timeout: 60000 });
  if (waitText) await waitForText(waitText);
  await sleep(1400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
}

if (phase === 'onboarding') {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0', timeout: 60000 });
  await waitForText('setup');
  await sleep(1600);
  await page.screenshot({ path: `${OUT}/onboarding.png` });
  console.log('shot onboarding');
} else {
  for (const [name, hash, waitText] of APP_ROUTES) {
    await shoot(name, hash, waitText);
  }
}

await browser.close();

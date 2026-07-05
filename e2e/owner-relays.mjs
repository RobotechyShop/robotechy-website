/**
 * E2E: store owner opens the Relays settings and re-publishes the catalog.
 *
 * Inject the owner login, open the storefront's "Relays" dialog (owner-only),
 * capture the relay editor + NIP-65 guidance, and exercise the "Re-publish my
 * catalog to these relays" action.
 *
 * Prereqs: storefront served in test mode (`npm run dev -- --mode test`),
 * Playwright + Chromium installed.
 *
 * Env:
 *   BASE_URL  storefront URL                 (default http://localhost:8080)
 *   NSEC      store-owner / test merchant key (required; MERCHANT_NSEC)
 *   HEADLESS  true | false                    (default true)
 *   SHOT_DIR  screenshot output dir           (optional; writes 0N-*.png)
 *
 * Usage:
 *   NSEC=nsec1… SHOT_DIR=docs/screenshots/78 node e2e/owner-relays.mjs
 */
import { chromium } from 'playwright';
import { injectOwnerLogin } from './owner-login.mjs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const NSEC = process.env.NSEC;
const HEADLESS = process.env.HEADLESS !== 'false';
const SHOT_DIR = process.env.SHOT_DIR;

if (!NSEC) throw new Error('NSEC (store-owner key) is required');

const shot = (name) => (SHOT_DIR ? `${SHOT_DIR}/${name}` : null);

const browser = await chromium.launch({ headless: HEADLESS, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
await injectOwnerLogin(page, NSEC);

await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);

// 1. Owner toolbar with the new "Relays" button (owner-only).
const relaysButton = page.getByRole('button', { name: /^relays$/i }).first();
await relaysButton.waitFor({ state: 'visible', timeout: 15000 });
if (SHOT_DIR) {
  await page.screenshot({ path: shot('01-owner-toolbar.png'), clip: { x: 0, y: 0, width: 1280, height: 200 } });
  console.log('saved', shot('01-owner-toolbar.png'));
}

// 2. The Relays dialog: NIP-65 relay editor + re-publish action.
await relaysButton.click();
const dialog = page.locator('[role="dialog"]').first();
await dialog.waitFor({ state: 'visible', timeout: 10000 });
await page.waitForTimeout(500);
if (SHOT_DIR) {
  await dialog.screenshot({ path: shot('02-relays-dialog.png') });
  console.log('saved', shot('02-relays-dialog.png'));
}

// 3. Re-publish the catalog to the write relays, capture the result toast.
await dialog.getByRole('button', { name: /re-publish my catalog/i }).click();
await page.waitForTimeout(4000);
if (SHOT_DIR) {
  await page.screenshot({ path: shot('03-republish-toast.png'), clip: { x: 0, y: 0, width: 1280, height: 1000 } });
  console.log('saved', shot('03-republish-toast.png'));
}

console.log('OWNER RELAYS OK');
await browser.close();
process.exit(0);

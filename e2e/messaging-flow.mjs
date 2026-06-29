/**
 * E2E: NIP-17 messaging flow (open Messages drawer → sign in → send a DM).
 *
 * Prereqs: a running storefront dev server, Playwright + Chromium installed.
 *   npm i -D playwright && npx playwright install chromium
 *
 * Env:
 *   BASE_URL   storefront URL          (default http://localhost:8080)
 *   NSEC       throwaway buyer key     (required)
 *   MESSAGE    text to send            (default a stock question)
 *   HEADLESS   true | false            (default true)
 *   SHOT       screenshot output path  (optional)
 *
 * Usage:
 *   NSEC=nsec1… node e2e/messaging-flow.mjs
 */
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const NSEC = process.env.NSEC;
const MESSAGE = process.env.MESSAGE || 'Hi! Is the Nostr Badge in stock and ready to ship? 🦔';
const HEADLESS = process.env.HEADLESS !== 'false';
const SHOT = process.env.SHOT;

if (!NSEC) throw new Error('NSEC is required');

const browser = await chromium.launch({ headless: HEADLESS, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });

await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);

// 1) Open the Messages drawer.
await page.locator('[aria-label="Messages"]').first().click();
await page.waitForTimeout(1000);

// 2) Sign in from inside the drawer.
const drawer = page.locator('[role="dialog"]').first();
await drawer.getByRole('button', { name: /sign in/i }).first().click();
await page.waitForTimeout(1200);
try { await page.getByRole('tab', { name: /key/i }).click({ timeout: 2000 }); } catch { /* already on key tab */ }
await page.locator('#nsec').fill(NSEC);
await page.getByRole('button', { name: /^log ?in$/i }).first().click();
await page.waitForTimeout(4000);

// 3) Re-open the drawer if the login dialog closed it, then send a message.
if ((await page.locator('[role="dialog"]').count()) === 0) {
  await page.locator('[aria-label="Messages"]').first().click();
  await page.waitForTimeout(1500);
}
const composer = page.getByPlaceholder(/Type a message/i).first();
await composer.fill(MESSAGE);
await composer.press('Enter');
console.log('sent:', MESSAGE);
await page.waitForTimeout(6000);

// 4) Verify the sent bubble rendered.
await page.getByText(MESSAGE, { exact: false }).first().waitFor({ timeout: 10000 });
if (SHOT) { await page.screenshot({ path: SHOT }); console.log('saved', SHOT); }
console.log('MESSAGING FLOW OK');
await browser.close();
process.exit(0);

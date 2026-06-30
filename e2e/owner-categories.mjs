/**
 * E2E: store owner amends categories — manages the collection taxonomy
 * (Gamma Markets kind 30405) that drives the storefront's category filter.
 *
 * Inject the owner login, open the "Categories & collections" dialog, create a
 * collection, and assert it appears in the list of collections.
 *
 * Prereqs: storefront served in test mode (`npm run dev -- --mode test`).
 *
 * Env:
 *   BASE_URL  storefront URL                 (default http://localhost:8080)
 *   NSEC      store-owner / test merchant key (required)
 *   TITLE     collection title                (default "Seed Signers <ts>")
 *   HEADLESS  true | false                    (default true)
 *   SHOT      screenshot output path          (optional)
 */
import { chromium } from 'playwright';
import { injectOwnerLogin } from './owner-login.mjs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const NSEC = process.env.NSEC;
const TITLE = process.env.TITLE || `Seed Signers ${Date.now()}`;
const HEADLESS = process.env.HEADLESS !== 'false';
const SHOT = process.env.SHOT;

if (!NSEC) throw new Error('NSEC (store-owner key) is required');

const browser = await chromium.launch({ headless: HEADLESS, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
await injectOwnerLogin(page, NSEC);

await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);

await page.getByRole('button', { name: /categories.*collections/i }).first().click();
await page.waitForTimeout(800);

const dialog = page.locator('[role="dialog"]').first();
await dialog.locator('#collection-title').fill(TITLE);
await dialog.locator('#collection-description').fill('Created by the owner-categories e2e flow');

await dialog.getByRole('button', { name: /create collection/i }).click();

// The new collection should appear in the list (form resets after save).
await dialog.getByText(TITLE, { exact: false }).first().waitFor({ timeout: 30000 });

if (SHOT) {
  await dialog.screenshot({ path: SHOT });
  console.log('saved', SHOT);
}

console.log('CATEGORIES OK:', TITLE);
await browser.close();
process.exit(0);

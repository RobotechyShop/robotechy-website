/**
 * E2E: store owner amends shipping options (Gamma Markets kind 30406).
 *
 * Inject the owner login, open the "Shipping options" dialog, add a shipping
 * method, and assert it appears in the list of the owner's shipping methods.
 *
 * Prereqs: storefront served in test mode (`npm run dev -- --mode test`).
 *
 * Env:
 *   BASE_URL  storefront URL                 (default http://localhost:8080)
 *   NSEC      store-owner / test merchant key (required)
 *   TITLE     shipping method title           (default "UK Standard <ts>")
 *   HEADLESS  true | false                    (default true)
 *   SHOT      screenshot output path          (optional)
 */
import { chromium } from 'playwright';
import { injectOwnerLogin } from './owner-login.mjs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const NSEC = process.env.NSEC;
const TITLE = process.env.TITLE || `UK Standard ${Date.now()}`;
const HEADLESS = process.env.HEADLESS !== 'false';
const SHOT = process.env.SHOT;

if (!NSEC) throw new Error('NSEC (store-owner key) is required');

const browser = await chromium.launch({ headless: HEADLESS, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
await injectOwnerLogin(page, NSEC);

await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);

await page.getByRole('button', { name: /shipping options/i }).first().click();
await page.waitForTimeout(800);

const dialog = page.locator('[role="dialog"]').first();
await dialog.locator('#shipping-title').fill(TITLE);
await dialog.locator('#shipping-price').fill('500');
// Currency is a Select dropdown since #101 — pick SATS from the listbox.
await dialog.locator('#shipping-currency').click();
await page.getByRole('option', { name: 'SATS', exact: true }).click();
await dialog.locator('#shipping-countries').fill('GB, IE');
await dialog.locator('#shipping-carrier').fill('Royal Mail');

await dialog.getByRole('button', { name: /add shipping option/i }).click();

// The new option should appear in the list (editor resets after save).
await dialog.getByText(TITLE, { exact: false }).first().waitFor({ timeout: 30000 });

if (SHOT) {
  await dialog.screenshot({ path: SHOT });
  console.log('saved', SHOT);
}

console.log('SHIPPING OK:', TITLE);
await browser.close();
process.exit(0);

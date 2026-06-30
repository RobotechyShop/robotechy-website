/**
 * E2E: store owner adds a new product (NIP-99 kind 30402).
 *
 * Inject the owner login, open the storefront's "Add product" dialog, fill the
 * form, publish, and assert the dialog closes (a successful publish closes it).
 *
 * Prereqs: storefront served in test mode (`npm run dev -- --mode test`),
 * Playwright + Chromium installed.
 *
 * Env:
 *   BASE_URL  storefront URL                 (default http://localhost:8080)
 *   NSEC      store-owner / test merchant key (required; MERCHANT_NSEC)
 *   TITLE     product title to create         (default "E2E Widget <ts>")
 *   HEADLESS  true | false                    (default true)
 *   SHOT      screenshot output path          (optional)
 *
 * Usage:
 *   NSEC=nsec1… node e2e/owner-add-product.mjs
 */
import { chromium } from 'playwright';
import { injectOwnerLogin } from './owner-login.mjs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const NSEC = process.env.NSEC;
const TITLE = process.env.TITLE || `E2E Widget ${Date.now()}`;
const HEADLESS = process.env.HEADLESS !== 'false';
const SHOT = process.env.SHOT;

if (!NSEC) throw new Error('NSEC (store-owner key) is required');

const browser = await chromium.launch({ headless: HEADLESS, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
await injectOwnerLogin(page, NSEC);

await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);

// Owner toolbar is only visible to the merchant.
await page.getByRole('button', { name: /add product/i }).first().click();
await page.waitForTimeout(800);

const dialog = page.locator('[role="dialog"]').first();
await dialog.locator('#product-title').fill(TITLE);
await dialog.locator('#product-summary').fill('Created by the owner-add-product e2e flow');
await dialog.locator('#product-description').fill('A **test** product published over Nostr.');
await dialog.locator('#product-price').fill('12345');
await dialog.locator('#product-currency').fill('SATS');
await dialog.locator('[aria-label="Image URL 1"]').fill('https://robotechy.com/images/nostr-badge.png');
await dialog.locator('#product-category').fill('e2e');
await dialog.getByRole('button', { name: /^add$/i }).click();

if (SHOT) {
  await dialog.screenshot({ path: SHOT });
  console.log('saved', SHOT);
}

await dialog.getByRole('button', { name: /publish product/i }).click();

// A successful publish closes the dialog.
await page.locator('[role="dialog"]').first().waitFor({ state: 'detached', timeout: 30000 });
console.log('ADD PRODUCT OK:', TITLE);
await browser.close();
process.exit(0);

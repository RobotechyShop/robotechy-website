/**
 * E2E: store owner edits an existing product and republishes it (same `d` tag).
 *
 * Inject the owner login, open a product detail page, open the owner "Edit
 * product" dialog, change the price, save, and assert the dialog closes.
 *
 * Prereqs: storefront in test mode with at least one product owned by the test
 * merchant (run owner-add-product.mjs first if the store is empty).
 *
 * Env:
 *   BASE_URL  storefront URL                 (default http://localhost:8080)
 *   NSEC      store-owner / test merchant key (required)
 *   PRODUCT   product title to open           (default: first card)
 *   NEW_PRICE new price in the listed currency (default 54321)
 *   HEADLESS  true | false                    (default true)
 *   SHOT      screenshot output path          (optional)
 */
import { chromium } from 'playwright';
import { injectOwnerLogin } from './owner-login.mjs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const NSEC = process.env.NSEC;
const PRODUCT = process.env.PRODUCT;
const NEW_PRICE = process.env.NEW_PRICE || '54321';
const HEADLESS = process.env.HEADLESS !== 'false';
const SHOT = process.env.SHOT;

if (!NSEC) throw new Error('NSEC (store-owner key) is required');

const browser = await chromium.launch({ headless: HEADLESS, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
await injectOwnerLogin(page, NSEC);

await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);

// Open a product detail page.
if (PRODUCT) {
  // The card's stretched overlay link (#98) sits above the title text, so
  // click the card link itself rather than the h3 Playwright can't reach.
  await page.getByRole('link', { name: PRODUCT }).first().click();
} else {
  await page.locator('a[href^="/naddr"]').first().click();
}
await page.waitForTimeout(2000);

// Open the owner Edit dialog.
await page.getByRole('button', { name: /edit product/i }).first().click();
await page.waitForTimeout(800);

const dialog = page.locator('[role="dialog"]').first();
await dialog.locator('#product-price').fill(NEW_PRICE);

if (SHOT) {
  await dialog.screenshot({ path: SHOT });
  console.log('saved', SHOT);
}

await dialog.getByRole('button', { name: /save changes/i }).click();
await page.locator('[role="dialog"]').first().waitFor({ state: 'detached', timeout: 30000 });
console.log('EDIT PRODUCT OK: new price', NEW_PRICE);
await browser.close();
process.exit(0);

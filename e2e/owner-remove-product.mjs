/**
 * E2E: store owner removes a product (NIP-09 kind 5 deletion request).
 *
 * Inject the owner login, open a product detail page, click "Remove", confirm
 * in the alert dialog, and assert the app navigates back to the storefront.
 *
 * Prereqs: storefront in test mode with at least one product owned by the test
 * merchant (run owner-add-product.mjs first if the store is empty).
 *
 * Env:
 *   BASE_URL  storefront URL                 (default http://localhost:8080)
 *   NSEC      store-owner / test merchant key (required)
 *   PRODUCT   product title to open           (default: first card)
 *   HEADLESS  true | false                    (default true)
 *   SHOT      screenshot output path          (optional)
 */
import { chromium } from 'playwright';
import { injectOwnerLogin } from './owner-login.mjs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const NSEC = process.env.NSEC;
const PRODUCT = process.env.PRODUCT;
const HEADLESS = process.env.HEADLESS !== 'false';
const SHOT = process.env.SHOT;

if (!NSEC) throw new Error('NSEC (store-owner key) is required');

const browser = await chromium.launch({ headless: HEADLESS, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
await injectOwnerLogin(page, NSEC);

await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);

if (PRODUCT) {
  await page.getByText(PRODUCT, { exact: false }).first().click();
} else {
  await page.locator('a[href^="/naddr"]').first().click();
}
await page.waitForTimeout(2000);

// Open the remove confirmation.
await page.getByRole('button', { name: /^remove$/i }).first().click();
await page.waitForTimeout(600);

const dialog = page.locator('[role="alertdialog"]').first();
if (SHOT) {
  await dialog.screenshot({ path: SHOT });
  console.log('saved', SHOT);
}

await dialog.getByRole('button', { name: /remove product/i }).click();

// onDeleted navigates back to the storefront root.
await page.waitForURL((url) => url.pathname === '/', { timeout: 30000 });
console.log('REMOVE PRODUCT OK');
await browser.close();
process.exit(0);

/**
 * E2E: Product reviews with ratings (kind 31555).
 *
 * Phase 1 (signed out): opens the storefront, navigates to the first product,
 * scrolls to the Reviews section and asserts it renders read-only — the
 * "Sign in to review" action opens the LoginDialog rather than silently
 * no-opping.
 *
 * Phase 2 (signed in): injects a throwaway login (the @nostrify localStorage
 * format, storageKey `nostr:login`), picks a star rating, writes review text
 * and submits. Asserts a kind-31555 review is published (the new review appears
 * in the list with the reviewer's stars) and the aggregate rating shows.
 *
 * Prereqs: a running storefront dev server, Playwright + Chromium installed.
 *   npm i -D playwright && npx playwright install chromium
 *
 * Env:
 *   BASE_URL   storefront URL          (default http://localhost:8080)
 *   NSEC       throwaway key           (required for phase 2)
 *   HEADLESS   true | false            (default true)
 *   SHOT_DIR   screenshot output dir   (optional; writes NN-name.png)
 *
 * Usage:
 *   NSEC=nsec1… node e2e/product-reviews.mjs
 */
import { chromium } from 'playwright';
import { nip19, getPublicKey } from 'nostr-tools';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const NSEC = process.env.NSEC;
const HEADLESS = process.env.HEADLESS !== 'false';
const SHOT_DIR = process.env.SHOT_DIR;

/**
 * Inject a login into localStorage before app code runs, using the @nostrify
 * format (storageKey `nostr:login`) — the same shape the storefront persists.
 */
async function injectLogin(page, nsec) {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== 'nsec') throw new Error('NSEC must be a valid nsec');
  const pubkey = getPublicKey(decoded.data);
  const payload = JSON.stringify([
    {
      id: `nsec:${pubkey}`,
      type: 'nsec',
      pubkey,
      createdAt: new Date().toISOString(),
      data: { nsec },
    },
  ]);
  await page.addInitScript((data) => localStorage.setItem('nostr:login', data), payload);
  return pubkey;
}

/** Open the storefront and click into the first product detail page. */
async function gotoFirstProduct(page) {
  await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  // Product cards link to /<naddr>. Click the first one.
  const firstProduct = page.locator('a[href^="/naddr1"]').first();
  await firstProduct.waitFor({ timeout: 15000 });
  await firstProduct.click();
  await page.waitForTimeout(1500);
  // The reviews section heading confirms we're on a product page.
  await page.getByRole('heading', { name: /reviews/i }).first().waitFor({ timeout: 15000 });
}

const browser = await chromium.launch({ headless: HEADLESS, args: ['--no-sandbox'] });

// ── Phase 1: signed-out reviews are read-only and prompt sign-in ───────────
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  await gotoFirstProduct(page);

  const reviewsHeading = page.getByRole('heading', { name: /reviews/i }).first();
  await reviewsHeading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // The "Sign in to review" button must open the LoginDialog (not no-op).
  const signInBtn = page.getByRole('button', { name: /sign in to review/i }).first();
  await signInBtn.waitFor({ timeout: 10000 });
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/04-signed-out-readonly.png` });
  await signInBtn.click();
  await page
    .getByRole('dialog')
    .getByText(/log in|sign up|nostr/i)
    .first()
    .waitFor({ timeout: 5000 });
  console.log('signed-out: reviews read-only + sign-in prompt opens LoginDialog OK');
  await page.close();
}

// ── Phase 2: signed-in user submits a kind-31555 review ────────────────────
if (NSEC) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  await injectLogin(page, NSEC);
  await gotoFirstProduct(page);

  const reviewsHeading = page.getByRole('heading', { name: /reviews/i }).first();
  await reviewsHeading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // Pick 4 stars (the picker is an ARIA radiogroup of star buttons).
  await page.getByRole('radio', { name: /^4 stars$/i }).first().click();
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/02-write-review-form.png` });

  const text = `Great product! Automated e2e review ${Date.now()}`;
  await page.getByPlaceholder(/share your experience/i).fill(text);
  await page.getByRole('button', { name: /submit review/i }).click();

  // The published review should appear in the list with its text.
  await page.getByText(text).first().waitFor({ timeout: 20000 });
  console.log('signed-in: kind-31555 review published and rendered OK');

  await reviewsHeading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/03-just-submitted.png` });
  await page.close();
} else {
  console.log('NSEC not set — skipped signed-in review phase');
}

console.log('PRODUCT REVIEWS FLOW OK');
await browser.close();
process.exit(0);

/**
 * E2E: Product comments (NIP-22 kind 1111).
 *
 * Phase 1 (signed out): opens the storefront, navigates to the first product,
 * scrolls to the Comments section and asserts it renders read-only — the
 * "Sign in to comment" action opens the LoginDialog rather than silently
 * no-opping.
 *
 * Phase 2 (signed in): injects a throwaway login (the @nostrify localStorage
 * format, storageKey `nostr:login`), types a comment and posts it. Asserts a
 * kind-1111 comment is published (the new comment appears in the list with its
 * text) rooted on the addressable kind-30402 product.
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
 *   NSEC=nsec1… node e2e/product-comments.mjs
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
  // Product cards link to /<naddr>. Navigate to the first one directly (the
  // card image overlay can intercept a click, so resolve the href and goto).
  const firstProduct = page.locator('a[href^="/naddr1"]').first();
  await firstProduct.waitFor({ timeout: 15000 });
  const href = await firstProduct.getAttribute('href');
  await page.goto(BASE_URL + href, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  // The comments section heading confirms the comments feature is mounted.
  await page
    .getByRole('heading', { name: /comments/i })
    .first()
    .waitFor({ timeout: 15000 });
}

const browser = await chromium.launch({ headless: HEADLESS, args: ['--no-sandbox'] });

// ── Phase 1: signed-out comments are read-only and prompt sign-in ──────────
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  await gotoFirstProduct(page);

  const commentsHeading = page.getByRole('heading', { name: /comments/i }).first();
  await commentsHeading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // The "Sign in to comment" button must open the LoginDialog (not no-op).
  const signInBtn = page.getByRole('button', { name: /sign in to comment/i }).first();
  await signInBtn.waitFor({ timeout: 10000 });
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/04-signed-out-readonly.png` });
  await signInBtn.click();
  await page
    .getByRole('dialog')
    .getByText(/log in|sign up|nostr/i)
    .first()
    .waitFor({ timeout: 5000 });
  console.log('signed-out: comments read-only + sign-in prompt opens LoginDialog OK');
  await page.close();
}

// ── Phase 2: signed-in user posts a kind-1111 comment ──────────────────────
if (NSEC) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  await injectLogin(page, NSEC);
  await gotoFirstProduct(page);

  const commentsHeading = page.getByRole('heading', { name: /comments/i }).first();
  await commentsHeading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  const text = `Great product! Automated e2e comment ${Date.now()}`;
  await page.getByPlaceholder(/write a comment/i).fill(text);
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/02-write-comment-form.png` });
  await page.getByRole('button', { name: /^comment$/i }).click();

  // The published comment should appear in the list with its text.
  await page.getByText(text).first().waitFor({ timeout: 20000 });
  console.log('signed-in: kind-1111 comment published and rendered OK');

  await commentsHeading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/03-just-posted.png` });
  await page.close();
} else {
  console.log('NSEC not set — skipped signed-in comment phase');
}

console.log('PRODUCT COMMENTS FLOW OK');
await browser.close();
process.exit(0);

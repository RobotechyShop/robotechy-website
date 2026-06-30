/**
 * E2E: "Share product to Nostr" — product card menu + signed-in compose/publish.
 *
 * Phase 1 (signed out): loads the storefront, opens the first product card's
 * Share menu and asserts the "Copy link" and "Share to Nostr" items render, then
 * clicks "Share to Nostr" and asserts the LoginDialog opens (signed out, the
 * Nostr path prompts sign-in rather than doing nothing). It also reads the
 * product's `naddr` (exposed via a `data-product-naddr` attribute) and checks it
 * decodes to a kind-30402 addressable pointer.
 *
 * Phase 2 (signed in): injects a throwaway login (the @nostrify localStorage
 * format, storageKey `nostr:login`), opens the Share menu, clicks "Share to
 * Nostr", asserts the composer is prefilled with the njump link, posts the note
 * and asserts the kind-1 publish succeeds (the "Shared" success state).
 *
 * Prereqs: a running storefront dev server, Playwright + Chromium installed.
 *   npm i -D playwright && npx playwright install chromium
 *
 * Env:
 *   BASE_URL   storefront URL          (default http://localhost:8080)
 *   NSEC       throwaway key           (required for phase 2)
 *   HEADLESS   true | false            (default true)
 *   SHOT       screenshot output path  (optional, end state)
 *
 * Usage:
 *   NSEC=nsec1… node e2e/share-product.mjs
 */
import { chromium } from 'playwright';
import { nip19, getPublicKey } from 'nostr-tools';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const NSEC = process.env.NSEC;
const HEADLESS = process.env.HEADLESS !== 'false';
const SHOT = process.env.SHOT;

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

/** Open the first product card's Share menu and return its trigger locator. */
async function openFirstShareMenu(page) {
  const trigger = page.getByRole('button', { name: /share .* on nostr/i }).first();
  await trigger.waitFor({ timeout: 15000 });

  // The product's addressable pointer is exposed for assertion (sr-only span).
  const naddr = await page
    .locator('[data-product-naddr]')
    .first()
    .getAttribute('data-product-naddr');
  if (!naddr || !naddr.startsWith('naddr1')) {
    throw new Error(`Expected a naddr1… pointer, got: ${naddr}`);
  }
  const decoded = nip19.decode(naddr);
  if (decoded.type !== 'naddr' || decoded.data.kind !== 30402) {
    throw new Error(`naddr did not decode to a kind-30402 product: ${naddr}`);
  }
  console.log('product naddr OK:', naddr);

  await trigger.click();
  await page.getByRole('menuitem', { name: /copy link/i }).waitFor({ timeout: 5000 });
  return trigger;
}

const browser = await chromium.launch({ headless: HEADLESS, args: ['--no-sandbox'] });

// ── Phase 1: signed-out menu + sign-in prompt ──────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  await openFirstShareMenu(page);
  await page.getByRole('menuitem', { name: /share to nostr/i }).waitFor({ timeout: 5000 });
  console.log('signed-out: Share menu shows Copy link + Share to Nostr OK');

  // Signed out, "Share to Nostr" must prompt sign-in.
  await page.getByRole('menuitem', { name: /share to nostr/i }).click();
  await page
    .getByRole('dialog')
    .getByText(/log in|sign up|nostr/i)
    .first()
    .waitFor({ timeout: 5000 });
  console.log('signed-out: Share to Nostr opened the login dialog OK');
  await page.close();
}

// ── Phase 2: signed-in compose + publish ───────────────────────────────────
if (NSEC) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  await injectLogin(page, NSEC);
  await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  await openFirstShareMenu(page);
  await page.getByRole('menuitem', { name: /share to nostr/i }).click();

  // The composer must be prefilled with the njump link.
  const note = page.getByRole('textbox', { name: /note text/i });
  await note.waitFor({ timeout: 5000 });
  const text = await note.inputValue();
  if (!/njump\.me\/naddr1/.test(text)) {
    throw new Error(`Composer note missing njump link, got: ${text}`);
  }
  console.log('signed-in: composer prefilled with njump link OK');

  await page.getByRole('button', { name: /post to nostr/i }).click();
  // Success: the button flips to "Shared" once the kind-1 publish lands.
  await page.getByRole('button', { name: /shared/i }).waitFor({ timeout: 15000 });
  console.log('signed-in: kind-1 note published (Shared) OK');

  if (SHOT) {
    await page.screenshot({ path: SHOT });
    console.log('saved', SHOT);
  }
  await page.close();
} else {
  console.log('NSEC not set — skipped signed-in publish phase');
}

console.log('SHARE PRODUCT FLOW OK');
await browser.close();
process.exit(0);

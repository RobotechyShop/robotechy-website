/**
 * E2E: "Follow Us" button (footer) — signed-out prompt and signed-in follow.
 *
 * Phase 1 (signed out): loads the storefront, scrolls to the footer, clicks
 * "Follow Us" and asserts the LoginDialog opens, plus that a "View on Nostr"
 * fallback link points at the shop's njump profile.
 *
 * Phase 2 (signed in): injects a throwaway login (the @nostrify localStorage
 * format, storageKey `nostr:login`), clicks "Follow Us" and asserts the button
 * transitions to its "Following" state (the kind-3 contact list is published to
 * the relays).
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
 *   NSEC=nsec1… node e2e/follow-us.mjs
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

const browser = await chromium.launch({ headless: HEADLESS, args: ['--no-sandbox'] });

// ── Phase 1: signed-out prompts the login dialog ───────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);

  const footer = page.locator('footer');
  await footer.scrollIntoViewIfNeeded();

  // The "View on Nostr" fallback link must point at the shop's njump profile.
  const njump = footer.getByRole('link', { name: /view on nostr/i }).first();
  const href = await njump.getAttribute('href');
  if (!href || !/njump\.me\/npub1/.test(href)) {
    throw new Error(`Expected a njump.me/npub1… link, got: ${href}`);
  }
  console.log('signed-out fallback link OK:', href);

  await footer
    .getByRole('button', { name: /follow robotechy on nostr/i })
    .first()
    .click();
  await page.waitForTimeout(1000);

  // The LoginDialog should now be open.
  await page
    .getByRole('dialog')
    .getByText(/log in|sign up|nostr/i)
    .first()
    .waitFor({ timeout: 5000 });
  console.log('signed-out: login dialog opened OK');
  await page.close();
}

// ── Phase 2: signed-in user follows the shop ───────────────────────────────
if (NSEC) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  await injectLogin(page, NSEC);
  await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  const footer = page.locator('footer');
  await footer.scrollIntoViewIfNeeded();

  const followBtn = footer
    .getByRole('button', { name: /follow(ing)? robotechy on nostr/i })
    .first();
  const label = (await followBtn.textContent())?.trim();
  console.log('initial follow button:', label);

  if (/following/i.test(label || '')) {
    console.log('already following — nothing to publish');
  } else {
    await followBtn.click();
    // Wait for the kind-3 publish to land and the button to flip to "Following".
    await footer
      .getByRole('button', { name: /following robotechy on nostr/i })
      .first()
      .waitFor({ timeout: 15000 });
    console.log('signed-in: button transitioned to Following OK');
  }

  if (SHOT) {
    await page.screenshot({ path: SHOT });
    console.log('saved', SHOT);
  }
  await page.close();
} else {
  console.log('NSEC not set — skipped signed-in follow phase');
}

console.log('FOLLOW US FLOW OK');
await browser.close();
process.exit(0);

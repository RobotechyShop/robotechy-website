/**
 * E2E: product search flow (filter the storefront grid via the search box).
 *
 * Prereqs: a running storefront dev server, Playwright + Chromium installed.
 *   npm i -D playwright && npx playwright install chromium
 *
 * Env:
 *   BASE_URL         storefront URL                  (default http://localhost:8080)
 *   MATCH_QUERY      query expected to match a product (default "Nostr")
 *   NO_MATCH_QUERY   query expected to match nothing   (default "zzqx-no-such-product")
 *   HEADLESS         true | false                    (default true)
 *   SHOT             screenshot output path          (optional)
 *
 * Usage:
 *   node e2e/search-flow.mjs
 *   MATCH_QUERY=badge node e2e/search-flow.mjs
 */
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const MATCH = process.env.MATCH_QUERY || 'Nostr';
const NO_MATCH = process.env.NO_MATCH_QUERY || 'zzqx-no-such-product';
const HEADLESS = process.env.HEADLESS !== 'false';
const SHOT = process.env.SHOT;

const browser = await chromium.launch({ headless: HEADLESS, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const step = async (label, fn) => { await fn(); console.log('✓', label); };

const search = page.locator('input[type="search"]');
const emptyState = page.getByText(/No products found/i);

await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: 30000 });
await step('search box + products load', async () => {
  await search.waitFor({ timeout: 15000 });
  // wait for the grid to settle (skeletons gone, at least one product link present)
  await page.locator('main a[href^="/naddr1"]').first().waitFor({ timeout: 15000 });
});

await step(`"${MATCH}" returns matching results`, async () => {
  await search.fill(MATCH);
  await page.waitForTimeout(800);
  // a product whose title/summary contains the query is shown, and no empty state
  await page.locator('main').getByText(new RegExp(MATCH, 'i')).first().waitFor({ timeout: 8000 });
  if (await emptyState.count()) throw new Error('empty state shown for a matching query');
});

await step(`"${NO_MATCH}" shows the empty state`, async () => {
  await search.fill(NO_MATCH);
  await page.waitForTimeout(800);
  await emptyState.waitFor({ timeout: 8000 });
});

await step('clearing the query restores results', async () => {
  await search.fill('');
  await page.waitForTimeout(800);
  if (await emptyState.count()) throw new Error('empty state still shown after clearing the query');
  await page.locator('main a[href^="/naddr1"]').first().waitFor({ timeout: 8000 });
});

if (SHOT) {
  await search.fill(MATCH);
  await page.waitForTimeout(800);
  await page.screenshot({ path: SHOT });
  console.log('saved', SHOT);
}
console.log('SEARCH FLOW OK');
await browser.close();
process.exit(0);

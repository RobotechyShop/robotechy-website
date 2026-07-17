/**
 * E2E: NIP-17 purchase flow (login → Buy It Now → shipping → pay → Order Complete).
 *
 * Prereqs: a running storefront dev server, Playwright + Chromium installed.
 *   npm i -D playwright && npx playwright install chromium
 *
 * Env:
 *   BASE_URL     storefront URL            (default http://localhost:8080)
 *   BUYER_NSEC   throwaway buyer key       (required)
 *   PAY_METHOD   webln-mock | nwc          (default webln-mock)
 *   NWC_URI      nostr+walletconnect://…   (required when PAY_METHOD=nwc)
 *   PRODUCT      product title to buy      (default "Nostr Badge")
 *   HEADLESS     true | false              (default true)
 *   SHOT         screenshot output path    (optional)
 *
 * Usage:
 *   BUYER_NSEC=nsec1… node e2e/purchase-flow.mjs
 *   BUYER_NSEC=nsec1… PAY_METHOD=nwc NWC_URI="nostr+walletconnect://…" node e2e/purchase-flow.mjs
 */
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const BUYER_NSEC = process.env.BUYER_NSEC;
const PAY_METHOD = process.env.PAY_METHOD || 'webln-mock';
const NWC_URI = process.env.NWC_URI;
const PRODUCT = process.env.PRODUCT || 'Nostr Badge';
const HEADLESS = process.env.HEADLESS !== 'false';
const SHOT = process.env.SHOT;

if (!BUYER_NSEC) throw new Error('BUYER_NSEC is required');
if (PAY_METHOD === 'nwc' && !NWC_URI) throw new Error('NWC_URI is required when PAY_METHOD=nwc');

const browser = await chromium.launch({ headless: HEADLESS, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

// Wire up the chosen wallet before any app code runs.
if (PAY_METHOD === 'webln-mock') {
  await page.addInitScript(() => {
    window.webln = {
      enabled: true,
      enable: async () => {},
      sendPayment: async () => ({ preimage: '00'.repeat(32) }),
      getInfo: async () => ({ node: { alias: 'mock' } }),
    };
  });
} else if (PAY_METHOD === 'nwc') {
  await page.addInitScript((uri) => {
    localStorage.setItem('nwc-connections', JSON.stringify([{ connectionString: uri, alias: 'E2E NWC', isConnected: true }]));
    localStorage.setItem('nwc-active-connection', JSON.stringify(uri));
  }, NWC_URI);
}

const step = async (label, fn) => { await fn(); console.log('✓', label); };

await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);

await step('log in', async () => {
  await page.getByRole('button', { name: /log ?in/i }).first().click();
  await page.waitForTimeout(800);
  try { await page.getByRole('tab', { name: /key/i }).click({ timeout: 1500 }); } catch { /* already on key tab */ }
  await page.locator('#nsec').fill(BUYER_NSEC);
  await page.locator('[role="dialog"]').getByRole('button', { name: /^log ?in$/i }).first().click();
  await page.waitForTimeout(3000);
});

await step(`open "${PRODUCT}" and Buy It Now`, async () => {
  // The card's stretched overlay link (#98) sits above the title text, so
  // click the card link itself rather than the h3 Playwright can't reach.
  await page.getByRole('link', { name: PRODUCT }).first().click();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /buy it now/i }).first().click();
  await page.waitForTimeout(1500);
});

await step('fill shipping and place order', async () => {
  const dialog = page.locator('[role="dialog"]');

  // Country-first checkout: pick the ship-to country in the searchable
  // combobox (it may already be pre-selected from the browser locale), which
  // filters the shipping methods to those covering it.
  await dialog.getByRole('combobox').first().click();
  await page.getByPlaceholder(/search country/i).fill('united k');
  await page.getByRole('option', { name: /united kingdom/i }).first().click();

  // Wait deterministically for the shipping options to finish resolving from
  // relays (the loading skeleton disappears; 'hidden' also covers the case
  // where the options were already cached and it never rendered at all).
  await dialog
    .getByTestId('shipping-options-loading')
    .waitFor({ state: 'hidden', timeout: 20000 });

  // Select the first available shipping method (auto-selected when only one
  // fits; the trigger then shows the method instead of the placeholder).
  const methodTrigger = dialog.getByRole('combobox').nth(1);
  await methodTrigger.waitFor({ timeout: 10000 });
  if ((await methodTrigger.textContent())?.match(/select shipping method/i)) {
    await methodTrigger.click();
    await page.getByRole('option').first().click();
  }

  await page.locator('#name').fill('Sat Oshi');
  await page.locator('#address').fill('21 Lightning Lane');
  await page.locator('#city').fill('London');
  await page.locator('#postalCode').fill('N1 21BTC');
  await dialog.locator('button[type="submit"]').first().click();
});

// The merchant backend delivers the invoice over Nostr relays — allow generous time.
const payLabel = PAY_METHOD === 'nwc' ? /pay with nwc/i : /pay with webln/i;
await step('wait for merchant invoice', async () => {
  await page.getByRole('button', { name: payLabel }).waitFor({ timeout: 120000 });
});
await step('pay', async () => { await page.getByRole('button', { name: payLabel }).click(); });

await step('reach Order Complete', async () => {
  await page.getByText(/Order Complete|Payment Received|Thank you for your order/i).first().waitFor({ timeout: 20000 });
});

if (SHOT) { await page.locator('[role="dialog"]').first().screenshot({ path: SHOT }); console.log('saved', SHOT); }
console.log('PURCHASE FLOW OK');
await browser.close();
process.exit(0);

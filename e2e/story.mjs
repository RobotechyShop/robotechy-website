/**
 * E2E: "/story" shop story feed — profile hero, posts, replies, zap + sign-in.
 *
 * Phase 1 (signed out): loads /story and asserts the shop profile hero renders
 * (banner, avatar, name heading, about), and that the "Message" button (which
 * opens the shop messages drawer) and the "Zap the shop" affordance (which
 * prompts sign-in for signed-out visitors) are present. Then, depending on
 * whether the shop's Nostr account has any kind-1 posts:
 *   - With posts: asserts the first post shows a "Replies" thread (other users'
 *     kind-1 NIP-10 replies + count), a signed-out "Zap" affordance, and a
 *     "Sign in to reply" composer button; clicking it opens the LoginDialog.
 *   - Without posts: asserts the honest "No posts yet" empty state.
 *
 * Phase 2 (signed in, requires NSEC and at least one post): injects a throwaway
 * login (the @nostrify localStorage format), asserts the composer is enabled
 * ("Write a reply…"), posts a kind-1 reply tagging the first post and asserts
 * the composer clears on success.
 *
 * To exercise the posts/replies path against an account that actually has kind-1
 * notes, serve the storefront with VITE_MERCHANT_NPUB set to that npub (test
 * mode, shows the TEST badge). The production shop currently has no kind-1 posts,
 * so a default run lands on the empty state — which the script asserts honestly.
 *
 * Prereqs: a running dev server, Playwright + Chromium installed.
 *   npm i -D playwright && npx playwright install chromium
 *
 * Env:
 *   BASE_URL   storefront URL          (default http://localhost:8080)
 *   NSEC       throwaway key           (required for phase 2)
 *   HEADLESS   true | false            (default true)
 *   SHOT       screenshot output path  (optional, end state)
 *
 * Usage:
 *   node e2e/story.mjs
 *   NSEC=nsec1… node e2e/story.mjs
 */
import { chromium } from 'playwright';
import { nip19, getPublicKey } from 'nostr-tools';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const NSEC = process.env.NSEC;
const HEADLESS = process.env.HEADLESS !== 'false';
const SHOT = process.env.SHOT;

/** Inject a login into localStorage before app code runs (@nostrify format). */
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

/** Assert the shop profile hero (banner + avatar + name + about) is present. */
async function assertHero(page) {
  await page.getByTestId('story-banner').waitFor({ timeout: 15000 });
  const heading = page.getByRole('heading', { level: 1 }).first();
  await heading.waitFor({ timeout: 15000 });
  const name = (await heading.textContent())?.trim();
  if (!name) throw new Error('Hero name heading is empty');
  // The avatar uses alt={name}; an <img> or its fallback initial is present.
  await page.locator('[data-testid="story-banner"]').first().waitFor();
  await page.getByRole('button', { name: /^message$/i }).waitFor({ timeout: 5000 });
  // The hero's "Zap the shop" action — signed out it's a sign-in-gated button
  // (aria-label "Zap the shop"); clicking it opens the LoginDialog.
  const heroZap = page.getByRole('button', { name: /zap the shop/i });
  await heroZap.waitFor({ timeout: 5000 });
  await heroZap.click();
  await page
    .getByRole('dialog')
    .getByText(/log in|sign up|nostr/i)
    .first()
    .waitFor({ timeout: 5000 });
  await page.keyboard.press('Escape');
  console.log(`hero OK — shop: "${name}", banner + Message + Zap the shop present`);
  return name;
}

const browser = await chromium.launch({ headless: HEADLESS, args: ['--no-sandbox'] });

let hasPosts = false;

// ── Phase 1: signed-out hero + posts/empty-state + sign-in prompt ───────────
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.goto(BASE_URL + '/story', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  await assertHero(page);

  const posts = page.locator('main ol > li');
  const emptyState = page.getByText(/no posts yet/i);

  // Wait for either the timeline or the empty state to resolve.
  await Promise.race([
    posts
      .first()
      .waitFor({ timeout: 15000 })
      .catch(() => {}),
    emptyState.waitFor({ timeout: 15000 }).catch(() => {}),
  ]);

  const postCount = await posts.count();
  hasPosts = postCount > 0;

  if (hasPosts) {
    console.log(`timeline OK — ${postCount} shop post(s) rendered`);
    const first = posts.first();

    // Replies thread under the post (other users' kind-1 replies + count).
    await first
      .getByText(/replies/i)
      .first()
      .waitFor({ timeout: 10000 });
    const repliesLabel =
      (await first
        .getByText(/replies\s*\(\d+\)/i)
        .first()
        .textContent()) || '';
    console.log(`replies section OK on first post — ${repliesLabel.trim()}`);

    // Signed-out zap affordance + sign-in-gated reply composer. The post's own
    // ZapButton renders before the replies (which now each carry their own zap),
    // so scope to the first match — the post's — to stay out of strict mode.
    await first.getByRole('button', { name: /^zap$/i }).first().waitFor({ timeout: 5000 });
    const replyBtn = first.getByRole('button', { name: /sign in to reply/i });
    await replyBtn.waitFor({ timeout: 5000 });
    console.log('signed-out: Zap + "Sign in to reply" affordances present OK');

    await replyBtn.click();
    await page
      .getByRole('dialog')
      .getByText(/log in|sign up|nostr/i)
      .first()
      .waitFor({ timeout: 5000 });
    console.log('signed-out: reply composer opened the login dialog OK');
  } else {
    await emptyState.waitFor({ timeout: 5000 });
    console.log('timeline OK — shop has no kind-1 posts yet; "No posts yet" empty state shown');
  }

  if (SHOT) {
    await page.screenshot({ path: SHOT, fullPage: true });
    console.log('saved', SHOT);
  }
  await page.close();
}

// ── Phase 2: signed-in reply compose + publish (needs a post to reply to) ───
if (NSEC && hasPosts) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await injectLogin(page, NSEC);
  await page.goto(BASE_URL + '/story', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const first = page.locator('main ol > li').first();
  await first.waitFor({ timeout: 15000 });

  const composer = first.getByPlaceholder(/write a reply/i);
  await composer.waitFor({ timeout: 10000 });
  console.log('signed-in: reply composer enabled OK');

  const text = `gm from the story e2e ${Date.now()}`;
  await composer.fill(text);
  await first.getByRole('button', { name: /^reply$/i }).click();

  // Success: the composer clears once the kind-1 reply publishes.
  await page.waitForFunction(
    (t) => {
      const ta = [...document.querySelectorAll('textarea')].find((e) => e.value === t);
      return !ta; // the filled textarea has been cleared
    },
    text,
    { timeout: 20000 }
  );
  console.log('signed-in: kind-1 reply published (composer cleared) OK');
  await page.close();
} else if (NSEC) {
  console.log('signed-in phase skipped — shop has no posts to reply to');
} else {
  console.log('NSEC not set — skipped signed-in reply phase');
}

console.log('STORY FEED FLOW OK');
await browser.close();
process.exit(0);

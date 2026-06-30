# End-to-end flows (Playwright)

Manual Playwright scripts that drive the storefront's NIP-17 messaging and
commerce flows against a running dev server. They are demo/smoke scripts, not
part of the CI test run.

## Prerequisites

```bash
npm i -D playwright
npx playwright install chromium
npm run dev            # serve the storefront (default http://localhost:8080)
```

Generate a throwaway key with any Nostr tool (e.g. `nostr-tools`'s
`generateSecretKey` + `nip19.nsecEncode`). Never use a real key.

## Scripts

### `search-flow.mjs`

Exercises the storefront product search/filter UI.

```bash
node e2e/search-flow.mjs
```

### `purchase-flow.mjs`

Logs in, opens a product, "Buy It Now", fills shipping, places the order,
waits for the merchant's Lightning invoice (delivered over Nostr relays), pays,
and asserts the Order Complete screen.

```bash
# Mocked WebLN wallet (no real payment)
BUYER_NSEC=nsec1… node e2e/purchase-flow.mjs

# Real payment via NWC (Nostr Wallet Connect)
BUYER_NSEC=nsec1… PAY_METHOD=nwc \
  NWC_URI="nostr+walletconnect://…?relay=wss://…&secret=…" \
  node e2e/purchase-flow.mjs
```

> The merchant runs an async backend that polls relays for orders, so the
> invoice is not instant — the script allows up to 2 minutes for it to arrive.

### `messaging-flow.mjs`

Opens the Messages drawer, signs in, sends a NIP-17 DM, and asserts the sent
bubble renders.

```bash
NSEC=nsec1… node e2e/messaging-flow.mjs
```

### `follow-us.mjs`

Drives the footer "Follow Us" button. Signed out, it asserts the click opens the
LoginDialog and that the "View on Nostr" fallback points at the shop's njump
profile. Signed in (with `NSEC`, injected straight into `localStorage` in the
`@nostrify` format — no UI sign-in step), it clicks Follow and asserts the button
flips to its "Following" state once the kind-3 contact list is published.

```bash
# signed-out phase only
node e2e/follow-us.mjs

# both phases (publishes a kind-3 follow from the throwaway key)
NSEC=nsec1… node e2e/follow-us.mjs
```

### Store-owner product management

These drive the owner-only catalog tools. They require the storefront to be
served **in test mode** so the merchant identity resolves to the throwaway test
merchant, and `NSEC` to be that merchant's key (`MERCHANT_NSEC` from
`order-service/.env.test`). The login is injected directly into `localStorage`
(`@nostrify` format) by `owner-login.mjs` — no UI sign-in step.

```bash
npm run dev -- --mode test    # serves the test-merchant storefront on :8080

NSEC=nsec1…<merchant> node e2e/owner-add-product.mjs    # add a product (kind 30402)
NSEC=nsec1…<merchant> node e2e/owner-edit-product.mjs   # edit + republish (same d-tag)
NSEC=nsec1…<merchant> node e2e/owner-remove-product.mjs # NIP-09 kind 5 deletion
NSEC=nsec1…<merchant> node e2e/owner-shipping.mjs       # add a shipping option (kind 30406)
NSEC=nsec1…<merchant> node e2e/owner-categories.mjs     # create a collection (kind 30405)
```

> `owner-edit-product.mjs` and `owner-remove-product.mjs` operate on an existing
> listing — run `owner-add-product.mjs` first if the test store is empty. Pass
> `PRODUCT="<title>"` to target a specific product.

## Common env vars

| Var          | Default                 | Notes                                         |
| ------------ | ----------------------- | --------------------------------------------- |
| `BASE_URL`   | `http://localhost:8080` | Storefront URL                                |
| `NSEC`       | —                       | Throwaway key (messaging / follow-us / owner) |
| `BUYER_NSEC` | —                       | Throwaway buyer key (purchase flow)           |
| `HEADLESS`   | `true`                  | Set `false` to watch the run                  |
| `SHOT`       | —                       | Path to write a screenshot of the end state   |

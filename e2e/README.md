# End-to-end flows (Playwright)

Manual Playwright scripts that drive the storefront against a running dev
server. They are demo/smoke scripts, not part of the CI test run.

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

| Var        | Default                 | Notes                                       |
| ---------- | ----------------------- | ------------------------------------------- |
| `BASE_URL` | `http://localhost:8080` | Storefront URL                              |
| `NSEC`     | —                       | Store-owner / test-merchant key (owner flows) |
| `HEADLESS` | `true`                  | Set `false` to watch the run                |
| `SHOT`     | —                       | Path to write a screenshot of the end state |

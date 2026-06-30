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

Generate a throwaway buyer key with any Nostr tool (e.g. `nostr-tools`'s
`generateSecretKey` + `nip19.nsecEncode`). Never use a real key.

## Scripts

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

## Common env vars

| Var        | Default                 | Notes                                       |
| ---------- | ----------------------- | ------------------------------------------- |
| `BASE_URL` | `http://localhost:8080` | Storefront URL                              |
| `NSEC`     | —                       | Throwaway key (messaging / follow-us flows) |
| `HEADLESS` | `true`                  | Set `false` to watch the run                |
| `SHOT`     | —                       | Path to write a screenshot of the end state |

/**
 * Shared helper: inject a store-owner login into the storefront before app code
 * runs, using the @nostrify localStorage format (storageKey `nostr:login`).
 *
 * The owner is the test merchant — pass its nsec (MERCHANT_NSEC from
 * order-service/.env.test) as NSEC. The storefront must be served in test mode
 * (`npm run dev -- --mode test`) so MERCHANT_PUBKEY resolves to this identity
 * and the owner tools appear.
 */
import { nip19, getPublicKey } from 'nostr-tools';

export function buildOwnerLogin(nsec) {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== 'nsec') throw new Error('NSEC must be a valid nsec');
  const pubkey = getPublicKey(decoded.data);
  const login = [
    {
      id: `nsec:${pubkey}`,
      type: 'nsec',
      pubkey,
      createdAt: new Date().toISOString(),
      data: { nsec },
    },
  ];
  return { pubkey, payload: JSON.stringify(login) };
}

/** Wire the owner login into the page before any app code runs. */
export async function injectOwnerLogin(page, nsec) {
  const { pubkey, payload } = buildOwnerLogin(nsec);
  await page.addInitScript((data) => {
    localStorage.setItem('nostr:login', data);
  }, payload);
  return pubkey;
}

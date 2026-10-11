import { nip19 } from 'nostr-tools';

/**
 * The shop's merchant identity — author of the catalog (kind 30402/30405/30406)
 * and story notes, and the key the container's archiver backs up.
 *
 * Production npub by default; overridable via VITE_MERCHANT_NPUB so the
 * storefront can run against a throwaway test merchant (e.g.
 * `npm run dev -- --mode test`, which loads .env.test).
 */
export const PRODUCTION_MERCHANT_NPUB =
  'npub1yy0nyk6nj6tg4sx8nd7q5qcdw6pqd5e2cc0e8u2rmcgjhpvm63hsk67xe5';
const MERCHANT_NPUB: string = import.meta.env.VITE_MERCHANT_NPUB || PRODUCTION_MERCHANT_NPUB;

/**
 * Decode an npub to a hex pubkey, falling back to the production merchant if the
 * value is malformed. VITE_MERCHANT_NPUB is user-overridable (test mode), so a
 * bad value must not throw at module init and crash the whole app.
 */
export function decodeMerchantPubkey(npub: string): string {
  try {
    const decoded = nip19.decode(npub);
    if (decoded.type === 'npub') return decoded.data;
  } catch {
    // fall through to the production default
  }
  console.warn('Invalid VITE_MERCHANT_NPUB; falling back to the production merchant.');
  return nip19.decode(PRODUCTION_MERCHANT_NPUB).data as string;
}

export const MERCHANT_PUBKEY = decodeMerchantPubkey(MERCHANT_NPUB);

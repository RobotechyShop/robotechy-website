import { nip19 } from 'nostr-tools';

/**
 * The shop owner's npub (Isaac). His live kind-0 profile drives the hero avatar
 * and the footer About Me, so both always match his Nostr profile rather than a
 * baked-in photo.
 */
export const SHOP_OWNER_NPUB = 'npub17dfg3tynlv39m0e9z8a0t558e7plet96xg9g4uu6q84caykq8jtqwdy09f';

/** Hex pubkey for the shop owner, or '' if the npub is malformed (useAuthor no-ops). */
export function shopOwnerPubkey(): string {
  try {
    const decoded = nip19.decode(SHOP_OWNER_NPUB);
    return decoded.type === 'npub' ? decoded.data : '';
  } catch {
    return '';
  }
}

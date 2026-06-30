import { useCurrentUser } from '@/hooks/useCurrentUser';
import { MERCHANT_PUBKEY } from '@/hooks/useProducts';

/**
 * True when the signed-in user is the store owner — i.e. their pubkey matches
 * the merchant identity that owns the catalog (`MERCHANT_PUBKEY`).
 *
 * Product-management UI is gated on this: non-owners (logged out or any other
 * key) get `false` and never see edit/add/remove controls. Because every
 * catalog event is signed and owner-authored, this is the same check a relay
 * enforces — a non-owner literally cannot publish a replacement for the
 * merchant's addressable events.
 */
export function useIsStoreOwner(): boolean {
  const { user } = useCurrentUser();
  return Boolean(user?.pubkey && user.pubkey === MERCHANT_PUBKEY);
}

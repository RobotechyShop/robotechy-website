import { useShopQuery } from '@/hooks/useShopQuery';
import { MERCHANT_PUBKEY } from '@/lib/merchant';
import { isReply } from '@/lib/storyNotes';

/**
 * Fetch the shop's kind-1 notes for the story timeline.
 *
 * Authored by `MERCHANT_PUBKEY` — the shop's canonical Nostr account, i.e. the
 * same identity that publishes the product catalog (kind 30402) and that the
 * "Follow Us" button follows. Replies (notes carrying an `e` tag) are dropped so
 * the timeline shows only top-level posts, and the result is sorted newest-first.
 * Uses {@link useShopQuery}, so the catalog snapshot covers it when relays are down.
 */
export function useStoryNotes(limit = 50) {
  return useShopQuery({
    queryKey: ['story-notes', MERCHANT_PUBKEY, limit],
    filters: [{ kinds: [1], authors: [MERCHANT_PUBKEY], limit }],
    derive: (events) =>
      events
        .filter((event) => !isReply(event))
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, limit),
    enabled: !!MERCHANT_PUBKEY,
  });
}

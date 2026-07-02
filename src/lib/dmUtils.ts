import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Validate that an event is a proper DM event
 */
export function validateDMEvent(event: NostrEvent): boolean {
  // Must be kind 4 (NIP-04 DM)
  if (event.kind !== 4) return false;

  // Must have a 'p' tag
  const hasRecipient = event.tags?.some(([name]) => name === 'p');
  if (!hasRecipient) return false;

  // Must have content (even if encrypted)
  if (!event.content) return false;

  return true;
}

/**
 * Get the recipient pubkey from a DM event
 */
export function getRecipientPubkey(event: NostrEvent): string | undefined {
  return event.tags?.find(([name]) => name === 'p')?.[1];
}

/**
 * Get the conversation partner pubkey from a DM event
 * (the other person in the conversation, not the current user)
 */
export function getConversationPartner(event: NostrEvent, userPubkey: string): string | undefined {
  const isFromUser = event.pubkey === userPubkey;

  if (isFromUser) {
    // If we sent it, the partner is the recipient
    return getRecipientPubkey(event);
  } else {
    // If they sent it, the partner is the author
    return event.pubkey;
  }
}

/**
 * Format timestamp for display (matches Signal/WhatsApp/Telegram pattern)
 * Today: Show time (e.g., "2:45 PM")
 * Yesterday: "Yesterday"
 * This week: Day name (e.g., "Mon")
 * This year: Month and day (e.g., "Jan 15")
 * Older: Full date (e.g., "Jan 15, 2024")
 */
export function formatConversationTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();

  // Start of today (midnight)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Start of yesterday
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  // Start of this week (assuming week starts on Sunday, adjust if needed)
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  if (date >= todayStart) {
    // Today: Show time (e.g., "2:45 PM")
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } else if (date >= yesterdayStart) {
    // Yesterday
    return 'Yesterday';
  } else if (date >= weekStart) {
    // This week: Show day name (e.g., "Monday")
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  } else if (date.getFullYear() === now.getFullYear()) {
    // This year: Show month and day (e.g., "Jan 15")
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } else {
    // Older: Show full date (e.g., "Jan 15, 2024")
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
}

/**
 * Format timestamp as full date and time for tooltips
 * e.g., "Mon, Jan 15, 2024, 2:45 PM"
 */
export function formatFullDateTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Minimal structural shape needed to merge conversation messages — matches the
 * fields of DMProvider's DecryptedMessage that dedup/replacement relies on.
 */
export interface MergeableMessage {
  id: string;
  pubkey: string;
  created_at: number;
  decryptedContent?: string;
  /** True on the local optimistic bubble added when the user hits send. */
  isSending?: boolean;
  /** NIP-17: the outer gift wrap id (stable dedup key across re-fetches). */
  originalGiftWrapId?: string;
  /** Client-side arrival stamp used for entry animations. */
  clientFirstSeen?: number;
}

/**
 * How far apart (seconds) an optimistic bubble and its confirmed relay copy may
 * be stamped and still be treated as the same message. Mirrors the live
 * subscription path's window in DMProvider.addMessageToState.
 */
const OPTIMISTIC_MATCH_WINDOW_SECONDS = 30;

/**
 * Merge incoming (relay-fetched) messages into a conversation's existing list.
 *
 * - Dedupes by `originalGiftWrapId || id` (NIP-17 wraps re-fetched across polls
 *   keep a stable wrap id; NIP-04 and cached messages use the event id).
 * - Replaces a matching optimistic bubble (`isSending` + same author + same
 *   decrypted content within a small time window) instead of appending a
 *   second copy. Without this, a sent message shows TWICE whenever the poll
 *   path fetches the sender's own wrap before the live subscription does —
 *   the optimistic bubble (spinner forever) plus the confirmed copy. The
 *   replacement keeps the optimistic `created_at`/`clientFirstSeen` so the
 *   bubble doesn't jump or re-animate (mirrors addMessageToState).
 *
 * Returns a new array sorted by `created_at` ascending.
 */
export function mergeConversationMessages<T extends MergeableMessage>(
  existing: T[],
  incoming: T[]
): T[] {
  const merged = [...existing];
  const seenIds = new Set(merged.map((msg) => msg.originalGiftWrapId || msg.id));

  for (const message of incoming) {
    const messageId = message.originalGiftWrapId || message.id;
    if (seenIds.has(messageId)) {
      continue;
    }
    seenIds.add(messageId);

    const optimisticIndex = merged.findIndex(
      (msg) =>
        msg.isSending &&
        msg.pubkey === message.pubkey &&
        msg.decryptedContent === message.decryptedContent &&
        Math.abs(msg.created_at - message.created_at) <= OPTIMISTIC_MATCH_WINDOW_SECONDS
    );

    if (optimisticIndex !== -1) {
      const optimistic = merged[optimisticIndex];
      merged[optimisticIndex] = {
        ...message,
        created_at: optimistic.created_at,
        clientFirstSeen: optimistic.clientFirstSeen,
      };
    } else {
      merged.push(message);
    }
  }

  merged.sort((a, b) => a.created_at - b.created_at);
  return merged;
}

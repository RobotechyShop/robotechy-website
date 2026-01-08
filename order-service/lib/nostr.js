/**
 * Nostr client for publishing events and subscribing to orders
 */

import { SimplePool, finalizeEvent, nip04, nip19 } from 'nostr-tools';
import WebSocket from 'ws';

// Set WebSocket for nostr-tools in Node.js environment
globalThis.WebSocket = WebSocket;

/**
 * Decode nsec to secret key bytes
 * @param {string} nsec - Bech32 encoded secret key
 * @returns {Uint8Array} - 32-byte secret key
 */
export function decodeNsec(nsec) {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== 'nsec') {
    throw new Error(`Expected nsec, got ${decoded.type}`);
  }
  return decoded.data;
}

/**
 * Derive public key from secret key
 * @param {Uint8Array} secretKey
 * @returns {string} - Hex-encoded public key
 */
export function getPublicKey(secretKey) {
  const { getPublicKey: getPubkey } = require('nostr-tools/pure');
  return getPubkey(secretKey);
}

/**
 * Create a Nostr client instance
 * @param {Uint8Array} secretKey - Merchant's secret key
 * @param {string[]} fallbackRelays - Fallback relays if NIP-65 lookup fails
 */
export class NostrClient {
  constructor(secretKey, fallbackRelays) {
    this.secretKey = secretKey;
    this.fallbackRelays = fallbackRelays;
    this.pool = new SimplePool();
    this.relays = [];
    this.pubkey = '';
  }

  /**
   * Initialize the client - derive pubkey and fetch relays
   */
  async init() {
    // Import getPublicKey dynamically (ES module)
    const { getPublicKey } = await import('nostr-tools/pure');
    this.pubkey = getPublicKey(this.secretKey);
    console.log(`[Nostr] Merchant pubkey: ${this.pubkey}`);

    // Try to fetch NIP-65 relay list from fallback relays
    await this.fetchRelayList();

    console.log(`[Nostr] Connected to ${this.relays.length} relays`);
    return this;
  }

  /**
   * Fetch NIP-65 relay list for merchant
   */
  async fetchRelayList() {
    try {
      console.log('[Nostr] Fetching NIP-65 relay list...');
      const events = await this.pool.querySync(
        this.fallbackRelays,
        { kinds: [10002], authors: [this.pubkey], limit: 1 }
      );

      if (events.length > 0) {
        const relayTags = events[0].tags.filter(t => t[0] === 'r');
        const fetchedRelays = relayTags
          .map(t => t[1])
          .filter(Boolean);

        if (fetchedRelays.length > 0) {
          this.relays = fetchedRelays;
          console.log(`[Nostr] Using ${fetchedRelays.length} relays from NIP-65`);
          return;
        }
      }
    } catch (error) {
      console.warn('[Nostr] Failed to fetch NIP-65 relay list:', error.message);
    }

    // Fall back to default relays
    this.relays = this.fallbackRelays;
    console.log(`[Nostr] Using ${this.fallbackRelays.length} fallback relays`);
  }

  /**
   * Fetch a user's NIP-65 relay list
   * @param {string} pubkey - User's public key
   * @returns {Promise<string[]>} - Array of relay URLs
   */
  async getUserRelays(pubkey) {
    try {
      const events = await this.pool.querySync(
        this.relays,
        { kinds: [10002], authors: [pubkey], limit: 1 }
      );

      if (events.length > 0) {
        return events[0].tags
          .filter(t => t[0] === 'r')
          .map(t => t[1])
          .filter(Boolean);
      }
    } catch (error) {
      console.warn(`[Nostr] Failed to fetch relays for ${pubkey.slice(0, 8)}:`, error.message);
    }
    return [];
  }

  /**
   * Get combined relay set for publishing (merchant + recipient)
   * @param {string} recipientPubkey
   * @returns {Promise<string[]>}
   */
  async getPublishRelays(recipientPubkey) {
    const recipientRelays = await this.getUserRelays(recipientPubkey);
    const combined = new Set([...this.relays, ...recipientRelays]);
    return Array.from(combined);
  }

  /**
   * Sign and publish an event
   * @param {Partial<import('nostr-tools').Event>} eventTemplate
   * @param {string[]} [targetRelays] - Optional specific relays to publish to
   */
  async publishEvent(eventTemplate, targetRelays) {
    const event = finalizeEvent(eventTemplate, this.secretKey);
    const relays = targetRelays || this.relays;

    console.log(`[Nostr] Publishing event ${event.kind} to ${relays.length} relays`);

    const results = await Promise.allSettled(
      relays.map(async (relay) => {
        try {
          await this.pool.publish([relay], event);
          return { relay, success: true };
        } catch (err) {
          // Ignore paid relay errors silently
          if (err.message?.includes('restricted') || err.message?.includes('Pay on')) {
            return { relay, success: false, paid: true };
          }
          throw err;
        }
      })
    );

    const successes = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
    const failures = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value?.success)).length;

    if (successes === 0) {
      throw new Error(`Failed to publish event to any relay`);
    }

    console.log(`[Nostr] Published to ${successes}/${relays.length} relays (${failures} failed/skipped)`);
    return event;
  }

  /**
   * Send a NIP-04 encrypted DM
   * @param {string} recipientPubkey
   * @param {string} content
   */
  async sendDM(recipientPubkey, content) {
    // Encrypt content with NIP-04
    const encryptedContent = await nip04.encrypt(this.secretKey, recipientPubkey, content);

    const eventTemplate = {
      kind: 4,
      content: encryptedContent,
      tags: [['p', recipientPubkey]],
      created_at: Math.floor(Date.now() / 1000),
    };

    // Publish to both merchant and recipient relays
    const targetRelays = await this.getPublishRelays(recipientPubkey);

    console.log(`[Nostr] Sending DM to ${recipientPubkey.slice(0, 8)}... via ${targetRelays.length} relays`);
    return this.publishEvent(eventTemplate, targetRelays);
  }

  /**
   * Subscribe to events with a filter using polling
   * (Many relays have issues with subscribeMany, so we poll instead)
   * @param {import('nostr-tools').Filter} filter - Single filter object
   * @param {(event: import('nostr-tools').Event) => void} onEvent
   * @param {number} [intervalMs=5000] - Polling interval
   * @returns {() => void} - Unsubscribe function
   */
  subscribe(filter, onEvent, intervalMs = 5000) {
    console.log(`[Nostr] Polling for ${JSON.stringify(filter)} every ${intervalMs}ms`);

    const seenEvents = new Set();
    let isRunning = true;
    let currentSince = filter.since || Math.floor(Date.now() / 1000);

    const poll = async () => {
      if (!isRunning) return;

      try {
        const events = await this.pool.querySync(this.relays, {
          ...filter,
          since: currentSince,
        });

        for (const event of events) {
          if (!seenEvents.has(event.id)) {
            seenEvents.add(event.id);
            onEvent(event);
          }
        }

        // Update since to avoid re-fetching old events
        if (events.length > 0) {
          const maxCreatedAt = Math.max(...events.map(e => e.created_at));
          currentSince = maxCreatedAt;
        }
      } catch (error) {
        console.warn('[Nostr] Poll error:', error.message);
      }

      if (isRunning) {
        setTimeout(poll, intervalMs);
      }
    };

    // Start polling
    poll();

    return () => {
      console.log('[Nostr] Stopping poll');
      isRunning = false;
    };
  }

  /**
   * Close all connections
   */
  close() {
    console.log('[Nostr] Closing all connections');
    this.pool.close(this.relays);
  }
}

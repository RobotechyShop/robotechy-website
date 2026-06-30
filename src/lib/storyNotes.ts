import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Matches a fully-qualified http(s) image URL ending in a common image
 * extension, optionally followed by a query string. A fresh RegExp is returned
 * each call so the shared `g`/`i` flags never leak `lastIndex` state between
 * `match`/`replace` calls.
 */
function imageUrlRegex(): RegExp {
  return /https?:\/\/\S+?\.(?:png|jpe?g|gif|webp|avif)(?:\?\S*)?/gi;
}

/**
 * Extract image URLs for a kind-1 note's visual storytelling.
 *
 * Sources, in priority order:
 *  1. NIP-92 `imeta` tags (`['imeta', 'url <href>', 'm image/png', ...]`).
 *  2. Bare image URLs embedded in the note content.
 *
 * Duplicates are removed while preserving first-seen order so `imeta`-declared
 * images win over the same URL repeated inline.
 */
export function extractImageUrls(event: NostrEvent): string[] {
  const urls: string[] = [];

  for (const tag of event.tags) {
    if (tag[0] !== 'imeta') continue;
    for (const part of tag.slice(1)) {
      if (typeof part === 'string' && part.startsWith('url ')) {
        const url = part.slice(4).trim();
        if (url) urls.push(url);
      }
    }
  }

  const matches = event.content.match(imageUrlRegex());
  if (matches) urls.push(...matches);

  return Array.from(new Set(urls));
}

/**
 * A kind-1 note is treated as a reply when it carries an `e` tag that threads it
 * onto another note (NIP-10). The story timeline shows only top-level posts, so
 * those are filtered out.
 *
 * NIP-10 marked `e` tags are `['e', <id>, <relay?>, <marker?>]` where the marker
 * is `root`, `reply` or `mention`. A `mention` marker is a quote/reference, not a
 * threading link, so it does NOT make the note a reply — otherwise legitimate
 * top-level posts that quote another note would be dropped. Unmarked (legacy
 * positional) `e` tags are conservatively treated as replies.
 */
export function isReply(event: NostrEvent): boolean {
  return event.tags.some((tag) => tag[0] === 'e' && tag[3] !== 'mention');
}

/**
 * Remove bare image URLs from note content so the text reads cleanly when the
 * images are rendered separately. Collapses the runs of blank lines that
 * removal can leave behind and trims surrounding whitespace.
 */
export function stripImageUrls(content: string): string {
  return content
    .replace(imageUrlRegex(), '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Predefined "ship from" locations for the product Location field.
 *
 * This backs the NIP-99 `location` tag on a product listing (kind 30402) — a
 * free-text display label describing where the item ships *from* (e.g. "UK").
 * It is distinct from the ISO 3166-1 alpha-2 destination country codes used by
 * shipping options (kind 30406 `country` tags, see `src/lib/countries.ts`),
 * which describe where the shop ships *to* and are matched programmatically
 * against checkout addresses.
 *
 * Because `location` is a free-text display string (not matched against
 * anything else in the app), this is kept as a small curated list of plain
 * names rather than reusing the full ISO country list — the shop is UK-based
 * and ships from a handful of regions, so a short, readable list beats 249
 * ISO codes. "Worldwide" is a deliberate non-country sentinel for items that
 * ship from anywhere. Existing free-text values not in this list (e.g. from
 * before this dropdown existed) are preserved as an extra option by the form.
 */
export const PRODUCT_LOCATIONS: readonly string[] = [
  'UK',
  'Ireland',
  'France',
  'Germany',
  'Netherlands',
  'Spain',
  'Italy',
  'USA',
  'Worldwide',
];

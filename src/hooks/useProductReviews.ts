import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrFilter } from '@nostrify/nostrify';

import { useNostrPublish } from '@/hooks/useNostrPublish';
import {
  REVIEW_KIND,
  aggregateReviews,
  buildReviewEvent,
  parseReviews,
  type CategoryStars,
  type ParsedReview,
  type ReviewAggregate,
} from '@/lib/productReviews';

export interface ProductReviewsData {
  reviews: ParsedReview[];
  aggregate: ReviewAggregate;
}

/**
 * Fetch the kind-31555 reviews for a product coordinate
 * (`a:30402:<merchantPubkey>:<productDTag>`). Reviews are de-duped to the
 * newest per author and aggregated into an average (stars) + count.
 */
export function useProductReviews(coord: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<ProductReviewsData>({
    queryKey: ['product-reviews', coord],
    enabled: !!coord,
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(4000)]);

      const filter: NostrFilter = {
        kinds: [REVIEW_KIND],
        '#d': [coord!],
        // Cap the result set so a heavily-reviewed product can't return an
        // unbounded number of events (we de-dupe to newest-per-author anyway).
        limit: 500,
      };

      const events = await nostr.query([filter], { signal });
      const reviews = parseReviews(events);
      return { reviews, aggregate: aggregateReviews(reviews) };
    },
  });
}

export interface PublishReviewParams {
  /** Product coordinate: `a:30402:<merchantPubkey>:<productDTag>`. */
  coord: string;
  /** Overall rating, 1..5 stars. */
  stars: number;
  /** Free-text review (may be empty). */
  content?: string;
  /** Optional per-category ratings, in stars. */
  categories?: CategoryStars[];
}

/**
 * Publish a kind-31555 product review signed by the current user. Re-publishing
 * for the same product (same `d`/coordinate) replaces the user's prior review.
 */
export function usePublishReview() {
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ coord, stars, content, categories }: PublishReviewParams) => {
      const template = buildReviewEvent({ coord, stars, content, categories });
      return publishEvent(template);
    },
    onSuccess: (_event, { coord }) => {
      queryClient.invalidateQueries({ queryKey: ['product-reviews', coord] });
    },
  });
}

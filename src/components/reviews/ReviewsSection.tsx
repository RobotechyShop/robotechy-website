import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useProductReviews } from '@/hooks/useProductReviews';
import { StarRating } from './StarRating';
import { ReviewForm } from './ReviewForm';
import { ReviewItem } from './ReviewItem';
import type { ParsedReview } from '@/lib/productReviews';

/** Stable empty array so `useMemo` deps don't change every render. */
const EMPTY_REVIEWS: ParsedReview[] = [];

interface ReviewsSectionProps {
  /** Product coordinate: `a:30402:<merchantPubkey>:<productDTag>`. */
  coord: string;
  /** Hide the "Reviews" title (e.g. when a tab already labels it). The
   *  star-rating aggregate is still shown. */
  hideHeading?: boolean;
  className?: string;
}

/**
 * Product reviews section: an aggregate rating (average stars + count), a
 * write-a-review form (sign-in prompt when signed out), and the list of
 * reviews. Mounted on the product detail page.
 */
export function ReviewsSection({ coord, hideHeading = false, className }: ReviewsSectionProps) {
  const { user } = useCurrentUser();
  const { data, isLoading, error } = useProductReviews(coord);

  const reviews = data?.reviews ?? EMPTY_REVIEWS;
  const aggregate = data?.aggregate ?? { average: 0, count: 0 };

  const ownReview = useMemo(
    () => (user ? reviews.find((r) => r.pubkey === user.pubkey) : undefined),
    [reviews, user]
  );

  // With hideHeading, drop the redundant "Reviews" label but still surface the
  // rating aggregate when there is one; if there's nothing to show, omit the
  // header entirely so the content sits flush.
  const showAggregate = !isLoading && aggregate.count > 0;
  const showHeader = !hideHeading || showAggregate;

  return (
    <Card className={cn('rounded-none sm:rounded-lg', className)}>
      {showHeader && (
        <CardHeader className="px-2 pt-6 pb-4 sm:p-6">
          <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {!hideHeading && (
              <span className="flex items-center gap-2">
                <Star className="h-5 w-5" />
                <span>Reviews</span>
              </span>
            )}
            {showAggregate && (
              <span className="flex items-center gap-2 text-sm font-normal">
                <StarRating stars={aggregate.average} size="sm" />
                <span className="font-semibold">{aggregate.average.toFixed(1)}</span>
                <span className="text-muted-foreground">
                  ({aggregate.count} {aggregate.count === 1 ? 'review' : 'reviews'})
                </span>
              </span>
            )}
          </CardTitle>
        </CardHeader>
      )}

      <CardContent
        className={cn('px-2 pb-6 sm:p-6 space-y-6', showHeader ? 'pt-2 sm:pt-0' : 'pt-6 sm:pt-6')}
      >
        {/* Write / edit a review (or sign-in prompt). key={coord} remounts the
            form on product change so prior input never leaks across products. */}
        <ReviewForm key={coord} coord={coord} existing={ownReview} />

        {/* Reviews list */}
        {error ? (
          <div className="text-center py-8 text-muted-foreground">
            <Star className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>Failed to load reviews</p>
          </div>
        ) : isLoading ? (
          <div className="space-y-4">
            {[...Array(2)].map((_, i) => (
              <Card key={i} className="bg-card/50">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                  <Skeleton className="h-12 w-full mt-3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Star className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium mb-1">No reviews yet</p>
            <p className="text-sm">Be the first to review this product!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => (
              <ReviewItem
                key={review.id}
                review={review}
                isOwn={!!user && review.pubkey === user.pubkey}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

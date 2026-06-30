import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ReviewsSection } from '@/components/reviews/ReviewsSection';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { useProductReviews } from '@/hooks/useProductReviews';
import { useComments } from '@/hooks/useComments';
import { commentRootRef } from '@/lib/productComments';
import { cn } from '@/lib/utils';
import type { NostrEvent } from '@nostrify/nostrify';

interface ProductFeedbackTabsProps {
  /** The kind-30402 product event the comments are rooted on. */
  event: NostrEvent;
  /** Product review coordinate: `a:30402:<merchantPubkey>:<productDTag>`. */
  coord: string;
  className?: string;
}

/**
 * Reviews + Comments shown as two tabs on the product detail page (defaults to
 * Reviews). Tab labels carry a live count sourced from the same hooks the
 * sections use — React Query dedupes by query key, so mounting them here costs
 * no extra network. Each section keeps all its own behaviour (signed-out
 * prompts, posting, etc.).
 */
export function ProductFeedbackTabs({ event, coord, className }: ProductFeedbackTabsProps) {
  const { data: reviewsData } = useProductReviews(coord);
  const { data: commentsData } = useComments(event);

  const reviewCount = reviewsData?.aggregate.count ?? 0;
  const commentCount = commentsData?.topLevelComments.length ?? 0;

  const triggerClass =
    'data-[state=active]:bg-robotechy-green data-[state=active]:text-black data-[state=active]:shadow-sm font-semibold';

  return (
    <Tabs defaultValue="reviews" className={cn('w-full', className)}>
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="reviews" className={triggerClass}>
          Reviews{reviewCount > 0 ? ` (${reviewCount})` : ''}
        </TabsTrigger>
        <TabsTrigger value="comments" className={triggerClass}>
          Comments{commentCount > 0 ? ` (${commentCount})` : ''}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="reviews" className="mt-4">
        <ReviewsSection coord={coord} />
      </TabsContent>

      <TabsContent value="comments" className="mt-4">
        {/* key remounts the section per product so prior input never leaks.
            Keyed by the stable product coordinate (not event.id, which changes
            on listing edits) so harmless refetches don't remount. */}
        <CommentsSection
          key={commentRootRef(event)}
          root={event}
          emptyStateSubtitle="Be the first to start the discussion!"
        />
      </TabsContent>
    </Tabs>
  );
}

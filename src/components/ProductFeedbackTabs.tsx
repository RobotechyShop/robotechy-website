import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ReviewsSection } from '@/components/reviews/ReviewsSection';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { useProductReviews } from '@/hooks/useProductReviews';
import { useComments } from '@/hooks/useComments';
import { commentRootRef } from '@/lib/productComments';
import { cn } from '@/lib/utils';
import { Star, MessageSquare } from 'lucide-react';
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

  // Classic underlined tabs: override the shadcn primitive's segmented/pill
  // defaults (muted rounded list bg + filled active pill) at the usage site so
  // the shared ui/tabs.tsx stays untouched for other screens. The tablist is a
  // full-width row with a bottom rule; the active tab is shown by a brand-green
  // underline that overlaps that rule (via -mb-px). The active *label* stays
  // dark (text-foreground) for legibility — luminous green text reads poorly on
  // white, so the green is used only as the underline indicator.
  const listClass =
    'h-auto w-full justify-start gap-6 rounded-none border-b border-slate-200 bg-transparent p-0 text-muted-foreground dark:border-slate-700';
  const triggerClass =
    '-mb-px inline-flex items-center gap-2 rounded-none border-b-2 border-transparent bg-transparent px-1 pb-3 pt-2 font-medium text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:border-robotechy-green data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none';

  return (
    <Tabs defaultValue="reviews" className={cn('w-full', className)}>
      <TabsList className={listClass}>
        <TabsTrigger value="reviews" className={triggerClass}>
          <Star className="h-4 w-4" />
          Reviews{reviewCount > 0 ? ` (${reviewCount})` : ''}
        </TabsTrigger>
        <TabsTrigger value="comments" className={triggerClass}>
          <MessageSquare className="h-4 w-4" />
          Comments{commentCount > 0 ? ` (${commentCount})` : ''}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="reviews" className="mt-4">
        {/* hideHeading: the tab already labels this "Reviews" — the section
            drops its redundant title but keeps the star-rating aggregate. */}
        <ReviewsSection coord={coord} hideHeading />
      </TabsContent>

      <TabsContent value="comments" className="mt-4">
        {/* key remounts the section per product so prior input never leaks.
            Keyed by the stable product coordinate (not event.id, which changes
            on listing edits) so harmless refetches don't remount.
            hideHeading: the tab already labels this "Comments". */}
        <CommentsSection
          key={commentRootRef(event)}
          root={event}
          hideHeading
          emptyStateSubtitle="Be the first to start the discussion!"
        />
      </TabsContent>
    </Tabs>
  );
}

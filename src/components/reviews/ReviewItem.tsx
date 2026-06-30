import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { StarRating } from './StarRating';
import type { ParsedReview } from '@/lib/productReviews';

interface ReviewItemProps {
  review: ParsedReview;
  /** Highlight as the signed-in user's own review. */
  isOwn?: boolean;
}

/** A single review: reviewer avatar/name, their stars, text and relative time. */
export function ReviewItem({ review, isOwn = false }: ReviewItemProps) {
  const author = useAuthor(review.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? genUserName(review.pubkey);
  const npub = nip19.npubEncode(review.pubkey);
  const timeAgo = formatDistanceToNow(new Date(review.createdAt * 1000), { addSuffix: true });

  return (
    <Card className="bg-card/50">
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center space-x-3">
              <Link to={`/${npub}`}>
                <Avatar className="h-9 w-9 hover:ring-2 hover:ring-robotechy-green/40 transition-all">
                  <AvatarImage src={metadata?.picture} alt={displayName} />
                  <AvatarFallback className="text-xs">
                    {displayName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/${npub}`}
                    className="font-medium text-sm hover:text-robotechy-green-dark transition-colors"
                  >
                    {displayName}
                  </Link>
                  {isOwn && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      You
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{timeAgo}</p>
              </div>
            </div>
            <StarRating stars={review.stars} size="sm" />
          </div>

          {review.text && (
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
              {review.text}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

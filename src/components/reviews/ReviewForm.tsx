import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Star, Send } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { usePublishReview } from '@/hooks/useProductReviews';
import { StarRatingInput } from './StarRating';
import LoginDialog from '@/components/auth/LoginDialog';
import type { ParsedReview } from '@/lib/productReviews';

interface ReviewFormProps {
  /** Product coordinate: `a:30402:<merchantPubkey>:<productDTag>`. */
  coord: string;
  /** The signed-in user's existing review, if any (enables edit/prefill). */
  existing?: ParsedReview;
  onSuccess?: () => void;
}

/**
 * Write-a-review form: a 1..5 star picker plus a free-text area. Signed-out
 * users see a prompt that opens the LoginDialog rather than a silent no-op.
 * Re-submitting replaces the user's previous review (same `d` coordinate).
 */
export function ReviewForm({ coord, existing, onSuccess }: ReviewFormProps) {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const { mutateAsync: publishReview, isPending } = usePublishReview();

  const [stars, setStars] = useState(existing ? Math.round(existing.stars) : 0);
  const [content, setContent] = useState(existing?.text ?? '');
  const [showLogin, setShowLogin] = useState(false);

  // Keep the form in sync when the user's existing review loads/changes.
  useEffect(() => {
    if (existing) {
      setStars(Math.round(existing.stars));
      setContent(existing.text);
    }
  }, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isEditing = !!existing;

  if (!user) {
    return (
      <>
        <Card className="border-dashed">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center space-x-2 text-muted-foreground">
                <Star className="h-5 w-5" />
                <span>Sign in to write a review</span>
              </div>
              <Button
                type="button"
                onClick={() => setShowLogin(true)}
                className="bg-robotechy-green text-black hover:brightness-110 font-semibold"
              >
                Sign in to review
              </Button>
            </div>
          </CardContent>
        </Card>
        <LoginDialog
          isOpen={showLogin}
          onClose={() => setShowLogin(false)}
          onLogin={() => setShowLogin(false)}
        />
      </>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (stars < 1) {
      toast({
        title: 'Add a rating',
        description: 'Please select at least one star before submitting.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await publishReview({ coord, stars, content: content.trim() });
      toast({
        title: isEditing ? 'Review updated ✓' : 'Review submitted ✓',
        description: 'Thanks for sharing your feedback!',
      });
      onSuccess?.();
    } catch (error) {
      toast({
        title: 'Could not submit review',
        description: error instanceof Error ? error.message : 'Failed to publish your review.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="review-rating">Your rating</Label>
            <StarRatingInput value={stars} onChange={setStars} disabled={isPending} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="review-content">Your review (optional)</Label>
            <Textarea
              id="review-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Share your experience with this product…"
              className="min-h-[100px]"
              disabled={isPending}
            />
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={isPending || stars < 1}
              className="bg-robotechy-green text-black hover:brightness-110 font-semibold"
            >
              <Send className="h-4 w-4 mr-2" />
              {isPending
                ? isEditing
                  ? 'Updating…'
                  : 'Submitting…'
                : isEditing
                  ? 'Update review'
                  : 'Submit review'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

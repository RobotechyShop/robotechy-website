import { useSeoMeta } from '@unhead/react';
import { BookOpen, MessageCircle } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { StoryNote } from '@/components/StoryNote';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FollowUsButton } from '@/components/FollowUsButton';
import { useStoryNotes } from '@/hooks/useStoryNotes';
import { useAuthor } from '@/hooks/useAuthor';
import { MERCHANT_PUBKEY } from '@/hooks/useProducts';
import { useMessagesDrawer } from '@/hooks/useMessagesDrawer';
import { genUserName } from '@/lib/genUserName';

const Story = () => {
  // The whole page is "the shop's story": both the timeline and the hero profile
  // are sourced from MERCHANT_PUBKEY, the shop's canonical Nostr account (the one
  // that publishes the catalog and that "Follow Us" follows).
  const author = useAuthor(MERCHANT_PUBKEY);
  // Default to [] so an empty result renders the empty-state card rather than a
  // blank section.
  const { data: notes = [], isLoading, isError } = useStoryNotes();
  const { openMessages } = useMessagesDrawer();

  const metadata = author.data?.metadata;
  const name = metadata?.display_name || metadata?.name || genUserName(MERCHANT_PUBKEY);
  const bio =
    metadata?.about ||
    'The story of Robotechy — 3D printing for the Bitcoin community, one print at a time.';

  useSeoMeta({
    title: 'Story | Robotechy',
    description:
      "Follow the Robotechy story — build logs, new prints and behind-the-scenes updates, straight from the shop's Nostr feed.",
  });

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <Header />

      {/* Profile hero — the shop's kind-0 banner / avatar / name / about. */}
      <div>
        {/* Banner: the shop's profile banner, or a brand-green gradient fallback
            when the kind-0 metadata has no banner image. */}
        <div
          data-testid="story-banner"
          className="relative h-40 w-full sm:h-56 bg-gradient-to-r from-robotechy-green/30 via-robotechy-green-dark/20 to-sage-200 dark:to-neutral-800"
        >
          {metadata?.banner && (
            <img
              src={metadata.banner}
              alt={`${name} banner`}
              decoding="async"
              referrerPolicy="no-referrer"
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
        </div>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Avatar overlaps the banner, profile-style. */}
          <div className="-mt-12 sm:-mt-14">
            <Avatar className="h-24 w-24 border-4 border-white shadow-md dark:border-neutral-950 sm:h-28 sm:w-28">
              <AvatarImage src={metadata?.picture} alt={name} />
              <AvatarFallback className="text-3xl">
                {(name.trim().charAt(0) || 'R').toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="mt-3">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
              {name}
            </h1>
            <p className="mt-2 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-sage-600 dark:text-sage-400">
              {bio}
            </p>
          </div>

          {/* Action row — sits in the content area below the banner so the
              buttons form a clean, aligned row (wraps on narrow screens). */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => openMessages()}
              className="gap-1.5"
            >
              <MessageCircle className="h-4 w-4" />
              Message
            </Button>
            <FollowUsButton size="sm" showViewOnNostr={false} />
          </div>

          <div className="mt-4 flex items-center gap-2 border-t border-sage-100 pt-4 text-sm font-medium text-robotechy-green-dark dark:border-sage-800">
            <BookOpen className="h-4 w-4" />
            <span>Our Story</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {isLoading && (
          <div className="space-y-8" data-testid="story-loading">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-4 sm:gap-6">
                <Skeleton className="mt-1.5 h-4 w-4 shrink-0 rounded-full" />
                <div className="flex-1 space-y-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-48 w-full rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && isError && (
          <Card className="border-sage-200 dark:border-sage-800">
            <CardContent className="py-12 text-center">
              <p className="text-sage-600 dark:text-sage-400">
                We couldn't load the story feed right now. Please try again later.
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && notes.length === 0 && (
          <Card className="border-sage-200 dark:border-sage-800">
            <CardContent className="py-12 text-center">
              <BookOpen className="w-12 h-12 text-sage-400 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                No posts yet
              </h2>
              <p className="text-sage-600 dark:text-sage-400 text-sm">
                The story is just getting started. Follow Robotechy on Nostr to be the first to
                know.
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && notes.length > 0 && (
          <ol className="list-none">
            {notes.map((event, index) => (
              <StoryNote key={event.id} event={event} isLast={index === notes.length - 1} />
            ))}
          </ol>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Story;

import { useSeoMeta } from '@unhead/react';
import { BookOpen, ExternalLink } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { StoryNote } from '@/components/StoryNote';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { useStoryNotes } from '@/hooks/useStoryNotes';
import { useAuthor } from '@/hooks/useAuthor';
import { SHOP_OWNER_NPUB, shopOwnerPubkey } from '@/lib/shopOwner';
import { genUserName } from '@/lib/genUserName';

const Story = () => {
  const pubkey = shopOwnerPubkey();
  const author = useAuthor(pubkey);
  // Default to [] so a disabled query (empty pubkey from a malformed
  // SHOP_OWNER_NPUB) renders the empty-state card rather than a blank section.
  const { data: notes = [], isLoading, isError } = useStoryNotes();

  const metadata = author.data?.metadata;
  const name = metadata?.display_name || metadata?.name || genUserName(pubkey);
  const bio =
    metadata?.about ||
    'The story of Robotechy — 3D printing for the Bitcoin community, one print at a time.';

  useSeoMeta({
    title: 'Story | Robotechy',
    description:
      "Follow the Robotechy story — build logs, new prints and behind-the-scenes updates, straight from the shop owner's Nostr feed.",
  });

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <Header />

      {/* Hero */}
      <div className="bg-gradient-to-b from-sage-100 to-white dark:from-neutral-900 dark:to-neutral-950 py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-robotechy-green-dark/10 rounded-full mb-6">
            <BookOpen className="w-8 h-8 text-robotechy-green-dark" />
          </div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-4">Our Story</h1>
          <p className="text-lg text-sage-600 dark:text-sage-400 max-w-2xl mx-auto mb-8">
            Build logs, fresh prints and behind-the-scenes moments — told in real time through
            Robotechy's Nostr feed.
          </p>
          <div className="flex flex-col items-center gap-4">
            <Avatar className="h-20 w-20 border-2 border-robotechy-green">
              <AvatarImage src={metadata?.picture} alt={name} />
              <AvatarFallback className="text-2xl">
                {(name.trim().charAt(0) || 'R').toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-base font-semibold text-slate-900 dark:text-white">{name}</p>
              <p className="text-sm text-sage-600 dark:text-sage-400 max-w-md mt-1 whitespace-pre-line line-clamp-3">
                {bio}
              </p>
            </div>
            {/* CTA targets the author whose notes power this feed (the shop
                owner), keeping it aligned with the hero/timeline source rather
                than the shop account. */}
            <a
              href={`https://njump.me/${SHOP_OWNER_NPUB}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-robotechy-green px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
            >
              Follow {name} on Nostr
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
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

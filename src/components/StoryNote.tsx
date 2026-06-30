import { useMemo, useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { formatDistanceToNow } from 'date-fns';
import { Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { NoteContent } from '@/components/NoteContent';
import { ZapButton } from '@/components/ZapButton';
import { StoryReplies } from '@/components/StoryReplies';
import LoginDialog from '@/components/auth/LoginDialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { extractImageUrls, stripImageUrls } from '@/lib/storyNotes';
import { cn } from '@/lib/utils';

interface StoryNoteProps {
  event: NostrEvent;
  /** Hides the connecting line below the final node so the timeline ends cleanly. */
  isLast?: boolean;
}

/**
 * A single entry in the story timeline: a brand-green node on the vertical
 * spine, a relative timestamp, the note text (with image URLs stripped and the
 * remainder linkified via {@link NoteContent}) and any attached images.
 */
export function StoryNote({ event, isLast = false }: StoryNoteProps) {
  const { user } = useCurrentUser();
  const [showLogin, setShowLogin] = useState(false);
  const images = useMemo(() => extractImageUrls(event), [event]);

  // Render the note through NoteContent (links/mentions/hashtags) but with the
  // raw image URLs removed, since those images are shown in the grid below.
  const textEvent = useMemo<NostrEvent>(
    () => ({ ...event, content: stripImageUrls(event.content) }),
    [event]
  );

  const timestamp = new Date(event.created_at * 1000);
  const timeAgo = formatDistanceToNow(timestamp, { addSuffix: true });
  const fullDate = timestamp.toLocaleString();
  const hasText = textEvent.content.length > 0;

  // Derive a short, content-aware alt from the post text so screen readers get
  // something meaningful rather than the same generic label repeated; fall back
  // to a numbered generic label when the post has no text.
  const altBase = textEvent.content.trim().slice(0, 80);
  const imageAlt = (index: number) => {
    if (!altBase) return `Robotechy story post image ${index + 1}`;
    return images.length > 1 ? `${altBase} (image ${index + 1})` : altBase;
  };

  return (
    <li className="relative flex gap-4 sm:gap-6">
      {/* Timeline spine + node */}
      <div className="flex flex-col items-center">
        <span
          className="mt-1.5 h-4 w-4 shrink-0 rounded-full bg-robotechy-green ring-4 ring-robotechy-green/20"
          aria-hidden="true"
        />
        {!isLast && (
          <span
            className="mt-1 w-0.5 grow bg-gradient-to-b from-robotechy-green/40 to-transparent"
            aria-hidden="true"
          />
        )}
      </div>

      {/* Note card */}
      <Card className="mb-8 flex-1 overflow-hidden border-sage-200 shadow-sm transition-shadow hover:shadow-md dark:border-sage-800">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <time
            dateTime={timestamp.toISOString()}
            title={fullDate}
            className="text-xs font-medium uppercase tracking-wide text-robotechy-green-dark"
          >
            {timeAgo}
          </time>

          {hasText && (
            <NoteContent
              event={textEvent}
              className="text-sage-700 dark:text-sage-200 leading-relaxed"
            />
          )}

          {images.length > 0 && (
            <div
              className={cn(
                'grid gap-3',
                images.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
              )}
            >
              {images.map((src, index) => (
                <img
                  key={src}
                  src={src}
                  alt={imageAlt(index)}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="w-full rounded-lg border border-sage-200 object-cover dark:border-sage-800"
                />
              ))}
            </div>
          )}

          {/* Action row: zap. Logged-in users with a zappable author see the
              real ZapButton (NIP-57); signed-out users see a zap affordance that
              prompts sign-in rather than failing silently. */}
          <div className="flex items-center gap-4 pt-1">
            {user ? (
              <ZapButton
                target={event}
                className="text-xs text-sage-600 hover:text-robotechy-green-dark dark:text-sage-300"
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowLogin(true)}
                className="flex items-center gap-1 text-xs text-sage-600 transition-colors hover:text-robotechy-green-dark dark:text-sage-300"
              >
                <Zap className="h-4 w-4" />
                <span>Zap</span>
              </button>
            )}
          </div>

          <StoryReplies note={event} />
        </CardContent>
      </Card>

      <LoginDialog
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        onLogin={() => setShowLogin(false)}
      />
    </li>
  );
}

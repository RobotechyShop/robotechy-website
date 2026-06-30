import { useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { formatDistanceToNow } from 'date-fns';
import { nip19 } from 'nostr-tools';
import { Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { NoteContent } from '@/components/NoteContent';
import { ZapButton } from '@/components/ZapButton';
import LoginDialog from '@/components/auth/LoginDialog';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { genUserName } from '@/lib/genUserName';

/**
 * A single reply (kind-1) shown under a story post: the commenter's avatar and
 * name (from their kind-0 metadata), a relative timestamp, the linkified reply
 * text, and a zap affordance for the reply itself.
 */
export function StoryReply({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const { user } = useCurrentUser();
  const [showLogin, setShowLogin] = useState(false);
  const metadata = author.data?.metadata;
  const name = metadata?.display_name || metadata?.name || genUserName(event.pubkey);
  const npub = nip19.npubEncode(event.pubkey);
  const timeAgo = formatDistanceToNow(new Date(event.created_at * 1000), { addSuffix: true });

  return (
    <div className="flex gap-3">
      <Link to={`/${npub}`} className="shrink-0">
        <Avatar className="h-8 w-8">
          <AvatarImage src={metadata?.picture} alt={name} />
          <AvatarFallback>{(name.trim().charAt(0) || '?').toUpperCase()}</AvatarFallback>
        </Avatar>
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <Link
            to={`/${npub}`}
            className="text-sm font-medium text-slate-900 hover:text-robotechy-green-dark dark:text-white"
          >
            {name}
          </Link>
          <span className="text-xs text-sage-500 dark:text-sage-400">{timeAgo}</span>
        </div>
        <NoteContent
          event={event}
          className="mt-0.5 text-sm text-sage-700 dark:text-sage-200 leading-relaxed"
        />
        {/* Zap the reply (NIP-57). Signed-in users see the real ZapButton (which
            self-hides on a self-zap or an author with no lightning address);
            signed-out users get a Zap affordance that opens the sign-in dialog —
            the same login-gated pattern as posts and the hero. */}
        <div className="mt-1">
          {user ? (
            <ZapButton
              target={event}
              className="text-xs text-sage-500 hover:text-robotechy-green-dark dark:text-sage-300"
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowLogin(true)}
              className="flex items-center gap-1 text-xs text-sage-500 transition-colors hover:text-robotechy-green-dark dark:text-sage-300"
            >
              <Zap className="h-4 w-4" />
              <span>Zap</span>
            </button>
          )}
        </div>
      </div>

      <LoginDialog
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        onLogin={() => setShowLogin(false)}
      />
    </div>
  );
}

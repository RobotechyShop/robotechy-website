import { useEffect, useState } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import { Check, ExternalLink, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { MERCHANT_PUBKEY } from '@/hooks/useProducts';
import { addFollow, isFollowing } from '@/lib/contactList';
import LoginDialog from '@/components/auth/LoginDialog';

/**
 * The shop's canonical Nostr account: the same npub the catalog (kind 30402) is
 * published from and that the footer's "Nostr" social link points to. This is
 * "the shop you'd follow", as opposed to Isaac's personal identity which only
 * drives the About Me bio/avatar.
 */
const SHOP_NPUB = nip19.npubEncode(MERCHANT_PUBKEY);
const SHOP_NJUMP_URL = `https://njump.me/${SHOP_NPUB}`;

/** The Nostr ostrich/logo mark (same artwork as the footer's Nostr social link). */
function NostrIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
      <path d="M128,0C57.308,0,0,57.308,0,128s57.308,128,128,128,128-57.308,128-128S198.692,0,128,0Zm56.414,181.707-13.328-5.332a15.5,15.5,0,0,0-11.516.165l-11.833,5.063a31.124,31.124,0,0,1-24.3-.044l-11.656-4.993a15.523,15.523,0,0,0-11.528-.165l-13.328,5.332a7.5,7.5,0,0,1-10.088-3.889l-25.6-64a7.5,7.5,0,0,1,3.889-10.088l13.328-5.332a15.523,15.523,0,0,0,9.03-9.03l5.332-13.328a7.5,7.5,0,0,1,10.088-3.889l64,25.6a7.5,7.5,0,0,1,3.889,10.088l-5.332,13.328a15.523,15.523,0,0,0,.165,11.528l4.993,11.656a31.124,31.124,0,0,1,.044,24.3l-5.063,11.833a15.5,15.5,0,0,0-.165,11.516l5.332,13.328A7.5,7.5,0,0,1,184.414,181.707Z" />
    </svg>
  );
}

interface FollowUsButtonProps {
  /** Extra classes for the wrapper (controls alignment in each placement). */
  className?: string;
  /** Button size, forwarded to the shadcn Button. */
  size?: 'default' | 'sm' | 'lg';
}

/**
 * A "Follow Us" button that follows the shop's Nostr account by adding it to the
 * signed-in user's kind-3 contact list (preserving every existing follow).
 *
 * - Signed in: reads the current kind-3 on mount to show "Following" when already
 *   following; clicking publishes an updated kind-3 and toasts on success.
 * - Signed out: opens the LoginDialog (auto-following once signed in) and always
 *   offers a "View on Nostr" fallback link so the shop can be followed externally.
 */
export function FollowUsButton({ className, size = 'default' }: FollowUsButtonProps) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent, isPending: isPublishing } = useNostrPublish();
  const { toast } = useToast();

  const [showLogin, setShowLogin] = useState(false);
  // Set when a signed-out user clicks Follow, so we follow automatically once
  // they finish signing in (rather than making them click a second time).
  const [followAfterLogin, setFollowAfterLogin] = useState(false);
  // Optimistic "Following" state, set the moment a publish succeeds.
  const [justFollowed, setJustFollowed] = useState(false);

  // The signed-in user's latest kind-3 contact list (their follows).
  const { data: contactList } = useQuery({
    queryKey: ['contact-list', user?.pubkey],
    enabled: !!user,
    staleTime: 60 * 1000,
    queryFn: async ({ signal }) => {
      const [event] = await nostr.query([{ kinds: [3], authors: [user!.pubkey], limit: 1 }], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]),
      });
      return event ?? null;
    },
  });

  const alreadyFollowing =
    justFollowed || (!!contactList && isFollowing(contactList.tags, MERCHANT_PUBKEY));

  const follow = async () => {
    // Read the freshest kind-3 at click time so we never clobber follows added
    // since mount. Fall back to the cached one, then to an empty list.
    let baseEvent = contactList;
    try {
      const [latest] = await nostr.query([{ kinds: [3], authors: [user!.pubkey], limit: 1 }], {
        signal: AbortSignal.timeout(3000),
      });
      if (latest) baseEvent = latest;
    } catch {
      // Network hiccup — proceed with the cached contact list.
    }

    const baseTags = baseEvent?.tags ?? [];
    if (isFollowing(baseTags, MERCHANT_PUBKEY)) {
      setJustFollowed(true);
      return;
    }

    try {
      await publishEvent({
        kind: 3,
        // Preserve the relay-list JSON some clients store in kind-3 content.
        content: baseEvent?.content ?? '',
        tags: addFollow(baseTags, MERCHANT_PUBKEY),
      });
      setJustFollowed(true);
      toast({
        title: 'Following ✓',
        description: "You're now following Robotechy on Nostr.",
      });
    } catch (error) {
      toast({
        title: 'Could not follow',
        description: error instanceof Error ? error.message : 'Failed to update your follow list.',
        variant: 'destructive',
      });
    }
  };

  // Auto-follow once a signed-out user has signed in via the dialog.
  useEffect(() => {
    if (user && followAfterLogin) {
      setFollowAfterLogin(false);
      void follow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, followAfterLogin]);

  const handleClick = () => {
    if (alreadyFollowing) return;
    if (!user) {
      setFollowAfterLogin(true);
      setShowLogin(true);
      return;
    }
    void follow();
  };

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <Button
        type="button"
        size={size}
        onClick={handleClick}
        disabled={isPublishing}
        aria-label={alreadyFollowing ? 'Following Robotechy on Nostr' : 'Follow Robotechy on Nostr'}
        aria-pressed={alreadyFollowing}
        className={cn(
          'font-semibold',
          alreadyFollowing
            ? 'bg-robotechy-green/15 text-robotechy-green-dark hover:bg-robotechy-green/25 dark:text-robotechy-green'
            : 'bg-robotechy-green text-black hover:brightness-110'
        )}
      >
        {isPublishing ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
        ) : alreadyFollowing ? (
          <Check className="h-4 w-4 mr-2" aria-hidden="true" />
        ) : (
          <NostrIcon className="h-4 w-4 mr-2" />
        )}
        {alreadyFollowing ? 'Following' : 'Follow Us'}
      </Button>

      <a
        href={SHOP_NJUMP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-sage-600 dark:text-sage-400 hover:text-robotechy-green-dark transition-colors"
      >
        View on Nostr
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>

      <LoginDialog
        isOpen={showLogin}
        onClose={() => {
          setShowLogin(false);
          // User dismissed without signing in — cancel the queued auto-follow.
          setFollowAfterLogin(false);
        }}
        onLogin={() => setShowLogin(false)}
      />
    </div>
  );
}

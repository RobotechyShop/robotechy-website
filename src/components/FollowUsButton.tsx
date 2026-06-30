import { useEffect, useRef, useState } from 'react';
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
import { NostrIcon } from '@/components/NostrIcon';

/**
 * The shop's canonical Nostr account: the same npub the catalog (kind 30402) is
 * published from and that the footer's "Nostr" social link points to. This is
 * "the shop you'd follow", as opposed to Isaac's personal identity which only
 * drives the About Me bio/avatar.
 */
const SHOP_NPUB = nip19.npubEncode(MERCHANT_PUBKEY);
const SHOP_NJUMP_URL = `https://njump.me/${SHOP_NPUB}`;

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
  // LoginDialog calls onLogin() then onClose() on success, but onClose() alone
  // on dismissal. This ref lets onClose tell the two apart so a successful login
  // keeps the queued auto-follow instead of cancelling it.
  const loginSucceededRef = useRef(false);
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
    // since mount. `contactList === undefined` means the mount query has not
    // resolved yet (unknown list); `null` means it resolved to "no kind-3".
    let baseEvent = contactList ?? null;
    // Whether we have a trustworthy view of the user's current follows. We only
    // publish once we do, otherwise an empty fallback could wipe real follows.
    let haveReliableBase = contactList !== undefined;
    try {
      const [latest] = await nostr.query([{ kinds: [3], authors: [user!.pubkey], limit: 1 }], {
        signal: AbortSignal.timeout(3000),
      });
      baseEvent = latest ?? baseEvent;
      haveReliableBase = true;
    } catch {
      // Network hiccup — fall back to the cached contact list if we have one.
    }

    if (!haveReliableBase) {
      toast({
        title: 'Could not follow',
        description: "Couldn't load your follow list — please try again.",
        variant: 'destructive',
      });
      return;
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

  // Reset the optimistic "Following" flag whenever the active account changes
  // (account switch or logout), so it never leaks into another user's view.
  useEffect(() => {
    setJustFollowed(false);
  }, [user?.pubkey]);

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
          // Only a genuine dismissal cancels the queued auto-follow; a
          // successful login (which also fires onClose) keeps it so the
          // [user, followAfterLogin] effect can run.
          if (!loginSucceededRef.current) {
            setFollowAfterLogin(false);
          }
          loginSucceededRef.current = false;
        }}
        onLogin={() => {
          loginSucceededRef.current = true;
          setShowLogin(false);
        }}
      />
    </div>
  );
}

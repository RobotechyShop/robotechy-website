import { useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { StoryReply } from '@/components/StoryReply';
import LoginDialog from '@/components/auth/LoginDialog';
import { useNoteReplies } from '@/hooks/useNoteReplies';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { buildReplyTags } from '@/lib/noteReplies';

/**
 * The reply thread under a story post: other users' kind-1 NIP-10 replies plus a
 * composer. Signed-in users post a kind-1 reply tagging the parent note;
 * signed-out users are prompted to sign in via {@link LoginDialog} rather than
 * silently failing.
 */
export function StoryReplies({ note }: { note: NostrEvent }) {
  const { data: replies = [], isLoading } = useNoteReplies(note.id);
  const { user } = useCurrentUser();
  const { mutateAsync: publish, isPending } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [content, setContent] = useState('');
  const [showLogin, setShowLogin] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Don't fail silently for signed-out users — prompt them to sign in first,
    // before any content check, so the affordance always leads somewhere.
    if (!user) {
      setShowLogin(true);
      return;
    }

    const text = content.trim();
    if (!text) return;

    try {
      await publish({ kind: 1, content: text, tags: buildReplyTags(note) });
      setContent('');
      toast({ title: 'Reply posted', description: 'Your reply is on its way to the relays.' });
      await queryClient.invalidateQueries({ queryKey: ['note-replies', note.id] });
    } catch (err) {
      toast({
        title: 'Could not post reply',
        description: err instanceof Error ? err.message : 'Failed to publish your reply.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="mt-4 border-t border-sage-100 pt-4 dark:border-sage-800">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-sage-700 dark:text-sage-300">
        <MessageSquare className="h-4 w-4" />
        <span>Replies</span>
        {!isLoading && <span className="text-sage-500 dark:text-sage-400">({replies.length})</span>}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : replies.length > 0 ? (
        <div className="space-y-4">
          {replies.map((reply) => (
            <StoryReply key={reply.id} event={reply} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-sage-500 dark:text-sage-400">
          No replies yet — be the first to respond.
        </p>
      )}

      {/* Composer */}
      <form onSubmit={handleSubmit} className="mt-4 space-y-2">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={user ? 'Write a reply…' : 'Sign in to join the conversation…'}
          className="min-h-[72px]"
          disabled={isPending}
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            // Signed-out: always enabled so the click can prompt sign-in.
            // Signed-in: disabled until there's text to post.
            disabled={isPending || (!!user && !content.trim())}
            className="bg-robotechy-green text-black hover:brightness-110"
          >
            <Send className="mr-2 h-4 w-4" />
            {isPending ? 'Posting…' : user ? 'Reply' : 'Sign in to reply'}
          </Button>
        </div>
      </form>

      <LoginDialog
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        onLogin={() => setShowLogin(false)}
      />
    </div>
  );
}

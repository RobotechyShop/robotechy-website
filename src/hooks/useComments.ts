import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import {
  commentFilterForRoot,
  commentRootRef,
  getTagValue,
  isTopLevelComment,
} from '@/lib/productComments';

/** Default comment-query limit. Exported as the single source of truth so every
 *  caller — CommentsSection, the tab count, nested Comment reply threads — keys
 *  the same query. */
export const DEFAULT_COMMENTS_LIMIT = 500;

export function useComments(root: NostrEvent | URL, limit: number = DEFAULT_COMMENTS_LIMIT) {
  const { nostr } = useNostr();

  // Normalise the limit here (rather than letting callers pass `undefined`) so a
  // bare `useComments(root)` and an explicit `useComments(root, 500)` share one
  // React Query cache entry instead of issuing a second, unbounded query.
  return useQuery({
    queryKey: ['nostr', 'comments', commentRootRef(root), limit],
    queryFn: async (c) => {
      const filter = commentFilterForRoot(root, limit);

      // Query for all kind 1111 comments that reference this root regardless of depth.
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);
      const events = await nostr.query([filter], { signal });

      // Filter top-level comments (those whose lowercase parent tag matches the root).
      const topLevelComments = events.filter((comment) => isTopLevelComment(comment, root));

      // Helper function to get all descendants of a comment
      const getDescendants = (parentId: string): NostrEvent[] => {
        const directReplies = events.filter((comment) => {
          const eTag = getTagValue(comment, 'e');
          return eTag === parentId;
        });

        const allDescendants = [...directReplies];

        // Recursively get descendants of each direct reply
        for (const reply of directReplies) {
          allDescendants.push(...getDescendants(reply.id));
        }

        return allDescendants;
      };

      // Create a map of comment ID to its descendants
      const commentDescendants = new Map<string, NostrEvent[]>();
      for (const comment of events) {
        commentDescendants.set(comment.id, getDescendants(comment.id));
      }

      // Sort top-level comments by creation time (newest first)
      const sortedTopLevel = topLevelComments.sort((a, b) => b.created_at - a.created_at);

      return {
        allComments: events,
        topLevelComments: sortedTopLevel,
        getDescendants: (commentId: string) => {
          const descendants = commentDescendants.get(commentId) || [];
          // Sort descendants by creation time (oldest first for threaded display)
          return descendants.sort((a, b) => a.created_at - b.created_at);
        },
        getDirectReplies: (commentId: string) => {
          const directReplies = events.filter((comment) => {
            const eTag = getTagValue(comment, 'e');
            return eTag === commentId;
          });
          // Sort direct replies by creation time (oldest first for threaded display)
          return directReplies.sort((a, b) => a.created_at - b.created_at);
        },
      };
    },
    enabled: !!root,
  });
}

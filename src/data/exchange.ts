import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Database } from '@/lib/database';
import { isDemo } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

import {
  exchangeShowcaseAuthor,
  exchangeShowcaseCollectorPosts,
  exchangeShowcasePosts,
  exchangeShowcaseThread,
  isExchangeShowcasePost,
} from './exchangeShowcase';
import { keys } from './keys';

export type ExchangeIntent = Database['public']['Enums']['exchange_intent'];

export type ExchangePhoto = {
  path: string;
  url: string;
};

/**
 * Who wrote a post or a comment. The handle and the collector number are
 * stamped onto the row when it is written; the name and the photograph are
 * read live, so a person who changes either changes it everywhere at once.
 */
export type ExchangeAuthor = {
  id: string;
  handle: string | null;
  number: number;
  name: string | null;
  avatar_url: string | null;
};

/** Up, down, or no vote from this person. */
export type VoteValue = 1 | 0 | -1;

export type ExchangePost = {
  id: string;
  intent: ExchangeIntent;
  title: string;
  price_cents: number | null;
  currency: string;
  body: string;
  created_at: string;
  author: ExchangeAuthor;
  comment_count: number;
  vote_count: number;
  my_vote: VoteValue;
  cover_url: string | null;
};

export type ExchangeComment = {
  id: string;
  /** The comment this one answers. Replies are one level deep and no more. */
  parent_id: string | null;
  body: string;
  created_at: string;
  author: ExchangeAuthor;
  vote_count: number;
  my_vote: VoteValue;
};

export type ExchangeThread = {
  post: Database['public']['Tables']['exchange_posts']['Row'] | null;
  author: ExchangeAuthor;
  comments: ExchangeComment[];
  photos: ExchangePhoto[];
  vote_count: number;
  my_vote: VoteValue;
};

type AuthorColumns = {
  author_id: string;
  author_handle: string | null;
  author_number: number;
  author_name: string | null;
  author_avatar_url: string | null;
};

function author(row: AuthorColumns): ExchangeAuthor {
  return {
    id: row.author_id,
    handle: row.author_handle,
    number: row.author_number,
    name: row.author_name,
    avatar_url: row.author_avatar_url,
  };
}

const NOBODY: ExchangeAuthor = {
  id: '',
  handle: null,
  number: 0,
  name: null,
  avatar_url: null,
};

/** The identity shown on a collector route opened outside Community. */
export function useCollectorProfile(userId: string | null) {
  return useQuery({
    queryKey: keys.collectorProfile(userId ?? 'none'),
    enabled: Boolean(userId),
    queryFn: async (): Promise<ExchangeAuthor | null> => {
      if (!userId) return null;
      const showcase = exchangeShowcaseAuthor(userId);
      if (showcase) return showcase;
      if (isDemo) return null;
      const { data, error } = await supabase.rpc('collector_profile', { p_user_id: userId });
      if (error) throw error;
      const row = data?.[0];
      return row
        ? {
            id: row.id,
            handle: row.handle,
            number: row.collector_number,
            name: row.name,
            avatar_url: row.avatar_url,
          }
        : null;
    },
  });
}

const PHOTO_BUCKET = 'exchange-photos';

const PHOTO_TYPES: Record<string, { ext: string; contentType: string }> = {
  'image/jpeg': { ext: 'jpg', contentType: 'image/jpeg' },
  'image/jpg': { ext: 'jpg', contentType: 'image/jpeg' },
  'image/png': { ext: 'png', contentType: 'image/png' },
  'image/webp': { ext: 'webp', contentType: 'image/webp' },
};

export function exchangePhotoUrl(path: string) {
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

const INTENT_LABEL: Record<ExchangeIntent, string> = {
  sell: 'Selling',
  buy: 'Buying',
  trade: 'Trading',
  random: 'Random',
};

export function intentLabel(intent: ExchangeIntent) {
  return INTENT_LABEL[intent];
}

/** One of a collector's posts, without the vote row. The profile is a list of offers. */
export type CollectorPost = {
  id: string;
  intent: ExchangeIntent;
  title: string;
  price_cents: number | null;
  currency: string;
  body: string;
  cover_url: string | null;
};

/**
 * The posts one person has written. The board can already read every post, so
 * this is that list filtered to them. Their name and photograph come from the
 * post that was tapped: `profiles` is still readable only by its owner.
 */
export function useCollectorPosts(userId: string | null) {
  return useQuery({
    queryKey: keys.collectorPosts(userId ?? 'none'),
    enabled: Boolean(userId),
    queryFn: async (): Promise<CollectorPost[]> => {
      if (!userId) return [];
      const showcase = exchangeShowcaseCollectorPosts(userId);
      if (showcase.length) return showcase;
      if (isDemo) return [];
      const posts = await supabase
        .from('exchange_posts')
        .select('id, intent, title, price_cents, currency, body, created_at')
        .eq('author_id', userId)
        .order('created_at', { ascending: false });
      if (posts.error) throw posts.error;
      const rows = posts.data ?? [];
      if (rows.length === 0) return [];

      const photos = await supabase
        .from('exchange_photos')
        .select('post_id, storage_path, position')
        .in(
          'post_id',
          rows.map((row) => row.id)
        )
        .order('position');
      if (photos.error) throw photos.error;

      const cover = new Map<string, string>();
      for (const photo of photos.data ?? []) {
        if (!cover.has(photo.post_id)) cover.set(photo.post_id, photo.storage_path);
      }

      return rows.map((row) => {
        const path = cover.get(row.id);
        return {
          id: row.id,
          intent: row.intent,
          title: row.title,
          price_cents: row.price_cents,
          currency: row.currency,
          body: row.body,
          cover_url: path ? exchangePhotoUrl(path) : null,
        };
      });
    },
  });
}

export function useExchangeFeed() {
  return useQuery({
    queryKey: keys.exchange,
    queryFn: async (): Promise<ExchangePost[]> => {
      if (isDemo) return exchangeShowcasePosts();
      const { data, error } = await supabase.rpc('exchange_feed');
      if (error) throw error;
      const live = (data ?? []).map((row) => ({
        id: row.id,
        intent: row.intent,
        title: row.title,
        price_cents: row.price_cents,
        currency: row.currency,
        body: row.body,
        created_at: row.created_at,
        author: author(row),
        comment_count: Number(row.comment_count),
        vote_count: Number(row.vote_count),
        my_vote: Number(row.my_vote) as VoteValue,
        cover_url: row.cover_path ? exchangePhotoUrl(row.cover_path) : null,
      }));
      const examples = exchangeShowcasePosts().filter(
        (post) => !live.some((row) => row.id === post.id),
      );
      return [...live, ...examples];
    },
  });
}

const EMPTY_THREAD: ExchangeThread = {
  post: null,
  author: NOBODY,
  comments: [],
  photos: [],
  vote_count: 0,
  my_vote: 0,
};

export function useExchangePost(postId: string | null) {
  return useQuery({
    queryKey: keys.exchangePost(postId ?? 'none'),
    enabled: Boolean(postId),
    queryFn: async (): Promise<ExchangeThread> => {
      if (!postId) return EMPTY_THREAD;
      const showcase = exchangeShowcaseThread(postId);
      if (showcase) return showcase;
      if (isDemo) return EMPTY_THREAD;
      const [post, author_, comments, photos] = await Promise.all([
        supabase.from('exchange_posts').select('*').eq('id', postId).maybeSingle(),
        // The post's row is readable; its author's profile is not. The
        // function is what reads across that line.
        supabase.rpc('exchange_post_author', { p_post_id: postId }),
        supabase.rpc('exchange_thread', { p_post_id: postId }),
        supabase
          .from('exchange_photos')
          .select('storage_path, position')
          .eq('post_id', postId)
          .order('position'),
      ]);
      if (post.error) throw post.error;
      if (author_.error) throw author_.error;
      if (comments.error) throw comments.error;
      if (photos.error) throw photos.error;
      const head = author_.data?.[0];
      return {
        post: post.data,
        author: head ? author(head) : NOBODY,
        comments: (comments.data ?? []).map((row) => ({
          id: row.id,
          parent_id: row.parent_id,
          body: row.body,
          created_at: row.created_at,
          author: author(row),
          vote_count: Number(row.vote_count),
          my_vote: Number(row.my_vote) as VoteValue,
        })),
        photos: (photos.data ?? []).map((photo) => ({
          path: photo.storage_path,
          url: exchangePhotoUrl(photo.storage_path),
        })),
        vote_count: Number(head?.vote_count ?? 0),
        my_vote: Number(head?.my_vote ?? 0) as VoteValue,
      };
    },
  });
}

async function uploadExchangePhoto(
  userId: string,
  file: { uri: string; mimeType: string },
  index: number
) {
  const kind = PHOTO_TYPES[file.mimeType];
  if (!kind) throw new Error('Use a jpeg, png, or webp photo.');
  const body = await fetch(file.uri).then((response) => response.arrayBuffer());
  const path = `${userId}/${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}.${kind.ext}`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, body, {
    contentType: kind.contentType,
  });
  if (error) throw error;
  return path;
}

export type ExchangeDraftPhoto =
  | { kind: 'remote'; path: string; url: string }
  | { kind: 'local'; uri: string; mimeType: string };

export function useSaveExchangePost(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      postId: string | null;
      intent: ExchangeIntent;
      title: string;
      body: string;
      priceCents: number | null;
      photos: ExchangeDraftPhoto[];
      removedPaths: string[];
    }) => {
      if (isDemo) throw new Error('Exchange needs a signed-in account.');
      const paths: string[] = [];
      for (const [index, photo] of input.photos.entries()) {
        paths.push(
          photo.kind === 'remote' ? photo.path : await uploadExchangePhoto(userId, photo, index)
        );
      }
      const { data, error } = await supabase.rpc('save_exchange_post', {
        p_post_id: input.postId,
        p_intent: input.intent,
        p_title: input.title.trim(),
        p_body: input.body.trim(),
        p_price_cents: input.priceCents,
        p_photo_paths: paths,
      });
      if (error) throw error;
      if (input.removedPaths.length) {
        await supabase.storage.from(PHOTO_BUCKET).remove(input.removedPaths);
      }
      return data;
    },
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: keys.exchange });
      void queryClient.invalidateQueries({ queryKey: ['collector-posts'] });
      if (id) void queryClient.invalidateQueries({ queryKey: keys.exchangePost(id) });
    },
  });
}

export function useDeleteExchangePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { postId: string; paths: string[] }) => {
      if (isDemo) throw new Error('Exchange needs a signed-in account.');
      const { error } = await supabase.from('exchange_posts').delete().eq('id', input.postId);
      if (error) throw error;
      if (input.paths.length) await supabase.storage.from(PHOTO_BUCKET).remove(input.paths);
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: keys.exchange });
      void queryClient.invalidateQueries({ queryKey: ['collector-posts'] });
      void queryClient.removeQueries({ queryKey: keys.exchangePost(input.postId) });
    },
  });
}

function cast<T extends { vote_count: number; my_vote: VoteValue }>(row: T, value: VoteValue): T {
  // Swinging from down to up is a swing of two. No clamp: a post can stand
  // below zero, which is the whole point of a downvote.
  return { ...row, vote_count: row.vote_count + (value - row.my_vote), my_vote: value };
}

/**
 * `value` is the vote after the press — 0 takes it back. `commentId` votes a
 * comment, not the post.
 */
export function useCastExchangeVote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { postId: string; commentId?: string; value: VoteValue }) => {
      if (isExchangeShowcasePost(input.postId)) return;
      if (isDemo) throw new Error('Exchange needs a signed-in account.');
      // A function, not a write: changing direction has to upsert against a
      // partial unique index, which the client cannot name.
      const { error } = await supabase.rpc('exchange_vote', {
        p_post_id: input.commentId ? null : input.postId,
        p_comment_id: input.commentId ?? null,
        p_value: input.value,
      });
      if (error) throw error;
    },
    onMutate: (input) => {
      const feed = queryClient.getQueryData<ExchangePost[]>(keys.exchange);
      const thread = queryClient.getQueryData<ExchangeThread>(keys.exchangePost(input.postId));
      if (feed && !input.commentId) {
        queryClient.setQueryData<ExchangePost[]>(
          keys.exchange,
          feed.map((post) => (post.id === input.postId ? cast(post, input.value) : post))
        );
      }
      if (thread) {
        queryClient.setQueryData<ExchangeThread>(
          keys.exchangePost(input.postId),
          input.commentId
            ? {
                ...thread,
                comments: thread.comments.map((comment) =>
                  comment.id === input.commentId ? cast(comment, input.value) : comment
                ),
              }
            : cast(thread, input.value)
        );
      }
      return { feed, thread };
    },
    onError: (_error, input, context) => {
      if (context?.feed) queryClient.setQueryData(keys.exchange, context.feed);
      if (context?.thread) {
        queryClient.setQueryData(keys.exchangePost(input.postId), context.thread);
      }
    },
  });
}

export function useCreateExchangeComment(userId: string, postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { body: string; parentId: string | null }) => {
      if (isExchangeShowcasePost(postId)) return;
      if (isDemo) throw new Error('Exchange needs a signed-in account.');
      const { error } = await supabase.from('exchange_comments').insert({
        post_id: postId,
        author_id: userId,
        body: input.body.trim(),
        parent_id: input.parentId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.exchangePost(postId) });
      void queryClient.invalidateQueries({ queryKey: keys.exchange });
    },
  });
}

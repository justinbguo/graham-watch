import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { isDemo } from '@/lib/demo';
import { formatTitle } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { normalizeUsername } from '@/lib/username';

import { keys } from './keys';

/**
 * Who a thread is with. A shop, or a person — never both, and the database
 * decides which one you are looking at: a buyer sees the shop, and the shop's
 * owner sees the buyer.
 */
export type ConversationWith =
  | { kind: 'dealer'; dealerId: string; name: string; logoUrl: string | null; byEmail: boolean }
  | {
      kind: 'person';
      userId: string | null;
      name: string | null;
      handle: string | null;
      number: number;
      avatar_url: string | null;
    };

export type ConversationSummary = {
  id: string;
  with: ConversationWith;
  last: { body: string; at: string; mine: boolean } | null;
  unread: number;
};

export type ConversationHeader = {
  id: string;
  with: ConversationWith;
  /** False in a thread with a shop that has not claimed its account. */
  writable: boolean;
};

export type Message = {
  id: string;
  sender_id: string;
  body: string;
  /** `email` is an inquiry that left Graham for a shop with no account here. */
  via: 'app' | 'email';
  /** The watch an inquiry named, when the listing is still readable. */
  listing: string | null;
  created_at: string;
};

type PartyColumns = {
  dealer_id: string | null;
  dealer_name: string | null;
  dealer_logo_url: string | null;
  person_id: string | null;
  person_name: string | null;
  person_handle: string | null;
  person_number: number | null;
  person_avatar_url: string | null;
  by_email: boolean;
};

function party(row: PartyColumns): ConversationWith {
  if (row.dealer_id) {
    return {
      kind: 'dealer',
      dealerId: row.dealer_id,
      name: row.dealer_name ?? 'This shop',
      logoUrl: row.dealer_logo_url,
      byEmail: row.by_email,
    };
  }
  return {
    kind: 'person',
    userId: row.person_id,
    name: row.person_name,
    handle: row.person_handle,
    number: row.person_number ?? 0,
    avatar_url: row.person_avatar_url,
  };
}

/**
 * Both hooks poll. Supabase can push a row change over a websocket, but that
 * is a second connection to keep alive, authorise, and reconcile against the
 * cache — and a thread that catches up within a few seconds reads as live.
 * Swap it for a subscription when a slow answer starts costing a deal.
 */
const LIST_INTERVAL = 30_000;
const THREAD_INTERVAL = 5_000;

export function useConversations(userId: string | null) {
  return useQuery({
    queryKey: keys.conversations,
    enabled: Boolean(userId),
    refetchInterval: LIST_INTERVAL,
    queryFn: async (): Promise<ConversationSummary[]> => {
      if (isDemo) return [];
      const { data, error } = await supabase.rpc('conversation_list');
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        with: party(row),
        last: row.last_at
          ? { body: row.last_body ?? '', at: row.last_at, mine: Boolean(row.last_mine) }
          : null,
        unread: Number(row.unread),
      }));
    },
  });
}

export function useConversation(conversationId: string | null) {
  return useQuery({
    queryKey: keys.conversation(conversationId ?? 'none'),
    enabled: Boolean(conversationId),
    refetchInterval: THREAD_INTERVAL,
    queryFn: async (): Promise<{ header: ConversationHeader | null; messages: Message[] }> => {
      if (isDemo || !conversationId) return { header: null, messages: [] };
      const [header, messages] = await Promise.all([
        supabase.rpc('conversation_header', { p_conversation_id: conversationId }),
        supabase
          .from('messages')
          // The watch comes along for the ride: an inquiry names one, and a
          // buyer writes to the same shop about more than one.
          .select('id, sender_id, body, via, created_at, listings (brand, model, year)')
          .eq('conversation_id', conversationId)
          .order('created_at'),
      ]);
      if (header.error) throw header.error;
      if (messages.error) throw messages.error;
      const head = header.data?.[0];
      return {
        header: head ? { id: head.id, with: party(head), writable: head.writable } : null,
        messages: (messages.data ?? []).map((row) => {
          const listing = Array.isArray(row.listings) ? row.listings[0] : row.listings;
          return {
            id: row.id,
            sender_id: row.sender_id,
            body: row.body,
            via: row.via === 'email' ? ('email' as const) : ('app' as const),
            listing: listing ? formatTitle(listing) : null,
            created_at: row.created_at,
          };
        }),
      };
    },
  });
}

/** Marks a message the server has not confirmed yet. Never a real row's id. */
export const PENDING_ID = 'pending:';

export function isPending(message: Message) {
  return message.id.startsWith(PENDING_ID);
}

type Thread = { header: ConversationHeader | null; messages: Message[] };

/**
 * The bubble is in the thread the moment Send is pressed. A message that
 * waited on the round trip to appear made every send feel like a slow one.
 * The pending row is replaced by the server's when the refetch lands, and
 * taken out again if the write fails.
 */
export function useSendMessage(
  conversationId: string,
  userId: string,
  /** Set when this visit is a reply to one watch. Later messages in the visit name it too. */
  about?: { listingId: string; title: string | null } | null,
) {
  const queryClient = useQueryClient();
  const queryKey = keys.conversation(conversationId);
  return useMutation({
    mutationFn: async (body: string) => {
      if (isDemo) throw new Error('Messages need a signed-in account.');
      const { error } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: userId,
        body: body.trim(),
        ...(about ? { listing_id: about.listingId } : {}),
      });
      if (error) throw error;
    },
    onMutate: async (body) => {
      // A poll landing mid-send would overwrite the pending row with a list
      // that does not have it yet.
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Thread>(queryKey);
      const pending: Message = {
        id: `${PENDING_ID}${Date.now()}`,
        sender_id: userId,
        body: body.trim(),
        via: 'app',
        listing: about?.title ?? null,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<Thread>(queryKey, (thread) =>
        thread ? { ...thread, messages: [...thread.messages, pending] } : thread
      );
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: keys.conversations });
      void queryClient.invalidateQueries({ queryKey: keys.discussed });
    },
  });
}

/**
 * Opens the buyer's thread with the shop selling this watch, or finds the one
 * that already exists. One shop is one thread. The watch is named on the
 * message, not by opening a second conversation.
 */
export function useMessageAboutListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (listingId: string): Promise<string> => {
      if (isDemo) throw new Error('Messages need a signed-in account.');
      const { data, error } = await supabase.rpc('conversation_about_listing', {
        p_listing_id: listingId,
      });
      if (error) throw error;
      if (!data) throw new Error('Could not open that conversation.');
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.conversations });
    },
  });
}

/** The newest message that names a saved watch, for the line on its wishlist row. */
export type ListingThread = { body: string; at: string };

/**
 * The latest message about each watch this buyer has written about. A message
 * names its listing, so the wishlist can show that line and tell a first
 * message from a thread that already exists. One shop is still one thread.
 */
export function useListingThreads(userId: string | null) {
  return useQuery({
    queryKey: keys.discussed,
    enabled: Boolean(userId),
    queryFn: async (): Promise<Record<string, ListingThread>> => {
      if (isDemo || !userId) return {};
      const { data, error } = await supabase
        .from('messages')
        .select('listing_id, body, created_at')
        .not('listing_id', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const latest: Record<string, ListingThread> = {};
      for (const row of data ?? []) {
        if (!row.listing_id || latest[row.listing_id]) continue;
        latest[row.listing_id] = { body: row.body, at: row.created_at };
      }
      return latest;
    },
  });
}

/**
 * Opens the thread with a person, or finds the one that already exists. There
 * is no second thread with the same person: two halves of one conversation is
 * two places to look for the same answer.
 */
export function useMessagePerson() {
  return useMutation({
    mutationFn: async (userId: string): Promise<string> => {
      if (isDemo) throw new Error('Messages need a signed-in account.');
      const { data, error } = await supabase.rpc('conversation_with_person', {
        p_user_id: userId,
      });
      if (error) throw error;
      if (!data) throw new Error('Could not open that conversation.');
      return data;
    },
  });
}

/**
 * Opens the thread with the account that owns this username, or finds the
 * one that already exists. Profiles are readable only by their owner, so the
 * handle is resolved inside `conversation_with_handle` — one exact name, not
 * a list of people.
 */
export function useMessageByHandle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (handle: string): Promise<string> => {
      if (isDemo) throw new Error('Messages need a signed-in account.');
      const { data, error } = await supabase.rpc('conversation_with_handle', {
        p_handle: normalizeUsername(handle),
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Could not open that conversation.');
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.conversations });
    },
  });
}

/** A one-letter search matches almost every thread. Wait for a real word. */
export const BODY_SEARCH_MIN = 2;

/**
 * Threads whose messages contain this text. The list already has the latest
 * line; this finds a word said earlier, from the newest thousand matches.
 * Row-level security — rules stored in the database about who may read which
 * rows — limits this to conversations you are in.
 */
export function useMessagesMatching(query: string) {
  const term = query.trim().toLowerCase();
  return useQuery({
    queryKey: keys.messageSearch(term),
    enabled: term.length >= BODY_SEARCH_MIN && !isDemo,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('messages')
        .select('conversation_id')
        .ilike('body', likePattern(term))
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return [...new Set((data ?? []).map((row) => row.conversation_id))];
    },
  });
}

/** `%` and `_` are wildcards in `ilike`. A search for them should find them. */
function likePattern(query: string) {
  return `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * Opens the buyer's thread with this shop, or finds the one that already
 * exists. One shop is one thread, the same one a saved watch opens.
 */
export function useMessageDealer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dealerId: string): Promise<string> => {
      if (isDemo) throw new Error('Messages need a signed-in account.');
      const { data, error } = await supabase.rpc('conversation_with_dealer', {
        p_dealer_id: dealerId,
      });
      if (error) throw error;
      if (!data) throw new Error('Could not open that conversation.');
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.conversations });
    },
  });
}

export function useMarkConversationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (isDemo) return;
      const { error } = await supabase.rpc('mark_conversation_read', {
        p_conversation_id: conversationId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.conversations });
    },
  });
}

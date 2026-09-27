import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { isDemo } from '@/lib/demo';
import { formatTitle } from '@/lib/format';
import { supabase } from '@/lib/supabase';

import { keys } from './keys';

/**
 * Who a thread is with. A shop, or a person — never both, and the database
 * decides which one you are looking at: a buyer sees the shop, and the shop's
 * owner sees the buyer.
 */
export type ConversationWith =
  | { kind: 'dealer'; dealerId: string; name: string; byEmail: boolean }
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

export function useSendMessage(conversationId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      if (isDemo) throw new Error('Messages need a signed-in account.');
      const { error } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: userId,
        body: body.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.conversation(conversationId) });
      void queryClient.invalidateQueries({ queryKey: keys.conversations });
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

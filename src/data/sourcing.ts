import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { NewSourcingRequest, SourcingReply, SourcingRequest } from '@/features/sourcing/types';

import { keys } from './keys';

/**
 * In-memory forum until sourcing has a table. Reloading the app resets posts.
 * Reads still go through TanStack Query so the Source tab matches Saved and Search.
 */
function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const SEED: SourcingRequest[] = [
  {
    id: 'src-explorer',
    authorId: 'maya',
    authorName: 'Maya Chen',
    brand: 'Rolex',
    model: 'Explorer',
    reference: '1016',
    budget: 'Up to $15,000',
    body: 'Looking for a gilt 1016 in honest condition. Service papers a plus. Based in New York — happy to travel in the northeast.',
    createdAt: hoursAgo(3),
    lookingCount: 8,
    lookingByMe: false,
    replies: [
      {
        id: 'r1',
        authorId: 'james',
        authorName: 'James Okafor',
        body: 'Saw a clean gilt at a dealer in Philadelphia last month. I can ask if it is still around.',
        createdAt: hoursAgo(2),
      },
      {
        id: 'r2',
        authorId: 'priya',
        authorName: 'Priya Shah',
        body: 'I have a 1016, 1967, papers, in Brooklyn. Dial is gilt with even patina. Message me if you want photos.',
        createdAt: hoursAgo(1),
      },
    ],
  },
  {
    id: 'src-patek',
    authorId: 'eli',
    authorName: 'Eli Navarro',
    brand: 'Patek Philippe',
    model: 'Calatrava',
    reference: '2526',
    budget: null,
    body: 'Enamel dial, any year. I know this is a unicorn — even a lead on one that sold last year would help.',
    createdAt: hoursAgo(14),
    lookingCount: 12,
    lookingByMe: false,
    replies: [
      {
        id: 'r3',
        authorId: 'sofia',
        authorName: 'Sofia Berg',
        body: 'A 2526 in yellow gold traded privately in Geneva this spring. I can put you in touch with the dealer who handled it.',
        createdAt: hoursAgo(9),
      },
    ],
  },
  {
    id: 'src-autavia',
    authorId: 'tom',
    authorName: 'Tom Ellison',
    brand: 'Heuer',
    model: 'Autavia',
    reference: null,
    budget: 'Up to $8,500',
    body: 'First execution, tropical dial if it exists in this budget. Prefer a watch that has been worn, not a safe queen.',
    createdAt: hoursAgo(30),
    lookingCount: 4,
    lookingByMe: false,
    replies: [],
  },
  {
    id: 'src-gs',
    authorId: 'hana',
    authorName: 'Hana Mori',
    brand: 'Grand Seiko',
    model: 'Manual',
    reference: 'SBGW231',
    budget: 'Up to $4,000',
    body: 'Birch dial, boxed. US or Japan shipping is fine.',
    createdAt: hoursAgo(52),
    lookingCount: 6,
    lookingByMe: false,
    replies: [
      {
        id: 'r4',
        authorId: 'noah',
        authorName: 'Noah Patel',
        body: 'Hodinkee Shop had one in February. Worth asking them if another is inbound.',
        createdAt: hoursAgo(40),
      },
    ],
  },
];

let store: SourcingRequest[] = SEED.map((request) => ({
  ...request,
  replies: [...request.replies],
}));

function clone(): SourcingRequest[] {
  return store.map((request) => ({ ...request, replies: [...request.replies] }));
}

function byRecency(a: SourcingRequest, b: SourcingRequest) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

async function listRequests(): Promise<SourcingRequest[]> {
  return clone().sort(byRecency);
}

async function getRequest(id: string): Promise<SourcingRequest | null> {
  return clone().find((request) => request.id === id) ?? null;
}

export function useSourcingRequests() {
  return useQuery({
    queryKey: keys.sourcing,
    queryFn: listRequests,
  });
}

export function useSourcingRequest(id: string | undefined) {
  return useQuery({
    queryKey: keys.sourcingRequest(id ?? ''),
    queryFn: () => getRequest(id!),
    enabled: Boolean(id),
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, requestId?: string) {
  queryClient.invalidateQueries({ queryKey: keys.sourcing });
  if (requestId) {
    queryClient.invalidateQueries({ queryKey: keys.sourcingRequest(requestId) });
  }
}

export function useCreateSourcingRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: NewSourcingRequest): Promise<SourcingRequest> => {
      const brand = input.brand.trim();
      const model = input.model.trim();
      if (!brand || !model) throw new Error('Brand and model are required.');

      const request: SourcingRequest = {
        id: uid('src'),
        authorId: input.authorId,
        authorName: input.authorName,
        brand,
        model,
        reference: input.reference.trim() || null,
        budget: input.budget.trim() || null,
        body: input.body.trim(),
        createdAt: new Date().toISOString(),
        lookingCount: 1,
        lookingByMe: true,
        replies: [],
      };
      store = [request, ...store];
      return request;
    },
    onSuccess: () => invalidate(queryClient),
  });
}

export function useToggleLooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const current = store.find((request) => request.id === requestId);
      if (!current) throw new Error('That request is gone.');
      current.lookingByMe = !current.lookingByMe;
      current.lookingCount += current.lookingByMe ? 1 : -1;
    },
    onSuccess: (_data, requestId) => invalidate(queryClient, requestId),
  });
}

export function useReplyToRequest(author: { id: string; name: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ requestId, body }: { requestId: string; body: string }) => {
      const text = body.trim();
      if (!text) throw new Error('Write a reply first.');

      const current = store.find((request) => request.id === requestId);
      if (!current) throw new Error('That request is gone.');

      const reply: SourcingReply = {
        id: uid('rep'),
        authorId: author.id,
        authorName: author.name,
        body: text,
        createdAt: new Date().toISOString(),
      };
      current.replies = [...current.replies, reply];
    },
    onSuccess: (_data, { requestId }) => invalidate(queryClient, requestId),
  });
}

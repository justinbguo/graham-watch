export type SourcingReply = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type SourcingRequest = {
  id: string;
  authorId: string;
  authorName: string;
  brand: string;
  model: string;
  reference: string | null;
  budget: string | null;
  body: string;
  createdAt: string;
  lookingCount: number;
  lookingByMe: boolean;
  replies: SourcingReply[];
};

export type NewSourcingRequest = {
  authorId: string;
  authorName: string;
  brand: string;
  model: string;
  reference: string;
  budget: string;
  body: string;
};

/**
 * Every cached query is identified by one of these keys. Keeping them in one
 * place is what makes invalidation safe — a mutation can look up exactly which
 * caches it invalidates instead of guessing at a string.
 */
export const keys = {
  deck: ['deck'] as const,
  saved: (userId: string) => ['saved', userId] as const,
  imported: (userId: string) => ['imported', userId] as const,
  listing: (listingId: string) => ['listing', listingId] as const,
  importJobs: (userId: string) => ['import-jobs', userId] as const,
  inquiries: (userId: string) => ['inquiries', userId] as const,
  dealers: ['dealers'] as const,
};

export function communityPosts<T>(live: T[], demoPosts: T[], demoMode: boolean): T[] {
  if (demoMode) return demoPosts;
  return live;
}

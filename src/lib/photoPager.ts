/** Page index for a horizontal, paging `ScrollView`. */
export function photoScrollPage(offsetX: number, pageWidth: number, count: number) {
  if (pageWidth <= 0 || count <= 0) return 0;
  return Math.min(Math.max(Math.round(offsetX / pageWidth), 0), count - 1);
}

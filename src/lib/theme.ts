/**
 * Theme plumbing. Tokens live in `src/lib/design.ts` — this file re-exports
 * them so existing `@/lib/theme` imports keep working.
 */
export {
  HIT_TARGET,
  WIDE_BREAKPOINT,
  color as palette,
  face,
  inset,
  layout,
  motion,
  radius,
  scrim,
  scrimTop,
  shadow,
  size,
  space,
  stack,
  themes,
  tracking,
  type,
  type ColorScheme,
  type LayoutWidth,
  type Theme,
  type ThemeColors,
} from '@/lib/design';

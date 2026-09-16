/**
 * Theme plumbing. Tokens live in `src/lib/design.ts` — this file re-exports
 * them so existing `@/lib/theme` imports keep working.
 */
export {
  HIT_TARGET,
  WIDE_BREAKPOINT,
  color as palette,
  family,
  inset,
  layout,
  motion,
  radius,
  scrim,
  size,
  space,
  stack,
  themes,
  tracking,
  type,
  weight,
  type ColorScheme,
  type LayoutWidth,
  type Theme,
  type ThemeColors,
} from '@/lib/design';

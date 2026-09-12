/**
 * Theme plumbing. Tokens live in `src/lib/design.ts` — this file re-exports
 * them so existing `@/lib/theme` imports keep working.
 */
export {
  HIT_TARGET,
  color as palette,
  font,
  inset,
  motion,
  radius,
  size,
  space,
  stack,
  themes,
  tracking,
  type,
  type ColorScheme,
  type Theme,
  type ThemeColors,
} from '@/lib/design';

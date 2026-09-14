import type { TextStyle } from 'react-native';

/**
 * Live design tokens. docs/DESIGN.md is the why; this file is the numbers the
 * UI actually reads. Change them together. A value that exists only in the
 * markdown is a value nobody follows.
 */

export const color = {
  light: {
    background: '#FAF8F4',
    surface: '#FFFFFF',
    surfaceSunken: '#F1EDE6',
    border: '#E5DFD4',
    borderStrong: '#CBC2B2',
    text: '#17140F',
    textMuted: '#7B7365',
    textFaint: '#A79E8E',
    accent: '#17140F',
    onAccent: '#FAF8F4',
    brass: '#8A6A3B',
    save: '#2E6B4F',
    danger: '#9A2B20',
    overlay: 'rgba(23, 20, 15, 0.45)',
    /** On a scrim over a photograph, which is dark in both schemes. */
    onOverlay: '#FFFFFF',
  },
  dark: {
    background: '#121110',
    surface: '#1A1817',
    surfaceSunken: '#0D0C0B',
    border: '#2B2724',
    borderStrong: '#443E38',
    text: '#F3EFE8',
    textMuted: '#9A9186',
    textFaint: '#6F675C',
    accent: '#F3EFE8',
    onAccent: '#17140F',
    brass: '#C9A468',
    save: '#5FB68C',
    danger: '#E0776B',
    overlay: 'rgba(0, 0, 0, 0.6)',
    onOverlay: '#FFFFFF',
  },
} as const;

export type ColorScheme = 'light' | 'dark';
export type ThemeColors = (typeof color)[ColorScheme];

export type Theme = {
  scheme: ColorScheme;
  color: ThemeColors;
};

export const themes: Record<ColorScheme, Theme> = {
  light: { scheme: 'light', color: color.light },
  dark: { scheme: 'dark', color: color.dark },
};

/**
 * Two families, and that is the whole system. EB Garamond is the old-style
 * serif for the wordmark and watch names. Inter is the grotesque for everything
 * you read in quantity — body, buttons, prices, tabs. Import each weight from
 * `@expo-google-fonts/<family>/<weight>` in the root layout, never from the
 * package root (that bundles every cut).
 */
export const font = {
  display: {
    regular: 'EBGaramond_400Regular',
    semibold: 'EBGaramond_600SemiBold',
    bold: 'EBGaramond_700Bold',
  },
  text: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
  },
} as const;

/** letterSpacing. Garamond runs wide; Inter is already tight. */
export const tracking = {
  display: -1.1,
  title: -0.6,
  body: -0.2,
  label: -0.1,
} as const;

export const type = {
  wordmark: {
    fontFamily: font.display.bold,
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: tracking.display,
  },
  display: {
    fontFamily: font.display.bold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: tracking.display,
  },
  title: {
    fontFamily: font.display.semibold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: tracking.title,
  },
  /** A watch name in a grid tile, where a 22pt serif wraps after two words. */
  titleSmall: {
    fontFamily: font.display.semibold,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: tracking.title,
  },
  /** Short editorial copy. Never fields, specs, prices, or long paragraphs. */
  editorial: {
    fontFamily: font.display.regular,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: tracking.title,
  },
  body: {
    fontFamily: font.text.regular,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: tracking.body,
  },
  bodyStrong: {
    fontFamily: font.text.medium,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: tracking.body,
  },
  label: {
    fontFamily: font.text.medium,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: tracking.label,
  },
  /** A run-in that has to hold its own beside another: the card's maker and dealer. */
  labelStrong: {
    fontFamily: font.text.semibold,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: tracking.label,
  },
  caption: {
    fontFamily: font.text.regular,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: tracking.body,
  },
  price: {
    fontFamily: font.text.semibold,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: tracking.label,
  },
  /** Same job in a grid tile. Still the heaviest thing in the block. */
  priceSmall: {
    fontFamily: font.text.semibold,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: tracking.label,
  },
  control: {
    fontFamily: font.text.medium,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: tracking.label,
  },
  tab: {
    fontFamily: font.text.medium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: tracking.label,
  },
  // A run-in above a title. Sentence case, so weight and colour do the
  // separating that capitals used to do.
  eyebrow: {
    fontFamily: font.text.semibold,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: tracking.label,
  },
} satisfies Record<string, TextStyle>;

/**
 * 8-point scale. Screen gutters and section gaps sit on the large end so a
 * watch photo has air around it. Controls stay on `sm`/`md` so a field does
 * not inherit the page gutter. The only off-scale values allowed are 1px
 * hairlines, the 2px swipe-card edge, and `size.rule`.
 */
export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 72,
} as const;

/** Padding jobs. Reach for these instead of guessing a step on `space`. */
export const inset = {
  screen: space.lg,
  card: space.lg,
  /** Fields and buttons. `md`/`sm`, never the page gutter. */
  controlY: space.sm,
  controlX: space.md,
  /** Compact enum options and header controls. */
  compactY: space.sm,
  compactX: space.md,
} as const;

/** Vertical rhythm between siblings. */
export const stack = {
  tight: space.xs,
  related: space.md,
  /** Groups inside a sheet or detail screen. Tighter than a page `section`. */
  group: space.xl,
  section: space.xxl,
} as const;

export const radius = {
  sm: 4,
  md: 6,
  lg: 10,
} as const;

export const motion = {
  fast: 160,
  base: 240,
  // A released gesture returns to rest. No spring: overshoot on a card the user
  // just declined to swipe reads as a bug, not as physics.
  settle: 220,
  // A saved card crossing the screen into the Saved tab. Long enough for the
  // eye to follow where the watch went, short enough that the next swipe is
  // never waiting on it.
  flight: 320,
} as const;

/** Minimum tappable area. Anything smaller needs hitSlop to reach it. */
export const HIT_TARGET = 44;

/**
 * Maximum content widths. A phone is narrower than every value here, so these
 * are inert on a phone and only bite once a window has room to spare.
 *
 * Nothing stretches to fill a desktop window. A 1600px line of Inter loses the
 * reader between one line and the next, and a swipe card that wide stops
 * reading as a card.
 */
export const layout = {
  /** Prose, forms, lists, detail screens. About 64 characters of `type.body`. */
  reading: 560,
  /** The swipe stage. A card should stay hand-sized at any window width. */
  card: 480,
  /** The browse grid, which spends width on columns rather than line length. */
  grid: 1280,
  /** Text-first navigation on a wide window. */
  rail: 176,
} as const;

export type LayoutWidth = Exclude<keyof typeof layout, 'rail'>;

/**
 * Above this width the deck opens on the grid: there is a mouse and no thumb.
 * Only the starting view — both are reachable at any width.
 */
export const WIDE_BREAKPOINT = 900;

export const size = {
  thumb: 72,
  /** Glyphs. `icon` for a tab or a header control, `iconSmall` inline with text. */
  icon: 24,
  iconSmall: 16,
  /** The tab bar itself, before the home-indicator inset padded under it. */
  tabBar: 56,
  /** A selection rule: the tab indicator, and a chosen row's left edge. */
  rule: 2,
  appleButton: HIT_TARGET + space.sm,
  controlMin: HIT_TARGET + space.sm,
  /** Web scrollbar. Thin enough to read as an edge, wide enough to grab. */
  scrollbar: space.sm,
  /** Four lines of `type.body` plus field padding. */
  fieldMultiline: space.xxxl + space.xxl,
} as const;

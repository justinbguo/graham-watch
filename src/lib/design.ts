import { Platform, type TextStyle } from 'react-native';

/**
 * Live design tokens. docs/DESIGN.md is the why; this file is the numbers the
 * UI actually reads. Change them together. A value that exists only in the
 * markdown is a value nobody follows.
 */

/**
 * Four warm tones carry the whole interface: the page, the fill of a thing on
 * the page, the well inside that thing, and the fill of anything you can press.
 * Nothing in this app is drawn with an outline — see docs/DESIGN.md — so these
 * values do that work instead, and each step between them is a real one in both
 * schemes rather than the hairline's difference it used to be.
 *
 * `fill` is the one tone that has to read against `background` and `surface`
 * alike, since a button sits on a page as often as on a card. That is why it is
 * a shade under `surface` on paper and a shade over it in the dark.
 */
export const color = {
  light: {
    background: '#FBF9F5',
    surface: '#F3EDE3',
    surfaceSunken: '#E8E0D2',
    fill: '#E6DECF',
    border: '#DFD7C8',
    /** The web scrollbar thumb, which is the only mid tone left. */
    scrollThumb: '#C3B9A6',
    text: '#17140F',
    // A step darker than the old muted, which was written against white and
    // fell under the contrast floor once containers stopped being white.
    textMuted: '#6E6656',
    textFaint: '#9C9483',
    accent: '#17140F',
    onAccent: '#FBF9F5',
    brass: '#7E5F33',
    save: '#2E6B4F',
    danger: '#9A2B20',
    overlay: 'rgba(23, 20, 15, 0.45)',
    /** On a scrim over a photograph, which is dark in both schemes. */
    onOverlay: '#FFFFFF',
  },
  dark: {
    background: '#121110',
    surface: '#1E1B18',
    surfaceSunken: '#0D0C0B',
    fill: '#302C27',
    border: '#2E2A26',
    scrollThumb: '#47413A',
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

/**
 * The wash a caption sits on when it sits on a photograph. Not themed: half
 * the watches in the deck are shot on white, so white type needs the same help
 * in either scheme. It fades rather than stopping, because a hard band across
 * a photograph crops the watch a second time.
 */
export const scrim =
  'linear-gradient(to top, rgba(23, 20, 15, 0.88) 0%, rgba(23, 20, 15, 0.55) 40%, rgba(23, 20, 15, 0) 100%)';

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
 * One family: SF Pro, in three weights. Nothing is bundled and nothing is
 * loaded. On iOS, SF Pro *is* the system face, and the way to ask for it is to
 * name no family at all — which also gets the optical cut Apple chose for the
 * point size, Text below 20pt and Display above it. On web the stack resolves
 * to SF Pro on Apple hardware and to the platform's own UI face elsewhere,
 * because Apple does not license SF Pro to ship off its platforms.
 */
export const family = Platform.select({
  web: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif',
  default: undefined,
});

/**
 * Weight carries the hierarchy that a second family used to: regular to read,
 * semibold to lead, bold to announce. Three and no more — a scale with a
 * medium in it has two weights that mean nearly the same thing, and the choice
 * between them becomes a coin toss on every new screen.
 *
 * These are real weights of the system face, so they render as drawn. Numeric
 * weights against a *bundled* family are the trap: Android ignores them and
 * synthesises a fake bold instead.
 */
export const weight = {
  regular: '400',
  semibold: '600',
  bold: '700',
} as const satisfies Record<string, TextStyle['fontWeight']>;

/**
 * letterSpacing. SF Pro tracks itself tighter as it grows, so only the sizes
 * above the body scale need help, and only a little. Tracking small system
 * text is how an interface starts to look like a slide deck.
 */
export const tracking = {
  display: -0.8,
  title: -0.4,
} as const;

export const type = {
  wordmark: {
    fontFamily: family,
    fontWeight: weight.bold,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: tracking.display,
  },
  display: {
    fontFamily: family,
    fontWeight: weight.bold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: tracking.display,
  },
  title: {
    fontFamily: family,
    fontWeight: weight.semibold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: tracking.title,
  },
  /** A watch name in a grid tile, where the full title wraps after two words. */
  titleSmall: {
    fontFamily: family,
    fontWeight: weight.semibold,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: tracking.title,
  },
  /** A lede: one sentence introducing a screen. Never fields, specs, or prices. */
  editorial: {
    fontFamily: family,
    fontWeight: weight.regular,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: tracking.title,
  },
  body: {
    fontFamily: family,
    fontWeight: weight.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  bodyStrong: {
    fontFamily: family,
    fontWeight: weight.semibold,
    fontSize: 16,
    lineHeight: 24,
  },
  label: {
    fontFamily: family,
    fontWeight: weight.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  /** A run-in that has to hold its own beside another: the card's dealer. */
  labelStrong: {
    fontFamily: family,
    fontWeight: weight.semibold,
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    fontFamily: family,
    fontWeight: weight.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  price: {
    fontFamily: family,
    fontWeight: weight.semibold,
    fontSize: 18,
    lineHeight: 24,
  },
  /** Same job in a grid tile. Still the heaviest thing in the block. */
  priceSmall: {
    fontFamily: family,
    fontWeight: weight.semibold,
    fontSize: 15,
    lineHeight: 20,
  },
  control: {
    fontFamily: family,
    fontWeight: weight.semibold,
    fontSize: 13,
    lineHeight: 18,
  },
  tab: {
    fontFamily: family,
    fontWeight: weight.semibold,
    fontSize: 11,
    lineHeight: 14,
  },
  // A run-in above a title. Sentence case, so weight and colour do the
  // separating that capitals used to do.
  eyebrow: {
    fontFamily: family,
    fontWeight: weight.semibold,
    fontSize: 13,
    lineHeight: 16,
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

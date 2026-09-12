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
 * watch photo has air around it. Controls use `md`, not `lg`, so buttons do
 * not inflate with the page.
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
  controlY: space.md,
  controlX: space.lg,
} as const;

/** Vertical rhythm between siblings. */
export const stack = {
  tight: space.xs,
  related: space.md,
  section: space.xxl,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999,
} as const;

export const motion = {
  fast: 160,
  base: 240,
  // A released gesture returns to rest. No spring: overshoot on a card the user
  // just declined to swipe reads as a bug, not as physics.
  settle: 220,
} as const;

/** Minimum tappable area. Anything smaller needs hitSlop to reach it. */
export const HIT_TARGET = 44;

export const size = {
  thumb: 72,
  tabIcon: 24,
  /** Photo progress segments: present but never competing with the photograph. */
  progress: 3,
  appleButton: HIT_TARGET + space.sm,
  controlMin: HIT_TARGET + space.sm,
} as const;

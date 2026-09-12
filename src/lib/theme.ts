import type { TextStyle } from 'react-native';

/**
 * Design tokens. Every colour, size, and duration in the app comes from here —
 * no literal hex values or magic numbers in components. The reasoning behind
 * these values lives in docs/DESIGN.md.
 */

// Warm neutrals throughout. A blue-grey palette reads like a fintech dashboard;
// vintage watches want paper, brass, and patina.
const light = {
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
};

const dark: typeof light = {
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
};

export const palette = { light, dark };

export type ColorScheme = 'light' | 'dark';
export type ThemeColors = typeof light;

export type Theme = {
  scheme: ColorScheme;
  color: ThemeColors;
};

export const themes: Record<ColorScheme, Theme> = {
  light: { scheme: 'light', color: light },
  dark: { scheme: 'dark', color: dark },
};

/**
 * Fraunces is an old-style serif with real character — it carries the brand and
 * the watch names. Archivo is a grotesque that stays quiet underneath it and has
 * the tabular figures that prices and reference numbers need.
 */
export const font = {
  display: {
    regular: 'Fraunces_400Regular',
    semibold: 'Fraunces_600SemiBold',
    bold: 'Fraunces_700Bold',
  },
  text: {
    regular: 'Archivo_400Regular',
    medium: 'Archivo_500Medium',
    semibold: 'Archivo_600SemiBold',
  },
} as const;

export const type = {
  wordmark: {
    fontFamily: font.display.bold,
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -0.8,
  },
  display: {
    fontFamily: font.display.bold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.4,
  },
  title: {
    fontFamily: font.display.semibold,
    fontSize: 22,
    lineHeight: 28,
  },
  body: {
    fontFamily: font.text.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  bodyStrong: {
    fontFamily: font.text.medium,
    fontSize: 16,
    lineHeight: 24,
  },
  label: {
    fontFamily: font.text.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    fontFamily: font.text.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  price: {
    fontFamily: font.text.semibold,
    fontSize: 18,
    lineHeight: 24,
  },
  // Small uppercase run-in above a heading. Needs the extra tracking or the
  // capitals crowd each other.
  eyebrow: {
    fontFamily: font.text.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
} satisfies Record<string, TextStyle>;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
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
  spring: { damping: 18, stiffness: 180 },
} as const;

/** Minimum tappable area. Anything smaller needs hitSlop to reach it. */
export const HIT_TARGET = 44;

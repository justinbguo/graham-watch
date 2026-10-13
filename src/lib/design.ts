import { Platform, type TextStyle } from 'react-native';

/**
 * Live design tokens. docs/DESIGN.md is the why; this file is the numbers the
 * UI actually reads. Change them together. A value that exists only in the
 * markdown is a value nobody follows.
 */

/**
 * Four warm tones carry the whole interface: the page, the fill of a thing on
 * the page, the well inside that thing, and the fill of a field or a chip.
 * Nothing in this app is drawn with an outline — see docs/DESIGN.md — so these
 * values do that work instead, and each step between them is a real one in both
 * schemes rather than the hairline's difference it used to be.
 *
 * A button is not one of those tones. It is `accent`, which is the page's own
 * type colour, so a light page gets a near-black button and a dark page gets
 * a light one. The label is `onAccent`. `fill` is what is left for a field,
 * a segment, and a chip, and it still has to read on the page and on a card.
 *
 * The tab bar is the one surface that does not follow the scheme: it is dark
 * on paper and darker still in the dark, so its own three tones — `bar`,
 * `onBar`, `onBarActive` — are the same white at two strengths in both. A bar
 * that changes colour with the page stops reading as the app's floor.
 *
 * `text` is the type on the page; `ink` is the type on a `surface` or a
 * `fill`. Each has its muted and faint step. They are the same colours in both
 * warm schemes and only part company where a palette lights a container
 * differently from the page under it.
 */
export const color = {
  light: {
    background: '#FBF9F5',
    surface: '#F3EDE3',
    surfaceSunken: '#E8E0D2',
    fill: '#E6DECF',
    border: '#DFD7C8',
    text: '#17140F',
    // A step darker than the old muted, which was written against white and
    // fell under the contrast floor once containers stopped being white.
    textMuted: '#6E6656',
    textFaint: '#9C9483',
    ink: '#17140F',
    inkMuted: '#6E6656',
    inkFaint: '#9C9483',
    accent: '#17140F',
    onAccent: '#FBF9F5',
    brass: '#7E5F33',
    save: '#2E6B4F',
    /** A price chip. Not `save`: that green means a watch was kept. */
    money: '#1A7344',
    onMoney: '#F4FBF7',
    danger: '#9A2B20',
    overlay: 'rgba(23, 20, 15, 0.45)',
    /** On a scrim over a photograph, which is dark in both schemes. */
    onOverlay: '#FFFFFF',
    /** The photo roll's unread bars. */
    onOverlayFaint: 'rgba(255, 255, 255, 0.4)',
    /**
     * Ours, on a photograph. `brass` is mixed for paper and goes to mud over a
     * dark scrim, so the accent that marks a place on a photograph is this
     * warm tan — the same in both schemes, because a photograph is not themed.
     */
    onOverlayAccent: '#E8C48A',
    bar: '#17140F',
    onBar: 'rgba(255, 255, 255, 0.55)',
    onBarActive: '#FFFFFF',
    /**
     * A count on a tab. Red, the colour every phone uses for "waiting for
     * you", and on the bar, which is dark in both schemes, so the same in
     * both. Not `danger`: that is muted for type, and white on it is grey.
     */
    badge: '#D93025',
    onBadge: '#FFFFFF',
    /**
     * The dot on a saved watch nobody has written about. Brighter than
     * `badge`: nothing is set on it, so it does not have to hold white type.
     */
    notice: '#FF4B3E',
    /** The swipe card, which floats on `shadow.card` instead of stepping. */
    raised: '#FFFFFF',
  },
  dark: {
    background: '#121110',
    surface: '#1E1B18',
    surfaceSunken: '#0D0C0B',
    fill: '#302C27',
    border: '#2E2A26',
    text: '#F3EFE8',
    textMuted: '#9A9186',
    textFaint: '#6F675C',
    ink: '#F3EFE8',
    inkMuted: '#9A9186',
    inkFaint: '#6F675C',
    accent: '#F3EFE8',
    onAccent: '#17140F',
    brass: '#C9A468',
    save: '#5FB68C',
    /** Lifted off the charcoal so the chip still reads as green. */
    money: '#1E7A4A',
    onMoney: '#F4FBF7',
    danger: '#E0776B',
    overlay: 'rgba(0, 0, 0, 0.6)',
    onOverlay: '#FFFFFF',
    onOverlayFaint: 'rgba(255, 255, 255, 0.4)',
    onOverlayAccent: '#E8C48A',
    // A shade under the page rather than the same near-black as in the light
    // scheme, which would vanish into a #121110 background.
    bar: '#0A0908',
    onBar: 'rgba(255, 255, 255, 0.55)',
    onBarActive: '#FFFFFF',
    badge: '#D93025',
    onBadge: '#FFFFFF',
    notice: '#FF4B3E',
    // A shadow is nothing against a near-black page, so in the dark the card
    // floats the only way it can: a tone above `surface`.
    raised: '#262320',
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

/**
 * The same wash upside down, under the paging bars. Shallower and weaker than
 * the caption's: it is holding up three-point rules, not a title, and a heavy
 * band across the top of every photograph would read as a letterbox.
 */
export const scrimTop =
  'linear-gradient(to bottom, rgba(23, 20, 15, 0.55) 0%, rgba(23, 20, 15, 0) 100%)';

export type ColorScheme = 'light' | 'dark';
/** The key set is fixed; the values are colours, not the two literals above. */
export type ThemeColors = { [K in keyof (typeof color)['light']]: string };

export type Theme = {
  scheme: ColorScheme;
  color: ThemeColors;
};

export const themes: Record<ColorScheme, Theme> = {
  light: { scheme: 'light', color: color.light },
  dark: { scheme: 'dark', color: color.dark },
};

/**
 * Neue Haas Grotesk, in the two optical sizes the family is cut in. Text below
 * 20pt, Display at 20 and above — the split SF Pro used to make on its own.
 * This face ships them as different files, so each style names the file.
 *
 * The file is the weight. SDK 57 loads each static file as its own family, and
 * a `fontWeight` on top of one synthesises a fake bold on Android. iOS groups
 * the files back into one family and then serves Roman unless `cut` also names
 * the weight. There is no semibold cut: Medium (65) is the step between Roman
 * (55) and Bold (75). Three cuts and no more.
 */
export const face = {
  text: {
    regular: 'NHaasGroteskTXPro-55Rg',
    medium: 'NHaasGroteskTXPro-65Md',
    bold: 'NHaasGroteskTXPro-75Bd',
  },
  display: {
    regular: 'NHaasGroteskDSPro-55Rg',
    medium: 'NHaasGroteskDSPro-65Md',
    bold: 'NHaasGroteskDSPro-75Bd',
  },
} as const;

/**
 * The family plus, on iOS only, the weight that selects this file.
 *
 * iOS collects every Neue Haas file under one family name, then picks Roman
 * when the style does not say otherwise. That is why GRAHAM can look regular
 * on a phone and bold in the simulator. Android must not get a weight: it
 * paints a second, fake bold on top of the file.
 */
function cut(family: string, weight?: '500' | '700'): TextStyle {
  return Platform.OS === 'ios' && weight ? { fontFamily: family, fontWeight: weight } : { fontFamily: family };
}

/**
 * letterSpacing. Only the sizes above the body scale take any, and only a
 * little, except the wordmark, which is set so tight the letters read as one
 * mark. Tracking small text is how an interface starts to look like a slide
 * deck.
 */
export const tracking = {
  /** Capitals at 44pt. About a tenth of the size, which is as tight as this cut stays open. */
  wordmark: -2.2,
  display: -0.8,
  title: -0.4,
} as const;

export const type = {
  wordmark: {
    ...cut(face.display.bold, '700'),
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: tracking.wordmark,
  },
  display: {
    ...cut(face.display.bold, '700'),
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: tracking.display,
  },
  title: {
    ...cut(face.display.medium, '500'),
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: tracking.title,
  },
  /** A watch name in a grid tile, where the full title wraps after two words. */
  titleSmall: {
    ...cut(face.text.medium, '500'),
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: tracking.title,
  },
  /** A lede: one sentence introducing a screen. Never fields, specs, or prices. */
  editorial: {
    fontFamily: face.display.regular,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: tracking.title,
  },
  body: {
    fontFamily: face.text.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  bodyStrong: {
    ...cut(face.text.medium, '500'),
    fontSize: 16,
    lineHeight: 24,
  },
  label: {
    fontFamily: face.text.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  /** A run-in that has to hold its own beside another: the card's dealer. */
  labelStrong: {
    ...cut(face.text.medium, '500'),
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    fontFamily: face.text.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  /** Digits on a tab glyph. Caption size, in the bold cut, so two digits hold. */
  badge: {
    ...cut(face.text.bold, '700'),
    fontSize: 13,
    lineHeight: 18,
  },
  price: {
    ...cut(face.text.medium, '500'),
    fontSize: 18,
    lineHeight: 24,
  },
  /** Same job in a grid tile. Still the heaviest thing in the block. */
  priceSmall: {
    ...cut(face.text.medium, '500'),
    fontSize: 15,
    lineHeight: 20,
  },
  control: {
    ...cut(face.text.medium, '500'),
    fontSize: 13,
    lineHeight: 18,
  },
  // A run-in above a title. Sentence case, so weight and colour do the
  // separating that capitals used to do.
  eyebrow: {
    ...cut(face.text.medium, '500'),
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

/**
 * The one shadow in the app, and it belongs to the swipe card. Everywhere else
 * depth is the colour step between `background`, `surface`, and `fill` — but
 * the card is white on a near-white page, which leaves nothing to step, and it
 * is the only thing on screen that is meant to look like an object in a hand.
 *
 * Two casts: a tight one that reads as contact, and a wide soft one that reads
 * as height. One alone looks like a mistake in a screenshot.
 */
export const shadow = {
  card: '0 2px 4px rgba(23, 20, 15, 0.06), 0 14px 32px rgba(23, 20, 15, 0.16)',
} as const;

/**
 * `full` is the capsule, and it belongs to anything you press that carries a
 * word: a button, a chip, a segment, a door on sign-in. Half the height is
 * what a capsule is, so the value only has to be larger than any control.
 * Fields, tiles, and thumbnails keep their corners.
 */
export const radius = {
  sm: 4,
  md: 6,
  lg: 10,
  full: 9999,
} as const;

export const motion = {
  fast: 160,
  base: 240,
  // A released gesture returns to rest. No spring: overshoot on a card the user
  // just declined to swipe reads as a bug, not as physics.
  settle: 220,
  // A saved card crossing the screen into the Wishlist tab. Long enough for the
  // eye to follow where the watch went, short enough that the next swipe is
  // never waiting on it.
  flight: 320,
  /** How long one watch sits beside the wordmark before the next fades in. */
  rotate: 2400,
} as const;

/** Minimum tappable area. Anything smaller needs hitSlop to reach it. */
export const HIT_TARGET = 44;

/**
 * Maximum content widths. A phone is narrower than every value here, so these
 * are inert on a phone and only bite once a window has room to spare.
 *
 * Nothing stretches to fill a desktop window. A 1600px line of body type loses
 * the reader between one line and the next, and a swipe card that wide stops
 * reading as a card.
 */
export const layout = {
  /** Prose, forms, lists, detail screens. About 64 characters of `type.body`. */
  reading: 560,
  /**
   * The swipe stage. Wide enough to read on a desktop, still capped so it does
   * not become a billboard across the window.
   */
  card: 640,
  /** The browse grid, which spends width on columns rather than line length. */
  grid: 1280,
  /** The glyph column on a wide window: one tab wide, plus air either side. */
  rail: 88,
  /**
   * Columns on the wide home grid. Photograph above the copy, so a desktop
   * window fills with watches rather than one tall row each.
   */
  gridColumns: 4,
} as const;

export type LayoutWidth = Exclude<keyof typeof layout, 'rail' | 'gridColumns'>;

/**
 * Above this width the deck opens on the grid: there is a mouse and no thumb.
 * Only the starting view — both are reachable at any width.
 */
export const WIDE_BREAKPOINT = 900;

/**
 * How many watches a guest may judge before the app asks them to sign in.
 * Tracked on the device, not in the database — there is no actor_id yet.
 */
export const GUEST_SWIPE_BUDGET = 10;

export const size = {
  thumb: 72,
  /**
   * The profile photograph. The four lines beside it — name, handle,
   * collector number, save count, with `stack.tight` between — come to 94.
   * 96 is the scale step that meets them, so the square and the type share
   * a height instead of the picture stopping short.
   */
  profile: 96,
  /**
   * A face beside a name. `avatar` where the name has a second line under it,
   * as in a conversation's row; `avatarSmall` in a byline, where the name,
   * the badge, and the time share one line and a larger face would set the
   * height of the whole row.
   */
  avatar: 40,
  avatarSmall: 32,
  /** A community byline. One line of `body` type; the face is a step taller than it. */
  avatarByline: 32,
  /**
   * Community's intent chips, and Message on a wishlist row. One step under
   * `HIT_TARGET`. Follow itself is the `body` line, not this.
   */
  follow: 32,
  /**
   * The photograph on a grid row. Portrait, 5/7, so the watch stays readable
   * beside the type. A quarter of a phone's width: at a third, three rows
   * filled the screen and a list of watches read as a stack of posters.
   */
  gridPhoto: 96,
  /**
   * The same frame on the home grid and the wishlist. Shorter, so a scan of
   * the deck or a saved list is a list. A shop keeps `gridPhoto`. Search is a
   * wall of photographs, not a row.
   */
  gridScan: 72,
  /**
   * A buying post pinned above the community feed. Two fit on a phone with
   * the next one showing, so the row reads as a strip and not a stack.
   */
  pinned: 160,
  /** Glyphs. `icon` for a tab or a header control, `iconSmall` inline with text. */
  icon: 24,
  iconSmall: 16,
  /**
   * The specification label column. "Box and papers" at `type.label` is the
   * longest label, and the values share the edge to its right.
   */
  specLabel: 120,
  /** The tab bar itself, before the home-indicator inset padded under it. */
  tabBar: 68,
  /** Tab glyphs are larger than the rest: they carry no word under them. */
  tabIcon: 28,
  /** A count on a tab. Two digits fit; three would not, and never happen. */
  badge: 18,
  /** A waiting dot. An unread conversation, and a saved watch with no message yet. */
  unread: 8,
  /** One photo's bar at the top of a carousel. */
  segment: 3,
  /** One photo's dot under a post's roll, where bars would cut the picture. */
  dot: 6,
  /** The ring a card wears while it is being swiped. */
  ring: 3,
  /** A selection rule: the tab indicator, and a chosen row's left edge. */
  rule: 2,
  /**
   * A provider's mark inside its own sign-in button. Google specifies an 18pt
   * mark against their 14pt label; ours is `type.labelStrong` at 14, so the
   * ratio carries over unchanged.
   */
  providerMark: 18,
  /** Buttons, fields, and the doors on sign-in. One height, so a column of them is a column. */
  controlMin: HIT_TARGET + space.sm,
  /** Four lines of `type.body` plus field padding. */
  fieldMultiline: space.xxxl + space.xxl,
} as const;

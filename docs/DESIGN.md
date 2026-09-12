# Graham design system

The rules the interface follows. Tokens live in `src/lib/design.ts`; this file
says what they mean and when to reach for each one. Change them together — a
rule nobody encoded is a rule nobody follows.

`src/lib/theme.ts` re-exports the tokens so existing imports keep working.

## Principle

The app is a viewing room, not a dashboard. A watch is the only thing on screen
worth looking at, so the interface gets out of its way: generous space, few
rules and borders, no colour that isn't doing a job. When in doubt, remove the
element rather than restyle it.

## Colour

Warm neutrals only. A blue-grey palette reads like a fintech dashboard; vintage
watches want paper, brass, and patina. Every value is a semantic token, never a
literal hex in a component.

| Token | Job |
| --- | --- |
| `background` | The page itself |
| `surface` | Cards, tiles, the tab bar — anything sitting on the page |
| `surfaceSunken` | Wells that recede: image placeholders, segmented controls |
| `border` | Hairlines between content |
| `borderStrong` | Outlines that must hold their own, like a secondary button |
| `text` | Primary reading colour |
| `textMuted` | Supporting copy, specs, eyebrows |
| `textFaint` | Hints and placeholders you should be able to ignore |
| `accent` / `onAccent` | Primary button fill and the text on it |
| `brass` | The one warm highlight: dealer names, selected states |
| `save` / `danger` | The two irreversible directions, and nothing else |

Rules:

- `brass` is a seasoning. If more than one thing per screen is brass, none of it
  reads as special.
- `save` and `danger` mean save and pass. Never use them for decoration.
- Dark mode is not inverted light mode. It is a warm charcoal (`#121110`), not
  black, and text is `#F3EFE8`, not white. Pure black plus pure white on OLED
  vibrates and makes photographs look blown out.
- Contrast floor is 4.5:1 for body text, 3:1 for large text and icons.

## Typography

Two families, and that is the whole system.

**EB Garamond** (display) is an old-style serif. It carries the wordmark, screen
titles, and watch model names — the words a person came to read. **Inter** (text)
is a grotesque: even, slightly geometric, with lining figures that prices and
reference numbers need. Garamond for the watch, Inter for the paperwork.

Never introduce a third family. Never use a system font next to these; the
mismatch is more visible than any weight you would gain.

Garamond's default tracking is wide, so display styles pull in with negative
`letterSpacing`. Inter is already tight; body tracking is a nudge, not a clamp.

| Style | Use |
| --- | --- |
| `wordmark` | "Graham" on sign-in. Once per app. |
| `display` | Screen titles |
| `title` | Watch model, section headings, empty-state headlines |
| `body` / `bodyStrong` | Paragraphs and input text |
| `label` | Buttons |
| `control` | Compact actions: row chips, tile buttons |
| `caption` | Specs, helper text, hints |
| `price` | Prices, in Inter so digits align |
| `tab` | Tab bar labels |
| `eyebrow` | Run-in above a title — the brand, a section name |

Rules:

- Never set `fontSize`, `fontFamily`, or `letterSpacing` directly. Spread a
  style from `type`.
- Line length stays around 65 characters. Past that, split the paragraph.
- One `display` per screen. Two headlines means neither is the headline.

## Capitalization

Nothing is set in all caps. No `textTransform: 'uppercase'`, no shouting string
literals. Garamond is a book face: capitals sit too wide and too loud in it, and
uppercase text also loses the word shapes that make a line quick to skim.

- Sentence case for everything we write — headings, buttons, labels, hints.
  "Email me a code", not "EMAIL ME A CODE" or "Email Me A Code".
- Title case only for proper nouns and the words on our own chrome that are
  already names: the "Graham" wordmark, tab names like "Deck" and "Saved".
- The `eyebrow` separates itself from the title under it by weight and colour,
  not by capitals.
- Listing text is dealer data, printed as imported. An initialism like IWC or a
  reference like `ST 145.022` is correct in caps, so we never re-case a brand,
  model, or reference — normalizing that would mangle more rows than it fixed.

## Space and shape

Spacing comes from `space` — `xs` 4, `sm` 8, `md` 16, `lg` 24, `xl` 32, `xxl` 48,
`xxxl` 72. Nothing in between. If a layout needs 20px, the layout is wrong.

Named jobs sit on top of that scale so a screen does not guess:

- `inset.screen` (24) is the page gutter. Cards use `inset.card` (also 24).
- `inset.controlY` / `inset.controlX` pad buttons and fields. Do not use
  `space.lg` inside a control — that token is for the page, not the chrome.
- `stack.tight` groups a title with its caption. `stack.related` groups a field
  with its button. `stack.section` separates unrelated blocks.

The room around a watch is the product. Prefer the next larger step over
squeezing copy in.

Radius comes from `radius` — `sm` 8 for thumbnails and inner controls, `md` 14
for buttons, fields, and tiles, `lg` 22 for the swipe card, `pill` for badges and
chips. A larger surface takes a larger radius; matching them makes the small
things look bloated.

## Touch and motion

- `HIT_TARGET` is 44. Anything smaller needs `hitSlop` to reach it.
- Durations come from `motion`: `fast` (160ms) for a gesture resolving, `base`
  (240ms) for a transition the user is waiting on.
- Animation runs in Reanimated worklets on the UI thread. Never drive a frame
  from React state.
- Every gesture needs a visible response before the network is involved. The
  swipe stamps appear as the card moves, not after the row is written.

## Components

- A component reads colour through `useThemedStyles`, never a module-scope
  `StyleSheet.create` with colours in it. Styles have to rebuild when the scheme
  flips.
- Style factories live at the bottom of the file they serve, named
  `<thing>Styles`.
- If two screens need the same piece, it moves to `src/components/`. Rule of
  three applies to styles as much as to code.

## Iconography

One family: `MaterialCommunityIcons`. Outline when idle, solid when active. Size
comes from `size.tabIcon`. Mixing icon families is the fastest way to make an
interface look assembled rather than designed.

## Platform

The deck is a swipe stack below 900px and a browsable grid above it, because
swiping is a thumb gesture and a mouse has no thumb. Both read the same data
layer; only the presentation differs. Any future surface follows the same split:
share the hooks, rewrite the layout.

## Open questions

Things we have not decided yet. Move them up into rules once we do.

- A real wordmark or logotype, versus EB Garamond set large.
- Photo treatment: do listing images get a consistent crop and background?
- An empty-state illustration, or stay typographic.
- Haptics on swipe commit.

## Filters

Ranges are presets, not sliders. Dragging two handles to "36 to 39mm" is slow on a
phone and the precision buys nothing — nobody wants a 37.5mm floor. Presets also keep
filter state small enough to be a cache key.

Only offer a filter something can match. Options come from `listing_facets`, so a brand
appears once a visible listing is that brand. A filter that can only return nothing is a
dead end the user has to reverse out of.

One filter set for the whole app. Narrowing in Search and finding the Deck unchanged
would read as the filter not having applied.

## Photo carousel

Tap the right of a photo for the next, the left to go back. Paging never wraps: landing
back on the first photo reads as a glitch, not as an end.

Progress is segments across the top, not dots — they show how much is left at a glance.
Only the top card takes taps; a card underneath is not being read.

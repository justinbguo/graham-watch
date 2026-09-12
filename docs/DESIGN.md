# Graham design system

The rules the interface follows. Tokens live in `src/lib/theme.ts`; this file
says what they mean and when to reach for each one. Change this file and the
tokens together — a rule nobody encoded is a rule nobody follows.

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

**Fraunces** (display) is an old-style serif with real character. It carries the
wordmark, screen titles, and watch model names — the words a person came to
read. **Archivo** (text) is a grotesque that stays quiet underneath and has the
figures that prices, reference numbers, and case sizes need.

Never introduce a third family. Never use a system font next to these; the
mismatch is more visible than any weight you would gain.

| Style | Use |
| --- | --- |
| `wordmark` | "Graham" on sign-in. Once per app. |
| `display` | Screen titles |
| `title` | Watch model, section headings, empty-state headlines |
| `body` / `bodyStrong` | Paragraphs and input text |
| `label` | Buttons and controls |
| `caption` | Specs, helper text, hints |
| `price` | Prices, in Archivo so digits align |
| `eyebrow` | Uppercase run-in above a title — the brand, a section name |

Rules:

- Never set `fontSize` or `fontFamily` directly. Spread a style from `type`.
- Line length caps around 65 characters. Past that, split the paragraph.
- One `display` per screen. Two headlines means neither is the headline.

## Space and shape

Spacing comes from `space` — `xs` 4, `sm` 8, `md` 12, `lg` 16, `xl` 24, `xxl` 32,
`xxxl` 48. Nothing in between. If a layout needs 18px, the layout is wrong.

`lg` (16) is the screen gutter and the default gap between related things. `xxl`
separates unrelated sections.

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
24 in the tab bar. Mixing icon families is the fastest way to make an interface
look assembled rather than designed.

## Platform

The deck is a swipe stack below 900px and a browsable grid above it, because
swiping is a thumb gesture and a mouse has no thumb. Both read the same data
layer; only the presentation differs. Any future surface follows the same split:
share the hooks, rewrite the layout.

## Open questions

Things we have not decided yet. Move them up into rules once we do.

- A real wordmark or logotype, versus Fraunces set large.
- Photo treatment: do listing images get a consistent crop and background?
- An empty-state illustration, or stay typographic.
- Haptics on swipe commit.

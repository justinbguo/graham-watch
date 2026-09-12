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
  already names: the "Graham" wordmark, tab names like "Buy" and "Saved".
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
  (240ms) for a transition the user is waiting on, `settle` (220ms) for a
  released gesture returning to rest.
- Animation runs in Reanimated worklets on the UI thread. Never drive a frame
  from React state.
- Every gesture needs a visible response before the network is involved. The
  colour wash appears as the card moves, not after the row is written.

The swipe deck is one axis. A card tracks the thumb left and right and never
moves vertically or rotates free of that travel, because the only two answers
are save and pass. Giving it a second axis invites a gesture that means nothing.

Drag is elastic, not linear: to the commit point the card follows the thumb
exactly, past it the card returns about a third of the travel. The tension is
what tells you the swipe has caught before the colour does.

Nothing bounces. A released card settles to rest with easing and stops. Spring
overshoot on a declined swipe looks like the card rejected the drop.

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

## Price is typed, everything else is a preset

Size and era are ranges nobody holds a precise opinion about: "36 to 39mm" is as
exact as anyone gets, so the chips are the whole control. A budget is different —
people arrive with a number. So price is two boxes, and the chips above them are
shortcuts that fill the boxes rather than a second way to say the same thing.
Tapping the live chip empties them.

One state, not two. The chip reads as selected when the numbers happen to match it,
which means typing $5,000 to $15,000 by hand lights up the "$5k–15k" chip on its own.

## Filter by dealer

The catalogue is a handful of shops and people shop by the shop they trust, so dealer
sits beside brand. The group is hidden when only one dealer has anything in the deck:
a filter whose every option returns everything is furniture.

## Where filters live

The deck and search filter separately. They are different jobs: the deck is a queue you
are working through, search is a question you are asking. Narrowing search should not
throw away the pile you were halfway through swiping.

Both reach their filters through the same funnel button in the header, carrying the
number of choices made. The count is the point — without it, a user who filtered
yesterday has no way to tell why the deck looks short.

The panel holds no text box. Typing a brand name is a question, so it belongs on the
search tab, where the field stays on screen.

## Filters

Ranges are presets, not sliders. Dragging two handles to "36 to 39mm" is slow on a
phone and the precision buys nothing — nobody wants a 37.5mm floor. Presets also keep
filter state small enough to be a cache key.

Only offer a filter something can match. Options come from `listing_facets`, so a brand
appears once a visible listing is that brand. A filter that can only return nothing is a
dead end the user has to reverse out of.

One filter set for the whole app. Narrowing in Search and finding Buy unchanged
would read as the filter not having applied.

## Photo carousel

Tap the right of a photo for the next, the left to go back. Paging never wraps: landing
back on the first photo reads as a glitch, not as an end.

Progress is segments across the top, not dots — they show how much is left at a glance.
Only the top card takes taps; a card underneath is not being read.

## Deck views

Two ways to read the same queue, chosen from the toggle beside the title. Cards are for
deciding, one watch at a time. The grid is for scanning, and a tap there opens the detail
screen — reading, not deciding. There is one way to save and it is a swipe.

Wide screens open on the grid, phones on cards. Either is reachable at any width.

A tile is half a phone wide, so it takes the type scale down a step: `titleSmall` for the
watch name, `priceSmall` for the price. Nothing in a tile is clamped to one line. A name cut
to "Oyster-Perpetual…" and a price squeezed beside a dealer are both answers to a question
nobody asked, and a grid exists to be compared down a column — ragged tile heights cost less
than missing words. On a card, where a line has room, one line is still the rule.

## Onboarding asks twice, and no more

Two steps, both answerable in seconds. A name, because the dealer reads it at the top
of the inquiry email and "a buyer on Graham" is a worse way to start a conversation
about a five-figure watch. Then favourite brands, picked from what the catalogue
actually holds, with the count beside each one.

Brands rank the deck; they never filter it. A first-run answer is a guess, and hiding
the catalogue behind a guess costs more than dealing it in a slightly worse order.
Choosing nothing is allowed and the button says "Skip for now" when you have.

The gate is `profiles.onboarded_at`, not an empty brand list: picking nothing is an
answer, and it has to be told apart from never having been asked.

## Two targets on a card

The photograph pages through the dealer's other shots. A bar directly beneath it opens the
watch full screen. Both are taps, so they must not overlap.

The bar sits between the photograph and the watch's name rather than under the price,
because it is a control and not a closing remark. Given its own strip — sunken, ruled top
and bottom, a chevron at the right end — it reads as something to press, and the four lines
below it stay what they are: a maker, a model, its specs, its price, in that order every
time. Under the price it was a fifth line of prose competing with them.

The dealer's name sits up beside the maker, both semibold, with a pill outline around the
dealer. Who is selling it is half of what a vintage watch costs you, and down in the price
row it was a caption trailing a number. An outline rather than a fill, because the details
bar directly above is already a solid strip and two filled blocks stacked read as one.

The description is not on the card. Two lines of prose is a paragraph cut in half — long
enough to crowd the price, short enough to tell you nothing. It reads in full on the detail
screen or not at all.

A long press on the photo opens it alone, full screen and black, with the paging intact and
nothing else on it. Long press because tap is already spoken for by paging, and because
wanting a closer look is a deliberate act rather than a stray thumb.

Saving is a swipe on the deck and a button on the detail screen, sitting above the inquiry
button. Both write the same right swipe. The button reads "Saved" afterwards and undoes it
when pressed again, because a control that greys out once used leaves the user stuck with
a decision they made by accident.

Full screen is the right weight for that screen. A sheet leaves the deck showing behind it
and invites a swipe to dismiss, which is the gesture that means save.

## Dealer reputation is a placeholder

The panel shows stars, a review count, years trading, watches sold, and a reply time. None
of it is real: dealers have no accounts and buyers cannot leave feedback. The numbers are
seeded from the dealer id so they never shuffle, and the panel carries a "Sample" badge and
a line saying so. `placeholderReputation` in `src/features/dealers/reputation.ts` is the
one function to replace.

## The end of the deck

Running out is not an error, so the empty deck offers the only move left: start over, which
puts back every watch you passed on. Saved watches stay out of it. A right swipe is a decision
you can still see in Saved, and replaying it risks losing a save to a stray thumb.

The count is in the copy — "the 20 you passed on" — so the button is a promise, not a guess.
With nothing to put back the offer is a plain refresh instead.

## Undo goes back one

Start over is the cure for a long afternoon of passing. The cure for a thumb slip is the undo
arrow in the deck header, which takes back the last pass and only the last pass. Deeper history
would need a stack the user has no way to see the bottom of, and a watch two swipes ago is not
what anyone is reaching for.

Only passes. A save is already sitting in Saved with an undo of its own, so a right swipe
retires the offer rather than queueing behind it — the arrow greys out, which is the honest
answer to "what would this bring back?".

The arrow never leaves the header. Showing it only when it works would shift the other two
controls sideways on every swipe, and the deck is the one screen that has to sit still under a
moving thumb. Faint means unavailable, the same language the view toggle already speaks.

The row is deleted, not flipped to a third direction. The watch has to be genuinely unjudged
afterwards, or it stays out of the deck on the next fetch and the undo turns out to have been
a lie. It comes back on top of the pile rather than wherever the server would rank it, because
the user is correcting a mistake and expects that same watch.

## No labels on the deck

A drag shows its direction in colour alone: green for save, red for pass. The words "Save"
and "Pass" are gone, and so is the instruction under the deck. A first swipe teaches the
gesture faster than a caption, and the caption never stops taking up room.

The colour lands on the card's edge, as a 2px outline that fades in with the drag. A tint
across the whole card colours the watch itself, which is the one thing on screen that has
to stay true — a green Submariner is a different watch.

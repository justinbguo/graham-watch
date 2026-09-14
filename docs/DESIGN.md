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
| `accent` / `onAccent` | The final solid action and its text |
| `brass` | The one warm highlight: dealer names, selected states |
| `save` / `danger` | The two irreversible directions, and nothing else |
| `overlay` / `onOverlay` | A scrim on a photograph and the type on it |

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
| `editorial` | Short atmospheric copy, never paperwork |
| `body` / `bodyStrong` | Paragraphs and input text |
| `label` | Buttons |
| `control` | Compact actions: text toggles, tile buttons |
| `caption` | Specs, helper text, hints |
| `price` | Prices, in Inter so digits align |
| `tab` | Tab bar labels |
| `eyebrow` | Run-in above a title — the brand, a section name |

Rules:

- Never set `fontSize`, `fontFamily`, or `letterSpacing` directly. Spread a
  style from `type`.
- Line length stays around 65 characters. Past that, split the paragraph.
- One `display` per screen. Two headlines means neither is the headline.
- `editorial` is EB Garamond Regular for one or two short lines. Prices, fields,
  specs, filters, and paragraphs stay Inter.

## Capitalization

Nothing is set in all caps. No `textTransform: 'uppercase'`, no shouting string
literals. Garamond is a book face: capitals sit too wide and too loud in it, and
uppercase text also loses the word shapes that make a line quick to skim.

- Sentence case for everything we write — headings, buttons, labels, hints.
  "Email me a sign-in code", not "EMAIL ME A SIGN-IN CODE" or "Email Me A Sign-In Code".
- Title case only for proper nouns and the words on our own chrome that are
  already names: the "Graham" wordmark, tab names like "Buy" and "Saved".
- The `eyebrow` separates itself from the title under it by weight and colour,
  not by capitals.
- Listing text is dealer data, printed as imported. An initialism like IWC or a
  reference like `ST 145.022` is correct in caps, so we never re-case a brand,
  model, or reference — normalizing that would mangle more rows than it fixed.

## Identity

The provisional identity is a text lockup: `Graham`, one brass hairline, then
“Find the watch. Meet the dealer.” in `type.editorial`. Do not invent a crest,
heritage date, seal, or generated logo to imply history the product does not
have. The restraint is the identity until commissioned assets replace it.

## Space and shape

Spacing comes from `space` — `xs` 4, `sm` 8, `md` 16, `lg` 24, `xl` 32, `xxl` 48,
`xxxl` 72. Nothing in between. If a layout needs 20px, the layout is wrong.
The only off-scale values allowed are 1px hairlines, the 2px swipe-card edge,
and `size.rule` (2), the left edge of a chosen row.

Named jobs sit on top of that scale so a screen does not guess:

- `inset.screen` (24) is the page gutter. Cards and nested panels use
  `inset.card` (also 24). Sheets and full-screen modals use the same gutter —
  a modal is still a page, not a control.
- `inset.controlY` (8) / `inset.controlX` (16) pad buttons and text fields.
  Never put the page gutter inside a field. A search box already sits in a 24px
  margin; 24px more inside it leaves the cursor floating in empty chrome, and
  two price fields side by side become unusable.
- `inset.compactY` / `inset.compactX` pad compact enum options and header
  controls.
- `stack.tight` groups a title with its caption. `stack.related` groups a
  field with its button. `stack.group` (32) separates blocks inside a sheet or
  listing. `stack.section` (48) is for a full page, not a modal.
- A sheet's footer (Done, Send) lives outside the scroll. Do not add
  `stack.section` or `space.xxxl` as scroll padding just to clear a sibling.

Fields share `size.controlMin` (52) with buttons so a single-line input is a
thumb target. Vertical padding is `sm` so Inter 16/24 plus padding does not
exceed that height and then fight it. Multiline fields use
`size.fieldMultiline` (120) and pin `textAlignVertical` to the top.

The room around a watch is the product. Prefer the next larger step over
squeezing copy in — on photographs and page sections, not inside inputs.

Radius comes from `radius` — `sm` 4 for thumbnails and compact controls, `md` 6
for buttons, fields, and tiles, `lg` 10 for the swipe card. There is no capsule
radius. Metal, glass, and printed catalogues have edges; rounding a control into
a capsule makes the app read like generic consumer SaaS.

## Touch and motion

- `HIT_TARGET` is 44. Anything smaller needs `hitSlop` to reach it.
- Durations come from `motion`: `fast` (160ms) for a gesture resolving, `base`
  (240ms) for a transition the user is waiting on, `settle` (220ms) for a
  released gesture returning to rest, `flight` (320ms) for a saved card
  crossing the screen.
- Animation runs in Reanimated worklets on the UI thread. Never drive a frame
  from React state.
- Every gesture needs a visible response before the network is involved. The
  edge outline appears as the card moves, not after the row is written.
- Crossing the swipe commit point produces one selection tick. Committing
  produces one rigid impact. Never call haptics on every gesture frame.

The swipe deck is one axis. A card tracks the thumb left and right and never
moves vertically or rotates free of that travel, because the only two answers
are save and pass. Giving it a second axis invites a gesture that means nothing.

Drag is elastic, not linear: to the commit point the card follows the thumb
exactly, past it the card returns about a third of the travel. The tension is
what tells you the swipe has caught before the colour does.

Nothing bounces. A released card settles to rest with easing and stops. Spring
overshoot on a declined swipe looks like the card rejected the drop. Haptics
are supplementary: iOS can suppress them for settings, Low Power Mode, camera,
or dictation, and the gesture must remain understandable without them.

## Components

- A component reads colour through `useThemedStyles`, never a module-scope
  `StyleSheet.create` with colours in it. Styles have to rebuild when the scheme
  flips.
- Style factories live at the bottom of the file they serve, named
  `<thing>Styles`.
- If two screens need the same piece, it moves to `src/components/`. Rule of
  three applies to styles as much as to code.

### Button hierarchy

The default button is transparent with a `borderStrong` hairline. `ghost`
removes that hairline for a subordinate way back. `solid` is reserved for the
last irreversible handoff: `Send inquiry`. Opening the inquiry, signing in,
posting a request, saving edits, and moving through onboarding are important,
but filling all of them with ink turns every screen into a contest for the
same emphasis.

Callers ask for `solid` explicitly. There is no generic “primary” variant whose
meaning changes from screen to screen.

## Iconography

One family: `MaterialCommunityIcons`, outline when idle and solid when active.
Size comes from `size.icon` for a tab or a header control and `size.iconSmall`
inline with text. Mixing families is the fastest way to make chrome look
assembled rather than designed, so a glyph that is not in that family waits for
the commissioned set.

Icons carry the repeated controls — the four tabs, Undo, Filters, the view
toggle, Close, the dealer row actions. A control with no
honest glyph keeps its word instead: `Mark sold`, `Start over`, `Send inquiry`.
Never invent a symbol to avoid a label.

An icon-only control needs an `accessibilityLabel` that reads as the sentence a
user would say — "Undo, bring back the watch you passed on", not "undo".

A row that only exists to be tapped takes `minHeight: HIT_TARGET` and compact
padding, rather than padding its way up to a tappable height.

## Platform

One codebase, one visual language. Web is not a separate design — it is the
same design with room left over, and the rules below decide what we do with
that room. The answer is almost never "stretch".

### Nothing fills the window

Every screen is a centred column with a ceiling, from `layout`:

| Token | Width | Job |
| --- | --- | --- |
| `layout.reading` | 560 | Prose, forms, lists, detail screens. The default. |
| `layout.card` | 480 | The swipe stage. |
| `layout.grid` | 1280 | The browse grid. |
| `layout.rail` | 176 | Text-first navigation on a wide window. |

`Screen` applies the cap and centres itself, so a new screen is capped without
doing anything. Pass `width` only to leave the default: the deck asks for
`card` in swipe view and `grid` in grid view.

A phone is narrower than all three, so these values change nothing on a phone.
They exist for the case the app already supports and nobody looks at.

Why each one:

- Reading width is the 65-character line from the typography rules, made
  literal. A full-window line of Inter at 16px runs past 200 characters, and
  the eye cannot find the start of the next line.
- A swipe card stays hand-sized. Stretched to a desktop window it is a
  billboard, and the gesture that matches it is a shove rather than a flick.
- The grid is the one surface that earns width, because it spends it on more
  columns rather than on longer lines. It still stops, so tiles do not thin out
  to a single row on an ultrawide monitor.

### Size comes from measurement, not from the window

Read a live size with `useWindowDimensions`, or measure the element with
`onLayout`. Never `Dimensions.get('window')` at module scope: that is read once
when the file is imported, and on web it is wrong the moment somebody resizes
the browser. On a phone the bug hides, because a phone never resizes.

Prefer the element to the window when the question is about the element. The
swipe commit point is a quarter of the *card*, measured with `onLayout`, since
the card is capped and no longer tracks the window. Distance to fly off screen
is a window question, so that one reads `useWindowDimensions`.

A grid that caps its width counts columns against the cap, not the window.

### Safe area, and who owns which edge

Insets come from `react-native-safe-area-context`. Never hardcode a number for a
notch, a Dynamic Island, or a home indicator — they differ per device and the
value you measured on one iPhone is wrong on the next.

`Screen` pads the insets on from `useSafeAreaInsets`, not with `SafeAreaView`.
The native view resolves the insets from its own position on screen, and inside
a `fullScreenModal` it resolves the top to nothing while the screen still covers
the status bar — the listing detail drew its title through the clock and the
Dynamic Island. The hook reports the window, which is what a screen covering the
window needs.

Left and right are never in doubt. Top and bottom each have exactly one owner,
so a screen declares when it is not the one paying:

- A screen inside `(tabs)` passes `inTabs`. Below `WIDE_BREAKPOINT`, the bottom
  tab bar already stands in the home-indicator strip — `size.tabBar` (56) of
  bar with the inset padded under it — so a screen that pads the bottom as well
  leaves a dead band above the bar. On a wide layout the rail is at the left,
  so `Screen` restores its own bottom inset. The rail takes the top inset
  itself, since it stands beside the screen rather than under it.
- A screen presented as a sheet (`presentation: 'modal'` — filters, inquiry,
  edit watch, new request, import inventory, settings) passes `inSheet`. iOS
  presents the card below the status bar, so a top inset inside it pads away
  from nothing.
- Everything else — the full-screen listing, the photo viewer, sign-in,
  onboarding — takes both and clears the hardware itself. Without the bottom,
  the last thing on the screen sits under the bar the user swipes home with.

Neither fact is detectable at runtime without reaching into navigation
internals: the navigator hands every screen the same window insets whatever it
presented them as. `inTabs` and `inSheet` are the honest version of that.
Getting one wrong costs a dead band; leaving one off clips a button or runs a
title into the status bar. That is why the default is to pad.

A screen's top gap sits on the column rather than the header, so a screen with
no title still clears the notch instead of starting flush against it.

The photo viewer is the one screen that opts out of all of it: it is deliberately
full-bleed black, and it positions its own close button with `useSafeAreaInsets`.

### Browser chrome

The scrollbar is the one piece of the interface the browser draws for us, and
its default is a grey trough beside the photographs. It is styled down to a
thin thumb in `borderStrong` on a transparent track, `size.scrollbar` (8) wide,
lifting to `textFaint` on hover.

Subtle, not gone. Hiding the bar outright costs the only cue for how much of a
list is left, and `showsVerticalScrollIndicator={false}` is a blunt way to say
it — per scroll view, and invisible from the design tokens. The rule lives in
`applyScrollbarStyle`, which the theme provider repaints when the scheme flips
because CSS in `document.head` is outside React's reach.

### Pointer and keyboard

- A swipe needs a thumb. Below `WIDE_BREAKPOINT` (900) the deck opens on cards;
  above it, on the grid. Either view is reachable at any width — the breakpoint
  picks the opening move, it does not lock a door.
- Navigation is an icon over a label. Below the breakpoint it runs along the
  bottom; above it the same routes move into `layout.rail` at the left, glyph
  beside label. A desktop bottom strip under a narrow content column reads like
  a phone screenshot.
- The current tab is brass, glyph and label. On the rail it is also a
  `surfaceSunken` row with a brass left rule, the same language as a chosen
  filter.
- Anything doable by swipe is doable without one. The grid takes arrow keys to
  move, `s` to save, `x` to pass, and Enter to open.
- Hover is a web-only hint and never the only signal. A control that only
  reveals itself on hover is invisible on a touchscreen.
- `HIT_TARGET` stays 44 on every platform. A mouse is precise, but the same
  build runs on a tablet.

### Shared hooks, separate layout

Both deck views read the same data layer; only the presentation differs. Any
future surface follows the same split: share the hooks, rewrite the layout.
Branch on width, not on `Platform.OS` — a narrow browser window should behave
like a phone, and a tablet is neither.

`Platform.OS` is for capability, not for size: keyboard listeners, native
modules, things that genuinely do not exist on the other platform.

## Open questions

Things we have not decided yet. Move them up into rules once we do.

- A commissioned wordmark and icon set. The current identity is deliberately
  typographic rather than pretending a generated crest is a brand.
- An empty-state illustration, or stay typographic.

## Price is typed, everything else is a preset

Size and era are ranges nobody holds a precise opinion about: "36 to 39mm" is as
exact as anyone gets, so the rows are the whole control. A budget is different —
people arrive with a number. So price is two boxes, and the preset rows below them
are shortcuts that fill the boxes rather than a second way to say the same thing.
Tapping the live row empties them.

One state, not two. The row reads as selected when the numbers happen to match it,
which means typing $5,000 to $15,000 by hand marks "$5k–15k" on its own.

## Filter by dealer

The catalogue is a handful of shops and people shop by the shop they trust, so dealer
sits beside brand. The group is hidden when only one dealer has anything in the deck:
a filter whose every option returns everything is furniture.

## Where filters live

The deck and search filter separately. They are different jobs: the deck is a queue you
are working through, search is a question you are asking. Narrowing search should not
throw away the pile you were halfway through swiping.

Both reach their filters through the `Filters` control in the header, carrying
the number of choices made. The count is the point — without it, a user who
filtered yesterday has no way to tell why the deck looks short.

The panel holds no search box. Typing a brand name is a question, so it belongs on
the search tab, where the field stays on screen. Price is the exception: two number
fields with presets underneath, because a floor and a ceiling are amounts, not names.

## Filters

Ranges are presets, not sliders. Dragging two handles to "36 to 39mm" is slow on a
phone and the precision buys nothing — nobody wants a 37.5mm floor. Presets also keep
filter state small enough to be a cache key.

Only offer a filter something can match. Options come from `listing_facets`, so a brand
appears once a visible listing is that brand. A filter that can only return nothing is a
dead end the user has to reverse out of.

Buy and Search still filter separately. One shared set would make a search
question wipe the queue you were halfway through, which is the thing the
funnel on each tab exists to prevent.

## Photo carousel

Tap the right of a photo for the next, the left to go back. Paging never wraps: landing
back on the first photo reads as a glitch, not as an end.

Everywhere you are browsing — card, tile, thumbnail, detail hero — the
photograph fills its frame with `cover`, edge to edge. A watch floating in a
band of matte reads as a broken image, and the frame is the product: a full-bleed
plate is what a catalogue prints. The full-screen viewer is the one exception and
uses `contain` on black, because that is where a buyer inspects a bracelet and
nothing may be cropped. Grid and detail frames use 4:5; row thumbnails stay
square because they are wayfinding, not the product view. Photo-heavy surfaces
use `expo-image` so the same dealer image is cached rather than fetched on every
return.

The photo set is counted, not barred: `1 / 3` on a scrim in the bottom corner.
Segments across the top borrowed a social app's grammar, said how far along you
were without saying how many there are, and went invisible on the white studio
background half of these watches are shot against. Only the top card takes taps;
a card underneath is not being read.

## Deck views

Two ways to read the same queue, chosen from the toggle beside the title. Cards are for
deciding, one watch at a time, and a card holds everything that decision needs. The grid is
for scanning, and a tap there opens the listing route, because a tile is too small to read
in. There is one way to save and it is a swipe.

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

## The card is the whole listing

A card scrolls. Under the photograph and the summary sit the dealer's
description, the specification table, who is selling it, and the button that
writes to them — the same `ListingDetails` block the listing route renders.
Deciding on a five-figure watch takes the reference and the caliber, and a card
that made you leave to read them turned one decision into a navigation.

The photograph takes 58% of the card's height, capped at 5:4 of its width, so
two things hold on every phone: the price never starts below the fold, and the
description is always cut off mid-sentence at the bottom edge. The cut is the
only thing that says the card continues. Sizing the photo by aspect ratio alone
can only promise that on the screen the ratio was picked on.

Three gestures, one surface, and they must not fight:

- Drag sideways and the card leaves. The pan activates after 12pt of horizontal
  travel and gives up after 12pt of vertical, so a thumb reading the spec table
  never flings the watch away.
- Drag up and the card scrolls. That is React Native's `ScrollView`, not Gesture
  Handler's: Gesture Handler's wraps a native gesture that takes the whole touch
  on web, and the card then does not move at all, with or without a blocking
  relation between the two. The axes never contend because the content is taller
  than the card but never wider.
- Tap the photograph's left or right to page it, long press to open it full
  screen. Only the top card takes any of this.

The listing route still exists for the surfaces with no card to scroll: a Saved
row, a search result, a grid tile. It shows the same block under a bigger
headline, and adds the Save toggle a deck card does not need — there a right
swipe is the save.

The block is set like a catalogue entry: maker as an eyebrow, the watch in the
serif, the specification line, then a hairline rule, then the price on the left
and the dealer's name in brass on the same baseline to the right. The rule
separates the description from the transaction, so the eye reads the watch and
lands on what it costs as a conclusion.

The dealer is on the price baseline at `labelStrong`, not in an outline beside
the maker. Who is selling it is half of what a vintage watch costs you, so it
gets equal weight to the price — but an outline is the shape of a control, and a
dealer's name on a card is not something you press.

## What Saved adds up to

The Saved header carries the total of everything in the list. A list of five-figure watches
is a number the user is already holding in their head, badly.

Watches priced on request are left out of the sum and counted under it — "2 on request" —
because a total quietly short by two reads as the whole answer. Mixed currencies show no
total at all rather than adding pounds to dollars. An empty list shows nothing: "$0" beside
the word Saved reads as a price. Sold watches are left out too, since their row shows "Sold"
where the price was and a sum no visible price explains is worse than a smaller sum.

## A sold watch never enters the deck

**Rule: if the listing is sold, it does not go in the app.** A buyer who swipes on a sold
watch spends attention on it, then an email, and learns it went months ago from the
dealer's reply. That is the one failure that costs us the buyer and embarrasses the dealer
at the same time.

Shops say this in their own data and we read it rather than guess. Shopify marks every
variant `available`; Squarespace drops `qtyInStock` to zero. Silence is not a sale: a feed
that says nothing about stock is treated as for sale, because reading it the other way
would empty an import from any shop we misread. Sold items are dropped before extraction,
so a watch we cannot sell never costs an OpenAI call either.

Importing only ever adds, so stock also has to be re-read. `npm run sweep` walks each
approved dealer, compares what they still list against what we show, and stamps `sold_at`
on anything that has gone. An import does the same sweep for the shop it just read. A
listing missing from the feed is left alone — the read stops at a limit, so absence means
we did not get that far, not that it sold.

Sold is its own column, not a `status`. `status` is what we chose to publish; `sold_at` is
what the market did, and it carries the date. Keeping them apart is also what lets a sold
watch stay readable: `search_listings` drops it from the deck, search and the filter counts,
while a watch already sitting in someone's Saved list stays there, marked "Sold", with the
inquiry button gone. Deleting it instead would remove it from that list with no explanation
and take the swipe history with it.

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

## The dealer panel counts, it does not estimate

Every figure on the panel is counted from this shop's own rows by
`dealer_reputation`: how long they have been here, how many watches they have
for sale, how many have sold, and when we last checked their site.

It used to show a rating in brass stars, a review count, years trading and a
reply time, all invented and seeded from the dealer id, behind a "Sample"
label. That was the wrong trade. A buyer does not read the label; they read
4.7 stars. And one invented figure standing beside true ones makes the true ones
unreadable as well, because now the reader has to decide which is which.

Two consequences worth keeping:

- **A young shop looks young.** "Sep 2026" and a dash where sales would go is
  the honest picture of a marketplace weeks old, and it is what the panel
  shows. Tenure names the month until the shop has a year behind it, because
  "0 yrs" reads as a bug.
- **Sold counts what we watched happen.** A watch the shop's own feed stopped
  offering, or one the dealer retired here. It undercounts a dealer's real
  trade, which is the safe direction: we never claim a sale we did not see.

A rating goes back the day a buyer can leave one, and not before.

## A contact address is never spelled out on screen

Claiming a shop offers to mail the address on the shop's site, and names it as
`h•••@their-shop.com`. The dealer reading it knows their own mailbox, so the
first letter and the domain are enough to recognise. Printing it in full would
turn the claim screen into a way to read any dealer's contact address, which is
the thing the column grants were added to stop.

Same rule after a code is sent: the screen says where to look using the masked
form, never the full address, even when the dealer typed it themselves.

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

## The tab bar is ours

`TabBar` draws the four tabs; the navigator only says which routes exist, what each is
called, and which edge the bar sits on. Its own bar packs a glyph and a word into a fixed
49pt strip and exposes nothing else, and the last pass was already overriding the icon
height to stop the labels from clipping. A bar this permanent should not be a pile of
overrides.

What it draws that the navigator could not:

- The current tab in brass, glyph and word together, against `textFaint` for the rest.
  The tab is the mark; there is no separate rule or slab drawn over it to say so.
- A press that gives: the glyph and label scale to 0.92 in 90ms and come back. On a phone
  the tap also fires `Haptics.selectionAsync`, so the bar answers before the screen does.
- The rail as a real list — glyph beside label, `size.controlMin` tall, the current route a
  `surfaceSunken` row with a brass left rule, brass glyph, and brass label. That is
  `ChoiceRow`'s selected state exactly, because a rail is a list of choices.

Brass in the bar does not spend the screen's one warm accent. The seasoning rule is about
a page's content; chrome that is always on screen needs a selected state that is always
the same colour.

Press behaviour is the navigator's, unchanged: emit `tabPress`, stop if something prevented
the default, then navigate. A custom bar is a licence to redraw a control, never to redefine
where it goes.

The one thing lost is the anchor the default bar renders on web, so a tab is a button rather
than a link there — no middle-click, no URL on hover. The hook that builds those hrefs is
internal to the vendored navigator, and reaching into `expo-router/build` to get it would
break on the next upgrade.

## A save flies to the Saved tab

A pass leaves by the left edge. A save does not leave: the photograph carries on from where
the thumb let go, shrinks, and lands on the Saved tab's bookmark, which gives one small pulse
as it arrives. That is the only thing that says where the watch went — the tab carries no
count and the deck never mentions the save again.

The card the user swiped is retired in the same frame, so the next watch is ready under a
copy that is already on its way. Holding the deck for the length of the animation would make
every save feel slower than the swipe that caused it — the flight is feedback, never a wait.
It is an overlay above the tab bar rather than a view inside the deck, because a card that
has to reach the tab bar cannot be clipped by the screen that launched it.

The copy is the photograph, cropped as the card cropped it, with no name or price. Both go
unreadable within a frame of the shrink, and a reframe mid-flight would break the illusion
that it is the same object.

Where it lands is measured from the bookmark itself, never worked out from the tab count.
The bar moves to the left rail on a wide window, its height carries the home-indicator
inset, and the glyph sits above the word rather than at the tab's centre. Until that measurement arrives the watch is still saved and simply
goes quietly: a save is never blocked on the animation being possible.

Only from the cards view. The grid saves from a tile, and a card flying out of a stage the
deck is not showing would come from nowhere.

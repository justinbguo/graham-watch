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
| `surface` | The fill of anything sitting on the page: cards, tiles, the tab bar |
| `surfaceSunken` | A well inside a fill: image placeholders, a chosen row |
| `photoMat` | Matte behind a `contain` watch photograph on the page (grid tile, list row) |
| `fill` | A segment, a chip, and other matte controls that are not typed into. Not a button |
| `field` | Text fields, selects, and outlined action pills: white (light) or lifted (dark) with a `border` hairline via `fieldChrome()` |
| `border` | Hairlines between content, and the outline on `field` |
| `text` | Primary reading colour, on the page |
| `textMuted` | Supporting copy, descriptions, eyebrows |
| `textFaint` | Hints and placeholders you should be able to ignore |
| `ink` / `inkMuted` / `inkFaint` | The same three jobs, on a `surface` or a `fill` |
| `accent` / `onAccent` | A filled button and the type and icons on it. The inverse of the page |
| `brass` | The one warm highlight (`#BF9001`): dealer names, selected states, a collector number in a byline |
| `save` / `danger` | The two irreversible directions, and nothing else |
| `money` / `onMoney` | A price chip and the type on it. Not `save` |
| `overlay` / `onOverlay` | A flat plate on a photograph and the type on it |
| `onOverlayFaint` / `onOverlayAccent` | The roll's unread bars, and the current mark on a photograph (`#BF9001`) |
| `bar` / `onBar` / `onBarActive` | The tab bar's floor, its idle glyphs at 55% white, and the one you are on in full white |
| `badge` / `onBadge` | A count on a tab, red with white numerals. The same in both schemes, because the bar is dark in both |
| `notice` | The saved-row dot. Brighter than `badge`, the same in both schemes. Nothing is set on it |
| `caution` / `onCaution` | The unclaimed-shop badge. Same `#BF9001` as `brass`, with dark type |
| `raised` | The swipe card, which floats on `shadow.card` instead of stepping |

`scrim` sits outside the table because it is not themed: it is the fade a caption sits on
over a photograph, dark in both schemes. It is a CSS gradient string, drawn from
`experimental_backgroundImage` on native and `backgroundImage` on web, which is the whole
reason `PhotoCaption` exists rather than a style in the card.

Rules:

- `brass` is a seasoning. If more than one thing per screen is brass, none of it
  reads as special.
- `save` and `danger` mean save and pass. Never use them for decoration.
- `money` is a price, and only a price. A price in `save` looks like a watch you kept.
- Dark mode is not inverted light mode. It is a warm charcoal (`#121110`), not
  black, and text is `#F3EFE8`, not white. Pure black plus pure white on OLED
  vibrates and makes photographs look blown out. The app opens in light.
  Settings can switch to dark or follow the system; a choice already saved
  there is kept.
- `ink` equals `text` in both warm schemes, so reach for whichever names where
  the type sits. They only differ in a palette that lights a container
  differently from the page under it, which no palette does today.
- Contrast floor is 4.5:1 for body text, 3:1 for large text and icons.

## Nothing is drawn with an outline

Not a card, not a tile, not a panel, not a notice, and not a button either.
Everything that is a thing is a block of colour, and the step between tones is
the only thing saying where it starts and stops.

Three fills do all of it:

- `surface` — a thing sitting on the page: a card, a tile, the tab bar.
- `surfaceSunken` — a recess inside one of those: an empty photo slot, a chosen
  row. Only ever inside a container, because in the dark scheme it is darker
  than the page and would vanish on it.
- `fill` — a field, a segmented control, a chip. It has to read against the
  page *and* against a card, which is why it sits a shade under `surface` on
  paper and a shade over it in the dark. A button is not `fill`. A button is
  `accent`, the page's own type colour, with `onAccent` for its label and
  icons, so a light page gets a near-black button with light type and a dark
  page gets the reverse.

Two strokes are allowed, and neither boxes in a block of content. A card being
swiped wears a ring in green or red while the thumb is down. That one says what
is about to happen, for as long as a finger is on the glass, and a fill would
have to tint the photograph to be seen. The profile tab's photograph, when that
tab is on, wears a `size.rule` stroke in the bar colour, because a photo has no
outline glyph.

An icon-only control gets none of the three. It is the glyph and nothing else:
undo, the filters control, the view toggle, a close, a back arrow, a row's edit and hide. A
block behind a glyph is a second shape repeating what the glyph already said,
and three of them in a header turn a title row into a toolbar. The touch target
is `HIT_TARGET` (44) of empty space around it, which is invisible and enough.

Two consequences worth knowing. The page went a shade lighter and `surface` a
shade warmer when the outlines came off, because a borderless card needs a real
step against the page — about 11% in luminance, so it holds up on a dim screen
at an angle. And `textMuted` and `brass` went a shade darker in the light scheme
to keep their 4.5:1 on the warmer fill.

Nesting goes one deep. A container inside a container takes `surfaceSunken`,
because two blocks of the same fill stack into one block: the sold notice inside
a card, a matched shop inside a form.

State is colour. A chosen option fills with `brass` and flips its
label to `background`; an active toggle turns its glyph `brass`, the same as the
tab bar. Two fills a shade apart cannot carry a choice, so selection goes to the
accent rather than to a fourth tone nobody can see.

Hairlines survive where they separate content rather than enclose it — the rule
above a price, the divider under a `ChoiceRow`, the tab bar's top edge, the brass
mark on a chosen row's left. A single edge is punctuation. Four edges are a box.

One thing floats, and it is the swipe card. It is `raised` — plain white on the
warm-white page — with `shadow.card` under it: a tight cast that reads as
contact and a wide soft one that reads as height. There is no colour step left
to separate white from near-white, and the card is the one thing on screen
meant to look like an object in a hand rather than a region of the page. In the
dark scheme a shadow is nothing against a near-black page, so `raised` is a
tone above `surface` there instead.

What this costs everywhere else: a fill cannot float. Depth comes from the
colour step alone, so a modal over a tile over a page is at most two steps of
contrast, and anything needing a third needs rethinking rather than a second
shadow.

## Typography

**Neue Haas Grotesk**, for the entire interface. One word is set in something
else — see Identity — and it is loaded as one file, in one cut.

The family is cut in two optical sizes, and this app uses both. `face.text`
below 20pt, `face.display` at 20 and above. SF Pro used to pick that split on
its own; Haas ships them as different files, so each style in `type` names the
file. The six files load once, in the root layout, in the same `useFonts` call
as the wordmark.

The file is the weight. `regular` (Roman, 55) is for reading, `medium` (65)
leads a block, `bold` (75) announces a screen. There is no semibold cut, and
no fourth. A `fontWeight` on top of one of these files synthesises a fake bold
on Android, so Android styles set `fontFamily` and nothing else. iOS groups
the files into one family and serves Roman unless the style also names the
weight, which is why a phone can show GRAHAM in Roman while the simulator
shows Bold. `cut` adds that weight on iOS only.

Only the sizes above the body scale take `letterSpacing`, and only a little.
Tracking small text is how an interface starts to look like a slide deck.

| Style | Use |
| --- | --- |
| `wordmark` | `GRAHAM` on sign-in. Display bold, tracked at `tracking.wordmark`. Buy has no title |
| `display` | Screen titles |
| `title` | Watch model, section headings, empty-state headlines |
| `editorial` | Short atmospheric copy, never paperwork |
| `body` / `bodyStrong` | Paragraphs and input text |
| `label` | Segments and field copy |
| `labelStrong` | Button labels, the doors on sign-in, and `ChoiceRow`. Medium is this app's semibold |
| `control` | Compact actions: text toggles, tile buttons |
| `caption` | Specs, helper text, hints |
| `badge` | A count on a tab glyph. Caption size, bold cut |
| `price` | Prices. Lining figures align down a column |
| `eyebrow` | Run-in above a title — the brand, a section name |

Rules:

- Never set `fontSize`, `fontFamily`, or `letterSpacing` directly. Spread a
  style from `type`.
- Line length stays around 65 characters. Past that, split the paragraph.
- One `display` per screen. Two headlines means neither is the headline.
- `editorial` is the regular weight at 20pt, for one or two short lines under a
  title. It is not a paragraph style.
- Weight comes from `type` too. A one-off `fontFamily` or `fontWeight` in a
  component is a cut nobody agreed to.

## Capitalization

Nothing is set in all caps. No `textTransform: 'uppercase'`, no shouting string
literals. Uppercase text loses the word shapes that make a line quick to skim,
and a row of capitals in a UI face reads as shouting rather than as a heading.

- Sentence case for everything we write — headings, buttons, labels, hints.
  "Create account with email", not "CREATE ACCOUNT WITH EMAIL".
- Title case only for proper nouns and the words on our own chrome that are
  already names: tab names like "Search" and "Wishlist".
- The wordmark on sign-in is the one string set in capitals, and the letters
  are written that way. Buy has no title. `textTransform` stays
  banned, so nothing else can inherit the treatment.
- The `eyebrow` separates itself from the title under it by weight and colour,
  not by capitals.
- Listing text is dealer data, printed as imported. An initialism like IWC or a
  reference like `ST 145.022` is correct in caps, so we never re-case a brand,
  model, or reference — normalizing that would mangle more rows than it fixed.

## Identity

Buy has no title. On phone and narrow web the header is one row: the search door at
`layout.deckHeaderSearchShare` (60%) of the width, undo, filters, and the view
toggle grouped at the trailing edge with `space.xs` between them and
`space.md` before the cluster. On desktop web search lives in the top nav and undo,
filters, and the view toggle stack in `layout.deckToolRail` at the left of the deck.
The count is the subtitle under that row. Sign-in is the one place the letters
are `GRAHAM`, drawn by `Wordmark`, at the left of that column. Do not invent a
crest, heritage date, or seal to imply history the product does not have.

The mark — the launcher icon's gold `G` — stays on the launcher. It stood
beside the word on sign-in for a while, and that made the screen a poster
before it was a form. No screen wears the mark in its header either: a header
holds a title or that screen's own control, a count, and controls.

On web, sign-in is a sheet over the deck. Guests land on Buy with **Log in**
in the header's action slot. After `GUEST_SWIPE_BUDGET` judgments the sheet
opens itself with copy that says why. The sheet is the wordmark, one
`body`/`textMuted` sentence under it, and the doors — Apple, Google, email —
with **Not now** to dismiss. On iOS, that same panel is the first screen, and
it does not dismiss: the header has no room for a **Log in** control beside
undo, filters, and the view toggle. There is no second headline, no decorative
watch beside the word, and no card around the doors.

`GRAHAM` is Neue Haas Grotesk Display Bold, at 44pt, tracked at
`tracking.wordmark` (−2.2). Capitals at that size want to drift apart; pulling
them together is what makes six letters read as a mark instead of a heading.
It uses a cut the interface already loads, so the wordmark costs no second
download.

The desktop nav lockup is the same Display bold at 22pt with
`tracking.wordmarkHeader` (−0.8), looser than the 44pt sign-in mark. Its line
height matches `size.headerLogo` so the letters share a row with the gold G and
the nav pills. Tracking does not scale down unchanged: a size needs its own
token when it leaves the sign-in lockup.

### Optical alignment in a row

When type sits beside a mark or a control, align the **row** not the bounding
boxes alone. Give the type the same height as the mark (`lineHeight` equals the
logo edge), centre with `alignItems: 'center'`, then nudge caps one step if they
still sit low in the em box. Nav chrome, search, and lockups share `HIT_TARGET`
or the logo height so nothing drifts above the baseline of its neighbours.

### Onboarding is one slide grammar

Every onboarding question uses `StepShell`. The display heading, supporting
sentence, content, error, and footer actions appear in that order. The shell
owns safe-area padding and reading width through `Screen`; a step does not
recreate either.

Choice slides keep the answer on screen after a tap. The footer is **Continue**,
using the default fill, and it never advances as a side effect of selecting a
row. Continue stays disabled until a row is chosen. There is no **Skip for now**.
An empty brand list is the one exception: the catalogue has nothing to pick, so
Continue is enabled. The notification slide still offers **Not now**. That
declines a permission. It is not a skip of a question.

Back is an arrow on its own row above the heading, at the left, `arrow-left`
at `size.icon`, with no fill behind it. Every screen with a way back uses this
row: `Screen`'s `back` prop draws it. The touch target is `HIT_TARGET`, and
the glyph lines up with the heading. The first slide has nowhere to return, so
it has no arrow. The age-blocked slide has none either; sign-out is its only exit.

The watch-count answers are numerals: 0, 1, 2–3, 4–6, 7–10, 11–20, 21+.

A typed answer is a line, not a field. Name and username are `type.title`
(22, display medium) with the line height left off, for the same reason a
field leaves it off: iOS would shift the value and not the placeholder. There
is no fill and no corner radius. A hairline in `border` sits under the
letters, with `space.sm` between the baseline and the rule. The placeholder is
`textMuted`. The shop claim stays `Field`. That form is the one Profile shows
later, and the two cannot drift.

The username line starts with an @ the person does not type. It is the same
face and size as the letters, on their baseline, with `space.md` between the
mark and the name. The hairline runs under both. What is saved
is the name without the mark. Under the line, in `body` and `textMuted`:
"You are Collector #N on Graham". N is `profiles.collector_number`, assigned
when the account is created, and it does not move if someone else leaves.

The slide starts `space.xl` below the top inset `Screen` already applied, so
the question sits lower than a settings page. The footer stays at the bottom.

Rows use `CheckRow`: label left, animated checkbox right, inside a `surface`
group. The filter sheet adds a summary strip (match count, removable chips) and
always-open groups; the footer says "Show N watches". Onboarding and filters
share the same row. The label is `labelStrong`, not cards around every option.
A long set scrolls while the footer stays fixed. That preserves the same action position from Name through Notifications and
keeps the home indicator clear.

When the keyboard is open the footer sits above it, with `inset.screen`
between the button and the keys. The pad is the keyboard height minus the
home-indicator inset `Screen` already applied, since that inset lies inside
the keyboard. A slide whose answer is typed opens that keyboard itself: the
first field is focused once the slide has settled, and a tap on the footer
does not dismiss it. The next slide then takes the same keyboard. The birthday
slide has no field, so it dismisses the keyboard.

The birthday is three wheels — month, day, year — not three boxes and not
sliders. A slider has to be aimed at one year out of a hundred, and a thumb
cannot sit on a single year. Each wheel snaps to a name or a number. The
selected row is the center, marked with `fill`, and the date written above
the wheels is what Continue saves. The wheels open on the date eighteen years
ago, the youngest birthday the age gate accepts. Scrolling younger still
continues; the blocked screen is what refuses it. The wheels hide the scroll
indicator: a bar between the columns would read as a seam, and the center row
is the position.

The notification slide is the one exception in behavior, not shape. Continue
opens the OS permission prompt on iOS and Android; Not now records no
permission. Android creates its notification channel before requesting
permission, because Android 13 will not show the prompt otherwise. Web records
no permission because `expo-notifications` has no browser API.

On native builds with RevenueCat configured, the notification answer is held
until the Graham Pro paywall screen completes (subscribe, restore, or Not now);
then onboarding writes `onboarded_at`. Without RevenueCat keys, web, or demo,
the same slide still finishes onboarding immediately after the notification choice.

### Sign-in is a page with doors on it

Sign-in runs on the same scheme as everything else. A green page (`forest`)
lived here for a while as a test of whether the app should be green at all; it
answered no, and the palette and the `ThemeOverride` that carried it are gone.
One scheme, keyed off the system, and the status bar follows it like every
other screen.

The screen is the wordmark, the sentence under it, the watch beside that
pair, and a column of doors: Apple, Google, a rule with `or` on it, then
email. Apple's native button stands first on an
iPhone. Everywhere else Apple is our door, because the native view does not
exist in a browser or in Expo Go.
A door is `SignInOption` in `src/features/auth/` — the same capsule as
`Button`: `size.controlMin` tall, `radius.full`, `accent` on the page, mark
and `labelStrong` label centred as one group in `onAccent`.

The doors name the mode. Sign-in opens on creating an account, because the
screen exists for people who are not in yet; a ghost line under the doors —
`Already have an account? Log in` — flips the doors to `Log in with`, and
back. There is no heading for the mode. The providers do not know which
mode they are in. Email does: creating an account
lets an unknown address join, logging in refuses it with a sentence pointing at
the other mode. The typed address survives the flip, because "that address has
no account" is the usual reason to flip.

Email is three stages on one screen: the doors, then the address with `Send me
a code`, then the code with `Continue`. `Back` under each is a `ghost` and
steps back one stage. The mode line hides once a code is in flight — switching
modes mid-code would send a second, different email.

### A provider's mark is the provider's

The door is ours. Google's and Apple's and the email door share `Button`'s
capsule, so each one contrasts the page. What we do not recolor is the mark.

Apple draws its own button, so we pick the style that matches `accent`: black
on a light page, white on a dark one. Its label is Apple's, not ours: `SIGN_UP`
while creating an account, `SIGN_IN` while logging in. Apple does not offer
"Create account with", and we do not redraw their button to force it. It
stands first in the column, which is where Apple's guidelines ask for it when
other providers are offered.

Google's door is `SignInOption`. The mark is `assets/google-g.png`, the
four-color G, drawn by `expo-image`. The file arrived on a white square; the
white is knocked out, including the counter, so the button shows through and
the G holds on both a black door and a white one. Do not recolor those four
colors and do not swap in a glyph. `size.providerMark` (18) is the mark
against a 14pt label, which is `type.labelStrong`.

The email door is the same component with `email-outline` in that same box,
in `onAccent`, so the envelope flips with the label.

## Space and shape

Spacing comes from `space` — `xs` 4, `sm` 8, `md` 16, `lg` 24, `xl` 32, `xxl` 48,
`xxxl` 72. Nothing in between. If a layout needs 20px, the layout is wrong.
The only off-scale values allowed are 1px hairlines and `size.rule` (2), the
left edge of a chosen row.

Named jobs sit on top of that scale so a screen does not guess:

- `inset.screen` (24) is the page gutter. Cards and nested panels use
  `inset.card` (also 24). Sheets and full-screen modals use the same gutter —
  a modal is still a page, not a control.
- `inset.controlX` (16) pads a field on the left and right.
  Never put the page gutter inside a field. A search box already sits in a 24px
  margin; 24px more inside it leaves the cursor floating in empty chrome, and
  two price fields side by side become unusable. A single-line field has no
  vertical padding on top: see "Fields" below. A capsule's horizontal padding
  is half its height (`size.controlMin / 2`). Anything closer sits under the
  rounded end, and iOS clips it.
- `inset.compactY` / `inset.compactX` pad compact enum options and header
  controls.
- `stack.tight` groups a title with its caption. `stack.related` groups a
  field with its button. `stack.group` (32) separates blocks inside a sheet or
  listing. `stack.section` (48) is for a full page, not a modal.
- A sheet's footer (Done, Send) lives outside the scroll. Do not add
  `stack.section` or `space.xxxl` as scroll padding just to clear a sibling.

Fields share `size.controlMin` (52) with buttons so a single-line input is a
thumb target. A single-line field does not take `lineHeight`. `type.body`'s
24px line is for a paragraph that wraps. On iOS a text field turns the extra
into a baseline offset on the typed value only, so the placeholder and the
value do not share a line, and the letters sit under a gap. The field takes
the face and the size from `type.body`, a fixed height, and
`inset.controlX` on the sides.

This text face's x-height sits about 2px low in its own box, so a centred em
box still leaves more air above the letters than below them. `paddingTop` is
0 and `paddingBottom` is `space.xs` (4). The line moves up by half of that,
and the letters sit in the middle. Android also turns `includeFontPadding`
off. Left on, the font's extra ascent comes back as a gap above the letters.

Multiline fields keep the whole of `type.body`, including the line height,
because a wrapped paragraph wants even lines. They use `size.fieldMultiline`
(120), `inset.controlY` on both edges, and `textAlignVertical` at the top.

The room around a watch is the product. Prefer the next larger step over
squeezing copy in — on photographs and page sections, not inside inputs.

Radius comes from `radius` — `sm` 4 for thumbnails, `md` 6 for fields and
tiles, `lg` 10 for the swipe card, and `full` for anything you press that
carries a word: a button, a chip, a segment, a door on sign-in. A thumbnail
or a field is not pressed, so it keeps its corners. A circle on a photograph
is still wrong — a photo is not a control.

## Touch and motion

- `HIT_TARGET` is 44. Anything smaller needs `hitSlop` to reach it.
- Durations come from `motion`: `fast` (160ms) for a gesture resolving, `base`
  (240ms) for a transition the user is waiting on, `settle` (220ms) for a
  released gesture returning to rest, `flight` (320ms) for a saved card
  crossing the screen.
- Animation runs in Reanimated worklets on the UI thread. Never drive a frame
  from React state.
- Every gesture needs a visible response before the network is involved. The
  commit ring appears as the card moves, not after the row is written.
- Crossing the swipe commit point produces one selection tick. Committing
  produces one rigid impact. Never call haptics on every gesture frame.

The swipe deck answers save and pass on the horizontal axis. The card also slides
straight down, and only down, once its own scroll is at the top. That shows the
next watch in the gap and always returns. It is a preview, not a third answer,
and it does not rotate. Drag is elastic, not linear: to the commit point the card
follows the thumb exactly, past it the card returns about a third of the travel.
The slide follows the thumb for the card's own height, so the watch behind is
shown whole, and resists after that. The card moves with its frame. The clip
that rounds it does not also clip the drag, which was cutting the watch once
it left its own rectangle.

The tension is what tells you the swipe has caught before the colour does.

Nothing bounces. A released card settles to rest with easing and stops. Spring
overshoot on a declined swipe looks like the card rejected the drop. Haptics
are supplementary: iOS can suppress them for settings, Low Power Mode, camera,
or dictation, and the gesture must remain understandable without them. There
are two, in `src/lib/haptics.ts`: `tick` for a threshold crossed or a state
flipped, `impact` for a decision committed.

### What moves, and why

Motion earns its place by answering one of two questions: where did that go,
or did that take? Anything else — a spring, a toast, a pulse on an idle mark —
competes with the watch. Each moment below answers one question and uses one
of the four durations.

- **A follow** is answered on the capsule you pressed. The plus turns into the
  check (`GlyphTurn`: a quarter turn and a cross-fade, `motion.fast`) and the
  word changes with it, on the frame the write starts, with one `tick`.
  Nothing flies to Profile. Wishlist is a pile of watches, so a save can land on
  it; Profile is you, and a shop flying at it would claim it is a pile of
  shops.
- **An undone pass** comes back in by the edge it left, at `motion.settle` —
  the same easing a declined swipe uses to return to rest. The fade is derived
  from where the card is, so it thickens as it returns: the exit run
  backwards, ring included. A save is not undone here; Wishlist is where that
  watch went.
- **A vote** nudges the arrow the way it points and back (`space.xs`, `motion.fast`),
  and the score steps one digit in the direction it changed, the way a
  counter rolls. Taking the vote back nudges the other way. Only on a change:
  a score that mounts with the feed holds still.
- **A message you sent** rises out of the composer into the thread
  (`space.lg`, `motion.base`) on the frame Send is pressed, because the row is
  in the cache before the server has it. A reply that lands on the poll simply
  appears: you did not cause it.
- **A Community view** enters on `FadeIn` at `motion.base`, the deck's rule.
  The moment it is for is the composer closing onto the post it just made.
- **Search** opens as a sheet over Buy. The sheet slides up: that is the
  platform modal. The door on Buy is measured and a copy of the bar flies into
  the sheet's field on `motion.base` while the placeholder word fades out; there
  is no "Search" title on the sheet. Closing it runs the same transition backward.
- **A checkbox row** settles: the square fills and the check scales in on
  `motion.smooth` with an ease-out curve. Chips in the filter summary fade in on
  the same duration. Filters and onboarding share `CheckRow`.

A control that mounts in its on state shows it and nothing moves. A turn, a
rise, or a step on mount announces a change nobody made.

Presses already answer: a tab scales under the thumb, a capsule dims while the
finger is down. The unread dot stays a dot.

## Components

- A component reads colour through `useThemedStyles`, never a module-scope
  `StyleSheet.create` with colours in it. Styles have to rebuild when the scheme
  flips.
- Style factories live at the bottom of the file they serve, named
  `<thing>Styles`.
- If two screens need the same piece, it moves to `src/components/`. Rule of
  three applies to styles as much as to code.
- A line under a screen's title is `Screen`'s `subtitle`, not a `Text` laid on
  the page under the header. The header keeps its controls on the title's line
  whether the subtitle is there or not.

### Button hierarchy

A filled button is an `accent` capsule. The label and any icon we draw are
`onAccent`, and both are centred. On the light page that is a near-black
button with light type. On the dark page it flips. `ghost` drops the fill;
its label is `text`, still centred, which is how a second action stays quiet.

`solid` is the same pair. It used to be the one ink button on a screen of
`fill` buttons, reserved for `Open in my mail app`. A button that did not
contrast the page stopped reading as a button, so the loud step and the
ordinary one are now one colour. Ghost is the remaining quieter step.

## Alignment

Type on the page aligns left. A heading, a paragraph, an empty state, and the
wordmark all start at the left padding of their column.

A button is the exception. Its label and its icons are centred in the capsule.
A glyph that is the whole control sits in the middle of its hit target. A word
that fills a fixed slot — one segment of the appearance control — stays
centred in that slot. The content column is still centred in a wide window:
that is where the column sits, not how the type inside it is set.

## Iconography

One family: `MaterialCommunityIcons`, always the outline cut,
at `size.icon` for a header control and `size.iconSmall` inline with text.
A selected control changes colour. It does not swap to the filled twin.
A glyph that is not in that family waits for the commissioned set. Four are
in. `assets/filter.svg` is three centred bars, long to short, at `size.icon`.
`assets/message.svg` is one bubble and `assets/comment.svg` is two, both at
`size.iconSmall` beside a word. `assets/watch.svg` is the Buy tab, a case
with its strap, at `size.tabIcon`. `expo-image` tints them — the file's stroke is
black and black disappears on the dark page. The three line drawings are a 1.5
stroke on a 24 box; the watch is a 1 stroke. Filters is `text` until a filter
is on, then `brass`. Message and comment take the ink of the control they sit
on: `ink` on a community pill, `text` on the wishlist's Message button (`field`
fill).
Each has one drawing, not an outline and a solid.

The tab bar uses that same family at `size.tabIcon`. Its glyphs have no word
under them, so the size is what lets one hold a screen. They were `Ionicons`,
a heavier stroke, and the current tab filled in. Colour already says which tab
is on — full white against 55% — so the glyph stays an outline. Buy is the
commissioned watch instead, one drawing tinted to the bar: dim when idle, white
when that tab is on.

Profile is the one tab that is not a glyph once you have a photograph: the tab
is you, so it wears your face, square with `radius.sm` like every avatar. A
photo has no outline cut, so the current tab gets a `size.rule` stroke in the
bar's active colour. It was a fill behind the photo. With no photograph it
falls back to `account-circle-outline`, the same outline either way.

Icons carry the repeated controls — the six tabs, Undo, Filters, the view
toggle, Close, the dealer row actions. A control with no
honest glyph keeps its word instead: `Mark sold`, `Start over`, `Send via Graham`.
Never invent a symbol to avoid a label.

The specification table names each fact in words. A glyph cannot carry
"manual" or "white gold" without the reader stopping to decode it, so a row
is a label and a value: the label at `type.label`, the value at
`labelStrong`, both in `text`. The label column is `size.specLabel`, wide
enough for "Box and papers", and the values share the edge to its right.

Two headings split the table, both at `title`, the same size as "About this
watch". Specifications is what the watch is: reference, case, movement, dial,
complications, style. Condition is whether this example is the one to buy.
The year is not in either. It rides with the name.

Related facts share a row. The case is "36 mm · Steel", the movement is
"Manual · Cal. 861". A chronograph that is both the style and the only
complication is printed once, on the style row.

Reference, condition, and box and papers are never dropped. A dealer who
never wrote them leaves "Not stated". Hiding the row makes silence look like
a complete listing, and "no papers" is a different fact from a page that
never mentioned papers. Style "other" is the extractor giving up, so that
value is not printed.

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
| `layout.dealSheet` | 640 | Offer-deal sheet over a thread; Profile tab column. |
| `layout.card` | 480 | The swipe stage. |
| `layout.cardWeb` | 960 | Web swipe stage with photo and copy side by side. |
| `layout.hub` | 960 | Seller Hub on web. |
| `layout.grid` | 1280 | The browse grid. |
| `layout.rail` | 88 | The glyph column on a wide window. |
| `layout.gridColumns` | 4 | Tile columns on the wide home grid. |
| `layout.desktopColumnShare` | 0.75 | Desktop web tabs: one centred column for each tab's body. |
| `layout.desktopHeaderSearchMax` | 320 | Marketplace header search door cap. |

On desktop web inside `(tabs)`, `Screen` uses the centred `desktopColumnShare`
column. `DesktopTabHeader` uses `desktopContentWidth` — the same width as a
padded tab body such as Seller Hub's section nav (`inset.screen` gutters). The
swipe deck is the exception: pass `desktopBleed`
and `width="deckFrameWeb"` so the capped block is wide enough for the tool rail
plus a full `cardWeb` stage, centred in the tab column with `space.lg` under the
header.

A left rail and the column beside it share one top edge. Padding belongs on both
columns or on neither — not a one-off `paddingTop` on the rail to chase a roll,
photo, or first row inside the neighbor. Buy uses `DeckDesktopFrame`; Community
uses `desktopSplit` the same way.

The rail and the main column are separated by `size.rule` in `border`, with
`space.lg` on the main side. Use `desktopSplitMain` and `desktopSplitRailEdge`
from `src/lib/desktopSplit.ts` — do not hand-roll another width or colour.

`Screen` applies the cap and centres the column in the window, so a new screen
is capped without doing anything. The type inside that column aligns left.
Pass `width` only to leave the default: the deck asks for `card` in swipe
view on native, `cardWeb` on web, and `grid` in grid view.

A phone is narrower than all three, so these values change nothing on a phone.
They exist for the case the app already supports and nobody looks at.

Why each one:

- Reading width is the 65-character line from the typography rules, made
  literal. A full-window line at 16px runs past 200 characters, and
  the eye cannot find the start of the next line.
- A swipe card stays hand-sized. Stretched to a desktop window it is a
  billboard, and the gesture that matches it is a shove rather than a flick.
- The grid is a tile wall on a wide window: `layout.gridColumns` across,
  photograph above the copy. On a phone it stays one watch per row. The
  column still caps at `layout.grid`, so tiles do not stretch into banners
  on an ultrawide monitor.

### Size comes from measurement, not from the window

Read a live size with `useWindowDimensions`, or measure the element with
`onLayout`. Never `Dimensions.get('window')` at module scope: that is read once
when the file is imported, and on web it is wrong the moment somebody resizes
the browser. On a phone the bug hides, because a phone never resizes.

Prefer the element to the window when the question is about the element. The
swipe commit point is a quarter of the *card*, measured with `onLayout`, since
the card is capped and no longer tracks the window. Distance to fly off screen
is a window question, so that one reads `useWindowDimensions`.

A grid that caps its width measures the row against the cap, not the window.

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
  tab bar already stands in the home-indicator strip — `size.tabBar` (68) of
  bar with the inset padded under it — so a screen that pads the bottom as well
  leaves a dead band above the bar. On a wide layout the rail is at the left,
  so `Screen` restores its own bottom inset. The rail takes the top inset
  itself, since it stands beside the screen rather than under it.
- A screen presented as a sheet (`presentation: 'modal'` — search, filters, inquiry,
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
it is not drawn. `hideScrollbars` writes `scrollbar-width: none` and an empty
`::-webkit-scrollbar` to `document.head`, once, because CSS there is outside
React's reach and there is no style prop for browser chrome.

A styled thin thumb came first and was still wrong. On Windows and Linux the
bar is permanent, so every scroll view in the app carried a grey column beside
its photographs — including the ones inside a card, where a second vertical
line an inch from the card's edge reads as a seam. The app is a deck of
photographs; nothing is allowed to stand next to them.

What this costs, plainly: the bar was the only cue for how much of a list is
left, and the only way to drag to a position with a mouse. The card gives its
own cue, since content runs off its bottom edge, and no surface here is long
enough that wheel, trackpad, or keyboard is not enough to cross it.

Native keeps its own indicator, which appears under a thumb and fades — that is
the platform's, not ours. Two exceptions pass
`showsVerticalScrollIndicator={false}`. The swipe card does, because on a held
card the bar runs down the right edge of the photograph, which is the line the
whole app is arranged to keep clear. The birthday wheels do, because a bar
between the three columns reads as a seam and the center row is the position.

### Pointer and keyboard

- A swipe needs a thumb. Below `WIDE_BREAKPOINT` (900) the deck opens on cards;
  above it, on the grid. Either view is reachable at any width — the breakpoint
  picks the opening move, it does not lock a door.
- Navigation is a column of glyphs. Below the breakpoint it runs along the
  bottom; above it on native the same routes stand in `layout.rail` at the left;
  on web the same routes become text pills in `layout.desktopHeader` at the top. A desktop
  bottom strip under a narrow content column reads like a phone screenshot.
- The current tab is the white one on the phone bar and the native rail; on web it is the
  brass pill in the header.
- Anything doable by swipe is doable without one. On web, in the card view,
  left passes and right saves — the top card flings the same way a committed
  drag would. In the grid, the arrows move the selection (across a row, and
  up or down by a row of tiles) and Enter opens the listing; pass and save
  live there. Keys are ignored while a field has focus.
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
exact as anyone gets, so the rows are the whole control. Every row toggles, and
several may be on at once. Within a group a watch matches if it fits any chosen
row: 34mm or 39mm, the 1960s or the 1970s. Across groups they still all have to
match: a Rolex and a 1960s watch.

A budget is different — people arrive with a number. So price is two boxes, and
the preset rows below them are the same kind of choice as era. One selected row
fills the boxes, and typing $5,000 to $15,000 by hand marks "$5k–15k" on its own.
A second row joins the first. The boxes go blank then, because two ranges are not
one pair of numbers. Typing after that replaces the rows with the range in the boxes.

## Filter by dealer

The catalogue is a handful of shops and people shop by the shop they trust, so dealer
sits beside brand. The group lists every shop that has a watch this screen can show,
including when that is only one shop: the row is how a buyer sees who is selling, and
its count is how many of that shop's watches are in the feed. It stays off a shop
page, where you are already inside one dealer. A shop with no live listing is not
offered — the list comes from `listing_facets_v2`, so a dealer appears once a watch
of theirs is actually on the deck.

## Where filters live

The deck, search, and each shop filter separately. They are different jobs: the deck
is a queue you are working through, search is a question you are asking, and a shop
is one inventory. Narrowing search should not throw away the pile you were halfway
through swiping, and narrowing one shop should not follow you into the next.

The deck and search reach their filters through the `Filters` control in the header,
carrying the number of choices made. A shop uses that same control, beside Close.
The count is the point — without it, a user who filtered yesterday has no way to
tell why the list looks short.

The panel holds no search box. Typing a brand name is a question, so it belongs on
the search tab, where the field stays on screen. Price is the exception: two number
fields with presets underneath, because a floor and a ceiling are amounts, not names.

## Filters

Ranges are presets, not sliders. Dragging two handles to "36 to 39mm" is slow on a
phone and the precision buys nothing — nobody wants a 37.5mm floor. Presets also keep
filter state small enough to be a cache key. Every option toggles, including era,
case size, and the price rows. The sheet keeps price, era, case size, brand, and
dealer (deck and search only). Style, case material, winding, and complications
stay out of the panel so the first pass stays short.

Only offer a filter something can match. Options come from `listing_facets_v2`, so a brand
appears once a visible listing is that brand. A filter that can only return nothing is a
dead end the user has to reverse out of.

The deck, Search, and each shop still filter separately. One shared set would make
a search question wipe the queue you were halfway through, which is the thing the
funnel on each screen exists to prevent. A shop's options are counted from the
watches that shop has for sale, so a brand it does not carry is not offered.
Dealer is left out: you are already inside one shop. The list on screen is the
whole inventory, so a choice keeps or drops those rows. While a filter is on, a
line under the shop reads how many of its watches still match. An empty shop
still says nothing is for sale. A shop with watches and no match says nothing
in this shop matches.

Search includes watches you imported. The deck does not: swiping a shop you
just published is not shopping. The filter list follows the screen, so a dealer
you added shows under Search's funnel and not the deck's. A shop that is still
pending, or whose catalogue has not been imported into listings, is in neither.

The number under the search field is how many watches match, counted by
`listing_counts` with the search cut (`p_exclude_own` false, swipes kept). It
used to be the length of the list on screen. That list stops at 50, so past
fifty the label froze and a watch published after that never moved it. The
list is still the 50 newest matches. Opening the tab asks again: the screen
stays mounted, and a count from the last visit would not notice a shop
approved somewhere else.

## Photo carousel

Tap the right of a photo for the next, the left to go back. On a deck card the roll
wraps at both ends. The full-screen viewer still stops at the first and last photo.

On a card and on the detail hero the photograph fills its frame with `cover`,
edge to edge. A watch floating in a band of matte reads as a broken image, and
the frame is the product: a full-bleed plate is what a catalogue prints. The
full-screen viewer uses `contain` on black, because that is where a buyer
inspects a bracelet and nothing may be cropped. The detail hero is 4:5. A list
row is 5/7 and uses `contain`, so the whole photograph shows. The square
thumbnail survives only on the dealer's own
inventory rows, where it is wayfinding rather than the product view. Photo-heavy surfaces
use `expo-image` so the same dealer image is cached rather than fetched on every
return.

The photo set is barred, not counted: one three-point rule per photograph along the very
top edge, the current one in `onOverlayAccent` and the rest at `onOverlayFaint`. It is the grammar every phone owner
already has for "there are more of these", and it reads without being read — a `1 / 3`
plate is a thing you have to stop and parse on a card you are about to swipe.

The current bar is `#BF9001`, the rest white at low opacity. Everything else on a photograph is white, so
the one mark saying where you are in the roll is the one thing that is not, and it does
that at three points tall where a brighter white could not. `brass` is the same idea on
paper and cannot be used here: it is mixed against a warm page and goes to mud over a
dark scrim.

The bars sit on `scrimTop`, a shallow fade down from the top edge, because half these
watches are shot on white and a white rule on a white wall is not there. The fade is
weaker and shorter than the caption's at the bottom: it is holding up three-point rules,
not a title, and a heavy band across the top of every photograph reads as a letterbox.

On the buy deck the track sits between the catalogue count and the card stack.
On the listing hero and in the full-screen viewer it is the same track — centered at
`layout.photoRollTrackShare`, pills at `size.segmentDeck`, `radius.full`, inactive
segments easing to `fill` and the current one to `brass` on `motion.fast`. The
listing pins that track to the top of the photograph; the viewer pins it under the
status bar on black. The old full-width white overlay bars on the listing are gone.

The proportions are read before the photograph is shown, with `Image.loadAsync` on the
one being looked at and the one after it. `onLoad` alone reports them a frame late, so
every tap forward threw the bars up to the status bar and then dropped them onto the
photograph — the roll looked like it was reassembling itself on each tap. The same call
loads the bytes, so in the viewer it also does the work `prefetch` does on a card.

A photograph whose shape is not known yet has no top edge to sit on, so the viewer's
bars wait for it rather than start at the status bar and move. Arriving with the
photograph reads as one thing appearing; moving afterwards reads as a fault.

Bars are drawn, not spoken. The count rides on the paging controls instead, as an
`accessibilityValue` of "2 of 3" on the tap zones, so a screen reader still knows where
it is in the roll. Only the top card takes taps; a card underneath is not being read.

## Deck views

Two ways to read the same queue. Cards are for deciding, one watch at a time, and a card
holds everything that decision needs. The grid is for scanning, and a tap there opens the
listing route, because a tile is too small to read in. Pass and save happen on that
screen. On the cards, a swipe is still the decision.

Wide screens open on the grid, phones on cards. Either is reachable at any width.

The switch is one button beside the title, and it shows the destination, not the state: the
grid glyph while you are on cards, the cards glyph while you are on the grid. Two glyphs
used to sit there, one lit in brass and one faint — a segmented control drawn without its
frame, asking you to work out which half was a label and which was a button.

Both readings are defensible, so the animation settles it. On press the outgoing glyph turns
a quarter turn out and shrinks away while the incoming one turns in, `motion.fast` on the UI
thread. You see the control change, which is the only thing that distinguishes "you are
here" from "go here". Swapping the glyph on the frame the state changes gives the same
information as a flicker, and the button reads as broken.

The views behind it cross-fade at `motion.base`, entering only. There is no exit animation
because the outgoing view is unmounted the frame the state changes; the new one fades up over
the page. The fade also covers the column width changing — `card` is 480 and `grid` is 1280
on a desktop — which is a snap nobody would read as intentional.

On a wide window the home grid is tiles, not rows: `layout.gridColumns`
across. The photograph is a square (`aspectRatio: 1`) with `radius.md` and
`contain`, sitting alone on the page — not wrapped in a `surface` card. Bars
along its bottom page extra photos. Under it, on the page colour: the name
(`labelStrong`), the specs (`caption` / `textMuted`), then a row with the
price on the left and the dealer in `brass` on the right. Tiles sit
`space.md` apart. A tap opens the listing; pass and save happen there. No
badges, hearts, or shipping lines on the photograph — those are another
product's furniture.

Below the breakpoint the home grid is the same tiles as a wide window, but
`layout.gridColumnsPhone` across — photograph above the copy, `space.sm`
between tiles. A shop keeps the taller `gridPhoto` row. Search is a wall of
photographs, described under Search. The wishlist has its own compact row,
described below. The row or tile does not decide — a tap opens the listing,
and Pass or Save there is the verdict.

The grid is the same pile as the cards, one page at a time. The cards refill
when the pile is down to its last few, because a swipe throws a watch away.
The grid keeps every watch it has drawn, so it asks for the next page when
the tail of the list is on screen. A small spinner sits under the last row
while that page is on its way. Once there is no next page, that spot is the
tally — the same line the cards show at the bottom of their scroll, centred,
in `caption` and `textMuted`. A page that fails leaves the watches already
on screen and offers Try again. It does not say the catalogue has ended. A
different filter is a different pile: the list returns to the top and the
first page. A tile's key is its listing id, so a watch that arrives on two
pages is still one tile.

Wishlist and shop rows that still use `ListingRow` size the photograph at
`layout.gridScanWidthShare` of the row, capped at `size.gridPhoto`, so the
thumb grows on a wide row without becoming a poster. `size.gridScan` is only
the width before layout. Inspecting happens on the listing; a list row only
has to be recognised.

The price and the dealer share one line, divided by a middot with air around
it, exactly as they do on the card. The dealer is `control` in `brass`: medium,
which is this face's semibold, at the caption size of the line it sits in.
Stacked they were a third and a fourth line
of type in a block that is only as tall as its photograph.

Maker and model are one line in one size — `formatTitle`, "Omega Speedmaster Professional,
1972" — and that line stops at two. A short name does not reserve a blank line under
it. The brand used to be an `eyebrow` over the model, which made every row look like a
section heading.

Wishlist and a dealer's shop still use `ListingRow`. The wide home grid uses
`ListingTile` instead — same facts, stacked for columns. Search is photographs
only. Wishlist used to set a 72px square thumbnail
beside `bodyStrong` type, which made the same watch a different size depending
on which tab you were standing in, and made the photograph too small to be
worth looking at.

A row is its own block on `surface` with `radius.md`, and lists separate them
with `space.lg` rather than a hairline. Two blocks with a rule between them
read as one table cut in half. The wishlist is the exception: its rows have
no block, so a hairline in `border` is the only edge between them.

The frame is a fixed 5/7 — roughly what a dealer shoots, a watch upright in a
portrait photograph — and the whole photograph is shown inside it, `contain`
rather than the card's `cover`. Its height used to come from the type beside
it, so a name that wrapped to a second line made the frame taller, and the
same photograph was magnified and cut differently in one row than in the next.
A crop at this size is also the wrong trade: it magnifies the dial past the
case shape, and the case is most of what tells one vintage watch from another.
Inspecting still happens on the listing; a row only has to be recognised. The
frame is centred, so type at a large accessibility size grows the block
without changing the photograph's shape.

A wishlist row is compact. No `surface` behind it; a `border` hairline sits
between rows, and each row has `space.md` above and below. The photograph is
`gridScan` wide at 5/7 with `radius.md` corners, centred on the type beside
it. The name is `labelStrong`, with no spec line under it. Between the name
and the price is one line. A watch already in a thread shows the latest
message about it, in `caption` and `textMuted`, and the day it was sent at
the top right: Today, Yesterday, the weekday, or a date once a week has
passed. A watch nobody has written about yet says "Tap to inquire about the
watch" in that same place. It also carries a still `notice` dot, `size.unread`,
on the row's top-trailing corner — past the type, not on the photograph. No
halo and no pulse. There is no Message capsule.

The photograph opens the listing. Everything else on the row — the name, the
line, the price — opens the message, and so does the dot: the thread if one exists, a new
one if not. On the wishlist, writing is the next step, and the watch is one
tap away on its photograph. A sold watch with no thread has nothing to write,
so its row opens the listing.

The wishlist is two sections with `title` headers in `text`: **Pending**,
then **Saved**. Pending is a watch you have already written about. Each header sticks while its section is on
screen, on the page colour so rows do not show through. When both are
present, **Saved** has `space.lg` above it. The red count on the Wishlist tab
is how many saved watches are still waiting for that first message, the ones
with the dot. It is not the length of the list.

A sold watch has no prompt and no dot. Nothing is left to write about a watch
that went. A watch with no dealer has none either. If a message was already
sent, the last line and its day stay, and the row still opens the thread.

It used to be a mail glyph in the corner, so every list stayed the same
height. The corner had no word, and the act it started was an email. Message
is the act, and it needs the word. The word stays under the summary rather
than beside it: beside the summary it took the width the dealer's name needed.

## Onboarding is seven questions, then a permission

Name, username, birthday, collection size, favourite brands, pain points, then
notifications. A name, because the dealer reads it at the top of the inquiry
email and "a buyer on Graham" is a worse way to start a conversation about a
five-figure watch. Brands are picked from what the catalogue actually holds,
with the count beside each one.

Brands rank the deck; they never filter it. A first-run answer is a guess, and hiding
the catalogue behind a guess costs more than dealing it in a slightly worse order.
Choosing nothing is not offered. Continue stays disabled until at least one
brand is selected, unless the catalogue has no brands to show.

The gate is `profiles.onboarded_at`, not an empty brand list: picking nothing is an
answer, and it has to be told apart from never having been asked.

## Profile is who you are, then the shop

The Profile tab opens on the person: a square `size.profile` photo, and to the
right of it their name, `@handle`, "Collector #N" at `caption`, and how many
watches on their wishlist. The photograph sits `space.md` under the title. The
header already ends in `space.lg`, and a second pad above the face left a band
of page between the word and the person. The photograph is the height of those four lines.
`size.thumb` stopped short of them and left a band of page under the picture.
The two are aligned at the top, so the name starts on the photo's top edge
instead of floating against its middle, and the block of type takes the rest
of the row so a long name wraps rather than widening the page.

The blocks under the person — posts, the wishlist, Following, the shop — sit
`stack.group` apart. `stack.section` treated each one as its own page and left
a band of the page between them. The person block adds no pad of its own under
the photograph; the column's gap is the only one.

Under that, posts, then the wishlist. Posts use the same row a community profile
uses: a square cover at `size.gridPhoto`, the watch and its price, and two lines
of the description. "Posts" is `title`. A tap opens that post on the Community
tab. None yet says "No posts yet." The rows belong to the profile's list. A
second list inside it would take the scroll.

The wishlist runs in a horizontal row, newest first. "Wishlist"
and "Following" are `title` in `text` — the same face and color as
the name, which is white on the dark page — because an eyebrow there was the
faintest type on the page, under a name it was introducing. "Your shop" stays
an eyebrow: that block is the dealer's own tools, not a list of things they
chose.
Each photograph is `size.gridPhoto` wide at 5/7, the same frame as a watch in
a list, with the name and the price under it. A tap opens the listing. An empty
wishlist draws no row, and no heading either: a heading is a promise that
something is under it.

The username slide still says "You are Collector #N on
Graham"; the profile keeps the number only. Settings keeps the email, theme,
sign-out, and delete account. Putting the name behind a cog made the tab look
empty for anyone who had not claimed a shop.

The photo is optional. Tap the tile to pick one from the library. It uses
`radius.sm` like every other thumbnail — not a circle. The capsule is for
things you press; a photograph is not a control. An empty tile is a sunken
well with the account glyph, the same empty language as a listing row with no
photograph.

## The card is the whole listing

A card scrolls. Under the photograph sit the dealer's description,
who is selling it, and the button that writes to them — the same `ListingDetails`
block the listing route renders.

The block under the photograph opens on "About this watch" when the dealer wrote
one, then the description. That heading is `title`. The description stays at
`label`.

Both are full-strength `text` — white in the dark scheme — with nothing under
the photograph in a muted tone, because a muted paragraph on a raised card
reads as disabled rather than secondary.

The block is spaced at `stack.related` between its parts and `space.sm`
between specification rows, not the `stack.group` a page uses. A card is read
in the hand at arm's length and a page is scanned; the same air that looks
generous on a screen looks like padding on an object. Tighter than this and
the lines touch.

The photograph takes 58% of the card's height, capped at 5:4 of its width, so
two things hold on every phone: the plate never starts below the fold, and the
description is always cut off mid-sentence at the bottom edge. The cut is the
only thing that says the card continues. Sizing the photo by aspect ratio alone
can only promise that on the screen the ratio was picked on. The cap changes
the height only. The plate stays the full width of the card, and `cover`
centres the watch in it. A ratio applied on top of the cap narrows the plate
and leaves the card showing down the right edge.

Three gestures, one surface, and they must not fight:

- Drag sideways and the card leaves. The pan claims the gesture once the
  horizontal travel wins, so a thumb reading the spec table never flings the
  watch away.
- Drag down, with the card already at the top of its scroll, and the whole card
  slides down, as far as it is tall. The next card is the same size and stacked
  behind it, so that watch comes into view whole. Let go and the card settles
  back. The slide is not a pass and not a save.
- Drag up and the card scrolls. The scroll view's own pan is off: it was
  claiming every downward drag, so the preview never ran, while left and right
  still worked because a scroll view has nothing to do sideways. The card's pan
  scrolls the words, and a wheel does the same on the web.
- Tap the photograph's left or right to page it, long press to open it full
  screen, pinch to magnify it. Only the top card takes any of this.

The two cards behind that one are already the finished card: same size, same
`shadow.card`, gesture already attached. A swipe does not build the next one
and it does not wait out the exit. The card that just left keeps flying — a
pass fades off, a save is the flight to the wishlist — and the next card takes
the thumb on the next frame, shadow included. Sibling order does not change
for a card that stays; paint order is z-index. Moving those views to put the
new top last was rebuilding the shadow at the moment it should already have
been in the hand.

The listing route still exists for the surfaces with no card to scroll: a wishlist
row, a search result, a grid tile. It shows the same block under a bigger
headline, and adds the Save toggle a deck card does not need — there a right
swipe is the save. Opened from the grid, it also offers Pass, the left swipe.
Passing closes the listing and the row is gone from the deck.

That headline heads the page, on the same line as Close: the name in `title`,
the price on its right, then the X. `display` made a long name three lines tall
and pushed the price into the middle of the block. The name takes the leftover
width and wraps; the price sits `space.sm` from the X, and both stay on that line. It stays put. The photograph and the
block under it scroll, and the name does not: a name that leaves with the
photograph is gone by the time you reach the caliber. A page has a
column to head, and the name is the one thing that says what you opened. The
card is the other way round — both words sit over the image — because a card is
the object itself and has no column above it.

### The whole plate is on the photograph

Two rows at the bottom left on `scrim`: the watch name (`formatName`, capitals on
the plate only), then price in `Tag` `tone="money"` `size="plate"`, the year
after a middot, and `fullscreen` at the trailing edge to open the viewer at the
current index. The dealer stays in the scroll below the photograph. Tiles, rows,
and listing headlines still use `formatTitle` with the year beside the name;
only the deck plate splits them so the price can carry a chip.

White type never sits straight on a photograph. It sits on `scrim`, a fade to a
warm black that is darker at the bottom than it was, because half these watches
are shot on white. The type carries a soft shadow as well, for the top of the
block where the fade is thinnest.

A grid row keeps its own block beside the photograph, at `ListingSummary`. Three
lines of type over a photograph that size is a stamp, not a caption.

## What the wishlist adds up to

The wishlist header carries the total of everything in the list. A list of five-figure watches
is a number the user is already holding in their head, badly.

Watches priced on request are left out of the sum and counted under it — "2 on request" —
because a total quietly short by two reads as the whole answer. Mixed currencies show no
total at all rather than adding pounds to dollars. An empty list shows nothing: "$0" beside
the word Wishlist reads as a price. Sold watches are left out too, since their row shows "Sold"
where the price was and a sum no visible price explains is worse than a smaller sum.

## Removing a watch from the wishlist is a swipe

A row on the wishlist slides left to reveal `Remove` in `danger`. The action is a
capsule at `inset.compactX` by `inset.compactY`.

It replaced a long press, which nothing on a phone teaches and which had to be
explained by a line of instruction under the list — the line is gone with it.

The swipe reveals; the tap removes. A gesture that deleted on release would mean the same
flick that pushes a row aside also throws the watch away, and the list has no undo.

The row is `ReanimatedSwipeable`, from Gesture Handler, which is already a dependency and
already runs its pan on the UI thread. Hand-rolling it would mean re-deriving the two parts
that are easy to get wrong: scroll-versus-swipe arbitration inside a list, and closing the
open row when another opens.

A drag must never count as a tap. React Native Web fires the row's click at the end of a
drag, so swiping a row open also opened the watch; `useSwipeGuard` wraps a row's handlers
and drops the press while the row is off its mark. It reads a ref at the moment of the
press rather than state from a render, because the press and the render race.

There is no swipe on a search result. Nothing there is yours to remove.

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

Importing only ever adds, so stock also has to be re-read. `npm run refresh` (nightly,
and on demand) syncs every approved shop and auto-publishes what changed. A watch the
shop marks unavailable is retired; a watch missing from a complete catalogue read is
retired; an incomplete read never retires by absence. `sold_source` records who decided,
so a dealer marking sold by hand is never cleared by a later feed.

Sold is its own column, not a `status`. `status` is what we chose to publish; `sold_at` is
what the market did, and it carries the date. Keeping them apart is also what lets a sold
watch stay readable: `search_listings` drops it from the deck, search and the filter counts,
while a watch already sitting on someone's wishlist stays there, marked "Sold", with the
inquiry button gone. Deleting it instead would remove it from that list with no explanation
and take the swipe history with it.

A long press on the photo opens it alone, full screen and black, with the paging intact and
nothing else on it. Long press because tap is already spoken for by paging, and because
wanting a closer look is a deliberate act rather than a stray thumb.

A pinch magnifies the photograph in place, up to four times. The dial's printing, the
crown's teeth, the stretch in a bracelet: everything a buyer is actually deciding on is
smaller on the screen than the words beside it. The magnification follows the point
between the fingers, because a pinch that scales about the frame's middle slides the part
you were looking at out from under your hand.

On a card the zoom springs back when the fingers lift. A card left magnified would be a
card that no longer behaves like the rest of the deck, and the swipe that comes next would
start on a photograph that is no longer where it was. In the full-screen viewer the zoom
is held, one finger moves the photograph around, and a double tap is the way in and back
out — you opened that screen to study one watch, and a magnification you have to keep two
fingers on is one you cannot look at. Panning stops at the photograph's own edge, not the
window's, so black never slides in beside a photograph shown `contain`.

Two fingers on a card is a pinch, never a drag: the deck's swipe gives up the moment a
second finger lands. Left to it, the first finger would have flung the watch away while
the other was still zooming in on the dial. The first finger has nearly always moved
before the second arrives, so the swipe is usually already under way. It stands down
anyway, and the card settles back to centre. The pinch is declared simultaneous with the
card's pan (`alongside` in `usePinchZoom`), because otherwise the pan, active first,
cancels it and the zoom never starts. The paging zones over the photograph are off
while it is magnified, or the finger lifting out of a pinch lands in a zone and pages the
roll.

It all runs in Reanimated worklets on the UI thread. A magnification driven by React state
re-renders per frame, and it would drop them on the one interaction that exists to be
looked at closely.

On the deck card the swipe is the only verdict. The card carries no buttons:
a **Add to wishlist** beside the gesture was a second way to do one thing, and a
dealer inquiry is a step you take about a watch you have kept, not one still
being judged.

On the detail screen saving is the same act as a button: **Add to wishlist**, with
`bookmark-outline` at `size.iconSmall` beside the label. **Ask about this watch**
carries `email-outline`, and **Pass** a `close`. They sit between the
specification table and the dealer: saving and asking are about the watch, and
the shop under them is who you would be writing to. Under the dealer they were
the last thing on a block that had already changed subject. Save writes the
same right swipe the deck does.

A watch already on the wishlist shows none of the three on the detail screen. Nothing
is left to decide about a watch you have chosen, and the row on the wishlist already
carries **Message** and slides left to remove, so the page repeated a
verdict twice over and put the save above the one button still worth pressing.
The page goes by what is on the wishlist, not by the screen you came from: opened
from search, a watch on the wishlist reads the same as it does from the wishlist.

From Search the page offers **Add to wishlist** alone. Search is a place to look:
passing there would drop a watch out of a deck the reader has not come to yet,
and writing to a dealer is a step you take about a watch you have kept. Search
says so in the link — `?from=search` — because one page serves the deck grid,
the wishlist, a dealer's shop, and search, and it cannot otherwise tell which row was
pressed. The deck grid keeps all three: it is the deck, and the deck is where a
watch is judged.

Full screen is the right weight for that screen. A sheet leaves the deck showing behind it
and invites a swipe to dismiss, which is the gesture that means save.

## The dealer panel counts, it does not estimate

Two figures, both counted from this shop's own rows by `dealer_reputation`:
how long they have been here, and how many watches they have for sale.

It showed two more and they are gone. **Sold here** was a dash on nearly every
shop, because it only counts a sale we watched happen, and a dash is a shrug
where a number was promised. **"Stock checked against this shop's own site
four days ago"** was a sentence about our importer printed on a page about a
dealer — a buyer deciding whether to write to someone does not need our
refresh schedule.

It used to show a rating in brass stars, a review count, years trading and a
reply time, all invented and seeded from the dealer id, behind a "Sample"
label. That was the wrong trade. A buyer does not read the label; they read
4.7 stars. And one invented figure standing beside true ones makes the true ones
unreadable as well, because now the reader has to decide which is which.

Two consequences worth keeping:

- **A young shop looks young.** "Sep 2026" is the honest picture of a
  marketplace weeks old, and it is what the panel shows. Tenure names the
  month until the shop has a year behind it, because "0 yrs" reads as a bug.
- **Two true figures beat four hedged ones.** The panel is short because that
  is all we can count. It gets longer when there is something real to add.

A rating goes back the day a buyer can leave one, and not before. The RPC still
returns `watches_sold` and `last_refreshed_at`; nothing reads them, and they
are the obvious inputs the day the panel earns a second row.

**The shop's own mark sits beside its name.** Nobody uploads a logo to Graham
— a dealer is imported — so their favicon is the only piece of their own
design the app holds, and the panel draws it at `size.icon`, `radius.sm`, and
`contentFit="contain"`. Contain, not cover: a logo cropped square is a
different logo, while a letterboxed one is only a margin. It is
`accessible={false}`, because the name it sits next to is already read out.

It comes from `unavatar.io` with `fallback=false`, which is the entire reason
for that service over Google's or DuckDuckGo's. Both of those answer a miss
with a generic globe — a real image, under a 404 a browser ignores — and a grey
blob beside a dealer's name is an invented mark, the same mistake as the stars.
`fallback=false` answers a miss with nothing, the image fails, and the mark
becomes `assets/dealer.png`: the same default picture a conversation row uses,
rather than the name sitting flush left with no face.

The dealer's own `/favicon.ico` would need no third party and does not work.
Six real dealer domains, one served one. A Shopify or Squarespace shop declares
its icon in HTML and serves it from a CDN, so only a service that reads the
page finds it. Two costs, both real: the domain a buyer is reading reaches
`unavatar.io`, and a free service sits in the path of a card. The fix, when a
dealer's mark is worth owning, is to resolve it once at import and store the
URL on the dealer row.

**The site and the handle are each their own row.** The words are `body` in
`text` — the light type on a dark page — and the row is at least `HIT_TARGET`
tall, because a caption was too small to tap. The site opens in the browser.
A filled `web` glyph at `size.icon` sits beside the domain, with the scheme
and `www` left off. The handle opens Instagram. Its mark is the white glyph
in `assets/instagram.png`, tinted to `text` so a light page does not lose it,
at the same size as the globe. The handle is the label. The mark stays silent.

The panel reads in one order: the mark and the name, the shop's own sentence
about itself, then the two counts. Identity first, then what is true about
them.

The shop's sentence is set like the watch's description above it: `label` in
`text`. Both come from the dealer, and a muted `body` under a full-strength
`label` read as two different writers on one card. The watch's description is
the reference; change the two together.

On the shop's own page the screen title is that name, so the panel does not
say it again. The title steps down to `type.title` so Follow can share the
line. The name takes its own width; when the line is full the capsules wrap
under it rather than crushing the name. **Message** sits beside Follow, the
same height, `field` fill with `text` ink and the commissioned bubble.
It opens that shop's thread. A watch is not named unless the button is the
one under a listing. **Filters** sits in the header beside Close, the same
control the deck uses. It is there once the shop has a watch to isolate.

**Three of the shop's other watches** sit under the counts, on a card and on
the listing route. Equal tiles at the list row's 5/7, `radius.sm`, on
`surfaceSunken`, `contain`, so a watch here is the same shape as the same
watch on the wishlist. The watch being read is left out. A tile opens that listing.
A buyer deciding whether to write to a stranger wants to know what else they
sell, and three photographs answer that faster than a count. The strip is
`useDealerPreview`, keyed by shop so every card from one dealer shares it.

The strip's row names itself. **Inventory** is `title` in `text` on the left,
the same face as the other section headers. **See more** stays `labelStrong`
on the right, with a `chevron-right` at `size.iconSmall` on the word, and
opens the shop's own page: the description, and every watch the shop still
has for sale. The arrow is the mark that the word leaves this card. Inventory
is not part of the button: a header that presses makes the name and the link
the same control. It replaced a **More watches** ghost button under the
links. The shop's own page shows neither: the list is already there.

**Follow** sits on the name's line, a rounded rectangle at `dealerSocial`
(`minHeight` 36, `paddingX` `space.md`, `radius.lg`) with the word in
`labelStrong` and the glyph at `size.dealerSocialMark`. **Message** is the same
shape beside it, `field` with `text` ink, because Follow is the loud one. When a long name
pushes them to a row of their own, they stay side by side on that row. The panel
measures the wrap rather than guessing from the name. Each button is shorter than
`HIT_TARGET`, so `hitSlop` makes up the rest.
Follow and Following are one button in two inks. Follow is solid `text` with
the word and glyph in `background`: white with black type on a dark page,
near-black with paper type on a light one. It is the thing to do, so it is the
loud one. Following turns it inside out: a `text` stroke, `text` type, and the
page colour inside, because the act is done. The size and the stroke stay put,
so a press swaps the ink without the capsule moving. The glyph is `account-plus-outline`
until you follow, then `account-check-outline`. Pressing it again stops. On a card the
capsule is beside the panel's name. On the shop's page it is beside the title,
since that is the only place the name is written.

A list of dealers, such as Following on Profile, puts the same capsule at the
end of the row. The row itself opens the shop, and the capsule is its own
button: one control inside the other would open the shop and change the follow
on the same tap. To the right of the name, before that spare space, sits a
`VerifiedMark` (gold-filled decagram, bold white check). It is the gold mark, and the
row is spoken as verified. Every shop in the list wears it. There is no
separate verified flag on a dealer, so the mark is the list's, not a second
status. A person does not wear it, and neither does a watch row.

When a followed shop has listed watches in the last 14 days, after the follow,
that this buyer has not opened, the row adds `3 new` in `caption` / `textMuted` between the name
and the mark. It is type, not a pill: a box around a count would look like
another control. Above Following, the same news is one row, `title`, "New from
dealers you follow", with the total in that same caption at the end of the
line. It opens the New feed. The Profile tab carries the total the way
Wishlist carries a count. Opening the feed, or opening that shop, clears the
number. The feed's rows stay; only the count leaves.

## A contact address is never spelled out on screen

Claiming a shop offers to mail the address on the shop's site, and names it as
`h•••@their-shop.com`. The dealer reading it knows their own mailbox, so the
first letter and the domain are enough to recognise. Printing it in full would
turn the claim screen into a way to read any dealer's contact address, which is
the thing the column grants were added to stop.

Same rule after a code is sent: the screen says where to look using the masked
form, never the full address, even when the dealer typed it themselves.

## The deck says how much of the marketplace you are seeing

The last line inside the card's scroll, centered, in `caption` and `textMuted`.
You only see it after you scroll to the bottom; it is not pinned on screen.
Filtered, it is two numbers —
"12 of 148 watches available". Unfiltered, before a swipe, one: "148 watches available",
the size of the catalogue. After a swipe the first number is what is left, so the line
is "147 of 148 watches available".

Two numbers because one of them is meaningless alone. "12 watches available" reads as an
empty marketplace when it means a narrow filter, and the difference matters: the first
number is a reason to widen the filter, the second is a reason to come back tomorrow. The
brass count on the Filters button beside it says how many choices made the first number
small. Naming the filters in the line as well wrapped it to two lines to repeat something
already on screen.

Both are counted in the database by `listing_counts`, in one round trip, with the deck's
own predicate. It used to count the pile in hand, which is fetched one pile deep, so it
capped at `DECK_LIMIT` and printed "20+" — a hedge that was never the answer to either
question.

The line still has to move with the thumb. `matched` is what is left to see, so a swipe
drops it in the cache at the same moment the card leaves, and an undone pass puts it
back. The refetch is the correction, held for a minute, not the thing the header waits on.
Unfiltered, before any swipe, `matched` and `total` are one number and the line says so.
After a swipe they differ, and the line becomes "147 of 148 watches available".

`matched` drops what you have already swiped, because that is what is left for you to
look at. `total` keeps it: "on the marketplace" is a fact about the marketplace, not
about your history. Both drop watches from a shop you have claimed. Importing a
listing does not: `imported_by` is the account that fetched the row, and that
account still shops the deck.

The slot is `Screen`'s `subtitle`, so any screen can say what it is holding in the same
place, in the same tone, without inventing a second header. Nothing shows until the count
lands; a number that changes once the query returns is worse than a line that arrives
late. The grid has no subtitle. That same line is the list's footer, and it waits
until the last page has arrived.

## The end of the deck

Running out is not an error, so the empty deck offers the only move left: start over, which
puts back every watch you passed on. Wishlist watches stay out of it. A right swipe is a decision
you can still see on the wishlist, and replaying it risks losing a save to a stray thumb.

The count is in the copy — "the 20 you passed on" — so the button is a promise, not a guess.
With nothing to put back the offer is a plain refresh instead.

## Undo goes back one

Start over is the cure for a long afternoon of passing. The cure for a thumb slip is the undo
arrow in the deck header, which takes back the last pass and only the last pass. Deeper history
would need a stack the user has no way to see the bottom of, and a watch two swipes ago is not
what anyone is reaching for.

Only passes. A save is already sitting on the wishlist with an undo of its own, so a right swipe
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

The colour is a ring around the card, `size.ring` thick on the card's own frame. It fades
in with the drag and is solid exactly at the commit point, so the edge going full strength
is the card saying "let go now".

An edge rather than a tint, for two reasons. A wash over the photograph colours the watch
itself, which is the one thing on screen that has to stay true — a green Submariner is a
different watch. And a card scrolls: a fill that started under the photograph was drawn
against a layout that only exists at the top of the scroll, and it cut a straight line
across the specification table anywhere else. The frame is the one part of a scrolling
card that holds still.

This is the single outline in the app, and it is allowed because it is not a state. It
exists while a thumb is down and is gone when the thumb lifts.

## The tab bar is a glass dock

`TabBar` draws the five tabs; the navigator only says which routes exist, what each is
called, what count it carries, and which edge the bar sits on. Its own bar packs a glyph
and a word into a fixed 49pt strip and exposes nothing else. A bar this permanent should
not be a pile of overrides.

On a phone it is a `LiquidGlass` pill — `expo-blur` over the page, `glassFill` and
`glassBorder`, `radius.full`, floated in the screen gutter above the home indicator. On a
wide native window the same material stacks in a rounded rail at the left. Glyphs still use
`onBar` at 55% white and `onBarActive` at full white; the current tab gets a `glassWell`
behind its icon. The page shows through the dock instead of meeting a solid `bar` floor.

On a wide web window the bar is `DesktopTabHeader`: logo, text nav pills on `background`,
search centred in the row, and a `border` rule under `layout.desktopHeader`. The current
pill is `brass` with `onCaution` type. Buy drops its duplicate search and keeps deck
controls in its screen header.

The tab you are on used to be brass, and the glyph used to fill in. On a black floor
that is a third signal. The step from 55% to 100% white is the contrast the eye
actually reads. Brass is the accent for selection *on the page* —
a chosen filter, a paging bar — and the bar is not the page.

**No words under the glyphs.** Four labels at 11pt were four things to read on every
screen, and at that size they were decoration more than instruction. The word survives as
each tab's accessibility label, which is what a screen reader announces and what a pointer
shows on hover.

**Glyphs carry it alone, at a larger size, on the same light stroke.** `MaterialCommunityIcons`
outline at `size.tabIcon`, 28pt, idle and active. The current tab does not fill its
glyph in: it steps from 55% white to full white. Buy is `assets/watch.svg` at that
same size, one outline tinted to the bar. See Iconography.

**A tab may carry a count.** The screen declares it with `tabBarBadge`; the bar draws it
half on the glyph's top-right corner — `space.xs` out on each side, so it overlaps the way
a sticker lands rather than floating beside the glyph as a third item in the row — and
folds it into the spoken label as "Wishlist, 3". Over 99 it reads `99+`.

The pill is `badge` with `onBadge` numerals — red, white count — on Wishlist and Messages
alike, idle or active. Red is what every phone uses for "something is waiting for you".
It used to be a white disc that inverted to dark on the current tab, because a white
pill on a white glyph is one shape. Red stands off both glyph tones, so it no longer
changes with the tab. It is not `danger`, which is muted for type; white on it reads
grey. The bar never runs
a query to find a number out: the wishlist count comes from the same cached list the wishlist
screen renders, through `useSavedCount`, so the two cannot disagree.

**A press gives**: the glyph scales to 0.92 in 90ms and comes back. On a phone the tap
also fires `Haptics.selectionAsync`, so the bar answers before the screen does.

On a wide window the same strip stands on its end: an 88pt column of glyphs, no labels,
no selected slab — one chrome rather than two that happen to share a palette.

Gold in the bar does not spend the screen's one warm accent. The seasoning rule is about
a page's content; chrome that is always on screen needs a selected state that is always
the same colour.

Press behaviour is the navigator's, unchanged: emit `tabPress`, stop if something prevented
the default, then navigate. A custom bar is a licence to redraw a control, never to redefine
where it goes.

The one thing lost is the anchor the default bar renders on web, so a tab is a button rather
than a link there — no middle-click, no URL on hover. The hook that builds those hrefs is
internal to the vendored navigator, and reaching into `expo-router/build` to get it would
break on the next upgrade.

## Community

The second tab, between Buy and Messages. Two people (`account-multiple-outline`).
A public board: a person posts a watch they are selling, buying, or trading, and anyone
signed in can comment. The comment is the public record that they are in the deal.

It was Exchange, under two arrows, with Messages as a tab of its own beside it. The
arrows named the deal and nothing else on the board; the people are who you are among.
Messages moved in, then back out. A conversation with a person starts from their
profile. One with a shop starts from that shop's watch. The reply arrives later,
and a header control on this tab and on Wishlist could not show it while you were
swiping. Search left the bar so Messages could take
a seat without a sixth glyph. The database keeps the old word: the tables are `exchange_*`
and so are the hooks and the feature folder, because a rename there is a migration, and
the name a user reads and the name a table has are two different things.

A post opens with the person who wrote it, on one line: their photograph at
`size.avatarByline`, their `@handle`, `Collector #N` in brass, and how long ago. A
post from a stranger is a person first — the title said what the watch was and nothing
about who was offering it. The byline was two lines deep, the name over the handle, and
it was taking more room above the title than the fact it carried. The board now says
the username, not the given name. The given name is the title of their profile.
Someone with no photograph gets the account glyph,
the same empty state the profile page uses. The photograph is read live from the
profile, so changing it changes every post. The handle and the collector number
are stamped onto the row when it is written. The face is 32 points, a step taller than the `body` line beside it. At 24 beside `label` type the byline read smaller than the title under it. The collector number was a grey
capsule, which put a box around data. Brass type is the one accent in the byline, and it
names the thing the board is for: who is a member.

Then the watch, `space.sm` under the byline, on the same left edge as the face.
That pair is `PostLead`: the feed and the thread share it, so the gap cannot
drift, and it does not also close the gap above the action row. It used to
start past the face, under the username, and the post had two left edges. The price is the next line, its own capsule, aligned to
the name rather than the right edge. A sale is a `money` chip with `onMoney`
type. A request with a budget is "Up to $X" in the same green. A trade, a random
post, or a request with no budget is a plain `Tag` on `fill` in `ink`, naming the
intent. Both tags are one shape: `caption` type, padded `space.sm` on the sides
and flush to the type above and below. The intent tag was a size larger than the
price, so a post's two kinds of mark read as two different things. The price used
to share the name's line, at the right edge, and a long name wrapped beside it. At
the title's size the green box read as a button.

There are four intents: Selling, Buying, Trading, and Random. Random is a post that
is none of the others — a find, a question, a watch someone wants to show. Like a
trade it states no price.

Under the screen title, a row of capsules filters the feed: All, then one per
intent. It is the screen's subhead, so it is part of the header rather than a
row pulled up over it: `space.sm` under the title, and the header's `space.lg`
below the row. A negative margin would paint the capsules over the header,
which keeps the taps, and clip them on the header's edge. The five share the
row in equal widths at `size.follow` tall, `control` type, `space.sm` apart.
They do not scroll. A row with a half-hidden last word reads as cut off. The chosen one is `brass` with `background` type, and the rest are `fill`
with `ink`. One is always on. All keeps the Buying strip pinned above the list. A
single intent drops the strip and lists only those posts, newest first. The choice
lives on the Community screen, so it survives opening a post and coming back.

The photograph follows, wider than tall (`3/2`) and as wide as the post, with
`radius.lg` corners. A square made every post a poster once the name was already
under the username. The card is `space.lg` above and below. The title, photo,
and description are `space.md` apart; the byline is `space.sm` over the title,
because who posted belongs to what they posted. At `space.xs` throughout, the
parts ran together into one block.

The first post sits directly under the screen header. The header already ends in
`space.lg`; the post's own top padding on top of it opened a 40-point hole.

The description follows the photograph, two lines in the feed. Up to six photos; the feed
shows the first, in `body` on `text`. The title is `bodyStrong`. The description, the
thread's text, and a comment are `body`. So is the byline: the username is
`bodyStrong`, and the collector number and time are `body`. At `label` the byline
read as a footnote above the post. One size for the post: the feed, the thread, and a comment used
to step from 13 to 22, and the same watch read as a different post once you opened it.
At `label` the post itself read as fine print. Colour and weight do the separating. A
selling post states a price. A buying post may state a budget. A trade or a random post
states neither. Every post includes a
photo: the picture is the offer, and a title with no photograph is a card with nothing
to look at. The body is the condition, what is included, and the terms the two people
still have to agree. The composer asks for the photo before the description for the same
reason. The Post button stays disabled until one is attached, and the database rejects
a save that arrives without one.

The composer opens on one control, the same height and fill as a field, reading
Selling, Buying, Trading, or Random with a chevron. It was a `ChoiceRow` per intent,
which spent the top of the form on a small choice. Opening it shows the four inside that
same block, split by a hairline; the one in force is brass type. A menu floating
over the title would need a border, and nothing here is outlined.

In the thread the roll pages one photograph at a time, with a chevron on a scrim disc at
each edge and a dot per photo at the foot. It was a strip of 240×180 thumbnails, which
made every watch a contact sheet beside its own description. The deck's invisible tap
zones would not do here: on the deck a tap is the whole grammar of the screen, but a post
is read and scrolled, so the way through has to be visible. Paging does not wrap and a
chevron is gone when there is nothing that way. The dots ride their own scrim, because a
white dot vanishes into a steel bracelet and every photo in the roll is a different
background; the one you are on is the warm tan, the same accent the deck's bars use, so
the mark is the one thing on a photograph that is not white. The next photo is prefetched
while this one is being looked at.

Everything you can do about a post is in one row of capsules at its foot: the votes and the
comment count. Writing to the person is on their profile, not on the post. That row is `ActionBar`,
and each capsule is an `ActionPill`: a glyph at `size.iconSmall` with a count in `control`
beside it, both `ink`, filled with `fill` rather than outlined, because a row of outlines
reads as a row of empty boxes and this app keeps depth in the step between surfaces. At
`size.icon` with grey glyphs the row was the loudest and the dimmest thing in the post at
once. The capsule is 26 points tall, and `PILL_HIT_SLOP` makes up the rest of
`HIT_TARGET`. The controls were
spread through the lines above instead, a count in the corner of the byline and the votes
under the name; gathered at the end, the post is read top to bottom and acted on once.

Every post and every comment carries both votes: an up arrow, the score, and a down arrow
in one capsule at `size.iconSmall`, first in that row. Brass fills the arrow you pressed,
either way — the same brass the
Filters button uses to say a control is doing something. Red would read as delete, since
in this app `danger` means destroy rather than disagree, and two colours would say a
downvote is a different kind of act.

One vote per person per thing. Pressing the other arrow swings the score by two; pressing
the arrow you already chose takes the vote back. The score can stand below zero, which is
the point of having a down arrow at all: an up arrow alone could only say "worth
answering", while a price nobody would pay and an offer nobody trusts both sit at zero.
The score moves the moment the thumb lifts and is put back only if the write fails — a
vote that waits for the network reads as a broken button. Votes do not reorder anything.
The feed stays newest-first because a board where a watch is for sale today is a record of
what is on offer now, not a ranking.

The payment line is not on the feed. An information icon sits beside the plus. It says
you pay the other person directly, and that Graham does not hold the money or the watch.
Comment on a post before you deal with them. The comments go with a deleted post.

On their own post the author gets three dots at the far end of the byline, holding Edit
and Delete in `danger`. Two full-width buttons under every post
gave the rarest pair of actions the most weight on the page, and put an irreversible one
a thumb's width from the description. The menu opens inside the post, not over the
screen, so it travels with the post as the thread scrolls; a second tap on the dots, or
choosing, closes it. The line that holds the dots carries its own stacking order —
without one the photograph under it paints over the open menu.

Buying posts are pinned in a strip above the feed, `size.pinned` wide, on `surface`.
The word Buying is `label` in `textMuted` and the title is `bodyStrong`, three lines
at most. They stay newest-first and do not also appear in the list under the strip: a
request is what the top of the board is for, and a second copy would be the same post
twice. Every other intent stays in the list, newest first. The strip is a plain
horizontal scroller. A second list nested in the feed's list warns and takes the
vertical scroll.

A comment is one line with a send glyph in it, nothing else. A comment is a reply, not a
second offer: asking someone to name buying, selling, or trading before they could type a
word was three chips, a label, and a full-width button in the way of one sentence. So
comments carry no intent and the thread does not sort them.

That one line is `SendBar`, the same control a conversation uses, because saying one
thing to whoever is already on the screen is the same act in both places. It is drawn
like the deck's search capsule: `fill`, `HIT_TARGET` tall, `radius.full`, the text
inset by half the height, on the page gutter with no hairline above it. It is the one
field that takes a capsule, because it should read as the same object as the search
bar. Send is `send-outline` at `size.icon` inside the capsule's trailing edge, `ink`
when there is something to send and `inkFaint` when there is not.
It was a filled `accent` circle beside the field with a `size.iconSmall` glyph: a block
behind an icon-only control, and a mark too small to read as the way out. It sits on the
keyboard's top edge while it is being typed into, the same way the onboarding footer
does: the screen pads its bottom by `useKeyboardLift`, which is the keyboard's coverage
minus whatever already stands there — the tab bar and the home indicator inside the tabs,
the home indicator alone on a pushed screen. `KeyboardAvoidingView` adds the whole
keyboard on top of that instead, which left the field a tab bar's height above the keys,
and before that invisible behind them.

A comment is built the same way: the byline, what they said, then its own action bar.
Reply points the composer at that person. The field starts with their `@handle`
and a space, as ordinary text, so deleting it leaves the reply unaddressed. A
line above the field says who is being answered, with a way out of it. Cancelling
stops the reply from nesting under them and leaves whatever is already typed.
The answer is indented by one small avatar, so it starts under the username it
is answering.

Nesting stops at one level. A reply to a reply attaches to the same root, because a tree
deep enough to need a rule down the left margin is a tree nobody can follow on a phone,
and the database flattens it rather than trusting every client to.

The three dots in your own byline are how you edit or delete that post.

The byline is a button. Tapping the face or the name opens that person. The
screen title is their name, so the row under it does not say it again: the
photograph at `size.profile`, the `@handle`, and the collector number in brass,
centred on the photograph. Message sits at the end of that row when the profile
is someone else's, and it opens the conversation with them, finding the one
already there if you have written before. Your own profile has no such button.
Then the posts they have written. Back returns to
the post or the feed you came from, and a post there opens the thread. The page
is built from the author already on the post and from `exchange_posts`, which
anyone signed in can read. It does not read `profiles`. The wishlist, the shop,
and settings stay on the Profile tab, because those belong to the signed-in
account.

In a feed row the byline and the action bar sit beside the part of the row that opens the
post, not inside it. A control nested in a control is a button inside a button on the
web, which is invalid markup, and the one tap would both vote and open the thread. So the
title, the flairs, the photo, and the description open the post, and the person above
them and the controls below them do not.

New post, the editor, the thread, and a collector's page stay inside the tab. The
header's trailing icons on the feed are, left to right, the information mark and
plus. The others carry a back arrow at the top left, on its own row above the
title, where iOS and the onboarding slides put it. It used to sit in the trailing
slot, and a thumb looking for the way back went to the wrong corner. The trailing
slot holds controls that act on the screen.

## Search opens from the deck

Buy has no name in the header. The bar reading "Search" is 60% of that row; the
deck controls sit on the rest. The count — "12 of 148 watches available" — is
the last line in the card scroll, centered, and only visible at the bottom. The
bar is a button, not a field: typing there would be thrown away
when the screen changed. It is `SearchDoor`, and it looks the same as the
`SearchField` it opens, so the door reads as the field.

Every search bar — Buy, Search, Messages — is one of those two, from
`src/components/SearchBar.tsx`. A `surface` rounded square at `radius.md`, the same
tone as a card. `HIT_TARGET` tall, `space.sm` on the sides. A `magnify` glyph at
`size.icon`, then the word "Search" in `type.body`, both `inkMuted`. The placeholder
is one word on every screen; the `accessibilityLabel` tells a screen reader what
that screen searches. The bar is shorter than a `controlMin` field because on Buy
it shares the screen with the card, and every point comes off the photograph.

Pressing the door opens Search as a sheet over the deck. A tab switch cuts, and
the bar you pressed would not read as the thing that opened. The sheet slides up
(`presentation: 'modal'`, `animation: 'slide_from_bottom'`). The real field takes
focus. Coming back from a listing does not open the keyboard again. An X at the
start of the title's line dismisses the sheet. Filters stay at the trailing edge.

Under the count, the matches are photographs and nothing else. Three across, square,
`cover`, with `space.xs` between them and no corner radius: the cells tile into one
wall, so rounding them would open the page colour at every corner. The wall runs to
the edges of the column. The field and the count stay in the screen gutter.

The rhythm is the explore feed. Six watches make a block: one photograph spans two
columns and two rows, two small ones stack beside it, and three small ones sit
under that. The next block puts the large photograph on the other side. A remainder
that cannot fill a block stays small, in rows of three. A tap opens the listing.
There is no name and no price on the wall; the photograph is the thing you came
to recognise, and the listing says the rest. A watch with no photograph is an empty
`surface` square, still tappable, and its name is spoken.

Search left the bar so Messages could sit in it. Five glyphs with no words under them
is the limit. A sixth is the one you tap by mistake.

## Messages

The middle tab, between Community and Wishlist (`chat-outline`). It was
`message-outline`, a box with a tail, and it was the square glyph in a bar of
round ones. Three
things end up here: the shops you have asked about a watch, the people you have
written to, and the groups you are in. They are one list, ordered by whichever
moved last.

The glyph carries the unread count, the same badge the wishlist uses, and it counts threads.
Six replies in one thread is one thing to go and read. A row in the list still wears
the brass dot rather than a number: how many messages are waiting in that one thread
does not change what you do about it. The number on the tab is how many threads are
waiting, which is the thing the badge on Wishlist is already for.

A field under the title searches the threads you are already in. The other party's
name, their handle, and the latest line filter as you type. After a short pause the
same words are matched against older messages in those threads, so a sentence from
last week still finds the conversation.

A plus at the end of the title opens New message, a sheet over the tab. It was
the tab's own body swapping to a search, which read as Messages changing rather
than a task you could close. The sheet is a field, then Create a group, then people under it before
anything is typed: the people you already talk to, then the earliest members.
There is no line telling you what to search; the list is the instruction.
Typing narrows it to a username prefix or the start of a name. It is never more
than eight and never you. Profiles stay readable only by their owner;
`suggest_people` is the one place a list of accounts leaves that table, and
pressing one calls `conversation_with_person`. The thread replaces the sheet,
so closing the thread lands on Messages. That opens the thread already there with that
person, including the one that started because they wrote to your shop, rather
than a second thread with the same name on it.

Create a group is a row under the search, the same photograph and padding as
a person, with the words in `bodyStrong`. It opens New group chat, a second
sheet. The X is on the left. Create is on the right, and it stays off until
two people are chosen. Twelve is the most. The name sits above the search,
in the same bar: `surface`, `HIT_TARGET`, a pencil where search has its
magnifying glass.
A name you type is the group's name, at most 40 characters. With none, the
name is the other people. The same people open the group that already exists.
Opening it again does not change the name. In the thread, the name is a
button: tap it, edit, and return saves. Anyone in the group can. Clearing
it returns the name to the other people. The brass rule marks
each person chosen. A group in the list wears
`account-group-outline` where a photograph would be. The line under that name in the thread is how many people.
Someone else's message names them, in `caption` above the first bubble of
their run, and that name leads the latest line in the list. Yours stay on the
right with no name, and the list still leads those with "You".

The thread search under Messages
still accepts one exact username, through `conversation_with_handle`, and a
thread that already exists is the one that opens. A conversation also still
starts from a person's profile or from a watch a shop is selling.

A row is the other party's photograph, their name, the last line said, and when. A shop
shows the favicon the importer stored on `dealers.logo_url`, contained in the same
square a person's photograph fills. A shop that declared none, or whose icon fails to
load, gets `assets/dealer.png` — one picture every such shop shares, bundled with the
app. A person with no photograph still gets the account glyph. A miss never draws a
globe: an invented mark fetched for that one shop makes the name harder to trust.
The photograph is a second door inside the row: it opens the shop page or the
collector profile, while the name and message preview open the thread. The same
photograph in a thread's header opens that profile too. `collector_profile`
returns one named collector for that durable route; the profiles table itself
stays private.
Unread is a dot at the end of the line rather than a count: how
many messages are waiting does not change what you do about them, and a number on every
row turns a list into a scoreboard.

A thread's header puts the other party's picture at the start of the title's line:
the same `PartyAvatar` the list uses, at `size.avatarHeader`. The list showed who
a thread was with by face, and opening it used to lose the face. A shop that
has not claimed its account wears one `caution` badge on the subtitle's line,
directly under the name: it has not claimed, and the inquiry goes to their
email until they claim their profile.

In a thread, yours are on the right in the accent and theirs are on the left in the
fill. Alignment alone fails the moment a message wraps to the width of the column, so
the two sides differ in colour as well. A run of messages from one person shows one time
under the last of them; a time on every bubble doubles the height of a conversation to
say almost nothing.

A message about a watch quotes it. The photograph sits above the name, and both
sit above the words, on the side of whoever asked, because one thread holds every
watch you have asked that shop about. In the composer the quote is on the right:
it is what you are about to send. Once a message in the thread already quotes
that watch, the composer does not quote it again — coming back from Wishlist
would otherwise draw the same photograph twice. The frame is `quotePhoto`
wide, 5/7, `contain`, `radius.md` — larger than a shop-page thumbnail, because
this photograph is the only one on the row. The name is `title`, in a box about
15% narrower than a message bubble, so the bigger type wraps. A tap opens the
listing. The thread's own title is `title`, not `display`, so a shop name
shares its line with the picture and the close control.
The first time you write about that watch, the field already says "Hey, is
this watch still available?" It is the field's text, not a placeholder, so
you edit it on the keyboard or send it as it is. A thread that already names
the watch starts empty, so a follow-up does not ask again.

A thread catches up every five seconds while it is open, and the list every thirty. That
is polling, not a live connection: a websocket is a second thing to authorise and
reconcile, and an answer that lands within a few seconds reads as live. It is the first
thing to change if a slow answer starts costing a deal.

### A shop that has not claimed its account

Asking a shop about a watch still sends the email it always did. The thread is what that
email leaves behind: each inquiry is a message in it, quoting the watch it named
and marked as sent by email.

If nobody at the shop has claimed it on Graham, the composer is the same field.
Send opens that message as an email to the shop, so the words reach someone who
can read them. The yellow badge under the name is what says so. Hiding the
thread entirely would be worse, because the buyer still needs to see what they
asked and when. A visit that names no watch has nothing to email about, so it
shows the header and no field. An empty thread shows nothing in place of a prompt.

The moment the shop claims its account, the same threads become writable on both sides.
Nothing is copied at the time of the inquiry — the shop's side of a conversation is the
claim itself, read fresh — so a claim made next week collects the threads opened this
week, and a claim that moves takes them with it.

## A save flies to the Wishlist tab

A pass thins as it travels. The card stays solid up to the commit point,
where the ring is the decision, and fades from there to nothing at
`FADE_FRACTION` (0.55) of its width. That is as far as a thumb carries it:
past the commit the drag resists, and a fade measured out to a full width
would finish somewhere the finger never reaches. Letting go past the commit
carries the fade to its end, on `motion.fast`, and the card slips one width
clear. Letting go short of it thickens the card back as it returns. A
rightward drag stays solid, because that card becomes the photograph flying
to the wishlist and a fade here would pop back to full when the flight took over.
A save does not leave: the photograph carries on from where
the thumb let go, shrinks, and lands on the Wishlist tab's bookmark, which gives one small pulse
as it arrives. The Wishlist tab's badge counts watches still waiting for a first
message, not every watch on the list. The flight is what shows
the photograph landing on that bookmark. The deck never mentions the save again.

The card the user swiped is retired in the same frame, so the next watch is ready under a
copy that is already on its way. Holding the deck for the length of the animation would make
every save feel slower than the swipe that caused it — the flight is feedback, never a wait.
It is an overlay above the tab bar rather than a view inside the deck, because a card that
has to reach the tab bar cannot be clipped by the screen that launched it.

The copy is the photograph, cropped as the card cropped it, with no name or price. Both go
unreadable within a frame of the shrink, and a reframe mid-flight would break the illusion
that it is the same object.

Where it lands is measured from the bookmark itself, never worked out from the tab count.
The bar moves to the left rail on a wide window and its height carries the home-indicator
inset. Until that measurement arrives the watch is still saved and simply goes quietly: a
save is never blocked on the animation being possible.

Only from the cards view. The grid opens the listing instead of saving in
place, and a card flying out of a screen that is not the deck would come from
nowhere.

## The operator console wears the app's clothes

The console is a separate web app — Vite and plain CSS, no React Native — and
it used to look like one: the system sans, its own near-miss greys, brass
fills on every button, outlined boxes. A shop's name looked one way there and
another in the deck, and neither told you anything about the other. Every
value in `operator/src/index.css` is now copied from `src/lib/design.ts`: the
dark palette, the type scale in px, the space and radius steps, `HIT_TARGET`,
and the six Neue Haas files, referenced out of `assets/fonts/` rather than
copied, because two copies of a licensed font drift.

Two departures, and no others:

- **It is dark only.** The app follows the system scheme. A tool nobody sees
  but us does not need a second palette maintained.
- **Tables are set at `label` and `caption`, not `body`.** The scale is the
  app's; the density is a tool's. 14px in a row of forty shops, 13px for the
  headers above them.

A filled button is `accent` with `onAccent` type, so the one consequential
action on a row — **Publish**, **Pull back** — is the one that is light.
Everything reversible is `ghost`, which is `fill` with `ink`. Selection is the
same accent capsule the app uses for a chip. Nothing carries an outline: a
well inside the page is `surfaceSunken`, a panel on it is `surface`, and the
one hairline allowed is the separator under a table row.

**Dealers comes first and opens first.** Applications used to. Approving the
occasional application is a few seconds a week; the shops themselves are the
screen the tool exists for, and the one you return to after every action on
it.

**A row's facts are columns, not a disclosure.** The description the scrape
read off the shop's site and their Instagram handle were inside the dropdown,
one shop at a time — and the only way to know a read worked is to look. As
columns they can be scanned down a list of forty. The description clamps to
two lines with the full text on hover, so one long import cannot set the
height of every row.

What stays in the dropdown is the shop's watches, because that is a list
rather than a fact. The arrow that opens it is a `chevron-right` path from
Material Community Icons — the set the app draws from — in a 44px box,
turning a quarter when the row opens. It was a 0.9rem triangle typed as a
character, which is a target you aim at twice and a glyph whose weight came
from whatever the system decided.

**A header names its column on one line.** "In the deck" broke over two and
took every row's height with it. Which means the table has to fit the window
instead: gutters are `space.sm`, a row's own buttons take the compact
padding rather than the capsule's 26px each side, and the shop's contact
address moved under its name — 250px of email was the column that pushed the
table off screen, and where a shop is reached is part of who it is. Nine
columns fit a laptop at 1440. A narrower window scrolls the table sideways
inside the page, never the page itself, which would carry the header's
controls away with it.

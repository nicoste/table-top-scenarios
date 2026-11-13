# Design system

How the two screens look, and where each part of that lives. The rules are
R-217 to R-217c in [ARCHITECTURE.md](ARCHITECTURE.md); the reasons are D-381,
D-383, D-386, D-387, D-388, D-389, D-390, D-391, D-392 and D-394.

**To see it, start the host and open `/gm/gallery.html`.** Every part below is
drawn there by the real components with the real stylesheets — the console's
own panels too, handed sample data — and three pickers re-colour the page,
which is all re-theming is. The table's own parts are on `/table/gallery.html`,
with the table's stylesheet. Nothing on either page is a copy, so neither can
show a look the screens do not have, and a test draws both and holds them to
this page (D-394).

---

## Where things live

| File | What it holds |
| --- | --- |
| `packages/theme/tokens.css` | every colour, size and font, as a custom property |
| `packages/theme/base.css` | the rules both screens share |
| `apps/gm/src/shell/shell.css`, `apps/table/src/shell/shell.css` | each screen's own rules, after those two |
| `packages/ui/src/theme/index.ts` | `THEME`: the tokens as `@tt/ui`'s inline styles read them, one fallback each |
| `packages/ui/src/game-icon/index.tsx` | `GLYPHS`: every icon, as data |
| `apps/gm/src/gallery/gallery.tsx` | the gallery |
| `apps/table/src/gallery/gallery.tsx` | the table's own parts |

A value is written once, in `tokens.css`, and read from there: by the
stylesheets as `var(--token)`, by `@tt/ui` through `THEME`. The values this page
shows are `tokens.css`'s, and a test holds them to it (D-394).

---

## Colour

Five master colours. Everything else is mixed from them, so a change to one in
`tokens.css` reaches both screens.

| Token | Default | For |
| --- | --- | --- |
| `--ui-main` | `#181c24` | surfaces: panels, slots, fields |
| `--ui-highlight` | `#f5a524` | what is chosen or in hand, focus, the GM's own band |
| `--ui-ink` | `#e6e9ef` | text and icons |
| `--ui-danger` | `#e5534b` | deleting, errors |
| `--ui-ok` | `#57d9a3` | connected, a clear line of sight |
| `--ui-tertiary` | mixed: highlight and ink, a pale gold | a second highlight beside the first, which must not be taken for it: the table's band next to the GM's (D-383) |

Mixed from those: `--bg`, `--panel`, `--edge`, `--ink`, `--dim`, `--accent` and
`--ok` for the shells, and two families for panels and slots:
`--ui-panel-bg`, `--ui-panel-border`, `--ui-panel-shadow`; `--ui-slot-bg`,
`--ui-slot-border`, `--ui-slot-hover-bg`, `--ui-slot-hover-border`,
`--ui-slot-shadow`, and the chosen slot's `--ui-slot-active-bg`,
`--ui-slot-active-border`, `--ui-slot-active-ink`, `--ui-slot-active-shadow`.

**`--ui-key` is the colour of a key**, wherever one is shown: a tool slot's
number, and a `<kbd>` in words (D-388). Lighter than `--dim`, so it reads at
4.5:1 on a slot under the pointer; a test holds it there.

**A colour typed into a shell or a component is a bug** (R-217), with two
exceptions. Black and white for shading — bevels, shadows, outlines — since
they shade any theme the same. And a picture of a real thing: the paper of a
printed card (`CARD_STOCK`), and the favicons, which cannot read the theme. The
sentence for a browser too old to draw either screen has plain colours too:
the tokens are mixed with what that browser lacks.

---

## Sizes

| Token | Value | For |
| --- | --- | --- |
| `--ui-radius` | `2px` | every corner: cards, controls, swatches, badges. None are round. |
| `--ui-control-h` | `28px` | a row's controls — buttons, fields, dropdowns, colour chips — so a row lines up |
| `--ui-control-sm` | `22px` | a row's quiet actions (`button.quiet`), and the level ladder's own fields |
| `--ui-slot-h` | `54px` | a tool slot (`SlotButton`) |

Some things keep a size of their own: a swatch's cut is 18px, a picture card
20 by 28 (a card's 5:7), and the badge that clears a picture 14px.

---

## Text

Two faces: `--ui-font`, monospace, for titles, labels, readouts and figures,
and `--ui-body-font` for anything read as words.

| Token | Size | For |
| --- | --- | --- |
| `--ui-text-h1` | 18 | a launcher card's title (`.launcher h1`) |
| `--ui-text-h2` | 11 | a card's title, uppercase, ruled underneath |
| `--ui-text-label` | 10.5 | `.lbl` and the other small capitals: a field's label, the address's heading; a tool slot's number |
| `--ui-text-body` | 12.5 | the default, in buttons, fields and rows; a note on the table |
| `--ui-text-control` | 12 | words on a compact control: a tool grid's buttons, a row's dropdown, a level's name, a note being written |
| `--ui-text-readout` | 12 | `.readout`, figures in a column, and the address |
| `--ui-text-hint` | 11.5 | `.hint`, the secondary words under something; the legend bar, a tool slot's word, a tooltip, the figure in a small field |
| `--ui-text-meta` | 11 | `.diff` and `.tags`: a cost, a size, a tag; a row's quiet actions, a lowercase label beside a field |

**Every font size is one of these** (D-394), in a stylesheet and in a component,
which reads them through `THEME`. Three are typed on purpose, and a test names
them: a glyph sized to the box it fills — the `×` on a picture's badge, the `…`
on a card while it loads — and the sentence for a browser too old to draw
either screen, in that browser's own size and face. The brand's wordmark and
the compass's letters are part of their drawings, lettered to them.

Distances are bare numbers: *sees 12*, *7.4* (D-316).

**A key named in words is a `<kbd>`** (D-388): bold, in `--ui-font`, in
`--ui-key` — what a slot's number looks like. *Pick **Play** (3)*, *Escape puts
it down*, and the legends along the foot of both screens. A tooltip keeps its
key as a word: *— key 4*.

---

## Icons

`GameIcon` draws every icon from `GLYPHS`: 24 by 24, outlined in the current
colour, square ends. One concept has one icon on both screens (R-217a), and
`filled` fills it in the same colour, for a light that is lit.

| Icon | Means |
| --- | --- |
| `play` | the table's Play tool, and the map's |
| `walk` | a walked path on a map, and the march on foot across the world |
| `jump` | a jump on a map |
| `measure` | the Measure tool, and its ruler |
| `sphere` | a sphere area |
| `cone` | a cone area |
| `line` | a line area |
| `cube` | a cube area |
| `build` | the map's Build tool |
| `paint` | the map's Paint tool |
| `spawn` | the map's Spawn tool |
| `prefab` | the map's Prefabs tool |
| `props` | the map's Props tool |
| `select` | the world's Select tool |
| `places` | the world's Places tool |
| `height` | the world's Height tool |
| `ground` | the world's Ground tool |
| `cover` | the world's Cover tool |
| `boat` | travel by water |
| `air` | travel by air |
| `turn-ccw` | a quarter turn anticlockwise, and undo |
| `turn-cw` | a quarter turn clockwise, and redo |
| `tilt-down` | the camera towards straight down |
| `tilt-up` | the camera towards the horizon |
| `eye-open` | shown to the players |
| `eye-hidden` | hidden from them |
| `light` | a light, carried or placed: the flame by a row on stage, filled while lit |
| `move-up` | a row up the list: a note, a point of interest |
| `move-down` | a row down the list |
| `edit` | open a card or a prefab to change it |
| `back` | out to where you came from: the main menu, the world |

**No icon is a character** (D-390). The arrows, the pencil and the ticks that
stood in for these are gone, and a test reads both screens' source so they do
not come back. `×` stays: it is a delete's trigger, typography rather than an
icon, as the `✕` of ground that cannot be crossed is.

---

## Components

- **`DraftInput`**: a field that becomes an edit when it is finished with —
  Enter or leaving it — and goes back on Escape. A value it would refuse shows
  as refused and is never sent (R-163).
- **`ColourInput`**: a colour, chosen once it has held still for a moment, so
  dragging across the picker is not a stream of edits.
- **`Metrics`**: what the screen is costing, on the screen itself (R-166).
- **`SlotButton`** (R-217b): a tool or a mode. Its icon and one word, the key
  on the console, and a tooltip when the word needs more.
- **`ConfirmDelete`** (R-151): `×` arms it, a second click commits, and *Keep*
  lands where the `×` was. It hides the row's other controls while it asks;
  when that hides the name too, the answer says it — *Remove Aldra* (D-384).
  `disabled` shows the `×` greyed when there is nothing it may delete yet;
  `armed` and `onArmed` let a key open the same question (D-389).
- **`PictureInput`**: a card's picture. The badge on its corner asks before the
  picture goes, with *Keep* where the badge was.
- **`Compass`**: where north is, with turn and tilt buttons for a mouse alone.
  A click on one leaves the focus where it was.
- **`Tooltip`**: always, never a native `title` (R-110), and a test reads both
  screens for one. It opens on hover and on focus. `inPlace` wraps its child in
  no box, for a child its parent positions — the ladder's handle, a picture's
  badge (D-391).
- **`BrandLogo`**: the emblem and the name; `statusLabel` only on the console's
  menu.
- **`IconButton`** (D-390): a row's action drawn as an icon — move up, move
  down, edit. Its name is its tooltip and its accessible name, so an icon is
  never left to say what it does by itself.
- **`WithKeys`**: a line of words with keys in it — a `HelpLine` from
  `client-core`, such as the camera's legend — with each key a `<kbd>`.

---

## Patterns

**A panel** (`.card`) reads top to bottom: its title (`h2`), then a `.notice`
if something applies to the whole panel, then its controls and rows — each
repeating thing in its own well (`.member`, `.stage-list li`, `.area-list li`,
`.notes li`) — and last a `.readout`, or the button that adds a row.

**A warning** (`.warn`) is said where it applies, in the highlight: something
that will not work as the GM expects — *Pick one to place it — a click on the
map does nothing until you do.* A `.notice` is about the whole panel; a
`.warn` is about the control above it.

**Buttons, by weight:**

| Class | For |
| --- | --- |
| `button` | an action that stands alone: *Open map*, *+ Member* |
| `.on` | the chosen one of several |
| `.danger` | the second click of a delete |
| `.quiet` | an action inside a row: the eye, *Open map* |
| `.quiet.icon` | an `IconButton`: reorder, edit |
| `.quiet.danger-trigger` | a row's `×` |
| `.plain` | text with no frame |

**Adding:** a full-width *+ Noun* button under the list when a new one needs
several fields; a field and an *Add* button in a row when a name is enough.

**Deleting:** every delete button asks (R-151, D-384) — a row's `×`, or a named
word in a footer (*Delete*, *Forget*, *Remove*) in a `.row.asks` — and so does a
key: Backspace on a prop opens its *Remove*, and a second Backspace or Enter
answers it, Escape keeps (D-389).

**Showing and hiding:** `eye-open` and `eye-hidden`, never characters.

**A name keeps its width:** a row with a name field holds the name and its
picture or chip alone; numbers and actions go on the line under it.

**Scrollbars are hidden**, on purpose (D-383): a column keeps its width, and the
wheel still scrolls it.

**The dock scrolls, not the panels in it** (D-392). Everyone on stage and every
area are shown whole, and the dock scrolls them; only a catalogue that is
searched — the tokens, the prefabs — scrolls in its own panel. Both docks run
to the foot of the screen, or on the world to just above the bar under them:
the hints on the left, the address on the right.

**A row that reads from the left says so**: a button centres what it holds
(`base.css`), so a flex rule with `text-align: left` gives its own
`justify-content` (D-392). A test holds the stylesheets to both.

---

## Browsers

Chrome or Edge 111, Safari 16.2, Firefox 121, or newer (D-386). An older one
sees a sentence saying so instead of half a screen.

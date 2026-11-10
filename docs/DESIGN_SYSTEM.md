# Design system

How the two screens look, and where each part of that lives. The rules are
R-217 to R-217c in [ARCHITECTURE.md](ARCHITECTURE.md); the reasons are D-381,
D-383, D-386, D-387 and D-388.

**To see it, start the host and open `/gm/gallery.html`.** Every part below is
drawn there by the real components with the real stylesheets, and three
pickers re-colour the page, which is all re-theming is. Nothing on that page is
a copy, so it cannot show a look the screens do not have.

---

## Where things live

| File | What it holds |
| --- | --- |
| `packages/theme/tokens.css` | every colour, size and font, as a custom property |
| `packages/theme/base.css` | the rules both screens share |
| `apps/gm/src/shell/shell.css`, `apps/table/src/shell/shell.css` | each screen's own rules, after those two |
| `packages/ui/src/theme/index.ts` | `THEME`: the tokens as `@tt/ui`'s inline styles read them, one fallback each |
| `packages/ui/src/game-icon/index.tsx` | `GLYPHS`: every icon, as data |
| `apps/gm/src/gallery/main.tsx` | the gallery |

A value is written once, in `tokens.css`. This page names tokens and says what
they are for; it does not repeat their values, which is how a copy drifts.

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
printed card (`CARD_STOCK`), and the favicons, which cannot read the theme.

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
| `--ui-text-label` | 10.5 | `.lbl`, a field's label, uppercase |
| `--ui-text-body` | 12.5 | the default, in buttons, fields and rows |
| `--ui-text-readout` | 12 | `.readout`, figures in a column |
| `--ui-text-hint` | 11.5 | `.hint`, the secondary words under something |
| `--ui-text-meta` | 11 | `.diff` and `.tags`: a cost, a size, a tag |

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

The arrows that reorder a list (↑ ↓) and the edit mark (✎) are still
characters.

---

## Components

- **`SlotButton`** (R-217b): a tool or a mode. Its icon and one word, the key
  on the console, and a tooltip when the word needs more.
- **`ConfirmDelete`** (R-151): `×` arms it, a second click commits, and *Keep*
  lands where the `×` was. It hides the row's other controls while it asks;
  when that hides the name too, the answer says it — *Remove Aldra* (D-384).
  `disabled` shows the `×` greyed when there is nothing it may delete yet.
- **`PictureInput`**: a card's picture. The badge on its corner asks before the
  picture goes, with *Keep* where the badge was.
- **`Compass`**: where north is, with turn and tilt buttons for a mouse alone.
  A click on one leaves the focus where it was.
- **`Tooltip`**: always, never a native `title`. It opens on hover and on focus.
- **`BrandLogo`**: the emblem and the name; `statusLabel` only on the console's
  menu.
- **`WithKeys`**: a line of words with keys in it — a `HelpLine` from
  `client-core`, such as the camera's legend — with each key a `<kbd>`.

---

## Patterns

**A panel** (`.card`) reads top to bottom: its title (`h2`), then a `.notice`
if something applies to the whole panel, then its controls and rows — each
repeating thing in its own well (`.member`, `.stage-list li`, `.area-list li`,
`.notes li`) — and last a `.readout`, or the button that adds a row.

**Buttons, by weight:**

| Class | For |
| --- | --- |
| `button` | an action that stands alone: *Open map*, *+ Member* |
| `.on` | the chosen one of several |
| `.danger` | the second click of a delete |
| `.quiet` | an action inside a row: reorder, the eye, edit |
| `.quiet.danger-trigger` | a row's `×` |
| `.plain` | text with no frame |

**Adding:** a full-width *+ Noun* button under the list when a new one needs
several fields; a field and an *Add* button in a row when a name is enough.

**Deleting:** every delete button asks (R-151, D-384) — a row's `×`, or a named
word in a footer (*Delete*, *Forget*, *Remove*) in a `.row.asks`.

**Showing and hiding:** `eye-open` and `eye-hidden`, never characters.

**A name keeps its width:** a row with a name field holds the name and its
picture or chip alone; numbers and actions go on the line under it.

**Scrollbars are hidden**, on purpose (D-383): a column keeps its width, and the
wheel still scrolls it.

---

## Browsers

Chrome or Edge 111, Safari 16.2, Firefox 121, or newer (D-386). An older one
sees a sentence saying so instead of half a screen.

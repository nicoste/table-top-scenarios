# Design System & Component Reference

This document defines the visual language, master colour tokens, geometry grid, and reusable component patterns across both screens (`apps/gm` and `apps/table`) and `@tt/ui` (R-217, D-381).

For a live, interactive visual catalogue where every component and icon can be inspected, re-themed in real time, and copied from clean markup, open **[`docs/ui-gallery.html`](ui-gallery.html)** directly in any browser.

---

## 1. Core Principles

1. **Squared Voxel / Chiseled Game HUD (D-381).** Both screens frame a 3D world of stepped voxel blocks and 16×16 mosaic standees. The HUD matches that physical craft: squared `2px` corners (`--ui-radius`), `2px` chiseled borders, inset top/bottom bevels, and crisp tabular numerals.
2. **Screen-Specific Input Ergonomics (R-155, R-217).**
   - **Table display (`/table/`):** Operable **100% by mouse** (left-click, right-click, scroll wheel) with no keyboard at the table. Every camera orbit/tilt action and tool switch has an explicit on-screen mouse target.
   - **GM console (`/gm/`):** Built for **keyboard + mouse** efficiency. Primary tool slots display their `1–7` number hotkey in the top-left corner while keeping full mouse parity.
3. **Rule-Agnostic Visuals (R-1, R-2).** Icons and controls represent physical, spatial concepts (walk, jump, measure, sphere, cone, line, cube, terrain, light, sight) and never encode RPG rules, hit points, dice, or system-specific stats.
4. **Inline-Styled Primitives in `@tt/ui` (R-111).** `@tt/ui` exports no CSS file. Its components style themselves inline using `var(--ui-*, fallback)` custom properties so they automatically inherit the host app's theme tokens while remaining self-contained in tests.

---

## 2. Global Master Colour Tokens

Every surface, border, slot bevel, hover state, and active highlight in `apps/gm/src/shell/shell.css`, `apps/table/src/shell/shell.css`, and `@tt/ui` derives from **five master colour tokens** declared on `:root` via `color-mix(in srgb, ...)`. Changing `--ui-main` or `--ui-highlight` re-themes the entire application globally without touching individual component rules.

| Master Token | Default | Role |
|---|---|---|
| `--ui-main` | `#171b22` | Base stone/slate surface colour for cards, slots, and inputs |
| `--ui-highlight` | `#f2b84b` | Active tool selection, focus rings, hotkey badges, slider draggers |
| `--ui-ink` | `#e6e8ec` | Primary text and monochrome SVG icon stroke (`currentColor`) |
| `--ui-danger` | `#e06c75` | Destructive actions, errors, blocked lines, enemy accents |
| `--ui-ok` | `#6bc46d` | Connected status, clear sight lines, valid confirmations |

### Derived Surface & Border Tokens

```css
:root {
  --ui-main: #171b22;
  --ui-highlight: #f2b84b;
  --ui-ink: #e6e8ec;
  --ui-danger: #e06c75;
  --ui-ok: #6bc46d;

  --ui-radius: 2px;
  --ui-control-h: 28px;
  --ui-control-sm: 22px;
  --ui-slot-h: 54px;
  --ui-font: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;

  --ui-panel-bg: color-mix(in srgb, var(--ui-main) 92%, black);
  --ui-panel-border: color-mix(in srgb, var(--ui-main) 58%, var(--ui-ink));
  --ui-panel-bevel:
    inset 0 2px 0 color-mix(in srgb, var(--ui-ink) 8%, transparent),
    inset 0 -2px 0 rgba(0, 0, 0, 0.55),
    0 6px 18px rgba(0, 0, 0, 0.55);

  --ui-slot-bg: color-mix(in srgb, var(--ui-main) 78%, black);
  --ui-slot-hover: color-mix(in srgb, var(--ui-main) 80%, var(--ui-ink));
  --ui-slot-border: color-mix(in srgb, var(--ui-main) 66%, var(--ui-ink));
  --ui-slot-bevel:
    inset 0 2px 0 color-mix(in srgb, var(--ui-ink) 10%, transparent),
    inset 0 -2px 0 rgba(0, 0, 0, 0.5);

  --ui-active-bg: color-mix(in srgb, var(--ui-highlight) 22%, var(--ui-main));
  --ui-active-border: var(--ui-highlight);
  --ui-active-bevel:
    inset 0 2px 0 color-mix(in srgb, var(--ui-highlight) 45%, white),
    inset 0 -2px 0 color-mix(in srgb, var(--ui-highlight) 45%, black);

  --ui-muted: color-mix(in srgb, var(--ui-ink) 58%, var(--ui-main));
}
```

---

## 3. Geometry, Scrollbars & Control Height Grid

To prevent visual drift across panels, all interactive elements snap to a strict geometry and height scale:

| Token / Rule | Value | Applies To |
|---|---|---|
| `--ui-radius` | `2px` | Every card, slot, button, input, select, swatch, slider thumb, ladder grip, dialog, and badge. **Never** use circular (`50%`, `999px`) or large rounded (`6px–12px`) radii on UI controls. |
| `--ui-control-h` | `28px` | Standard interactive row height: `button`, `input` (text/number/color), `select`, `.chip-button`, `.swatches li`, `.stage-row`, and `.area-row`. Controls placed side-by-side in a `.row` align flush at `28px`. |
| `--ui-control-sm` | `22px` | Compact inline sub-controls: `button.plain`, `button.quiet`, `.picture-clear`, and `.badge` pills. |
| `--ui-slot-h` | `54px` | Primary action slots (`<SlotButton>`), minimum width `56px`, arranged in `.slot-row` (`gap: 6px`). |
| Scrollbars (`.dock` & Inner Lists) | Hidden (`scrollbar-width: none`) | Both floating `.dock` columns and inner scrollable lists (`.library-list`, `.stage-list`, `.area-list`) hide browser scrollbar tracks (`::-webkit-scrollbar { display: none; }`) while keeping wheel/trackpad scrolling active. This prevents scrollbars from eating horizontal width or shifting panel dimensions. |

---

## 3b. Typography & Text Hierarchy

Every piece of text—headings, field labels, body copy, numeric readouts, and hints—follows seven standardized roles:

| Element / Class | Token & Size | Font & Weight | Style & Usage Rules |
|---|---|---|---|
| `h1` (`.launcher h1`) | `--ui-text-h1` (`18px`) | `700` `--ui-font` (monospace) | Uppercase, `letter-spacing: 0.04em`, `color: var(--ink)`. Top-level screen/modal title only. |
| `.card h2` | `--ui-text-h2` (`11px`) | `700` `--ui-font` (monospace) | Uppercase, `letter-spacing: 0.08em`, `color: var(--dim)`, `margin: 0 0 8px`. Card title and intra-card section divider (`.card * + h2` automatically adds `border-top: 1px solid var(--edge)` and top spacing). |
| `.lbl` | `--ui-text-label` (`10.5px`) | `700` `--ui-font` (monospace) | Uppercase, `letter-spacing: 0.06em`, `color: var(--dim)`, `margin: 8px 0 4px` (`0` when inline in `.row`). Used for field/control labels (`Hour`, `Sun`, `Paint`). Right-aligned live values inside a label use `.lbl .hour` (`color: var(--ink)`, `tabular-nums`). |
| Body / `.nm` | `--ui-text-body` (`12.5px`) | `400` / `600` `--ui-body-font` | Line-height `1.45`, `color: var(--ink)`. Default text inside buttons, inputs, selects, list names (`.nm`), and read-only notes (`.notes-read li`). `600` weight when active/selected or in `.chosen`. |
| `.readout` | `--ui-text-readout` (`12px`) | `600` `--ui-font` (monospace) | `font-variant-numeric: tabular-nums`, `color: var(--ink)`, top rule (`border-top: 1px solid var(--edge)`). Used for live spatial/measurement/journey readouts. |
| `.hint` | `--ui-text-hint` (`11.5px`) | `400` `--ui-body-font` | Line-height `1.45`, `color: var(--dim)`, `margin: 8px 0 0`. Secondary guidance and empty states; `<b>`/`<strong>` inside `.hint` highlights key terms in `var(--ink)`. |
| `.diff` / `.tags` | `--ui-text-meta` (`11px`) | `500` `--ui-font` (monospace) | `font-variant-numeric: tabular-nums`, `color: var(--dim)`. Movement cost badges (`×2`), prefab dimensions (`8 × 8 × 6`), and library tags. |

---

## 4. Canonical Icon Registry (`<GameIcon>`)

`packages/ui/src/game-icon/index.tsx` is the single source of truth for icons across both screens (R-217):
- **Format:** `24×24` SVG viewBox, `fill="none"`, `stroke="currentColor"`, `strokeLinecap="square"`, `strokeLinejoin="miter"`.
- **No decorative clutter:** Zero emojis, zero multi-colour fills, and no photorealistic shading.
- **Strict semantic reuse:** One concept uses one canonical glyph everywhere. Never invent a second icon for the same action.

| `GameIconName` | Canonical Meaning & Reuse Across Screens |
|---|---|
| `play` | Table **Play** tool (select & move party tokens) |
| `walk` | **Shared:** Map **Ground** path mode *and* World **Travel** (foot march) |
| `jump` | Map **Jump** path mode (arc across gaps/ledges) |
| `measure` | **Shared:** Primary **Measure** tool *and* **Ruler** point-to-point mode |
| `sphere` | Measure **Sphere** area of effect |
| `cone` | Measure **Cone** area of effect |
| `line` | Measure **Line** area of effect |
| `cube` | Measure **Cube** area of effect |
| `build` | GM Map **Build** tool (stack/carve voxel blocks) |
| `paint` | GM Map **Paint** tool (surface material) |
| `spawn` | GM Map **Spawn** tool (party entry cell) |
| `prefab` | GM Map **Prefab** tool (stamp/capture structures) |
| `props` | GM Map **Props** tool (doors, windows, stairs, furniture, lights) |
| `select` | GM World **Select** tool (inspect hex) |
| `places` | GM World **Places** tool (place/select POIs) |
| `height` | GM World **Height** tool (raise/lower terrain) |
| `ground` | GM World **Ground** tool (paint terrain biome) |
| `cover` | GM World **Cover** tool (paint woods/scrub cover) |
| `boat` | World **Boat** travel mode |
| `air` | World **Air** travel mode |
| `turn-ccw` | Compass orbit 90° counter-clockwise |
| `turn-cw` | Compass orbit 90° clockwise |
| `tilt-down` | Compass step camera pitch toward top-down |
| `tilt-up` | Compass step camera pitch toward low-angle |
| `eye-open` | Visibility toggle: revealed / visible to table |
| `eye-hidden` | Visibility toggle: hidden from table |
| `light` | Stage / prop light emitter indicator |

---

## 5. Component Catalogue & Usage Rules

### 5.1 Action Slots (`<SlotButton>`)
Defined in `packages/ui/src/slot-button/index.tsx`. Used for all primary toolbars (World tools `1–6`, Map tools `1–7`, Table tools) and sub-mode selectors (Path `Ground`/`Jump`, Measure `Ruler`/`Sphere`/`Cone`/`Line`/`Cube`).
- Always shows **Icon + 1-word Label**.
- Pass `hotkey="1"` on the GM console so the top-left shortcut badge renders automatically.
- Pass `tip="..."` (`side="bottom"`) when a brief gesture hint is needed instead of adding static `.hint` paragraphs to the panel.

```tsx
<div className="slot-row">
  <SlotButton
    icon="walk"
    label="Ground"
    active={moveMode === 'walk'}
    tip="Walk along the ground around obstacles"
    onClick={() => setMoveMode('walk')}
  />
</div>
```

### 5.2 Standard Controls (`--ui-control-h: 28px`)
Defined in `apps/gm/src/shell/shell.css` and `apps/table/src/shell/shell.css`.
- **Buttons:** `<button>` (`28px` height, chiseled border, `--ui-radius`). Modifiers: `.active` (amber highlight frame), `.danger` (crimson frame/text), `.plain` (`22px` compact borderless sub-action).
- **Inputs & Selects:** `<DraftTextInput>`, `<DraftNumberInput>`, `<select>`, and `<ColourInput>` (`input[type="color"]`) all lock to `height: var(--ui-control-h)` (`28px`) and `border-radius: var(--ui-radius)`.
- **Chip / Swatch Buttons (`.chip-button`):** Square `28×28px` chiseled button holding a `.chip` colour swatch (`14×14px`, `border-radius: var(--ui-radius)`) or a `16px` `<GameIcon>`.

### 5.3 Sliders (`.dial`)
Range inputs (`<input type="range" className="dial" />`) use a recessed `6px` chiseled track (`--ui-slot-bg` with `1px solid var(--ui-slot-border)`) and a **squared voxel dragger** (`10×18px`, `border-radius: var(--ui-radius)`, `background: var(--ui-highlight)`, `2px` dark inner border + `1px` outer slot outline) on both WebKit and Firefox.

### 5.4 Level Ladder (`.ladder`)
The vertical elevation rail (`.ladder`) uses a squared chiseled track with squared voxel level ticks (`.mark`, `.pick`) and a squared voxel draggable handle (`.grip`, `15×15px`, `border-radius: var(--ui-radius)`).

### 5.5 Compass (`<Compass>`)
Defined in `packages/ui/src/compass/index.tsx`. Uses `box-sizing: content-box` on its `64×64` chiseled frame so the `64×64` SVG dial sits symmetrically inside the `2px` border, with `dominantBaseline="central"` on cardinal letters (`N`, `E`, `S`, `W`). When `onTurn` and `onTilt` are provided, clickable `turn-ccw`/`turn-cw` and `tilt-down`/`tilt-up` buttons flank the dial.

### 5.6 Material Palettes & Variation Swatches (`.palette` & `.swatches`)
- Active rows (`.palette button.on` and `.swatches li.on`) use the standard chiseled active surface (`--ui-slot-active-bg`, `2px solid var(--ui-slot-active-border)`, `--ui-slot-active-ink`, `--ui-slot-active-shadow`) rather than solid neon fills.
- Material variation squares (`.swatches .cut`) are strict `18×18px` squares (`border-radius: var(--ui-radius)`). The active variation (`.swatches .cut.lit`) uses a squared chiseled border (`border-color: var(--ui-highlight); box-shadow: 0 0 0 1px #000, inset 0 0 0 1px #fff;`) with `outline: none` so it never bleeds outside the row.

### 5.7 Brand Identity & Main Menu Diorama (`<BrandLogo>` & `useDiorama`, D-382)
- **Brand Emblem & Lockup (`<BrandLogo>` in `packages/ui/src/brand-logo/index.tsx`):** Pairs a `48×48px` squared chiseled voxel SVG emblem (floating isometric island, winding `--ui-highlight` road, and watchtower keep with glowing beacon) with a two-tier `<h1>` wordmark (`TABLE TOP` in `18px` `--ui-ink` + `SCENARIOS` in `12px` `--ui-highlight`), optional role eyebrow (`GM Console` / `Table Display`), and tabular status badge (`Step N/10` / `Undo N/10`).
- **Browser Tab Identity:** `apps/gm/index.html` and `apps/table/index.html` carry matching inline SVG voxel favicons and explicit titles (`Table Top Scenarios — GM Console` and `Table Top Scenarios — Table Display`).
- **Living 10-Step Isometric Diorama (`useDiorama` in `packages/client-core/src/diorama/index.ts`):** While no campaign is open (`!campaign`), the background WebGL `Stage` frames a `16×16` floating isometric terrain on the right-centre of the viewport while the translucent `.launcher .card` anchors on the left (`justify-content: flex-start`), stepping `1 → 2 → … → 10` (`build`) and `10 → 9 → … → 1` (`undo`) in a continuous loop accompanied by a 10-pip progress strip (`.diorama-status`).

---

## 6. Panel Anatomy & Section Zoning

Every `.card` panel is divided into explicit visual zones so controls, list items, and notes never blur together:

1. **Zone 1 — Card Header (`.card h2`):** Uppercase monospace title (`11px`, `--dim`) with a bottom divider rule (`border-bottom: 1px solid color-mix(in srgb, var(--edge) 65%, transparent)`).
2. **Zone 2 — Context / Callout Banner (`.notice`, `.warn`):** Self-contained chiseled callout box (`padding: 8px`, tinted background + border) used when a state or warning applies to the panel (e.g. *"Table is inside Tollkeep"*). When the callout includes actions (`Open map` / `Bring out`), those buttons live **inside** the `.notice` container.
3. **Zone 3 — Segmented Switches & Recessed Item Wells:**
   - **Segmented Switches (`.reveal`):** Uses `display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 5px;` so buttons wrapped in `<Tooltip>` always stretch evenly across 100% of the card width (`Together` / `Separated`, `Place` / `Capture`, `Known` / `Unknown`).
   - **Recessed Item Wells (`.member`, `.stage-list li`, `.area-list li`, `.notes li`):** Every repeating entity block (a party member, an on-stage actor, a measured area, a place note/POI) sits inside its own recessed well (`background: color-mix(in srgb, var(--ui-main) 72%, #000); border: 1px solid color-mix(in srgb, var(--edge) 70%, transparent); padding: 6px;`).
   - **Recessed Note Box (`.stage-note-line`):** Single-entity GM notes (`<GmNote>`) inside an item well render in a unified solid recessed input box (`border: 1px solid color-mix(in srgb, var(--edge) 65%, transparent); background: color-mix(in srgb, var(--ui-main) 52%, #000)`) whether written or empty (`D-314`). Empty state changes only text colour to `var(--dim)` (`Add a note`, never dashed or italic), matching `<input>::placeholder`.
4. **Zone 4 — Footer Actions & Readouts (`.readout`, `.hint`, `.btn-grid .wide`):** Bottom summary readout or full-width primary creation button (`+ Member`, `+ New token`).

---

## 7. Button & `×` Action Hierarchy (Framed vs. Quiet vs. Corner Badge)

To prevent ambiguity when multiple actions appear in the same panel:

| Variant | Class / Selector | Appearance | When to Use |
|---|---|---|---|
| **Framed Button** | `<button>`, `<button class="on">`, `<button class="danger">` | `28px` height (`--ui-control-h`), `2px` chiseled border, `--ui-slot-bg` surface | Standalone or primary/secondary panel actions (`Open map`, `Bring out`, `Together`, `+ Member`, `+ New token`, `Save`, `Done`). |
| **Quiet Row Action (Neutral)** | `<button class="quiet">` | `28×28px` (or `22px` in compact rows), transparent at rest; reveals neutral `--ui-slot-hover-bg` on hover | Non-destructive row actions inside an item well (`Keep`, `✎` edit entry, `↑`/`↓` reorder, `eye-open`/`eye-hidden`, `flame`, `Open map`). |
| **Quiet Destructive Trigger** | `<button class="quiet danger-trigger">` | Transparent at rest; reveals crimson `--ui-danger` tint on hover | Destructive row or section triggers (`×` remove member/token/area/note, `Delete`, `Forget`, `Remove`). |
| **Corner Media Clear** | `<button class="plain picture-clear">` | `14×14px` squared badge anchored at `top: -4px; right: -4px` on `.picture-card`, hidden at rest (`opacity: 0`) and revealed on `.picture-input:hover` | Clearing an attached image on a `<PictureInput>` thumbnail. Hidden at rest so it never covers the character portrait, and revealed on hover right on the thumbnail's corner. |

---

## 8. Cross-Panel Interaction Rules (One Action, One Pattern)

Whenever the same functional concept appears in multiple panels, it must use the same component and visual pattern:

1. **Notes — Single Scratchpad (`<GmNote>`) vs. Multi-Item Lore List (`PlaceInspector`):**
   - **Single Private Scratchpad (`<GmNote>`):** Used on entities that hold a single `0..1` private GM string (`Party` members, `On stage` silver tokens, `Props`). Renders as a solid recessed `.stage-note-line` box (`Add a note` in `--dim` when empty; note text in `--ink` when populated, `D-314`) that opens an in-place `<textarea>` on click.
   - **Multi-Item Revealable Collection (`PlaceInspector` `.notes`):** Used on World Places that hold an ordered `0..N` array of individually revealable lore paragraphs. Existing notes render as recessed `.notes li` cards with `<DraftInput multiline>`, `.eye` visibility toggle, `↑`/`↓` reorder, and `<ConfirmDelete>`; appending a new note uses the standard Quick-Add Row (`[Input "Add a note"] [Add]`).
2. **Creating / Adding Items to a List (2 Canonical Patterns):**
   - **Full-Width Spawn / Editor Trigger (`<div class="btn-grid"><button class="wide">+ Noun</button></div>`):** Used when creating an item either spawns a multi-field card immediately (`+ Member` in `PartyPanel`) or opens a multi-field editor sub-view (`+ New token` in `LibraryPanel`). Always spans 100% of the card width at the bottom of the list.
   - **Inline Quick-Add Row (`<div class="row"><input placeholder="..." /><button>Add|Create</button></div>`):** Used when creating an item only requires typing a name (and optional coordinate): `PlaceInspector` (`Add a note`, `Add a point of interest`), `LevelLadder` (`Level name` + `y`), and `Launcher` (`Campaign name`). All placeholders use Sentence case.
3. **Destructive & Reset Actions (`<ConfirmDelete>`, `R-151`):**
   - Every affordance that destroys authored content or wipes play memory asks first using `<ConfirmDelete>` (`packages/ui/src/confirm-delete/index.tsx`).
   - **Row-Item Deletion:** Uses default `triggerLabel="×"` (`PartyPanel` members, `OnStagePanel` silver tokens, `PlaceInspector` notes & POIs, `LevelLadder` planes), arming `[Delete/Remove] [Keep]` in place.
   - **Named Section / Footer Deletion or Reset:** Uses explicit `triggerLabel` (`triggerLabel="Delete"` in `PlaceInspector` footer, `triggerLabel="Forget"` in `MapPanel` fog-memory reset) so `×` is never misused next to a prose sentence.
4. **Visibility & Sight Toggles (`.reveal` & `.quiet.eye`):**
   - Every visibility or sight-preview toggle uses `<GameIcon name={on ? 'eye-open' : 'eye-hidden'} />` — never raw Unicode symbols (`◐`/`○`).
   - Card-wide toggles (`PlaceInspector` Revealed/Hidden, `ChunkInspector` Known/Unknown, `MapPanel` Party's view) use framed full-width buttons; row-level toggles (`PlaceInspector` notes/POIs, `OnStagePanel` tokens, `MeasurePanel` areas) use `button.quiet.eye` with `.off` (`color: var(--dim)`).
5. **Rotation & History Actions (`turn-ccw` / `turn-cw`):**
   - Every quarter-turn or undo/redo button across `<Compass>`, `PrefabsPanel`, `PropsPanel`, and the Campaign header (`Undo`/`Redo`) uses `<GameIcon name="turn-ccw" />` and `<GameIcon name="turn-cw" />`.
6. **1-Line Text Field Width ("Full or Near-Full Row for Editable Names"):**
   - A 1-line text input or clickable name button (`<DraftInput>`, `.stage-name`, `.stage-note-line`) must never share a row with multiple secondary numeric inputs or action buttons that squeeze the name into an unreadable stub (`"Gobli"`, `"Tu..."`).
   - In multi-control entity cards (`OnStagePanel` `.stage-list li`, `MeasurePanel` / `TableTools` `.area-list li`, `PlaceInspector` `.notes li`), **Row 1 (Identity Row)** holds only the `20px` portrait card or `28px` colour chip + the **1-line Name field (`flex: 1`, ~85–90% of the row width)** so distinguishing suffixes (`Goblin Archer 1` vs `Goblin Archer 2`) remain completely readable. Secondary metrics (`ord`, `sees`, `size`, `follows`) and row actions (`flame`, `eye`, `×`) sit on **Row 2 (`.stage-controls` / `.area-follow`)**.

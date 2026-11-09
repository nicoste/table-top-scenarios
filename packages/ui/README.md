# @tt/ui

**Owns.** Presentational primitives: panels, lists, sliders, palettes, number fields, canonical monochrome icons (`GameIcon`), action slots (`SlotButton`), and the compass (`Compass`).

**Must never know about.** Any domain noun. A component here could serve a different product entirely.

**May depend on:** _nothing_

Adding a dependency here requires a numbered decision (R-7). The public surface
is `src/index.ts` only (R-6). For visual tokens, standardized heights, and the
live component catalogue, see [`docs/DESIGN_SYSTEM.md`](../../docs/DESIGN_SYSTEM.md)
and [`docs/ui-gallery.html`](../../docs/ui-gallery.html) (R-217).

# @tt/ui

**Owns.** Presentational primitives: panels, lists, sliders, palettes, number fields, canonical monochrome icons (`GameIcon`), action slots (`SlotButton`), the brand emblem and wordmark (`BrandLogo`), and the compass (`Compass`).

**Must never know about.** Any rule or state of play: a campaign, a token, what the players may see. A component here could serve a different product entirely. The product's own words for how it looks — icon names after its tools, its logo — are the exception (D-383).

**May depend on:** _nothing_

Adding a dependency here requires a numbered decision (R-7). The public surface
is `src/index.ts` only (R-6). Every colour and size a component reads comes
through `THEME` (`src/theme/`), one fallback per token, held to `@tt/theme` by a
test (D-386). Every icon is drawn from `GLYPHS`. For the tokens, the heights and
the patterns, see [`docs/DESIGN_SYSTEM.md`](../../docs/DESIGN_SYSTEM.md), and the
gallery at `/gm/gallery.html` (R-217).

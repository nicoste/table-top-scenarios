# @tt/client-core

**Owns.** Everything both browser apps need and neither should own: the WebSocket
client and reconnection, the snapshot store, the view stack (`MapRef` navigation),
and the bridge that turns a snapshot into what `@tt/render` draws.

**Must never know about.** Anything role-specific. There is no GM branch in here.
GM-only panels and secrets live in `apps/gm`, which is what keeps the table
display unable to reach them (D-008).

**May depend on:** `@tt/domain`, `@tt/geometry`, `@tt/protocol`, `@tt/render`

Adding a dependency here requires a numbered decision (R-7). The public surface
is `src/index.ts` only (R-6).

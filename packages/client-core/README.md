# @tt/client-core

**Owns.** Everything both browser apps need and neither should own: the WebSocket
client and reconnection, keeping what did not change in a view that arrives, what
a tool in hand does before anything is sent, and the handoff to the Stage that
`@tt/render` draws on.

**Must never know about.** Anything role-specific. There is no GM branch in here.
GM-only panels and secrets live in `apps/gm`, which is what keeps the table
display unable to reach them (D-008).

**May depend on:** `@tt/domain`, `@tt/geometry`, `@tt/protocol`, `@tt/render`, and
React for the two hooks that hand the Stage to a screen and measure it (`scene/`,
D-377). Everything else here is plain functions.

Adding a dependency here requires a numbered decision (R-7). The public surface
is `src/index.ts` only (R-6).

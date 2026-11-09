# @tt/client-core

**Owns.** Everything both browser apps need and neither should own: the WebSocket
client and reconnection, keeping what did not change in a view that arrives, what
a tool in hand does before anything is sent, and the handoff to the Stage that
`@tt/render` draws on.

**Must never know about.** Anything role-specific. There is no GM branch in here.
GM-only panels and secrets live in `apps/gm`, which is what keeps the table
display unable to reach them (D-008).

**May depend on:** `@tt/domain`, `@tt/geometry`, `@tt/protocol`, `@tt/render`, and
React for the hooks that hand the Stage to a screen, measure it, and drive the
opening screen's isometric terrain diorama (`scene/`, `diorama/`, D-377, D-382).
Everything else here is plain functions.

Adding a dependency here requires a numbered decision (R-7). The public surface
is `src/index.ts` only (R-6).

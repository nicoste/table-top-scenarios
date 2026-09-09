# @tt/protocol

**Owns.** The wire contract: intents, snapshots, Zod schemas, and the mappers from domain state to role-filtered views.

**Must never know about.** Transport. It defines the messages; it never sends one.

**May depend on:** `@tt/domain`

Adding a dependency here requires a numbered decision (R-7). The public surface
is `src/index.ts` only (R-6).

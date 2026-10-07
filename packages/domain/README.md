# @tt/domain

**Owns.** The nouns and their invariants: Campaign, World, Chunk, Poi, EncounterMap, Token, MapRef, ids, registries — and what the party sees in a map (sight, explored, the blocks they show), built on `geometry`'s sight lines.

**Must never know about.** I/O of any kind, and how anything is rendered or transmitted.

**May depend on:** `@tt/geometry`

Adding a dependency here requires a numbered decision (R-7). The public surface
is `src/index.ts` only (R-6).

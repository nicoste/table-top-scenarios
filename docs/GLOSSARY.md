# Glossary

Shared vocabulary. If a word appears in code, it must mean what it means here.
New concepts get an entry here *before* they get an identifier.

| Term | Meaning |
|---|---|
| **Off-tool** | Anything the people at the table resolve themselves: dice, damage, initiative, negotiation, scouting outcomes. The tool never models these. Nicolás's term, and the sharpest constraint we have. |
| **Campaign** | A named body of *authored* content: the world, its chunks, places, their points of interest, encounter maps, and asset registries. Reusable across groups and sessions. Changes only when the GM builds. |
| **Save** | The *play state* layered over a campaign: token positions, discovery flags, what the party has explored, the hour. One per campaign, autosaved (D-147). |
| **Session** | One live run: a host process with a campaign loaded, a save active, and up to two clients attached. |
| **World** | The top scale. A sparse grid of chunks. |
| **Chunk** | One world square: a 30×30 grid of terrain columns plus any places sitting on it (D-103). The unit of authoring and of world-view LOD. |
| **Column** | One chunk cell: a height and a colour. Terrain is columnar, not free voxels. |
| **Place** | One cell of the world map that the GM has named: a village, a forest, a castle. Carries a **place marker**, notes, and its points of interest. This is what the Places tool creates. |
| **Place marker** | The model drawn for a place — village, town, castle, cave. Cosmetic only (R-82); the tool attaches no meaning to the choice. |
| **Point of interest** (POI) | Something *inside* a place: a church, a market, an arena. Named, ordered by the GM, individually visible to the party. Owns **exactly one encounter map**, created with it — a point of interest without a body would be a label (R-49, R-145). |
| **Encounter map** | The playable surface. A free-form sparse voxel grid where tokens move. Minecraft-shaped, not columnar. |
| **Token** | A figure on an encounter map: a party member standing in one cube of the map the party is in, drawn as a gold base and a card in the member's colour (R-184, R-187). The GM's own figures — silver — are a later round (D-255). On the world map the party is drawn as a **pawn** instead (R-90). |
| **Party** | The player-controlled side. One side, not N players — everyone shares the table display. |
| **Party fog** | Encounter-map visibility: the union of what every party token can see. There is deliberately no per-token vision. |
| **Sight** | What the party sees *now* in the map it is in: the **cubes of space** a line from some member's eye reaches (R-41, D-271). Derived by the host after every intent, never stored (R-190). |
| **Explored** | The space the party *has* seen of a map, cumulative and kept in the save per map (R-45, D-273). The blocks touching it are what the table is sent; undo never takes it back. |
| **In sight** | R-45's *Visible* state, named so in code because "visible" already means three other things (R-84): a block touching space seen now. Drawn as lit. Explored but not in sight is greyed; never seen is not drawn. |
| **Party's view** | The console drawing the table's picture — the band and the party's fog over it — while the party is in the open map (R-76, D-274). A switch, off by default. |
| **Discovery** | World-scale knowledge. A GM-granted flag on a chunk or a place. Not geometric, not computed. |
| **GM console** | The GM's screen. Dense, authoritative, holds every secret. |
| **Table display** | The screen everyone at the table looks at. Interactive but minimal, and never receives a secret. |
| **Cell scale** | How much real-world distance one world cell represents. Feeds the travel calculator. |
| **Revealed** | The party knows a place exists. Persisted play state, GM-granted. A place reaches the table only when it is Revealed *and* its chunk is Known (R-122). |
| **`visibleToParty`** | One note, or one point of interest, may be shown to players. Persisted authored state; anything false is stripped at the boundary and never sent (R-85). |
| **Drawn** | Currently rendered, because the camera is past a zoom threshold. Never persisted, never transmitted. Do not call this "visible". |
| **Registry** | A named, append-only catalogue of assets (materials, markers, miniatures) addressed by stable string id. |

## On the words that changed

`POI` used to mean what **Place** now means, and the list inside a place used to
be called **encounters** (D-176). Both were wrong in the same way: the tool said
"Places" on screen while the code said `Poi`, and an arena is not an encounter —
it is where one happens.

So: the world map holds **places**; a place holds **points of interest**; a point
of interest will hold **encounter maps**. "Encounter" now means only the scene
you play on such a map, which is what it means at a table.

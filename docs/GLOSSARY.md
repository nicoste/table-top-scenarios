# Glossary

Shared vocabulary. If a word appears in code, it must mean what it means here.
New concepts get an entry here *before* they get an identifier.

| Term | Meaning |
|---|---|
| **Off-tool** | Anything the people at the table resolve themselves: dice, damage, initiative, negotiation, scouting outcomes. The tool never models these. Nicolás's term, and the sharpest constraint we have. |
| **Campaign** | A named body of *authored* content: the world, its chunks, POIs, encounter maps, and asset registries. Reusable across groups and sessions. Changes only when the GM builds. |
| **Save** | A snapshot of *play state* layered over a campaign: token positions, discovery flags, fog, GM notes. Many saves per campaign. |
| **Session** | One live run: a host process with a campaign loaded, a save active, and up to two clients attached. |
| **World** | The top scale. A sparse grid of chunks. |
| **Chunk** | One world square: a 20×20 grid of terrain columns plus any POIs sitting on it. The unit of authoring and of world-view LOD. |
| **Column** | One chunk cell: a height and a colour. Terrain is columnar, not free voxels. |
| **POI** | Point of Interest. A marker on a chunk (village, forest, castle) that references an encounter map. |
| **Encounter map** | The playable surface. A free-form sparse voxel grid where tokens move. Minecraft-shaped, not columnar. |
| **Token** | A figure on an encounter map. Belongs to the **party** or to the **GM**. |
| **Party** | The player-controlled side. One side, not N players — everyone shares the table display. |
| **Party fog** | Encounter-map visibility: the union of what every party token can see. There is deliberately no per-token vision. |
| **Discovery** | World-scale knowledge. A GM-granted flag on a chunk or POI. Not geometric, not computed. |
| **GM console** | The GM's screen. Dense, authoritative, holds every secret. |
| **Table display** | The screen everyone at the table looks at. Interactive but minimal, and never receives a secret. |
| **Cell scale** | How much real-world distance one world cell represents. Feeds the travel calculator. |
| **Revealed** | The party knows a POI or chunk exists. Persisted play state, GM-granted. |
| **`visibleToParty`** | A single POI note may be shown to players. Persisted authored state. |
| **Drawn** | Currently rendered, because the camera is past a zoom threshold. Never persisted, never transmitted. Do not call this "visible". |
| **Registry** | A named, append-only catalogue of assets (materials, markers, miniatures) addressed by stable string id. |

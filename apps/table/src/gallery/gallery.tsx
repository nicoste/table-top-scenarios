// The table's own parts (D-394): what only the table draws, by the table's own
// components with its own stylesheet, where the table puts them — its tools
// and the players' areas inside a map, a place's card on the world, and the
// legend along the foot. Everything both screens share is on the console's
// gallery, /gm/gallery.html. Served with the table, at /table/gallery.html; no
// campaign, no host connection.

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { MEASURE_START, TABLE_CAMERA_HINT } from '@tt/client-core';
import type { MeasureHand } from '@tt/client-core';
import { AREA_COLOURS, DEFAULT_MARKER, NO_AREAS, drawArea, editArea, removeArea } from '@tt/domain';
import { PlaceWireSchema } from '@tt/protocol';
import { THEME, WithKeys } from '@tt/ui';
import { PlaceCard } from '../features/place/index.js';
import { TableTools } from '../features/tools/index.js';

/** The master colours, as tokens.css sets them, and the console gallery's two others. */
const PRESETS = [
  { name: 'Slate & amber', main: '#181c24', highlight: '#f5a524', ink: '#e6e9ef' },
  { name: 'Obsidian & emerald', main: '#121a16', highlight: '#56d364', ink: '#e6f2ea' },
  { name: 'Deep rune & cyan', main: '#141824', highlight: '#58a6ff', ink: '#e8eef8' },
] as const;

/** Between the two docks, at the top, where the table shows nothing. */
const MIDDLE: CSSProperties = {
  position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', width: 340, zIndex: 5,
};
const ROW: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6 };
/** No screen has a link in its words yet, so the page colours its own. */
const LINK: CSSProperties = { color: THEME.highlight };

/** A place as the table receives one: the notes the party may see. */
const PLACE = PlaceWireSchema.parse({
  id: 'place_gallery', name: 'Thornwick', cell: { cx: 0, cz: 0, x: 3, z: 4 }, markerId: DEFAULT_MARKER,
  notes: [{ id: 'note_mill', text: 'The miller owes the baron three sacks.', visibleToParty: true }],
  pois: [{ id: 'poi_chapel', name: 'The chapel', visibleToParty: true }],
});

const PARTY = [{ id: 'member_aldra', name: 'Aldra' }, { id: 'member_galion', name: 'Galion' }];

const AREAS = drawArea(NO_AREAS, {
  shape: 'sphere', at: { x: 2, y: 1, z: 2 }, aim: { x: 0, y: 0, z: 0 }, size: 3, colour: AREA_COLOURS[2]!.id, byTable: true,
});

/** Inside a map, with the table's tools and areas, or on the world, with a place's card. */
export type TableGalleryPlace = 'map' | 'world';

export function TableGallery({ start = 'map' }: { readonly start?: TableGalleryPlace }) {
  const [where, setWhere] = useState<TableGalleryPlace>(start);
  const [main, setMain] = useState<string>(PRESETS[0].main);
  const [measuring, setMeasuring] = useState(true);
  const [leap, setLeap] = useState(false);
  const [hand, setHand] = useState<MeasureHand>(MEASURE_START);
  const [mine, setMine] = useState(AREAS);
  const recolour = (preset: (typeof PRESETS)[number]) => {
    setMain(preset.main);
    const root = document.documentElement.style;
    root.setProperty('--ui-main', preset.main);
    root.setProperty('--ui-highlight', preset.highlight);
    root.setProperty('--ui-ink', preset.ink);
  };

  return (
    <>
      <section className="card" style={MIDDLE}>
        <h2>The table&apos;s own parts</h2>
        <div style={ROW}>
          <button className={where === 'map' ? 'on' : ''} onClick={() => setWhere('map')}>Inside a map</button>
          <button className={where === 'world' ? 'on' : ''} onClick={() => setWhere('world')}>On the world</button>
        </div>
        <div style={{ ...ROW, marginTop: 6 }}>
          {PRESETS.map((preset) => (
            <button key={preset.name} className={main === preset.main ? 'on' : ''} onClick={() => recolour(preset)}>
              {preset.name}
            </button>
          ))}
        </div>
        <p className="hint">
          Where the table draws them, with its stylesheet. What both screens share is on{' '}
          <a href="/gm/gallery.html" style={LINK}>the console&apos;s gallery</a>.
        </p>
      </section>

      {where === 'map' ? (
        <TableTools
          measuring={measuring}
          leap={leap}
          onLeap={setLeap}
          hand={hand}
          onMove={() => setMeasuring(false)}
          onMeasure={() => setMeasuring(true)}
          onHand={setHand}
          mine={mine}
          party={PARTY}
          onEdit={(id, patch) => setMine((now) => editArea(now, id, patch))}
          onRemove={(id) => setMine((now) => removeArea(now, id))}
        />
      ) : (
        <PlaceCard place={PLACE} markerName="Village" onClose={() => setWhere('map')} />
      )}

      <div className="hints"><WithKeys line={TABLE_CAMERA_HINT} /></div>
    </>
  );
}

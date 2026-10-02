// The dock while an encounter map is open (R-148).
//
// A *replacement* for the world's palette, not an addition to it. Paint terrain,
// height, places and travel have no meaning inside a tavern, and leaving them on
// screen would offer four tools that do nothing.

import type { Intent, MapWire } from '@tt/protocol';
import type { MapTool } from '@tt/client-core';
import { CAMERA_HINT } from '@tt/client-core';
import { MAP_MAX_HEIGHT, MAP_MIN_DEPTH, BRUSHES, isFullRange, stepLabel } from '@tt/domain';
import type { LevelRange, Material } from '@tt/domain';
import { Tooltip } from '@tt/ui';
import { LevelLadder } from '../levels/index.js';

/**
 * The four directions a map can grow, in the order they are laid out: the top
 * row is the two northerly ones, the bottom row the two southerly.
 *
 * Abbreviated on the button because four two-word labels do not fit a 228px
 * dock, and spelled out in the tooltip because "SE" is only obvious once.
 */
const EXPANSIONS = [
  { towards: 'northwest', short: 'NW', long: 'north-west' },
  { towards: 'northeast', short: 'NE', long: 'north-east' },
  { towards: 'southwest', short: 'SW', long: 'south-west' },
  { towards: 'southeast', short: 'SE', long: 'south-east' },
] as const;

/** What a band's end is called: a bound, the plane there, or just its height. */
function bandName(y: number, planes: MapWire['planes']): string {
  return stepLabel(y, MAP_MAX_HEIGHT, MAP_MIN_DEPTH)
    ?? planes?.find((plane) => plane.y === y)?.name
    ?? `level ${y}`;
}

interface Props {
  /** Which point of interest's map this is — for the heading. */
  readonly placeName: string;
  readonly poiName: string;
  readonly map: MapWire;
  /** How many cubes stand in it, and how far it has been dug (R-160). */
  readonly blocks: number;
  readonly dug: number;
  readonly tool: MapTool;
  /** Which shape the brush lays down, by id (R-164). */
  readonly brush: string;
  /** Is Shift held — is the selected tool showing its other mode right now? */
  readonly shifting: boolean;
  readonly materials: readonly Material[];
  readonly materialId: string;
  readonly hoverLabel: string | null;
  /** Is the party standing in *this* map (R-158)? */
  readonly partyHere: boolean;
  /** Can they see it at all — Revealed, chunk Known, point of interest shown? */
  readonly partyCanSee: boolean;
  /** The band this map is cut to. Always present — an uncut map is its whole body. */
  readonly range: LevelRange;
  /** Is the console showing only the band, like the table (R-159)? */
  readonly levelling: boolean;
  onLevelling: (on: boolean) => void;
  onTool: (tool: MapTool) => void;
  onBrush: (brushId: string) => void;
  onMaterial: (id: string) => void;
  onLeave: () => void;
  dispatch: (intent: Intent) => void;
  readonly placeId: string;
  readonly poiId: string;
}

export function MapPanel({
  placeName, poiName, map, blocks, dug, tool, brush, shifting, materials, materialId, hoverLabel,
  partyHere, partyCanSee, range, levelling, onLevelling,
  onTool, onBrush, onMaterial, onLeave, dispatch, placeId, poiId,
}: Props) {
  return (
    <>
      <div className="card">
        <h2>{poiName}</h2>
        <p className="hint" style={{ margin: '0 0 8px' }}>in {placeName}</p>
        <div className="btn-grid campaign-actions">
          <Tooltip label="Back to the world map" placement="bottom" stretch>
            <button className="wide" onClick={onLeave}>← Back to the world</button>
          </Tooltip>
        </div>
      </div>

      <div className="card">
        <h2>The party</h2>
        {partyHere ? (
          <>
            <p className="hint" style={{ margin: '0 0 8px' }}>
              They are in here. The table is showing them{' '}
              {isFullRange(range, MAP_MAX_HEIGHT, MAP_MIN_DEPTH)
                ? 'the whole place'
                : `${bandName(range.lower, map.planes)} to ${bandName(range.upper, map.planes)}`}.
            </p>
            <div className="btn-grid campaign-actions">
              <Tooltip label="Send the party back out to the world map" placement="bottom" stretch>
                <button className="wide" onClick={() => dispatch({ kind: 'leaveMap' })}>
                  Bring them out
                </button>
              </Tooltip>
            </div>
          </>
        ) : (
          <>
            {/* Opening a map takes the party in when it can (R-158). When it
                cannot, the console is simply looking — which is what lets a GM
                build a tavern the party has not found yet. */}
            <p className="hint" style={{ margin: '0 0 8px' }}>
              {partyCanSee
                ? 'They are elsewhere. The table is not being shown this map.'
                : 'They cannot see this place yet, so they cannot be brought in. Reveal it first.'}
            </p>
            <div className="btn-grid campaign-actions">
              <Tooltip
                label={partyCanSee
                  ? 'Put the party in this map — the table follows'
                  : 'Reveal the place and show the point of interest first'}
                placement="bottom"
                stretch
              >
                <button
                  className="wide"
                  disabled={!partyCanSee}
                  onClick={() => dispatch({ kind: 'enterMap', placeId, poiId })}
                >
                  Take the party in
                </button>
              </Tooltip>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2>Tool</h2>
        {/*
          Two tools, because there are two ideas: add or remove matter, and
          change the colour of matter that is already there (R-162). Erase and
          fill were tools of their own and are modes of these two now — you
          alternate between build and erase constantly, and reaching for a
          different button each time was the tax.
        */}
        <div className="btn-grid tools">
          <Tooltip
            label="Add blocks against the face you click, or hold ⇧ shift to erase — key 1"
            placement="bottom"
            stretch
          >
            <button className={tool === 'build' ? 'on' : ''} onClick={() => onTool('build')}>
              {tool === 'build' && shifting ? '⌫ Erase' : '▣ Build'}
            </button>
          </Tooltip>
          <Tooltip
            label="Repaint blocks without moving them, or hold ⇧ shift to fill — key 2"
            placement="bottom"
            stretch
          >
            <button className={tool === 'paint' ? 'on' : ''} onClick={() => onTool('paint')}>
              {tool === 'paint' && shifting ? '◍ Fill' : '✏ Paint'}
            </button>
          </Tooltip>
        </div>

        {/*
          Five named shapes, three flat and two upright (R-164). The flats come
          first and fill the row, so the two groups read as two groups — and
          the outline is the real label, since it takes the shape before the
          click.
        */}
        <p className="lbl" style={{ margin: '8px 0 4px' }}>Brush</p>
        <div className="btn-grid brush">
          {BRUSHES.map((shape, i) => (
            <Tooltip
              key={shape.id}
              label={`${shape.rise > 1
                ? `A column ${shape.rise} blocks tall, growing up — or down while ⌥ alt is held`
                : shape.span > 1 ? `A flat ${shape.span}×${shape.span} square` : 'One cube'
              } — key ${['6', '7', '8', '9', '0'][i]}`}
              placement="bottom"
              stretch
            >
              <button className={brush === shape.id ? 'on' : ''} onClick={() => onBrush(shape.id)}>
                {shape.name}
              </button>
            </Tooltip>
          ))}
        </div>

        <p className="hint">
          {tool === 'build' && (
            <>
              Click a block&apos;s face; the new ones land against it in the shape of the
              brush. Blocks already standing are skipped, never overwritten. Hold
              <b>⇧ shift</b> to <b>erase</b> instead — the outline turns red. Hold
              <b>⌥ alt</b> to build <b>under</b> the cube — the only way down, since a
              camera above the horizon never sees an underside — and a column sinks a
              shaft instead of raising a wall.
            </>
          )}
          {/* Paint is the one mode that drags, because it does not move its own
              target the way building and erasing do (R-153). */}
          {tool === 'paint' && (
            <>
              Click a block to repaint it, or drag the brush across several. Nothing moves.
              Hold <b>⇧ shift</b> to <b>fill</b>: everything joined to the block you click,
              of the same material, is repainted. The readout says how many.
            </>
          )}
        </p>
        <p className="readout">{hoverLabel ?? '—'}</p>
        <p className="hint">1–2 tool · 6–0 or [ ] brush · {CAMERA_HINT} · Esc leaves</p>
      </div>

      {(
        <div className="card">
          <h2>Material</h2>
          <ul className="palette">
            {materials.map((material) => (
              <li key={material.id}>
                <button
                  className={material.id === materialId ? 'on' : ''}
                  onClick={() => onMaterial(material.id)}
                >
                  <span className="chip" style={{ background: material.colour }} />
                  <span className="nm">{material.name}</span>
                  {/* Said out loud at a table, and the reason it is a material
                      property rather than a block one (R-75). */}
                  {!material.blocksSight && <span className="diff">see-through</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        Levels (R-146, R-161). The plane list and the band are one control
        because they are one idea: the heights the GM named, and which of the
        bands between them the table is being shown.
      */}
      <div className="card">
        <h2>Levels</h2>
        <LevelLadder
          map={map}
          range={range}
          placeId={placeId}
          poiId={poiId}
          dispatch={dispatch}
        />

        {/*
          The toggle (R-159). Two views of one body: everything, or the band the
          table gets. Not a dimming — while it is on, the levels outside the
          band are *absent*, which is what stops the GM editing a block they
          cannot see (D-202).
        */}
        <div className="btn-grid tools" style={{ marginTop: 6 }}>
          <Tooltip
            label={levelling
              ? 'Show the whole body again'
              : 'Show only the band — what the table gets, and nothing else'}
            placement="bottom"
            stretch
          >
            <button
              className={`wide${levelling ? ' on' : ''}`}
              aria-pressed={levelling}
              onClick={() => onLevelling(!levelling)}
            >
              {levelling ? '◧ Showing the band' : '▦ Showing everything'}
            </button>
          </Tooltip>
        </div>
        <p className="hint">
          {levelling
            ? 'Only the band is drawn, so nothing outside it can be clicked by mistake.'
            : partyHere
              ? 'You see the whole place; the table sees the band.'
              : 'You see the whole place. The band is what the table gets when the party comes in.'}
        </p>
      </div>

      <div className="card">
        <h2>Map</h2>
        <p className="hint" style={{ margin: '0 0 8px' }}>
          {blocks} block{blocks === 1 ? '' : 's'}, up to {MAP_MAX_HEIGHT} high
          {dug < 0 ? `, ${-dug} deep` : ''}.
        </p>
        <p className="lbl" style={{ margin: '0 0 6px' }}>Expand the map to:</p>
        {/*
          A rose, and the four buttons sit at its *corners* because that is
          where the map actually grows on screen (D-198). The camera is
          diagonal to the grid by design (R-31), so the grid's axes run
          corner-to-corner in the view — a button labelled "East" on the right
          hand side was pointing at the wrong place. The footprint sits in the
          middle, so the size is read where the growing happens.
        */}
        <div className="rose">
          {EXPANSIONS.map(({ towards, short, long }) => (
            <Tooltip key={towards} label={`Add a patch of floor to the ${long}`} placement="left" stretch>
              <button onClick={() => dispatch({ kind: 'growMap', placeId, poiId, towards })}>
                {short}
              </button>
            </Tooltip>
          ))}
          <span className="mid">{map.size.x}×{map.size.z}</span>
        </div>
      </div>
    </>
  );
}

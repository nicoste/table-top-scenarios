// The dock while an encounter map is open (R-148).
//
// A *replacement* for the world's palette, not an addition to it. Paint terrain,
// height, places and travel have no meaning inside a tavern, and leaving them on
// screen would offer four tools that do nothing.

import type { Intent, MapWire } from '@tt/protocol';
import type { MapTool } from '@tt/client-core';
import { CAMERA_HINT, mapToolShows } from '@tt/client-core';
import {
  MAP_MAX_HEIGHT, MAP_MIN_DEPTH, BRUSHES, isFullRange, stepLabel,
} from '@tt/domain';
import type { LevelRange, Material, SwatchId } from '@tt/domain';
import { ConfirmDelete, Tooltip } from '@tt/ui';
import { LevelLadder } from '../levels/index.js';
import { SwatchPalette } from '../swatches/index.js';

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

/** One member of the party, as the party card lists them inside a map (R-184). */
export interface PartyRow {
  readonly id: string;
  readonly name: string;
  readonly colour: string;
  /** Standing somewhere in this map. */
  readonly standing: boolean;
  /**
   * Standing inside the band, so the table is shown them (R-185). The GM may
   * put somebody outside it, and the card says so rather than leave the GM
   * wondering why the table does not show them — R-122's habit.
   */
  readonly onTable: boolean;
  /** How far they see, in cubes (R-46). The GM's to set, member by member. */
  readonly sight: number;
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
  /** The material **and** the cut of it the next click lays down (R-176). */
  readonly swatch: SwatchId;
  readonly hoverLabel: string | null;
  /** Is the party standing in *this* map (R-158)? */
  readonly partyHere: boolean;
  /** The roster, and where each of them stands in this map (R-184). */
  readonly party: readonly PartyRow[];
  /** Can they see it at all — Revealed, chunk Known, point of interest shown? */
  readonly partyCanSee: boolean;
  /** The band this map is cut to. Always present — an uncut map is its whole body. */
  readonly range: LevelRange;
  /** Is the console showing only the band, like the table (R-159)? */
  readonly levelling: boolean;
  onLevelling: (on: boolean) => void;
  /**
   * Is the console drawing the table's picture — the band, and the party's
   * fog over it (R-76, D-274)? Off by default: the GM builds on everything.
   */
  readonly partyView: boolean;
  onPartyView: (on: boolean) => void;
  /** How much of this map the party has seen, in cubes of space (R-45). */
  readonly seen: number;
  onTool: (tool: MapTool) => void;
  onBrush: (brushId: string) => void;
  onSwatch: (swatch: SwatchId) => void;
  onLeave: () => void;
  dispatch: (intent: Intent) => void;
  readonly placeId: string;
  readonly poiId: string;
}

/** The keys the map's brushes answer to, by id (D-364): the round sizes between are reached with `[` `]`. */
const BRUSH_KEYS: Readonly<Record<string, string>> = { cube: '8', flat3: '9', flat5: '0', column2: '−', column3: '=' };

export function MapPanel({
  placeName, poiName, map, blocks, dug, tool, brush, shifting, materials, swatch, hoverLabel,
  partyHere, party, partyCanSee, range, levelling, onLevelling, partyView, onPartyView, seen,
  onTool, onBrush, onSwatch, onLeave, dispatch, placeId, poiId,
}: Props) {
  const waiting = party.filter((member) => !member.standing).length;
  // One selection, split for the two things the list highlights.
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
            {/* Who is standing where, and their sight, are in the On stage list
                now — one list for everyone in the map, in the GM's order (R-208). */}
            <p className="hint" style={{ margin: '0 0 8px' }}>
              {waiting > 0
                ? <>{waiting} to place — pick <b>Play</b> (key 3) and point at a floor; the next one is already in hand.</>
                : party.some((member) => !member.onTable)
                  ? 'Somebody is outside the levels the table is shown, so the table does not show them.'
                  : 'Everybody is placed. Pick Play (key 3) to move them.'}
            </p>
            <div className="btn-grid campaign-actions">
              <Tooltip
                label={partyView
                  ? 'Back to the whole map, to build'
                  : 'See the map as the table does: the band, and only what the party has seen'}
                placement="bottom"
                stretch
              >
                <button
                  className={`wide${partyView ? ' on' : ''}`}
                  aria-pressed={partyView}
                  onClick={() => onPartyView(!partyView)}
                >
                  {partyView ? '◐ Party\'s view' : '○ Party\'s view'}
                </button>
              </Tooltip>
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
        {/*
          A fresh start for play (D-277): the GM walks a token round a
          prepared scene to check the walls and the levels, then wipes what it
          saw. Play state cannot be undone, so it asks first, the way every
          delete does (R-151).
        */}
        {(seen > 0 || party.some((member) => member.standing)) && (
          <div className="row forget">
            <ConfirmDelete
              label="Forget everything the party has seen here, and take them off the map — a fresh start"
              confirmLabel="Forget"
              placement="right"
              onConfirm={() => dispatch({ kind: 'forgetMap', placeId, poiId })}
            >
              <span className="hint grow">
                {seen > 0 ? 'They remember what they have seen here.' : 'They have seen nothing here yet.'}
              </span>
            </ConfirmDelete>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Tool</h2>
        {/*
          Two tools for matter, because there are two ideas: add or remove it,
          and change the colour of what is already there (R-162). Erase and
          fill were tools of their own and are modes of these two now — you
          alternate between build and erase constantly, and reaching for a
          different button each time was the tax. The third is not about
          matter at all: Play stands the party somewhere (D-258), and opens
          doors and lights lights — the hands-on half of play (D-354).
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
          {/* The third tool (D-258): the party, picked and stood somewhere else. */}
          <Tooltip
            label="Move tokens, open doors, light lights — key 3"
            placement="bottom"
            stretch
          >
            <button className={tool === 'move' ? 'on' : ''} onClick={() => onTool('move')}>
              ▶ Play
            </button>
          </Tooltip>
          {/* The fourth (D-307): everyone else, from the Tokens Library. */}
          <Tooltip
            label="Place tokens from the Tokens Library — key 4"
            placement="bottom"
            stretch
          >
            <button className={tool === 'spawn' ? 'on' : ''} onClick={() => onTool('spawn')}>
              ✚ Spawn
            </button>
          </Tooltip>
          {/* The fifth (D-321): pieces of map, saved and stamped. */}
          <Tooltip
            label="Save a piece of this map, or place a saved one — key 5"
            placement="bottom"
            stretch
          >
            <button className={tool === 'prefabs' ? 'on' : ''} onClick={() => onTool('prefabs')}>
              ⧉ Prefabs
            </button>
          </Tooltip>
          {/* The sixth (D-328): doors, bars and furniture, one per click. */}
          <Tooltip
            label="Place doors, bars, furniture, lights and ways up and down, or change one — key 6"
            placement="bottom"
            stretch
          >
            <button className={tool === 'props' ? 'on' : ''} onClick={() => onTool('props')}>
              ⚿ Props
            </button>
          </Tooltip>
          {/* The seventh (D-341): the ruler, and areas. */}
          <Tooltip
            label="Measure how far, or draw an area — key 7"
            placement="bottom"
            stretch
          >
            <button className={tool === 'measure' ? 'on' : ''} onClick={() => onTool('measure')}>
              ⟷ Measure
            </button>
          </Tooltip>
        </div>

        {/*
          Five named shapes, three flat and two upright (R-164). The flats come
          first and fill the row, so the two groups read as two groups — and
          the outline is the real label, since it takes the shape before the
          click. Not under Play, which lays nothing down (D-110's reason).
        */}
        {mapToolShows(tool, 'brush') && (
          <>
            <p className="lbl" style={{ margin: '8px 0 4px' }}>Brush</p>
            <div className="btn-grid brush">
              {BRUSHES.map((shape) => (
                <Tooltip
                  key={shape.id}
                  label={`${shape.rise > 1
                    ? `A column ${shape.rise} blocks tall, growing up — or down while ⌥ alt is held`
                    : shape.span > 1 ? `Flat and round, ${shape.span} across` : 'One cube'
                  }${BRUSH_KEYS[shape.id] ? ` — key ${BRUSH_KEYS[shape.id]}` : ' — [ ] to reach it'}`}
                  placement="bottom"
                  stretch
                >
                  <button className={brush === shape.id ? 'on' : ''} onClick={() => onBrush(shape.id)}>
                    {shape.name}
                  </button>
                </Tooltip>
              ))}
            </div>
          </>
        )}

        <p className="hint">
          {tool === 'build' && (
            <>
              Click a block&apos;s face; the new ones land against it in the shape of the
              brush. Blocks already standing are skipped, never overwritten.
              Hold <b>⇧ shift</b> to <b>erase</b> instead — the outline turns red.
              Hold <b>⌥ alt</b> to build <b>under</b> the cube — the only way down, since a
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
              of the same cut of the same material, is repainted. The readout says how many.
              A click on a prop paints that prop alone, whatever the brush.
            </>
          )}
          {tool === 'move' && (
            <>
              Click a token to pick it up, then the top of a block to stand it there.
              One to a cube, gold or silver, and always on something. Escape or
              right-click puts it back down where it was. Click a door to open or
              shut it, and a light to put it out or light it.
            </>
          )}
          {tool === 'spawn' && (
            <>
              Choose a token from the <b>Tokens Library</b>, then click the top of a block
              to place one there — and again, for as many as you need. Each gets its own
              name, so the table can say which.
            </>
          )}
          {tool === 'props' && (
            <>
              Pick a prop from the catalogue and click where it stands — <b>Z / X</b>{' '}
              turn it first; a torch, holds and vines hang on the wall you point at,
              and stairs, ladders and ropes face it — a rope hangs from a ledge too. One per click, and
              each is one undo. With nothing in hand, click a prop to turn, refinish,
              open or remove it, or to set how far a light reaches — <b>Backspace</b>{' '}
              removes the one selected; drag the one selected to move it. With{' '}
              <b>Play</b>, a click opens and shuts a door, and lights or puts out a light.
            </>
          )}
          {tool === 'measure' && (
            <>
              With the <b>Ruler</b>, drag from one cube to another to see how far. With a
              shape, drag to draw an area — the players see it unless you hide it. Drag an
              area by the mark where it starts to move it. Escape lets go of the ruler.
            </>
          )}
          {tool === 'prefabs' && (
            <>
              <b>Place</b>: choose a prefab and click a face to stand it there — <b>Z / X</b>{' '}
              turn it, <b>M</b> mirrors it, and each placement is one undo. <b>Capture</b>:
              three clicks — a corner, the opposite corner of the area, then the top —
              then name the box and save it for every campaign.
            </>
          )}
        </p>
        <p className="readout">{hoverLabel ?? '—'}</p>
        <p className="hint">1–7 tool · 8–0, −, = or [ ] brush · {CAMERA_HINT}</p>
      </div>

      {/* Build's and Paint's, and nobody else's (R-207). */}
      {mapToolShows(tool, 'material') && (
        <div className="card">
          <h2>Material</h2>
          <SwatchPalette
            materials={materials}
            chosen={swatch}
            onSwatch={onSwatch}
            detail={(material) => (
              /* Said out loud at a table, and the reason it is a material
                 property rather than a block one (R-75). It lives here rather
                 than on every row because a row has a name and four cuts in
                 228px and no space left — and because the families that are
                 see-through are the ones called Liquids and Glassy (D-245). */
              !material.blocksSight ? <span className="diff">see-through</span> : null
            )}
            hint={(
              <>
                A row is how a thing is built; the squares are what it is made
                of. They weigh the same in every rule — and a <b>fill</b> stops
                where the cut changes, which is what lets you repaint one
                course of a wall.
              </>
            )}
          />
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

// The dock while an encounter map is open (R-148).
//
// A *replacement* for the world's palette, not an addition to it. Paint terrain,
// height, places and travel have no meaning inside a tavern, and leaving them on
// screen would offer four tools that do nothing.

import { useState } from 'react';
import type { Intent, MapWire } from '@tt/protocol';
import type { MapTool } from '@tt/client-core';
import { CAMERA_HINT } from '@tt/client-core';
import { MAP_MAX_HEIGHT, MAP_MIN_DEPTH, planeSteps, isFullRange, stepLabel } from '@tt/domain';
import type { LevelRange, Material } from '@tt/domain';
import { ConfirmDelete, Tooltip } from '@tt/ui';

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

interface Props {
  /** Which point of interest's map this is — for the heading. */
  readonly placeName: string;
  readonly poiName: string;
  readonly map: MapWire;
  readonly tool: MapTool;
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
  onMaterial: (id: string) => void;
  onLeave: () => void;
  dispatch: (intent: Intent) => void;
  readonly placeId: string;
  readonly poiId: string;
}

/**
 * A step's label: one of the three fixed names, or the plane the GM put there.
 *
 * The names come from the domain (R-161), not from here, so the rules and both
 * screens say the same word for the same height.
 */
function stepName(y: number, planes: MapWire['planes']): string {
  return stepLabel(y, MAP_MAX_HEIGHT, MAP_MIN_DEPTH)
    ?? planes?.find((plane) => plane.y === y)?.name
    ?? `Level ${y}`;
}

export function MapPanel({
  placeName, poiName, map, tool, materials, materialId, hoverLabel,
  partyHere, partyCanSee, range, levelling, onLevelling,
  onTool, onMaterial, onLeave, dispatch, placeId, poiId,
}: Props) {
  const blocks = Object.keys(map.blocks).length;
  const [planeName, setPlaneName] = useState('');
  const [planeY, setPlaneY] = useState('');
  const planes = map.planes ?? [];
  /**
   * How far this body has actually been dug — for the readout only (R-160).
   *
   * The *steps* no longer use it: they are anchored at Bedrock, water level and
   * Sky whatever has been built (R-161). This is just "how deep is it", which
   * is a fact about the map worth telling the GM.
   */
  const dug = Object.keys(map.blocks).reduce(
    (lowest, key) => Math.min(lowest, Number(key.split(',')[1])),
    0,
  );
  /**
   * The heights the two handles may be set to.
   *
   * The fixed steps and the GM's planes — **plus wherever the band currently
   * sits**, even when that is not a step any more. A band goes off-step the
   * moment a plane it was resting on is moved or deleted, and a `select` whose
   * value is not among its options silently displays a different one: the
   * control would be claiming the table is being shown something it is not.
   *
   * Snapping the stored band instead would be worse. It is a pair of heights
   * the GM chose, and quietly moving it whenever a plane changes would alter
   * what the party sees without anyone asking (R-161).
   */
  const steps = [...new Set([
    ...planeSteps(planes, MAP_MAX_HEIGHT, MAP_MIN_DEPTH),
    range.lower,
    range.upper,
  ])].sort((a, b) => a - b);

  const addPlane = () => {
    const y = Number.parseInt(planeY, 10);
    if (!Number.isInteger(y)) return;
    dispatch({ kind: 'addPlane', placeId, poiId, name: planeName.trim(), y });
    setPlaneName('');
    setPlaneY('');
  };

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
                : `${stepName(range.lower, planes)} to ${stepName(range.upper, planes)}`}.
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
        <div className="btn-grid tools">
          <Tooltip label="Add a block against the face you click — key 1" placement="bottom" stretch>
            <button className={tool === 'build' ? 'on' : ''} onClick={() => onTool('build')}>
              ▣ Build
            </button>
          </Tooltip>
          <Tooltip label="Remove the block you click — key 2" placement="bottom" stretch>
            <button className={tool === 'erase' ? 'on' : ''} onClick={() => onTool('erase')}>
              ⌫ Erase
            </button>
          </Tooltip>
          <Tooltip label="Repaint blocks without moving them — key 3" placement="bottom" stretch>
            <button className={tool === 'paint' ? 'on' : ''} onClick={() => onTool('paint')}>
              ✏ Paint
            </button>
          </Tooltip>
          <Tooltip
            label="Repaint every block joined to the one you click, of the same material — key 4"
            placement="bottom"
            stretch
          >
            <button className={tool === 'fill' ? 'on' : ''} onClick={() => onTool('fill')}>
              ◍ Fill
            </button>
          </Tooltip>
        </div>
        <p className="hint">
          {tool === 'build' && (
            <>
              Click a block&apos;s face; the new one lands against it. One click, one cube.
              {' '}Hold <b>⌥ alt</b> to place <b>under</b> the cube instead — the only way down,
              since a camera above the horizon never sees an underside.
            </>
          )}
          {tool === 'erase' && <>Click a block to remove it. One click, one cube.</>}
          {/* The one map tool that drags, because it does not move its own
              target the way build and erase do (R-153). */}
          {tool === 'paint' && <>Click a block to repaint it, or drag the brush across several. Nothing moves.</>}
          {tool === 'fill' && (
            <>Click a block: everything joined to it of the same material is repainted. The readout says how many.</>
          )}
        </p>
        <p className="readout">{hoverLabel ?? '—'}</p>
        <p className="hint">1–4 tool · {CAMERA_HINT} · Esc leaves</p>
      </div>

      {tool !== 'erase' && (
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
        Levels (R-146). The plane list and the band are one card because they are
        one idea read two ways: the names the GM gave the cuts, and which of the
        bands between them the table is being shown.
      */}
      <div className="card">
        <h2>Levels</h2>
        {planes.length === 0 && (
          <p className="hint" style={{ margin: '0 0 8px' }}>
            No cuts yet — the whole place is one level.
          </p>
        )}
        {planes.length > 0 && (
          <ul className="notes">
            {/* Top-down, because that is how a building is read. */}
            {[...planes].sort((a, b) => b.y - a.y).map((plane) => (
              <li key={plane.id}>
                <span className="lbl" style={{ minWidth: 22, textAlign: 'right' }}>{plane.y}</span>
                <input
                  value={plane.name}
                  onChange={(e) => dispatch({
                    kind: 'renamePlane', placeId, poiId, planeId: plane.id, name: e.target.value,
                  })}
                />
                <div className="note-actions">
                  <ConfirmDelete
                    label={`Remove the cut at ${plane.y}`}
                    onConfirm={() => dispatch({
                      kind: 'removePlane', placeId, poiId, planeId: plane.id,
                    })}
                  >
                    <Tooltip label="Raise this cut by one" placement="left">
                      <button
                        className="quiet"
                        onClick={() => dispatch({
                          kind: 'movePlane', placeId, poiId, planeId: plane.id, y: plane.y + 1,
                        })}
                      >↑</button>
                    </Tooltip>
                    <Tooltip label="Lower this cut by one" placement="left">
                      <button
                        className="quiet"
                        onClick={() => dispatch({
                          kind: 'movePlane', placeId, poiId, planeId: plane.id, y: plane.y - 1,
                        })}
                      >↓</button>
                    </Tooltip>
                  </ConfirmDelete>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="row">
          <input
            placeholder="Cut named…"
            value={planeName}
            onChange={(e) => setPlaneName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addPlane(); }}
          />
          <input
            className="tiny"
            placeholder="Y"
            inputMode="numeric"
            value={planeY}
            onChange={(e) => setPlaneY(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addPlane(); }}
          />
          <button onClick={addPlane} disabled={!Number.isInteger(Number.parseInt(planeY, 10))}>
            Cut
          </button>
        </div>

        {/*
          The toggle (R-159). Two views of one body: everything, or the band the
          table gets. Not a dimming — while it is on, the levels outside the
          band are *absent*, which is what stops the GM editing a block they
          cannot see (D-202).
        */}
        <div className="btn-grid tools" style={{ marginTop: 4 }}>
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

        {/*
          The band. Two selects rather than the double slider the GM sketched —
          the steps are few and named, and a dropdown of names cannot be dragged
          past itself. The slider is a polish, not the feature.
        */}
        <label className="row" style={{ marginTop: 8 }}>
          <span className="lbl">from</span>
          <select
            value={range.lower}
            onChange={(e) => dispatch({
              kind: 'setRange',
              placeId,
              poiId,
              lower: Number.parseInt(e.target.value, 10),
              upper: range.upper,
            })}
          >
            {steps.map((y) => (
              <option key={y} value={y}>{stepName(y, planes)}</option>
            ))}
          </select>
        </label>
        <label className="row" style={{ marginTop: 4 }}>
          <span className="lbl">to</span>
          <select
            value={range.upper}
            onChange={(e) => dispatch({
              kind: 'setRange',
              placeId,
              poiId,
              lower: range.lower,
              upper: Number.parseInt(e.target.value, 10),
            })}
          >
            {steps.map((y) => (
              <option key={y} value={y}>{stepName(y, planes)}</option>
            ))}
          </select>
        </label>
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
          hand side was pointing at the wrong place. The middle carries the
          footprint, so the size is read where the growing happens.
        */}
        <div className="rose">
          {EXPANSIONS.map(({ towards, short, long }) => (
            <Tooltip key={towards} label={`Add a patch of floor to the ${long}`} placement="left">
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

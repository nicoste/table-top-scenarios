// The Props catalogue (D-322, D-328): doors and bars, then furniture, then
// lights (D-335). Shown with the Props tool in hand — pick an entry and click
// where it stands, one per click; or, with nothing in hand, click a prop on
// the map to turn it, repaint it, open it, set how far a light reaches, or
// take it away.
//
// A prop is painted with any block material (D-352): the catalogue offers a
// few, and the material in the Paint tool is offered beside them — or the
// Paint tool paints a prop with a click.
//
// Placing, turning, repainting, a light's reach and removing are building,
// under undo, as a block is. Opening a door and lighting a light are play —
// the GM's, and in play it is a Play click (D-354).

import type { Intent } from '@tt/protocol';
import type { Opened, Prop, PropFlame, PropType, SwatchId } from '@tt/domain';
import { PROP_TYPES, flameOf, paintOf, propType, reachOf, statesOf, swatchColour, swatchName, turned } from '@tt/domain';
import type { PropHand } from '@tt/client-core';
import { takeProp, turnHand } from '@tt/client-core';
import { DraftInput, Tooltip } from '@tt/ui';
import { isReach } from '../carried/index.js';
import { GmNote } from '../note/index.js';

interface Props {
  hand: PropHand;
  onHand: (next: PropHand) => void;
  /** The prop clicked on the map, when nothing is in hand. */
  selected: Prop | null;
  onSelect: (id: string | null) => void;
  opened: Opened;
  placeId: string;
  poiId: string;
  /** The material in the Paint tool, offered beside the catalogue's (D-352). */
  swatch: SwatchId;
  dispatch: (intent: Intent) => void;
}

const GROUPS: readonly { readonly id: PropType['group']; readonly name: string }[] = [
  { id: 'doors', name: 'Doors & bars' },
  { id: 'furniture', name: 'Furniture' },
  { id: 'lights', name: 'Lights' },
  { id: 'stairs', name: 'Up & down' },
];


/** What a prop does, said in a few words beside its name. */
function rulesOf(type: PropType): string {
  const stops = (effect: PropType['closed']) => (effect.blocksSight && effect.blocksWalking
    ? 'blocks sight and walking' : effect.blocksWalking ? 'blocks walking' : effect.blocksSight ? 'blocks sight' : 'blocks nothing');
  return type.opens && (type.open.blocksSight !== type.closed.blocksSight || type.open.blocksWalking !== type.closed.blocksWalking)
    ? `shut, ${stops(type.closed)}; open, ${stops(type.open)}`
    : stops(type.closed);
}

/** What the catalogue's tooltip says of an entry: its size, or for a light how far it reaches (D-335). */
function aboutOf(type: PropType): string {
  if (type.light) return `lights ${type.light.reach}${type.hangs ? ', hangs on a wall' : ''} — ${rulesOf(type)}`;
  if (type.holds) return `${type.size.x} × ${type.size.y} — ${rulesOf(type)}; stood on as a block is${type.turnsToWall ? ', climbing toward the back' : ''}`;
  if (type.climbable) {
    const held = type.hangs ? 'on a wall' : type.dangles ? 'hangs from what is above it' : 'set against a wall or on another';
    return `${type.size.x} × ${type.size.y} — ${rulesOf(type)}; climbed, ${held}`;
  }
  return `${type.size.x} × ${type.size.y} — ${rulesOf(type)}`;
}

/** One chip in a row: a colour, named on hover. */
function Chip({ name, colour, on, onPick }: { name: string; colour: string; on: boolean; onPick: () => void }) {
  return (
    <Tooltip label={name} placement="bottom">
      <button className={`chip-button${on ? ' on' : ''}`} aria-label={name} aria-pressed={on} onClick={onPick}>
        <span className="chip" style={{ background: colour }} />
      </button>
    </Tooltip>
  );
}

/**
 * What a prop may be painted with, offered (D-352): the catalogue's picks,
 * then the Paint tool's material when it is not one of them — and the one it
 * is painted with already, when that is neither.
 */
function Paints({ type, chosen, swatch, onPick }: {
  type: PropType; chosen: SwatchId; swatch: SwatchId; onPick: (paint: SwatchId) => void;
}) {
  const offered = [...new Set([...type.paints, swatch, chosen])];
  return (
    <div className="prop-finishes">
      {offered.map((paint) => (
        <Chip
          key={paint}
          name={`${swatchName(paint) ?? paint}${type.paints.includes(paint) ? '' : paint === swatch ? ' — from Paint' : ''}`}
          colour={swatchColour(paint) ?? '#9aa3ad'}
          on={paint === chosen}
          onPick={() => onPick(paint)}
        />
      ))}
    </div>
  );
}

/** A light's flames (D-335): the colour of what it gives. */
function Flames({ flames, chosen, onPick }: { flames: readonly PropFlame[]; chosen: string; onPick: (id: string) => void }) {
  return (
    <div className="prop-finishes">
      {flames.map((flame) => (
        <Chip key={flame.id} name={flame.name} colour={flame.colour} on={flame.id === chosen} onPick={() => onPick(flame.id)} />
      ))}
    </div>
  );
}

export function PropsPanel({ hand, onHand, selected, onSelect, opened, placeId, poiId, swatch, dispatch }: Props) {
  const inHand = hand.type ? propType(hand.type) : null;
  const where = { placeId, poiId };
  const selectedType = selected ? propType(selected.type) : null;

  return (
    <div className="card library props">
      <h2>Props</h2>

      {selected && selectedType && !inHand && (
        <div className="prop-selected">
          <p className="readout">
            {selectedType.name}
            {selectedType.opens && ` · ${opened.has(selected.id) ? statesOf(selectedType).other : statesOf(selectedType).placed}`}
          </p>
          {/* The GM's own (D-357): what is in it, what it hides. Never on the table. */}
          <GmNote
            note={selected.note ?? ''}
            name={`the ${selectedType.name.toLowerCase()}`}
            onCommit={(note) => dispatch({ kind: 'editProp', ...where, id: selected.id, note })}
          />
          <div className="btn-grid tools">
            {/* One that hangs faces out from its wall, and has no other way to turn (D-335). */}
            {!selectedType.hangs && !selectedType.dangles && (
              <>
                <Tooltip label="A quarter turn anticlockwise" placement="bottom" stretch>
                  <button onClick={() => dispatch({ kind: 'editProp', ...where, id: selected.id, facing: turned(selected.facing, -1) })}>
                    ↺ Turn
                  </button>
                </Tooltip>
                <Tooltip label="A quarter turn clockwise" placement="bottom" stretch>
                  <button onClick={() => dispatch({ kind: 'editProp', ...where, id: selected.id, facing: turned(selected.facing, 1) })}>
                    ↻ Turn
                  </button>
                </Tooltip>
              </>
            )}
            {selectedType.opens && (
              <Tooltip label="With Play, a click on it does the same" placement="bottom" stretch>
                <button onClick={() => dispatch({ kind: 'setPropOpen', ...where, id: selected.id, open: !opened.has(selected.id) })}>
                  {opened.has(selected.id) ? statesOf(selectedType).toPlaced : statesOf(selectedType).toOther}
                </button>
              </Tooltip>
            )}
            <Tooltip label="Take it away — Backspace. One undo brings it back." placement="bottom" stretch>
              <button
                className="wide quiet"
                onClick={() => { dispatch({ kind: 'removeProp', ...where, id: selected.id }); onSelect(null); }}
              >
                Remove
              </button>
            </Tooltip>
          </div>
          <p className="lbl" style={{ margin: '8px 0 4px' }}>Paint</p>
          <Paints
            type={selectedType}
            chosen={paintOf(selected)}
            swatch={swatch}
            onPick={(paint) => dispatch({ kind: 'editProp', ...where, id: selected.id, paint })}
          />
          {selectedType.flames && (
            <>
              <p className="lbl" style={{ margin: '8px 0 4px' }}>Flame</p>
              <Flames
                flames={selectedType.flames}
                chosen={flameOf(selected)!}
                onPick={(flame) => dispatch({ kind: 'editProp', ...where, id: selected.id, flame })}
              />
            </>
          )}
          {selectedType.light && (
            <Tooltip label="How far its light reaches, in cubes" placement="left">
              <span className="stage-sight prop-reach">
                <span className="lbl">lights</span>
                <DraftInput
                  className="sight"
                  aria-label="How far its light reaches"
                  inputMode="numeric"
                  value={String(reachOf(selected))}
                  valid={isReach}
                  onCommit={(draft) => dispatch({ kind: 'editProp', ...where, id: selected.id, reach: Number(draft.trim()) })}
                />
              </span>
            </Tooltip>
          )}
          <p className="hint">
            {rulesOf(selectedType)}. Any material: pick it in <b>Paint</b> and click the prop.
            Backspace removes it; Escape lets go of it.
          </p>
        </div>
      )}

      {GROUPS.map((group) => (
        <div key={group.id}>
          <p className="lbl" style={{ margin: '8px 0 4px' }}>{group.name}</p>
          <div className="btn-grid tools">
            {PROP_TYPES.filter((type) => type.group === group.id).map((type) => (
              <Tooltip key={type.id} label={aboutOf(type)} placement="left" stretch>
                <button
                  className={hand.type === type.id ? 'on' : ''}
                  aria-pressed={hand.type === type.id}
                  onClick={() => { onSelect(null); onHand(takeProp(hand, type.id)); }}
                >
                  {type.name}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>
      ))}

      {inHand ? (
        <>
          <p className="lbl" style={{ margin: '8px 0 4px' }}>
            {inHand.name}: paint{inHand.flames ? ', flame' : ''}{inHand.hangs || inHand.dangles ? '' : ' and turn'}
          </p>
          <Paints
            type={inHand}
            chosen={hand.paint ?? inHand.paints[0]!}
            swatch={swatch}
            onPick={(paint) => onHand({ ...hand, paint })}
          />
          {inHand.flames && (
            <div style={{ marginTop: 6 }}>
              <Flames
                flames={inHand.flames}
                chosen={hand.flame ?? inHand.flames[0]!.id}
                onPick={(flame) => onHand({ ...hand, flame })}
              />
            </div>
          )}
          {/* One that hangs turns to the wall pointed at (D-335). */}
          {!inHand.hangs && !inHand.dangles && (
            <div className="btn-grid tools" style={{ marginTop: 6 }}>
              <Tooltip label="A quarter turn anticlockwise — Z" placement="bottom" stretch>
                <button onClick={() => onHand(turnHand(hand, -1))}>↺ Turn</button>
              </Tooltip>
              <Tooltip label="A quarter turn clockwise — X" placement="bottom" stretch>
                <button onClick={() => onHand(turnHand(hand, 1))}>↻ Turn</button>
              </Tooltip>
            </div>
          )}
          <p className="hint">
            {inHand.hangs ? 'Point at a wall; it hangs facing out. ' : ''}
            {inHand.dangles ? 'Point under a ledge or a beam, or under another; it hangs down. ' : ''}
            {inHand.turnsToWall ? 'Point at the side of a wall to climb toward it, or at a floor to turn it with Z / X. ' : ''}
            One per click. Escape puts it down.
          </p>
        </>
      ) : !selected && (
        <p className="hint">
          Pick a prop, then click where it stands. With nothing in hand, click a prop
          on the map to change it, and drag it to move it. With <b>Play</b>, a click
          opens and shuts doors, and lights and puts out lights.
        </p>
      )}
    </div>
  );
}

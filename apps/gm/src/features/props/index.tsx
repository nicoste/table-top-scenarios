// The Props catalogue (D-322, D-328): doors and bars, then furniture, then
// lights (D-335). Shown with the Props tool in hand — pick an entry and click
// where it stands, one per click; or, with nothing in hand, click a prop on
// the map to turn it, refinish it, open it, set how far a light reaches, or
// take it away.
//
// Placing, turning, refinishing, a light's reach and removing are building,
// under undo, as a block is. Opening a door and lighting a light are play —
// the GM's, and in play it is a Move click.

import type { Intent } from '@tt/protocol';
import type { Opened, Prop, PropType } from '@tt/domain';
import { PROP_TYPES, propType, reachOf, statesOf, turned } from '@tt/domain';
import type { PropHand } from '@tt/client-core';
import { takeProp, turnHand } from '@tt/client-core';
import { DraftInput, Tooltip } from '@tt/ui';
import { isReach } from '../carried/index.js';

interface Props {
  hand: PropHand;
  onHand: (next: PropHand) => void;
  /** The prop clicked on the map, when nothing is in hand. */
  selected: Prop | null;
  onSelect: (id: string | null) => void;
  opened: Opened;
  placeId: string;
  poiId: string;
  dispatch: (intent: Intent) => void;
}

const GROUPS: readonly { readonly id: PropType['group']; readonly name: string }[] = [
  { id: 'doors', name: 'Doors & bars' },
  { id: 'furniture', name: 'Furniture' },
  { id: 'lights', name: 'Lights' },
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
  return `${type.size.x} × ${type.size.y} — ${rulesOf(type)}`;
}

/** A row of finish chips: the colour is the whole of a finish. */
function Finishes({ type, chosen, onPick }: { type: PropType; chosen: string; onPick: (id: string) => void }) {
  return (
    <div className="prop-finishes">
      {type.finishes.map((finish) => (
        <Tooltip key={finish.id} label={finish.name} placement="bottom">
          <button
            className={`chip-button${finish.id === chosen ? ' on' : ''}`}
            aria-label={finish.name}
            aria-pressed={finish.id === chosen}
            onClick={() => onPick(finish.id)}
          >
            <span className="chip" style={{ background: finish.colour }} />
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

export function PropsPanel({ hand, onHand, selected, onSelect, opened, placeId, poiId, dispatch }: Props) {
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
          <div className="btn-grid tools">
            {/* One that hangs faces out from its wall, and has no other way to turn (D-335). */}
            {!selectedType.hangs && (
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
              <Tooltip label="In play, a Move click on it does the same" placement="bottom" stretch>
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
          <Finishes
            type={selectedType}
            chosen={selected.finish}
            onPick={(finish) => dispatch({ kind: 'editProp', ...where, id: selected.id, finish })}
          />
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
          <p className="hint">{rulesOf(selectedType)}. Backspace removes it; Escape lets go of it.</p>
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
            {inHand.name}: {inHand.light ? 'flame' : 'finish'}{inHand.hangs ? '' : ' and turn'}
          </p>
          <Finishes
            type={inHand}
            chosen={hand.finish ?? inHand.finishes[0]!.id}
            onPick={(finish) => onHand({ ...hand, finish })}
          />
          {/* One that hangs turns to the wall pointed at (D-335). */}
          {!inHand.hangs && (
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
            {inHand.hangs ? 'Point at a wall; it hangs facing out. ' : ''}One per click. Escape puts it down.
          </p>
        </>
      ) : !selected && (
        <p className="hint">
          Pick a prop, then click where it stands. With nothing in hand, click a prop
          on the map to change it. In play, a <b>Move</b> click opens and shuts doors,
          and lights and puts out lights.
        </p>
      )}
    </div>
  );
}

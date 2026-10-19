// The Props catalogue (D-322, D-328): doors and bars, then furniture. Shown
// with the Props tool in hand — pick an entry and click where it stands, one
// per click; or, with nothing in hand, click a prop on the map to turn it,
// refinish it, open it or take it away.
//
// Placing, turning, refinishing and removing are building, under undo, as a
// block is. Opening is play — the GM's, and in play it is a Move click.

import type { Intent } from '@tt/protocol';
import type { Opened, Prop, PropType } from '@tt/domain';
import { PROP_TYPES, propType, turned } from '@tt/domain';
import type { PropHand } from '@tt/client-core';
import { takeProp, turnHand } from '@tt/client-core';
import { Tooltip } from '@tt/ui';

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
];

/** What a prop does, said in a few words beside its name. */
function rulesOf(type: PropType): string {
  const stops = (effect: PropType['closed']) => (effect.blocksSight && effect.blocksWalking
    ? 'blocks sight and walking' : effect.blocksWalking ? 'blocks walking' : effect.blocksSight ? 'blocks sight' : 'blocks nothing');
  return type.opens && (type.open.blocksSight !== type.closed.blocksSight || type.open.blocksWalking !== type.closed.blocksWalking)
    ? `shut, ${stops(type.closed)}; open, ${stops(type.open)}`
    : stops(type.closed);
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
            {selectedType.opens && (opened.has(selected.id) ? ' · open' : ' · shut')}
          </p>
          <div className="btn-grid tools">
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
            {selectedType.opens && (
              <Tooltip label="In play, a Move click on it does the same" placement="bottom" stretch>
                <button onClick={() => dispatch({ kind: 'setPropOpen', ...where, id: selected.id, open: !opened.has(selected.id) })}>
                  {opened.has(selected.id) ? 'Close' : 'Open'}
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
          <p className="hint">{rulesOf(selectedType)}. Backspace removes it; Escape lets go of it.</p>
        </div>
      )}

      {GROUPS.map((group) => (
        <div key={group.id}>
          <p className="lbl" style={{ margin: '8px 0 4px' }}>{group.name}</p>
          <div className="btn-grid tools">
            {PROP_TYPES.filter((type) => type.group === group.id).map((type) => (
              <Tooltip key={type.id} label={`${type.size.x} × ${type.size.y} — ${rulesOf(type)}`} placement="left" stretch>
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
          <p className="lbl" style={{ margin: '8px 0 4px' }}>{inHand.name}: finish and turn</p>
          <Finishes
            type={inHand}
            chosen={hand.finish ?? inHand.finishes[0]!.id}
            onPick={(finish) => onHand({ ...hand, finish })}
          />
          <div className="btn-grid tools" style={{ marginTop: 6 }}>
            <Tooltip label="A quarter turn anticlockwise — Z" placement="bottom" stretch>
              <button onClick={() => onHand(turnHand(hand, -1))}>↺ Turn</button>
            </Tooltip>
            <Tooltip label="A quarter turn clockwise — X" placement="bottom" stretch>
              <button onClick={() => onHand(turnHand(hand, 1))}>↻ Turn</button>
            </Tooltip>
          </div>
          <p className="hint">One per click. Escape puts it down.</p>
        </>
      ) : !selected && (
        <p className="hint">
          Pick a prop, then click where it stands. With nothing in hand, click a prop
          on the map to change it. In play, a <b>Move</b> click opens and shuts doors.
        </p>
      )}
    </div>
  );
}

// The Measure tool's panel (D-341): the ruler or a shape in hand, the colour
// a new area is drawn in, and every area on this map — renamed, resized,
// recoloured, hidden from the table, given somebody to follow, or taken away.
//
// Areas are play (R-140): nothing here is undone, and a × takes one away at
// once — drawing it again is one drag.

import type { Intent } from '@tt/protocol';
import type { Areas } from '@tt/domain';
import { AREA_COLOURS, AREA_SHAPES, MAX_AREA_SIZE, MIN_AREA_SIZE, areaColour } from '@tt/domain';
import type { MeasureHand, MeasureMode } from '@tt/client-core';
import { chooseAreaColour, chooseMeasure } from '@tt/client-core';
import { ConfirmDelete, DraftInput, GameIcon, SlotButton, Tooltip } from '@tt/ui';
import type { GameIconName } from '@tt/ui';

interface Props {
  hand: MeasureHand;
  onHand: (next: MeasureHand) => void;
  areas: Areas;
  /** Who is on stage here, for an area to follow: members and silver tokens. */
  people: readonly { readonly id: string; readonly name: string }[];
  placeId: string;
  poiId: string;
  dispatch: (intent: Intent) => void;
}

const MODES: readonly { readonly id: MeasureMode; readonly name: string; readonly about: string }[] = [
  { id: 'ruler', name: 'Ruler', about: 'How far from one cube to another — only you see it; Escape lets go' },
  ...AREA_SHAPES.map((shape) => ({
    id: shape.id,
    name: shape.name,
    about: `${shape.id === 'sphere' ? 'Drag from the middle outwards'
      : shape.id === 'cube' ? 'Drag from one corner to the other'
        : 'Drag from its point the way it goes'
    } — the players see it unless you hide it; drag it by the mark where it starts to move it`,
  })),
];

/** What an area's size is, in its shape's words. */
const SIZE_WORD = { sphere: 'radius', cone: 'length', line: 'length', cube: 'side' } as const;

/** A size the field will take: whole cubes, in bounds. */
const isSize = (draft: string) => {
  const text = draft.trim();
  if (!/^\d{1,2}$/.test(text)) return false;
  const value = Number(text);
  return value >= MIN_AREA_SIZE && value <= MAX_AREA_SIZE;
};

const MODE_ICONS: Record<MeasureMode, GameIconName> = {
  ruler: 'measure',
  sphere: 'sphere',
  cone: 'cone',
  line: 'line',
  cube: 'cube',
};

export function MeasurePanel({ hand, onHand, areas, people, placeId, poiId, dispatch }: Props) {
  const where = { placeId, poiId };
  const nextColour = (id: string) => AREA_COLOURS[(AREA_COLOURS.findIndex((one) => one.id === id) + 1) % AREA_COLOURS.length]!.id;

  return (
    <div className="card measure">
      <h2>Measure</h2>
      <div className="btn-grid tools">
        {MODES.map((mode) => (
          <SlotButton
            key={mode.id}
            icon={MODE_ICONS[mode.id]}
            label={mode.name}
            active={hand.mode === mode.id}
            tooltip={mode.about}
            onClick={() => onHand(chooseMeasure(hand, mode.id))}
          />
        ))}
      </div>

      {hand.mode !== 'ruler' && (
        <div className="prop-finishes" style={{ marginTop: 8 }}>
          {AREA_COLOURS.map((colour) => (
            <Tooltip key={colour.id} label={colour.name} placement="bottom">
              <button
                className={`chip-button${hand.colour === colour.id ? ' on' : ''}`}
                aria-label={colour.name}
                aria-pressed={hand.colour === colour.id}
                onClick={() => onHand(chooseAreaColour(hand, colour.id))}
              >
                <span className="chip" style={{ background: colour.colour }} />
              </button>
            </Tooltip>
          ))}
        </div>
      )}

      {areas.length > 0 && (
        <>
          <p className="lbl" style={{ margin: '8px 0 4px' }}>Areas here</p>
          <ul className="area-list">
            {areas.map((area) => (
              <li key={area.id} className={area.hidden ? 'hidden' : ''}>
                <div className="area-row">
                  <Tooltip label="Its colour — click for the next" placement="left">
                    <button
                      className="chip-button"
                      aria-label={`${area.name}'s colour`}
                      onClick={() => dispatch({ kind: 'editArea', ...where, id: area.id, colour: nextColour(area.colour) })}
                    >
                      <span className="chip" style={{ background: areaColour(area.colour) }} />
                    </button>
                  </Tooltip>
                  <DraftInput
                    value={area.name}
                    aria-label={`${area.name}'s name`}
                    valid={(name) => name.trim().length > 0}
                    onCommit={(name) => dispatch({ kind: 'editArea', ...where, id: area.id, name })}
                  />
                </div>
                <div className="area-follow">
                  {/* Asking takes this whole line, under the name it asks about (R-151). */}
                  <ConfirmDelete
                    label={`Take ${area.name} away`}
                    confirmLabel="Remove"
                    onConfirm={() => dispatch({ kind: 'removeArea', ...where, id: area.id })}
                  >
                    <Tooltip label={`Its ${SIZE_WORD[area.shape]}, in cubes`} placement="left">
                      <span className="stage-sight">
                        <DraftInput
                          className="sight"
                          aria-label={`${area.name}'s ${SIZE_WORD[area.shape]}`}
                          inputMode="numeric"
                          value={String(area.size)}
                          valid={isSize}
                          onCommit={(draft) => dispatch({ kind: 'editArea', ...where, id: area.id, size: Number(draft.trim()) })}
                        />
                      </span>
                    </Tooltip>
                    <span className="lbl">follows</span>
                    <select
                      value={area.follows ?? ''}
                      aria-label={`Whom ${area.name} follows`}
                      onChange={(e) => dispatch({ kind: 'editArea', ...where, id: area.id, follows: e.target.value || null })}
                    >
                      <option value="">nobody</option>
                      {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                    </select>
                    <Tooltip
                      label={area.hidden ? 'Hidden from the players — click to show it' : 'The players see it — click to hide it'}
                      placement="left"
                    >
                      <button
                        className={`quiet eye${area.hidden ? ' off' : ''}`}
                        aria-pressed={area.hidden}
                        aria-label={area.hidden ? `Show ${area.name}` : `Hide ${area.name}`}
                        onClick={() => dispatch({ kind: 'editArea', ...where, id: area.id, hidden: !area.hidden })}
                      >
                        <GameIcon name={area.hidden ? 'eye-hidden' : 'eye-open'} size={16} />
                      </button>
                    </Tooltip>
                  </ConfirmDelete>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

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
import { DraftInput, Tooltip } from '@tt/ui';

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
  { id: 'ruler', name: 'Ruler', about: 'How far from one cube to another — only you see it' },
  ...AREA_SHAPES.map((shape) => ({
    id: shape.id,
    name: shape.name,
    about: shape.id === 'sphere' ? 'Drag from the middle outwards'
      : shape.id === 'cube' ? 'Drag from one corner to the other'
        : 'Drag from its point the way it goes',
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

/** The eye a password field uses (D-311): open while the players see it, struck through while hidden. */
function Eye({ hidden }: { readonly hidden: boolean }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {hidden && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

export function MeasurePanel({ hand, onHand, areas, people, placeId, poiId, dispatch }: Props) {
  const where = { placeId, poiId };
  const nextColour = (id: string) => AREA_COLOURS[(AREA_COLOURS.findIndex((one) => one.id === id) + 1) % AREA_COLOURS.length]!.id;

  return (
    <div className="card measure">
      <h2>Measure</h2>
      <div className="btn-grid tools">
        {MODES.map((mode) => (
          <Tooltip key={mode.id} label={mode.about} placement="bottom" stretch>
            <button
              className={hand.mode === mode.id ? 'on' : ''}
              aria-pressed={hand.mode === mode.id}
              onClick={() => onHand(chooseMeasure(hand, mode.id))}
            >
              {mode.name}
            </button>
          </Tooltip>
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

      <p className="hint">
        {hand.mode === 'ruler'
          ? 'Drag from one cube to another: how far, straight across. It stays until the next drag, and only you see it.'
          : 'Drag to draw it; the players see it too. Drag an area by the mark where it starts to move it.'}
      </p>

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
                      <Eye hidden={area.hidden} />
                    </button>
                  </Tooltip>
                  <Tooltip label={`Take ${area.name} away`} placement="left">
                    <button
                      className="quiet"
                      aria-label={`Take ${area.name} away`}
                      onClick={() => dispatch({ kind: 'removeArea', ...where, id: area.id })}
                    >
                      ×
                    </button>
                  </Tooltip>
                </div>
                <label className="area-follow">
                  <span className="lbl">follows</span>
                  <select
                    value={area.follows ?? ''}
                    aria-label={`Whom ${area.name} follows`}
                    onChange={(e) => dispatch({ kind: 'editArea', ...where, id: area.id, follows: e.target.value || null })}
                  >
                    <option value="">nobody</option>
                    {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                  </select>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

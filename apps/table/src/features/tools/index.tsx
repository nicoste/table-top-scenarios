// The table's tools inside a map (D-344): the first palette this screen has
// had, and kept as small as it can be (R-94). Move is what a click always was
// — the party's own tokens. The ruler measures, and the shapes draw areas the
// way the console's Measure tool does (D-341): the players' own, which they
// may drag by their handle and take away. The GM's areas they see and leave
// alone.

import type { Areas } from '@tt/domain';
import { AREA_COLOURS, AREA_SHAPES, areaColour } from '@tt/domain';
import type { MeasureHand, MeasureMode } from '@tt/client-core';
import { chooseAreaColour, chooseMeasure } from '@tt/client-core';

interface Props {
  /** Measuring or drawing — or neither, which is Move. */
  readonly measuring: boolean;
  readonly hand: MeasureHand;
  readonly onMove: () => void;
  readonly onHand: (hand: MeasureHand) => void;
  /** The areas drawn from this screen, which it may take away. */
  readonly mine: Areas;
  readonly onRemove: (id: string) => void;
}

const MODES: readonly { readonly id: MeasureMode; readonly name: string }[] = [
  { id: 'ruler', name: '⟷ Ruler' },
  ...AREA_SHAPES.map((shape) => ({ id: shape.id, name: shape.name })),
];

export function TableTools({ measuring, hand, onMove, onHand, mine, onRemove }: Props) {
  const drawing = measuring && hand.mode !== 'ruler';
  return (
    <div className="dock">
      <div className="card tools-card">
        <h2>Tools</h2>
        <div className="btn-grid tools">
          <button className={measuring ? '' : 'on'} aria-pressed={!measuring} onClick={onMove}>♟ Move</button>
          {MODES.map((mode) => {
            const on = measuring && hand.mode === mode.id;
            return (
              <button
                key={mode.id}
                className={on ? 'on' : ''}
                aria-pressed={on}
                onClick={() => onHand(chooseMeasure(hand, mode.id))}
              >
                {mode.name}
              </button>
            );
          })}
        </div>
        {drawing && (
          <div className="area-colours">
            {AREA_COLOURS.map((colour) => (
              <button
                key={colour.id}
                className={`chip-button${hand.colour === colour.id ? ' on' : ''}`}
                title={colour.name}
                aria-label={colour.name}
                aria-pressed={hand.colour === colour.id}
                onClick={() => onHand(chooseAreaColour(hand, colour.id))}
              >
                <span className="chip" style={{ background: colour.colour }} />
              </button>
            ))}
          </div>
        )}
        {measuring && mine.length > 0 && (
          <ul className="area-list">
            {mine.map((area) => (
              <li key={area.id}>
                <span className="chip" style={{ background: areaColour(area.colour) }} />
                <span className="nm">{area.name}</span>
                <button className="quiet" aria-label={`Take ${area.name} away`} title="Take it away" onClick={() => onRemove(area.id)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {measuring && (
          <p className="hint">
            {hand.mode === 'ruler'
              ? 'Drag from one cube to another to see how far.'
              : 'Drag to draw. Drag an area of yours by its mark to move it.'}
            {' '}Right-drag moves the view.
          </p>
        )}
      </div>
    </div>
  );
}

// The table's tools inside a map (D-344), laid out as the console lays out its
// own (D-346): a **Tool** card on the left — Move and Measure, the console's
// third and seventh — and, with Measure in hand, a **Measure** card on the
// right with the ruler and the shapes. The same places and the same words, so
// a GM can say "Measure, then Cone" and the players find it where the GM does.
//
// Move is what a click always was — the party's own tokens. The ruler
// measures, and the shapes draw the players' own areas (D-341): theirs to drag
// by their handle and take away. The GM's they see and leave alone. Kept as
// small as it can be (R-94).

import type { Areas } from '@tt/domain';
import { AREA_COLOURS, AREA_SHAPES, areaColour } from '@tt/domain';
import type { MeasureHand, MeasureMode } from '@tt/client-core';
import { chooseAreaColour, chooseMeasure } from '@tt/client-core';

interface Props {
  /** Measure in hand — or not, which is Move. */
  readonly measuring: boolean;
  readonly hand: MeasureHand;
  readonly onMove: () => void;
  readonly onMeasure: () => void;
  readonly onHand: (hand: MeasureHand) => void;
  /** The areas drawn from this screen, which it may take away. */
  readonly mine: Areas;
  readonly onRemove: (id: string) => void;
}

/** In the console's order: the ruler, then the shapes (D-341). */
const MODES: readonly { readonly id: MeasureMode; readonly name: string }[] = [
  { id: 'ruler', name: 'Ruler' },
  ...AREA_SHAPES.map((shape) => ({ id: shape.id, name: shape.name })),
];

export function TableTools({ measuring, hand, onMove, onMeasure, onHand, mine, onRemove }: Props) {
  return (
    <>
      <div className="dock">
        <div className="card tools-card">
          <h2>Tool</h2>
          <div className="btn-grid tools">
            <button className={measuring ? '' : 'on'} aria-pressed={!measuring} onClick={onMove}>♟ Move</button>
            <button className={measuring ? 'on' : ''} aria-pressed={measuring} onClick={onMeasure}>⟷ Measure</button>
          </div>
          <p className="hint">
            {measuring
              ? <>With the <b>Ruler</b>, drag from one cube to another to see how far. With a shape, drag to draw an area. Drag one of yours by the mark where it starts to move it. Right-drag moves the view.</>
              : <>Click one of the party to pick them up, then the top of a block to stand them there.</>}
          </p>
        </div>
      </div>

      {measuring && (
        <div className="dock dock-right measure-dock">
          <div className="card tools-card">
            <h2>Measure</h2>
            <div className="btn-grid tools">
              {MODES.map((mode) => (
                <button
                  key={mode.id}
                  className={hand.mode === mode.id ? 'on' : ''}
                  aria-pressed={hand.mode === mode.id}
                  onClick={() => onHand(chooseMeasure(hand, mode.id))}
                >
                  {mode.name}
                </button>
              ))}
            </div>
            {hand.mode !== 'ruler' && (
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
            <p className="hint">
              {hand.mode === 'ruler'
                ? 'Drag from one cube to another: how far, straight across. Only you see it.'
                : 'Drag to draw it; everybody sees it.'}
            </p>
            {mine.length > 0 && (
              <>
                <p className="lbl">Your areas</p>
                <ul className="area-list">
                  {mine.map((area) => (
                    <li key={area.id}>
                      <span className="chip" style={{ background: areaColour(area.colour) }} />
                      <span className="nm">{area.name}</span>
                      <button
                        className="quiet"
                        aria-label={`Take ${area.name} away`}
                        title="Take it away"
                        onClick={() => onRemove(area.id)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

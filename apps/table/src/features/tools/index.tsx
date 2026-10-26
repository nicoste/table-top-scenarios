// The table's tools inside a map (D-344), laid out as the console lays out its
// own (D-346): a **Tool** card on the left — Play and Measure, the console's
// third and seventh — and, with Measure in hand, a **Measure** card on the
// right with the ruler and the shapes. The same places and the same words, so
// a GM can say "Measure, then Cone" and the players find it where the GM does.
//
// Play is what a click always was — the party's own tokens (D-354). The ruler
// measures, and the shapes draw the players' own areas (D-341): theirs to do
// with as the GM does with any (D-347) — drag by the handle, rename, recolour,
// resize, have one of the party carry it, take it away — all but hide it.
// The GM's they see and leave alone. Kept as small as it can be (R-94).

import type { AreaPatch, Areas } from '@tt/domain';
import { AREA_COLOURS, AREA_SHAPES, MAX_AREA_SIZE, MIN_AREA_SIZE, areaColour } from '@tt/domain';
import type { MeasureHand, MeasureMode } from '@tt/client-core';
import { chooseAreaColour, chooseMeasure } from '@tt/client-core';
import { DraftInput } from '@tt/ui';

interface Props {
  /** Measure in hand — or not, which is Play. */
  readonly measuring: boolean;
  /** Is a move a jump rather than a walk (D-372)? Shift does the other one. */
  readonly leap: boolean;
  readonly onLeap: (leap: boolean) => void;
  readonly hand: MeasureHand;
  readonly onMove: () => void;
  readonly onMeasure: () => void;
  readonly onHand: (hand: MeasureHand) => void;
  /** The areas drawn from this screen: the players' own, to change and take away. */
  readonly mine: Areas;
  /** The party standing here, for an area to follow (D-347). */
  readonly party: readonly { readonly id: string; readonly name: string }[];
  readonly onEdit: (id: string, patch: AreaPatch) => void;
  readonly onRemove: (id: string) => void;
}

/** What an area's size is, in its shape's words. */
const SIZE_WORD = { sphere: 'radius', cone: 'length', line: 'length', cube: 'side' } as const;

/** A size the field will take: whole cubes, in bounds. */
const isSize = (draft: string) => {
  const text = draft.trim();
  if (!/^\d{1,2}$/.test(text)) return false;
  const value = Number(text);
  return value >= MIN_AREA_SIZE && value <= MAX_AREA_SIZE;
};

const nextColour = (id: string) =>
  AREA_COLOURS[(AREA_COLOURS.findIndex((one) => one.id === id) + 1) % AREA_COLOURS.length]!.id;

/** In the console's order: the ruler, then the shapes (D-341). */
const MODES: readonly { readonly id: MeasureMode; readonly name: string }[] = [
  { id: 'ruler', name: 'Ruler' },
  ...AREA_SHAPES.map((shape) => ({ id: shape.id, name: shape.name })),
];

export function TableTools({ measuring, leap, onLeap, hand, onMove, onMeasure, onHand, mine, party, onEdit, onRemove }: Props) {
  return (
    <>
      <div className="dock">
        <div className="card tools-card">
          <h2>Tool</h2>
          <div className="btn-grid tools">
            <button className={measuring ? '' : 'on'} aria-pressed={!measuring} onClick={onMove}>▶ Play</button>
            <button className={measuring ? 'on' : ''} aria-pressed={measuring} onClick={onMeasure}>⟷ Measure</button>
          </div>
          {/*
            Ground or jump (D-372): on screen, so a mouse alone or a finger can
            jump. Shift does the other one while it is held.
          */}
          {!measuring && (
            <>
              <p className="lbl">Path</p>
              <div className="btn-grid tools">
                <button className={leap ? '' : 'on'} aria-pressed={!leap} onClick={() => onLeap(false)}>Ground path</button>
                <button className={leap ? 'on' : ''} aria-pressed={leap} onClick={() => onLeap(true)}>Jump path</button>
              </div>
            </>
          )}
          <p className="hint">
            {measuring
              ? <>With the <b>Ruler</b>, drag from one cube to another to see how far. With a shape, drag to draw an area. Drag one of yours by the mark where it starts to move it. Right-drag moves the view.</>
              : <>Click one of the party to pick them up, then the top of a block to stand them there. <b>Jump path</b> leaps straight there instead of walking; <b>⇧ shift</b> does the other one.</>}
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
                      <div className="area-row">
                        <button
                          className="chip-button"
                          title="Its colour — click for the next"
                          aria-label={`${area.name}'s colour`}
                          onClick={() => onEdit(area.id, { colour: nextColour(area.colour) })}
                        >
                          <span className="chip" style={{ background: areaColour(area.colour) }} />
                        </button>
                        <DraftInput
                          value={area.name}
                          aria-label={`${area.name}'s name`}
                          valid={(name) => name.trim().length > 0}
                          onCommit={(name) => onEdit(area.id, { name })}
                        />
                        <DraftInput
                          className="size"
                          title={`Its ${SIZE_WORD[area.shape]}, in cubes`}
                          aria-label={`${area.name}'s ${SIZE_WORD[area.shape]}`}
                          inputMode="numeric"
                          value={String(area.size)}
                          valid={isSize}
                          onCommit={(draft) => onEdit(area.id, { size: Number(draft.trim()) })}
                        />
                        <button
                          className="quiet"
                          aria-label={`Take ${area.name} away`}
                          title="Take it away"
                          onClick={() => onRemove(area.id)}
                        >
                          ×
                        </button>
                      </div>
                      <label className="area-follow">
                        <span className="lbl">follows</span>
                        <select
                          value={area.follows ?? ''}
                          aria-label={`Whom ${area.name} follows`}
                          onChange={(e) => onEdit(area.id, { follows: e.target.value || null })}
                        >
                          <option value="">nobody</option>
                          {party.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                        </select>
                      </label>
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

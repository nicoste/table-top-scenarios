// The table's tools inside a map (D-344, D-381), laid out as the console lays
// out its own (D-346): a **Tool** card on the left — Play and Measure, the
// console's third and seventh — and, with Measure in hand, a **Measure** card
// on the right with the ruler and the shapes.
//
// Controls render as squared voxel `SlotButton`s with canonical monochrome
// `GameIcon`s (Icon + 1-word label + bottom `Tooltip`), so `walk` serves Ground
// path and `measure` serves both the Measure tool and the Ruler mode inside it
// (R-217).

import type { AreaPatch, Areas } from '@tt/domain';
import { AREA_COLOURS, AREA_SHAPES, MAX_AREA_SIZE, MIN_AREA_SIZE, areaColour } from '@tt/domain';
import type { MeasureHand, MeasureMode } from '@tt/client-core';
import { chooseAreaColour, chooseMeasure } from '@tt/client-core';
import { DraftInput, SlotButton, Tooltip } from '@tt/ui';
import type { GameIconName } from '@tt/ui';

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

/** Canonical icon and bottom tooltip per measure mode (R-217). */
const MODE_META: Record<MeasureMode, { readonly icon: GameIconName; readonly tip: string }> = {
  ruler: { icon: 'measure', tip: 'Drag from one cube to another — only this screen sees it' },
  sphere: { icon: 'sphere', tip: 'Drag from centre to radius — everyone sees it' },
  cone: { icon: 'cone', tip: 'Drag from origin to aim point — everyone sees it' },
  line: { icon: 'line', tip: 'Drag from origin to end point — everyone sees it' },
  cube: { icon: 'cube', tip: 'Drag from centre to edge — everyone sees it' },
};

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
            <SlotButton
              icon="play"
              label="Play"
              active={!measuring}
              tooltip="Click your token, then a floor block to move"
              onClick={onMove}
            />
            <SlotButton
              icon="measure"
              label="Measure"
              active={measuring}
              tooltip="Measure distance with the ruler or draw an area"
              onClick={onMeasure}
            />
          </div>
          {!measuring && (
            <>
              <p className="lbl">Path</p>
              <div className="btn-grid tools">
                <SlotButton
                  icon="walk"
                  label="Ground"
                  active={!leap}
                  tooltip="Ground path — walks across floors and stairs"
                  onClick={() => onLeap(false)}
                />
                <SlotButton
                  icon="jump"
                  label="Jump"
                  active={leap}
                  tooltip="Jump path — leaps straight across gaps and ledges"
                  onClick={() => onLeap(true)}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {measuring && (
        <div className="dock dock-right measure-dock">
          <div className="card tools-card">
            <h2>Measure</h2>
            <div className="btn-grid tools">
              {MODES.map((mode) => (
                <SlotButton
                  key={mode.id}
                  icon={MODE_META[mode.id].icon}
                  label={mode.name}
                  active={hand.mode === mode.id}
                  tooltip={MODE_META[mode.id].tip}
                  onClick={() => onHand(chooseMeasure(hand, mode.id))}
                />
              ))}
            </div>
            {hand.mode !== 'ruler' && (
              <div className="area-colours">
                {AREA_COLOURS.map((colour) => (
                  <Tooltip key={colour.id} label={colour.name} placement="bottom">
                    <button
                      type="button"
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
            {mine.length > 0 && (
              <>
                <p className="lbl">Your areas</p>
                <ul className="area-list">
                  {mine.map((area) => (
                    <li key={area.id}>
                      <div className="area-row">
                        <Tooltip label="Colour — click for next" placement="bottom">
                          <button
                            type="button"
                            className="chip-button"
                            aria-label={`${area.name}'s colour`}
                            onClick={() => onEdit(area.id, { colour: nextColour(area.colour) })}
                          >
                            <span className="chip" style={{ background: areaColour(area.colour) }} />
                          </button>
                        </Tooltip>
                        <DraftInput
                          value={area.name}
                          aria-label={`${area.name}'s name`}
                          valid={(name) => name.trim().length > 0}
                          onCommit={(name) => onEdit(area.id, { name })}
                        />
                      </div>
                      <div className="area-follow">
                        <DraftInput
                          className="size"
                          title={`Its ${SIZE_WORD[area.shape]}, in cubes`}
                          aria-label={`${area.name}'s ${SIZE_WORD[area.shape]}`}
                          inputMode="numeric"
                          value={String(area.size)}
                          valid={isSize}
                          onCommit={(draft) => onEdit(area.id, { size: Number(draft.trim()) })}
                        />
                        <span className="lbl">follows</span>
                        <select
                          value={area.follows ?? ''}
                          aria-label={`Whom ${area.name} follows`}
                          onChange={(e) => onEdit(area.id, { follows: e.target.value || null })}
                        >
                          <option value="">nobody</option>
                          {party.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                        </select>
                        <Tooltip label="Take it away" placement="bottom">
                          <button
                            type="button"
                            className="quiet danger-trigger"
                            aria-label={`Take ${area.name} away`}
                            onClick={() => onRemove(area.id)}
                          >
                            ×
                          </button>
                        </Tooltip>
                      </div>
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

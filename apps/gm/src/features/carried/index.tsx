// A light somebody on stage carries (D-335): a flame beside their row, lit or
// not, and — while it is — a line under the row with how far it reaches and
// the colour it gives. Party members and silver tokens alike; the GM's, like
// a door (D-328).

import type { CarriedLight } from '@tt/domain';
import { FLAMES, MAX_LIGHT_REACH, MIN_LIGHT_REACH, TORCH, flameColour } from '@tt/domain';
import { DraftInput, GameIcon, Tooltip } from '@tt/ui';

/**
 * A flame, outlined while there is none and filled in its colour while there
 * is: the registry's `light`, in the colour of the light it stands for.
 */
function Flame({ colour }: { readonly colour: string | null }) {
  return (
    <span style={{ display: 'inline-flex', color: colour ?? undefined }}>
      <GameIcon name="light" size={15} filled={colour !== null} />
    </span>
  );
}

/** A reach the field will take: whole cubes, inside the bounds — a light's, carried or placed. */
export const isReach = (draft: string) => {
  const text = draft.trim();
  if (!/^\d{1,2}$/.test(text)) return false;
  const value = Number(text);
  return value >= MIN_LIGHT_REACH && value <= MAX_LIGHT_REACH;
};

/** The flame by a row: gives them a torch, or takes theirs away. */
export function FlameButton({ light, name, onChange }: {
  readonly light: CarriedLight | null;
  readonly name: string;
  readonly onChange: (light: CarriedLight | null) => void;
}) {
  return (
    <Tooltip
      label={light ? `${name} carries a light — click to put it out` : `Give ${name} a light to carry`}
      placement="left"
    >
      <button
        className={`quiet flame${light ? '' : ' off'}`}
        aria-pressed={!!light}
        aria-label={light ? `Put out ${name}'s light` : `Give ${name} a light`}
        onClick={() => onChange(light ? null : TORCH)}
      >
        <Flame colour={light ? flameColour(light.flame) : null} />
      </button>
    </Tooltip>
  );
}

/** Under the row while they carry one: how far, and which flame. */
export function CarriedLightLine({ light, name, onChange }: {
  readonly light: CarriedLight;
  readonly name: string;
  readonly onChange: (light: CarriedLight) => void;
}) {
  return (
    <div className="stage-light">
      <Tooltip label={`How far ${name}'s light reaches`} placement="left">
        <span className="stage-sight">
          <span className="lbl">lights</span>
          <DraftInput
            className="sight"
            aria-label={`How far ${name}'s light reaches`}
            inputMode="numeric"
            value={String(light.reach)}
            valid={isReach}
            onCommit={(draft) => onChange({ ...light, reach: Number(draft.trim()) })}
          />
        </span>
      </Tooltip>
      <span className="prop-finishes">
        {FLAMES.map((flame) => (
          <Tooltip key={flame.id} label={flame.name} placement="bottom">
            <button
              className={`chip-button${flame.id === light.flame ? ' on' : ''}`}
              aria-label={flame.name}
              aria-pressed={flame.id === light.flame}
              onClick={() => onChange({ ...light, flame: flame.id })}
            >
              <span className="chip" style={{ background: flame.colour }} />
            </button>
          </Tooltip>
        ))}
      </span>
    </div>
  );
}

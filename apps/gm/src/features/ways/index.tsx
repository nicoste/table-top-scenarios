// What the party can travel by, asked before they go anywhere (R-200).
//
// Every other tool shows what it will do the moment you pick it up — the
// ground tool its materials, the cover tool its trees. Travel used to ask
// nothing until after a pawn was picked and a destination aimed at, and then
// asked everything at once. This is the same question moved to where the
// other tools ask theirs (D-299).
//
// **Three answers, one per medium**, and `None` is the interesting one: no
// water conveyance is exactly what makes a river a wall, and no air
// conveyance is the ordinary case. The party then travels by whichever of its
// answers suits the cell it is entering, so walking to a coast and sailing is
// one journey rather than two moves.

import type { Medium, TravelMode, TravelModeId, Travelling } from '@tt/domain';
import { Tooltip } from '@tt/ui';

export interface WaysPanelProps {
  readonly modes: readonly TravelMode[];
  readonly travelling: Travelling;
  onTravelling: (travelling: Travelling) => void;
}

const GROUPS: readonly {
  readonly medium: Medium;
  readonly title: string;
  readonly none: string;
}[] = [
  { medium: 'land', title: 'On land', none: 'Cannot cross land' },
  { medium: 'water', title: 'On water', none: 'Cannot cross water' },
  { medium: 'air', title: 'In the air', none: 'Cannot fly' },
];

export function WaysPanel({ modes, travelling, onTravelling }: WaysPanelProps) {
  return (
    <div className="card">
      <h2>Travelling by</h2>
      {GROUPS.map(({ medium, title, none }) => {
        const chosen = travelling[medium];
        return (
          <div key={medium} className="way-group">
            <p className="lbl">{title}</p>
            <ul className="palette ways">
              {/*
                None first, and a choice like any other rather than a cleared
                selection: "we have no boat" is a fact about the party, and it
                is the fact that decides where they can go.
              */}
              <li>
                <Tooltip label={none} placement="left" stretch>
                  <button
                    className={chosen === null ? 'on' : ''}
                    onClick={() => onTravelling({ ...travelling, [medium]: null })}
                    aria-pressed={chosen === null}
                  >
                    <span className="nm">None</span>
                    <span className="diff">—</span>
                  </button>
                </Tooltip>
              </li>
              {modes.filter((mode) => mode.medium === medium).map((mode) => (
                <li key={mode.id}>
                  <Tooltip label={`${mode.name} — ${mode.kmPerDay} km a day`} placement="left" stretch>
                    <button
                      className={mode.id === chosen ? 'on' : ''}
                      onClick={() => onTravelling({ ...travelling, [medium]: mode.id as TravelModeId })}
                      aria-pressed={mode.id === chosen}
                    >
                      <span className="nm">{mode.name}</span>
                      <span className="diff">{mode.kmPerDay} km</span>
                    </button>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <p className="hint">
        The party uses whichever of these suits the ground under them, so
        walking to a coast and sailing from it is <b>one journey</b>. With
        nothing on the water, a river is a wall.
      </p>
    </div>
  );
}

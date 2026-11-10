// A row's action drawn as an icon (R-217a, D-390): move up, move down, edit.
//
// A component rather than a button each site writes, so an icon never stands
// alone with nothing to say what it does: its name is its tooltip and its
// accessible name, always, and never a native `title`. Leans on the host's
// `button.quiet.icon` for its square, as `ConfirmDelete` leans on
// `button.quiet` (R-111).

import { GameIcon } from '../game-icon/index.js';
import type { GameIconName } from '../game-icon/index.js';
import { Tooltip } from '../tooltip/index.js';
import type { Placement } from '../tooltip/index.js';

export interface IconButtonProps {
  readonly icon: GameIconName;
  /** What it does: the tooltip, and the name a screen reader says. */
  readonly label: string;
  readonly placement?: Placement;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}

export function IconButton({ icon, label, placement = 'top', disabled = false, onClick }: IconButtonProps) {
  return (
    <Tooltip label={label} placement={placement}>
      <button type="button" className="quiet icon" aria-label={label} disabled={disabled} onClick={onClick}>
        <GameIcon name={icon} size={14} />
      </button>
    </Tooltip>
  );
}

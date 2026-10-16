// Everyone in this map who is not the party (R-206): their names, which the
// GM may change; whether the players may see them; and taking one away, which
// asks first — play state is not under undo (R-140).

import type { Intent, SilverTokenWire, TokenTemplateWire } from '@tt/protocol';
import { imageUrl } from '@tt/protocol';
import { ConfirmDelete, DraftInput, Tooltip } from '@tt/ui';

const GREY = '#858c94';

interface Props {
  silver: readonly SilverTokenWire[];
  library: readonly TokenTemplateWire[];
  placeId: string;
  poiId: string;
  dispatch: (intent: Intent) => void;
}

export function OnStagePanel({ silver, library, placeId, poiId, dispatch }: Props) {
  const pictureOf = (templateId: string) => library.find((entry) => entry.id === templateId)?.image ?? null;
  const where = { placeId, poiId };

  return (
    <div className="card on-stage">
      <h2>On stage</h2>
      {silver.length === 0 ? (
        <p className="hint">
          Nobody but the party. Pick <b>Spawn</b> (key 4) and a token from the
          library, then click floors.
        </p>
      ) : (
        <ul className="stage-list">
          {silver.map((token) => {
            const picture = pictureOf(token.templateId);
            return (
              <li key={token.id} className={token.hidden ? 'hidden' : ''}>
                <span
                  className="library-card"
                  style={picture ? { backgroundImage: `url(${imageUrl(picture)})` } : { background: GREY }}
                />
                <DraftInput
                  value={token.name}
                  valid={(name) => name.trim().length > 0}
                  onCommit={(name) => dispatch({ kind: 'renameSilver', ...where, id: token.id, name })}
                />
                <ConfirmDelete
                  label={`Take ${token.name} off the map`}
                  confirmLabel="Remove"
                  onConfirm={() => dispatch({ kind: 'removeSilver', ...where, id: token.id })}
                >
                  {/*
                    Only ever hides more (R-206): a token the party cannot see
                    is not sent whatever this says.
                  */}
                  <Tooltip
                    label={token.hidden
                      ? 'Hidden from the players — click to let them see it when they can'
                      : 'The players see it when the party can — click to hide it'}
                    placement="left"
                  >
                    <button
                      className={`quiet eye${token.hidden ? ' off' : ''}`}
                      aria-pressed={token.hidden}
                      aria-label={token.hidden ? `Show ${token.name}` : `Hide ${token.name}`}
                      onClick={() => dispatch({ kind: 'hideSilver', ...where, id: token.id, hidden: !token.hidden })}
                    >
                      {token.hidden ? '◌' : '◉'}
                    </button>
                  </Tooltip>
                </ConfirmDelete>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Everyone in this map who is not the party (R-206): their names, which the
// GM may change; whether the players may see them; and taking one away, which
// asks first — play state is not under undo (R-140).

import type { Intent, SilverTokenWire, TokenTemplateWire } from '@tt/protocol';
import { imageUrl } from '@tt/protocol';
import { ConfirmDelete, DraftInput, Tooltip } from '@tt/ui';

const GREY = '#858c94';

/**
 * The eye a password field uses to show and hide what is typed (D-311): open
 * while the players may see the token, struck through while it is hidden.
 * Drawn here rather than borrowed — an outline and a circle, and a slash.
 */
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
                      <Eye hidden={token.hidden === true} />
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

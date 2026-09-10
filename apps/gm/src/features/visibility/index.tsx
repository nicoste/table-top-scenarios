// What the party knows (R-16). GM console only — the table display never
// receives discovery data at all.
//
// There is no save panel. A campaign has exactly one save and it autosaves; the
// Known and Revealed toggles are their own undo (D-147).

import type { Intent } from '@tt/protocol';
import { Tooltip } from '@tt/ui';

interface ChunkProps {
  coord: { cx: number; cz: number };
  known: boolean;
  poiCount: number;
  revealedPoiCount: number;
  dispatch: (intent: Intent) => void;
}

export function ChunkInspector({ coord, known, poiCount, revealedPoiCount, dispatch }: ChunkProps) {
  return (
    <div className="card">
      <h2>Chunk {coord.cx},{coord.cz}</h2>

      <div className="reveal">
        <Tooltip
          label={known ? 'Players can see this chunk' : 'Hidden from the players'}
          placement="left"
        >
          <button
            className={known ? 'on' : ''}
            aria-pressed={known}
            onClick={() => dispatch({ kind: 'setChunkKnown', cx: coord.cx, cz: coord.cz, known: !known })}
          >
            {known ? '👁 Known' : '🔒 Unknown'}
          </button>
        </Tooltip>
      </div>

      <p className="hint">
        {poiCount === 0
          ? 'No places here.'
          : <>{revealedPoiCount} of {poiCount} place{poiCount > 1 ? 's' : ''} revealed.</>}
      </p>

      {poiCount > 0 && (
        <div className="row">
          <button onClick={() => dispatch({ kind: 'revealChunk', cx: coord.cx, cz: coord.cz, withPois: true })}>
            Reveal chunk + places
          </button>
        </div>
      )}

      {/* A place still needs its chunk Known to reach the table (D-132), so say
          so rather than letting the GM wonder why nothing appeared. */}
      {!known && revealedPoiCount > 0 && (
        <p className="warn">
          {revealedPoiCount} place{revealedPoiCount > 1 ? 's are' : ' is'} marked revealed but
          {revealedPoiCount > 1 ? ' stay' : ' stays'} hidden while this chunk is Unknown.
        </p>
      )}
    </div>
  );
}


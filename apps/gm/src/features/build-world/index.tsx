// The paint and height tools (R-88, R-89). Owns its panel, its gesture handling
// and the intents it sends.

// The registries are code, not campaign data (D-107), so this imports them
// rather than reading a copy off the wire — which the renderer always did, and
// which the panels had quietly not been doing (D-222).
import { DEFAULT_MATERIALS, cutOf, difficultyOf, familyOf, cutIdIn } from '@tt/domain';
import type { SwatchId } from '@tt/domain';
import type { Tool } from '@tt/client-core';
import { Tooltip } from '@tt/ui';
import { SwatchPalette } from '../swatches/index.js';

interface Props {
  tool: Tool;
  /** What the brush is loaded with: a swatch, the same as a map's (D-280). */
  ground: SwatchId;
  brush: number;
  hoverLabel: string | null;
  onTool: (tool: Tool) => void;
  onGround: (ground: SwatchId) => void;
  onBrush: (size: number) => void;
}

/** "×1.5", or the mark for ground a party cannot cross at all (R-192). */
const costOf = (difficulty: number | 'impassable') =>
  (difficulty === 'impassable' ? '✕' : `×${difficulty}`);

const BRUSHES = [1, 2, 3] as const;

export function BuildWorldPanel({
  tool, ground, brush, hoverLabel, onTool, onGround, onBrush,
}: Props) {
  const family = familyOf(ground);
  const selected = family ? cutOf(family, cutIdIn(ground)) : null;

  return (
    <>
      <div className="card">
        <h2>Tool</h2>
        <div className="btn-grid tools">
          <Tooltip label="Select — key 1" placement="bottom" stretch>
            <button className={tool === 'select' ? 'on' : ''} onClick={() => onTool('select')}>
              ⌖ Select
            </button>
          </Tooltip>
          <Tooltip label="Paint the ground — key 2" placement="bottom" stretch>
            <button className={tool === 'paint' ? 'on' : ''} onClick={() => onTool('paint')}>
              🖌 Paint
            </button>
          </Tooltip>
          <Tooltip label="Raise and lower — key 3" placement="bottom" stretch>
            <button className={tool === 'height' ? 'on' : ''} onClick={() => onTool('height')}>
              ⛰ Height
            </button>
          </Tooltip>
          <Tooltip label="Place markers on the world map — key 4" placement="bottom" stretch>
            <button className={tool === 'places' ? 'on' : ''} onClick={() => onTool('places')}>
              ⚑ Places
            </button>
          </Tooltip>
          {/* Spans both columns rather than sitting alone in half of row three. */}
          <Tooltip label="Move the party — key 5" placement="bottom" stretch>
            <button
              className={`wide${tool === 'travel' ? ' on' : ''}`}
              onClick={() => onTool('travel')}
            >
              ⤳ Travel
            </button>
          </Tooltip>
        </div>
        <p className="hint">
          {tool === 'select'
            ? <>Click a place to inspect it. Nothing else is editable yet.</>
            : tool === 'paint'
              ? <>Click, or drag to paint many cells.{selected ? <> Painting <b>{selected.name}</b>.</> : null}</>
              : tool === 'height'
                ? <>Drag a cell up or down. Each step is 150&nbsp;m.</>
                : tool === 'travel'
                  ? <>Click a pawn, aim, then click to confirm. Escape or right-click cancels.</>
                  : <>Click an empty cell to place a new one.</>}
        </p>

        {(tool === 'paint' || tool === 'height') && (
        <div className="brush-group">
          <span className="brush-lbl">Brush</span>
          <div className="btn-grid brush">
            {BRUSHES.map((n) => (
              <Tooltip key={n} label={`${n}×${n} cells — key ${n + 5}`} placement="bottom" stretch>
                <button className={brush === n ? 'on' : ''} onClick={() => onBrush(n)} aria-pressed={brush === n}>
                  {n}×{n}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>
        )}

        {/* The readout lives here, not in the terrain card, so it survives that
            card being hidden while the height tool is active. */}
        <p className="readout">{hoverLabel ?? '—'}</p>
      </div>

      {/*
        The ground is only offered while the brush is active. Being able to
        pick one that the current tool will not apply is a standing invitation
        to wonder why nothing happened.
      */}
      {tool === 'paint' && (
        <div className="card">
          {/* The map's panel, unchanged (D-282). A world cell and a cube hold
              the same kind of value, so they are picked the same way — and
              every cut is labelled, never colour alone: a colour-blind GM
              cannot pick "the green one". */}
          <h2>Ground</h2>
          <SwatchPalette
            materials={DEFAULT_MATERIALS}
            chosen={ground}
            onSwatch={onGround}
            /* What a map has no use for and the world lives on: a cost. It is
               on the squares as well as the chosen line because this is the
               panel a GM scans while deciding where a road goes. */
            cutLabel={(material, cutId) => {
              const difficulty = difficultyOf(material, cutId);
              const cut = cutOf(material, cutId);
              return difficulty === 'impassable'
                ? `${cut.name} — impassable on foot`
                : `${cut.name} — travel cost ×${difficulty}`;
            }}
            detail={(material, cutId) => (
              <span className="diff">{costOf(difficultyOf(material, cutId))}</span>
            )}
            hint={(
              <>
                A row is how a thing is built; the squares are what it is made
                of. The cost is what one cell of it takes to cross on foot —
                a climb is charged on top, from the height.
              </>
            )}
          />
        </div>
      )}
    </>
  );
}

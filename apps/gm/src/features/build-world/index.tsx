// The world's tools (R-88, R-89, R-193). Owns its panel, its gesture handling
// and the intents it sends.

// The registries are code, not campaign data (D-107), so this imports them
// rather than reading a copy off the wire — which the renderer always did, and
// which the panels had quietly not been doing (D-222).
import {
  DEFAULT_MATERIALS, DEFAULT_COVERS,
  cutOf, difficultyOf, familyOf, cutIdIn, coverById,
} from '@tt/domain';
import type { CoverId, SwatchId } from '@tt/domain';
import type { Tool } from '@tt/client-core';
import { Tooltip } from '@tt/ui';
import { SwatchPalette } from '../swatches/index.js';

interface Props {
  tool: Tool;
  /** What the ground brush is loaded with: a swatch, as a map's is (D-280). */
  ground: SwatchId;
  /** What the cover brush is loaded with; null is the eraser (R-193). */
  cover: CoverId | null;
  brush: number;
  hoverLabel: string | null;
  onTool: (tool: Tool) => void;
  onGround: (ground: SwatchId) => void;
  onCover: (cover: CoverId | null) => void;
  onBrush: (size: number) => void;
}

/** "×1.5", or the mark for ground a party cannot cross at all (R-192). */
const costOf = (difficulty: number | 'impassable') =>
  (difficulty === 'impassable' ? '✕' : `×${difficulty}`);

const BRUSHES = [1, 2, 3] as const;
/** Which tools lay something down over an area, and so take a brush. */
const BRUSHED: readonly Tool[] = ['paint', 'cover', 'height'];

export function BuildWorldPanel({
  tool, ground, cover, brush, hoverLabel, onTool, onGround, onCover, onBrush,
}: Props) {
  const family = familyOf(ground);
  const selected = family ? cutOf(family, cutIdIn(ground)) : null;
  const standing = cover ? coverById(DEFAULT_COVERS, cover) : null;

  return (
    <>
      <div className="card">
        <h2>Tool</h2>
        {/*
          Paired by what they are for, down the two columns: the two that
          change nothing, then the two that shape the land, then the two that
          dress it (D-285). The icons are the map's own — the same action is
          the same picture on both surfaces, so a GM who learns ✏ for
          repainting a wall has learned it for repainting a coast.
        */}
        <div className="btn-grid tools">
          <Tooltip label="Select — key 1" placement="bottom" stretch>
            <button className={tool === 'select' ? 'on' : ''} onClick={() => onTool('select')}>
              ⌖ Select
            </button>
          </Tooltip>
          <Tooltip label="Move the party — key 2" placement="bottom" stretch>
            <button className={tool === 'travel' ? 'on' : ''} onClick={() => onTool('travel')}>
              ♟ Travel
            </button>
          </Tooltip>
          <Tooltip label="Place markers on the world map — key 3" placement="bottom" stretch>
            <button className={tool === 'places' ? 'on' : ''} onClick={() => onTool('places')}>
              ⚑ Places
            </button>
          </Tooltip>
          <Tooltip label="Raise and lower — key 4" placement="bottom" stretch>
            <button className={tool === 'height' ? 'on' : ''} onClick={() => onTool('height')}>
              ⛰ Height
            </button>
          </Tooltip>
          <Tooltip label="Paint what a cell is made of — key 5" placement="bottom" stretch>
            <button className={tool === 'paint' ? 'on' : ''} onClick={() => onTool('paint')}>
              ✏ Ground
            </button>
          </Tooltip>
          {/* The second axis, beside the first and not inside it: a cell holds
              both, and either may be painted without disturbing the other. */}
          <Tooltip label="Plant what stands on it — key 6" placement="bottom" stretch>
            <button className={tool === 'cover' ? 'on' : ''} onClick={() => onTool('cover')}>
              ⇞ Cover
            </button>
          </Tooltip>
        </div>
        <p className="hint">
          {tool === 'select'
            ? <>Click a place to inspect it. Nothing else is editable yet.</>
            : tool === 'paint'
              ? <>Click, or drag to paint many cells.{selected ? <> Painting <b>{selected.name}</b>.</> : null}</>
              : tool === 'cover'
                ? <>Click, or drag. {standing ? <>Planting <b>{standing.name}</b>.</> : <>Clearing what is there.</>} The ground underneath is untouched.</>
                : tool === 'height'
                  ? <>Drag a cell up or down. Each step is 150&nbsp;m.</>
                  : tool === 'travel'
                    ? <>Click a pawn, aim, then click to confirm. Escape or right-click cancels.</>
                    : <>Click an empty cell to place a new one.</>}
        </p>

        {BRUSHED.includes(tool) && (
        <div className="brush-group">
          <span className="brush-lbl">Brush</span>
          <div className="btn-grid brush">
            {BRUSHES.map((n) => (
              <Tooltip key={n} label={`${n}×${n} cells — key ${n + 6}`} placement="bottom" stretch>
                <button className={brush === n ? 'on' : ''} onClick={() => onBrush(n)} aria-pressed={brush === n}>
                  {n}×{n}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>
        )}

        {/* The readout lives here, not in the ground card, so it survives that
            card being hidden while the height tool is active. */}
        <p className="readout">{hoverLabel ?? '—'}</p>
      </div>

      {/*
        The ground is only offered while its brush is active. Being able to
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

      {tool === 'cover' && (
        <div className="card">
          <h2>Cover</h2>
          <ul className="palette covers">
            {/* Nothing is first and is a cover like the others, not a separate
                eraser gesture: clearing a cell is picking what stands on it
                (R-193). */}
            <li>
              <button
                className={cover === null ? 'on' : ''}
                onClick={() => onCover(null)}
                aria-pressed={cover === null}
              >
                <span className="nm">Nothing</span>
                <span className="diff">×1</span>
              </button>
            </li>
            {DEFAULT_COVERS.map((entry) => (
              <li key={entry.id}>
                <Tooltip
                  label={`${entry.name} — multiplies the ground's cost by ${entry.difficulty}`}
                  placement="left"
                  stretch
                >
                  <button
                    className={entry.id === cover ? 'on' : ''}
                    onClick={() => onCover(entry.id)}
                    aria-pressed={entry.id === cover}
                  >
                    <span className="nm">{entry.name}</span>
                    <span className="diff">×{entry.difficulty}</span>
                  </button>
                </Tooltip>
              </li>
            ))}
          </ul>
          <p className="hint">
            A cover <b>multiplies</b> what the ground under it costs, so grass
            at ×1 with trees on it is a forest at ×1.5 and sand is ×2.25. What
            cannot be crossed at all stays that way whatever grows in it.
          </p>
        </div>
      )}

    </>
  );
}

// The world's tools (R-88, R-89, R-193). Owns its panel, its gesture handling
// and the intents it sends.

// The registries are code, not campaign data (D-107), so this imports them
// rather than reading a copy off the wire — which the renderer always did, and
// which the panels had quietly not been doing (D-222).
import {
  DEFAULT_MATERIALS, DEFAULT_COVERS, WORLD_BRUSHES,
  cutOf, difficultyOf,
} from '@tt/domain';
import type { CoverId, SwatchId } from '@tt/domain';
import type { Tool } from '@tt/client-core';
import { worldToolShows } from '@tt/client-core';
import { SlotButton, Tooltip } from '@tt/ui';
import { SwatchPalette } from '../swatches/index.js';

interface Props {
  tool: Tool;
  /** What the ground brush is loaded with: a swatch, as a map's is (D-280). */
  ground: SwatchId;
  /** What the cover brush is loaded with; null is the eraser (R-193). */
  cover: CoverId | null;
  brush: number;
  /** How far one height step rises: a quarter of the campaign's cell (D-373). */
  metresPerStep: number;
  hoverLabel: string | null;
  onTool: (tool: Tool) => void;
  onGround: (ground: SwatchId) => void;
  onCover: (cover: CoverId | null) => void;
  onBrush: (size: number) => void;
}

/** "×1.5", or the mark for ground a party cannot cross at all (R-192). */
const costOf = (difficulty: number | 'impassable') =>
  (difficulty === 'impassable' ? '✕' : `×${difficulty}`);


export function BuildWorldPanel({
  tool, ground, cover, brush, metresPerStep, hoverLabel, onTool, onGround, onCover, onBrush,
}: Props) {
  return (
    <>
      <div className="card">
        <h2>Tool</h2>
        <div className="btn-grid tools">
          <SlotButton
            icon="select"
            label="Select"
            hotkey="1"
            active={tool === 'select'}
            tooltip="Click a place to edit it, or open ground to reveal its chunk — key 1"
            onClick={() => onTool('select')}
          />
          <SlotButton
            icon="walk"
            label="Travel"
            hotkey="2"
            active={tool === 'travel'}
            tooltip="Click a pawn, aim, then click to confirm; Escape or right-click cancels — key 2"
            onClick={() => onTool('travel')}
          />
          <SlotButton
            icon="places"
            label="Places"
            hotkey="3"
            active={tool === 'places'}
            tooltip="Click an empty cell to place a marker, or a place to move it (Z/X turn); right-click puts it back — key 3"
            onClick={() => onTool('places')}
          />
          <SlotButton
            icon="height"
            label="Height"
            hotkey="4"
            active={tool === 'height'}
            tooltip={`Drag a cell up or down (${metresPerStep} m per step) — key 4`}
            onClick={() => onTool('height')}
          />
          <SlotButton
            icon="ground"
            label="Ground"
            hotkey="5"
            active={tool === 'paint'}
            tooltip="Click or drag to paint what a cell is made of — key 5"
            onClick={() => onTool('paint')}
          />
          <SlotButton
            icon="cover"
            label="Cover"
            hotkey="6"
            active={tool === 'cover'}
            tooltip="Click or drag to plant what stands on the ground — key 6"
            onClick={() => onTool('cover')}
          />
        </div>

        {worldToolShows(tool, 'brush') && (
        <div className="brush-group">
          <span className="lbl">Brush</span>
          <div className="btn-grid brush">
            {WORLD_BRUSHES.map((n, i) => (
              <Tooltip key={n} label={`${n === 1 ? 'One cell' : `Round, ${n} across`} — key ${['7', '8', '9', '0', '−', '='][i]}`} placement="bottom" stretch>
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
      {worldToolShows(tool, 'ground') && (
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

      {worldToolShows(tool, 'cover') && (
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

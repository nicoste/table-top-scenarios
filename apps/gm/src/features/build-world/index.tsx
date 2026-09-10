// The paint and height tools (R-88, R-89). Owns its panel, its gesture handling
// and the intents it sends.

import type { CampaignWire } from '@tt/protocol';
import type { Tool } from '@tt/client-core';
import { Tooltip } from '@tt/ui';

interface Props {
  campaign: CampaignWire;
  tool: Tool;
  terrainId: string;
  brush: number;
  hoverLabel: string | null;
  onTool: (tool: Tool) => void;
  onTerrain: (id: string) => void;
  onBrush: (size: number) => void;
}

const BRUSHES = [1, 2, 3] as const;

export function BuildWorldPanel({
  campaign, tool, terrainId, brush, hoverLabel, onTool, onTerrain, onBrush,
}: Props) {
  const selected = campaign.terrain.find((t) => t.id === terrainId);

  return (
    <>
      <div className="card">
        <h2>Tool</h2>
        <div className="tools">
          <Tooltip label="Select — key 1" placement="bottom" stretch>
            <button className={tool === 'select' ? 'on' : ''} onClick={() => onTool('select')}>
              ⌖ Select
            </button>
          </Tooltip>
          <Tooltip label="Paint terrain — key 2" placement="bottom" stretch>
            <button className={tool === 'paint' ? 'on' : ''} onClick={() => onTool('paint')}>
              🖌 Paint
            </button>
          </Tooltip>
          <Tooltip label="Raise and lower — key 3" placement="bottom" stretch>
            <button className={tool === 'height' ? 'on' : ''} onClick={() => onTool('height')}>
              ⛰ Height
            </button>
          </Tooltip>
          <Tooltip label="Place points of interest — key 4" placement="bottom" stretch>
            <button className={tool === 'places' ? 'on' : ''} onClick={() => onTool('places')}>
              ⚑ Places
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
                : <>Click an empty cell to place a new one.</>}
        </p>

        {(tool === 'paint' || tool === 'height') && (
        <div className="brush-group">
          <span className="brush-lbl">Brush</span>
          <div className="brush">
            {BRUSHES.map((n) => (
              <Tooltip key={n} label={`${n}×${n} cells — key ${n + 4}`} placement="bottom" stretch>
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
        Terrain is only offered while the brush is active. Being able to pick a
        terrain that the current tool will not apply is a standing invitation to
        wonder why nothing happened.
      */}
      {tool === 'paint' && (
        <div className="card">
          {/* Every terrain is labelled, never colour alone: a colour-blind GM
              cannot pick "the green one", and difficulty is invisible in a
              swatch either way. */}
          <h2>Terrain</h2>
          <ul className="palette">
            {campaign.terrain.map((t) => (
              <li key={t.id}>
                <Tooltip
                  label={t.defaultDifficulty === 'impassable'
                    ? `${t.name} — impassable on foot`
                    : `${t.name} — travel cost ×${t.defaultDifficulty}`}
                  placement="right"
                  stretch
                >
                <button
                  className={t.id === terrainId ? 'on' : ''}
                  onClick={() => onTerrain(t.id)}
                  aria-pressed={t.id === terrainId}
                >
                  <span className="chip" style={{ background: t.colour }} aria-hidden="true" />
                  <span className="nm">{t.name}</span>
                  <span className="diff">
                    {t.defaultDifficulty === 'impassable' ? '✕' : `×${t.defaultDifficulty}`}
                  </span>
                </button>
                </Tooltip>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

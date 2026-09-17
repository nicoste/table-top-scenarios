// The dock while an encounter map is open (R-148).
//
// A *replacement* for the world's palette, not an addition to it. Paint terrain,
// height, places and travel have no meaning inside a tavern, and leaving them on
// screen would offer four tools that do nothing.

import type { Intent, MapWire } from '@tt/protocol';
import type { MapTool } from '@tt/client-core';
import { MAP_MAX_HEIGHT } from '@tt/domain';
import type { Material } from '@tt/domain';
import { Tooltip } from '@tt/ui';

interface Props {
  /** Which point of interest's map this is — for the heading. */
  readonly placeName: string;
  readonly poiName: string;
  readonly map: MapWire;
  readonly tool: MapTool;
  readonly materials: readonly Material[];
  readonly materialId: string;
  readonly hoverLabel: string | null;
  onTool: (tool: MapTool) => void;
  onMaterial: (id: string) => void;
  onLeave: () => void;
  dispatch: (intent: Intent) => void;
  readonly placeId: string;
  readonly poiId: string;
}

export function MapPanel({
  placeName, poiName, map, tool, materials, materialId, hoverLabel,
  onTool, onMaterial, onLeave, dispatch, placeId, poiId,
}: Props) {
  const blocks = Object.keys(map.blocks).length;

  return (
    <>
      <div className="card">
        <h2>{poiName}</h2>
        <p className="hint" style={{ margin: '0 0 8px' }}>in {placeName}</p>
        <div className="btn-grid campaign-actions">
          <Tooltip label="Back to the world map" placement="bottom" stretch>
            <button className="wide" onClick={onLeave}>← Back to the world</button>
          </Tooltip>
        </div>
      </div>

      <div className="card">
        <h2>Tool</h2>
        <div className="btn-grid tools">
          <Tooltip label="Add a block against the face you click — key 1" placement="bottom" stretch>
            <button className={tool === 'build' ? 'on' : ''} onClick={() => onTool('build')}>
              ▣ Build
            </button>
          </Tooltip>
          <Tooltip label="Remove the block you click — key 2" placement="bottom" stretch>
            <button className={tool === 'erase' ? 'on' : ''} onClick={() => onTool('erase')}>
              ⌫ Erase
            </button>
          </Tooltip>
          <Tooltip label="Repaint blocks without moving them — key 3" placement="bottom" stretch>
            <button className={tool === 'paint' ? 'on' : ''} onClick={() => onTool('paint')}>
              ✏ Paint
            </button>
          </Tooltip>
          <Tooltip
            label="Repaint every block joined to the one you click, of the same material — key 4"
            placement="bottom"
            stretch
          >
            <button className={tool === 'fill' ? 'on' : ''} onClick={() => onTool('fill')}>
              ◍ Fill
            </button>
          </Tooltip>
        </div>
        <p className="hint">
          {tool === 'build' && <>Click a block&apos;s face; the new one lands against it. One click, one cube.</>}
          {tool === 'erase' && <>Click a block to remove it. One click, one cube.</>}
          {/* The one map tool that drags, because it does not move its own
              target the way build and erase do (R-153). */}
          {tool === 'paint' && <>Click a block to repaint it, or drag the brush across several. Nothing moves.</>}
          {tool === 'fill' && (
            <>Click a block: everything joined to it of the same material is repainted. The readout says how many.</>
          )}
        </p>
        <p className="readout">{hoverLabel ?? '—'}</p>
        <p className="hint">1–4 tool · Q/E turn · R/F tilt · right-drag pan · wheel zoom · Esc leaves</p>
      </div>

      {tool !== 'erase' && (
        <div className="card">
          <h2>Material</h2>
          <ul className="palette">
            {materials.map((material) => (
              <li key={material.id}>
                <button
                  className={material.id === materialId ? 'on' : ''}
                  onClick={() => onMaterial(material.id)}
                >
                  <span className="chip" style={{ background: material.colour }} />
                  <span className="nm">{material.name}</span>
                  {/* Said out loud at a table, and the reason it is a material
                      property rather than a block one (R-75). */}
                  {!material.blocksSight && <span className="diff">see-through</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h2>Map</h2>
        <p className="hint" style={{ margin: '0 0 8px' }}>
          {map.size.x}×{map.size.z} cells, {blocks} block{blocks === 1 ? '' : 's'},
          up to {MAP_MAX_HEIGHT} high.
        </p>
        <div className="btn-grid tools">
          <Tooltip label="Extend the map eastward" placement="bottom" stretch>
            <button onClick={() => dispatch({ kind: 'growMap', placeId, poiId, axis: 'x' })}>
              + East
            </button>
          </Tooltip>
          <Tooltip label="Extend the map southward" placement="bottom" stretch>
            <button onClick={() => dispatch({ kind: 'growMap', placeId, poiId, axis: 'z' })}>
              + South
            </button>
          </Tooltip>
        </div>
      </div>
    </>
  );
}

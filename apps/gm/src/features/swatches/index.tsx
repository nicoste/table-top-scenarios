// The material palette (R-176, R-178): a row per family, a square per cut.
//
// One component because it is **one panel in two places** (D-282). A world
// cell and a map cube hold the same kind of value, so a GM who learns to pick
// limestone in a building learns it for the coast as well — and two copies of
// this markup would have drifted the way the world's appearance drifted away
// from the maps' in the first place.
//
// What differs between the two is a sentence, not a layout: a map says whether
// what is in hand sees through, and the world says what it costs to cross. So
// the caller supplies that, and nothing else.

import type { ReactNode } from 'react';
import type { Material } from '@tt/domain';
import { cutOf, colourOf, swatchFor, materialIn, cutIdIn } from '@tt/domain';
import type { SwatchId } from '@tt/domain';
import { Tooltip } from '@tt/ui';

export interface SwatchPaletteProps {
  readonly materials: readonly Material[];
  /** What the GM has in hand. */
  readonly chosen: SwatchId;
  onSwatch: (swatch: SwatchId) => void;
  /** Beside each cut's square, on hover. The cut's name, plus whatever else. */
  readonly cutLabel?: (material: Material, cutId: string) => string;
  /** Trailing badge on the chosen line — "see-through", "×1.5", nothing. */
  readonly detail?: (material: Material, cutId: string | null) => ReactNode;
  readonly hint: ReactNode;
}

export function SwatchPalette({
  materials, chosen, onSwatch, cutLabel, detail, hint,
}: SwatchPaletteProps) {
  const chosenMaterial = materialIn(chosen);
  const chosenCut = cutIdIn(chosen);
  const inHand = materials.find((m) => m.id === chosenMaterial) ?? null;

  return (
    <>
      <ul className="palette swatches">
        {materials.map((material) => (
          <li key={material.id} className={material.id === chosenMaterial ? 'on' : ''}>
            {/*
              The row is the family — how a thing is built — and the squares
              beside it are the substances that share that structure (R-178).
              Tapping the row takes the default cut, which is the first square;
              tapping a square takes that one.
            */}
            <button
              className="pick"
              onClick={() => onSwatch(swatchFor(material, material.cuts[0]!.id))}
            >
              <span className="nm">{material.name}</span>
            </button>
            <span className="cuts">
              {material.cuts.map((cut) => {
                const lit = material.id === chosenMaterial
                  && cut.id === cutOf(material, chosenCut).id;
                return (
                  <Tooltip
                    key={cut.id}
                    label={cutLabel ? cutLabel(material, cut.id) : cut.name}
                    placement="left"
                  >
                    <button
                      className={`cut${lit ? ' lit' : ''}`}
                      style={{ background: cut.colour }}
                      onClick={() => onSwatch(swatchFor(material, cut.id))}
                      aria-label={cut.name}
                      aria-pressed={lit}
                    />
                  </Tooltip>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
      {/*
        The cut's *name* is the vocabulary — "limestone", "oak", "shore" — so
        it cannot live only in a tooltip you have to go looking for (D-245).
        The row says the family; this says which one is in hand.
      */}
      {inHand && (
        <p className="chosen">
          <span className="chip" style={{ background: colourOf(inHand, chosenCut) }} />
          <span className="nm">{cutOf(inHand, chosenCut).name}</span>
          {detail?.(inHand, chosenCut)}
        </p>
      )}
      <p className="hint">{hint}</p>
    </>
  );
}

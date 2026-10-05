// The GM's light controls (R-181).
//
// An hour and two lights, which is the smallest description that covers what a
// GM actually wants to say: what time it is, how hard the sun is, and what the
// sky is doing. Everything here is presentational — the clamping, the arc and
// the names are the domain's, and tested there.
//
// **No on/off switches.** A level that reaches zero is an off switch, and two
// controls for one state invites the ambiguous one — on, but at zero. The
// toggles on the cost panel are diagnostics, there so a measurement can be
// A/B'd against the numbers beside it; these are scene controls (D-249).

import type { Ambience, Lighting } from '@tt/domain';
import {
  MIN_ANGLE, MAX_ANGLE, MIN_SUN, MAX_SUN, MIN_FILL, MAX_FILL, hourLabel,
} from '@tt/domain';
import { ColourInput, Tooltip } from '@tt/ui';

export interface LightPanelProps {
  /** The world's hour and sun — one sky, the same for everybody (R-181). */
  readonly lighting: Lighting;
  /** The light inside whatever is on screen: this place's, or the world's (R-182). */
  readonly ambience: Ambience;
  /** What that ambience belongs to, said plainly. */
  readonly where: string;
  onLighting: (lighting: Lighting) => void;
  onAmbience: (ambience: Ambience) => void;
}

export function LightPanel({
  lighting, ambience, where, onLighting, onAmbience,
}: LightPanelProps) {
  const set = (patch: Partial<Lighting>) => onLighting({ ...lighting, ...patch });

  return (
    <div className="card">
      <h2>Light</h2>

      {/*
        One slider, because it is an hour and not a bearing: a sun needs an
        elevation and a compass direction, and the second is a fact about the
        world rather than something a GM wants to adjust (R-181).
      */}
      <p className="lbl">
        Hour
        <span className="hour">{hourLabel(lighting.angle)}</span>
      </p>
      <Tooltip
        label="Where the sun sits on its arc — low at either end, overhead in the middle"
        placement="left"
        stretch
      >
        <input
          type="range"
          className="dial"
          min={MIN_ANGLE}
          max={MAX_ANGLE}
          value={lighting.angle}
          aria-label="hour of the day"
          onChange={(e) => set({ angle: Number(e.target.value) })}
        />
      </Tooltip>

      <p className="lbl">Sun</p>
      <div className="lamp">
        <ColourInput
          value={lighting.sun}
          onCommit={(sun) => set({ sun })}
          aria-label="sun colour"
        />
        <input
          type="range"
          className="dial"
          min={MIN_SUN}
          max={MAX_SUN}
          step={0.05}
          value={lighting.sunLevel}
          aria-label="sun strength"
          onChange={(e) => set({ sunLevel: Number(e.target.value) })}
        />
      </div>

      {/*
        The ambience belongs to the place, not to the hour (R-182): a cave is
        green at noon and green at midnight. On the world this is the world's
        own; inside a point of interest it is that one's, and nothing about the
        afternoon outside reaches it.
      */}
      <p className="lbl">
        Ambience
        <span className="hour">{where}</span>
      </p>
      <div className="lamp">
        <ColourInput
          value={ambience.colour}
          onCommit={(colour) => onAmbience({ ...ambience, colour })}
          aria-label="ambience colour"
        />
        <input
          type="range"
          className="dial"
          min={MIN_FILL}
          max={MAX_FILL}
          step={0.02}
          value={ambience.level}
          aria-label="ambience strength"
          onChange={(e) => onAmbience({ ...ambience, level: Number(e.target.value) })}
        />
      </div>

      <p className="hint">
        The sun is the world&apos;s and the ambience is this place&apos;s. Turn
        the ambience down and the shadows bite; turn it up and they wash out,
        which is how all of this looked before anything cast one at all.
      </p>
    </div>
  );
}

// Figure in a surface, as arithmetic in the shader (R-177).
//
// Three patterns, asked for by name: wood in stripes along the grain, brick in
// courses, grass mottled. Built to answer whether a voxel wall stops reading as
// plastic once its faces have something in them, and what that costs. It does,
// and it costs nothing measurable — 2.8 ms against 2.9 (D-244).
//
// **Patched into three.js's own material, not written from scratch.**
// `onBeforeCompile` injects into `MeshStandardMaterial`, so lighting,
// occlusion, instancing, transparency and the per-instance colour all keep
// working exactly as they did. A custom `ShaderMaterial` would have meant
// reimplementing every one of them.
//
// **No textures and no UVs.** The coordinate is the cube's own position in the
// world, which is already in the vertex shader. That means no image to load,
// no atlas to pack, no seams, and a pattern that lines up across two cubes of
// the same material standing next to each other — a wall of brick reads as one
// wall rather than as forty tiles of the same photograph.

import type { Material } from '@tt/domain';
import type { MeshStandardMaterial, WebGLProgramParametersWithUniforms } from 'three';

/**
 * How far the figure moves the colour.
 *
 * Grain (R-172) wanders a cube's lightness by about 1%; this is the figure
 * *within* one cube's face and wants to be stronger to read at a table's
 * distance, but it is still a surface and not a paint job.
 */
const DEPTH = 0.1;
/** Mortar is a groove, so it only ever darkens, and harder than the rest. */
const MORTAR = 0.22;

/**
 * Multiplies the diffuse colour rather than nudging lightness in HSL the way
 * grain does (D-237).
 *
 * The HSL argument was about a *whole cube's* shade, where the material's hue
 * is what the GM picked and had to survive. Within one face, a multiply is
 * what light on an uneven surface actually does, and it is one instruction
 * instead of two conversions.
 */
const COMMON = /* glsl */ `
varying vec3 ttSurface;
varying vec3 ttNormal;
uniform float ttFigure;
`;

const HELPERS = /* glsl */ `
/*
  The face's own two axes: whichever pair the normal is not pointing along, so
  a pattern drawn on a wall is upright and the same pattern on a floor lies
  flat. Cubes are axis-aligned and never rotate, so the object normal is the
  world normal and this is six cases collapsed to three.
*/
vec2 ttFaceUv(vec3 p, vec3 n) {
  vec3 a = abs(n);
  if (a.y > a.x && a.y > a.z) return p.xz;
  if (a.x > a.z) return p.zy;
  return p.xy;
}

/*
  Hash without a sine. The sin(dot(uv, k)) * 43758.5453 one everybody reaches
  for bands on integer grids — which is the precise arrangement every cube here
  is in, and the same trap D-237 fell into on the CPU side.
*/
float ttHash(vec2 c) {
  vec3 p = fract(vec3(c.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float ttNoise(vec2 uv) {
  vec2 i = floor(uv);
  vec2 f = fract(uv);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(ttHash(i), ttHash(i + vec2(1.0, 0.0)), u.x),
    mix(ttHash(i + vec2(0.0, 1.0)), ttHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
`;

/**
 * The figure itself, one function per pattern, each returning a multiplier
 * around 1.
 */
const FIGURES: Record<string, string> = {
  /*
   * Grain running up the wall: bands across the horizontal axis, so a side
   * face is striped vertically. Two frequencies, because a single sine is a
   * barcode — the second one breaks the regularity enough to read as timber.
   */
  stripes: /* glsl */ `
float ttFigured(vec2 uv) {
  float g = uv.x * 9.0 + ttNoise(uv * vec2(1.0, 0.35)) * 1.6;
  float band = sin(g) * 0.5 + 0.5;
  band = band * 0.7 + (sin(g * 3.7 + 1.3) * 0.5 + 0.5) * 0.3;
  return 1.0 + (band - 0.5) * ${DEPTH.toFixed(3)};
}
`,
  /*
   * Mottle, at two sizes: a coarse one that reads as patchy ground from above
   * and a fine one that keeps it from looking like clouds up close.
   */
  speckle: /* glsl */ `
float ttFigured(vec2 uv) {
  float n = ttNoise(uv * 5.0) * 0.65 + ttNoise(uv * 17.0) * 0.35;
  return 1.0 + (n - 0.5) * ${DEPTH.toFixed(3)};
}
`,
  /*
   * Courses, in a running bond: every other row shifted half a brick, which is
   * the thing that stops it reading as graph paper. Two bricks across a cube
   * face and three courses up it — a brick that is a third of a cell is about
   * right at this scale.
   */
  courses: /* glsl */ `
float ttFigured(vec2 uv) {
  float y = uv.y * 3.0;
  float row = floor(y);
  float x = uv.x * 2.0 + mod(row, 2.0) * 0.5;
  vec2 cell = vec2(fract(x), fract(y));
  float edge = min(min(cell.x, 1.0 - cell.x), min(cell.y, 1.0 - cell.y));
  float face = smoothstep(0.0, 0.055, edge);
  // Each brick a touch lighter or darker than its neighbours, or a wall of
  // them is one flat colour with lines ruled on it.
  float vary = (ttHash(vec2(floor(x), row)) - 0.5) * ${(DEPTH * 0.8).toFixed(3)};
  return mix(1.0 - ${MORTAR.toFixed(3)}, 1.0 + vary, face);
}
`,
};

/** Whether this material has a figure the renderer knows how to draw. */
export function isFigured(material: Material): boolean {
  return material.pattern !== 'none' && material.pattern in FIGURES;
}

/**
 * Patches a standard material to draw its figure, and hands back the switch.
 *
 * Returns a setter rather than exposing the uniform, because the uniform does
 * not exist until the shader compiles — which happens on the first frame the
 * material is drawn, not when it is made. The setter remembers what it was
 * told and applies it whenever the uniform turns up.
 */
export function figure(
  surface: MeshStandardMaterial,
  material: Material,
): (on: boolean) => void {
  const body = FIGURES[material.pattern];
  if (!body) return () => {};
  let wanted = 1;
  let live: { value: number } | null = null;

  surface.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.ttFigure = { value: wanted };
    live = shader.uniforms.ttFigure as { value: number };

    shader.vertexShader = COMMON + shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */ `#include <begin_vertex>
      vec4 ttWorld = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        ttWorld = instanceMatrix * ttWorld;
      #endif
      ttSurface = (modelMatrix * ttWorld).xyz;
      ttNormal = objectNormal;`,
    );

    shader.fragmentShader = COMMON + HELPERS + body + shader.fragmentShader.replace(
      // After the instance colour has been applied, so the figure multiplies
      // the cube's own shade rather than the material's registry colour.
      '#include <color_fragment>',
      /* glsl */ `#include <color_fragment>
      diffuseColor.rgb *= mix(1.0, ttFigured(ttFaceUv(ttSurface, ttNormal)), ttFigure);`,
    );
  };

  /*
   * Without this, three.js caches one compiled program per *material type* and
   * every patched material would get whichever figure compiled first — brick
   * courses on the grass.
   */
  surface.customProgramCacheKey = () => `tt-${material.pattern}`;

  return (on: boolean) => {
    wanted = on ? 1 : 0;
    if (live) live.value = wanted;
  };
}

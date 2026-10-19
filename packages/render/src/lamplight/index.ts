// Lamplight on the screen (D-335): the light the domain worked out cube by
// cube (`lampField`), added to whatever it falls on — blocks, props, tokens.
//
// **One texture, read by every surface.** The field is a box of cubes, so it
// goes up as a 3D texture once per change, and each standard material gets a
// few lines after three.js has added up its own lights: find the cube in front
// of this point of the surface, and add that cube's light. Nothing per frame
// but the reading (R-170), and no lights in the scene — three.js recompiles
// every material when the number of lights changes, and a dungeon has dozens.
//
// **The cube in front, smoothly.** A face is lit by the air in front of it: the
// point half a cube out along its normal. Between cubes the light is blended
// from the eight around that point — but only the ones light can be in, so the
// floor beside a wall is not darkened by the inside of the wall, and the floor
// on the far side of it is not lit by the room this side.

import {
  Data3DTexture, FloatType, MeshStandardMaterial, NearestFilter, RGBAFormat, Vector3,
} from 'three';
import type { Material, Object3D, WebGLProgramParametersWithUniforms } from 'three';
import type { LampField } from '@tt/domain';

/**
 * How bright a flame is on what it touches. Three.js's lights divide by π
 * on the way to a surface's colour, so this many times a flame's light is
 * about the surface's own colour, close to the flame, in the dark.
 *
 * The light is eased before it is added — `1 − e^−light` — so one flame
 * lights as it should and a room of them is bright without being daylight:
 * candles on every table add up to a lit room, not to a white one.
 */
const STRENGTH = 3;

const HEAD = /* glsl */ `
uniform highp sampler3D ttLampField;
uniform vec3 ttLampOrigin;
uniform vec3 ttLampSize;
uniform float ttLampOn;
uniform float ttLampStrength;

vec3 ttLamp(vec3 world, vec3 facing) {
  vec3 p = world + facing * 0.5 - ttLampOrigin - 0.5;
  vec3 base = floor(p);
  vec3 f = p - base;
  ivec3 dims = ivec3(ttLampSize + 0.5);
  ivec3 low = ivec3(base);
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 8; i++) {
    ivec3 o = ivec3(i & 1, (i >> 1) & 1, (i >> 2) & 1);
    ivec3 t = low + o;
    if (any(lessThan(t, ivec3(0))) || any(greaterThanEqual(t, dims))) continue;
    vec4 s = texelFetch(ttLampField, t, 0);
    vec3 w3 = mix(1.0 - f, f, vec3(o));
    float w = w3.x * w3.y * w3.z * s.a;
    sum += vec4(s.rgb * w, w);
  }
  return sum.a > 0.0001 ? sum.rgb / sum.a : vec3(0.0);
}
`;

/*
 * After three.js has added up the sun and the sky. The point and its normal
 * are taken back to the world from the view: `vViewPosition` and `normal` are
 * the view's, and the view's rotation is undone by multiplying on the left.
 */
const BODY = /* glsl */ `
if (ttLampOn > 0.5) {
  vec3 ttWorld = cameraPosition + (vec4(-vViewPosition, 0.0) * viewMatrix).xyz;
  vec3 ttFacing = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  vec3 ttLit = 1.0 - exp(-ttLamp(ttWorld, ttFacing));
  reflectedLight.indirectDiffuse += ttLit * ttLampStrength * BRDF_Lambert(material.diffuseColor);
}
`;

export interface Lamplight {
  /** Has every standard material in this group lit by the lamps — once each, however often it is asked. */
  light(group: Object3D): void;
  /** The light to draw, or none. */
  set(field: LampField | null): void;
  dispose(): void;
}

/** A field of one dark cube, for when there is none: the sampler always has something. */
function darkness(): Data3DTexture {
  const texture = new Data3DTexture(new Float32Array(4), 1, 1, 1);
  texture.format = RGBAFormat;
  texture.type = FloatType;
  texture.needsUpdate = true;
  return texture;
}

export function buildLamplight(): Lamplight {
  const uniforms = {
    ttLampField: { value: darkness() },
    ttLampOrigin: { value: new Vector3() },
    ttLampSize: { value: new Vector3(1, 1, 1) },
    ttLampOn: { value: 0 },
    ttLampStrength: { value: STRENGTH },
  };
  const lit = new WeakSet<Material>();

  const patch = (material: Material) => {
    if (lit.has(material) || !(material instanceof MeshStandardMaterial)) return;
    lit.add(material);
    const before = material.onBeforeCompile;
    // Asked now, before the hook is replaced: three.js's own key is the hook's
    // source, and every lamplit hook reads the same.
    const key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
      before.call(material, shader, renderer);
      // The same objects for every material, so one `set` reaches them all.
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = HEAD + shader.fragmentShader.replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>\n${BODY}`,
      );
    };
    material.customProgramCacheKey = () => `${key}|lamps`;
    material.needsUpdate = true;
  };

  return {
    light(group) {
      group.traverse((object) => {
        const material = (object as { material?: Material | Material[] }).material;
        if (Array.isArray(material)) material.forEach(patch);
        else if (material) patch(material);
      });
    },
    set(field) {
      const old = uniforms.ttLampField.value;
      if (!field) {
        if (uniforms.ttLampOn.value === 0) return;
        uniforms.ttLampOn.value = 0;
        uniforms.ttLampField.value = darkness();
        old.dispose();
        return;
      }
      const texture = new Data3DTexture(field.data, field.size.x, field.size.y, field.size.z);
      texture.format = RGBAFormat;
      texture.type = FloatType;
      // Read a cube at a time by `texelFetch`; blending is the shader's own.
      texture.minFilter = NearestFilter;
      texture.magFilter = NearestFilter;
      texture.unpackAlignment = 1;
      texture.needsUpdate = true;
      uniforms.ttLampField.value = texture;
      uniforms.ttLampOrigin.value.set(field.origin.x, field.origin.y, field.origin.z);
      uniforms.ttLampSize.value.set(field.size.x, field.size.y, field.size.z);
      uniforms.ttLampOn.value = 1;
      old.dispose();
    },
    dispose() {
      uniforms.ttLampField.value.dispose();
    },
  };
}

// What stands behind a block, drawn through it (D-368, R-216): a token, or a
// prop the party can see, hidden from the camera by a wall, shows through the
// wall as itself — its own colours and picture, so a goblin is still a goblin
// — darkened, every other square of a checker left out, inside a light line.
//
// **It has to say "behind".** A figure drawn faint over a wall looks like it
// stands on top of it. The checker shows the wall between the squares, the
// darkening puts it in the wall's shadow, and only the hidden part gets either:
// where the figure comes out from behind the wall it is solid again, and the
// change sits exactly on the wall's edge.
//
// **How.** A thing that shows through gets twins sharing its shapes, drawn
// after the world and before the thing itself, in this order:
//
// 1. a *mask* — its shape, no colour — that marks in the stencil where it is
//    hidden: where something already drawn is nearer (`GreaterDepth`);
// 2. its *outline*: the mask's shape again, nudged a few pixels each way
//    diagonally, light, where it is hidden and outside every mask of its tier,
//    so the line never shows through the checker's gaps;
// 3. its *ghost*: each part in its own material, darkened and dithered, where
//    it is hidden.
//
// Then the thing itself, which wins wherever it is in view. Before it rather
// than after, so a thing's own front never counts as what hides its back.
//
// **Props first, then tokens** — each in a tier of its own — so a goblin
// behind a bookcase shows through the bookcase, and a chest never shows
// through the goblin standing in front of it.
//
// **What is seen past hides nothing.** Bars, a ladder, an open door are drawn
// after all of it, so a goblin in a cell is not outlined bar by bar.

import {
  AlwaysStencilFunc, BufferGeometry, DoubleSide, GreaterDepth, MathUtils, Mesh, MeshBasicMaterial,
  NotEqualStencilFunc, ReplaceStencilOp, Vector2,
} from 'three';
import type {
  Material, Object3D, OrthographicCamera, WebGLProgramParametersWithUniforms, WebGLRenderer,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Which things a twin belongs with: props, drawn first, or tokens. */
export type XRayTier = 'props' | 'tokens';

/**
 * Where each kind of twin falls in the draw (three.js draws the opaque in
 * `renderOrder`): between the world, at 0, and everything drawn over it at 1
 * and above — the walk, the areas, the highlight. The stencil value is the
 * tier's own, so one tier's outline is not cut by the other's masks.
 */
const ORDER: Record<XRayTier, { mask: number; outline: number; ghost: number; real: number; stencil: number }> = {
  props: { mask: 0.1, outline: 0.2, ghost: 0.3, real: 0.4, stencil: 1 },
  tokens: { mask: 0.5, outline: 0.6, ghost: 0.7, real: 0.8, stencil: 2 },
};

/** Where what hides nothing is drawn: after every tier, still under what is drawn over the world. */
const PAST = 0.9;

/**
 * The checker's square, and the outline's width, in CSS pixels. Scaled to the
 * device, so it still reads as a pattern on the table's screen: a one-pixel
 * checker on a large display blurs into plain see-through, which is the look
 * this is here to avoid.
 */
const PATTERN_PX = 2;

/** How dark a ghost is drawn: its colour times this, plus `LIFT`, toward the wall's shadow. */
const SHADE = 0.55;
const LIFT = 0.12;

/** The outline's colour. */
const OUTLINE = '#f2efe6';

/**
 * How far in front something must be to hide, in cubes. A token's base stands
 * on its floor and a chest's on its own — face to face with what they touch,
 * which without this margin would count as hiding them in a flicker.
 */
const CONTACT = 0.05;

/** The outline's four nudges, diagonally, as many widths each way. */
const NUDGES: readonly (readonly [number, number])[] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Whether this is one of the twins drawn for what shows through a wall, rather than a thing. */
export function isTwin(object: Object3D): boolean {
  return object.userData.xray === true;
}

export interface XRay {
  /**
   * Has every part under `root` show through what hides it, in its tier — and
   * draws the parts themselves after their twins. Returns the shapes made for
   * it, to be disposed with the caller's own.
   */
  add(root: Object3D, tier: XRayTier): BufferGeometry[];
  /** Has everything under `root` hide nothing: it is seen past, as bars are. */
  seenPast(root: Object3D): void;
  /** Before each drawn frame: the pattern's size and the depth margins, for this camera. */
  frame(camera: OrthographicCamera, renderer: WebGLRenderer, pitchDeg: number): void;
  dispose(): void;
}

export function buildXRay(): XRay {
  const shared = {
    xrayCell: { value: PATTERN_PX },
    xrayBias: { value: 0 },
    xrayPixel: { value: new Vector2(1, 1) },
    xrayWidth: { value: PATTERN_PX },
  };
  /**
   * The outline's own margin: its nudged shape lies over the floor in front of
   * whatever stands on it, nearer by as much as the nudge covers there, so it
   * needs that much more than `CONTACT` not to underline every token.
   */
  const outlineBias = { value: 0 };
  const size = new Vector2();

  // Pulled toward the camera by the margin, so a test of "hidden" asks for
  // something at least that much nearer.
  const biased = (shader: WebGLProgramParametersWithUniforms, bias: { value: number }) => {
    shader.uniforms.xrayBias = bias;
    shader.vertexShader = `uniform float xrayBias;\n${shader.vertexShader}`.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\ngl_Position.z -= xrayBias * gl_Position.w;',
    );
  };

  const masks = {} as Record<XRayTier, MeshBasicMaterial>;
  const outlines = {} as Record<XRayTier, MeshBasicMaterial[]>;
  for (const tier of ['props', 'tokens'] as const) {
    const mask = new MeshBasicMaterial({
      colorWrite: false, depthWrite: false, depthFunc: GreaterDepth, side: DoubleSide,
      stencilWrite: true, stencilRef: ORDER[tier].stencil,
      stencilFunc: AlwaysStencilFunc, stencilZPass: ReplaceStencilOp,
    });
    mask.onBeforeCompile = (shader) => biased(shader, shared.xrayBias);
    mask.customProgramCacheKey = () => 'xray-mask';
    masks[tier] = mask;
    outlines[tier] = NUDGES.map(([x, y]) => {
      const line = new MeshBasicMaterial({
        color: OUTLINE, toneMapped: false, depthWrite: false, depthFunc: GreaterDepth, side: DoubleSide,
        // Writing nothing — `stencilWrite` is what turns the test on.
        stencilWrite: true, stencilRef: ORDER[tier].stencil, stencilFunc: NotEqualStencilFunc,
      });
      const nudge = { value: new Vector2(x, y) };
      line.onBeforeCompile = (shader) => {
        biased(shader, outlineBias);
        Object.assign(shader.uniforms, { xrayNudge: nudge, xrayPixel: shared.xrayPixel, xrayWidth: shared.xrayWidth });
        shader.vertexShader = `uniform vec2 xrayNudge;\nuniform vec2 xrayPixel;\nuniform float xrayWidth;\n${shader.vertexShader}`
          .replace(
            'gl_Position.z -= xrayBias * gl_Position.w;',
            'gl_Position.z -= xrayBias * gl_Position.w;\ngl_Position.xy += xrayNudge * xrayWidth * xrayPixel * gl_Position.w;',
          );
      };
      line.customProgramCacheKey = () => 'xray-outline';
      return line;
    });
  }

  /*
   * A ghost's material is its part's, copied once and kept: a card whose
   * picture arrives late changes material, and its ghost must follow without
   * anybody telling it — so the ghost asks for its part's material each time
   * it is drawn, and gets the copy of whatever that is now.
   */
  const ghosts = new Map<Material, Material>();
  /*
   * **Its own colours, unlit.** A goblin behind a wall in a dark dungeon is
   * lit by nothing the camera can see, and lit it came out black — every
   * ghost the same, which is the one thing this must not be. So the ghost is
   * its parts' colours and pictures as they are, darkened.
   *
   * **Darkened as the screen shows it**, in sRGB, before three.js turns the
   * colour into what the target wants. Done after, it was right on the canvas
   * and wrong under ambient occlusion, whose target is linear: the lift that
   * was a shadow became a grey wash over every picture.
   */
  const ghostShader = (shader: WebGLProgramParametersWithUniforms) => {
    biased(shader, shared.xrayBias);
    shader.uniforms.xrayCell = shared.xrayCell;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `uniform float xrayCell;
void main() {
  if (mod(floor(gl_FragCoord.x / xrayCell) + floor(gl_FragCoord.y / xrayCell), 2.0) < 0.5) discard;`)
      .replace('#include <opaque_fragment>', `outgoingLight = pow(
    pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2)) * ${SHADE.toFixed(2)} + ${LIFT.toFixed(2)}, vec3(2.2));
#include <opaque_fragment>`);
  };
  const ghostOf = (source: Material): Material => {
    let ghost = ghosts.get(source);
    if (!ghost) {
      const made = source.clone();
      made.depthFunc = GreaterDepth;
      made.depthWrite = false;
      made.onBeforeCompile = ghostShader;
      made.customProgramCacheKey = () => 'xray-ghost';
      source.addEventListener('dispose', () => {
        made.dispose();
        ghosts.delete(source);
      });
      ghosts.set(source, made);
      ghost = made;
    }
    return ghost;
  };

  const twin = (mesh: Mesh, material: Material, order: number): Mesh => {
    const made = new Mesh(mesh.geometry, material);
    made.renderOrder = order;
    made.userData.xray = true;
    // Drawn, never picked: what a ray asks about is the thing, not its twins.
    made.raycast = () => {};
    return made;
  };

  /** The shapes of these parts, as one, in their parent's space — only where they are, not how they look. */
  const outlineOf = (parts: readonly Mesh[]): BufferGeometry | null => {
    const shapes = parts.map((part) => {
      part.updateMatrix();
      const flat = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
      const shape = new BufferGeometry();
      shape.setAttribute('position', flat.getAttribute('position'));
      shape.applyMatrix4(part.matrix);
      return shape;
    });
    const merged = mergeGeometries(shapes);
    for (const shape of shapes) shape.dispose();
    return merged;
  };

  return {
    add(root, tier) {
      const order = ORDER[tier];
      const made: BufferGeometry[] = [];
      // Gathered first: the twins are added under the very things being walked.
      const byParent = new Map<Object3D, Mesh[]>();
      root.traverse((object) => {
        if (!(object instanceof Mesh) || isTwin(object) || !object.parent) return;
        if (Array.isArray(object.material) || !(object.material as Material).visible) return;
        const siblings = byParent.get(object.parent) ?? [];
        siblings.push(object);
        byParent.set(object.parent, siblings);
      });
      for (const [parent, parts] of byParent) {
        for (const part of parts) {
          part.renderOrder = order.real;
          const ghost = twin(part, masks[tier], order.ghost);
          Object.defineProperty(ghost, 'material', { get: () => ghostOf(part.material as Material) });
          part.add(ghost);
        }
        const shape = outlineOf(parts);
        if (!shape) continue;
        made.push(shape);
        const stand = (material: Material, at: number) => {
          const mesh = new Mesh(shape, material);
          mesh.renderOrder = at;
          mesh.userData.xray = true;
          mesh.raycast = () => {};
          parent.add(mesh);
        };
        stand(masks[tier], order.mask);
        for (const line of outlines[tier]) stand(line, order.outline);
      }
      return made;
    },
    seenPast(root) {
      root.traverse((object) => {
        if (object instanceof Mesh) object.renderOrder = PAST;
      });
    },
    frame(camera, renderer, pitchDeg) {
      renderer.getDrawingBufferSize(size);
      const cell = Math.max(1, Math.round(PATTERN_PX * renderer.getPixelRatio()));
      shared.xrayCell.value = cell;
      shared.xrayWidth.value = cell;
      shared.xrayPixel.value.set(2 / size.x, 2 / size.y);
      // An orthographic camera's depth is even from near to far: a cube is
      // the same step anywhere in it.
      const perCube = 2 / (camera.far - camera.near);
      shared.xrayBias.value = CONTACT * perCube;
      // How far the nudge reaches over a floor, toward the camera: its width
      // in cubes, steeper the lower the camera looks.
      const perPixel = (camera.top - camera.bottom) / camera.zoom / size.y;
      const slope = 1 / Math.tan(MathUtils.degToRad(Math.max(pitchDeg, 10)));
      outlineBias.value = (CONTACT + 1.5 * cell * perPixel * slope) * perCube;
    },
    dispose() {
      for (const tier of ['props', 'tokens'] as const) {
        masks[tier].dispose();
        for (const line of outlines[tier]) line.dispose();
      }
      for (const ghost of ghosts.values()) ghost.dispose();
      ghosts.clear();
    },
  };
}

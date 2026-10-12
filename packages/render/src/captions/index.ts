// Map captions, as HTML over the canvas (R-196, O-031).
//
// They were `Sprite`s with the text baked into a canvas texture, and the two
// bugs that cost were both the same bug: **a caption is a thing on the screen,
// and it was living in the scene.** Its size had to be undone from the zoom on
// every frame, its offset was in world units while its size was in pixels so
// it flew off the marker when you zoomed in (D-287), and the occlusion pass —
// which renders the scene with an override material, replacing the very shader
// that makes a sprite face the camera — drew its quad flat across the ground
// as a black parallelogram.
//
// A `CSS2DObject` holds a world position and nothing else: three.js projects
// it and the browser positions a `<div>` there. Size, padding and font are
// CSS, in pixels, which is the frame they always wanted. Nothing is in the
// depth buffer, so no pass can touch it — not this one and not the next one.
//
// It is also **less** than it replaces: no canvas per place, no texture, no
// aspect ratio, no per-frame rescale, nothing to dispose but a DOM node that
// three.js removes itself.

import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/** The class the host page styles. One name, used by places and pawns alike. */
export const CAPTION_CLASS = 'tt-caption';

/**
 * The stylesheet, injected once per document rather than asked of every app.
 *
 * `render` owns the markup, so it owns the look of it: an app that forgot the
 * rule would get unstyled text over its map and nothing would say why. The
 * apps may still override it — this is one class at the document's lowest
 * specificity, and it is appended before their own stylesheets ever run.
 */
const STYLE_ID = 'tt-caption-style';
const STYLE = `
.${CAPTION_CLASS} {
  /* Two frames meet here and both are pixels now (D-287): the gap holds the
     caption clear of what it names, and the pill is the caption. */
  padding-bottom: 5px;
  pointer-events: none;
  white-space: nowrap;
  font: 600 12px/1 ui-sans-serif, system-ui, sans-serif;
}
.${CAPTION_CLASS} > span {
  display: inline-block;
  padding: 3px 7px;
  border-radius: 7px;
  background: rgba(8, 10, 14, .78);
  color: #eef2f7;
}
`;

function ensureStyle(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE;
  document.head.append(style);
}

/**
 * A caption standing at a world point. Shared by the places and the party
 * pawns, which caption the same way (R-90).
 *
 * `center` anchors the element's **bottom** at that point rather than its
 * middle, so the caption sits above what it names however long the name is —
 * and the gap above the marker is the div's own padding, in pixels, at every
 * zoom.
 */
export function caption(text: string): CSS2DObject {
  ensureStyle();
  const element = document.createElement('div');
  element.className = CAPTION_CLASS;
  const pill = document.createElement('span');
  // `textContent`, never innerHTML: a place's name is the GM's to type and
  // the table renders whatever the GM typed.
  pill.textContent = text;
  element.append(pill);

  const object = new CSS2DObject(element);
  object.center.set(0.5, 1);
  return object;
}

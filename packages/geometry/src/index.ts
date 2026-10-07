// @tt/geometry — public surface. See README.md for what this package
// owns and, more importantly, what it must never know about.
export const PACKAGE_NAME = '@tt/geometry';

export { lineIsClear, cubeGrid, cubeIndex, cubeAt } from './sight/index.js';
export type { Point, Blocks, CubeGrid } from './sight/index.js';

// @tt/client-core — what both browser apps need. Role-neutral by rule.

export { connect, uploadPicture } from './net/index.js';
export {
  CARD_PICTURE_WIDTH, CARD_PICTURE_HEIGHT, MIN_FRAME_WIDTH,
  coverCrop, startingFrame, movedFrame, resizedFrame, cardPicture,
} from './images/index.js';
export type { Frame, Corner } from './images/index.js';
export type { Connection, Handlers } from './net/index.js';

export { initialServerState, initialViewState, keepUnchanged } from './store/index.js';
export type { ServerState, ViewState, Tool, MapTool } from './store/index.js';

export {
  idle, GROUP, pick, armed, aim, choose, ghostCell, aimedAt,
  canConfirm, movingFrom, travelIntent, travelPrompt, journeyLength,
} from './travel/index.js';
export type { Travel } from './travel/index.js';

export {
  still, grab, armedStride, tokenAim, aimStride, strideGhost, canStride, strideIntent,
  tableCeiling, standVerdict, tokenAction, stridePrompt,
} from './tokens/index.js';
export type { Stride, Headroom, TokenAction } from './tokens/index.js';

export {
  emptyHanded, pickUp, turnCarried, canSetDown, setDownIntent, placesPrompt,
} from './places/index.js';

export {
  noSilverMove, grabSilver, aimSilverMove, silverMoveGhost, silverVerdict, silverMoveIntent,
  spawnIntent, silverMovePrompt, spawnPrompt,
} from './silver/index.js';
export type { SilverMove } from './silver/index.js';
export type { Carry } from './places/index.js';

export {
  worldToolShows, mapToolShows,
  clickAction, holdsSelection, tableAction, mapAction, mapHover, mapDrags, mapAllowed,
} from './tools/index.js';

export { grabEnd, rowAt } from './levels/index.js';
export type { RowBox } from './levels/index.js';

export { NO_PATH, walkLength, walkShown } from './walk/index.js';

export {
  NOT_PLACING, turnPlacing, mirrorPlacing, prefabAim, prefabPreview, placeIntent, placePrompt,
  NO_CAPTURE, captureCorner, captureClick, captureHeight, captureBack, captureBox, capturePrompt, describeBox, saveIntent,
} from './prefabs/index.js';
export type { PrefabPlacing, PrefabPreview, Capture } from './prefabs/index.js';

export {
  EMPTY_HAND, takeProp, turnHand, propAim, propWall, propWords, propPreview, placePropIntent, propPrompt,
  toggleIntent, toggleLabel, paintPropIntent, paintPropPrompt,
} from './props/index.js';
export type { PropHand, PropPreview } from './props/index.js';

export {
  MEASURE_START, chooseMeasure, chooseAreaColour, measureCleared, measurePress, measureDrag, measureRelease,
  rulerLength, rulerShown, areasShown, handleAt, measurePrompt, faceCentre, floorCentre,
} from './measure/index.js';
export type { MeasureHand, MeasureMode } from './measure/index.js';

export { FRAME_WINDOW, keepRecent, summarise, rate } from './metrics/index.js';
export type { Frames } from './metrics/index.js';

export { cameraAction, wheelZoom, CAMERA_HINT } from './camera/index.js';
export type { CameraAction } from './camera/index.js';
export type {
  ToolPart, ClickAction, TableAction, MapAction, MapHover, MapAim, MapReach, MapVerdict, FillReach,
  Pointed, Cell, Slot, Context,
} from './tools/index.js';

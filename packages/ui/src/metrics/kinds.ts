// The shape `summarise` produces, restated so `@tt/ui` can draw it without
// depending on the package that computes it — this one knows no domain and no
// app, and that is the whole of its job (R-111).

export interface Frames {
  readonly frames: number;
  readonly fps: number;
  readonly p50: number;
  readonly p95: number;
  readonly worst: number;
}

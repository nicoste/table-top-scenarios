// The theme's custom properties as this package reads them (R-111). Each one
// carries the value the shells give it by default — what the browser computes
// from `@tt/theme`'s tokens.css — so a component looks the same with or
// without a shell around it, and a fallback cannot differ from one component
// to the next: there is one. A test holds these against tokens.css.

const v = (name: string, fallback: string) => `var(${name}, ${fallback})`;

export const THEME = {
  main: v('--ui-main', '#181c24'),
  highlight: v('--ui-highlight', '#f5a524'),
  ink: v('--ui-ink', '#e6e9ef'),
  dim: v('--dim', '#8f939a'),
  key: v('--ui-key', '#bdc0c6'),
  bg: v('--bg', '#101217'),
  radius: v('--ui-radius', '2px'),
  font: v('--ui-font', 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, monospace'),
  bodyFont: v('--ui-body-font', 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'),
  textLabel: v('--ui-text-label', '10.5px'),
  textMeta: v('--ui-text-meta', '11px'),
  textHint: v('--ui-text-hint', '11.5px'),
  slotH: v('--ui-slot-h', '54px'),
  panelBg: v('--ui-panel-bg', '#181c24f0'),
  panelBorder: v('--ui-panel-border', '#565961'),
  panelShadow: v('--ui-panel-shadow',
    'inset 2px 2px 0 rgba(255, 255, 255, 0.07), inset -2px -2px 0 rgba(0, 0, 0, 0.7), 0 6px 0 rgba(0, 0, 0, 0.45)'),
  slotBg: v('--ui-slot-bg', '#31353c'),
  slotBorder: v('--ui-slot-border', '#666a71'),
  slotHoverBg: v('--ui-slot-hover-bg', '#454951'),
  slotHoverBorder: v('--ui-slot-hover-border', '#94979e'),
  slotShadow: v('--ui-slot-shadow',
    'inset 2px 2px 0 rgba(255, 255, 255, 0.11), inset -2px -2px 0 rgba(0, 0, 0, 0.75)'),
  slotActiveBg: v('--ui-slot-active-bg', '#493a24'),
  slotActiveBorder: v('--ui-slot-active-border', '#f5a524'),
  slotActiveInk: v('--ui-slot-active-ink', '#f9c471'),
  slotActiveShadow: v('--ui-slot-active-shadow',
    'inset 2px 2px 0 rgba(245, 165, 36, 0.35), inset -2px -2px 0 rgba(0, 0, 0, 0.85), 0 0 0 1px #f5a524'),
} as const;

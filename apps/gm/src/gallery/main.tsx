// The design gallery (R-217, D-387): every primitive and pattern the screens
// are built from, drawn by the real components with the real stylesheet, so
// it cannot show a look the screens do not have. Served with the console, at
// /gm/gallery.html; no campaign, no host connection.
//
// The three pickers change the master colours on the page, which is the whole
// of re-theming: everything else is mixed from them (packages/theme).

import { createRoot } from 'react-dom/client';
import { StrictMode, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { browserIsEnough } from '@tt/client-core';
import {
  BrandLogo, ColourInput, Compass, ConfirmDelete, DraftInput, GameIcon, GLYPHS, IconButton, PictureInput, SlotButton,
  THEME, Tooltip,
} from '@tt/ui';
import type { GameIconName } from '@tt/ui';

/** The master colours, as tokens.css sets them, and two others to try. */
const PRESETS = [
  { name: 'Slate & amber', main: '#181c24', highlight: '#f5a524', ink: '#e6e9ef' },
  { name: 'Obsidian & emerald', main: '#121a16', highlight: '#56d364', ink: '#e6f2ea' },
  { name: 'Deep rune & cyan', main: '#141824', highlight: '#58a6ff', ink: '#e8eef8' },
] as const;

// Room at the foot for the compass, which sits over the page as it does over the map.
const PAGE: CSSProperties = { padding: '20px 20px 140px', display: 'grid', gap: 14, maxWidth: 1180, margin: '0 auto' };
const GRID: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 };
const ROW: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 };
const NOTE: CSSProperties = { margin: '8px 0 0', color: THEME.dim, fontSize: 11.5 };

function Section({ title, where, children }: { title: string; where: string; children: ReactNode }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
      <p style={NOTE}><code>{where}</code></p>
    </section>
  );
}

function Gallery() {
  const [colours, setColours] = useState<{ main: string; highlight: string; ink: string }>(PRESETS[0]);
  const [world, setWorld] = useState('select');
  const [bearing, setBearing] = useState(0);
  const [hour, setHour] = useState(14);
  const [name, setName] = useState('Aldra');
  const recolour = (next: { main: string; highlight: string; ink: string }) => {
    setColours(next);
    const root = document.documentElement.style;
    root.setProperty('--ui-main', next.main);
    root.setProperty('--ui-highlight', next.highlight);
    root.setProperty('--ui-ink', next.ink);
  };
  const names = Object.keys(GLYPHS) as GameIconName[];

  return (
    <div style={PAGE}>
      <section className="card">
        <h2>The master colours</h2>
        <div style={ROW}>
          {(['main', 'highlight', 'ink'] as const).map((key) => (
            <label key={key} style={ROW}>
              <span className="lbl">{`--ui-${key}`}</span>
              <ColourInput value={colours[key]} onCommit={(value) => recolour({ ...colours, [key]: value })} />
            </label>
          ))}
          {PRESETS.map((preset) => (
            <button key={preset.name} className={colours.main === preset.main ? 'on' : ''} onClick={() => recolour(preset)}>
              {preset.name}
            </button>
          ))}
        </div>
        <p className="hint">Everything below is mixed from these three, plus danger and ok (packages/theme/tokens.css).</p>
      </section>

      <div style={GRID}>
        <Section title="Brand" where="packages/ui/src/brand-logo">
          <div style={{ display: 'grid', gap: 14 }}>
            <BrandLogo subtitle="GM Console" statusLabel="Step 6/10" />
            <BrandLogo subtitle="Table Display" />
          </div>
        </Section>

        <Section title="Tool slots" where="packages/ui/src/slot-button">
          <div className="btn-grid tools">
            {([['select', 'Select'], ['travel', 'Travel'], ['places', 'Places'], ['height', 'Height'], ['ground', 'Ground'], ['cover', 'Cover']] as const)
              .map(([id, label], i) => (
                <SlotButton
                  key={id}
                  icon={id === 'travel' ? 'walk' : id}
                  label={label}
                  hotkey={String(i + 1)}
                  active={world === id}
                  tooltip={`${label} — key ${i + 1}`}
                  onClick={() => setWorld(id)}
                />
              ))}
          </div>
        </Section>
      </div>

      <Section title={`Icons (${names.length})`} where="packages/ui/src/game-icon — GLYPHS">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
          {names.map((icon) => (
            <div key={icon} style={{ display: 'grid', justifyItems: 'center', gap: 6, padding: 8 }} className="member">
              <GameIcon name={icon} size={24} />
              <code style={{ fontSize: 11 }}>{icon}</code>
            </div>
          ))}
        </div>
      </Section>

      <div style={GRID}>
        <Section title="Buttons" where="packages/theme/base.css">
          <div style={ROW}>
            <button>Framed</button>
            <button className="on">Chosen</button>
            <button className="danger">Danger</button>
            <button className="quiet">Quiet</button>
            <button className="quiet danger-trigger">×</button>
            <button disabled>Disabled</button>
          </div>
          <p className="hint">A row&apos;s actions drawn as icons, each with its name (D-390):</p>
          <div style={ROW}>
            <span style={{ flex: 1 }}>The old bridge</span>
            <IconButton icon="move-up" label="Move up" disabled onClick={() => undefined} />
            <IconButton icon="move-down" label="Move down" onClick={() => undefined} />
            <IconButton icon="edit" label="Edit The old bridge" onClick={() => undefined} />
          </div>
          <p className="hint">A delete always asks first (R-151):</p>
          <div style={ROW}>
            <span style={{ flex: 1 }}>Sphere 1</span>
            <ConfirmDelete label="Take Sphere 1 away" confirmLabel="Remove" onConfirm={() => undefined} />
          </div>
        </Section>

        <Section title="Fields" where="packages/ui/src/draft-input · colour-input · picture-input">
          <div style={{ display: 'grid', gap: 8 }}>
            <div className="row" style={ROW}>
              <PictureInput src={null} fallback={THEME.highlight} label="Picture for Aldra" onPick={() => undefined} onClear={() => undefined} />
              <DraftInput value={name} valid={(draft) => draft.trim().length > 0} onCommit={setName} />
            </div>
            <select defaultValue="nobody"><option>nobody</option><option>Aldra</option></select>
            <p className="lbl">Hour <span className="hour">{hour}:00</span></p>
            <input className="dial" type="range" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))} />
          </div>
        </Section>

        <Section title="Panel parts" where="apps/gm/src/shell/shell.css">
          <div className="notice">Table is inside <b>Tollkeep</b>.</div>
          <div className="member">
            <div className="top"><span className="nm">A row in its well</span></div>
          </div>
          <p className="readout">7.4 · sees 12</p>
          <p className="hint">A hint: secondary words, with <b>key terms</b> in ink.</p>
          <p className="hint">
            A key named in words is a <kbd>kbd</kbd>, drawn as a slot&apos;s number is: <kbd>Escape</kbd> keeps it.
          </p>
          <p className="warn">A warning, in the highlight.</p>
        </Section>

        <Section title="Tooltips and the compass" where="packages/ui/src/tooltip · compass">
          <div style={ROW}>
            <Tooltip label="Tooltips open on hover and on focus" placement="bottom">
              <button>Hover me</button>
            </Tooltip>
            <span className="hint" style={{ margin: 0 }}>The compass sits at the foot of the page, as in the app.</span>
          </div>
        </Section>
      </div>

      <Compass bearing={bearing} onTurn={(steps) => setBearing((b) => (b + steps * 90 + 360) % 360)} onTilt={() => undefined} />
    </div>
  );
}

// The page scrolls, unlike the screens.
document.body.style.overflow = 'auto';
if (browserIsEnough((condition) => CSS.supports(condition))) {
  createRoot(document.getElementById('root')!).render(<StrictMode><Gallery /></StrictMode>);
}

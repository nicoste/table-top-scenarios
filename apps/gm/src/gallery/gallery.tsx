// The design gallery (R-217, D-387, D-394): everything DESIGN_SYSTEM.md names,
// drawn by the real components with the real stylesheet, so it cannot show a
// look the screens do not have. The panels at the foot are the console's own,
// handed sample data and callbacks that do nothing. Served with the console, at
// /gm/gallery.html; no campaign, no host connection. The table's own parts are
// at /table/gallery.html, with the table's stylesheet.
//
// The three pickers change the master colours on the page, which is the whole
// of re-theming: everything else is mixed from them (packages/theme).

import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { CAMERA_HINT, EMPTY_HAND, MEASURE_START } from '@tt/client-core';
import type { MeasureHand, PropHand } from '@tt/client-core';
import {
  AREA_COLOURS, DEFAULT_FLOOR, DEFAULT_MARKER, DEFAULT_TRAVEL_MODES, NO_AREAS, ON_FOOT, createMap, drawArea, putProp,
} from '@tt/domain';
import type { Travelling } from '@tt/domain';
import { PlaceWireSchema, SilverTokenWireSchema, TokenTemplateWireSchema } from '@tt/protocol';
import {
  BrandLogo, ColourInput, Compass, ConfirmDelete, DraftInput, GameIcon, GLYPHS, IconButton, Metrics, PictureInput,
  SlotButton, THEME, Tooltip, WithKeys,
} from '@tt/ui';
import type { GameIconName, Reading } from '@tt/ui';
import { LibraryPanel } from '../features/library/index.js';
import { MeasurePanel } from '../features/measure/index.js';
import { OnStagePanel } from '../features/on-stage/index.js';
import type { PartyOnStage } from '../features/on-stage/index.js';
import { PlaceInspector } from '../features/place/index.js';
import { PropsPanel } from '../features/props/index.js';
import { TravelPanel } from '../features/travel/index.js';
import type { Journey } from '../features/travel/index.js';

/** The master colours, as tokens.css sets them, and two others to try. */
const PRESETS = [
  { name: 'Slate & amber', main: '#181c24', highlight: '#f5a524', ink: '#e6e9ef' },
  { name: 'Obsidian & emerald', main: '#121a16', highlight: '#56d364', ink: '#e6f2ea' },
  { name: 'Deep rune & cyan', main: '#141824', highlight: '#58a6ff', ink: '#e8eef8' },
] as const;

/** Every colour DESIGN_SYSTEM.md names a use for: the masters, then what is mixed from them. */
const COLOURS = [
  '--ui-main', '--ui-highlight', '--ui-ink', '--ui-danger', '--ui-ok', '--ui-tertiary', '--ui-key',
  '--bg', '--panel', '--edge', '--dim', '--ink', '--accent', '--ok',
] as const;

/** The text sizes, each in the face DESIGN_SYSTEM.md gives it. */
const TEXT = [
  { token: '--ui-text-h1', face: '--ui-font', words: 'A launcher card’s title' },
  { token: '--ui-text-h2', face: '--ui-font', words: 'A CARD’S TITLE' },
  { token: '--ui-text-label', face: '--ui-font', words: 'A FIELD’S LABEL' },
  { token: '--ui-text-body', face: '--ui-body-font', words: 'Words in a button, a field or a row' },
  { token: '--ui-text-control', face: '--ui-body-font', words: 'A compact control: a tool grid, a dropdown' },
  { token: '--ui-text-readout', face: '--ui-font', words: '7.4 · sees 12' },
  { token: '--ui-text-hint', face: '--ui-body-font', words: 'The secondary words under something' },
  { token: '--ui-text-meta', face: '--ui-body-font', words: 'A cost, a size, a tag, a row’s quiet action' },
] as const;

// Room at the foot for the compass, which sits over the page as it does over the map.
const PAGE: CSSProperties = { padding: '20px 20px 140px', display: 'grid', gap: 14, maxWidth: 1180, margin: '0 auto' };
const GRID: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 };
const DOCKS: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' };
const ROW: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 };
const NOTE: CSSProperties = { margin: '8px 0 0', color: THEME.dim, fontSize: THEME.textHint };
const CODE: CSSProperties = { fontSize: THEME.textMeta };
/** No screen has a link in its words yet, so the page colours its own two. */
const LINK: CSSProperties = { color: THEME.highlight };
/** The launcher's own rule draws its title; the page holds it still and small. */
const LAUNCHER: CSSProperties = { height: 'auto', padding: 0, display: 'block' };
/** A dock where the page puts it rather than where the screen does. */
const STILL: CSSProperties = { position: 'static', maxHeight: 'none' };

const nothing = () => undefined;

/** A place, through the protocol's own schema, so it is shaped as the console receives one. */
const PLACE = PlaceWireSchema.parse({
  id: 'place_gallery', name: 'Thornwick', cell: { cx: 0, cz: 0, x: 3, z: 4 }, markerId: DEFAULT_MARKER,
  notes: [
    { id: 'note_mill', text: 'The miller owes the baron three sacks.', visibleToParty: true },
    { id: 'note_cult', text: 'A cult meets under the chapel.', visibleToParty: false },
  ],
  pois: [{ id: 'poi_chapel', name: 'The chapel', visibleToParty: true }],
});

const TOKENS = [
  { id: 'tpl_goblin', name: 'Goblin', tags: ['goblinoid'], image: null, url: 'https://example.com/goblin' },
  { id: 'tpl_wolf', name: 'Wolf', tags: ['beast', 'pack'], image: null, url: null },
].map((token) => TokenTemplateWireSchema.parse(token));

const PARTY: readonly PartyOnStage[] = [
  { id: 'member_aldra', name: 'Aldra', colour: '#b3b5ff', picture: null, sight: 12, note: 'Owes the miller.', light: null },
];

const SILVER = [SilverTokenWireSchema.parse({ id: 'silver_a2', templateId: 'tpl_goblin', name: 'Goblin A2', at: { x: 2, y: 1, z: 3 } })];

const AREAS = drawArea(NO_AREAS, { shape: 'sphere', at: { x: 2, y: 1, z: 2 }, aim: { x: 0, y: 0, z: 0 }, size: 3, colour: AREA_COLOURS[1]!.id });

/** A journey of two legs, so the panel lists each with its cost (`.ways .diff`). */
const named = (name: string) => DEFAULT_TRAVEL_MODES.find((mode) => mode.name === name)!.id;
const JOURNEY: Journey = {
  who: 'the party',
  route: { cells: [], days: 2.5, legs: [{ mode: named('On foot'), days: 1 }, { mode: named('By ship'), days: 1.5 }] },
  onConfirm: nothing,
  onCancel: nothing,
};

const CHEST = putProp(createMap(), { type: 'chest', at: { x: 1, y: 1, z: 1 }, facing: 0 }).props[0]!;

const READING: Reading = {
  frames: { frames: 60, fps: 60, p50: 4.2, p95: 7.9, worst: 12.4 },
  calls: 212, triangles: 48_310, geometries: 96, textures: 14, programs: 22, rebuildMs: 18.6, rebuilds: 3,
  blocks: 1229, payload: 7_168, pushes: 2, heap: 41_000_000, occlusion: true, figures: true,
  lampShadows: 'on', gpuMs: 3.1, budgetMs: 16.7, drawn: 1229,
};

function Section({ title, where, children }: { title: string; where: string; children: ReactNode }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
      <p style={NOTE}><code>{where}</code></p>
    </section>
  );
}

export function Gallery() {
  const [colours, setColours] = useState<{ main: string; highlight: string; ink: string }>(PRESETS[0]);
  const [world, setWorld] = useState('select');
  const [bearing, setBearing] = useState(0);
  const [hour, setHour] = useState(14);
  const [name, setName] = useState('Aldra');
  const [chosenToken, setChosenToken] = useState<string | null>(null);
  const [measure, setMeasure] = useState<MeasureHand>(MEASURE_START);
  const [propHand, setPropHand] = useState<PropHand>(EMPTY_HAND);
  // Asking at first, so the page shows the question Backspace opens (D-389).
  const [asking, setAsking] = useState(true);
  const [travelling, setTravelling] = useState<Travelling>(ON_FOOT);
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
        <p className="hint">
          Everything below is mixed from these three, plus danger and ok (packages/theme/tokens.css). The
          table&apos;s own parts are on <a href="/table/gallery.html" style={LINK}>the table&apos;s gallery</a>.
        </p>
      </section>

      <div style={GRID}>
        <Section title="Colours" where="packages/theme/tokens.css">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
            {COLOURS.map((token) => (
              <div key={token} style={ROW}>
                <span
                  style={{
                    width: 26, height: 26, flex: 'none', background: `var(${token})`,
                    border: `2px solid ${THEME.slotBorder}`, borderRadius: THEME.radius,
                  }}
                />
                <code style={CODE}>{token}</code>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Text" where="packages/theme/tokens.css — --ui-text-*">
          {TEXT.map(({ token, face, words }) => (
            <div key={token} style={{ ...ROW, justifyContent: 'space-between', margin: '0 0 6px' }}>
              {token === '--ui-text-h1'
                ? <div className="launcher" style={LAUNCHER}><h1 style={{ margin: 0 }}>{words}</h1></div>
                : <span style={{ font: `var(${token})/1.3 var(${face})` }}>{words}</span>}
              <code style={CODE}>{token}</code>
            </div>
          ))}
        </Section>
      </div>

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
              <code style={CODE}>{icon}</code>
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
            <button className="plain">Plain</button>
            <button disabled>Disabled</button>
          </div>
          <p className="hint">A row&apos;s actions drawn as icons, each with its name (D-390):</p>
          <div style={ROW}>
            <span style={{ flex: 1 }}>The old bridge</span>
            <IconButton icon="move-up" label="Move up" disabled onClick={nothing} />
            <IconButton icon="move-down" label="Move down" onClick={nothing} />
            <IconButton icon="edit" label="Edit The old bridge" onClick={nothing} />
          </div>
          <p className="hint">A delete always asks first (R-151):</p>
          <div style={ROW}>
            <span style={{ flex: 1 }}>Sphere 1</span>
            <ConfirmDelete label="Take Sphere 1 away" confirmLabel="Remove" onConfirm={nothing} />
          </div>
        </Section>

        <Section title="Fields" where="packages/ui/src/draft-input · colour-input · picture-input">
          <div style={{ display: 'grid', gap: 8 }}>
            <div className="row" style={ROW}>
              <PictureInput src={null} fallback={THEME.highlight} label="Picture for Aldra" onPick={nothing} onClear={nothing} />
              <DraftInput value={name} valid={(draft) => draft.trim().length > 0} onCommit={setName} />
              <ColourInput value={colours.highlight} onCommit={(value) => recolour({ ...colours, highlight: value })} />
            </div>
            <select defaultValue="nobody"><option>nobody</option><option>Aldra</option></select>
            <p className="lbl">Hour <span className="hour">{hour}:00</span></p>
            <input className="dial" type="range" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))} />
          </div>
        </Section>

        <Section title="Panel parts" where="packages/theme/base.css · apps/gm/src/shell/shell.css">
          <div className="notice">Table is inside <b>Tollkeep</b>.</div>
          <div className="member">
            <div className="top"><span className="nm">A row in its well</span></div>
          </div>
          <p className="readout">7.4 · sees 12</p>
          <p className="hint">A hint: secondary words, with <b>key terms</b> in ink.</p>
          <p className="hint">
            A key named in words is a <kbd>kbd</kbd>, drawn as a slot&apos;s number is: <kbd>Escape</kbd> keeps it.
          </p>
          <p className="hint"><WithKeys line={CAMERA_HINT} /></p>
          <p className="warn">A warning: what will not work as the GM expects, in the highlight.</p>
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

      <Section title="Panels, the console's own" where="apps/gm/src/features — with sample data">
        <div style={DOCKS}>
          <div className="dock" style={STILL}>
            <PlaceInspector
              place={PLACE} revealed chunkKnown dispatch={nothing} onClose={nothing} onOpenMap={nothing}
            />
          </div>
          <div className="dock" style={STILL}>
            <TravelPanel modes={DEFAULT_TRAVEL_MODES} travelling={travelling} journey={JOURNEY} onTravelling={setTravelling} />
          </div>
          <div className="dock" style={STILL}>
            <LibraryPanel library={TOKENS} chosen={chosenToken} onChoose={setChosenToken} dispatch={nothing} />
            <MeasurePanel
              hand={measure} onHand={setMeasure} areas={AREAS} people={PARTY}
              placeId={PLACE.id} poiId="poi_chapel" dispatch={nothing}
            />
          </div>
          <div className="dock dock-right dock-wide" style={STILL}>
            <OnStagePanel
              party={PARTY} silver={SILVER} order={{}} library={TOKENS}
              placeId={PLACE.id} poiId="poi_chapel" dispatch={nothing} onPickMember={nothing}
            />
            <PropsPanel
              hand={propHand} onHand={setPropHand} selected={CHEST} onSelect={nothing}
              asking={asking} onAsking={setAsking} opened={new Set()}
              placeId={PLACE.id} poiId="poi_chapel" swatch={DEFAULT_FLOOR} dispatch={nothing}
            />
          </div>
        </div>
      </Section>

      <Section title="Metrics" where="packages/ui/src/metrics — the cost overlay, here held in place">
        {/* A transformed box holds a fixed child: the overlay sits here, not over the page. */}
        <div style={{ position: 'relative', height: 430, transform: 'translateZ(0)' }}>
          <Metrics reading={READING} hint="The key that opens this closes it." />
        </div>
      </Section>

      <Compass bearing={bearing} onTurn={(steps) => setBearing((b) => (b + steps * 90 + 360) % 360)} onTilt={nothing} />
    </div>
  );
}

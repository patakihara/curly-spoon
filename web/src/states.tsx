/**
 * The states fixture, `/states.html`: each interactive Sonora component drawn with its action
 * bound, with none, and with `disabled` set (src/states-list.ts), for the browser test of
 * Material's states (web/e2e/states.spec.ts). Its own entry beside the app and the gallery,
 * linked from nowhere. A bound action counts its presses in `window.__presses`.
 * `?theme=light` draws it in the light theme.
 */
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts/fonts.css';
import './generated/tokens/sonora-tokens.css';
import './generated/tokens/sonora-theme.css';
import {
  AccountButton,
  Button,
  ButtonGroup,
  DownloadButton,
  ExpandableText,
  FollowButton,
  IconButton,
  Input,
  LyricsSyncButton,
  OverflowMenu,
  PreviewButton,
  RailItem,
  SearchButton,
  SearchField,
  SeekBar,
  Slider,
  SortFilterBar,
  SpeedControl,
  Switch,
  TonalIconButton,
  ViewToggle,
} from './generated/ui';
import { pressKey, STATE_ENTRIES, type Variant } from './states-list';

window.__presses = {};

/** How one drawing is pressed: its action for `action` and `disabled`, nothing for `none`. */
type Act = (() => void) | undefined;

const LONG =
  'A paragraph long enough to fold: the description of a book, a show or an album, which runs on ' +
  'past the one line it is clamped to here, so the control that unfolds it is drawn.';

/** Each entry's drawing, given its press handler and whether `disabled` is set. */
const DRAW: Record<string, (act: Act, disabled: boolean) => ReactNode> = {
  AccountButton: (act) => <AccountButton onClick={act} />,
  Button: (act, disabled) => (
    <Button onClick={act} disabled={disabled}>
      Play
    </Button>
  ),
  ButtonGroup: (act) => (
    <ButtonGroup items={['All', 'Music', 'Books']} value="All" onChange={act} />
  ),
  DownloadButton: (act) => <DownloadButton onClick={act} />,
  ExpandableText: (act) => <ExpandableText text={LONG} lines={1} onToggle={act} />,
  FollowButton: (act) => <FollowButton onChange={act} />,
  IconButton: (act, disabled) => (
    <IconButton icon="favorite" label="Favourite" onClick={act} disabled={disabled} />
  ),
  Input: (act, disabled) => <Input placeholder="Name" onChange={act} disabled={disabled} />,
  LyricsSyncButton: (act) => <LyricsSyncButton onChange={act} />,
  OverflowMenu: (act) => (
    // Opening the menu is the press counted; choosing a verb is the action it enables.
    <OverflowMenu
      items={[{ key: 'add', label: 'Add to playlist' }]}
      onSelect={act}
      onOpenChange={act}
    />
  ),
  PreviewButton: (act, disabled) => <PreviewButton onClick={act} disabled={disabled} />,
  // A collapsed rail's row: 56px, inside the rail's 12px padding.
  RailItem: (act) => (
    <div style={{ width: 56 }}>
      <RailItem icon="home" label="Home" expanded={false} onClick={act} />
    </div>
  ),
  SearchButton: (act) => <SearchButton onToggle={act} />,
  SearchField: (act, disabled) => (
    <SearchField placeholder="Search" onChange={act} disabled={disabled} />
  ),
  SeekBar: (act) => <SeekBar value={0.3} duration={200} onChange={act} />,
  Slider: (act) => <Slider value={0.4} onChange={act} />,
  SortFilterBar: (act) => <SortFilterBar label="All episodes • Newest" onClick={act} />,
  SpeedControl: (act) => <SpeedControl value={1.5} onClick={act} />,
  Switch: (act) => <Switch checked onChange={act} />,
  TonalIconButton: (act, disabled) => (
    <TonalIconButton glyph="grid_view" label="Grid" onClick={act} disabled={disabled} />
  ),
  ViewToggle: (act) => <ViewToggle onChange={act} />,
};

const press = (key: string) => () => {
  window.__presses[key] = (window.__presses[key] ?? 0) + 1;
};

function Cell({ name, variant }: { name: string; variant: Variant }) {
  const draw = DRAW[name];
  if (draw === undefined) throw new Error(`the states fixture draws no ${name}`);
  const act = variant === 'none' ? undefined : press(pressKey(name, variant));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, color: 'var(--surface-fg-muted)' }}>{variant}</span>
      {/* An off-screen stop just before the drawing, so Tab from it reaches the drawing first. */}
      <button type="button" data-sentinel="" style={{ position: 'absolute', left: -9999 }}>
        before {name} {variant}
      </button>
      <div
        data-states={name}
        data-variant={variant}
        style={{ padding: 24, width: 256, boxSizing: 'border-box' }}
      >
        {draw(act, variant === 'disabled')}
      </div>
    </div>
  );
}

function States() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 24 }}>
      {STATE_ENTRIES.map((entry) => (
        <section key={entry.name} style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <h2 style={{ width: 160, margin: 0, fontSize: 13, fontWeight: 'var(--weight-strong)' }}>
            {entry.name}
          </h2>
          <Cell name={entry.name} variant="action" />
          <Cell name={entry.name} variant="none" />
          {entry.disabled && <Cell name={entry.name} variant="disabled" />}
        </section>
      ))}
    </div>
  );
}

const theme =
  new URLSearchParams(window.location.search).get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.setAttribute('data-theme', theme);
Object.assign(document.body.style, {
  margin: '0',
  background: 'var(--surface-bg)',
  color: 'var(--surface-fg)',
  fontFamily: 'var(--font-body)',
});

const root = document.getElementById('root');
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <States />
    </StrictMode>,
  );
}

/**
 * The states fixture, `/states.html`: each interactive Sonora component drawn with its action
 * bound, with none, with `disabled` set, and keeping its own state (src/states-list.ts), for the
 * browser test of Material's states (web/e2e/states.spec.ts). Its own entry beside the app and
 * the gallery, linked from nowhere. A bound action counts its presses in `window.__presses`.
 * `?theme=light` draws it in the light theme, and `?only=<Name>` draws one entry.
 */
import { StrictMode, useEffect, useRef, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts/fonts.css';
import './generated/tokens/sonora-tokens.css';
import './generated/tokens/sonora-theme.css';
import {
  AccountButton,
  ArtistCard,
  BottomNav,
  Button,
  ButtonGroup,
  DownloadButton,
  EditableList,
  EpisodeRow,
  ExpandableText,
  ExpanderRow,
  FeatureCard,
  FieldRow,
  FollowButton,
  IconButton,
  Input,
  Lyrics,
  LyricsPage,
  LyricsSyncButton,
  MediaCard,
  MediaHeader,
  MiniPlayer,
  NavRail,
  NowPlaying,
  NowPlayingPage,
  OverflowMenu,
  PlayActions,
  PlayerPanel,
  PlayerSubPage,
  PreviewButton,
  QueuePage,
  QueueRow,
  QuickPick,
  RailItem,
  ResultRow,
  SearchButton,
  SearchField,
  Section,
  SectionHeader,
  SeekBar,
  SettingRow,
  SideSheet,
  Slider,
  SortFilterBar,
  SpeedControl,
  StatusBanner,
  Switch,
  TabBar,
  TonalIconButton,
  TransportBar,
  ValueRow,
  ViewToggle,
} from './generated/ui';
import { pressKey, STATE_ENTRIES, type Variant } from './states-list';

window.__presses = {};

/** How one drawing is pressed: its action for `action` and `disabled`, nothing for `none`. */
type Act = (() => void) | undefined;

const LONG =
  'A paragraph long enough to fold: the description of a book, a show or an album, which runs on ' +
  'past the one line it is clamped to here, so the control that unfolds it is drawn.';

const NAV = [
  { key: 'home', icon: 'home', label: 'Home' },
  { key: 'music', icon: 'music_note', label: 'Music' },
];
const TABS = [
  { key: 'now', label: 'Now' },
  { key: 'queue', label: 'Queue' },
];
const QUEUE = [
  { title: 'Driftwave', sub: 'Halcyon Bloom', time: '3:12', current: true },
  { title: 'Low Tide', sub: 'Halcyon Bloom', time: '4:05' },
  { title: 'Harbour Lights', sub: 'Halcyon Bloom', time: '2:58' },
];

/**
 * A row of an EditableList that selects itself once, so the list's remove bar has a selection to
 * act on. Once only: StrictMode runs an effect twice, and a second toggle would clear it.
 */
function Selected({ toggle, title }: { toggle: () => void; title: string }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    toggle();
  }, [toggle]);
  return <div style={{ padding: 8 }}>{title}</div>;
}

/** A positioned box for a component that fills its container. */
const Frame = ({ height, children }: { height: number; children: ReactNode }) => (
  <div style={{ position: 'relative', height, display: 'flex', flexDirection: 'column' }}>
    {children}
  </div>
);

/** Each entry's drawing, given its press handler and whether `disabled` is set. */
const DRAW: Record<string, (act: Act, disabled: boolean) => ReactNode> = {
  AccountButton: (act) => <AccountButton onClick={act} />,
  ArtistCard: (act) => (
    <ArtistCard title="Halcyon Bloom" sub="Artist" width="120px" onClick={act} />
  ),
  BottomNav: (act) => <BottomNav items={NAV} active="home" onChange={act} />,
  Button: (act, disabled) => (
    <Button onClick={act} disabled={disabled}>
      Play
    </Button>
  ),
  ButtonGroup: (act) => (
    <ButtonGroup items={['All', 'Music', 'Books']} value="All" onChange={act} />
  ),
  DownloadButton: (act) => <DownloadButton onClick={act} />,
  EditableList: (act) => (
    <EditableList
      editing
      items={[{ id: 1, title: 'Low Tide' }]}
      onRemoveSelected={act}
      renderRow={({ item, key, toggle }) => (
        <Selected key={key} toggle={toggle} title={(item as { title: string }).title} />
      )}
    />
  ),
  // Neither drawing passes onPlay: its overlay over the art is a control of its own.
  EpisodeRow: (act) => <EpisodeRow title="Episode 12" meta={['Sep 30', '48 min']} onClick={act} />,
  ExpandableText: (act) => <ExpandableText text={LONG} lines={1} expanded={false} onToggle={act} />,
  ExpanderRow: (act) => <ExpanderRow label="More releases" onToggle={act} />,
  FeatureCard: (act) => (
    <FeatureCard kind="Album" title="Driftwave" meta="Halcyon Bloom" onMore={act} onSave={act} />
  ),
  FieldRow: (act) => <FieldRow label="Name" placeholder="Your name" onChange={act} />,
  FollowButton: (act) => <FollowButton onChange={act} />,
  IconButton: (act, disabled) => (
    <IconButton icon="favorite" label="Favourite" onClick={act} disabled={disabled} />
  ),
  Input: (act, disabled) => <Input placeholder="Name" onChange={act} disabled={disabled} />,
  Lyrics: (act) => (
    <Lyrics
      lines={['First line', 'Second line']}
      card={false}
      autoScroll={false}
      onLineClick={act}
    />
  ),
  // Desktop, where the page has no close bar: the sync control is its one control.
  LyricsPage: (act) => (
    <LyricsPage platform="desktop" heading={null} lines={['First line']} onSyncModeChange={act} />
  ),
  LyricsSyncButton: (act) => <LyricsSyncButton onChange={act} />,
  OverflowMenu: (act) => (
    // Opening the menu is the press counted; choosing a verb is the action it enables.
    <OverflowMenu
      items={[{ key: 'add', label: 'Add to playlist' }]}
      onSelect={act}
      onOpenChange={act}
    />
  ),
  // No onPlay: the card's own press is the control here, not the play actions over its art.
  MediaCard: (act) => (
    <MediaCard title="Driftwave" sub="Halcyon Bloom" width="140px" onClick={act} />
  ),
  MediaHeader: (act) => (
    <MediaHeader
      platform="mobile"
      kindLabel="Album"
      title="Driftwave"
      nextLabel={null}
      lastLabel={null}
      onPlay={act}
    />
  ),
  MiniPlayer: (act) => (
    <MiniPlayer title="Driftwave" artist="Halcyon Bloom" onOpen={act} onTogglePlay={act} />
  ),
  NavRail: (act) => <NavRail items={NAV} active="home" expanded={false} onChange={act} />,
  NowPlaying: (act) => (
    <Frame height={420}>
      <NowPlaying
        open
        track={{ title: 'Driftwave', artist: 'Halcyon Bloom' }}
        onClose={act}
        onMore={act}
      >
        <div />
      </NowPlaying>
    </Frame>
  ),
  NowPlayingPage: (act) => (
    <NowPlayingPage
      scroll={false}
      title="Driftwave"
      artist="Halcyon Bloom"
      favourite={false}
      onFavourite={act}
    />
  ),
  PlayActions: (act) => <PlayActions always onNext={act} onPlay={act} onLast={act} />,
  PlayerPanel: (act) => (
    <PlayerPanel open width="208px" tabs={TABS} tab="now" onTabChange={act} onClose={act}>
      <div />
    </PlayerPanel>
  ),
  PlayerSubPage: (act) => (
    <Frame height={160}>
      <PlayerSubPage heading="Queue" onClose={act}>
        <div />
      </PlayerSubPage>
    </Frame>
  ),
  PreviewButton: (act, disabled) => <PreviewButton onClick={act} disabled={disabled} />,
  QueuePage: (act) => (
    <QueuePage platform="desktop" heading={null} items={QUEUE} onClear={act} onRemove={act} />
  ),
  QueueRow: (act) => (
    <QueueRow title="Low Tide" sub="Halcyon Bloom" time="4:05" handle={false} onClick={act} />
  ),
  QuickPick: (act) => <QuickPick title="Driftwave" sub="Album" onClick={act} />,
  // A collapsed rail's row: 56px, inside the rail's 12px padding.
  RailItem: (act) => (
    <div style={{ width: 56 }}>
      <RailItem icon="home" label="Home" expanded={false} onClick={act} />
    </div>
  ),
  // A numbered row has no art, so no play overlay of its own over the row's press.
  ResultRow: (act) => <ResultRow title="Low Tide" meta="Halcyon Bloom" number={2} onClick={act} />,
  SearchButton: (act) => <SearchButton onToggle={act} />,
  SearchField: (act, disabled) => (
    <SearchField placeholder="Search" onChange={act} disabled={disabled} />
  ),
  Section: (act) => (
    <Section title="New" action="arrow_forward" actionLabel="See all" onAction={act} last>
      <div />
    </Section>
  ),
  SectionHeader: (act) => (
    <SectionHeader title="New" action="arrow_forward" actionLabel="See all" onAction={act} />
  ),
  SeekBar: (act) => <SeekBar value={0.3} duration={200} onChange={act} />,
  SettingRow: (act) => <SettingRow title="Gapless" sub="No gap between tracks" onChange={act} />,
  SideSheet: (act) => (
    <SideSheet open title="Queue" width="208px" onClose={act}>
      <div />
    </SideSheet>
  ),
  Slider: (act) => <Slider value={0.4} onChange={act} />,
  SortFilterBar: (act) => <SortFilterBar label="All episodes • Newest" onClick={act} />,
  SpeedControl: (act) => <SpeedControl value={1.5} onClick={act} />,
  StatusBanner: (act) => (
    <StatusBanner tone="warning" actionLabel="Retry" onAction={act}>
      Offline
    </StatusBanner>
  ),
  Switch: (act) => <Switch checked onChange={act} />,
  TabBar: (act) => <TabBar items={TABS} value="now" onChange={act} />,
  TonalIconButton: (act, disabled) => (
    <TonalIconButton glyph="grid_view" label="Grid" onClick={act} disabled={disabled} />
  ),
  TransportBar: (act) => (
    <TransportBar
      platform="desktop"
      onShuffle={act}
      onPrev={act}
      onTogglePlay={act}
      onNext={act}
      onRepeat={act}
    />
  ),
  ValueRow: (act) => <ValueRow label="Sleep timer" value="Off" onClick={act} />,
  ViewToggle: (act) => <ViewToggle onChange={act} />,
};

/** Each `owns` entry's drawing left uncontrolled, with no action. */
const OWN: Record<string, () => ReactNode> = {
  ExpandableText: () => <ExpandableText text={LONG} lines={1} />,
};

const press = (key: string) => () => {
  window.__presses[key] = (window.__presses[key] ?? 0) + 1;
};

function own(name: string) {
  const draw = OWN[name];
  if (draw === undefined) throw new Error(`the states fixture draws no ${name} of its own`);
  return draw();
}

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
        {variant === 'own' ? own(name) : draw(act, variant === 'disabled')}
      </div>
    </div>
  );
}

/** `?only=<Name>` draws that one entry, as the browser tests open it. */
const only = new URLSearchParams(window.location.search).get('only');

/**
 * `?card=more` draws instead one desktop MediaCard with its play actions and its corner menu both
 * bound, for the test that hovering the art leaves More the control a click reaches.
 */
const card = new URLSearchParams(window.location.search).get('card');

function States() {
  if (card === 'more') {
    return (
      <div style={{ padding: 24 }}>
        <MediaCard
          title="Driftwave"
          sub="Halcyon Bloom"
          width="176px"
          onClick={press('MediaCard.card')}
          onPlay={press('MediaCard.play')}
          onMore={press('MediaCard.more')}
        />
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 24 }}>
      {STATE_ENTRIES.filter((e) => only === null || e.name === only).map((entry) => (
        <section key={entry.name} style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <h2 style={{ width: 160, margin: 0, fontSize: 13, fontWeight: 'var(--weight-strong)' }}>
            {entry.name}
          </h2>
          <Cell name={entry.name} variant="action" />
          <Cell name={entry.name} variant="none" />
          {entry.disabled && <Cell name={entry.name} variant="disabled" />}
          {entry.owns === true && <Cell name={entry.name} variant="own" />}
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

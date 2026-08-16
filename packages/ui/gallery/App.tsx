/**
 * Renders every @auralis/ui component in every variant/state, each wrapped in an
 * element carrying a stable `data-testid` — this is both the dev playground
 * (`pnpm --filter @auralis/ui dev`) and the fixture `e2e/ui/*.spec.ts` drives.
 */
import { useRef, useState } from 'react';
import {
  AURALIS_SOURCE_COLOR,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  Fab,
  FILLABLE_ICON_NAMES,
  Icon,
  ICON_NAMES,
  IconButton,
  LinearProgress,
  ListItem,
  Marquee,
  NavigationBar,
  SearchField,
  Sheet,
  Skeleton,
  Slider,
  Snackbar,
  ThemeProvider,
  TopAppBar,
  useSnackbar,
  useTheme,
  type NavigationItem,
} from '../src/index.js';

const NAV_ITEMS: NavigationItem[] = [
  { key: 'home', label: 'Home', icon: <Icon name="home" /> },
  { key: 'library', label: 'Library', icon: <Icon name="library_books" /> },
  { key: 'podcasts', label: 'Podcasts', icon: <Icon name="podcasts" /> },
  { key: 'settings', label: 'Settings', icon: <Icon name="settings" /> },
];

const SOURCE_COLOR_SWATCHES = [
  { id: 'amber', label: 'Amber (default)', hex: AURALIS_SOURCE_COLOR },
  { id: 'blue', label: 'Blue', hex: '#1B6EF3' },
  { id: 'green', label: 'Green', hex: '#2E7D32' },
  { id: 'red', label: 'Red', hex: '#B00020' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="gallery-section" data-testid={`section-${slug(title)}`}>
      <h2>{title}</h2>
      <div className="gallery-row">{children}</div>
    </section>
  );
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function ThemeControls() {
  const { mode, setMode, sourceColor, setSourceColor, scheme } = useTheme();

  return (
    <section className="gallery-section" data-testid="section-theme-controls">
      <h2>Theme</h2>
      <div className="gallery-row" data-testid="theme-mode-controls">
        {(['light', 'dark', 'system'] as const).map((candidate) => (
          <Button
            key={candidate}
            variant={mode === candidate ? 'filled' : 'outlined'}
            size="sm"
            data-testid={`mode-${candidate}`}
            onClick={() => setMode(candidate)}
          >
            {candidate}
          </Button>
        ))}
      </div>
      <div className="gallery-row" data-testid="theme-color-controls">
        {SOURCE_COLOR_SWATCHES.map((swatch) => (
          <button
            key={swatch.id}
            type="button"
            data-testid={`color-${swatch.id}`}
            aria-label={swatch.label}
            aria-pressed={sourceColor.toLowerCase() === swatch.hex.toLowerCase()}
            className="gallery-swatch"
            style={{ background: swatch.hex }}
            onClick={() => setSourceColor(swatch.hex)}
          />
        ))}
      </div>
      <p data-testid="current-primary-value" className="gallery-mono">
        --m3-primary: {scheme.primary}
      </p>
    </section>
  );
}

function ButtonGallery() {
  const variants = ['filled', 'tonal', 'outlined', 'text', 'elevated'] as const;
  return (
    <Section title="Button">
      {variants.map((variant) => (
        <Button key={variant} variant={variant} data-testid={`button-${variant}`}>
          {variant}
        </Button>
      ))}
      <Button size="sm" data-testid="button-size-sm">
        Small
      </Button>
      <Button size="lg" data-testid="button-size-lg">
        Large
      </Button>
      <Button loading data-testid="button-loading">
        Loading
      </Button>
      <Button disabled data-testid="button-disabled">
        Disabled
      </Button>
      <Button leadingIcon={<Icon name="add" />} data-testid="button-leading-icon">
        Add
      </Button>
    </Section>
  );
}

function IconButtonGallery() {
  const [selected, setSelected] = useState(false);
  const variants = ['standard', 'filled', 'tonal', 'outlined'] as const;
  return (
    <Section title="IconButton">
      {variants.map((variant) => (
        <IconButton
          key={variant}
          variant={variant}
          aria-label={variant}
          data-testid={`icon-button-${variant}`}
        >
          <Icon name="play" />
        </IconButton>
      ))}
      <IconButton
        aria-label="Shuffle"
        selected={selected}
        onSelectedChange={setSelected}
        data-testid="icon-button-toggle"
      >
        <Icon name="shuffle" />
      </IconButton>
    </Section>
  );
}

function FabGallery() {
  return (
    <Section title="Fab">
      <Fab size="sm" icon={<Icon name="add" />} aria-label="Add" data-testid="fab-sm" />
      <Fab size="md" icon={<Icon name="add" />} aria-label="Add" data-testid="fab-md" />
      <Fab size="lg" icon={<Icon name="add" />} aria-label="Add" data-testid="fab-lg" />
      <Fab extended icon={<Icon name="add" />} label="Create" data-testid="fab-extended" />
    </Section>
  );
}

function CardGallery() {
  return (
    <Section title="Card">
      <Card variant="elevated" data-testid="card-elevated">
        Elevated card
      </Card>
      <Card variant="filled" data-testid="card-filled">
        Filled card
      </Card>
      <Card variant="outlined" data-testid="card-outlined">
        Outlined card
      </Card>
      <Card interactive variant="elevated" data-testid="card-interactive" onClick={() => {}}>
        Interactive card
      </Card>
    </Section>
  );
}

function ListItemGallery() {
  return (
    <Section title="ListItem">
      <ListItem headline="One line" data-testid="list-item-1-line" />
      <ListItem
        headline="Two line"
        supportingText="Supporting text"
        data-testid="list-item-2-line"
      />
      <ListItem
        overline="Overline"
        headline="Three line"
        supportingText="Supporting text that wraps to a second line for this row"
        leading={<Icon name="music_note" />}
        trailing={<Icon name="more_vert" />}
        data-testid="list-item-3-line"
      />
      <ListItem headline="Selected" selected data-testid="list-item-selected" />
    </Section>
  );
}

function SliderGallery() {
  const [value, setValue] = useState(30);
  const [wavyValue, setWavyValue] = useState(40);
  return (
    <Section title="Slider">
      <div style={{ width: 320 }} data-testid="slider-basic">
        <Slider
          aria-label="Playback position"
          value={value}
          min={0}
          max={100}
          onChange={setValue}
        />
      </div>
      <div style={{ width: 320 }} data-testid="slider-buffered">
        <Slider
          aria-label="Playback position, buffered"
          value={20}
          buffered={60}
          min={0}
          max={100}
          onChange={() => {}}
        />
      </div>
      <div style={{ width: 320 }} data-testid="slider-wavy">
        <Slider
          aria-label="Playback position, wavy"
          value={wavyValue}
          min={0}
          max={100}
          onChange={setWavyValue}
          wavy
          animateWave
        />
      </div>
      <div style={{ width: 320 }} data-testid="slider-disabled">
        <Slider
          aria-label="Playback position, disabled"
          value={50}
          min={0}
          max={100}
          onChange={() => {}}
          disabled
        />
      </div>
      {/*
       * No wrapping data-testid here, deliberately: this instance exists to prove
       * `Slider` forwards arbitrary pass-through props (`data-testid`, but standing in
       * for any `aria-*`/`id`/event-handler prop) onto its own rendered DOM, not to be
       * located via a wrapper the way the other gallery entries are.
       */}
      <Slider
        aria-label="Playback position, passthrough check"
        value={70}
        min={0}
        max={100}
        onChange={() => {}}
        data-testid="slider-passthrough"
      />
    </Section>
  );
}

function NavigationGallery() {
  const [activeBar, setActiveBar] = useState('home');
  return (
    <Section title="Navigation">
      <div data-testid="nav-bar" style={{ width: 360 }}>
        <NavigationBar items={NAV_ITEMS} activeKey={activeBar} onActiveChange={setActiveBar} />
      </div>
    </Section>
  );
}

function TopAppBarGallery() {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  return (
    <Section title="TopAppBar">
      <div style={{ width: 320 }} data-testid="top-app-bar-small">
        <TopAppBar
          variant="small"
          title="Library"
          leading={
            <IconButton aria-label="Back">
              <Icon name="chevron_left" />
            </IconButton>
          }
        />
      </div>
      <div
        ref={scrollRef}
        data-testid="top-app-bar-large-scroll-container"
        style={{
          width: 320,
          height: 200,
          overflowY: 'auto',
          border: '1px solid var(--m3-outline-variant)',
        }}
      >
        <TopAppBar variant="large" title="Audiobooks" scrollContainerRef={scrollRef} />
        <div style={{ height: 600, padding: 16 }}>Scroll me to collapse the bar above.</div>
      </div>
    </Section>
  );
}

function SearchFieldGallery() {
  const [value, setValue] = useState('');
  return (
    <Section title="SearchField">
      <div style={{ width: 320 }} data-testid="search-field">
        <SearchField
          value={value}
          onChange={setValue}
          suggestions={[
            { id: '1', label: 'Project Hail Mary' },
            { id: '2', label: 'Piranesi' },
            { id: '3', label: 'Lyrics: "carry on"' },
          ]}
        />
      </div>
    </Section>
  );
}

function ChipGallery() {
  const [selected, setSelected] = useState(true);
  return (
    <Section title="Chip">
      <Chip variant="assist" icon={<Icon name="download" />} data-testid="chip-assist">
        Download
      </Chip>
      <Chip
        variant="filter"
        selected={selected}
        onSelectedChange={setSelected}
        data-testid="chip-filter"
      >
        Audiobooks
      </Chip>
      <Chip variant="input" onRemove={() => {}} data-testid="chip-input">
        Fiction
      </Chip>
    </Section>
  );
}

function SheetGallery() {
  const [open, setOpen] = useState(false);
  return (
    <Section title="Sheet">
      <Button data-testid="sheet-open" onClick={() => setOpen(true)}>
        Open sheet
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Queue"
        detents={[0.4, 0.9]}
        aria-label="Queue"
      >
        <div data-testid="sheet-panel-content">
          <p>Drag the handle up or down, or press Escape to close.</p>
          <Button onClick={() => setOpen(false)} data-testid="sheet-close">
            Close
          </Button>
        </div>
      </Sheet>
    </Section>
  );
}

function DialogGallery() {
  const [open, setOpen] = useState(false);
  return (
    <Section title="Dialog">
      <Button data-testid="dialog-open" onClick={() => setOpen(true)}>
        Open dialog
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Remove download?"
        actions={
          <>
            <Button variant="text" onClick={() => setOpen(false)} data-testid="dialog-cancel">
              Cancel
            </Button>
            <Button variant="filled" onClick={() => setOpen(false)} data-testid="dialog-confirm">
              Remove
            </Button>
          </>
        }
      >
        This removes the local copy. It stays in your library online.
      </Dialog>
    </Section>
  );
}

function SnackbarGallery() {
  const { current, enqueue, dismiss } = useSnackbar();
  return (
    <Section title="Snackbar">
      <Button
        data-testid="snackbar-trigger"
        onClick={() =>
          enqueue({ message: 'Added to queue', actionLabel: 'Undo', onAction: () => {} })
        }
      >
        Show snackbar
      </Button>
      <div data-testid="snackbar-display">
        <Snackbar snackbar={current} onDismiss={dismiss} />
      </div>
    </Section>
  );
}

function ProgressGallery() {
  return (
    <Section title="Progress">
      <div style={{ width: 200 }} data-testid="linear-progress-determinate">
        <LinearProgress value={0.6} aria-label="Download progress" />
      </div>
      <div style={{ width: 200 }} data-testid="linear-progress-indeterminate">
        <LinearProgress indeterminate aria-label="Loading" />
      </div>
      <div style={{ width: 200 }} data-testid="linear-progress-wavy">
        <LinearProgress indeterminate wavy aria-label="Buffering" />
      </div>
      <div data-testid="circular-progress-determinate">
        <CircularProgress value={0.4} aria-label="Download progress" />
      </div>
      <div data-testid="circular-progress-indeterminate">
        <CircularProgress indeterminate aria-label="Loading" />
      </div>
    </Section>
  );
}

function SkeletonGallery() {
  return (
    <Section title="Skeleton">
      <Skeleton shape="text" width={160} data-testid="skeleton-text" />
      <Skeleton shape="circular" width={48} height={48} data-testid="skeleton-circular" />
      <Skeleton shape="rectangular" width={160} height={90} data-testid="skeleton-rectangular" />
    </Section>
  );
}

function IconGallery() {
  return (
    <Section title="Icon">
      <div className="gallery-icon-grid" data-testid="icon-grid">
        {ICON_NAMES.map((name) => (
          <div key={name} className="gallery-icon-cell" data-testid={`icon-${name}`}>
            <Icon name={name} title={name} />
            <span>{name}</span>
          </div>
        ))}
      </div>
      {/* Outline (FILL 0) variants, for the nav-rail-style filled/unselected distinction —
          separate testids so e2e can diff a filled cell's `d` against its outline twin. */}
      <div className="gallery-icon-grid" data-testid="icon-outline-grid">
        {FILLABLE_ICON_NAMES.map((name) => (
          <div key={name} className="gallery-icon-cell" data-testid={`icon-outline-${name}`}>
            <Icon name={name} title={`${name} outline`} filled={false} />
            <span>{name} (outline)</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function MarqueeGallery() {
  return (
    <Section title="Marquee">
      <div style={{ width: 160 }} data-testid="marquee-overflowing">
        <Marquee>This title is deliberately far too long to fit in this box</Marquee>
      </div>
      <div style={{ width: 400 }} data-testid="marquee-short">
        <Marquee>Short title</Marquee>
      </div>
    </Section>
  );
}

/**
 * Wave 16b-2 (docs/ROADMAP.md §16): the reader for Sonora's token layer. Every token name
 * below is authored once and reused both to render this specimen page and — via
 * `data-token`/`data-testid` — as the enumeration `e2e/ui/sonora-tokens.spec.ts` reads to
 * assert each one resolves to a non-empty computed value in both themes. Adding a token
 * here without a dark (or light) CSS value therefore fails that spec immediately, which is
 * the point: `docs/HANDOVER.md` names "a token defined in light and forgotten in dark" as
 * this wave's real risk, and it is invisible to every other test in the repo.
 */
const SONORA_NEUTRAL_TOKENS = [
  'neutral-950',
  'neutral-900',
  'neutral-850',
  'neutral-700',
  'neutral-500',
  'neutral-300',
  'neutral-100',
  'neutral-50',
  'neutral-0',
] as const;

/** Theme-dependent — see `packages/ui/src/styles/sonora-theme.css`. */
const SONORA_SURFACE_TOKENS = [
  'surface-bg',
  'surface-bg-alt',
  'surface-card',
  'surface-fg',
  'surface-fg-muted',
  'surface-border',
] as const;

/** Static across themes — see `packages/ui/src/styles/sonora-tokens.css`. */
const SONORA_ACCENT_TOKENS = ['accent', 'accent-contrast'] as const;

const SONORA_ACCENT_PRESET_TOKENS = [
  'accent-red',
  'accent-orange',
  'accent-amber',
  'accent-yellow',
  'accent-lime',
  'accent-green',
  'accent-emerald',
  'accent-teal',
  'accent-cyan',
  'accent-sky',
  'accent-blue',
  'accent-indigo',
  'accent-violet',
  'accent-purple',
  'accent-fuchsia',
  'accent-pink',
  'accent-rose',
] as const;

const SONORA_STATE_TOKENS = [
  'state-error',
  'state-success',
  'state-warning',
  'state-info',
] as const;

/** Theme-dependent — the five app-level tokens Sonora itself doesn't ship (SONORA.md §2). */
const SONORA_APP_LEVEL_TOKENS = [
  'accent-ink',
  'tone-library',
  'tone-progress',
  'tone-request',
  'tone-error',
] as const;

const SONORA_RADIUS_TOKENS = [
  'radius-xs',
  'radius-sm',
  'radius-md',
  'radius-lg',
  'radius-pill',
] as const;

const SONORA_SPACE_TOKENS = [
  'space-0',
  'space-xs',
  'space-sm',
  'space-md',
  'space-lg',
  'space-xl',
  'space-2xl',
  'space-3xl',
  'space-4xl',
] as const;

const SONORA_SPACING_TOKENS = [
  'spacing-xs',
  'spacing-sm',
  'spacing-md',
  'spacing-lg',
  'spacing-xl',
  'spacing-2xl',
  'grid-gap',
] as const;

const SONORA_SIZE_TOKENS = ['icon-sm', 'icon-md', 'miniplayer-album-size'] as const;

const SONORA_TEXT_TOKENS = [
  'text-xs',
  'text-sm',
  'text-md',
  'text-lg',
  'text-xl',
  'text-2xl',
  'text-3xl',
  'text-4xl',
  'text-5xl',
] as const;

const SONORA_LEADING_TOKENS = [
  'leading-xs',
  'leading-sm',
  'leading-md',
  'leading-lg',
  'leading-xl',
] as const;

const SONORA_HEADING_TOKENS = [
  'h1-size',
  'h1-leading',
  'h2-size',
  'h2-leading',
  'h3-size',
  'h3-leading',
  'h4-size',
  'h4-leading',
  'heading-weight',
] as const;

const SONORA_SHADOW_TOKENS = [
  'shadow-xs',
  'shadow-sm',
  'shadow-md',
  'shadow-lg',
  'shadow-xl',
  'shadow-xxl',
] as const;

/** One specimen tile. `data-token` is the exact custom property name the e2e spec reads. */
function TokenTile({ name, style }: { name: string; style: React.CSSProperties }) {
  return (
    <div className="sonora-token-tile" data-testid={`token-${name}`} data-token={`--${name}`}>
      <div className="sonora-token-sample" style={style} />
      <span className="sonora-token-label">{name}</span>
    </div>
  );
}

function ColorTile({ name }: { name: string }) {
  return <TokenTile name={name} style={{ background: `var(--${name})` }} />;
}

function SonoraColorGallery() {
  return (
    <Section title="Sonora colors">
      <div className="sonora-token-grid" data-testid="sonora-neutral-grid">
        {SONORA_NEUTRAL_TOKENS.map((name) => (
          <ColorTile key={name} name={name} />
        ))}
      </div>
      <div className="sonora-token-grid" data-testid="sonora-accent-grid">
        {SONORA_ACCENT_TOKENS.map((name) => (
          <ColorTile key={name} name={name} />
        ))}
        {SONORA_ACCENT_PRESET_TOKENS.map((name) => (
          <ColorTile key={name} name={name} />
        ))}
      </div>
      <div className="sonora-token-grid" data-testid="sonora-state-grid">
        {SONORA_STATE_TOKENS.map((name) => (
          <ColorTile key={name} name={name} />
        ))}
      </div>
    </Section>
  );
}

function SonoraSurfaceGallery() {
  return (
    <Section title="Sonora surfaces">
      <div className="sonora-token-grid" data-testid="sonora-surface-grid">
        {SONORA_SURFACE_TOKENS.map((name) => (
          <ColorTile key={name} name={name} />
        ))}
        <TokenTile
          name="surface-overlay-header"
          style={{ background: 'var(--surface-overlay-header)' }}
        />
      </div>
      <div className="sonora-token-grid" data-testid="sonora-app-level-grid">
        {SONORA_APP_LEVEL_TOKENS.map((name) => (
          <ColorTile key={name} name={name} />
        ))}
      </div>
    </Section>
  );
}

function SonoraRadiusGallery() {
  return (
    <Section title="Sonora radius">
      <div className="sonora-token-grid" data-testid="sonora-radius-grid">
        {SONORA_RADIUS_TOKENS.map((name) => (
          <TokenTile
            key={name}
            name={name}
            style={{ background: 'var(--accent)', borderRadius: `var(--${name})` }}
          />
        ))}
      </div>
    </Section>
  );
}

function SonoraSpacingGallery() {
  return (
    <Section title="Sonora spacing">
      <div className="sonora-token-grid" data-testid="sonora-space-grid">
        {SONORA_SPACE_TOKENS.map((name) => (
          <TokenTile
            key={name}
            name={name}
            style={{ width: `var(--${name})`, height: 8, background: 'var(--accent)' }}
          />
        ))}
      </div>
      <div className="sonora-token-grid" data-testid="sonora-spacing-scale-grid">
        {SONORA_SPACING_TOKENS.map((name) => (
          <TokenTile
            key={name}
            name={name}
            style={{ width: `var(--${name})`, height: 8, background: 'var(--accent-violet)' }}
          />
        ))}
      </div>
      <div className="sonora-token-grid" data-testid="sonora-size-grid">
        {SONORA_SIZE_TOKENS.map((name) => (
          <TokenTile
            key={name}
            name={name}
            style={{
              width: `var(--${name})`,
              height: `var(--${name})`,
              background: 'var(--accent-teal)',
              borderRadius: '50%',
            }}
          />
        ))}
      </div>
    </Section>
  );
}

function SonoraTypographyGallery() {
  return (
    <Section title="Sonora typography">
      <div className="sonora-token-grid" data-testid="sonora-text-grid">
        {SONORA_TEXT_TOKENS.map((name) => (
          <TokenTile
            key={name}
            name={name}
            style={{ fontSize: `var(--${name})`, color: 'var(--surface-fg, currentColor)' }}
          />
        ))}
      </div>
      <div className="sonora-token-grid" data-testid="sonora-leading-grid">
        {SONORA_LEADING_TOKENS.map((name) => (
          <TokenTile
            key={name}
            name={name}
            style={{
              lineHeight: `var(--${name})`,
              fontSize: '11px',
              color: 'var(--surface-fg, currentColor)',
            }}
          />
        ))}
      </div>
      <div className="sonora-token-grid" data-testid="sonora-heading-grid">
        {SONORA_HEADING_TOKENS.map((name) => (
          <TokenTile
            key={name}
            name={name}
            style={
              (name === 'heading-weight'
                ? { fontWeight: `var(--${name})`, fontFamily: 'var(--font-display)' }
                : name.endsWith('-leading')
                  ? { lineHeight: `var(--${name})`, fontSize: '11px' }
                  : {
                      fontSize: `var(--${name})`,
                      fontFamily: 'var(--font-display)',
                    }) as React.CSSProperties
            }
          />
        ))}
      </div>
    </Section>
  );
}

function SonoraShadowGallery() {
  return (
    <Section title="Sonora shadows">
      <div className="sonora-token-grid" data-testid="sonora-shadow-grid">
        {SONORA_SHADOW_TOKENS.map((name) => (
          <TokenTile
            key={name}
            name={name}
            style={{
              boxShadow: `var(--${name})`,
              background: 'var(--surface-card, #333)',
              width: 48,
              height: 48,
            }}
          />
        ))}
      </div>
    </Section>
  );
}

function GalleryContent() {
  return (
    <div className="gallery-content">
      <ThemeControls />
      <ButtonGallery />
      <IconButtonGallery />
      <FabGallery />
      <CardGallery />
      <ListItemGallery />
      <SliderGallery />
      <NavigationGallery />
      <TopAppBarGallery />
      <SearchFieldGallery />
      <ChipGallery />
      <SheetGallery />
      <DialogGallery />
      <SnackbarGallery />
      <ProgressGallery />
      <SkeletonGallery />
      <IconGallery />
      <MarqueeGallery />
      <SonoraColorGallery />
      <SonoraSurfaceGallery />
      <SonoraRadiusGallery />
      <SonoraSpacingGallery />
      <SonoraTypographyGallery />
      <SonoraShadowGallery />
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider mode="dark" sourceColor={AURALIS_SOURCE_COLOR}>
      <GalleryContent />
    </ThemeProvider>
  );
}

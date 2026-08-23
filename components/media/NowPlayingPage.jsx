import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/**
 * The Currently Playing page — cover, song, seek, transport and the playback readouts, in the shape
 * both platforms share. Mobile adds previews of the lyrics and the queue that open their full pages;
 * desktop leaves them out, because there they are the player panel's own tabs.
 */
export function NowPlayingPage({
  platform = 'mobile', image, title, artist, context,
  playing = false, progress = 0, duration = 0,
  onTogglePlay, onPrev, onNext, onShuffle, onRepeat, onSeek,
  onClose, closeGlyph = 'keyboard_arrow_down', onMore, favourite = false, onFavourite,
  speed = '1.0x', sleep = 'Off', onSpeed, onSleep,
  lyrics = [], lyricsActiveIndex = 0, lyricsSyncMode = 'sync', onOpenLyrics,
  queue = [], onOpenQueue, onPlayQueueItem, queuePreviewCount = 3,
  header, footer, scroll, background = 'var(--surface-bg-alt)', divider,
}) {
  const { IconButton, ScrollArea, CoverArt, SeekBar, TransportBar, ValueRow, SectionHeader, Lyrics, QueueRow } = NS();
  const mobile = platform === 'mobile';
  const scrolls = scroll === undefined ? mobile : scroll;
  const pad = mobile ? 'var(--spacing-2xl)' : '0px';
  const gap = mobile ? 'var(--spacing-xl)' : 'var(--spacing-lg)';
  const icon = (name, size) => <span style={{ fontFamily: 'Material Symbols Rounded', fontSize: size || 'var(--icon-sm)', lineHeight: 1 }}>{name}</span>;
  // Song, art and seek share one measure: the art's width, centred, with the seek bar inset a hair.
  const artWidth = mobile ? 'min(76%, var(--now-playing-art-max))' : '100%';

  const upNext = queue.filter((q) => !q.current).slice(0, queuePreviewCount);
  const restOfQueue = queue.filter((q) => !q.current).length - upNext.length;
  // The bar's hairline appears only once content runs under it — the same rule ContentPane follows —
  // or stays put when a sub-page is open against it.
  const [scrolled, setScrolled] = React.useState(false);
  const lyricsRef = React.useRef(null);
  const queueRef = React.useRef(null);
  const rectOf = (ref) => (ref.current && ref.current.getBoundingClientRect ? ref.current.getBoundingClientRect() : null);

  // The lyric preview holds the line being sung on its centre line and slides the sheet under it, so
  // the window reads as a moving view of a longer sheet rather than a slice of three lines.
  const lyricWindowRef = React.useRef(null);
  const lyricTrackRef = React.useRef(null);
  const [lyricShift, setLyricShift] = React.useState(0);
  React.useLayoutEffect(() => {
    const win = lyricWindowRef.current, track = lyricTrackRef.current;
    const list = track && track.querySelector('[data-sn-lyric-lines]');
    const row = list && list.children[lyricsActiveIndex];
    if (!win || !row) return;
    setLyricShift(-(row.offsetTop + row.offsetHeight / 2 - win.clientHeight / 2));
  }, [lyricsActiveIndex, lyrics.length, mobile]);

  const preview = (heading, count, onOpen, body, ref) => (
    <div ref={ref} style={sx('display:flex;flex-direction:column')}>
      <div onClick={() => onOpen && onOpen(rectOf(ref))} style={sx('cursor:pointer;border-radius:var(--radius-sm);background:var(--surface-bg);padding:var(--spacing-md);display:flex;flex-direction:column;gap:var(--spacing-sm);height:var(--now-playing-preview-height);overflow:hidden')}>
        {SectionHeader && (
          <div style={sx('padding:0 var(--spacing-xs) var(--spacing-sm);border-bottom:1px solid var(--surface-border)')}>
            <SectionHeader platform={platform} title={heading} action="expand_content" actionLabel={'Open ' + heading.toLowerCase()} onAction={() => onOpen && onOpen(rectOf(ref))} />
          </div>
        )}
        {body}
        {count ? (
          <span style={sx('font-size:var(--text-sm);font-weight:var(--weight-strong);color:var(--accent-ink)')}>{count}</span>
        ) : null}
      </div>
    </div>
  );

  const body = (
    <div style={sx('display:flex;flex-direction:column;gap:' + gap + ';box-sizing:border-box;padding:' + (scrolls ? pad + ' ' + pad + ' var(--spacing-2xl)' : '0px'))}>
      <div style={sx('position:relative;overflow:hidden;align-self:center;aspect-ratio:1;flex-shrink:0;width:' + artWidth +
        ';border-radius:var(--radius-' + (mobile ? 'lg' : 'md') + ');background:linear-gradient(135deg,var(--accent),var(--accent-violet))')}>
        {CoverArt && <CoverArt src={image} alt={title ? title + ' cover' : ''} />}
      </div>
      <div style={sx('display:flex;align-items:flex-start;gap:var(--spacing-md);align-self:center;box-sizing:border-box;width:' + artWidth)}>
        <div style={sx('flex:1;min-width:0')}>
          <div style={sx('font-family:var(--font-display);font-weight:var(--weight-super-strong);font-stretch:var(--display-stretch);line-height:1.15;color:var(--surface-fg);font-size:' + (mobile ? 'var(--text-4xl)' : 'var(--text-2xl)'))}>{title}</div>
          <div style={sx('margin-top:2px;color:var(--surface-fg-muted);font-size:' + (mobile ? 'var(--text-lg)' : 'var(--text-md)'))}>{artist}</div>
          {!mobile && context && <div style={sx('margin-top:6px;font-size:var(--text-sm);color:var(--surface-fg-muted)')}>{context}</div>}
        </div>
        {onFavourite && IconButton && (
          <IconButton label={favourite ? 'Remove from favourites' : 'Add to favourites'} active={favourite} muted={!favourite} size={mobile ? 44 : 36} onClick={onFavourite}>
            {icon(favourite ? 'favorite' : 'favorite_border')}
          </IconButton>
        )}
      </div>
      {SeekBar && (
        <div style={sx('display:flex;margin:0 ' + (mobile ? 'var(--spacing-sm)' : '0px'))}>
          <SeekBar value={progress} duration={duration} platform={platform} onChange={onSeek} />
        </div>
      )}
      {TransportBar && <TransportBar playing={playing} platform={platform} onTogglePlay={onTogglePlay} onPrev={onPrev} onNext={onNext} onShuffle={onShuffle} onRepeat={onRepeat} />}
      {ValueRow && (
        <div style={sx('display:grid;gap:var(--spacing-sm)' + (mobile ? ';grid-template-columns:repeat(2,minmax(0,1fr))' : ''))}>
          <ValueRow platform={platform} label="Speed" value={speed} onClick={onSpeed} />
          <ValueRow platform={platform} label="Sleep timer" value={sleep} onClick={onSleep} />
        </div>
      )}
      {mobile && lyrics.length > 0 && preview('Lyrics', null, onOpenLyrics,
        Lyrics && (
          <div ref={lyricWindowRef} style={sx('position:relative;flex:1;min-height:0;overflow:hidden;pointer-events:none;' +
            'mask-image:linear-gradient(to bottom,transparent 0%,#000 22%,#000 78%,transparent 100%);' +
            '-webkit-mask-image:linear-gradient(to bottom,transparent 0%,#000 22%,#000 78%,transparent 100%)')}>
            <div ref={lyricTrackRef} style={sx('position:absolute;left:0;right:0;top:0;transition:transform var(--duration-medium) var(--ease-standard);transform:translateY(' + lyricShift + 'px)')}>
              <Lyrics lines={lyrics} activeIndex={lyricsActiveIndex} syncMode={lyricsSyncMode} platform={platform} card={false} autoScroll={false} />
            </div>
          </div>
        ),
        lyricsRef
      )}
      {mobile && upNext.length > 0 && preview('Up next', restOfQueue > 0 ? '+' + restOfQueue + ' more in queue' : null, onOpenQueue,
        QueueRow && <div style={sx('display:flex;flex-direction:column')}>
          {upNext.map((q, i) => (
            <QueueRow key={q.id != null ? q.id : q.title} platform={platform} title={q.title} sub={q.sub} time={q.time}
              handle={false} draggable={false}
              onClick={onPlayQueueItem ? (e) => { if (e && e.stopPropagation) e.stopPropagation(); onPlayQueueItem(q, i); } : undefined} />
          ))}
        </div>,
        queueRef
      )}
    </div>
  );

  const bar = header !== undefined ? header : !mobile ? null : (
    <div style={sx('display:flex;align-items:center;gap:var(--spacing-sm);flex-shrink:0;box-sizing:border-box;height:var(--appbar-height-mobile);padding:0 ' + (mobile ? 'var(--spacing-lg)' : '0px') +
      ';border-bottom:1px solid ' + (divider || scrolled ? 'var(--surface-border)' : 'transparent') + ';transition:border-color var(--duration-instant) linear')}>
      {onClose && IconButton && <IconButton label="Collapse player" muted onClick={onClose}>{icon(closeGlyph, 'var(--icon-md)')}</IconButton>}
      <div style={sx('flex:1;min-width:0;text-align:center;font-size:var(--text-xs);letter-spacing:.12em;text-transform:uppercase;font-weight:var(--weight-strong);color:var(--surface-fg-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{context}</div>
      {onMore && IconButton && <IconButton label="More options" muted onClick={onMore}>{icon('more_vert')}</IconButton>}
    </div>
  );

  if (!scrolls) return <div style={sx('display:flex;flex-direction:column;gap:' + gap)}>{bar}{body}{footer}</div>;
  const Scroller = ScrollArea || (({ children, style }) => <div style={Object.assign({ flex: 1, minHeight: 0, overflowY: 'auto' }, style)}>{children}</div>);
  return (
    <div style={sx('display:flex;flex-direction:column;flex:1;min-height:0;background:' + background)}>
      {bar}
      <Scroller onScroll={(e) => setScrolled((e && e.target ? e.target.scrollTop : 0) > 8)}>{body}</Scroller>
      {footer}
    </div>
  );
}

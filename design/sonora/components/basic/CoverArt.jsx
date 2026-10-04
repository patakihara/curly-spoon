import React from 'react';
import { sx } from '../shared.js';

/**
 * Fills its (overflow-hidden) parent with cover art: a generated gradient until the image loads, then the image alone.
 * A collection with no art of its own passes its items' `covers`: four different ones make a 2×2 mosaic, fewer the first alone.
 */
export function CoverArt({ src, covers, fallback, alt = '' }) {
  const [loaded, setLoaded] = React.useState(false);
  const ref = React.useRef(null);
  const distinct = src ? [] : [...new Set((covers || []).filter(Boolean))];
  const mosaic = distinct.length >= 4;
  const shown = src || (mosaic ? undefined : distinct[0]);
  // A cached image can finish before React attaches onLoad, so check `complete` on mount too.
  React.useEffect(() => { if (ref.current && ref.current.complete) setLoaded(true); }, [shown]);
  if (mosaic) {
    return (
      <span style={sx('position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr')}>
        {distinct.slice(0, 4).map((cover) => (
          <span key={cover} style={sx('position:relative;overflow:hidden')}><CoverArt src={cover} fallback={fallback} alt="" /></span>
        ))}
      </span>
    );
  }
  const showFallback = !shown || !loaded;
  return (
    <React.Fragment>
      {/* Dropped once the image is up: an antialiased rounded corner blends whatever sits behind
          the image, so any leftover gradient shows as a coloured fringe no bleed can hide. */}
      {showFallback && <span aria-hidden="true" style={sx('position:absolute;inset:0;background:' + (fallback || 'var(--accent)'))} />}
      {shown && <img ref={ref} src={shown} alt={alt} loading="lazy" onLoad={() => setLoaded(true)}
        style={sx('position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:' + (loaded ? '1' : '0') + ';transition:opacity var(--duration-fast) ease')} />}
    </React.Fragment>
  );
}

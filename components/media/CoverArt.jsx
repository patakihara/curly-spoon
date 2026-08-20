import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));

/** Fills its (overflow-hidden) parent with cover art: a generated gradient until the image loads, then the image alone. */
export function CoverArt({ src, fallback, alt = '' }) {
  const [loaded, setLoaded] = React.useState(false);
  const ref = React.useRef(null);
  // A cached image can finish before React attaches onLoad, so check `complete` on mount too.
  React.useEffect(() => { if (ref.current && ref.current.complete) setLoaded(true); }, [src]);
  const showFallback = !src || !loaded;
  return (
    <React.Fragment>
      {/* Dropped once the image is up: an antialiased rounded corner blends whatever sits behind
          the image, so any leftover gradient shows as a coloured fringe no bleed can hide. */}
      {showFallback && <span aria-hidden="true" style={sx('position:absolute;inset:0;background:' + (fallback || 'linear-gradient(135deg,var(--accent),var(--accent-violet))'))} />}
      {src && <img ref={ref} src={src} alt={alt} loading="lazy" onLoad={() => setLoaded(true)}
        style={sx('position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:' + (loaded ? '1' : '0') + ';transition:opacity var(--duration-fast) ease')} />}
    </React.Fragment>
  );
}

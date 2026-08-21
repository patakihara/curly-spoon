import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/* Which glyph stands for a theme. Kept as a table rather than a prop because the three names
   Sonora ships are the whole set; a caller with a fourth passes `themeIcons`. */
const GLYPHS = { light: 'light_mode', dark: 'dark_mode', system: 'contrast', auto: 'contrast' };
const nameOf = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** The pinned bottom of a navigation rail: a theme switch and the identity of the library you are looking at. Mirrors the rail's own expanded/collapsed state — collapsed it stacks and drops every label, so the footer narrows with the rail instead of clipping. */
export function RailFooter({ expanded = true, theme, themes = ['light', 'dark'], themeIcons, onThemeChange, title, sub, image, avatarSize = 28, onIdentityClick, children }) {
  const { CoverArt } = NS();
  const open = expanded !== false;
  const glyphs = Object.assign({}, GLYPHS, themeIcons || {});
  const ease = 'var(--duration-fast) var(--ease-standard)';
  /* Only render a control whose handler exists: a rail with no theme to switch, or no library to
     name, should end at its last item rather than at an inert strip. */
  const showThemes = !!onThemeChange && themes.length > 0;
  const showIdentity = !!title || !!image;
  const identityInner = (
    <React.Fragment>
      {/* CoverArt positions itself against its container, so the container has to be a
          positioned box or the art escapes the rail and paints over the front layer. */}
      <div style={sx('position:relative;flex-shrink:0;overflow:hidden;border-radius:var(--radius-pill);background:var(--accent);width:' + avatarSize + 'px;height:' + avatarSize + 'px')}>
        {image && CoverArt && <CoverArt src={image} alt="" />}
      </div>
      {open && (title || sub) && (
        <div style={sx('flex:1;min-width:0;text-align:left')}>
          {title && <div style={sx('font-family:var(--font-body);font-size:var(--text-sm);font-weight:var(--weight-strong);color:var(--surface-fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{title}</div>}
          {sub && <div style={sx('font-family:var(--font-body);font-size:var(--text-xs);color:var(--surface-fg-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{sub}</div>}
        </div>
      )}
    </React.Fragment>
  );
  const identityStyle = sx(
    'display:flex;align-items:center;gap:var(--spacing-sm);box-sizing:border-box;width:100%;padding:var(--spacing-md);' +
    'border:none;border-top:1px solid var(--surface-border);background:transparent;' +
    'justify-content:' + (open ? 'flex-start' : 'center') + (onIdentityClick ? ';cursor:pointer' : '')
  );
  return (
    <div style={sx('display:flex;flex-direction:column;flex-shrink:0;width:100%;box-sizing:border-box')}>
      {children}
      {showThemes && (
        /* Collapsed the switch stacks rather than shrinking: two 54px-wide buttons inside a
           108px rail would leave the glyphs touching, and the label is gone anyway. */
        <div style={sx('display:flex;gap:var(--spacing-xs);box-sizing:border-box;padding:0 var(--spacing-md) var(--spacing-md);flex-direction:' + (open ? 'row' : 'column'))}>
          {themes.map((t) => {
            const on = theme === t;
            return (
              <button key={t} type="button" onClick={() => onThemeChange(t)} aria-pressed={on} aria-label={nameOf(t) + ' theme'}
                style={sx(
                  'flex:1;display:inline-flex;align-items:center;justify-content:center;gap:var(--spacing-xs);cursor:pointer;' +
                  'box-sizing:border-box;padding:var(--spacing-xs) 0;' +
                  'font-family:var(--font-body);font-size:var(--text-xs);font-weight:var(--weight-strong);' +
                  'border-radius:var(--radius-sm);border:1px solid var(--surface-border);' +
                  'transition:background ' + ease + ',color ' + ease + ';' +
                  'background:' + (on ? 'var(--accent)' : 'transparent') + ';' +
                  'color:' + (on ? 'var(--accent-contrast)' : 'var(--surface-fg-muted)')
                )}>
                <span aria-hidden="true" style={sx("font-family:'Material Symbols Rounded';line-height:1;font-size:var(--icon-xs);font-variation-settings:'FILL' " + (on ? 1 : 0) + ",'wght' 500")}>{glyphs[t] || 'contrast'}</span>
                {open && nameOf(t)}
              </button>
            );
          })}
        </div>
      )}
      {showIdentity && (onIdentityClick
        ? <button type="button" onClick={onIdentityClick} style={identityStyle}>{identityInner}</button>
        : <div style={identityStyle}>{identityInner}</div>)}
    </div>
  );
}

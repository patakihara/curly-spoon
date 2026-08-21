import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/** A Material backdrop frame: a 0dp back layer filling the whole background — rail and heading together — with the 1dp front layer and its subheader sitting on top of it, an optional side panel in front of or behind that layer, and the player docked across the bottom. */
export function BackdropShell({ back, rail, children, subheader, sheet, sheetOpen = false, sheetLayer = 'front', player, contentMinWidth, scroll = true, scrollKey, onProgress, lift, theme, platform = 'desktop' }) {
  const { FrontLayer } = NS();
  const behind = sheetLayer === 'behind';
  const ease = 'var(--duration-medium) var(--ease-standard)';
  /* Two panel treatments, and the difference is which surface owns the edges between them.
     In `front` the panel is the higher layer, so it draws its own border — a SideSheet's
     border-left already is both rules the alternative asks for, one against the back layer's
     heading strip and one against the front layer. In `behind` the panel is the lower layer and
     must not be outlined at all: the shell draws a short rule in the heading band and an inset
     one under it, and the front layer's shadow does the rest of the separating. */
  const panelFront = (
    <div style={sx('position:relative;z-index:2;flex-shrink:0;display:flex;min-height:0')}>{sheet}</div>
  );
  const panelBehind = (
    <div style={sx(
      'position:relative;flex-shrink:0;display:flex;min-height:0;overflow:hidden;background:var(--surface-bg-alt);' +
      'width:' + (sheetOpen ? 'var(--side-sheet-width)' : '0px') + ';' +
      'transition:width ' + ease
    )}>
      {/* Held at full width through the transition so nothing inside reflows while it opens. */}
      <div style={sx('display:flex;flex-direction:column;flex-shrink:0;min-height:0;width:var(--side-sheet-width)')}>{sheet}</div>
      {sheetOpen && (
        <span aria-hidden="true" style={sx('position:absolute;left:0;top:var(--spacing-lg);height:calc(var(--appbar-height) - var(--spacing-lg) * 2);width:1px;pointer-events:none;background:var(--surface-border)')} />
      )}
      {sheetOpen && (
        <span aria-hidden="true" style={sx('position:absolute;left:var(--grid-margin);right:var(--grid-margin);top:var(--appbar-height);height:1px;pointer-events:none;background:var(--surface-border)')} />
      )}
    </div>
  );
  return (
    <div data-theme={theme} style={sx('display:flex;flex-direction:column;height:100%;background:var(--surface-bg-alt)')}>
      {/* The back layer is the frame itself, so the rail is a region of it rather than a column
          beside it — nothing between the two changes colour or elevation. */}
      <div style={sx('display:flex;flex:1;min-height:0')}>
        {rail}
        {/* Raised above the panel so a `behind` panel receives the front layer's shadow instead of
            painting over it. A `front` panel outranks this again with its own z-index. */}
        <div style={sx('position:relative;z-index:1;display:flex;flex-direction:column;flex:1;min-width:0;min-height:0' + (contentMinWidth ? ';min-width:' + contentMinWidth : ''))}>
          {back && <div style={sx('flex-shrink:0')}>{back}</div>}
          {FrontLayer && (
            <FrontLayer subheader={subheader} scroll={scroll} scrollKey={scrollKey} onProgress={onProgress} lift={lift} platform={platform}
              squareRight={!behind && sheetOpen && !!sheet}>{children}</FrontLayer>
          )}
        </div>
        {sheet && (behind ? panelBehind : panelFront)}
      </div>
      <div style={sx('flex-shrink:0;width:100%')}>{player}</div>
    </div>
  );
}

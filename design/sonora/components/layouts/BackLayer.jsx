import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));

const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/** The backdrop's back layer: the 0dp --surface-bg-alt surface carrying the page heading and any contextual controls that reconfigure what the front layer is showing. No rounding, no elevation. Given `search`, its heading carries a local search that comes out as the front layer scrolls. Given `eyebrow` or `image`, the heading names a page by its subject, as SectionHeader's context form does. */
export function BackLayer({ title, eyebrow, image, round = false, leading, trailing, controls, search, searchOpen, progress = 0, appBar = false, atMargin = false, platform = 'desktop' }) {
  const mobile = platform === 'mobile';
  /* At the page margin the heading starts where PageBody starts the content under it. */
  const pad = atMargin ? 'var(--grid-margin' + (mobile ? '-mobile' : '') + ')' : 'var(--spacing-' + (mobile ? 'md' : 'xl') + ')';
  const { SearchField, SearchButton, CoverArt } = NS();
  /* The local search morphs in the backdrop's heading: the title fades
     out to the left while the field grows from the search button. Scrolling the front layer pulls
     the field out without focus; tapping the button pulls it out with focus and keeps it out at
     the top. `searchOpen` fixes the state, for a card or a page shown still. */
  const searchable = typeof search === 'string' && !!SearchField;
  const [open, setOpen] = React.useState(false);
  const [focus, setFocus] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const scrolled = (progress || 0) >= 1;
  React.useEffect(() => {
    if (scrolled) setOpen(true);
    else if (!focus) setOpen(false);
  }, [scrolled, focus]);
  const sOpen = searchable && (searchOpen === undefined ? open : !!searchOpen);
  const toggle = (next) => { setOpen(next); setFocus(next); if (!next) setQuery(''); };
  const ease = ' var(--duration-medium) var(--ease-standard)';
  /* Whichever of the field and the button is folded away is inert: drawn at no width and no
     opacity, it must not take focus either. */
  const fieldRef = React.useRef(null);
  const buttonRef = React.useRef(null);
  React.useEffect(() => {
    if (fieldRef.current) fieldRef.current.inert = !sOpen;
    if (buttonRef.current) buttonRef.current.inert = sOpen;
  }, [sOpen]);
  return (
    <div style={sx('display:flex;flex-direction:column;flex-shrink:0;box-sizing:border-box;width:100%;background:var(--surface-' + (appBar ? 'bg' : 'bg-alt') + ')')}>
      {/* The heading strip keeps the app bar's height so a side panel's own title row, which is
          measured against the same token, still lines up with it. */}
      <div style={sx('display:flex;align-items:center;gap:var(--spacing-md);width:100%;box-sizing:border-box;padding:0 ' + pad + ';height:var(--appbar-height' + (mobile ? '-mobile' : '') + ')')}>
        {leading}
        <div style={sx('position:relative;align-self:stretch;flex:1;min-width:0;display:flex;align-items:center')}>
          <div style={sx('flex:1;min-width:0;display:flex;align-items:center;gap:var(--spacing-md);opacity:' + (sOpen ? '0' : '1') + ';transform:translateX(' + (sOpen ? '-12px' : '0') + ');transition:opacity var(--duration-fast) ease,transform' + ease)}>
            {/* A page named by its subject ("More like" Deep Inertia) carries SectionHeader's
                context form in its heading, the subject's art beside an eyebrow over the title,
                so no header below has to say it again. */}
            {image && (
              <div style={sx('position:relative;flex-shrink:0;overflow:hidden;width:' + (mobile ? 40 : 48) + 'px;height:' + (mobile ? 40 : 48) + 'px;border-radius:' + (round ? '50%' : 'var(--radius-xs)'))}>
                {CoverArt && <CoverArt src={image} />}
              </div>
            )}
            <div style={sx('flex:1;min-width:0')}>
              {eyebrow && (
                <div style={sx('font-family:var(--font-body);font-weight:var(--weight-strong);font-size:var(--text-xs);line-height:1.3;margin-bottom:2px;color:var(--surface-fg-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{eyebrow}</div>
              )}
              <div style={sx((appBar ? 'font-family:var(--font-body);font-weight:var(--weight-strong);font-size:var(--text-xl);line-height:1.2;' : 'font-family:var(--font-display);font-weight:var(--display-weight);font-stretch:var(--display-stretch);letter-spacing:-.02em;font-size:var(--' + (mobile ? 'h3' : 'h2') + '-size);line-height:1.1;') + 'color:var(--surface-fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{title}</div>
            </div>
          </div>
          {searchable && (
            // It clips while it grows; 5px inside it, outside the heading, leave room for a ring.
            <div ref={fieldRef} style={sx('position:absolute;top:-5px;bottom:-5px;right:-5px;box-sizing:border-box;padding:5px;display:flex;align-items:center;overflow:hidden;width:' + (sOpen ? 'calc(100% + 10px)' : '0') + ';opacity:' + (sOpen ? '1' : '0') + ';transition:width' + ease + ',opacity var(--duration-fast) ease')}>
              <SearchField platform={platform} placeholder={search} value={query} onChange={setQuery} autoFocus={sOpen && focus} onClose={() => toggle(false)} />
            </div>
          )}
        </div>
        {/* The button hands its slot to the field: while the field is out, its close control lives
            inside it, so the heading's own actions stay put. */}
        {searchable && SearchButton && (
          // It clips while it folds; 5px inside it, taken back by the margin, leave room for the
          // button's focus ring (3px wide, 2px out).
          <div ref={buttonRef} style={sx('display:flex;align-items:center;overflow:hidden;flex-shrink:0;box-sizing:border-box;padding:5px;margin-top:-5px;margin-bottom:-5px;margin-left:-5px;max-width:' + (sOpen ? '0px' : '54px') + ';opacity:' + (sOpen ? '0' : '1') +
            ';margin-right:' + (sOpen ? 'calc(-1 * var(--spacing-md) - 5px)' : '-5px') + ';transition:max-width' + ease + ',margin-right' + ease + ',opacity var(--duration-fast) ease')}>
            <SearchButton onToggle={toggle} />
          </div>
        )}
        {trailing && <div style={sx('display:flex;align-items:center;flex-shrink:0')}>{trailing}</div>}
      </div>
      {/* Controls that stay put while the front layer's content changes underneath them. Anything
          that names a section of the content, or scrolls away with it, belongs on the front
          layer's subheader instead. */}
      {controls && (
        <div style={sx('display:flex;align-items:center;width:100%;box-sizing:border-box;min-height:var(--appbar-controls-height);padding:0 ' + pad + ';padding-bottom:var(--spacing-md)')}>
          <div style={sx('flex:1;min-width:0;max-width:100%')}>{controls}</div>
        </div>
      )}
    </div>
  );
}

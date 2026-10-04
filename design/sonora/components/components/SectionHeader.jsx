import React from 'react';
import { NS, activate } from '../shared.js';

/** Row heading above a carousel or grid, with an optional trailing action. */
export function SectionHeader({ title, action, actionLabel = 'More', onAction, platform = 'mobile', eyebrow, image, round = false, onSubject, actionText, trailing }) {
  const isMobile = platform === 'mobile';
  const { CoverArt, StateLayer } = NS();
  const off = !onAction;
  const titleEl = (
    <div style={{
      color: 'var(--surface-fg)',
      fontFamily: isMobile ? 'var(--font-body)' : 'var(--font-heading)',
      fontWeight: isMobile ? 700 : 900,
      fontSize: isMobile ? 'var(--text-xl)' : 'var(--h3-size)',
    }}>{title}</div>
  );
  // eyebrow/image/onSubject only exist together as a "subject" block — an unadorned header
  // skips this wrapper entirely so it renders exactly as it always has.
  const subjectInner = (eyebrow || image || onSubject) && (
    <React.Fragment>
      {image && (
        /* position:relative so CoverArt's inset:0 fill resolves against this thumbnail. */
        <div style={{ position: 'relative', width: 40, height: 40, flexShrink: 0, overflow: 'hidden', borderRadius: round ? '50%' : 'var(--radius-xs)' }}>
          {CoverArt && <CoverArt src={image} />}
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        {eyebrow && (
          <div style={{ color: 'var(--surface-fg-muted)', fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-strong)', fontSize: 'var(--text-xs)', marginBottom: 2 }}>{eyebrow}</div>
        )}
        {titleEl}
      </div>
    </React.Fragment>
  );
  const row = { display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', minWidth: 0 };
  // The subject is a link to its page only with onSubject; without it, it is the heading, not a
  // control, so it is drawn plain rather than disabled.
  const subject = !subjectInner ? titleEl : onSubject ? (
    <div className="sn-int" role="button" tabIndex={0} onClick={onSubject}
      onKeyDown={activate(() => onSubject())}
      style={{ ...row, cursor: 'pointer', borderRadius: 'var(--radius-xs)' }}>
      {subjectInner}
      {StateLayer && <StateLayer />}
    </div>
  ) : <div style={row}>{subjectInner}</div>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-md)', gap: 'var(--spacing-md)' }}>
      {subject}
      {trailing != null ? (
        /* A control of the section's own, such as the ViewToggle over a collection. */
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{trailing}</div>
      ) : actionText != null ? (
        /* Its padding overhangs the edge by 8px, not all 12: its focus ring, 5px out, still fits
           inside the narrowest page margin, the phone's 16px, where a scroller would cut it. */
        <button className="sn-int" onClick={off ? undefined : onAction} disabled={off} style={{
          border: 'none', background: 'transparent', flexShrink: 0, cursor: 'pointer',
          height: 32, padding: '0 var(--spacing-md)', marginRight: 'calc(-1 * var(--spacing-sm))', borderRadius: 'var(--radius-pill)',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-strong)',
          color: 'var(--surface-fg-muted)',
        }}>{actionText}{StateLayer && <StateLayer disabled={off} />}</button>
      ) : action && (
        <button className="sn-int" aria-label={actionLabel} onClick={off ? undefined : onAction} disabled={off} style={{
          width: 36, height: 36, borderRadius: '50%', border: 'none', flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', color: 'var(--surface-fg-muted)',
          cursor: 'pointer', fontFamily: 'Material Symbols Rounded', fontSize: 'var(--icon-sm)',
        }}><span aria-hidden="true">{action}</span>{StateLayer && <StateLayer disabled={off} />}</button>
      )}
    </div>
  );
}

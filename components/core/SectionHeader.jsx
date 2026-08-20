import React from 'react';
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/** Row heading above a carousel or grid, with an optional trailing action. */
export function SectionHeader({ title, action, actionLabel = 'More', onAction, platform = 'mobile', eyebrow, image, round = false, onSubject, actionText }) {
  const isMobile = platform === 'mobile';
  const CoverArt = NS().CoverArt;
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
  const subject = (eyebrow || image || onSubject) ? (
    <div onClick={onSubject} role={onSubject ? 'button' : undefined} tabIndex={onSubject ? 0 : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', minWidth: 0, cursor: onSubject ? 'pointer' : undefined }}>
      {image && (
        /* position:relative so CoverArt's inset:0 fill resolves against this thumbnail. */
        <div style={{ position: 'relative', width: 40, height: 40, flexShrink: 0, overflow: 'hidden', borderRadius: round ? '50%' : 'var(--radius-xs)' }}>
          {CoverArt && <CoverArt src={image} />}
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        {eyebrow && (
          <div style={{ color: 'var(--surface-fg-muted)', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)', marginBottom: 2 }}>{eyebrow}</div>
        )}
        {titleEl}
      </div>
    </div>
  ) : titleEl;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-md)', gap: 'var(--spacing-md)' }}>
      {subject}
      {actionText != null ? (
        <button onClick={onAction} style={{
          border: 'none', background: 'transparent', flexShrink: 0, cursor: 'pointer',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 700,
          color: 'var(--surface-fg-muted)',
        }}>{actionText}</button>
      ) : action && (
        <button aria-label={actionLabel} onClick={onAction} style={{
          width: 36, height: 36, borderRadius: '50%', border: 'none', flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', color: 'var(--surface-fg-muted)',
          cursor: 'pointer', fontFamily: 'Material Symbols Rounded', fontSize: 'var(--icon-sm)',
        }}>{action}</button>
      )}
    </div>
  );
}

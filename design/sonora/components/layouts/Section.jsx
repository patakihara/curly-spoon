import React from 'react';
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/**
 * A titled block of a feed: SectionHeader plus its content, with the standard gap to the next
 * section baked in. Use it for every row of a home/browse feed so the rhythm is consistent.
 */
export function Section({ title, action, actionLabel, onAction, platform = 'mobile', last = false, children, eyebrow, image, round, onSubject, actionText, trailing }) {
  const SectionHeader = NS().SectionHeader;
  const mobile = platform === 'mobile';
  return (
    <section style={{ marginBottom: last ? 0 : 'var(--spacing-' + (mobile ? '2xl' : 'xl') + ')' }}>
      {title && SectionHeader && <SectionHeader title={title} action={action} actionLabel={actionLabel} onAction={onAction} platform={platform} eyebrow={eyebrow} image={image} round={round} onSubject={onSubject} actionText={actionText} trailing={trailing} />}
      {children}
    </section>
  );
}

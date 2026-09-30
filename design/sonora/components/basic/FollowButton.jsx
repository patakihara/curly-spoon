import React from 'react';
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/** Subscription toggle whose label states the current state, not the action — pressing "Following" stops it. Wraps the existing Button rather than reimplementing it. */
export function FollowButton({ following = false, onChange, labels = {}, platform = 'desktop', size = 'md' }) {
  const Button = NS().Button;
  const offLabel = labels.off || 'Follow';
  const onLabel = labels.on || 'Following';
  // `pressed` rather than a bare aria-pressed attribute: Button destructures its props and renders
  // its own element, so anything it does not declare is dropped on the floor rather than forwarded.
  return Button ? (
    <Button
      variant={following ? 'secondary' : 'primary'}
      size={size}
      platform={platform}
      onClick={onChange ? () => onChange(!following) : undefined}
      pressed={following}
    >
      {following ? onLabel : offLabel}
    </Button>
  ) : null;
}

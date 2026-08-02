import type { ReactNode } from 'react';
import { Card } from '@auralis/ui';

export interface OnboardingCardProps {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

/** The shared full-bleed layout every onboarding step (setup/login/services) sits in. */
export function OnboardingCard({
  step,
  totalSteps,
  title,
  subtitle,
  children,
}: OnboardingCardProps) {
  return (
    <div className="auralis-onboarding" data-testid="onboarding-card">
      <Card variant="elevated" className="auralis-onboarding__card">
        <p className="auralis-onboarding__step" data-testid="onboarding-step">
          Step {step} of {totalSteps}
        </p>
        <h1 className="auralis-onboarding__title">{title}</h1>
        {subtitle ? <p className="auralis-onboarding__subtitle">{subtitle}</p> : null}
        {children}
      </Card>
    </div>
  );
}

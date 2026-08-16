/**
 * Card container. `interactive` turns it into a real, keyboard-operable button
 * (or link, via `href`) rather than a `<div onClick>` — clickable cards must still be
 * reachable and activatable from the keyboard.
 *
 * Thin wrapper around Mantine's `Card` (itself a `Paper`): Mantine supplies the
 * polymorphic `component`/ref plumbing (div/button/a); this file supplies the visuals
 * via `Card.css`'s `.m3-card*` classes (class names kept from the pre-Sonora M3
 * migration — only the CSS custom properties they resolve moved, in wave 16c-1, onto
 * Sonora's `--surface-*`/`--radius-*`/`--shadow-*`, docs/design/SONORA.md §1).
 * `NEUTRALIZE` below turns off every visual prop Mantine's `Paper` reads (shadow,
 * radius, border, padding) so `.m3-card*` is the only thing painting the card —
 * Paper's own CSS-module rule sets `box-shadow`/`border-radius`/`background-color`
 * at the same specificity as `.m3-card--*`, and while `@auralis/ui/styles.css`
 * imports Mantine's stylesheet ahead of this file's `Card.css` (so a cascade tie
 * would resolve in our favour anyway), neutralizing the props directly means the
 * result doesn't depend on that import order holding.
 */
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react';
import { Card as MantineCardPrimitive } from '@mantine/core';
import clsx from 'clsx';
import './Card.css';

export type CardVariant = 'elevated' | 'filled' | 'outlined';

interface CardBaseProps {
  variant?: CardVariant;
  children?: ReactNode;
  className?: string;
}

export interface StaticCardProps
  extends CardBaseProps, Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className'> {
  interactive?: false;
}

export interface InteractiveCardProps
  extends
    CardBaseProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'>,
    Pick<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  interactive: true;
}

export type CardProps = StaticCardProps | InteractiveCardProps;

const NEUTRALIZE = { shadow: 'none', radius: 0, withBorder: false, padding: 16 } as const;

export const Card = forwardRef<HTMLElement, CardProps>(function Card(props, ref) {
  const { variant = 'elevated', children, className } = props;
  const classes = clsx(
    'm3-card',
    `m3-card--${variant}`,
    props.interactive && 'm3-card--interactive',
    className,
  );

  if (props.interactive) {
    const { interactive: _interactive, variant: _variant, href, ...rest } = props;
    if (href !== undefined) {
      return (
        <MantineCardPrimitive
          component="a"
          ref={ref as Ref<HTMLAnchorElement>}
          href={href}
          className={clsx(classes, 'm3-state-layer')}
          {...NEUTRALIZE}
          {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
        >
          {children}
        </MantineCardPrimitive>
      );
    }
    return (
      <MantineCardPrimitive
        component="button"
        type="button"
        ref={ref as Ref<HTMLButtonElement>}
        className={clsx(classes, 'm3-state-layer')}
        {...NEUTRALIZE}
        {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {children}
      </MantineCardPrimitive>
    );
  }

  const {
    interactive: _interactive,
    variant: _variant,
    children: _children,
    className: _className,
    ...divRest
  } = props as StaticCardProps;

  return (
    <MantineCardPrimitive
      ref={ref as Ref<HTMLDivElement>}
      className={classes}
      {...NEUTRALIZE}
      {...divRest}
    >
      {children}
    </MantineCardPrimitive>
  );
});

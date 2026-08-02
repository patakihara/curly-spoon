/**
 * M3 card container. `interactive` turns it into a real, keyboard-operable button
 * (or link, via `href`) rather than a `<div onClick>` — clickable cards must still be
 * reachable and activatable from the keyboard.
 */
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react';
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
        <a
          ref={ref as Ref<HTMLAnchorElement>}
          href={href}
          className={clsx(classes, 'm3-state-layer')}
          {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
        >
          {children}
        </a>
      );
    }
    return (
      <button
        ref={ref as Ref<HTMLButtonElement>}
        type="button"
        className={clsx(classes, 'm3-state-layer')}
        {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {children}
      </button>
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
    <div ref={ref as Ref<HTMLDivElement>} className={classes} {...divRest}>
      {children}
    </div>
  );
});

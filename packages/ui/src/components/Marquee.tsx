/**
 * Scrolls its text back and forth only when it actually overflows its container, and
 * only when the user hasn't asked for reduced motion — for track titles that are
 * sometimes too long for the Now Playing bar and usually aren't.
 *
 * Wave 16c-6-W (docs/ROADMAP.md §16): the two inline custom properties below were renamed
 * from `--m3-marquee-distance`/`--m3-marquee-duration` to `--marquee-distance`/
 * `--marquee-duration` — see Marquee.css's header comment for why. They were never a
 * `--m3-*` design token (nothing in `index.css` or SONORA.md defines them); they're
 * measured/derived here at runtime and read only by this component's own `@keyframes`.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import clsx from 'clsx';
import { prefersReducedMotion, watchReducedMotion } from '../theme/reducedMotion.js';
import './Marquee.css';

export interface MarqueeProps {
  children: ReactNode;
  className?: string;
  /** Scroll speed in px/second. Defaults to 40. */
  speed?: number;
}

export function Marquee({ children, className, speed = 40 }: MarqueeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [distance, setDistance] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);

  useEffect(() => watchReducedMotion(setReducedMotion), []);

  useEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    const measure = () => setDistance(Math.max(0, text.scrollWidth - container.clientWidth));
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(text);
    return () => observer.disconnect();
  }, [children]);

  const overflowing = distance > 0;
  const animate = overflowing && !reducedMotion;
  const durationSeconds = animate ? Math.max(distance / speed, 1) : 0;

  return (
    <div ref={containerRef} className={clsx('m3-marquee', className)}>
      <span
        ref={textRef}
        className={clsx('m3-marquee__text', animate && 'm3-marquee__text--animating')}
        style={
          animate
            ? ({
                '--marquee-distance': `-${distance}px`,
                '--marquee-duration': `${durationSeconds}s`,
              } as CSSProperties)
            : undefined
        }
      >
        {children}
      </span>
    </div>
  );
}

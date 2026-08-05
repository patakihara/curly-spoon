/**
 * The YouTube Music progress bar — per docs/DESIGN.md this is the component that
 * matters most. A thick track with no playhead dot, that thickens further while the
 * user is actively dragging it and springs back to rest on release, with a buffered
 * (downloaded/cached) range shown as a dimmer underlay behind the played portion.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import clsx from 'clsx';
import './Slider.css';

export interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** How far playback has buffered, same units as `value`. Omit to hide the underlay. */
  buffered?: number;
  disabled?: boolean;
  /** Fires continuously while dragging or stepping via keyboard. */
  onChange: (value: number) => void;
  /** Fires once, on pointer release / after a keyboard step settles — good for seeking. */
  onChangeCommit?: (value: number) => void;
  /** Renders the active track as an undulating wave (M3 Expressive), per `animateWave`. */
  wavy?: boolean;
  /** Only animates the wave while true — a stopped/paused player shows a still wave. */
  animateWave?: boolean;
  'aria-label': string;
  /** Human-readable current value, e.g. "1:32 of 45:00" — read instead of the raw number. */
  valueText?: string;
}

/** Clamps and snaps a raw value to the nearest step within [min, max]. */
function quantize(raw: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, raw));
  const steps = Math.round((clamped - min) / step);
  return Math.min(max, min + steps * step);
}

export const Slider = forwardRef<HTMLDivElement, SliderProps>(function Slider(
  {
    value,
    min = 0,
    max = 100,
    step = 1,
    buffered,
    disabled = false,
    onChange,
    onChangeCommit,
    wavy = false,
    animateWave = false,
    valueText,
    ...rest
  },
  forwardedRef,
) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const setFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const ratio = rect.width === 0 ? 0 : (clientX - rect.left) / rect.width;
      onChange(quantize(min + ratio * (max - min), min, max, step));
    },
    [min, max, step, onChange],
  );

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (event: PointerEvent) => setFromClientX(event.clientX);
    const handleUp = (event: PointerEvent) => {
      setFromClientX(event.clientX);
      setDragging(false);
      onChangeCommit?.(quantize(value, min, max, step));
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [dragging, setFromClientX, value, min, max, step, onChangeCommit]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    setDragging(true);
    setFromClientX(event.clientX);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const bigStep = step * 10;
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        next = value - step;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        next = value + step;
        break;
      case 'PageDown':
        next = value - bigStep;
        break;
      case 'PageUp':
        next = value + bigStep;
        break;
      case 'Home':
        next = min;
        break;
      case 'End':
        next = max;
        break;
      default:
        return;
    }
    event.preventDefault();
    const quantized = quantize(next, min, max, step);
    onChange(quantized);
    onChangeCommit?.(quantized);
  };

  const percent = max === min ? 0 : ((value - min) / (max - min)) * 100;
  const bufferedPercent =
    buffered === undefined || max === min ? undefined : ((buffered - min) / (max - min)) * 100;

  return (
    <div
      ref={forwardedRef}
      className={clsx(
        'm3-slider',
        dragging && 'm3-slider--dragging',
        disabled && 'm3-slider--disabled',
        wavy && 'm3-slider--wavy',
        wavy && animateWave && 'm3-slider--wave-animating',
      )}
    >
      <div
        ref={trackRef}
        className="m3-slider__track"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        {...rest}
      >
        {bufferedPercent !== undefined ? (
          <div className="m3-slider__buffered" style={{ width: `${bufferedPercent}%` }} />
        ) : null}
        <div className="m3-slider__active" style={{ width: `${percent}%` }} />
        <div className="m3-slider__remainder" style={{ left: `${percent}%` }} />
      </div>
    </div>
  );
});

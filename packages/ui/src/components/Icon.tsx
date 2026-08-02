/**
 * Inline SVG icon set — no icon font, no network fetch, so icons render correctly
 * offline (this app is a PWA meant to work with no media server *or* CDN reachable).
 * Every glyph shares a 24x24 viewBox and draws in `currentColor` so it inherits
 * whatever text colour the surrounding component sets.
 */
import { forwardRef, memo, type SVGProps } from 'react';

export const ICON_NAMES = [
  'play',
  'pause',
  'skip_next',
  'skip_previous',
  'forward_30',
  'replay_30',
  'speed',
  'sleep_timer',
  'bookmark',
  'queue',
  'search',
  'library_books',
  'podcasts',
  'music_note',
  'home',
  'settings',
  'download',
  'add',
  'close',
  'chevron_left',
  'chevron_right',
  'more_vert',
  'heart',
  'shuffle',
  'repeat',
  'cast',
  'lyrics',
  'check',
  'error',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/** Path data (and the occasional extra shape) for each glyph, in a shared 24x24 grid. */
const PATHS: Record<IconName, string> = {
  play: 'M8 5v14l11-7z',
  pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
  skip_next: 'M6 5v14l9-7zM17 5h2v14h-2z',
  skip_previous: 'M18 5v14L9 12zM5 5h2v14H5z',
  forward_30: 'M12 5V1l6 5-6 5V7a5 5 0 1 0 5 5h2a7 7 0 1 1-7-7zM9.6 10.4h1.3v4.2H9.9v-3.2l-.9.5v-.9zM13.4 10.4c.9 0 1.5.8 1.5 2.1s-.6 2.1-1.5 2.1-1.5-.8-1.5-2.1.6-2.1 1.5-2.1zm0 .9c-.3 0-.6.4-.6 1.2s.3 1.2.6 1.2.6-.4.6-1.2-.3-1.2-.6-1.2z',
  replay_30: 'M12 5V1L6 6l6 5V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7zM9.6 10.4h1.3v4.2H9.9v-3.2l-.9.5v-.9zM13.4 10.4c.9 0 1.5.8 1.5 2.1s-.6 2.1-1.5 2.1-1.5-.8-1.5-2.1.6-2.1 1.5-2.1zm0 .9c-.3 0-.6.4-.6 1.2s.3 1.2.6 1.2.6-.4.6-1.2-.3-1.2-.6-1.2z',
  speed: 'M12 3a9 9 0 0 0-7.3 14.3.9.9 0 0 0 1.3.2A7.8 7.8 0 0 1 12 15.8a7.8 7.8 0 0 1 6 2.7.9.9 0 0 0 1.3-.2A9 9 0 0 0 12 3zm.9 4.6-2.7 5a1 1 0 1 0 1.7 1l2.7-5a1 1 0 0 0-1.7-1z',
  sleep_timer: 'M12 2a1 1 0 0 1 1 1v1.06A8 8 0 1 1 4 12a1 1 0 0 1 2 0 6 6 0 1 0 6-6V8a1 1 0 0 1-2 0V3a1 1 0 0 1 1-1zm5.7 2.3 1.4 1.4-1.1 1.1-1.4-1.4z',
  bookmark: 'M6 3h12a1 1 0 0 1 1 1v16l-7-4-7 4V4a1 1 0 0 1 1-1z',
  queue: 'M4 6h12v2H4zM4 11h12v2H4zM4 16h8v2H4zM18 10v3h3v2h-3v3h-2v-3h-3v-2h3v-3z',
  search: 'M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.3 4.2-1.4 1.4-4.2-4.3A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z',
  library_books: 'M4 4h2v16H4zM8 4h11v3H8zM8 9h11v3H8zM8 14h11v3H8zM8 19h11v1H8z',
  podcasts: 'M12 8a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.5V17h-4v-1.5A4 4 0 0 1 8 12a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2 2 2 0 0 0 2 2 2 2 0 0 0 2-2 2 2 0 0 0-2-2zM10 20h4v2h-4zM5.6 5.6l1.4 1.4A6.9 6.9 0 0 0 5 12a6.9 6.9 0 0 0 2 4.9l-1.4 1.5A8.9 8.9 0 0 1 3 12a8.9 8.9 0 0 1 2.6-6.4zm12.8 0A8.9 8.9 0 0 1 21 12a8.9 8.9 0 0 1-2.6 6.4l-1.4-1.5A6.9 6.9 0 0 0 19 12a6.9 6.9 0 0 0-2-4.9z',
  music_note: 'M9 3v10.6A3.5 3.5 0 1 0 11 17V7h6V3z',
  home: 'M12 3 3 10.5V21h6v-6h6v6h6V10.5z',
  settings: 'M12 8.5A3.5 3.5 0 1 1 8.5 12 3.5 3.5 0 0 1 12 8.5zm8.9 2.1-1.8-.5a7.3 7.3 0 0 0-.6-1.5l1-1.6a1 1 0 0 0-.1-1.2l-1.2-1.2a1 1 0 0 0-1.2-.1l-1.6 1a7.3 7.3 0 0 0-1.5-.6l-.5-1.8a1 1 0 0 0-1-.7h-1.6a1 1 0 0 0-1 .7l-.5 1.8a7.3 7.3 0 0 0-1.5.6l-1.6-1a1 1 0 0 0-1.2.1L3.7 6.8a1 1 0 0 0-.1 1.2l1 1.6a7.3 7.3 0 0 0-.6 1.5l-1.8.5a1 1 0 0 0-.7 1v1.6a1 1 0 0 0 .7 1l1.8.5c.15.53.35 1.03.6 1.5l-1 1.6a1 1 0 0 0 .1 1.2l1.2 1.2a1 1 0 0 0 1.2.1l1.6-1c.47.25.97.45 1.5.6l.5 1.8a1 1 0 0 0 1 .7h1.6a1 1 0 0 0 1-.7l.5-1.8c.53-.15 1.03-.35 1.5-.6l1.6 1a1 1 0 0 0 1.2-.1l1.2-1.2a1 1 0 0 0 .1-1.2l-1-1.6c.25-.47.45-.97.6-1.5l1.8-.5a1 1 0 0 0 .7-1v-1.6a1 1 0 0 0-.7-1z',
  download: 'M11 3h2v9.2l3.1-3.1 1.4 1.4L12 15l-5.5-4.5 1.4-1.4L11 12.2zM5 19h14v2H5z',
  add: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
  close: 'M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z',
  chevron_left: 'M14.7 6 9 12l5.7 6 1.4-1.4L11.8 12l4.3-4.6z',
  chevron_right: 'M9.3 6 15 12l-5.7 6-1.4-1.4L12.2 12 7.9 7.4z',
  more_vert: 'M12 5a1.8 1.8 0 1 1 0 3.6A1.8 1.8 0 0 1 12 5zm0 5.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zm0 5.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z',
  heart: 'M12 20.3 10.6 19C5.9 14.7 3 12 3 8.7 3 6 5.1 4 7.7 4c1.5 0 3 .7 3.9 1.8L12 6.3l.4-.5A5.1 5.1 0 0 1 16.3 4C18.9 4 21 6 21 8.7c0 3.3-2.9 6-7.6 10.3z',
  shuffle: 'M15.3 3.7 21 8l-5.7 4.3v-2.6l-2 .1-2.6-3.4 1.6-2 1.6 2.1 1.4-.1zM3 6h4.4l6 8h4l-.1-2.6L23 15l-5.7 4.3v-2.6h-5.5l-6-8H3z',
  repeat: 'M6 4h9a5 5 0 0 1 5 5v1h-2V9a3 3 0 0 0-3-3H6.4l1.8 1.8-1.4 1.4L3 5.5 6.8 1.7l1.4 1.4zM18 20H9a5 5 0 0 1-5-5v-1h2v1a3 3 0 0 0 3 3h8.6l-1.8-1.8 1.4-1.4L21 18.5l-3.8 3.8-1.4-1.4z',
  cast: 'M3 5h18v2H5v10H3zM3 15v4h4a4 4 0 0 0-4-4zm0-4v2a6 6 0 0 1 6 6h2a8 8 0 0 0-8-8zm18-6H3v2h16v10h-4v2h6z',
  lyrics: 'M4 4h14a2 2 0 0 1 2 2v8h-2V6H4v14h8v2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm2 4h10v2H6zm0 4h7v2H6zm10.5 1a3.5 3.5 0 0 1 3.5 3.5V20h-2v-3.5a1.5 1.5 0 0 0-1.5-1.5H16v-2z',
  check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 20.6 7.4 19.2 6z',
  error: 'M12 2 1 21h22zm0 6.5a1 1 0 0 1 1 1V14a1 1 0 1 1-2 0V9.5a1 1 0 0 1 1-1zM12 16.2a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z',
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  /** Icon side length, CSS px. Defaults to 24 (the design's base icon size). */
  size?: number;
  /**
   * Accessible name. Omit when the icon is purely decorative (e.g. sitting beside a
   * visible label) — it is then hidden from the accessibility tree entirely.
   */
  title?: string;
}

export const Icon = memo(
  forwardRef<SVGSVGElement, IconProps>(function Icon(
    { name, size = 24, title, className, ...rest },
    ref,
  ) {
    const decorative = title === undefined;
    return (
      <svg
        ref={ref}
        className={className ? `m3-icon ${className}` : 'm3-icon'}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        role={decorative ? undefined : 'img'}
        aria-hidden={decorative ? true : undefined}
        {...rest}
      >
        {title ? <title>{title}</title> : null}
        <path d={PATHS[name]} />
      </svg>
    );
  }),
);

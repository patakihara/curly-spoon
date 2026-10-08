import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { IconButton, MiniPlayer } from './generated/ui/index.js';

type Props = Record<string, unknown> & { children?: ReactNode };

/** Every IconButton in the tree MiniPlayer returns, without rendering the buttons themselves. */
function iconButtons(node: ReactNode, into: ReactElement<Props>[] = []): ReactElement<Props>[] {
  if (Array.isArray(node)) node.forEach((n) => iconButtons(n as ReactNode, into));
  else if (isValidElement<Props>(node)) {
    if (node.type === IconButton) into.push(node);
    iconButtons(node.props.children, into);
  }
  return into;
}

/** Each handler MiniPlayer takes for a control on its bar, by the control's name. */
const HANDLERS: Record<string, Record<string, string>> = {
  music: {
    onTogglePlay: 'Play',
    onShuffle: 'Shuffle',
    onPrev: 'Previous',
    onNext: 'Next',
    onRepeat: 'Repeat',
    onToggleLyrics: 'Lyrics',
    onToggleQueue: 'Queue',
    onVolume: 'Volume',
  },
  spoken: {
    onTogglePlay: 'Play',
    onSpeed: 'Playback speed, 1 times',
    onSkipBack: 'Skip back 15 seconds',
    onSkipForward: 'Skip forward 15 seconds',
    onSleep: 'Sleep timer, Off',
    onToggleQueue: 'Queue',
    onVolume: 'Volume',
  },
};

describe("Sonora's MiniPlayer controls", () => {
  it.each(
    Object.entries(HANDLERS).flatMap(([variant, handlers]) =>
      Object.entries(handlers).map(([handler, label]) => [variant, handler, label] as const),
    ),
  )(
    '[M0.sonoraclean/d] the desktop %s bar hands %s the event of a press on %s, keeping it off the bar',
    (variant, handler, label) => {
      const got: unknown[] = [];
      const props = Object.fromEntries(
        Object.keys(HANDLERS[variant]!).map((h) => [h, (e: unknown) => got.push([h, e])]),
      );
      const tree = (MiniPlayer as (p: object) => ReactNode)({
        title: 'Driftwave',
        artist: 'Halcyon Bloom',
        platform: 'desktop',
        variant,
        ...props,
      });
      const button = iconButtons(tree).find((b) => b.props.label === label);
      expect(button, label).toBeDefined();
      let stopped = false;
      const event = { type: 'click', stopPropagation: () => (stopped = true) };
      (button!.props.onClick as (e: unknown) => void)(event);
      expect(got).toEqual([[handler, event]]);
      expect(stopped).toBe(true);
    },
  );

  it('[M0.sonoraclean/d] the phone pill hands its play the event of a press, keeping it off the pill', () => {
    const got: unknown[] = [];
    const tree = (MiniPlayer as (p: object) => ReactNode)({
      title: 'Driftwave',
      artist: 'Halcyon Bloom',
      onTogglePlay: (e: unknown) => got.push(e),
      onOpen: () => got.push('open'),
    });
    const play = iconButtons(tree).find((b) => b.props.label === 'Play');
    let stopped = false;
    const event = { type: 'click', stopPropagation: () => (stopped = true) };
    (play!.props.onClick as (e: unknown) => void)(event);
    expect(got).toEqual([event]);
    expect(stopped).toBe(true);
  });
});

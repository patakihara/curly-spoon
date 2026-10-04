import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SeekBar } from './generated/ui/index.js';

/** The elapsed readout SeekBar shows at the end of a track `duration` seconds long. */
const elapsedAtEnd = (duration: number) => {
  const html = renderToString(
    createElement(SeekBar, { value: 1, duration, remainingAsCountdown: false }),
  );
  return /<span>([^<]*)<\/span>/.exec(html)?.[1];
};

describe("Sonora's time readout", () => {
  it.each([
    [0, '0:00'],
    [59, '0:59'],
    [60, '1:00'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [3661, '1:01:01'],
    [Number.NaN, '0:00'],
    [-5, '0:00'],
  ])('[M0.sonoraclean/e] reads %s seconds as %s', (seconds, shown) => {
    expect(elapsedAtEnd(seconds)).toBe(shown);
  });
});

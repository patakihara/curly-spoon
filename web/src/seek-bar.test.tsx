import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SeekBar } from './generated/ui/index.js';

/** The elapsed readout SeekBar shows at the end of a track `duration` seconds long. */
const elapsedAtEnd = (duration: number) => {
  const html = renderToString(createElement(SeekBar, { value: 1, duration, readout: 'total' }));
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

describe("Sonora's seek bar readouts", () => {
  const seek = (props: Record<string, unknown>) =>
    renderToString(createElement(SeekBar, { value: 0.5, duration: 200, ...props }));

  it('[M0.sonoraclean/d] counts down the time left beneath the slider by default', () => {
    const html = seek({});
    expect(html).toContain('<span>1:40</span><span>-1:40</span>');
    expect(html).toContain('flex-direction:column');
  });

  it('[M0.sonoraclean/d] total shows the length beneath the slider in place of the countdown', () => {
    expect(seek({ readout: 'total' })).toContain('<span>1:40</span><span>3:20</span>');
  });

  it('[M0.sonoraclean/d] inline sets the elapsed time and the length either side of the slider, on one row', () => {
    const html = seek({ readout: 'inline' });
    expect(html).not.toContain('flex-direction:column');
    expect(html).toMatch(
      /<span style="[^"]*width:var\(--time-readout-width\)[^"]*">1:40<\/span><div[^>]*>.*role="slider".*<\/div><span style="[^"]*width:var\(--time-readout-width\)[^"]*">3:20<\/span>/,
    );
  });
});

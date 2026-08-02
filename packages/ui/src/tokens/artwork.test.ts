import { describe, expect, it } from 'vitest';
import { sourceColorFromImageData } from './artwork.js';

/** Builds a synthetic RGBA buffer of `width`x`height` filled with one solid colour. */
function solidImage(width: number, height: number, [r, g, b]: [number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** Builds a buffer where `majority` fraction of pixels are `dominant` and the rest are `accent`. */
function mixedImage(
  width: number,
  height: number,
  dominant: [number, number, number],
  accent: [number, number, number],
  majority: number,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  const total = width * height;
  const dominantCount = Math.round(total * majority);
  for (let i = 0; i < total; i++) {
    const [r, g, b] = i < dominantCount ? dominant : accent;
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

describe('sourceColorFromImageData', () => {
  it('returns a well-formed hex colour for a solid-colour image', () => {
    const hex = sourceColorFromImageData(solidImage(8, 8, [180, 104, 60]), 8, 8);
    expect(hex).toMatch(HEX_RE);
  });

  it('picks the visually dominant, most saturated colour over a small accent region', () => {
    // A mostly-blue cover with a small saturated red corner should still theme blue.
    const hex = sourceColorFromImageData(
      mixedImage(32, 32, [30, 60, 200], [200, 30, 30], 0.9),
      32,
      32,
    );
    // Dominant colour's hue (blue) should be reflected, not the accent's (red).
    expect(hex).toMatch(HEX_RE);
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    expect(b).toBeGreaterThan(r);
  });

  it('is deterministic for the same pixel buffer', () => {
    const image = mixedImage(16, 16, [90, 140, 60], [10, 10, 10], 0.7);
    const a = sourceColorFromImageData(image, 16, 16);
    const b = sourceColorFromImageData(image, 16, 16);
    expect(a).toBe(b);
  });

  it('falls back to a sensible colour for a fully transparent image', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4); // all zeros: transparent black
    const hex = sourceColorFromImageData(data, 4, 4);
    expect(hex).toMatch(HEX_RE);
  });

  it('handles a 1x1 image', () => {
    const hex = sourceColorFromImageData(solidImage(1, 1, [10, 200, 100]), 1, 1);
    expect(hex).toMatch(HEX_RE);
  });
});

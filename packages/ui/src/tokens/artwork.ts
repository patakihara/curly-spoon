/**
 * Extracts a theme-worthy source colour from decoded artwork pixels — the plumbing
 * behind Symfonium-style "theme the whole shell from the cover" behaviour (see
 * docs/DESIGN.md § Colour).
 *
 * Deliberately takes raw pixels (`Uint8ClampedArray` + dimensions) rather than a DOM
 * `<img>`/`<canvas>` element, unlike the upstream `sourceColorFromImage` helper, so it
 * is unit-testable with synthetic buffers and usable from a Web Worker.
 */
import {
  QuantizerCelebi,
  Score,
  argbFromRgb,
  hexFromArgb,
} from '@material/material-color-utilities';
import { AURALIS_SOURCE_COLOR } from './color.js';

/** How many distinct colours the quantizer is allowed to bucket pixels into. */
const MAX_QUANTIZED_COLORS = 128;

/**
 * Picks the most theme-suitable colour out of a decoded RGBA image: quantize down to
 * a small palette (`QuantizerCelebi`), then rank by suitability (`Score`) — population
 * weighted against how close each colour's chroma is to a pleasant target, so a
 * washed-out dominant colour loses to a smaller but richer one, per the reference
 * algorithm Material uses for Android's wallpaper theming.
 *
 * Falls back to `AURALIS_SOURCE_COLOR` when the image has no opaque pixels at all
 * (fully transparent artwork, or a 0-size buffer) rather than throwing.
 */
export function sourceColorFromImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): string {
  const pixelCount = width * height;
  const pixels: number[] = [];

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    const alpha = data[offset + 3] ?? 0;
    if (alpha < 255) continue; // ignore transparent/partial pixels, as artwork has none in practice

    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? 0;
    const b = data[offset + 2] ?? 0;
    pixels.push(argbFromRgb(r, g, b));
  }

  if (pixels.length === 0) return AURALIS_SOURCE_COLOR;

  const quantized = QuantizerCelebi.quantize(pixels, MAX_QUANTIZED_COLORS);
  const ranked = Score.score(quantized);
  const winner = ranked[0];
  return winner === undefined ? AURALIS_SOURCE_COLOR : hexFromArgb(winner);
}

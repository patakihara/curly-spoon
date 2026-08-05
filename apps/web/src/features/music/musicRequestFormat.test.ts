import { describe, expect, it } from 'vitest';
import { formatBitrate } from './musicRequestFormat.js';

describe('formatBitrate', () => {
  it('renders a known bitrate in kbps', () => {
    expect(formatBitrate(320)).toBe('320 kbps');
  });

  it('renders a low bitrate exactly, without rounding or a minimum floor', () => {
    expect(formatBitrate(96)).toBe('96 kbps');
  });

  it('returns null, not a placeholder string, when the provider reported none', () => {
    expect(formatBitrate(null)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { standInSteps } from './standIn.js';
import { stepsRegistry } from './steps.js';

describe('the per-medium steps registry', () => {
  it('finds each registered medium’s steps, and none for a medium nobody registered', () => {
    const book = standInSteps('book');
    const registry = stepsRegistry([book, standInSteps('podcast')]);
    expect(registry.get('book')).toBe(book);
    expect(registry.get('album')).toBeUndefined();
    expect(stepsRegistry([]).size).toBe(0);
  });

  it('refuses two steps for one medium', () => {
    expect(() => stepsRegistry([standInSteps('album'), standInSteps('album')])).toThrow(/album/);
  });

  it('refuses a medium whose route downloads registering steps with no download, and a podcast with one', () => {
    const { download: _, ...noDownload } = standInSteps('song');
    expect(() => stepsRegistry([noDownload])).toThrow(/song/);
    expect(() =>
      stepsRegistry([{ ...standInSteps('podcast'), download: standInSteps('book').download }]),
    ).toThrow(/podcast/);
  });
});

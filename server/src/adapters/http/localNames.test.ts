import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { localNames, localNamesFile } from './localNames.js';

describe('the local names file the recording scan also checks', () => {
  it('is AURALIS_NAMES_FILE when set, else ~/.config/auralis/names.txt', () => {
    expect(localNamesFile({ AURALIS_NAMES_FILE: '/x/names.txt' }, '/home/u')).toBe('/x/names.txt');
    expect(localNamesFile({}, '/home/u')).toBe('/home/u/.config/auralis/names.txt');
  });

  it('reads one name per line, skipping blanks and # comments', () => {
    const dir = mkdtempSync(join(tmpdir(), 'names-'));
    const file = join(dir, 'names.txt');
    writeFileSync(file, '# household\nKara\n\n  Élise  \n');
    expect(localNames({ AURALIS_NAMES_FILE: file }, dir)).toEqual(['Kara', 'Élise']);
  });

  it('is empty when there is no file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'names-'));
    expect(localNames({}, dir)).toEqual([]);
  });
});

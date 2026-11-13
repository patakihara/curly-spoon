/**
 * Whether a torrent's files are the album, on The Slip's and Ghosts I–IV's recorded editions and
 * the Internet Archive's recorded torrent of Ghosts. A pack is laid out from those: a discography
 * folder holding Ghosts' recorded files and The Slip named by its recorded titles.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { openDatabase } from '../../store/connection.js';
import type { Edition } from './editions.js';
import { albumFolder, fittingEdition, inFolder, whyNoEdition } from './fit.js';
import {
  ghostsFiles,
  nineInchNailsPack,
  PACK,
  recordedEditions,
  slipFiles,
} from './fixtures/albums.js';

let slip: Edition[];
let ghosts: Edition[];
beforeAll(async () => {
  ({ slip, ghosts } = await recordedEditions(openDatabase(':memory:')));
});

describe('[M3.albums] a real torrent’s files', () => {
  it('[M3.albums] The Slip’s torrent a live request downloaded fits its ten-track edition, cover and booklet aside', () => {
    const files = slipFiles();
    expect(files.length).toBe(12);
    const edition = fittingEdition(files, slip);
    expect(edition?.tracks.length).toBe(10);
    expect(fittingEdition(files, ghosts)).toBeNull();
  });
});

describe('[M3.albums] why a torrent’s files are no edition', () => {
  it('[M3.albums] names how many audio files it holds and how many tracks the editions have', () => {
    const files = slipFiles().filter((file) => !file.path.endsWith('999,999.flac'));
    expect(fittingEdition(files, slip)).toBeNull();
    expect(whyNoEdition(files, slip)).toBe('9 audio files; the editions have 10 tracks');
  });

  it('[M3.albums] names how few titles the names hold when the count is an edition’s', () => {
    let n = 0;
    const files = slipFiles().map((file) =>
      file.path.endsWith('.flac') ? { ...file, path: `The Slip/Track ${(n += 1)}.flac` } : file,
    );
    expect(fittingEdition(files, slip)).toBeNull();
    expect(whyNoEdition(files, slip)).toBe(
      '10 audio files, as many as an edition’s tracks, but their names hold 0 of its 10 titles (7 needed)',
    );
  });

  it('[M3.albums] says so when MusicBrainz lists no edition', () => {
    expect(whyNoEdition(slipFiles(), [])).toBe('MusicBrainz lists no edition of the album');
  });
});

describe('[M3.albums] a pack’s album folder', () => {
  it('[M3.albums] is the one folder whose audio fits an edition of the album asked for', () => {
    const files = nineInchNailsPack(slip[0]!);
    expect(albumFolder(files, ghosts)).toEqual({
      folder: `${PACK}/2008 - Ghosts I-IV`,
      edition: fittingEdition(ghostsFiles(), ghosts),
    });
    expect(albumFolder(files, slip)?.folder).toBe(`${PACK}/2008 - The Slip`);
  });

  it('[M3.albums] gathers an album’s disc folders under it', () => {
    const files = nineInchNailsPack(slip[0]!).map((file) => {
      const track = /Ghosts I-IV - (\d+) - /.exec(file.path)?.[1];
      if (track === undefined) return file;
      const disc = Number(track) <= 18 ? 'CD1' : 'Disc 2';
      return {
        ...file,
        path: file.path.replace('/2008 - Ghosts I-IV/', `/2008 - Ghosts I-IV/${disc}/`),
      };
    });
    expect(albumFolder(files, ghosts)?.folder).toBe(`${PACK}/2008 - Ghosts I-IV`);
  });

  it('[M3.albums] none, when no folder holds the album', () => {
    const files = nineInchNailsPack(slip[0]!).filter((file) => !file.path.includes('Ghosts'));
    expect(albumFolder(files, ghosts)).toBeNull();
  });

  it('[M3.albums] prefers the edition listed first, whatever the path order', () => {
    const [standard] = ghosts;
    const nine = ghosts.find((edition) => edition.tracks.length === 9);
    expect(nine).toBeDefined();
    const files = nineInchNailsPack(slip[0]!, `${PACK}/2008 - Ghosts I-IV`).concat(
      ghostsFiles()
        .filter((file) => /\.flac$/.test(file.path) && /- 0\d - /.test(file.path))
        .map((file) => ({
          ...file,
          path: `${PACK}/2008 - A Ghosts I/${file.path.split('/').pop()}`,
        })),
    );
    expect(albumFolder(files, [standard!, nine!])?.folder).toBe(`${PACK}/2008 - Ghosts I-IV`);
    expect(albumFolder(files, [nine!, standard!])?.folder).toBe(`${PACK}/2008 - A Ghosts I`);
  });

  it('[M3.albums] a file is inside a folder only by whole path segments', () => {
    expect(inFolder(`${PACK}/2008 - The Slip/01 - 999,999.flac`, `${PACK}/2008 - The Slip`)).toBe(
      true,
    );
    expect(inFolder(`${PACK}/2008 - The Slip (Bonus)/01.flac`, `${PACK}/2008 - The Slip`)).toBe(
      false,
    );
    expect(inFolder(`${PACK}/info.txt`, `${PACK}/2008 - The Slip`)).toBe(false);
  });
});

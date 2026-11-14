/**
 * An album's download: the shared torrent download in `auralis-music`, each torrent added stopped
 * at its metadata and gated. The gate passes a file list that fits any edition of the album's
 * release group (the import tags whichever it is). A pack passes by its one folder that fits, the
 * edition listed first winning, and every file outside that folder is set aside. Anything else is
 * `wrongRelease`, logged with why, and the next release the search found starts.
 */
import { z } from 'zod';
import type { QbitFile } from '../../adapters/qbittorrent/schemas.js';
import {
  type GateVerdict,
  torrentDownload,
  type TorrentDownloadDeps,
  type TorrentGate,
} from '../download/torrent.js';
import type { DownloadSteps } from '../steps.js';
import type { AlbumEditions } from './editions.js';
import { albumFolder, fittingEdition, inFolder, whyNoEdition } from './fit.js';

export { FIT_TAG } from '../download/torrent.js';

/** Albums' own qBittorrent category. */
export const MUSIC_CATEGORY = 'auralis-music';

const noteSchema = z.object({ releaseGroupId: z.string(), pack: z.boolean() });
const wrong = (why: string): GateVerdict => ({ kind: 'wrong', why });

/** The album gate, reading the group's editions through the week's cache. */
export function albumGate(editions: Pick<AlbumEditions, 'read'>): TorrentGate {
  return {
    note: (request, release) => ({
      releaseGroupId: request.target.ids.mbid,
      pack: release.details.pack === true,
    }),
    check: async (handle, files: readonly QbitFile[]) => {
      const note = noteSchema.safeParse(handle);
      if (!note.success) return wrong('the handle names no release group');
      const album = await editions.read(note.data.releaseGroupId);
      if (album === null) return wrong('MusicBrainz no longer has the release group');
      const listed = files.map((file) => ({ path: file.name, size: file.size }));
      if (fittingEdition(listed, album.editions) !== null) return { kind: 'fits', setAside: [] };
      if (!note.data.pack) return wrong(whyNoEdition(listed, album.editions));
      const found = albumFolder(listed, album.editions);
      if (found === null) return wrong('no folder of the pack is an edition of the album');
      const setAside = files.filter((file) => !inFolder(file.name, found.folder));
      return { kind: 'fits', setAside: setAside.map((file) => file.index) };
    },
  };
}

export interface AlbumDownloadDeps extends Omit<
  TorrentDownloadDeps,
  'category' | 'gate' | 'stopAtMetadata'
> {
  editions: Pick<AlbumEditions, 'read'>;
}

export function albumDownload({ editions, ...deps }: AlbumDownloadDeps): DownloadSteps {
  return torrentDownload({
    ...deps,
    category: MUSIC_CATEGORY,
    stopAtMetadata: true,
    gate: albumGate(editions),
  });
}

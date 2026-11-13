/** Why an album's import will not go on. Each fails the request `importFailed`, logged. */
export type AlbumRefusal =
  /** Jellyfin has no one music library with one folder, so the files would never be seen. */
  | 'noMusicLibrary'
  /** The torrent is gone from qBittorrent before its files were placed. */
  | 'torrentGone'
  /** The torrent has not finished. */
  | 'notComplete'
  /** The torrent's save path is not in Downloads. */
  | 'outsideDownloads'
  /** A file's path could lead out of the torrent's folder, or is a link. */
  | 'unsafePath'
  /** A file is missing, or shorter than qBittorrent says. */
  | 'notARegularFile'
  /** The release the files were matched to is gone from MusicBrainz. */
  | 'releaseGone'
  /** The filesystem cannot clone a file, and the album is never plainly copied. */
  | 'cloneRefused'
  /** The step's time limit passed before anything reached Music. */
  | 'timedOut';

export class AlbumRefused extends Error {
  override readonly name = 'AlbumRefused';

  constructor(readonly reason: AlbumRefusal) {
    super(`album import refused: ${reason}`);
  }
}

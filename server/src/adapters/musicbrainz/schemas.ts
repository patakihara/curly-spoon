/**
 * Zod schemas for the MusicBrainz calls Auralis makes (`/ws/2`, JSON), cut to what the
 * matcher reads and renamed to camelCase (checked live, 8 Nov). A search row's release group has no
 * first release date; a lookup's does. A track's or a recording's length is in milliseconds and may
 * be null. A date is `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, and may be missing or empty.
 */
import { z } from 'zod';

const text = z.string();
/** A date as MusicBrainz writes it; missing and empty both become null. */
const date = z
  .string()
  .nullish()
  .transform((value) => (value ? value : null));
const length = z
  .number()
  .nullish()
  .transform((value) => value ?? null);

const artistCreditSchema = z
  .array(
    z.object({
      name: text,
      joinphrase: text.optional().transform((value) => value ?? ''),
      artist: z.object({ id: text, name: text }),
    }),
  )
  .transform((credits) =>
    credits.map(({ name, joinphrase, artist }) => ({
      name,
      joinPhrase: joinphrase,
      artistId: artist.id,
      artistName: artist.name,
    })),
  );
/** One artist of a credit: the name as credited, its join to the next, and the artist itself. */
export type ArtistCredit = z.infer<typeof artistCreditSchema>;

const releaseGroupSchema = z
  .object({
    id: text,
    title: text.optional(),
    'primary-type': text.nullish(),
    'secondary-types': z.array(text).optional(),
    'first-release-date': date,
  })
  .transform((group) => ({
    id: group.id,
    title: group.title ?? null,
    primaryType: group['primary-type'] ?? null,
    secondaryTypes: group['secondary-types'] ?? [],
    firstReleaseDate: group['first-release-date'],
  }));
export type ReleaseGroupRef = z.infer<typeof releaseGroupSchema>;

/** `GET /ws/2/release?query=…`: the releases a search found, best score first. */
export const releaseSearchSchema = z
  .object({
    count: z.number().int(),
    releases: z.array(
      z.object({
        id: text,
        score: z.number(),
        title: text,
        status: text.nullish(),
        date,
        'artist-credit': artistCreditSchema,
        'release-group': releaseGroupSchema,
        'track-count': z.number().int().optional(),
      }),
    ),
  })
  .transform(({ count, releases }) => ({
    count,
    releases: releases.map((release) => ({
      id: release.id,
      score: release.score,
      title: release.title,
      status: release.status ?? null,
      date: release.date,
      artistCredit: release['artist-credit'],
      releaseGroup: release['release-group'],
      trackCount: release['track-count'] ?? null,
    })),
  }));
export type ReleaseSearch = z.infer<typeof releaseSearchSchema>;
export type ReleaseHit = ReleaseSearch['releases'][number];

/** `GET /ws/2/recording?query=…`: recordings, each with the releases it is on and its place there. */
export const recordingSearchSchema = z
  .object({
    count: z.number().int(),
    recordings: z.array(
      z.object({
        id: text,
        score: z.number(),
        title: text,
        length,
        'artist-credit': artistCreditSchema.optional(),
        releases: z
          .array(
            z.object({
              id: text,
              title: text,
              status: text.nullish(),
              date,
              'release-group': releaseGroupSchema,
              media: z.array(
                z.object({
                  position: z.number().int(),
                  'track-count': z.number().int(),
                  track: z.array(z.object({ id: text, number: text, title: text, length })),
                }),
              ),
            }),
          )
          .optional(),
      }),
    ),
  })
  .transform(({ count, recordings }) => ({
    count,
    recordings: recordings.map((recording) => ({
      id: recording.id,
      score: recording.score,
      title: recording.title,
      length: recording.length,
      artistCredit: recording['artist-credit'] ?? [],
      releases: (recording.releases ?? []).map((release) => ({
        id: release.id,
        title: release.title,
        status: release.status ?? null,
        date: release.date,
        releaseGroup: release['release-group'],
        media: release.media.map((medium) => ({
          position: medium.position,
          trackCount: medium['track-count'],
          tracks: medium.track,
        })),
      })),
    })),
  }));
export type RecordingSearch = z.infer<typeof recordingSearchSchema>;
export type RecordingHit = RecordingSearch['recordings'][number];

/** `GET /ws/2/release/{id}?inc=recordings+artist-credits+release-groups+media`. */
export const releaseSchema = z
  .object({
    id: text,
    title: text,
    status: text.nullish(),
    date,
    'artist-credit': artistCreditSchema,
    'release-group': releaseGroupSchema,
    'cover-art-archive': z.object({ front: z.boolean() }).optional(),
    media: z.array(
      z.object({
        position: z.number().int(),
        'track-count': z.number().int(),
        tracks: z
          .array(
            z.object({
              id: text,
              number: text,
              position: z.number().int(),
              title: text,
              length,
              'artist-credit': artistCreditSchema,
              recording: z.object({ id: text, title: text, length }),
            }),
          )
          // A medium MusicBrainz lists no tracks for, such as a DVD of a deluxe edition.
          .optional(),
      }),
    ),
  })
  .transform((release) => ({
    id: release.id,
    title: release.title,
    status: release.status ?? null,
    date: release.date,
    artistCredit: release['artist-credit'],
    releaseGroup: release['release-group'],
    hasFrontCover: release['cover-art-archive']?.front ?? false,
    media: release.media.map((medium) => ({
      position: medium.position,
      trackCount: medium['track-count'],
      tracks: (medium.tracks ?? []).map((track) => ({
        id: track.id,
        number: track.number,
        position: track.position,
        title: track.title,
        length: track.length,
        artistCredit: track['artist-credit'],
        recording: track.recording,
      })),
    })),
  }));
export type Release = z.infer<typeof releaseSchema>;

/** A release group's own fields, as a lookup and a search row both give them. */
const groupFields = {
  id: text,
  title: text,
  'primary-type': text.nullish(),
  'secondary-types': z.array(text).optional(),
  'first-release-date': date,
  'artist-credit': artistCreditSchema,
};
const group = (raw: z.infer<z.ZodObject<typeof groupFields>>) => ({
  id: raw.id,
  title: raw.title,
  primaryType: raw['primary-type'] ?? null,
  secondaryTypes: raw['secondary-types'] ?? [],
  firstReleaseDate: raw['first-release-date'],
  artistCredit: raw['artist-credit'],
});

/** `GET /ws/2/release-group/{id}?inc=artist-credits`: an album, the group of its editions. */
export const releaseGroupLookupSchema = z.object(groupFields).transform(group);
export type ReleaseGroup = z.infer<typeof releaseGroupLookupSchema>;

/** `GET /ws/2/release-group?query=…`: release groups matching a person's words, best first. */
export const releaseGroupSearchSchema = z
  .object({
    count: z.number().int(),
    'release-groups': z.array(z.object({ ...groupFields, score: z.number() })),
  })
  .transform(({ count, 'release-groups': groups }) => ({
    count,
    releaseGroups: groups.map((raw) => ({ ...group(raw), score: raw.score })),
  }));
export type ReleaseGroupSearch = z.infer<typeof releaseGroupSearchSchema>;
export type ReleaseGroupHit = ReleaseGroupSearch['releaseGroups'][number];

/**
 * `GET /ws/2/release?release-group={id}&status=official&inc=recordings+media`: a page of a group's
 * releases, each medium with its format (missing for some) and its tracks' recordings. A recording
 * says whether it is a video. A medium MusicBrainz lists no tracks for has none.
 */
export const groupReleasesSchema = z
  .object({
    'release-count': z.number().int(),
    releases: z.array(
      z.object({
        id: text,
        title: text,
        status: text.nullish(),
        date,
        country: text.nullish(),
        media: z.array(
          z.object({
            position: z.number().int(),
            format: text.nullish(),
            'track-count': z.number().int(),
            tracks: z
              .array(
                z.object({
                  id: text,
                  number: text,
                  position: z.number().int(),
                  title: text,
                  length,
                  recording: z.object({
                    id: text,
                    title: text,
                    length,
                    video: z.boolean().optional(),
                  }),
                }),
              )
              .optional(),
          }),
        ),
      }),
    ),
  })
  .transform(({ 'release-count': count, releases }) => ({
    count,
    releases: releases.map((release) => ({
      id: release.id,
      title: release.title,
      status: release.status ?? null,
      date: release.date,
      country: release.country ?? null,
      media: release.media.map((medium) => ({
        position: medium.position,
        format: medium.format ?? null,
        trackCount: medium['track-count'],
        tracks: (medium.tracks ?? []).map((track) => ({
          id: track.id,
          number: track.number,
          position: track.position,
          title: track.title,
          length: track.length,
          recording: {
            id: track.recording.id,
            title: track.recording.title,
            length: track.recording.length,
            video: track.recording.video ?? false,
          },
        })),
      })),
    })),
  }));
export type GroupReleases = z.infer<typeof groupReleasesSchema>;
export type GroupRelease = GroupReleases['releases'][number];

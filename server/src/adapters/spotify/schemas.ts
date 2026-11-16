/**
 * Zod schemas for the three signed-out Spotify reads Auralis makes, cut to what it reads (checked
 * live, 13 and 14 Nov 2026).
 *
 * - The embed page, `open.spotify.com/embed/playlist/<id>`, is HTML whose `__NEXT_DATA__` script
 *   holds the playlist's name, its cover and an anonymous session token with its expiry; for a
 *   playlist that does not exist it answers 200 with a page whose own status is 404 (null here). Its
 *   `trackList` stops at 100 and names no album or ISRC, so it is not read.
 * - `spclient`'s `playlist/v2/playlist/<id>` gives the playlist's length and one page of its items'
 *   URIs, in the playlist's order, from `pos`.
 * - `spclient`'s `metadata/4/track/<gid>` gives one track's title, artists, album, length and ISRC.
 */
import { z } from 'zod';

const NEXT_DATA = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;

/** A playlist that does not exist still answers 200, its page saying 404 (live). */
const embedMissingSchema = z.object({
  props: z.object({ pageProps: z.object({ status: z.literal(404) }) }),
});

const embedFoundSchema = z.object({
  props: z.object({
    pageProps: z.object({
      state: z.object({
        data: z.object({
          entity: z.object({
            name: z.string(),
            coverArt: z.object({ sources: z.array(z.object({ url: z.string() })) }).nullish(),
          }),
        }),
        settings: z.object({
          session: z.object({
            accessToken: z.string().min(1),
            accessTokenExpirationTimestampMs: z.number(),
            isAnonymous: z.boolean(),
          }),
        }),
      }),
    }),
  }),
});

/** What the embed page says of a playlist, and the anonymous session it hands out. */
export interface EmbedPage {
  name: string;
  cover: string | null;
  token: string;
  expiresAt: number;
  isAnonymous: boolean;
}

/** The embed page's HTML, read down to its `__NEXT_DATA__`; null for a missing playlist. */
export const embedPageSchema = z
  .string()
  .transform((html, ctx) => {
    const found = NEXT_DATA.exec(html);
    if (!found?.[1]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'the page has no __NEXT_DATA__' });
      return z.NEVER;
    }
    try {
      return JSON.parse(found[1]) as unknown;
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '__NEXT_DATA__ is not JSON' });
      return z.NEVER;
    }
  })
  .pipe(z.union([embedMissingSchema, embedFoundSchema]))
  .transform((data): EmbedPage | null => {
    if (!('state' in data.props.pageProps)) return null;
    const { entity } = data.props.pageProps.state.data;
    const { session } = data.props.pageProps.state.settings;
    return {
      name: entity.name,
      cover: entity.coverArt?.sources[0]?.url ?? null,
      token: session.accessToken,
      expiresAt: session.accessTokenExpirationTimestampMs,
      isAnonymous: session.isAnonymous,
    };
  });

export const playlistPageSchema = z.object({
  length: z.number().int().nonnegative(),
  attributes: z.object({ name: z.string() }),
  ownerUsername: z.string().optional(),
  isUserCreated: z.boolean().optional(),
  contents: z.object({
    /** Absent on the first page. */
    pos: z.number().int().nonnegative().default(0),
    items: z.array(z.object({ uri: z.string() })).default([]),
  }),
});
export type PlaylistPage = z.infer<typeof playlistPageSchema>;

export const trackMetadataSchema = z
  .object({
    name: z.string(),
    artist: z.array(z.object({ name: z.string() })).default([]),
    album: z.object({ name: z.string() }).optional(),
    /** Milliseconds. */
    duration: z.number().int().nonnegative(),
    external_id: z.array(z.object({ type: z.string(), id: z.string() })).default([]),
  })
  .transform((t) => ({
    title: t.name,
    artists: t.artist.map((a) => a.name),
    album: t.album?.name ?? null,
    durationMs: t.duration,
    isrc: t.external_id.find((e) => e.type === 'isrc')?.id ?? null,
  }));

/** One track as Spotify's metadata gives it. */
export type SpotifyTrack = z.infer<typeof trackMetadataSchema>;

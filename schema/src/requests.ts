/**
 * Requests: getting a book, album, song or podcast onto the household's servers. One status
 * vocabulary covers every medium, so a library card and a Requests row say the same thing. Each
 * medium passes only the statuses its route has (the server's request machine holds the routes).
 */
import { ArtUrl, MediaRef } from './play.js';
import { z } from './zod.js';

/** What can be requested: a book, an album, a song kept from YouTube Music, or a podcast. */
export const RequestMedium = z.enum(['book', 'album', 'song', 'podcast']).openapi('RequestMedium');
export type RequestMedium = z.infer<typeof RequestMedium>;

/**
 * Where a request stands: made and waiting its turn; searching for a release; waiting for a
 * release to be chosen; queued for download; downloading; importing into the server; in your
 * library, which means it plays; or failed, with the step it failed in and why.
 */
export const RequestStatus = z
  .enum([
    'requested',
    'searching',
    'needsChoice',
    'queued',
    'downloading',
    'importing',
    'inLibrary',
    'failed',
  ])
  .openapi('RequestStatus');
export type RequestStatus = z.infer<typeof RequestStatus>;

/** Why a request failed, as a key the apps word themselves. */
export const RequestFailure = z
  .enum([
    'noRelease',
    'searchFailed',
    'downloadFailed',
    'downloadStalled',
    'importFailed',
    'notIndexed',
    'cancelledUpstream',
  ])
  .openapi('RequestFailure');
export type RequestFailure = z.infer<typeof RequestFailure>;

/** An Audible catalogue id. */
export const Asin = z.string().regex(/^[A-Z0-9]{10}$/);

/**
 * The catalogue ids a request names its target by: an Audible ASIN, an ISBN-10 or ISBN-13, a
 * MusicBrainz release id, a podcast's feed address, a YouTube Music video id.
 */
export const RequestIds = z
  .object({
    asin: Asin,
    isbn: z.string().regex(/^(?:\d{9}[\dX]|\d{13})$/),
    mbid: z.string().uuid(),
    feedUrl: z
      .string()
      .url()
      .max(2048)
      .regex(/^https?:\/\//)
      .refine((value) => {
        const { username, password } = new URL(value);
        return username === '' && password === '';
      }, 'a feed address carries no credentials'),
    youtubeMusicId: z.string().regex(/^[\w-]{1,64}$/),
  })
  .partial()
  .strict()
  .openapi('RequestIds');
export type RequestIds = z.infer<typeof RequestIds>;

/** What is requested: its title, its author, artist or host, and its catalogue ids. */
export const RequestTarget = z
  .object({
    title: z.string().trim().min(1).max(300),
    creator: z.string().trim().min(1).max(300).nullable(),
    ids: RequestIds,
  })
  .strict()
  .openapi('RequestTarget');
export type RequestTarget = z.infer<typeof RequestTarget>;

/** The catalogue ids that name each medium's target, any one of which will do. */
export const REQUEST_ID_KEYS = {
  book: ['asin', 'isbn'],
  album: ['mbid'],
  song: ['youtubeMusicId'],
  podcast: ['feedUrl'],
} as const satisfies Record<RequestMedium, readonly (keyof RequestIds)[]>;

/** A request to make: the medium and its target, which names it by its medium's catalogue id. */
export const RequestRef = z
  .object({ medium: RequestMedium, target: RequestTarget })
  .strict()
  .superRefine((value, ctx) => {
    const keys: readonly (keyof RequestIds)[] = REQUEST_ID_KEYS[value.medium];
    if (!keys.some((key) => value.target.ids[key] !== undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['target', 'ids'],
        message: `a ${value.medium} needs one of ${keys.join(', ')}`,
      });
    }
  })
  .openapi('RequestRef');
export type RequestRef = z.infer<typeof RequestRef>;

/** The body of a new request. */
export const CreateRequestBody = z.object({ ref: RequestRef }).strict();
export type CreateRequestBody = z.infer<typeof CreateRequestBody>;

/**
 * A song to keep, by the ref search or radio named it by: the server builds its target from what it
 * already knows of that song, so a client can keep nothing else.
 */
export const KeepBody = z.object({ ref: MediaRef }).strict();
export type KeepBody = z.infer<typeof KeepBody>;

/** One request by its id in the path. */
export const RequestParams = z.object({ id: z.string().min(1) });
export type RequestParams = z.infer<typeof RequestParams>;

/** A choice of one candidate, by the id the server gave it. */
export const ChooseReleaseBody = z.object({ candidate: z.string().min(1) }).strict();
export type ChooseReleaseBody = z.infer<typeof ChooseReleaseBody>;

/**
 * What a person can do to a request now. `choose` takes one of its candidates while a choice is
 * waited for. `pickAnother` is one tap on a failed request, also through the choose route: it drops
 * the release that failed and takes one of the candidates left.
 */
export const RequestVerb = z
  .enum(['retry', 'cancel', 'choose', 'pickAnother'])
  .openapi('RequestVerb');
export type RequestVerb = z.infer<typeof RequestVerb>;

/** A release to choose from: what a person sees of it, and the id they pick it by. */
export const RequestCandidate = z
  .object({
    id: z.string(),
    title: z.string(),
    source: z.string(),
    /** In bytes, when known. */
    size: z.number().int().nonnegative().nullable(),
  })
  .openapi('RequestCandidate');
export type RequestCandidate = z.infer<typeof RequestCandidate>;

/**
 * One request as a person sees it, in raw values the apps word themselves. `source` and `size` are
 * its release's, once it has one. `art` is the item's, once the index holds it. `progress` runs from
 * 0 to 1 while downloading; `reason` is set only when failed. `candidates` lists what `choose` or
 * `pickAnother` can take.
 */
export const RequestView = z
  .object({
    id: z.string(),
    medium: RequestMedium,
    title: z.string(),
    creator: z.string().nullable(),
    art: ArtUrl.nullable(),
    source: z.string().nullable(),
    size: z.number().int().nonnegative().nullable(),
    status: RequestStatus,
    progress: z.number().nullable(),
    reason: RequestFailure.nullable(),
    verbs: z.array(RequestVerb),
    candidates: z.array(RequestCandidate),
  })
  .openapi('RequestView');
export type RequestView = z.infer<typeof RequestView>;

/** A person's requests under way, and those waiting for them to choose a release. */
export const RequestList = z
  .object({ inFlight: z.array(RequestView), needsChoice: z.array(RequestView) })
  .openapi('RequestList');
export type RequestList = z.infer<typeof RequestList>;

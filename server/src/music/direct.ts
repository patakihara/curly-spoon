/**
 * The direct resolve: a track's audio from YouTube's player API in one HTTP call, ahead of yt-dlp.
 * The player asks for a visitor id, which any YouTube Music answer names: with none held, the
 * song's own search is asked once for one. A bot wall drops the id held, a fresh one is fetched the
 * same way, and the player is asked once more. Whatever fails after that is the extractor's to
 * answer, so this never decides a track cannot play.
 */
import type { Visitor } from '../adapters/ytmusic/client.js';
import type { PlayerAnswer } from '../adapters/ytmusic/schemas.js';
import { type AudioInfo, parsePlayer, PlayerRefused } from './schemas.js';

/** A track's audio-only formats, or a throw. */
export type DirectResolve = (id: string) => Promise<AudioInfo>;

/** No InnerTube answer named a visitor id. */
export class NoVisitor extends Error {
  constructor() {
    super('no visitor id');
    this.name = 'NoVisitor';
  }
}

export interface DirectOptions {
  /** YouTube's player, asked for `id` with that visitor id. */
  player: (id: string, visitorId: string) => Promise<PlayerAnswer>;
  /** Where YouTube Music's answers keep the newest visitor id. */
  visitor: Visitor;
  /** Asks YouTube Music something about `id` (its own search) that names a visitor id. */
  findVisitor: (id: string) => Promise<void>;
}

export function directResolver(options: DirectOptions): DirectResolve {
  const { visitor } = options;
  const held = async (id: string): Promise<string> => {
    const kept = visitor.get();
    if (kept !== null) return kept;
    await options.findVisitor(id);
    const found = visitor.get();
    if (found === null) throw new NoVisitor();
    return found;
  };
  return async (id) => {
    const first = await options.player(id, await held(id));
    try {
      return parsePlayer(first, id);
    } catch (error) {
      if (!(error instanceof PlayerRefused) || error.reason !== 'blocked') throw error;
    }
    visitor.drop();
    return parsePlayer(await options.player(id, await held(id)), id);
  };
}

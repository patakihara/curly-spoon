/**
 * Before the scrubber: a user list keeps only the test identity as it is. Every other account in
 * Audiobookshelf's `GET /api/users` and Jellyfin's `GET /Users` becomes `user-1`, `user-2`...:
 * username, name, email, id and sign-on subject, with its listening history emptied. The names
 * replaced are
 * handed back, so the scan can check none of them is left anywhere.
 */
import { PLACEHOLDER, PLACEHOLDER_EMAIL, type RawExchange } from './scrub.js';

/** Per-person history a user object may carry; nobody but the test identity keeps it. */
const HISTORY_FIELDS = ['mediaProgress', 'bookmarks', 'seriesHideFromContinueListening'];

/** Account names that name a role, not a person: still replaced, but the upstream uses the same
 * words for its own account types, so the scan must not hunt for them. */
const ROLE_WORDS = new Set(['root', 'admin', 'administrator', 'user', 'guest']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

interface Shape {
  list: (json: unknown) => unknown[] | undefined;
  rebuild: (json: unknown, list: unknown[]) => unknown;
  name: string;
  id: string;
}

const SHAPES: { path: RegExp; shape: Shape }[] = [
  {
    path: /\/api\/users$/,
    shape: {
      list: (json) => (isRecord(json) && Array.isArray(json.users) ? json.users : undefined),
      rebuild: (json, list) => ({ ...(json as Record<string, unknown>), users: list }),
      name: 'username',
      id: 'id',
    },
  },
  {
    path: /\/Users$/,
    shape: {
      list: (json) => (Array.isArray(json) ? json : undefined),
      rebuild: (_json, list) => list,
      name: 'Name',
      id: 'Id',
    },
  },
];

export interface Anonymized {
  raw: RawExchange;
  /** Every username, name and email replaced, for the scan. */
  names: string[];
}

export function anonymizeAccounts(raw: RawExchange, keep: readonly string[]): Anonymized {
  const { pathname } = new URL(raw.request.url);
  const found = SHAPES.find((s) => s.path.test(pathname));
  const body = raw.response.body;
  if (found === undefined || body === null || !('json' in body)) return { raw, names: [] };
  const { shape } = found;
  const list = shape.list(body.json);
  if (list === undefined) return { raw, names: [] };

  const names: string[] = [];
  let n = 0;
  const kept = keep.map((k) => k.toLowerCase());
  const accounts = list.map((account) => {
    if (!isRecord(account)) return account;
    const name = account[shape.name];
    if (typeof name === 'string' && kept.includes(name.toLowerCase())) return account;
    n += 1;
    const placeholder = `user-${n}`;
    const out: Record<string, unknown> = { ...account, [shape.name]: placeholder };
    out[shape.id] = placeholder;
    for (const field of ['email', 'Email'] as const) {
      if (typeof account[field] === 'string') {
        names.push(account[field]);
        out[field] = PLACEHOLDER_EMAIL;
      }
    }
    for (const field of HISTORY_FIELDS) if (Array.isArray(account[field])) out[field] = [];
    if (typeof account.authOpenIDSub === 'string') out.authOpenIDSub = PLACEHOLDER;
    if (isRecord(account.extraData) && typeof account.extraData.authOpenIDSub === 'string') {
      out.extraData = { ...account.extraData, authOpenIDSub: PLACEHOLDER };
    }
    if (typeof name === 'string' && !ROLE_WORDS.has(name.toLowerCase())) names.push(name);
    return out;
  });
  return {
    raw: {
      ...raw,
      response: { ...raw.response, body: { json: shape.rebuild(body.json, accounts) } },
    },
    names,
  };
}

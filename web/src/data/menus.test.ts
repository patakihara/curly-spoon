import { ListDetail, type ListSummary, type MediaRef } from '@auralis/schema';
import { describe, expect, it } from 'vitest';
import { createApiClient } from '../api/client';
import { addMenu, type Ask, itemVerb, listMenu, listVerb } from './menus';
import { SignedOut } from './store';

/** An API answering each `METHOD path` from `answers` (anything else 404), recording each ask. */
function api(answers: Record<string, [number, unknown]>) {
  const asked: { call: string; body: unknown }[] = [];
  const client = createApiClient({
    baseUrl: 'http://auralis.test',
    fetch: async (request) => {
      const call = `${request.method} ${decodeURIComponent(new URL(request.url).pathname)}`;
      const text = await request.text();
      asked.push({ call, body: text === '' ? undefined : (JSON.parse(text) as unknown) });
      const [status, body] = answers[call] ?? [404, { error: 'not_found' }];
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  return { client, asked };
}

/** Answers each question as given, recording it. */
function asking(name: string | null, confirm = true) {
  const asked: string[] = [];
  const ask: Ask = {
    name: (question, given) => (asked.push(`${question} [${given}]`), name),
    confirm: (question) => (asked.push(question), confirm),
  };
  return { ask, asked };
}

const show: MediaRef = { source: 'abs', id: 's1' };
const episode: MediaRef = { source: 'abs', id: 'e1' };

const summary = (over: Partial<ListSummary>): ListSummary => ({
  id: 'l1',
  kind: 'playlist',
  name: 'Commute',
  theDigest: false,
  order: null,
  count: 0,
  counts: { book: 0, show: 0, episode: 0 },
  covers: [],
  ...over,
});

const detail = (over: Partial<ListDetail>): ListDetail =>
  ListDetail.parse({ ...summary({}), shows: [], items: [], ...over });

const megacorp = {
  ref: show,
  kind: 'show',
  title: 'Megacorp',
  sub: null,
  art: null,
  progress: null,
  availability: { kind: 'owned' },
} as const;

describe("[M2.lists] a list's menu", () => {
  it('[M2.lists] renames and deletes a playlist or listening list, naming its kind', () => {
    expect(listMenu(detail({}))).toEqual([
      { key: 'rename', label: 'Rename', icon: 'edit' },
      { key: 'delete', label: 'Delete playlist', icon: 'delete' },
    ]);
    expect(listMenu(detail({ kind: 'listening' })).map((i) => i.label)).toEqual([
      'Rename',
      'Delete list',
    ]);
  });

  it('[M2.lists] turns The Digest round, and nothing else: its name and shows are fixed', () => {
    const theDigest = detail({
      kind: 'digest',
      theDigest: true,
      order: 'oldest',
      shows: [megacorp],
    });
    expect(listMenu(theDigest)).toEqual([
      { key: 'order', label: 'Play newest first', icon: 'swap_vert' },
    ]);
  });

  it('[M2.lists] turns a custom digest round, takes off each of its shows, renames and deletes it', () => {
    const digest = detail({ kind: 'digest', order: 'newest', shows: [megacorp] });
    expect(listMenu(digest)).toEqual([
      { key: 'order', label: 'Play oldest first', icon: 'swap_vert' },
      { key: 'drop:abs:s1', label: 'Remove Megacorp', icon: 'remove' },
      { key: 'rename', label: 'Rename', icon: 'edit' },
      { key: 'delete', label: 'Delete digest', icon: 'delete' },
    ]);
  });
});

describe("[M2.lists] a list's verbs, through /api/lists", () => {
  const opened = detail({ kind: 'digest', order: 'oldest', shows: [megacorp] });

  it('[M2.lists] renames a list to the name asked for, and does nothing when none is given', async () => {
    const { client, asked } = api({
      'GET /api/lists/l1': [200, opened],
      'PATCH /api/lists/l1': [200, opened],
    });
    const named = asking('Night drives');
    expect(await listVerb(client, named.ask, 'l1', 'rename')).toBe('changed');
    expect(named.asked).toEqual(['Rename “Commute” [Commute]']);
    expect(asked.at(-1)).toEqual({ call: 'PATCH /api/lists/l1', body: { name: 'Night drives' } });

    const none = api({ 'GET /api/lists/l1': [200, opened] });
    expect(await listVerb(none.client, asking(null).ask, 'l1', 'rename')).toBe('unchanged');
    expect(none.asked.map((a) => a.call)).toEqual(['GET /api/lists/l1']);
  });

  it('[M2.lists] deletes a list once you confirm it', async () => {
    const { client, asked } = api({
      'GET /api/lists/l1': [200, opened],
      'DELETE /api/lists/l1': [200, { ok: true }],
    });
    const sure = asking(null, true);
    expect(await listVerb(client, sure.ask, 'l1', 'delete')).toBe('gone');
    expect(sure.asked).toEqual(['Delete “Commute”?']);
    expect(asked.at(-1)!.call).toBe('DELETE /api/lists/l1');

    const unsure = api({ 'GET /api/lists/l1': [200, opened] });
    expect(await listVerb(unsure.client, asking(null, false).ask, 'l1', 'delete')).toBe(
      'unchanged',
    );
    expect(unsure.asked.map((a) => a.call)).toEqual(['GET /api/lists/l1']);
  });

  it("[M2.lists] turns a digest's order round, and takes a show off it", async () => {
    const { client, asked } = api({
      'GET /api/lists/l1': [200, opened],
      'PATCH /api/lists/l1': [200, opened],
    });
    expect(await listVerb(client, asking(null).ask, 'l1', 'order')).toBe('changed');
    expect(asked.at(-1)).toEqual({ call: 'PATCH /api/lists/l1', body: { order: 'newest' } });
    expect(await listVerb(client, asking(null).ask, 'l1', 'drop:abs:s1')).toBe('changed');
    expect(asked.at(-1)).toEqual({ call: 'PATCH /api/lists/l1', body: { shows: [] } });
  });

  it('[M2.lists] throws on a refusal, and SignedOut for want of a sign-in', async () => {
    const refused = api({
      'GET /api/lists/l1': [200, opened],
      'PATCH /api/lists/l1': [400, { error: 'fixed_list' }],
    });
    await expect(listVerb(refused.client, asking('X').ask, 'l1', 'rename')).rejects.toThrow();
    const out = api({ 'GET /api/lists/l1': [401, { error: 'signed_out' }] });
    await expect(listVerb(out.client, asking('X').ask, 'l1', 'rename')).rejects.toBeInstanceOf(
      SignedOut,
    );
  });
});

describe("[M2.lists] an item's menu adding it to your lists", () => {
  const lists = [
    summary({ id: 'd', kind: 'digest', name: 'The Digest', theDigest: true, order: 'oldest' }),
    summary({ id: 'l1' }),
    summary({ id: 'l2', kind: 'listening', name: 'Weekend reads' }),
    summary({ id: 'l3', kind: 'digest', name: 'Work', order: 'oldest' }),
  ];

  it('[M2.lists] offers each list that takes it, then a new one of each kind; never The Digest', () => {
    expect(addMenu(lists, ['playlist'])).toEqual([
      { key: 'add:l1', label: 'Add to Commute', icon: 'playlist_add' },
      { key: 'new:playlist', label: 'New playlist', icon: 'add' },
    ]);
    expect(addMenu(lists, ['digest', 'listening']).map((i) => i.key)).toEqual([
      'add:l2',
      'add:l3',
      'new:digest',
      'new:listening',
    ]);
  });

  it('[M2.lists] offers nothing when your lists could not be read', () => {
    expect(addMenu(null, ['playlist'])).toEqual([]);
  });

  it('[M2.lists] adds an episode to the end of a playlist, and a show to a digest’s shows', async () => {
    const { client, asked } = api({
      'GET /api/lists/l1': [200, detail({})],
      'POST /api/lists/l1/items': [200, detail({})],
      'GET /api/lists/l3': [
        200,
        detail({ id: 'l3', kind: 'digest', order: 'oldest', shows: [megacorp] }),
      ],
      'PATCH /api/lists/l3': [200, detail({ id: 'l3', kind: 'digest', order: 'oldest' })],
    });
    expect(await itemVerb(client, asking(null).ask, 'abs:e1', 'add:l1')).toBeNull();
    expect(asked.at(-1)).toEqual({ call: 'POST /api/lists/l1/items', body: { ref: episode } });
    const other: MediaRef = { source: 'abs', id: 's2' };
    expect(await itemVerb(client, asking(null).ask, 'abs:s2', 'add:l3')).toBeNull();
    expect(asked.at(-1)).toEqual({ call: 'PATCH /api/lists/l3', body: { shows: [show, other] } });
  });

  it('[M2.lists] makes a new list holding the item under the name asked for, and opens it', async () => {
    const { client, asked } = api({
      'POST /api/lists': [200, detail({ id: 'new' })],
      'POST /api/lists/new/items': [200, detail({ id: 'new' })],
    });
    const named = asking('Night drives');
    expect(await itemVerb(client, named.ask, 'abs:e1', 'new:playlist')).toBe('new');
    expect(named.asked).toEqual(['New playlist []']);
    expect(asked).toEqual([
      { call: 'POST /api/lists', body: { kind: 'playlist', name: 'Night drives' } },
      { call: 'POST /api/lists/new/items', body: { ref: episode } },
    ]);

    const digest = api({ 'POST /api/lists': [200, detail({ id: 'dg', kind: 'digest' })] });
    expect(await itemVerb(digest.client, named.ask, 'abs:s1', 'new:digest')).toBe('dg');
    expect(digest.asked).toEqual([
      { call: 'POST /api/lists', body: { kind: 'digest', name: 'Night drives', shows: [show] } },
    ]);

    const none = api({});
    expect(await itemVerb(none.client, asking(null).ask, 'abs:e1', 'new:playlist')).toBeNull();
    expect(none.asked).toEqual([]);
  });
});

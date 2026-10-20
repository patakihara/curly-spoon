import {
  ListDetail,
  type ListKind,
  type ListSummary,
  type MediaRef,
  mediaRefKey,
  parseMediaRefKey,
} from '@auralis/schema';
import { type ApiClient } from '../api/client';
import { answer } from './loads';

/**
 * What the pages' menus do with your lists, through `/api/lists`. A list's own menu turns a digest
 * round, takes a show off a custom digest, and renames or deletes any list but The Digest. A book's,
 * a show's or an episode's menu adds it to each of your lists that takes it, or to a new one: a
 * playlist takes episodes, a listening list books and shows, a custom digest shows. The shell has
 * no field or dialog of its own, so a name is asked for, and a deletion confirmed, through `Ask`:
 * the browser's own prompt in the app.
 */

/** One verb of a menu, as Sonora's OverflowMenu draws it. */
export interface MenuItem {
  key: string;
  label: string;
  icon: string;
}

/** How a verb asks for what it needs: a name, given one to start from, or a yes. */
export interface Ask {
  /** The name typed, or null when none is given. */
  name(question: string, given: string): string | null;
  confirm(question: string): boolean;
}

/** The browser's own prompt and confirmation. */
export const browserAsk: Ask = {
  name: (question, given) => window.prompt(question, given),
  confirm: (question) => window.confirm(question),
};

/** What a list is called in its Delete. */
const NOUNS: Record<ListKind, string> = {
  listening: 'list',
  playlist: 'playlist',
  digest: 'digest',
};

/** What a new list of each kind is called in a menu. */
const NEW: Record<ListKind, string> = {
  playlist: 'New playlist',
  listening: 'New listening list',
  digest: 'New digest',
};

/** List `list`'s own menu. */
export function listMenu(list: ListDetail): MenuItem[] {
  const items: MenuItem[] = [];
  if (list.kind === 'digest') {
    const turned = list.order === 'newest' ? 'Play oldest first' : 'Play newest first';
    items.push({ key: 'order', label: turned, icon: 'swap_vert' });
  }
  if (list.theDigest) return items;
  if (list.kind === 'digest') {
    for (const show of list.shows) {
      items.push({
        key: `drop:${mediaRefKey(show.ref)}`,
        label: `Remove ${show.title}`,
        icon: 'remove',
      });
    }
  }
  items.push({ key: 'rename', label: 'Rename', icon: 'edit' });
  items.push({ key: 'delete', label: `Delete ${NOUNS[list.kind]}`, icon: 'delete' });
  return items;
}

/**
 * An item's menu: each of `lists` of the kinds in `takes` (never The Digest, whose shows are your
 * subscriptions), then a new list of each kind. None when your lists could not be read, null.
 */
export function addMenu(lists: ListSummary[] | null, takes: ListKind[]): MenuItem[] {
  if (lists === null) return [];
  return [
    ...lists
      .filter((list) => takes.includes(list.kind) && !list.theDigest)
      .map((list) => ({
        key: `add:${list.id}`,
        label: `Add to ${list.name}`,
        icon: 'playlist_add',
      })),
    ...takes.map((kind) => ({ key: `new:${kind}`, label: NEW[kind], icon: 'add' })),
  ];
}

const opened = (api: ApiClient, id: string) =>
  answer(api.GET('/api/lists/{id}', { params: { path: { id } } }), (d) => ListDetail.parse(d));

const changed = (
  api: ApiClient,
  id: string,
  body: { name?: string; order?: 'oldest' | 'newest'; shows?: MediaRef[] },
) =>
  answer(api.PATCH('/api/lists/{id}', { params: { path: { id } }, body }), (d) =>
    ListDetail.parse(d),
  );

/** A name typed, trimmed; null when none was. */
const named = (typed: string | null) => {
  const name = typed?.trim() ?? '';
  return name === '' ? null : name;
};

/**
 * Does verb `key` of list `id`'s menu: whether the list is `changed`, `gone`, or `unchanged` as
 * nothing was asked for in the end. Throws on a refusal; `SignedOut` for want of a sign-in.
 */
export async function listVerb(
  api: ApiClient,
  ask: Ask,
  id: string,
  key: string,
): Promise<'changed' | 'gone' | 'unchanged'> {
  const list = await opened(api, id);
  if (key === 'rename') {
    const name = named(ask.name(`Rename “${list.name}”`, list.name));
    if (name === null || name === list.name) return 'unchanged';
    await changed(api, id, { name });
    return 'changed';
  }
  if (key === 'delete') {
    if (!ask.confirm(`Delete “${list.name}”?`)) return 'unchanged';
    await answer(api.DELETE('/api/lists/{id}', { params: { path: { id } } }), (d) => d);
    return 'gone';
  }
  if (key === 'order') {
    await changed(api, id, { order: list.order === 'newest' ? 'oldest' : 'newest' });
    return 'changed';
  }
  if (key.startsWith('drop:')) {
    const dropped = key.slice('drop:'.length);
    const shows = list.shows.map((show) => show.ref).filter((ref) => mediaRefKey(ref) !== dropped);
    await changed(api, id, { shows });
    return 'changed';
  }
  throw new Error(`no list verb ${key}`);
}

/**
 * Does verb `key` of the menu of the item `ref` names: adds it to a list, or makes a new list
 * holding it, answering the new list's id to open it; null when no list was made. Throws on a
 * refusal; `SignedOut` for want of a sign-in.
 */
export async function itemVerb(
  api: ApiClient,
  ask: Ask,
  ref: string,
  key: string,
): Promise<string | null> {
  const item = parseMediaRefKey(ref);
  if (item === null) throw new Error(`no item ${ref}`);
  if (key.startsWith('add:')) {
    const id = key.slice('add:'.length);
    const list = await opened(api, id);
    if (list.kind === 'digest') {
      await changed(api, id, { shows: [...list.shows.map((show) => show.ref), item] });
    } else await addTo(api, id, item);
    return null;
  }
  if (key.startsWith('new:')) {
    const kind = key.slice('new:'.length) as ListKind;
    const name = named(ask.name(NEW[kind], ''));
    if (name === null) return null;
    const made = await answer(
      api.POST('/api/lists', {
        body: kind === 'digest' ? { kind, name, shows: [item] } : { kind, name },
      }),
      (d) => ListDetail.parse(d),
    );
    if (kind !== 'digest') await addTo(api, made.id, item);
    return made.id;
  }
  throw new Error(`no item verb ${key}`);
}

const addTo = (api: ApiClient, id: string, ref: MediaRef) =>
  answer(api.POST('/api/lists/{id}/items', { params: { path: { id } }, body: { ref } }), (d) =>
    ListDetail.parse(d),
  );

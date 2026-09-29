import { describe, expect, it } from 'vitest';
import { AdapterError, type FetchLike } from '../http/fetch.js';
import { JellyfinClient } from './client.js';

function fake(answer: unknown) {
  const sent: { url: string; headers: Headers }[] = [];
  const fetch: FetchLike = async (url, init) => {
    sent.push({ url, headers: new Headers(init?.headers) });
    return new Response(JSON.stringify(answer), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  };
  return { fetch, sent };
}

const album = { Id: 'a1', Name: 'An Album', Type: 'MusicAlbum' };

describe('the Jellyfin client', () => {
  it('every call sends the MediaBrowser header with the key as Token', async () => {
    const { fetch, sent } = fake({ Items: [album], TotalRecordCount: 1, ...album });
    const jf = new JellyfinClient({ baseUrl: 'http://upstream.invalid', token: 'the-key', fetch });
    await jf.getLibraries();
    await jf.getAlbums({ limit: 1, startIndex: 0 });
    await jf.getItem('a1');
    expect(sent.map((s) => new URL(s.url).pathname)).toEqual([
      '/Library/MediaFolders',
      '/Items',
      '/Items/a1',
    ]);
    for (const req of sent) {
      expect(req.headers.get('authorization')).toMatch(
        /^MediaBrowser Client="Auralis", .*Token="the-key"$/,
      );
      expect(req.headers.get('accept')).toBe('application/json');
    }
  });

  it('a page of albums is recursive, oldest added first, with the fields the index reads', async () => {
    const { fetch, sent } = fake({ Items: [album], TotalRecordCount: 38 });
    const jf = new JellyfinClient({ baseUrl: 'http://upstream.invalid', token: 'k', fetch });
    expect(await jf.getAlbums({ limit: 2, startIndex: 8 })).toEqual({
      Items: [album],
      TotalRecordCount: 38,
    });
    expect(Object.fromEntries(new URL(sent[0]?.url ?? '').searchParams)).toEqual({
      IncludeItemTypes: 'MusicAlbum',
      Recursive: 'true',
      SortBy: 'DateCreated,SortName',
      SortOrder: 'Ascending',
      StartIndex: '8',
      Limit: '2',
      Fields: 'ProviderIds,Genres,Etag',
    });
  });

  it("an album's tracks are its Audio children in disc and track order", async () => {
    const track = { Id: 't1', Name: 'A Track', Type: 'Audio' };
    const { fetch, sent } = fake({ Items: [track], TotalRecordCount: 1 });
    const jf = new JellyfinClient({ baseUrl: 'http://upstream.invalid', token: 'k', fetch });
    expect(await jf.getAlbumTracks('a1')).toEqual([track]);
    expect(Object.fromEntries(new URL(sent[0]?.url ?? '').searchParams)).toEqual({
      ParentId: 'a1',
      IncludeItemTypes: 'Audio',
      SortBy: 'ParentIndexNumber,IndexNumber,SortName',
      Fields: 'ProviderIds,Genres,Etag',
    });
  });

  it('an item asked for with the API key names a user, since the key has none of its own', async () => {
    const { fetch, sent } = fake(album);
    const jf = new JellyfinClient({ baseUrl: 'http://upstream.invalid', token: 'k', fetch });
    await jf.getItem('a1', 'u1');
    await jf.getItem('a1');
    expect(sent.map((s) => new URL(s.url).search)).toEqual(['?userId=u1', '']);
  });

  it('the administrator found is the first user whose policy says administrator', async () => {
    const { fetch, sent } = fake([
      { Id: 'u1', Name: 'x', Policy: { IsAdministrator: false } },
      { Id: 'u2', Name: 'y', Policy: { IsAdministrator: true } },
      { Id: 'u3', Name: 'z', Policy: { IsAdministrator: true } },
    ]);
    const jf = new JellyfinClient({ baseUrl: 'http://upstream.invalid', token: 'k', fetch });
    expect(await jf.findAdministratorId()).toBe('u2');
    expect(new URL(sent[0]?.url ?? '').pathname).toBe('/Users');
  });

  it('the server version is read without the key', async () => {
    const { fetch, sent } = fake({ Version: '10.11.11', ServerName: 'x' });
    const jf = new JellyfinClient({ baseUrl: 'http://upstream.invalid', token: 'the-key', fetch });
    expect(await jf.getServerVersion()).toBe('10.11.11');
    expect(sent[0]?.headers.get('authorization')).not.toContain('Token=');
  });

  it('a response that does not match the schema fails as a parse error naming the call', async () => {
    const { fetch } = fake({ Items: 'nope' });
    const jf = new JellyfinClient({ baseUrl: 'http://upstream.invalid', token: 'k', fetch });
    const failure = (await jf.getLibraries().catch((e: unknown) => e)) as AdapterError;
    expect(failure).toBeInstanceOf(AdapterError);
    expect(failure.kind).toBe('parse');
    expect(failure.message).toContain('GET /Library/MediaFolders');
  });
});

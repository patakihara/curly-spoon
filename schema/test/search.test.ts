import { describe, expect, it } from 'vitest';
import { generateKotlin } from '../codegen/kotlin.js';
import { buildOpenApiDocument } from '../codegen/openapi.js';
import {
  ErrorResponse,
  getSearch,
  getSearchSuggest,
  routes,
  SearchQuery,
  SearchResults,
  SuggestionList,
  SuggestQuery,
} from '../src/index.js';

const album = { source: 'jellyfin', id: '65de8562c54b89ceef199f91bacd8709' } as const;
const track = { source: 'jellyfin', id: '7c8b8e35000000000000000000000000' } as const;

describe('a search', () => {
  it('takes one kind or several, as one `kinds` parameter or repeated ones', () => {
    expect(SearchQuery.parse({ q: 'rumours', kinds: 'album' })).toEqual({
      q: 'rumours',
      kinds: ['album'],
    });
    expect(SearchQuery.parse({ q: 'rumours', kinds: ['album', 'track'] })).toEqual({
      q: 'rumours',
      kinds: ['album', 'track'],
    });
    expect(SearchQuery.parse({ q: 'rumours' })).toEqual({ q: 'rumours' });
  });

  it('refuses a kind it does not know, and no kinds at all', () => {
    expect(SearchQuery.safeParse({ q: 'rumours', kinds: 'video' }).success).toBe(false);
    expect(SearchQuery.safeParse({ q: 'rumours', kinds: ['album', 'video'] }).success).toBe(false);
    expect(SearchQuery.safeParse({ q: 'rumours', kinds: [] }).success).toBe(false);
  });

  it('refuses an empty query, or only spaces, and one over 200 characters; keeps it trimmed', () => {
    expect(SearchQuery.safeParse({ q: '' }).success).toBe(false);
    expect(SearchQuery.safeParse({ q: '   ' }).success).toBe(false);
    expect(SearchQuery.safeParse({}).success).toBe(false);
    expect(SearchQuery.safeParse({ q: 'a'.repeat(201) }).success).toBe(false);
    expect(SearchQuery.parse({ q: ` ${'a'.repeat(200)} ` })).toEqual({ q: 'a'.repeat(200) });
  });

  it('answers the query and its results, each with its kind, creators, parent, art, times and availability', () => {
    const results = {
      query: 'rumours',
      results: [
        {
          ref: album,
          kind: 'album',
          title: 'Rumours',
          creators: ['Fleetwood Mac'],
          parent: null,
          art: `/api/media/jellyfin:${album.id}/art`,
          duration: 2390,
          year: 1977,
          publishedAt: null,
          availability: { kind: 'owned' },
        },
        {
          ref: track,
          kind: 'track',
          title: 'Dreams',
          creators: ['Fleetwood Mac'],
          parent: { ref: album, title: 'Rumours' },
          art: null,
          duration: 257,
          year: null,
          publishedAt: null,
          availability: { kind: 'owned' },
        },
      ],
    };
    expect(SearchResults.parse(results)).toEqual(results);
    const prose = { ...results.results[0]!, kind: 'Album' };
    expect(SearchResults.safeParse({ ...results, results: [prose] }).success).toBe(false);
  });
});

describe('suggestions', () => {
  it('take an empty query, for recent searches alone, and refuse one over 200 characters', () => {
    expect(SuggestQuery.parse({ q: '' })).toEqual({ q: '' });
    expect(SuggestQuery.parse({ q: 'ru' })).toEqual({ q: 'ru' });
    expect(SuggestQuery.safeParse({ q: 'a'.repeat(201) }).success).toBe(false);
  });

  it('name their kind and text, and the item, person or series, none for a recent search', () => {
    const list = {
      suggestions: [
        { kind: 'recent', text: 'rumours', ref: null },
        { kind: 'album', text: 'Rumours', ref: album },
      ],
    };
    expect(SuggestionList.parse(list)).toEqual(list);
    expect(
      SuggestionList.safeParse({ suggestions: [{ kind: 'Recent', text: 'x', ref: null }] }).success,
    ).toBe(false);
  });
});

describe('the search routes', () => {
  it('search and suggest for a signed-in member, at /api/search and /api/search/suggest', () => {
    expect(routes).toContain(getSearch);
    expect(routes).toContain(getSearchSuggest);
    expect(getSearch).toMatchObject({
      method: 'GET',
      path: '/api/search',
      access: 'member',
      query: SearchQuery,
      response: SearchResults,
    });
    expect(getSearchSuggest).toMatchObject({
      method: 'GET',
      path: '/api/search/suggest',
      access: 'member',
      query: SuggestQuery,
      response: SuggestionList,
    });
  });

  it('describe `kinds` as a repeated query parameter, `kinds=album&kinds=track`', () => {
    const doc = buildOpenApiDocument([getSearch], ErrorResponse) as unknown as {
      paths: Record<
        string,
        {
          get: {
            parameters: {
              name: string;
              in: string;
              required?: boolean;
              style?: string;
              explode?: boolean;
              schema: { type?: string; items?: { $ref?: string } };
            }[];
          };
        }
      >;
    };
    const parameters = doc.paths['/api/search']?.get.parameters ?? [];
    expect(parameters.map((p) => [p.name, p.in, p.required ?? false])).toEqual([
      ['q', 'query', true],
      ['kinds', 'query', false],
    ]);
    const kinds = parameters.find((p) => p.name === 'kinds')!;
    expect(kinds.schema).toMatchObject({
      type: 'array',
      items: { $ref: '#/components/schemas/SearchKind' },
    });
    // OpenAPI's default for a query parameter, and openapi-fetch's for an array: one per value.
    expect(kinds.style ?? 'form').toBe('form');
    expect(kinds.explode ?? true).toBe(true);
  });

  it('generate Kotlin models for results and suggestions, kinds as enums', () => {
    const doc = buildOpenApiDocument([getSearch, getSearchSuggest], ErrorResponse);
    const kotlin = generateKotlin(JSON.parse(JSON.stringify(doc)) as object, 'test');
    for (const name of ['SearchResults', 'SearchResult', 'SearchParent', 'SuggestionList']) {
      expect(kotlin).toContain(`data class ${name}(`);
    }
    expect(kotlin).toContain('enum class SearchKind');
    expect(kotlin).toContain('enum class SuggestionKind');
    expect(kotlin).toContain('    val parent: SearchParent?,');
    expect(kotlin).toContain('    val ref: MediaRef?,');
  });
});

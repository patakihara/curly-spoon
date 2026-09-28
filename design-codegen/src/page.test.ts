import { describe, expect, it } from 'vitest';
import { checkPage, parsePage, type PageTree } from './page.js';

const page = (body: string, name = 'Book') =>
  `export default function ${name}({ data }) {\n  return (\n${body}\n  );\n}\n`;

describe('a page file', () => {
  it('reads into a tree of components, literal props and member-path bindings', () => {
    const tree = parsePage(
      page(`<DetailPage kindLabel="Book" overlay>
  <MediaHeader title={data.title} count={3} />
  <Each of={data.chapters} as="chapter">
    <EpisodeRow title={chapter.title} />
  </Each>
  <When state="full"><Button>Play</Button></When>
</DetailPage>`),
      'book',
    );
    expect(tree).toEqual<PageTree>({
      kind: 'element',
      component: 'DetailPage',
      line: 3,
      props: {
        kindLabel: { kind: 'literal', value: 'Book' },
        overlay: { kind: 'literal', value: true },
      },
      children: [
        {
          kind: 'element',
          component: 'MediaHeader',
          line: 4,
          props: {
            title: { kind: 'binding', path: ['data', 'title'] },
            count: { kind: 'literal', value: 3 },
          },
          children: [],
        },
        {
          kind: 'each',
          line: 5,
          of: ['data', 'chapters'],
          as: 'chapter',
          children: [
            {
              kind: 'element',
              component: 'EpisodeRow',
              line: 6,
              props: { title: { kind: 'binding', path: ['chapter', 'title'] } },
              children: [],
            },
          ],
        },
        {
          kind: 'when',
          line: 8,
          state: 'full',
          children: [
            {
              kind: 'element',
              component: 'Button',
              line: 8,
              props: {},
              children: [{ kind: 'text', value: 'Play' }],
            },
          ],
        },
      ],
    });
  });

  it.each([
    ['an HTML element', '<div />', /line 3: <div> is not a Sonora component/],
    ['a style prop', '<Button style={data.x} />', /line 3: style is not allowed/],
    ['a className prop', '<Button className="x" />', /line 3: className is not allowed/],
    ['an expression', '<Button label={data.a + 1} />', /line 3: .*only literals and data paths/],
    ['a call', '<Button label={data.f()} />', /line 3: .*only literals and data paths/],
    ['a spread', '<Button {...data} />', /line 3: spread props are not allowed/],
  ])('refuses %s, naming the line', (_what, body, error) => {
    expect(() => parsePage(page(body), 'book')).toThrow(error);
  });

  it('reads an element given to a prop as a slot, a tree of its own', () => {
    const tree = parsePage(
      page(`<BackdropShell back={<BackLayer controls={<ButtonGroup items={data.filters} />} />}>
  <PageBody />
</BackdropShell>`),
      'book',
    );
    expect(tree.kind === 'element' && tree.props.back).toEqual({
      kind: 'slot',
      tree: {
        kind: 'element',
        component: 'BackLayer',
        line: 3,
        props: {
          controls: {
            kind: 'slot',
            tree: {
              kind: 'element',
              component: 'ButtonGroup',
              line: 3,
              props: { items: { kind: 'binding', path: ['data', 'filters'] } },
              children: [],
            },
          },
        },
        children: [],
      },
    });
  });

  it('refuses a fragment or an Each given to a prop', () => {
    expect(() => parsePage(page('<BackLayer controls={<><Button /></>} />'), 'book')).toThrow(
      /line 3: .*only literals, data paths and one Sonora element/,
    );
    expect(() =>
      parsePage(
        page('<BackLayer controls={<Each of={data.a} as="a"><Button /></Each>} />'),
        'book',
      ),
    ).toThrow(/line 3: Each and When go in children, not in a prop/);
  });

  it('refuses an import', () => {
    expect(() => parsePage(`import x from 'y';\n${page('<Button />')}`, 'book')).toThrow(
      /line 1: imports are not allowed/,
    );
  });

  it('refuses a hook or any statement before the return', () => {
    const source = `export default function Book({ data }) {\n  const [a] = useState(1);\n  return <Button />;\n}\n`;
    expect(() => parsePage(source, 'book')).toThrow(/line 2: .*only return/);
  });

  it('[M0.canvas] refuses an Each item or a When state that is not a plain name, so neither can write markup or code', () => {
    for (const as of ['a" onclick="x', 'a, i) => (x', 'class', 'data', 'shell', 'i', 'chrome']) {
      expect(() =>
        parsePage(page(`<Each of={data.a} as='${as}'><Button /></Each>`), 'book'),
      ).toThrow(/line 3: Each's as must be a plain name/);
    }
    expect(() => parsePage(page('<When state="full}} {{shell"><Button /></When>'), 'book')).toThrow(
      /line 3: When's state must be a plain name/,
    );
  });

  it('[M0.canvas] refuses a path through a name starting with $, which the canvas keeps for its own', () => {
    expect(() =>
      parsePage(page('<Each of={data.a} as="row"><Button label={row.$s0} /></Each>'), 'book'),
    ).toThrow(/line 3: \$s0: a name starting with \$ is the canvas's own/);
  });

  it('refuses a function not named for its page', () => {
    expect(() => parsePage(page('<Button />', 'Album'), 'book')).toThrow(/must be named Book/);
  });
});

describe('checking a page', () => {
  const props = new Map([
    ['DetailPage', new Set(['kindLabel', 'children'])],
    ['EpisodeRow', new Set(['title'])],
  ]);
  const tree = (body: string) => parsePage(page(body), 'book');
  const data = { title: 'Wind and Truth', chapters: [{ title: 'Prologue' }] };

  it('accepts bindings that resolve in the placeholder and props the component declares', () => {
    const ok = tree(`<DetailPage kindLabel={data.title}>
  <Each of={data.chapters} as="chapter"><EpisodeRow title={chapter.title} /></Each>
</DetailPage>`);
    expect(checkPage(ok, data, props)).toEqual([]);
  });

  it('names a binding the placeholder does not hold', () => {
    expect(checkPage(tree('<EpisodeRow title={data.subtitle} />'), data, props)).toEqual([
      'line 3: data.subtitle is not in the placeholder',
    ]);
  });

  it('[M0.canvas] names a binding the placeholder holds only through its prototype, never as its own key', () => {
    expect(
      checkPage(
        tree(`<DetailPage kindLabel={data.constructor}>
  <Each of={data.chapters} as="chapter"><EpisodeRow title={chapter.toString} /></Each>
</DetailPage>`),
        data,
        props,
      ),
    ).toEqual([
      'line 3: data.constructor is not in the placeholder',
      'line 4: chapter.toString is not in the placeholder',
    ]);
  });

  it('[M0.canvas] names an Each item that hides an outer one', () => {
    expect(
      checkPage(
        tree(`<Each of={data.chapters} as="chapter">
  <Each of={data.chapters} as="chapter"><EpisodeRow title={chapter.title} /></Each>
</Each>`),
        data,
        props,
      ),
    ).toEqual(['line 4: Each item chapter hides the outer one of that name']);
  });

  it('names a loop over something that is not a list', () => {
    expect(
      checkPage(tree('<Each of={data.title} as="c"><EpisodeRow /></Each>'), data, props),
    ).toEqual(['line 3: data.title is not a non-empty list']);
  });

  it('names a component Sonora lacks and a prop the component does not declare', () => {
    expect(checkPage(tree('<DetailPage colour="red"><Frob /></DetailPage>'), data, props)).toEqual([
      'line 3: DetailPage has no prop colour',
      'line 3: Frob is not a Sonora component',
    ]);
  });

  it('checks an element given to a prop like any other, and only where the prop takes one', () => {
    const slots = new Map([['DetailPage', new Set(['children'])]]);
    const withSlots = new Map([...props, ['DetailPage', new Set(['kindLabel', 'children'])]]);
    expect(
      checkPage(
        tree('<DetailPage kindLabel={<EpisodeRow title={data.subtitle} />} />'),
        data,
        withSlots,
        slots,
      ),
    ).toEqual([
      'line 3: DetailPage.kindLabel takes no element',
      'line 3: data.subtitle is not in the placeholder',
    ]);
  });

  it('resolves a shell binding in what the shell shows, and names one it does not hold', () => {
    const shell = { filters: { book: ['All', 'Books'] } };
    const row = (path: string) => tree(`<EpisodeRow title={${path}} />`);
    expect(checkPage(row('shell.filters.book'), data, props, undefined, shell)).toEqual([]);
    expect(checkPage(row('shell.filters.album'), data, props, undefined, shell)).toEqual([
      'line 3: shell.filters.album is not in the shell',
    ]);
  });

  describe('a prop that takes one of a set of words', () => {
    const cards = new Map([['MediaCard', new Set(['title', 'tone', 'size'])]]);
    const choices = new Map([
      [
        'MediaCard',
        new Map([
          ['tone', { words: ['progress', 'request', 'error'], nullable: true }],
          ['size', { words: ['md', 'sm'], nullable: false }],
        ]),
      ],
    ]);
    const grid = (library: unknown[], size = '"sm"') =>
      checkPage(
        tree(`<Each of={data.library} as="item">
  <MediaCard title={item.title} tone={item.tone} size={${size}} />
</Each>`),
        { library, size: 'huge' },
        cards,
        undefined,
        undefined,
        choices,
      );

    it('[M0.canvas] accepts a bound value that is one of its words, and null where the prop takes null', () => {
      expect(
        grid([
          { title: 'A', tone: 'request' },
          { title: 'B', tone: null },
        ]),
      ).toEqual([]);
    });

    it('[M0.canvas] names a bound value outside its words, so a placeholder cannot smuggle one in', () => {
      expect(
        grid([
          { title: 'A', tone: 'rose' },
          { title: 'B', tone: 3 },
        ]),
      ).toEqual([
        'line 4: MediaCard.tone takes progress, request or error, not "rose" (item.tone)',
        'line 4: MediaCard.tone takes progress, request or error, not 3 (item.tone)',
      ]);
    });

    it('[M0.canvas] names a literal outside its words, and null where the prop takes no null', () => {
      expect(grid([{ title: 'A', tone: null }], '"xl"')).toEqual([
        'line 4: MediaCard.size takes md or sm, not "xl"',
      ]);
      expect(grid([{ title: 'A', tone: null }], 'data.size')).toEqual([
        'line 4: MediaCard.size takes md or sm, not "huge" (data.size)',
      ]);
      expect(grid([{ title: 'A', tone: null }], 'null')).toEqual([
        'line 4: MediaCard.size takes md or sm, not null',
      ]);
    });
  });

  it('names children given to a component that takes none', () => {
    expect(checkPage(tree('<EpisodeRow>Hi</EpisodeRow>'), data, props)).toEqual([
      'line 3: EpisodeRow takes no children',
    ]);
  });
});

describe('a page opening another', () => {
  const props = new Map([
    ['MediaCard', new Set(['title', 'onClick', 'onRequest', 'size'])],
    ['EpisodeRow', new Set(['title'])],
  ]);
  const handlers = new Map([['MediaCard', new Set(['onClick', 'onRequest'])]]);
  const opens = {
    pages: new Map([
      ['album', ['ref']],
      ['artist', ['ref']],
      ['settings', []],
    ]),
    links: ['album', 'settings'],
    handlers,
  };
  const data = { albums: [{ title: 'Tears of Ice', ref: 'tears-of-ice' }], count: 3 };
  const check = (card: string) =>
    checkPage(
      parsePage(page(`<Each of={data.albums} as="album">${card}</Each>`), 'book'),
      data,
      props,
      undefined,
      undefined,
      undefined,
      opens,
    );

  it('[M0.canvas] reads <Open> in a handler prop as the page it opens and its bound parameters', () => {
    const tree = parsePage(
      page('<MediaCard onClick={<Open page="album" ref={data.ref} />} />'),
      'book',
    );
    expect(tree.kind === 'element' && tree.props.onClick).toEqual({
      kind: 'open',
      page: 'album',
      params: { ref: ['data', 'ref'] },
    });
  });

  describe('whose items name the page they open', () => {
    const mixed = (items: Record<string, unknown>[], links = ['album', 'settings', 'artist']) =>
      checkPage(
        parsePage(
          page(
            '<Each of={data.items} as="item"><MediaCard title={item.title} onClick={<Open page={item.page} ref={item.ref} />} /></Each>',
          ),
          'book',
        ),
        { items },
        props,
        undefined,
        undefined,
        undefined,
        { ...opens, links },
      );

    it('[M0.canvas] reads <Open page={item.page}> as the page each item names', () => {
      const tree = parsePage(
        page('<MediaCard onClick={<Open page={data.page} ref={data.ref} />} />'),
        'book',
      );
      expect(tree.kind === 'element' && tree.props.onClick).toEqual({
        kind: 'open',
        page: { path: ['data', 'page'] },
        params: { ref: ['data', 'ref'] },
      });
    });

    it('[M0.canvas] accepts items of several kinds, each opening a page in its structure links', () => {
      expect(
        mixed([
          { title: 'A', page: 'album', ref: 'a' },
          { title: 'B', page: 'artist', ref: 'b' },
        ]),
      ).toEqual([]);
    });

    it('[M0.canvas] refuses a bound page outside nav.json or the structure links, or no page at all', () => {
      expect(
        mixed(
          [
            { title: 'A', page: 'album', ref: 'a' },
            { title: 'B', page: 'artist', ref: 'b' },
            { title: 'C', page: 'albums', ref: 'c' },
            { title: 'D', page: 3, ref: 'd' },
          ],
          ['album'],
        ),
      ).toEqual([
        'line 3: MediaCard.onClick: the page (item.page) is not a page id',
        "line 3: MediaCard.onClick opens artist, which is not in this page's structure links",
        'line 3: MediaCard.onClick opens albums, which is not a page in nav.json',
      ]);
      expect(mixed([{ title: 'S', page: 'settings', ref: 's' }])).toEqual([
        'line 3: MediaCard.onClick gives settings [ref], and its route takes []',
      ]);
      expect(() =>
        parsePage(page('<MediaCard onClick={<Open page={() => 1} ref={data.ref} />} />'), 'book'),
      ).toThrow(/not allowed/);
    });
  });

  it('[M0.canvas] accepts a link to a page in its structure links, each parameter bound', () => {
    expect(check('<MediaCard onClick={<Open page="album" ref={album.ref} />} />')).toEqual([]);
  });

  it("[M0.canvas] refuses a link to a page missing from the page's structure links", () => {
    expect(check('<MediaCard onClick={<Open page="artist" ref={album.ref} />} />')).toEqual([
      "line 3: MediaCard.onClick opens artist, which is not in this page's structure links",
    ]);
  });

  it('[M0.canvas] opens another item of its own kind, a page its links leave out as itself', () => {
    const self = (card: string, id: string) =>
      checkPage(
        parsePage(page(`<Each of={data.albums} as="album">${card}</Each>`), 'book'),
        data,
        props,
        undefined,
        undefined,
        undefined,
        { ...opens, self: id },
      );
    expect(
      self('<MediaCard onClick={<Open page="artist" ref={album.ref} />} />', 'artist'),
    ).toEqual([]);
    expect(self('<MediaCard onClick={<Open page="artist" ref={album.ref} />} />', 'album')).toEqual(
      ["line 3: MediaCard.onClick opens artist, which is not in this page's structure links"],
    );
  });

  it('[M0.canvas] refuses a link to a page that is not in nav.json', () => {
    expect(check('<MediaCard onClick={<Open page="albums" ref={album.ref} />} />')).toEqual([
      'line 3: MediaCard.onClick opens albums, which is not a page in nav.json',
    ]);
  });

  it("[M0.canvas] refuses parameters that are not the route's, or not a string in the placeholder", () => {
    expect(check('<MediaCard onClick={<Open page="album" id={album.ref} />} />')).toEqual([
      'line 3: MediaCard.onClick gives album [id], and its route takes [ref]',
    ]);
    expect(check('<MediaCard onClick={<Open page="album" ref={data.count} />} />')).toEqual([
      "line 3: MediaCard.onClick: album's ref (data.count) is not a non-empty string",
    ]);
    expect(check('<MediaCard onClick={<Open page="album" ref={album.id} />} />')).toEqual([
      'line 3: album.id is not in the placeholder',
    ]);
  });

  it('[M0.canvas] refuses a parameter given as a literal: a parameter is always bound', () => {
    expect(() =>
      parsePage(page('<MediaCard onClick={<Open page="album" ref="tears-of-ice" />} />'), 'book'),
    ).toThrow(/Open's ref must be a data path/);
    expect(() =>
      parsePage(page('<MediaCard onClick={<Open page ref={data.ref} />} />'), 'book'),
    ).toThrow(/Open's page must be a page id or a data path/);
  });

  it('[M0.canvas] refuses an Open anywhere but a handler prop', () => {
    expect(check('<MediaCard size={<Open page="settings" />} />')).toEqual([
      'line 3: MediaCard.size takes no handler, so it cannot open a page',
    ]);
    expect(() => parsePage(page('<Open page="album" />'), 'book')).toThrow(/handler prop/);
  });

  it('[M0.canvas] reads <Request> in a handler prop as a request for the item its ref binds', () => {
    const tree = parsePage(page('<MediaCard onRequest={<Request ref={data.ref} />} />'), 'book');
    expect(tree.kind === 'element' && tree.props.onRequest).toEqual({
      kind: 'request',
      params: { ref: ['data', 'ref'] },
    });
  });

  it("[M0.canvas] accepts a request for an item whose ref is bound, in a handler prop, beside the card's Open", () => {
    expect(
      check(
        '<MediaCard onClick={<Open page="album" ref={album.ref} />} onRequest={<Request ref={album.ref} />} />',
      ),
    ).toEqual([]);
  });

  it('[M0.canvas] refuses a request anywhere but a handler prop, or for anything but a bound ref', () => {
    expect(check('<MediaCard size={<Request ref={album.ref} />} />')).toEqual([
      'line 3: MediaCard.size takes no handler, so it cannot request an item',
    ]);
    expect(check('<MediaCard onClick={<Request id={album.ref} />} />')).toEqual([
      'line 3: MediaCard.onClick gives a request [id], and a request takes [ref]',
    ]);
    expect(check('<MediaCard onClick={<Request ref={data.count} />} />')).toEqual([
      "line 3: MediaCard.onClick: the request's ref (data.count) is not a non-empty string",
    ]);
    expect(() =>
      parsePage(page('<MediaCard onClick={<Request ref="tears-of-ice" />} />'), 'book'),
    ).toThrow(/Request's ref must be a data path/);
    expect(() => parsePage(page('<Request ref={data.ref} />'), 'book')).toThrow(/handler prop/);
  });

  it('[M0.canvas] reads <Play> in a handler prop as playing the item its ref binds, on the queue it names', () => {
    const tree = parsePage(
      page('<MediaCard onClick={<Play ref={data.ref} queue="spoken" next />} />'),
      'book',
    );
    expect(tree.kind === 'element' && tree.props.onClick).toEqual({
      kind: 'play',
      queue: 'spoken',
      next: true,
      source: false,
      params: { ref: ['data', 'ref'] },
    });
    const now = parsePage(
      page('<MediaCard onClick={<Play ref={data.ref} queue="music" />} />'),
      'book',
    );
    expect(now.kind === 'element' && now.props.onClick).toMatchObject({
      queue: 'music',
      next: false,
    });
  });

  it('[M0.canvas] reads <Play source> as playing a list on its own, never both next and on its own', () => {
    const tree = parsePage(
      page('<MediaCard onClick={<Play ref={data.ref} queue="spoken" source />} />'),
      'book',
    );
    expect(tree.kind === 'element' && tree.props.onClick).toMatchObject({
      kind: 'play',
      next: false,
      source: true,
    });
    expect(() =>
      parsePage(
        page('<MediaCard onClick={<Play ref={data.ref} queue="spoken" source next />} />'),
        'book',
      ),
    ).toThrow(/Play is next or source, not both/);
    expect(() =>
      parsePage(
        page('<MediaCard onClick={<Play ref={data.ref} queue="spoken" source={data.s} />} />'),
        'book',
      ),
    ).toThrow(/Play's source is a bare flag/);
  });

  it('[M0.canvas] accepts playing an item whose ref is bound, in a handler prop', () => {
    expect(check('<MediaCard onClick={<Play ref={album.ref} queue="music" />} />')).toEqual([]);
  });

  it('[M0.canvas] refuses a play anywhere but a handler prop, for anything but a bound ref, or on no queue', () => {
    expect(check('<MediaCard size={<Play ref={album.ref} queue="music" />} />')).toEqual([
      'line 3: MediaCard.size takes no handler, so it cannot play an item',
    ]);
    expect(check('<MediaCard onClick={<Play ref={data.count} queue="music" />} />')).toEqual([
      "line 3: MediaCard.onClick: the play's ref (data.count) is not a non-empty string",
    ]);
    expect(() =>
      parsePage(page('<MediaCard onClick={<Play ref={data.ref} />} />'), 'book'),
    ).toThrow(/Play needs queue="spoken" or queue="music"/);
    expect(() =>
      parsePage(page('<MediaCard onClick={<Play ref={data.ref} queue="books" />} />'), 'book'),
    ).toThrow(/Play needs queue="spoken" or queue="music"/);
    expect(() =>
      parsePage(page('<MediaCard onClick={<Play ref={data.ref} queue="music" last />} />'), 'book'),
    ).toThrow(/Play takes ref, queue, next and source, not last/);
    expect(() => parsePage(page('<Play ref={data.ref} queue="music" />'), 'book')).toThrow(
      /handler prop/,
    );
  });

  it('[M0.canvas] refuses an Open it has no navigation map to check against', () => {
    const tree = parsePage(page('<MediaCard onClick={<Open page="settings" />} />'), 'book');
    expect(checkPage(tree, data, props)).toEqual([
      'line 3: MediaCard.onClick opens settings, and no navigation map was given to check it',
    ]);
  });
});

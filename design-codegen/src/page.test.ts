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

  it('refuses an import', () => {
    expect(() => parsePage(`import x from 'y';\n${page('<Button />')}`, 'book')).toThrow(
      /line 1: imports are not allowed/,
    );
  });

  it('refuses a hook or any statement before the return', () => {
    const source = `export default function Book({ data }) {\n  const [a] = useState(1);\n  return <Button />;\n}\n`;
    expect(() => parsePage(source, 'book')).toThrow(/line 2: .*only return/);
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

  it('names children given to a component that takes none', () => {
    expect(checkPage(tree('<EpisodeRow>Hi</EpisodeRow>'), data, props)).toEqual([
      'line 3: EpisodeRow takes no children',
    ]);
  });
});

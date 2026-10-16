import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { generateAppWeb, readApp, type App } from './app.js';
import { componentName } from './nav.js';
import { APP_DIR, REPO_ROOT, SONORA_DIR } from './outputs.js';
import { parsePage, type PageTree } from './page.js';
import { generateWebPage } from './page-web.js';
import { readProps } from './props.js';
import { discoverComponents } from './sonora.js';

const appDir = join(REPO_ROOT, APP_DIR);
const webDir = join(REPO_ROOT, 'web');
const props = readProps(discoverComponents(join(REPO_ROOT, SONORA_DIR)));

/**
 * A search page using everything a page may: a back layer holding the query beside a link, a
 * subheader opening a page, suggestions opening the search with their query, items opening the
 * page their data names and playing on the queue it names.
 */
const TRIAL = `export default function Search({ data }) {
  return (
    <BackdropShell
      back={
        <BackLayer
          controls={
            <LayoutGrid columns={1} gap="12px" maxWidth="var(--grid-max-width-list)">
              <SearchField value={data.query} placeholder={data.placeholder} autoFocus onChange={<Query />} onSubmit={<Query />} />
              <ButtonGroup items={data.kinds} value="all" />
              <Button variant="secondary" size="sm" onClick={<Open page="requests" />}>Your requests</Button>
            </LayoutGrid>
          }
        />
      }
      subheader={
        <FrontLayerHeader>
          <SortFilterBar icon="expand_less" label={data.activeFilters} onClick={<Open page="requests" />} />
        </FrontLayerHeader>
      }
    >
      <PageBody width="list">
        <When state="suggest">
          <Each of={data.suggestions} as="s">
            <ResultRow title={s.title} meta={s.meta} onClick={<Open page="search" q={s.query} />} divider />
          </Each>
        </When>
        <Section title="Top result">
          <ResultRow title={data.top.title} meta={data.top.meta} image={data.top.image} onClick={<Open page={data.top.page} ref={data.top.ref} />} onAction={<Play ref={data.top.playRef} queue={data.top.queue} />} />
        </Section>
        <Section title="In your library" actionText="Your requests" onAction={<Open page="requests" />} last>
          <Each of={data.library} as="item">
            <ResultRow title={item.title} meta={item.meta} image={item.image} divider onClick={<Open page={item.page} ref={item.ref} />} onAction={<Play ref={item.playRef} queue={item.queue} />} />
          </Each>
        </Section>
      </PageBody>
    </BackdropShell>
  );
}
`;
const TRIAL_DATA = {
  query: 'salt',
  placeholder: 'What do you want to listen to?',
  kinds: [
    { key: 'all', label: 'All' },
    { key: 'books', label: 'Books' },
  ],
  activeFilters: 'All kinds',
  suggestions: [{ title: 'Salt Road', meta: 'Book', query: 'salt road' }],
  top: {
    title: 'Salt and Static',
    meta: 'Album · Soul Vertex',
    image: '/art/salt-and-static.jpg',
    page: 'album',
    ref: 'a1',
    playRef: 'a1',
    queue: 'music',
  },
  library: [
    {
      title: 'The Saltwater Diaries',
      meta: 'Book · Adam Rivers',
      image: '/art/foggy-trails.jpg',
      page: 'book',
      ref: 'r1',
      playRef: 'p1',
      queue: 'spoken',
    },
  ],
};

/** The app with its search page drawn as `page`, read and checked as `pnpm gen` reads it. */
function appWith(page: string, data: unknown): App {
  const dir = mkdtempSync(join(tmpdir(), 'auralis-trial-app-'));
  try {
    cpSync(appDir, dir, {
      recursive: true,
      filter: (from) => resolve(from) !== join(appDir, 'compare'),
    });
    writeFileSync(join(dir, 'pages', 'search.page.jsx'), page);
    writeFileSync(join(dir, 'placeholders', 'search.json'), JSON.stringify(data));
    return readApp(dir, props);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const trial = generateAppWeb(appWith(TRIAL, TRIAL_DATA)).pages.get('Search.tsx')!;

const app = readApp(appDir, props);

/** A search page whose only link is in its subheader: the page itself opens nothing. */
const subheaderOnly = generateWebPage(
  parsePage(
    `export default function Search({ data }) {
  return (
    <BackdropShell
      back={<BackLayer controls={<SearchField value={data.query} placeholder={data.placeholder} onSubmit={<Query />} />} />}
      subheader={
        <FrontLayerHeader>
          <SortFilterBar icon="expand_less" label={data.activeFilters} onClick={<Open page="requests" />} />
        </FrontLayerHeader>
      }
    >
      <PageBody width="list">
        <ResultRow title={data.top.title} meta={data.top.meta} />
      </PageBody>
    </BackdropShell>
  );
}
`,
    'search',
  ),
  'search',
  TRIAL_DATA,
  app.components,
  { nav: app.nav, shell: app.shell, page: app.nav.pages.find((p) => p.id === 'search')! },
);

/**
 * The type errors of generated pages, by file name, each standing in `web/src/generated/pages`
 * under the web app's own compiler options, so it compiles as `pnpm typecheck` compiles it.
 */
function compileErrors(pages: Map<string, string>): string[] {
  const config = ts.getParsedCommandLineOfConfigFile(
    join(webDir, 'tsconfig.json'),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
      },
    },
  )!;
  const virtual = new Map(
    [...pages].map(([name, text]) => [join(webDir, 'src/generated/pages', name), text]),
  );
  const host = ts.createCompilerHost(config.options);
  const { getSourceFile, fileExists, readFile } = host;
  host.getSourceFile = (file, language, ...rest) => {
    const text = virtual.get(resolve(file));
    return text === undefined
      ? getSourceFile.call(host, file, language, ...rest)
      : ts.createSourceFile(file, text, language);
  };
  host.fileExists = (file) => virtual.has(resolve(file)) || fileExists.call(host, file);
  host.readFile = (file) => virtual.get(resolve(file)) ?? readFile.call(host, file);
  const program = ts.createProgram({
    rootNames: [...virtual.keys()],
    options: config.options,
    host,
  });
  return [...virtual.keys()].flatMap((file) =>
    ts.getPreEmitDiagnostics(program, program.getSourceFile(file)).map((d) => {
      const at =
        d.file && d.start !== undefined
          ? d.file.getLineAndCharacterOfPosition(d.start).line + 1
          : 0;
      return `${file.slice(webDir.length + 1)}:${at} TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`;
    }),
  );
}

describe('[M2.search] a generated web page using everything a page may', () => {
  it('compiles, a back layer and subheader that open a page each navigating through a component of its own', () => {
    expect(trial).toMatch(
      /function SearchBack[^\n]*\n {2}const navigate = useNavigate\(\);\n {2}const query = useQuery\(\);/,
    );
    expect(trial).toMatch(
      /function SearchSubheader[^\n]*\n {2}const navigate = useNavigate\(\);\n {2}return \(/,
    );
    expect(trial).toContain("import { generatePath, useNavigate } from 'react-router';");
    expect(subheaderOnly).toContain("import { useNavigate } from 'react-router';");
    expect(subheaderOnly.slice(subheaderOnly.indexOf('export default function'))).not.toContain(
      'navigate',
    );
    expect(
      compileErrors(
        new Map([
          ['Search.tsx', trial],
          ['SearchSubheaderOnly.tsx', subheaderOnly],
        ]),
      ),
    ).toEqual([]);
  }, 60_000);
});

/** Every name a generated page's code holds in its scope: declared, imported, or a global it reads. */
function scopeNames(code: string): Set<string> {
  const file = ts.createSourceFile(
    'page.tsx',
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const out = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node)) {
      const p = node.parent;
      // A member, a key, a prop or a type's field is not a name in scope.
      const member =
        (ts.isPropertyAccessExpression(p) && p.name === node) ||
        (ts.isPropertyAssignment(p) && p.name === node) ||
        (ts.isPropertySignature(p) && p.name === node) ||
        (ts.isJsxAttribute(p) && p.name === node) ||
        (ts.isQualifiedName(p) && p.right === node) ||
        (ts.isBindingElement(p) && p.propertyName === node) ||
        (ts.isImportSpecifier(p) && p.propertyName === node);
      if (!member) out.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

/** The Each item names a page gives itself. */
function eachNames(tree: PageTree, into = new Set<string>()): Set<string> {
  if (tree.kind === 'each') into.add(tree.as);
  if (tree.kind === 'element') {
    for (const v of Object.values(tree.props)) if (v.kind === 'slot') eachNames(v.tree, into);
  }
  if ('children' in tree) tree.children.forEach((c) => eachNames(c, into));
  return into;
}

/** Whether a page may name an Each item, or a When state, `name`. */
const takes = (name: string) => {
  const page = (inner: string) => `export default function Books({ data }) {
  return <PageBody>${inner}</PageBody>;
}
`;
  const each = page(`<Each of={data.items} as="${name}"><Text>{${name}.title}</Text></Each>`);
  const when = page(`<When state="${name}"><Text>Hi</Text></When>`);
  return {
    each: (() => {
      try {
        parsePage(each, 'books');
        return true;
      } catch {
        return false;
      }
    })(),
    when: (() => {
      try {
        parsePage(when, 'books');
        return true;
      } catch {
        return false;
      }
    })(),
  };
};

describe('[M2.search] the names a generated web page holds', () => {
  const generated = generateAppWeb(app).pages;
  const pages = [
    ...app.pages
      .filter(({ id }) => generated.has(`${componentName(id)}.tsx`))
      .map(({ id, tree }) => ({
        code: generated.get(`${componentName(id)}.tsx`)!,
        own: eachNames(tree),
      })),
    { code: trial, own: eachNames(parsePage(TRIAL, 'search')) },
    { code: subheaderOnly, own: new Set<string>() },
  ];
  // A name an Each item could take: plain and lower-case. The page's own Each items are its own.
  const names = [
    ...new Set(
      pages.flatMap(({ code, own }) =>
        [...scopeNames(code)].filter((n) => /^[a-z][A-Za-z0-9]*$/.test(n) && !own.has(n)),
      ),
    ),
  ].sort();

  it('finds what the generator writes into a page', () => {
    expect(names).toEqual(
      expect.arrayContaining(['data', 'generatePath', 'navigate', 'play', 'query', 'routes']),
    );
  });

  it('are each refused as an Each item or a When state, so a page never shadows one', () => {
    const taken = names.filter((n) => takes(n).each || takes(n).when);
    expect(taken).toEqual([]);
  });
});

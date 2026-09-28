/**
 * A page tree as a web page: `web/src/generated/pages/<Id>.tsx`, a React component calling the web
 * UI package's Sonora components, with the page's placeholder as its default data.
 */
import { componentName } from './nav.js';
import { APP_NOTE } from './outputs.js';
import type { PageTree, PropValue } from './page.js';

function drawn(tree: PageTree, into: Set<string>): Set<string> {
  if (tree.kind === 'element') into.add(tree.component);
  if ('children' in tree) tree.children.forEach((child) => drawn(child, into));
  return into;
}

function uses(tree: PageTree, kind: PageTree['kind']): boolean {
  return tree.kind === kind || ('children' in tree && tree.children.some((c) => uses(c, kind)));
}

const prop = (name: string, value: PropValue) =>
  value.kind === 'binding'
    ? `${name}={${value.path.join('.')}}`
    : typeof value.value === 'string'
      ? `${name}=${JSON.stringify(value.value)}`
      : `${name}={${JSON.stringify(value.value)}}`;

/** What the generator needs to know of the Sonora components a page uses. */
export interface WebComponents {
  /** The components that take a `platform` prop; each gets the page's own. */
  platformed: Set<string>;
  /** The components that take an `onChange` handler. */
  handled: Set<string>;
}

/** A page is a still: a field it shows a value in gets a handler that ignores changes. */
const ignored = (tree: PageTree, components: WebComponents) =>
  tree.kind === 'element' &&
  components.handled.has(tree.component) &&
  ('value' in tree.props || 'checked' in tree.props) &&
  !('onChange' in tree.props);

function ignores(tree: PageTree, components: WebComponents): boolean {
  return (
    ignored(tree, components) ||
    ('children' in tree && tree.children.some((c) => ignores(c, components)))
  );
}

function render(tree: PageTree, indent: string, components: WebComponents): string[] {
  const inner = indent + '  ';
  const kids = (nodes: PageTree[], at: string) => nodes.flatMap((n) => render(n, at, components));
  switch (tree.kind) {
    case 'text':
      return [`${indent}{${JSON.stringify(tree.value)}}`];
    case 'binding':
      return [`${indent}{${tree.path.join('.')}}`];
    case 'each':
      return [
        `${indent}{${tree.of.join('.')}.map((${tree.as}, i) => (`,
        `${inner}<Fragment key={i}>`,
        ...kids(tree.children, inner + '  '),
        `${inner}</Fragment>`,
        `${indent}))}`,
      ];
    case 'when':
      return [
        `${indent}{state === ${JSON.stringify(tree.state).replaceAll('"', "'")} && (`,
        `${inner}<>`,
        ...kids(tree.children, inner + '  '),
        `${inner}</>`,
        `${indent})}`,
      ];
    case 'element': {
      const props = Object.entries(tree.props).map(([name, value]) => ' ' + prop(name, value));
      if (ignored(tree, components)) props.push(' onChange={ignore}');
      if (components.platformed.has(tree.component) && !('platform' in tree.props)) {
        props.push(' platform={platform}');
      }
      const open = `<${tree.component}${props.join('')}`;
      if (tree.children.length === 0) return [`${indent}${open} />`];
      return [`${indent}${open}>`, ...kids(tree.children, inner), `${indent}</${tree.component}>`];
    }
  }
}

export function generateWebPage(
  tree: PageTree,
  id: string,
  placeholder: unknown,
  components: WebComponents,
): string {
  const name = componentName(id);
  const used = [...drawn(tree, new Set())].sort();
  const react = uses(tree, 'each') ? ["import { Fragment } from 'react';"] : [];
  return [
    `// ${APP_NOTE}`,
    ...react,
    "import { usePlatform, type Platform } from '../nav/platform';",
    `import { ${used.join(', ')} } from '../ui/index.js';`,
    '',
    `const placeholder = ${JSON.stringify(placeholder, null, 2)};`,
    '',
    ...(ignores(tree, components) ? ['const ignore = () => {};', ''] : []),
    `export type ${name}Data = typeof placeholder;`,
    '',
    `export interface ${name}Props {`,
    `  data?: ${name}Data;`,
    '  /** Which of the placeholder states to show: M0 draws only `full`. */',
    '  state?: string;',
    '  /** The density to draw at; by default, the one the window width calls for. */',
    '  platform?: Platform;',
    '}',
    '',
    `export default function ${name}({ data = placeholder, state = 'full', platform: given }: ${name}Props) {`,
    '  const detected = usePlatform();',
    '  const platform = given ?? detected;',
    '  return (',
    ...render(tree, '    ', components),
    '  );',
    '}',
    '',
  ].join('\n');
}

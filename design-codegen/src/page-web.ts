/**
 * A page tree as a web page: `web/src/generated/pages/<Id>.tsx`, a React component calling the web
 * UI package's Sonora components, with the page's placeholder as its default data.
 */
import { componentName } from './nav.js';
import { APP_NOTE } from './outputs.js';
import type { PageTree, PropValue } from './page.js';

function components(tree: PageTree, into: Set<string>): Set<string> {
  if (tree.kind === 'element') into.add(tree.component);
  if ('children' in tree) tree.children.forEach((child) => components(child, into));
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

function render(tree: PageTree, indent: string): string[] {
  const inner = indent + '  ';
  const kids = (nodes: PageTree[], at: string) => nodes.flatMap((n) => render(n, at));
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
      const open = `<${tree.component}${props.join('')}`;
      if (tree.children.length === 0) return [`${indent}${open} />`];
      return [`${indent}${open}>`, ...kids(tree.children, inner), `${indent}</${tree.component}>`];
    }
  }
}

export function generateWebPage(tree: PageTree, id: string, placeholder: unknown): string {
  const name = componentName(id);
  const used = [...components(tree, new Set())].sort();
  const react = uses(tree, 'each') ? ["import { Fragment } from 'react';"] : [];
  const state = uses(tree, 'when');
  const params = state
    ? `{ data = placeholder, state = 'full' }: { data?: ${name}Data; state?: string }`
    : `{ data = placeholder }: { data?: ${name}Data }`;
  return [
    `// ${APP_NOTE}`,
    ...react,
    `import { ${used.join(', ')} } from '../ui/index.js';`,
    '',
    `const placeholder = ${JSON.stringify(placeholder, null, 2)};`,
    '',
    `export type ${name}Data = typeof placeholder;`,
    '',
    `export default function ${name}(${params}) {`,
    '  return (',
    ...render(tree, '    '),
    '  );',
    '}',
    '',
  ].join('\n');
}

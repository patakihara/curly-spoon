/**
 * Renders an Audiobookshelf/podcast-feed description safely. The decision
 * about what's allowed to survive from the source HTML lives entirely in
 * `parseDescriptionHtml.ts`, a plain, DOM-free module kept separate so it can
 * be unit-tested (this repo's Vitest config has no jsdom, so a `.tsx` file
 * can only be checked end-to-end, via Playwright). This component's only job
 * is mapping that already-sanitised AST onto React elements — there is no
 * `dangerouslySetInnerHTML` anywhere here, on purpose: nothing in this file
 * ever needs to trust the description as markup.
 */
import type { ReactNode } from 'react';
import { Fragment } from 'react';
import { parseDescriptionHtml, type DescriptionNode } from './parseDescriptionHtml.js';

function renderNodes(nodes: DescriptionNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.type) {
      case 'text':
        return node.value.length > 0 ? <Fragment key={key}>{node.value}</Fragment> : null;
      case 'break':
        return <br key={key} />;
      case 'paragraph':
        return <p key={key}>{renderNodes(node.children, key)}</p>;
      case 'bold':
        return <b key={key}>{renderNodes(node.children, key)}</b>;
      case 'italic':
        return <i key={key}>{renderNodes(node.children, key)}</i>;
      case 'list':
        return node.ordered ? (
          <ol key={key}>{renderNodes(node.children, key)}</ol>
        ) : (
          <ul key={key}>{renderNodes(node.children, key)}</ul>
        );
      case 'listItem':
        return <li key={key}>{renderNodes(node.children, key)}</li>;
      case 'link':
        // `parseDescriptionHtml` only ever produces a `link` node for an
        // http(s)/mailto href it validated with `new URL` — this is always an
        // external destination, hence `noopener noreferrer` so a third-party
        // page reached from a description can't reach back into `window.opener`.
        return (
          <a key={key} href={node.href} target="_blank" rel="noopener noreferrer">
            {renderNodes(node.children, key)}
          </a>
        );
      default:
        return null;
    }
  });
}

export interface RichDescriptionProps {
  html: string | null | undefined;
  className?: string;
  'data-testid'?: string;
}

/** Renders nothing (not an empty wrapper element) when there's no description to show. */
export function RichDescription({ html, className, 'data-testid': testId }: RichDescriptionProps) {
  const nodes = parseDescriptionHtml(html);
  if (nodes.length === 0) return null;
  return (
    <div className={className} data-testid={testId}>
      {renderNodes(nodes, 'd')}
    </div>
  );
}

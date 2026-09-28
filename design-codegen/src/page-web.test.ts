import { describe, expect, it } from 'vitest';
import { parsePage } from './page.js';
import { generateWebPage } from './page-web.js';

const source = `export default function Book({ data }) {
  return (
    <DetailPage kindLabel="Book" overlay count={2}>
      <MediaHeader title={data.title} />
      <Each of={data.chapters} as="chapter">
        <EpisodeRow title={chapter.title}>{chapter.title}</EpisodeRow>
      </Each>
      <When state="full"><Button>Play "it"</Button></When>
    </DetailPage>
  );
}
`;
const out = generateWebPage(
  parsePage(source, 'book'),
  'book',
  { title: 'Wind and Truth', chapters: [{ title: 'Prologue' }] },
  new Set(['MediaHeader', 'Button']),
);

describe('a generated web page', () => {
  it('imports each Sonora component it uses from the web UI package, once', () => {
    expect(out).toContain(
      "import { Button, DetailPage, EpisodeRow, MediaHeader } from '../ui/index.js';",
    );
  });

  it('takes its data, state and platform, with the placeholder, full and the width as defaults', () => {
    expect(out).toContain('const placeholder = {\n  "title": "Wind and Truth",');
    expect(out).toContain(
      "export default function Book({ data = placeholder, state = 'full', platform: given }: BookProps) {",
    );
    expect(out).toContain('  const platform = given ?? detected;');
  });

  it('writes literal props as literals and bindings as data paths', () => {
    expect(out).toContain('<DetailPage kindLabel="Book" overlay={true} count={2}>');
    expect(out).toContain('<MediaHeader title={data.title} platform={platform} />');
  });

  it('passes the platform only to components that take one', () => {
    expect(out).toContain('<EpisodeRow title={chapter.title}>');
  });

  it('turns Each into a keyed map and When into a state check', () => {
    expect(out).toContain('{data.chapters.map((chapter, i) => (');
    expect(out).toContain('<Fragment key={i}>');
    expect(out).toContain("{state === 'full' && (");
  });

  it('escapes text children', () => {
    expect(out).toContain('{"Play \\"it\\""}');
  });
});
